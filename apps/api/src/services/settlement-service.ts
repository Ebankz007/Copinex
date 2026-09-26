/**
 * Copinex Settlement Service — §7 trading profit share.
 *
 * Realized period profit splits 60/10/30 (client / sponsor / company), only
 * when profit > 0. The client's 60% stays on their own funded broker account —
 * it is recorded for accounting but NOT credited to a platform wallet (the
 * platform never holds it). The sponsor's 10% is Active-gated and compresses
 * like the Direct Referral Bonus (§9.2); when no qualified upline exists it
 * reverts to the company. The company's 30% is company revenue, recorded only.
 *
 * The interim data source is the admin endpoint (the broker/trading-data
 * integration is an open question) — UNIQUE(period, client_id) makes each
 * client-period settlement idempotent.
 */
import { and, desc, eq } from 'drizzle-orm';
import { MAX_UPLINE_LEVELS, computeTradingSettlement } from '@copinex/engine';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { creditWallet } from './wallets.js';
import { loadSponsorChain } from './upline.js';

/** Period key format: 'YYYY-MM'. */
export const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

export async function recordSettlement(input: {
  clientId: string;
  period: string;
  realizedProfitCents: number;
}) {
  if (!PERIOD_PATTERN.test(input.period)) {
    throw new HttpError(400, 'INVALID_PERIOD', 'Period must be YYYY-MM');
  }
  if (!Number.isInteger(input.realizedProfitCents) || input.realizedProfitCents <= 0) {
    throw new HttpError(400, 'INVALID_AMOUNT', 'Realized profit must be a positive integer number of cents');
  }

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: schema.tradingSettlements.id })
      .from(schema.tradingSettlements)
      .where(
        and(
          eq(schema.tradingSettlements.period, input.period),
          eq(schema.tradingSettlements.clientId, input.clientId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      throw new HttpError(409, 'SETTLEMENT_EXISTS', 'A settlement already exists for this client and period');
    }

    const chain = await loadSponsorChain(tx, input.clientId, MAX_UPLINE_LEVELS);
    const settlement = computeTradingSettlement(input.realizedProfitCents, chain);
    if (!settlement) {
      throw new HttpError(400, 'NO_PROFIT', 'Realized profit must be positive for a settlement');
    }

    const at = new Date();
    // Unallocated sponsor share reverts to the company bucket.
    const revertedSponsorShare = settlement.sponsorOverride.unallocated
      ? settlement.sponsorOverride.amountCents
      : 0;

    const [row] = await tx
      .insert(schema.tradingSettlements)
      .values({
        period: input.period,
        clientId: input.clientId,
        realizedProfitCents: input.realizedProfitCents,
        clientShareCents: settlement.clientCents,
        sponsorShareCents: settlement.sponsorOverride.amountCents,
        companyShareCents: settlement.companyCents + revertedSponsorShare,
        status: 'PROCESSED',
      })
      .returning();
    if (!row) throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to create settlement');

    if (settlement.sponsorOverride.recipientId) {
      await creditWallet(
        tx,
        settlement.sponsorOverride.recipientId,
        'COPINEX',
        settlement.sponsorOverride.amountCents,
        'TRADING_PERFORMANCE_SHARE',
        'settlement',
        row.id,
        at,
      );
    }

    return row;
  });
}

export async function listSettlements() {
  return db
    .select()
    .from(schema.tradingSettlements)
    .orderBy(desc(schema.tradingSettlements.createdAt));
}