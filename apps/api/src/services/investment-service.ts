import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import {
  AVAILABLE_AFTER_DAYS,
  DAILY_ACCRUAL_DAYS,
  UPLINE_COMMISSION_RATE_BPS,
  addDays,
  buildInvestmentSchedule,
  computeDailyProfitCents,
  computeMonthlyProfitCents,
  computeUplineCommissionPoolCents,
  daysBetween,
  distributeUplineCommission,
  getPackageForAmount,
  type UplineMember,
} from '@copinex/engine';
import * as schema from '@copinex/database';
import { db, type Tx } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { creditWallet, ensureWallets } from './wallets.js';

/** Sanity ceiling: $10,000,000 per investment (integer cents). */
const MAX_INVESTMENT_CENTS = 1_000_000_000;
const MAX_UPLINE_LEVELS = 6;

export interface AccrualResult {
  investmentsProcessed: number;
  dailyCredited: number;
  monthlyCredited: number;
  commissionsPaid: number;
  unlocked: number;
}

// ── Reads ──────────────────────────────────────────────

export async function listPackages(includeInactive = false) {
  const where = includeInactive ? undefined : eq(schema.investmentPackages.status, 'ACTIVE');
  return db
    .select()
    .from(schema.investmentPackages)
    .where(where)
    .orderBy(asc(schema.investmentPackages.tier));
}

export async function getWithdrawalWalletSummary(userId: string) {
  const earnings = await db
    .select()
    .from(schema.investmentEarnings)
    .where(eq(schema.investmentEarnings.userId, userId));

  let availableCents = 0;
  let lockedCents = 0;
  for (const e of earnings) {
    if (e.status === 'AVAILABLE') availableCents += e.amountCents;
    else lockedCents += e.amountCents;
  }
  return {
    availableCents,
    lockedCents,
    totalCents: availableCents + lockedCents,
  };
}

export async function listMyInvestments(userId: string) {
  const rows = await db
    .select({
      investment: schema.investments,
      package: schema.investmentPackages,
    })
    .from(schema.investments)
    .innerJoin(
      schema.investmentPackages,
      eq(schema.investments.packageId, schema.investmentPackages.id),
    )
    .where(eq(schema.investments.userId, userId))
    .orderBy(desc(schema.investments.createdAt));

  const result = [];
  for (const { investment, package: pkg } of rows) {
    const earnings = await db
      .select()
      .from(schema.investmentEarnings)
      .where(eq(schema.investmentEarnings.investmentId, investment.id));
    let totalEarnedCents = 0;
    let availableCents = 0;
    for (const e of earnings) {
      totalEarnedCents += e.amountCents;
      if (e.status === 'AVAILABLE') availableCents += e.amountCents;
    }
    result.push({
      investment,
      package: pkg,
      summary: {
        totalEarnedCents,
        availableCents,
        lockedCents: totalEarnedCents - availableCents,
      },
    });
  }
  return result;
}

