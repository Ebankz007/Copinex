import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { requireAdmin, requireAuth, requirePermission } from '../middleware/auth.js';
import { isSuperAdmin } from '../lib/roles.js';
import { revokeAllSessions } from '../services/sessions.js';
import { activateMembership, listMembers } from '../services/members.js';
import {
  closeInvestment,
  createPackage,
  listPackages,
  updatePackage,
} from '../services/investment-service.js';
import {
  adminDeposit,
  approveWithdrawal,
  listWithdrawals,
  rejectWithdrawal,
} from '../services/withdrawals.js';
import {
  fulfillLeadershipReward,
  listFlaggedMilestones,
  listLeadershipRewards,
  payFlaggedMilestone,
} from '../services/ranks-service.js';
import { listSettlements, recordSettlement } from '../services/settlement-service.js';
import {
  createBroker,
  deactivateBroker,
  listAllBrokers,
  listAllPammConnections,
} from '../services/pamm-service.js';
import { listAuditLog, logAdminAction } from '../services/audit.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from '../services/announcements.js';
import { deleteSetting, listSettings, upsertSetting } from '../services/settings.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

/**
 * Dashboard overview — the numbers the admin console renders first.
 * One query per metric; pilot scale, indexes cover every access path.
 */
adminRouter.get('/overview', async (_req, res, next) => {
  try {
    const [users, activeMembers, pendingWithdrawals, activeInvestments, settlements, pools, recentAudit] =
      await Promise.all([
        db.select().from(schema.users),
        db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.membershipActivated, true)),
        db.select().from(schema.withdrawalRequests).where(eq(schema.withdrawalRequests.status, 'PENDING')),
        db.select().from(schema.investments).where(eq(schema.investments.status, 'ACTIVE')),
        db.select().from(schema.tradingSettlements).where(eq(schema.tradingSettlements.status, 'PENDING')),
        db.select().from(schema.pools),
        listAuditLog(10),
      ]);

    res.json({
      overview: {
        totalUsers: users.length,
        activeMembers: activeMembers.length,
        pendingWithdrawals: pendingWithdrawals.length,
        pendingWithdrawalCents: pendingWithdrawals.reduce((s, w) => s + w.amountCents, 0),
        activeInvestments: activeInvestments.length,
        activeInvestmentPrincipalCents: activeInvestments.reduce((s, i) => s + i.principalCents, 0),
        pendingSettlements: settlements.length,
        pools: pools.map((p) => ({ name: p.name, balanceCents: p.balanceCents })),
        recentAudit,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ── Member management ─────────────────────────────────

/** Members with optional search (email/fullName) + activation filter. */
adminRouter.get('/members', async (req, res, next) => {
  try {
    const activated =
      req.query.activated === 'true' ? true : req.query.activated === 'false' ? false : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

    const members = await listMembers(activated, search || undefined);
    res.json({ members });
  } catch (e) {
    next(e);
  }
});

const updateMemberSchema = z.object({
  fullName: z.string().min(1).max(120).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  isActive: z.boolean().optional(),
  role: z.enum(['MEMBER', 'ADMIN', 'SUPERADMIN']).optional(),
});

/** Strip keys whose value is `undefined` (zod optional output vs exactOptionalPropertyTypes). */
function defined<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

/** ADMIN/SUPERADMIN are staff accounts; MEMBER is not. */
function isStaffRole(role: string): boolean {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

/**
 * Edit a member (name, status, active flag, role).
 *
 * Authority rules, enforced here rather than by permission alone:
 *  - Changing ANY role — granting, demoting, or promoting — is SUPERADMIN-only
 *    (`admins.manage`). Otherwise any admin could mint unlimited peers.
 *  - Editing a staff account (ADMIN or SUPERADMIN) at all is SUPERADMIN-only,
 *    so an admin cannot suspend or rename a superadmin.
 *  - An admin still cannot demote, disable, or suspend their OWN account.
 *
 * A role change revokes the target's sessions. The JWT carries the role, so
 * without revocation a demoted admin keeps admin authority — including the
 * ability to mint admins — for the remaining life of the token (7 days).
 */
adminRouter.patch('/members/:id', requirePermission('members.manage'), async (req, res, next) => {
  try {
    const body = updateMemberSchema.parse(req.body);

    const [current] = await db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, req.params.id!))
      .limit(1);
    if (!current) throw new HttpError(404, 'NOT_FOUND', 'Member not found');

    const callerIsSuperAdmin = isSuperAdmin(req.user!.role);
    const targetIsStaff = isStaffRole(current.role);

    if (!callerIsSuperAdmin && (body.role !== undefined || targetIsStaff)) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        targetIsStaff
          ? 'Only a superadmin can modify an admin or superadmin account'
          : 'Only a superadmin can grant, change, or revoke a role',
      );
    }

    if (
      req.params.id === req.user!.id &&
      (body.role !== undefined || body.status === 'INACTIVE' || body.status === 'SUSPENDED' || body.isActive === false)
    ) {
      throw new HttpError(400, 'SELF_DEMOTE', 'You cannot demote, disable, or suspend your own account');
    }

    const [member] = await db
      .update(schema.users)
      .set({ ...defined(body), updatedAt: new Date() })
      .where(eq(schema.users.id, req.params.id!))
      .returning();
    if (!member) throw new HttpError(404, 'NOT_FOUND', 'Member not found');

    // Kill the old authority immediately rather than at token expiry.
    if (body.role !== undefined && body.role !== current.role) {
      await revokeAllSessions(member.id);
    }

    await logAdminAction({
      adminId: req.user!.id,
      action: body.role !== undefined ? 'MEMBER_ROLE_CHANGE' : 'MEMBER_UPDATE',
      targetType: 'member',
      targetId: member.id,
      details: { ...body, previousRole: current.role },
      ip: req.ip,
    });
    res.json({ member });
  } catch (e) {
    next(e);
  }
});

/**
 * Activate a member's membership — records the $50 activation fee as paid
 * (Active Member policy, 2026-09-26). Interim rail until the payment provider
 * webhook lands; the webhook calls the same service function.
 */
adminRouter.post('/members/:id/activate', requirePermission('members.manage'), async (req, res, next) => {
  try {
    const member = await activateMembership(req.params.id!);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'MEMBER_ACTIVATE',
      targetType: 'member',
      targetId: member.id,
      ip: req.ip,
    });
    res.json({ member });
  } catch (e) {
    next(e);
  }
});

