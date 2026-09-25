import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
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

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

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

/** Close an investment (stops accrual; no principal refund — documented assumption). */
adminRouter.post('/investments/:id/close', async (req, res, next) => {
  try {
    const investment = await closeInvestment(req.params.id);
    res.json({ investment });
  } catch (e) {
    next(e);
  }
});

// ── Money rails (Phase 1) ──────────────────────────────

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

/** Approve a PENDING withdrawal — the manual payout trigger. */
adminRouter.post('/wallets/withdrawals/:id/approve', async (req, res, next) => {
  try {
    const request = await approveWithdrawal(req.params.id, req.user!.id);
    res.json({ request });
  } catch (e) {
    next(e);
  }
});

/** Reject a PENDING withdrawal — held funds are refunded to the wallet. */
adminRouter.post('/wallets/withdrawals/:id/reject', async (req, res, next) => {
  try {
    const request = await rejectWithdrawal(req.params.id, req.user!.id);
    res.json({ request });
  } catch (e) {
    next(e);
  }
});

// ── Compensation engine (Phase 2) ───────────────────────

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
 * Record + process one client-period trading settlement (§7). Idempotent per
 * (client, period) — 409 on a duplicate. The client's 60% stays on their own
 * funded account; the sponsor's 10% is credited to the COPINEX wallet.
 */
adminRouter.post('/settlements', async (req, res, next) => {
  try {
    const body = settlementSchema.parse(req.body);
    const settlement = await recordSettlement(body);
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

/** FLAGGED rank milestones awaiting pool-funded payment (§10). */
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
    res.json({ reward });
  } catch (e) {
    next(e);
  }
});