export async function getInvestmentDetail(userId: string, investmentId: string, isAdmin: boolean) {
  const rows = await db
    .select({
      investment: schema.investments,
      package: schema.investmentPackages,
    })
    .from(schema.investments)
    .innerJoin(
      schema.investmentPackages,
      eq(schema.investments.packageId, schema.investmentPackages.id),
    )
    .where(eq(schema.investments.id, investmentId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Investment not found');
  if (!isAdmin && row.investment.userId !== userId) {
    throw new HttpError(403, 'FORBIDDEN', 'Not your investment');
  }

  const earnings = await db
    .select()
    .from(schema.investmentEarnings)
    .where(eq(schema.investmentEarnings.investmentId, investmentId))
    .orderBy(asc(schema.investmentEarnings.period));

  // Projection of the full 90-day schedule (what the member will earn).
  const schedule = buildInvestmentSchedule(
    row.investment.principalCents,
    {
      tier: row.package.tier,
      name: row.package.name,
      minAmountCents: row.package.minAmountCents,
      maxAmountCents: row.package.maxAmountCents,
      monthlyRateBps: row.package.monthlyRateBps,
      dailyRateBps: row.package.dailyRateBps,
    },
    row.investment.startDate,
  );

  return {
    investment: row.investment,
    package: row.package,
    earnings,
    schedule,
  };
}

// ── Create ─────────────────────────────────────────────

export async function createInvestment(userId: string, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents < 5000 || amountCents > MAX_INVESTMENT_CENTS) {
    throw new HttpError(400, 'INVALID_AMOUNT', 'Amount must be an integer between $50 and $10,000,000');
  }

  const enginePkg = getPackageForAmount(amountCents);
  if (!enginePkg) throw new HttpError(400, 'INVALID_AMOUNT', 'Amount must be at least $50');

  return db.transaction(async (tx) => {
    // Server-side truth: the active package row, not the engine constant.
    const [packageRow] = await tx
      .select()
      .from(schema.investmentPackages)
      .where(
        and(eq(schema.investmentPackages.tier, enginePkg.tier), eq(schema.investmentPackages.status, 'ACTIVE')),
      )
      .limit(1);
    if (!packageRow) {
      throw new HttpError(409, 'PACKAGE_UNAVAILABLE', `Tier ${enginePkg.tier} is not currently active`);
    }

    await ensureWallets(tx, userId);

    // Lock the COPINEX wallet and check funds.
    const [wallet] = await tx
      .select()
      .from(schema.wallets)
      .where(and(eq(schema.wallets.userId, userId), eq(schema.wallets.walletType, 'COPINEX')))
      .for('update')
      .limit(1);
    if (!wallet) throw new HttpError(409, 'WALLET_MISSING', 'COPINEX wallet not found');

    if (wallet.balanceCents < amountCents) {
      throw new HttpError(
        400,
        'INSUFFICIENT_FUNDS',
        `COPINEX wallet balance ($${(wallet.balanceCents / 100).toFixed(2)}) is below the investment amount`,
      );
    }

    const newBalance = wallet.balanceCents - amountCents;
    await tx
      .update(schema.wallets)
      .set({ balanceCents: newBalance, version: wallet.version + 1 })
      .where(eq(schema.wallets.id, wallet.id));

    const now = new Date();
    const [investment] = await tx
      .insert(schema.investments)
      .values({
        userId,
        packageId: packageRow.id,
        principalCents: amountCents,
        status: 'ACTIVE',
        startDate: now,
        accrualEndDate: addDays(now, DAILY_ACCRUAL_DAYS),
        availableDate: addDays(now, AVAILABLE_AFTER_DAYS),
      })
      .returning();
    if (!investment) throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to create investment');

    await tx.insert(schema.ledgerEntries).values({
      userId,
      walletType: 'COPINEX',
      type: 'INVESTMENT_PRINCIPAL',
      amountCents: -amountCents,
      balanceAfterCents: newBalance,
      sourceType: 'investment',
      sourceId: investment.id,
      createdAt: now,
    });

    const schedule = buildInvestmentSchedule(amountCents, enginePkg, now);

    return { investment, package: packageRow, schedule };
  });
}

// ── Accrual job ────────────────────────────────────────

/**
 * Idempotent accrual: credits daily profit (LOCKED) as days pass, unlocks
 * earnings once availableAt passes, and credits monthly profit + 20% upline
 * commissions on each calendar-month boundary after the availability date.
 * Unique (investment_id, period) rows make re-runs safe.
 */
export async function accrueInvestments(asOf = new Date()): Promise<AccrualResult> {
  const result: AccrualResult = {
    investmentsProcessed: 0,
    dailyCredited: 0,
    monthlyCredited: 0,
    commissionsPaid: 0,
    unlocked: 0,
  };

  const active = await db
    .select()
    .from(schema.investments)
    .where(eq(schema.investments.status, 'ACTIVE'));

  for (const inv of active) {
    const [pkgRow] = await db
      .select()
      .from(schema.investmentPackages)
      .where(eq(schema.investmentPackages.id, inv.packageId))
      .limit(1);
    if (!pkgRow) continue;

    const elapsedDays = Math.max(0, daysBetween(inv.startDate, asOf));
    const accrualDays = Math.min(elapsedDays, DAILY_ACCRUAL_DAYS);

    await db.transaction(async (tx) => {
      // Daily credits, day 1..accrualDays.
      for (let d = 1; d <= accrualDays; d++) {
        const period = `D${String(d).padStart(3, '0')}`;
        const existing = await tx
          .select({ id: schema.investmentEarnings.id })
          .from(schema.investmentEarnings)
          .where(
            and(eq(schema.investmentEarnings.investmentId, inv.id), eq(schema.investmentEarnings.period, period)),
          )
          .limit(1);
        if (existing.length > 0) continue;

        const amount = computeDailyProfitCents(inv.principalCents, pkgRow.dailyRateBps);
        const creditedAt = addDays(inv.startDate, d - 1);
        await creditWallet(
          tx,
          inv.userId,
          'WITHDRAWAL',
          amount,
          'INVESTMENT_DAILY_PROFIT',
          'investment',
          inv.id,
          creditedAt,
        );
        await tx.insert(schema.investmentEarnings).values({
          investmentId: inv.id,
          userId: inv.userId,
          period,
          kind: 'DAILY',
          amountCents: amount,
          status: 'LOCKED',
          creditedAt,
          availableAt: inv.availableDate,
        });
        result.dailyCredited++;
      }

      // Unlock: LOCKED → AVAILABLE once availableAt has passed.
      const unlocked = await tx
        .update(schema.investmentEarnings)
        .set({ status: 'AVAILABLE' })
        .where(
          and(
            eq(schema.investmentEarnings.investmentId, inv.id),
            eq(schema.investmentEarnings.status, 'LOCKED'),
            lte(schema.investmentEarnings.availableAt, asOf),
          ),
        )
        .returning({ id: schema.investmentEarnings.id });
      result.unlocked += unlocked.length;

      // Monthly credits + upline commissions after the availability date.
      if (asOf >= inv.availableDate) {
        for (const { period, boundaryDate } of monthlyPeriodsBetween(inv.availableDate, asOf)) {
          const existing = await tx
            .select({ id: schema.investmentEarnings.id })
            .from(schema.investmentEarnings)
            .where(
              and(eq(schema.investmentEarnings.investmentId, inv.id), eq(schema.investmentEarnings.period, period)),
            )
            .limit(1);
          if (existing.length > 0) continue;

          const amount = computeMonthlyProfitCents(inv.principalCents, pkgRow.monthlyRateBps);
          await creditWallet(
            tx,
            inv.userId,
            'WITHDRAWAL',
            amount,
            'INVESTMENT_MONTHLY_PROFIT',
            'investment',
            inv.id,
            boundaryDate,
          );
          await tx.insert(schema.investmentEarnings).values({
            investmentId: inv.id,
            userId: inv.userId,
            period,
            kind: 'MONTHLY',
            amountCents: amount,
            status: 'AVAILABLE',
            creditedAt: boundaryDate,
            availableAt: boundaryDate,
          });
          result.monthlyCredited++;

          result.commissionsPaid += await payUplineCommissions(tx, inv.id, inv.userId, amount, period, boundaryDate);
        }
      }
    });

    result.investmentsProcessed++;
  }

  return result;
}

// ── Upline commissions ────────────────────────────────

async function payUplineCommissions(
  tx: Tx,
  investmentId: string,
  payerUserId: string,
  monthlyProfitCents: number,
  period: string,
  at: Date,
): Promise<number> {
  const poolCents = computeUplineCommissionPoolCents(monthlyProfitCents);
  if (poolCents <= 0) return 0;

  const chain = await loadUplineChain(tx, payerUserId, MAX_UPLINE_LEVELS);
  const members: UplineMember[] = chain.map((c) => ({
    userId: c.id,
    level: c.level,
  }));

  const payouts = distributeUplineCommission(poolCents, members);
  for (const p of payouts) {
    await creditWallet(
      tx,
      p.recipientId,
      'COPINEX',
      p.amountCents,
      'UPLINE_INVESTMENT_COMMISSION',
      'investment',
      investmentId,
      at,
    );
    await tx
      .insert(schema.investmentCommissions)
      .values({
        investmentId,
        period,
        payerUserId,
        recipientId: p.recipientId,
        level: p.level,
        amountCents: p.amountCents,
        status: 'PAID',
        createdAt: at,
      })
      .onConflictDoNothing({
        target: [
          schema.investmentCommissions.investmentId,
          schema.investmentCommissions.period,
          schema.investmentCommissions.recipientId,
        ],
      });
  }
  return payouts.length;
}

/** Upline chain via recursive CTE: investor at level 0, sponsor at level 1 … */
async function loadUplineChain(tx: Tx, userId: string, maxLevel: number) {
  const result = await tx.execute<{ id: string; level: number }>(sql`
    WITH RECURSIVE chain AS (
      SELECT id, sponsor_id, 0 AS level
      FROM users WHERE id = ${userId}
      UNION ALL
      SELECT u.id, u.sponsor_id, c.level + 1
      FROM users u
      JOIN chain c ON u.id = c.sponsor_id
      WHERE c.level < ${maxLevel} AND c.sponsor_id IS NOT NULL
    )
    SELECT id, level FROM chain WHERE level > 0 ORDER BY level
  `);
  return result.rows;
}

// ── Admin ──────────────────────────────────────────────

export async function createPackage(input: {
  tier: number;
  name: string;
  minAmountCents: number;
  maxAmountCents?: number | null | undefined;
  monthlyRateBps: number;
  dailyRateBps: number;
  status: 'ACTIVE' | 'INACTIVE';
  description?: string | null | undefined;
}) {
  const existing = await db
    .select({ id: schema.investmentPackages.id })
    .from(schema.investmentPackages)
    .where(eq(schema.investmentPackages.tier, input.tier))
    .limit(1);
  if (existing.length > 0) throw new HttpError(409, 'TIER_EXISTS', `Tier ${input.tier} already exists`);

  const [row] = await db
    .insert(schema.investmentPackages)
    .values({
      tier: input.tier,
      name: input.name,
      minAmountCents: input.minAmountCents,
      maxAmountCents: input.maxAmountCents ?? null,
      monthlyRateBps: input.monthlyRateBps,
      dailyRateBps: input.dailyRateBps,
      status: input.status,
      description: input.description ?? null,
    })
    .returning();
  return row;
}

export async function updatePackage(
  id: string,
  input: {
    name?: string | undefined;
    minAmountCents?: number | undefined;
    maxAmountCents?: number | null | undefined;
    monthlyRateBps?: number | undefined;
    dailyRateBps?: number | undefined;
    status?: 'ACTIVE' | 'INACTIVE' | undefined;
    description?: string | null | undefined;
  },
) {
  const patch: Partial<typeof schema.investmentPackages.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.minAmountCents !== undefined) patch.minAmountCents = input.minAmountCents;
  if (input.maxAmountCents !== undefined) patch.maxAmountCents = input.maxAmountCents ?? null;
  if (input.monthlyRateBps !== undefined) patch.monthlyRateBps = input.monthlyRateBps;
  if (input.dailyRateBps !== undefined) patch.dailyRateBps = input.dailyRateBps;
  if (input.status !== undefined) patch.status = input.status;
  if (input.description !== undefined) patch.description = input.description ?? null;

  const [row] = await db
    .update(schema.investmentPackages)
    .set(patch)
    .where(eq(schema.investmentPackages.id, id))
    .returning();
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Package not found');
  return row;
}

export async function closeInvestment(investmentId: string) {
  const [row] = await db
    .update(schema.investments)
    .set({ status: 'CLOSED' })
    .where(eq(schema.investments.id, investmentId))
    .returning();
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Investment not found');
  return row;
}

// ── Helpers ────────────────────────────────────────────

/**
 * Calendar-month boundaries strictly after `from` and up to `to`.
 * Monthly profit is credited on the 1st of each month; the first credit is
 * the first 1st after the 90-day availability date. (Documented assumption.)
 */
function monthlyPeriodsBetween(from: Date, to: Date): { period: string; boundaryDate: Date }[] {
  const periods: { period: string; boundaryDate: Date }[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor <= end) {
    periods.push({
      period: `M${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      boundaryDate: new Date(cursor),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

/** Export the rate constant so the report can reference it. */
export const UPLINE_RATE_BPS = UPLINE_COMMISSION_RATE_BPS;