// ── Content management (announcements) ────────────────

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});

adminRouter.get('/announcements', async (_req, res, next) => {
  try {
    const announcements = await listAnnouncements();
    res.json({ announcements });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/announcements', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const body = announcementSchema.parse(req.body);
    const announcement = await createAnnouncement(req.user!.id, {
      ...body,
      status: body.status ?? 'DRAFT',
    });
    await logAdminAction({
      adminId: req.user!.id,
      action: 'ANNOUNCEMENT_CREATE',
      targetType: 'announcement',
      targetId: announcement!.id,
      details: { title: body.title, status: body.status ?? 'DRAFT' },
      ip: req.ip,
    });
    res.status(201).json({ announcement });
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/announcements/:id', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const body = announcementSchema.partial().parse(req.body);
    const announcement = await updateAnnouncement(req.user!.id, req.params.id!, defined(body));
    await logAdminAction({
      adminId: req.user!.id,
      action: 'ANNOUNCEMENT_UPDATE',
      targetType: 'announcement',
      targetId: announcement!.id,
      details: { title: body.title, status: body.status },
      ip: req.ip,
    });
    res.json({ announcement });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/announcements/:id', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const announcement = await deleteAnnouncement(req.params.id!);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'ANNOUNCEMENT_DELETE',
      targetType: 'announcement',
      targetId: announcement!.id,
      ip: req.ip,
    });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

// ── System settings (config table) ────────────────────

adminRouter.get('/settings', async (_req, res, next) => {
  try {
    const settings = await listSettings();
    res.json({ settings });
  } catch (e) {
    next(e);
  }
});

const settingSchema = z.object({
  // The key comes from the URL param — it is deliberately NOT part of the body.
  value: z.unknown(),
  description: z.string().max(300).optional(),
});

adminRouter.put('/settings/:key', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const body = settingSchema.parse(req.body);
    const setting = await upsertSetting({ ...defined(body), key: req.params.key } as { key: string; value: unknown; description?: string });
    await logAdminAction({
      adminId: req.user!.id,
      action: 'SETTING_UPDATE',
      targetType: 'setting',
      // targetId is a uuid column and a setting key is a dotted string
      // ("support.email"), so passing the key here made the insert fail and the
      // change went unaudited. The key lives in details instead.
      targetId: undefined,
      details: { key: setting!.key, value: setting!.value },
      ip: req.ip,
    });
    res.json({ setting });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/settings/:key', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const setting = await deleteSetting(req.params.key!);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'SETTING_DELETE',
      targetType: 'setting',
      // See SETTING_UPDATE: the key is not a uuid, so it goes in details.
      targetId: undefined,
      details: { key: setting!.key },
      ip: req.ip,
    });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

