import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
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

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

/** The audit trail itself â€” newest first. ?limit=1..500 (default 100). */
adminRouter.get('/audit', async (req, res, next) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
    const entries = await listAuditLog(Number.isFinite(limit) ? limit : 100);
    res.json({ entries });
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

/** Members, optional activation-status filter. Interim ops rail for activation. */
adminRouter.get('/members', async (req, res, next) => {
  try {
    const activated =
      req.query.activated === 'true' ? true : req.query.activated === 'false' ? false : undefined;
    const members = await listMembers(activated);
    res.json({ members });
  } catch (e) {
    next(e);
  }
});

/**
 * Activate a member's membership â€” records the $50 activation fee as paid
 * (Active Member policy, 2026-09-26). Interim rail until the payment provider
 * webhook lands; the webhook calls the same service function.
 */
adminRouter.post('/members/:id/activate', async (req, res, next) => {
  try {
    const member = await activateMembership(req.params.id);
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
