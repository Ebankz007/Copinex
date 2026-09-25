/**
 * Copinex Compensation Engine — Fee Allocation (§2) & Trading Profit Share (§7)
 *
 * These are the two fully-specified money functions in the spec, with
 * reconciliation invariants (§12) enforced in-code. All values are integer cents.
 *
 * Money math: integer basis points (constants.ts `*_BPS`) and largest-remainder
 * rounding — each bucket gets floor(share), and the leftover cents go to the
 * largest fractional shares. This guarantees the buckets ALWAYS sum to the
 * source amount exactly, with no bucket more than 1 cent off its exact share,
 * and never a fractional cent — for ANY input, not just round ones.
 */
import {
  COMMUNITY_POOL_SPLIT_BPS,
  FEE_SPLIT_BPS,
  REGISTRATION_FEE_CENTS,
  TRADING_PROFIT_SPLIT_BPS,
} from './constants.js';
import type { FeeAllocation, TradingProfitShares } from './types.js';

/** §12 invariant: the five fee buckets must reconcile to exactly 100%. */
export const FEE_SPLIT_TOTAL =
  (FEE_SPLIT_BPS.companyReserve +
    COMMUNITY_POOL_SPLIT_BPS.directReferral +
    COMMUNITY_POOL_SPLIT_BPS.generation +
    COMMUNITY_POOL_SPLIT_BPS.rank +
    COMMUNITY_POOL_SPLIT_BPS.leadership) /
  10_000;

/** §12 invariant: the three profit buckets must reconcile to exactly 100%. */
export const PROFIT_SPLIT_TOTAL =
  (TRADING_PROFIT_SPLIT_BPS.client +
    TRADING_PROFIT_SPLIT_BPS.sponsor +
    TRADING_PROFIT_SPLIT_BPS.company) /
  10_000;

/**
 * Split `totalCents` across weighted buckets (weights in bps, summing to
 * weightSum) using largest-remainder rounding. Returns integer cents summing
 * EXACTLY to totalCents.
 */
function splitByBps(totalCents: number, weightsBps: readonly number[]): number[] {
  const weightSum = weightsBps.reduce((sum, w) => sum + w, 0);
  const exact = weightsBps.map((w) => (totalCents * w) / weightSum);
  const base = exact.map(Math.floor);

  let remainder = totalCents - base.reduce((sum, v) => sum + v, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    // `i` is a valid index: `order` is derived from `exact`, which has the same
    // length as `base`.
    base[i] = base[i]! + 1;
    remainder -= 1;
  }
  return base;
}

/**
 * §2 — Split a registration fee into its five buckets.
 * Mirrors spec pseudocode `allocateRegistrationFee(fee = 50.00)`.
 *
 * @param feeCents Registration fee in cents. Defaults to REGISTRATION_FEE_CENTS (5000).
 * @throws if the split does not reconcile to the full fee (to the cent).
 */
export function allocateRegistrationFee(feeCents: number = REGISTRATION_FEE_CENTS): FeeAllocation {
  if (!Number.isInteger(feeCents) || feeCents <= 0) {
    throw new Error(`allocateRegistrationFee: feeCents must be a positive integer, got ${feeCents}`);
  }

  const [companyReserveCents, directReferralPoolCents, generationPoolCents, rankPoolContributionCents, leadershipPoolContributionCents] =
    splitByBps(feeCents, [
      FEE_SPLIT_BPS.companyReserve,
      COMMUNITY_POOL_SPLIT_BPS.directReferral,
      COMMUNITY_POOL_SPLIT_BPS.generation,
      COMMUNITY_POOL_SPLIT_BPS.rank,
      COMMUNITY_POOL_SPLIT_BPS.leadership,
    ]) as [number, number, number, number, number];

  const allocation: FeeAllocation = {
    companyReserveCents,
    directReferralPoolCents,
    generationPoolCents,
    rankPoolContributionCents,
    leadershipPoolContributionCents,
  };

  // §2: community pool = direct + generation + rank + leadership
  const communityPool =
    directReferralPoolCents +
    generationPoolCents +
    rankPoolContributionCents +
    leadershipPoolContributionCents;
  const expectedCommunityPool = (feeCents * FEE_SPLIT_BPS.communityPool) / 10_000;

  // §12: company_reserve + community_pool must equal the full fee, to the cent.
  if (companyReserveCents + communityPool !== feeCents || communityPool !== expectedCommunityPool) {
    throw new Error(
      `allocateRegistrationFee: split does not reconcile. fee=${feeCents}, ` +
        `reserve=${companyReserveCents}, community=${communityPool}`,
    );
  }

  return allocation;
}

/**
 * §7 — Distribute realized trading profit: 60% client / 10% sponsor / 30% company.
 * Mirrors spec pseudocode `distributeTradingProfitShare(client, periodRealizedProfit)`.
 *
 * Rounding: largest-remainder, so the three shares always sum to the profit
 * exactly and never contain fractional cents — for any profit value.
 *
 * @param periodRealizedProfitCents Realized profit for the settlement period, in cents.
 * @returns the three shares, or null if profit <= 0 (loss/breakeven → NO split, nobody paid).
 * @throws if the shares do not reconcile to the profit, to the cent.
 */
export function distributeTradingProfitShare(
  periodRealizedProfitCents: number,
): TradingProfitShares | null {
  if (!Number.isInteger(periodRealizedProfitCents)) {
    throw new Error(
      `distributeTradingProfitShare: profit must be an integer number of cents, got ${periodRealizedProfitCents}`,
    );
  }

  // §7: loss or breakeven → no split occurs, no party is paid or charged.
  if (periodRealizedProfitCents <= 0) return null;

  const [clientCents, sponsorCents, companyCents] = splitByBps(periodRealizedProfitCents, [
    TRADING_PROFIT_SPLIT_BPS.client,
    TRADING_PROFIT_SPLIT_BPS.sponsor,
    TRADING_PROFIT_SPLIT_BPS.company,
  ]) as [number, number, number];

  const shares: TradingProfitShares = { clientCents, sponsorCents, companyCents };

  // §12: client + sponsor + company must equal the profit, to the cent.
  if (clientCents + sponsorCents + companyCents !== periodRealizedProfitCents) {
    throw new Error(
      `distributeTradingProfitShare: shares do not reconcile. profit=${periodRealizedProfitCents}, ` +
        `client=${clientCents}, sponsor=${sponsorCents}, company=${companyCents}`,
    );
  }

  return shares;
}