/** All packages, including inactive. */
adminRouter.get('/investments/packages', async (_req, res, next) => {
  try {
    const packages = await listPackages(true);
    res.json({ packages });
  } catch (e) {
    next(e);
  }
});

const createPackageSchema = z.object({
  tier: z.number().int().min(1),
  name: z.string().min(1).max(60),
  minAmountCents: z.number().int().positive(),
  maxAmountCents: z.number().int().positive().nullable().optional(),
  monthlyRateBps: z.number().int().positive(),
  dailyRateBps: z.number().int().positive(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  description: z.string().max(200).optional(),
});

adminRouter.post('/investments/packages', async (req, res, next) => {
  try {
    const body = createPackageSchema.parse(req.body);
    const pkg = await createPackage(body);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'PACKAGE_CREATE',
      targetType: 'investment_package',
      targetId: pkg?.id,
      details: body,
      ip: req.ip,
    });
    res.status(201).json({ package: pkg });
  } catch (e) {
    next(e);
  }
});

const updatePackageSchema = createPackageSchema.partial();

adminRouter.patch('/investments/packages/:id', async (req, res, next) => {
  try {
    const body = updatePackageSchema.parse(req.body);
    const pkg = await updatePackage(req.params.id, body);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'PACKAGE_UPDATE',
      targetType: 'investment_package',
      targetId: pkg?.id,
      details: body,
      ip: req.ip,
    });
    res.json({ package: pkg });
  } catch (e) {
    next(e);
  }
});

/** All investments, optionally filtered by status. */
adminRouter.get('/investments', async (req, res, next) => {
  try {
    const status = req.query.status;
    const where =
      typeof status === 'string' && ['ACTIVE', 'MATURED', 'CLOSED'].includes(status)
        ? eq(schema.investments.status, status as 'ACTIVE' | 'MATURED' | 'CLOSED')
        : undefined;
    const investments = await db.select().from(schema.investments).where(where);
    res.json({ investments });
  } catch (e) {
    next(e);
  }
});

/** Close an investment (stops accrual; no principal refund â€” documented assumption). */
adminRouter.post('/investments/:id/close', async (req, res, next) => {
  try {
    const investment = await closeInvestment(req.params.id);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'INVESTMENT_CLOSE',
      targetType: 'investment',
      targetId: investment.id,
      ip: req.ip,
    });
    res.json({ investment });
  } catch (e) {
    next(e);
  }
});

// â”€â”€ Money rails (Phase 1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const depositSchema = z.object({
  userId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  note: z.string().max(200).optional(),
});

/** Interim deposit rail (no payment provider yet): admin credits a member's COPINEX wallet. */
adminRouter.post('/wallets/deposit', async (req, res, next) => {
  try {
    const body = depositSchema.parse(req.body);
    const deposit = await adminDeposit(body.userId, body.amountCents, req.user!.id, body.note);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'WALLET_DEPOSIT',
      targetType: 'wallet',
      targetId: body.userId,
      details: { amountCents: body.amountCents, note: body.note },
      ip: req.ip,
    });
    res.status(201).json({ deposit });
  } catch (e) {
    next(e);
  }
});

/** All withdrawal requests, optionally filtered by status. */
adminRouter.get('/wallets/withdrawals', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const withdrawals = await listWithdrawals(status);
    res.json({ withdrawals });
  } catch (e) {
    next(e);
  }
});

/** Approve a PENDING withdrawal â€” the manual payout trigger. Optional payoutTxid records the on-chain USDT transfer. */
adminRouter.post('/wallets/withdrawals/:id/approve', async (req, res, next) => {
  try {
    const payoutTxid = typeof req.body?.payoutTxid === 'string' ? req.body.payoutTxid.trim() || undefined : undefined;
    const request = await approveWithdrawal(req.params.id, req.user!.id, payoutTxid);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'WITHDRAWAL_APPROVE',
      targetType: 'withdrawal_request',
      targetId: request?.id,
      details: { payoutTxid: payoutTxid ?? null },
      ip: req.ip,
    });
    res.json({ request });
  } catch (e) {
    next(e);
  }
});

/** Reject a PENDING withdrawal â€” held funds are refunded to the wallet. */
adminRouter.post('/wallets/withdrawals/:id/reject', async (req, res, next) => {
  try {
    const request = await rejectWithdrawal(req.params.id, req.user!.id);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'WITHDRAWAL_REJECT',
      targetType: 'withdrawal_request',
      targetId: request?.id,
      ip: req.ip,
    });
    res.json({ request });
  } catch (e) {
    next(e);
  }
});

// â”€â”€ Compensation engine (Phase 2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Pool balances (RANK_BONUS, LEADERSHIP_BONUS). */
adminRouter.get('/pools', async (_req, res, next) => {
  try {
    const pools = await db.select().from(schema.pools).orderBy(schema.pools.name);
    res.json({ pools });
  } catch (e) {
    next(e);
  }
});

const settlementSchema = z.object({
  clientId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM'),
  realizedProfitCents: z.number().int().positive(),
});

/**
 * Record + process one client-period trading settlement (Â§7). Idempotent per
 * (client, period) â€” 409 on a duplicate. The client's 60% stays on their own
 * funded account; the sponsor's 10% is credited to the COPINEX wallet.
 */
adminRouter.post('/settlements', async (req, res, next) => {
  try {
    const body = settlementSchema.parse(req.body);
    const settlement = await recordSettlement(body);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'SETTLEMENT_RECORD',
      targetType: 'trading_settlement',
      targetId: settlement.id,
      details: body,
      ip: req.ip,
    });
    res.status(201).json({ settlement });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/settlements', async (_req, res, next) => {
  try {
    const settlements = await listSettlements();
    res.json({ settlements });
  } catch (e) {
    next(e);
  }
});

/** FLAGGED rank milestones awaiting pool-funded payment (Â§10). */
adminRouter.get('/ranks/milestones', async (_req, res, next) => {
  try {
    const milestones = await listFlaggedMilestones();
    res.json({ milestones });
  } catch (e) {
    next(e);
  }
});

/** Pay a FLAGGED milestone once the pool covers it. */
adminRouter.post('/ranks/milestones/:id/pay', async (req, res, next) => {
  try {
    const milestone = await payFlaggedMilestone(req.params.id);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'MILESTONE_PAY',
      targetType: 'rank_milestone',
      targetId: milestone?.id,
      ip: req.ip,
    });
    res.json({ milestone });
  } catch (e) {
    next(e);
  }
});

/** Leadership rewards, optionally ?status=REVIEW|PAID. */
adminRouter.get('/ranks/leadership', async (req, res, next) => {
  try {
    const status = req.query.status === 'REVIEW' || req.query.status === 'PAID' ? req.query.status : undefined;
    const rewards = await listLeadershipRewards(status);
    res.json({ rewards });
  } catch (e) {
    next(e);
  }
});

/** Mark a REVIEW leadership reward as fulfilled. */
adminRouter.post('/ranks/leadership/:id/fulfill', async (req, res, next) => {
  try {
    const reward = await fulfillLeadershipReward(req.params.id);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'LEADERSHIP_FULFILL',
      targetType: 'leadership_reward',
      targetId: reward?.id,
      ip: req.ip,
    });
    res.json({ reward });
  } catch (e) {
    next(e);
  }
});

// â”€â”€ PAMM Service (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** All brokers, including deactivated. */
adminRouter.get('/brokers', async (_req, res, next) => {
  try {
    const brokers = await listAllBrokers();
    res.json({ brokers });
  } catch (e) {
    next(e);
  }
});

const createBrokerSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(10),
  pammLink: z.string().min(1).max(500),
});

adminRouter.post('/brokers', async (req, res, next) => {
  try {
    const body = createBrokerSchema.parse(req.body);
    const broker = await createBroker(body);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'BROKER_CREATE',
      targetType: 'broker',
      targetId: broker.id,
      details: body,
      ip: req.ip,
    });
    res.status(201).json({ broker });
  } catch (e) {
    next(e);
  }
});

/** Remove a broker from the client-facing list (soft deactivate). */
adminRouter.delete('/brokers/:id', async (req, res, next) => {
  try {
    const broker = await deactivateBroker(req.params.id);
    await logAdminAction({
      adminId: req.user!.id,
      action: 'BROKER_DEACTIVATE',
      targetType: 'broker',
      targetId: broker.id,
      ip: req.ip,
    });
    res.json({ broker });
  } catch (e) {
    next(e);
  }
});

/** All PAMM connection requests. */
adminRouter.get('/pamm/connections', async (_req, res, next) => {
  try {
    const connections = await listAllPammConnections();
    res.json({ connections });
  } catch (e) {
    next(e);
  }
});

/** The audit trail itself — newest first. ?limit=1..500 (default 100). */
adminRouter.get('/audit', async (req, res, next) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
    const entries = await listAuditLog(Number.isFinite(limit) ? limit : 100);
    res.json({ entries });
  } catch (e) {
    next(e);
  }
});
