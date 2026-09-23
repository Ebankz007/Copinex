/**
 * Copinex Compensation Engine — Fee Allocation (§2) & Trading Profit Share (§7)
 *
 * These are the two fully-specified money functions in the spec, with
 * reconciliation invariants (§12) enforced in-code. All values are integer cents.
 */
import {
  COMMUNITY_POOL_SPLIT,
  FEE_SPLIT,
  REGISTRATION_FEE_CENTS,
  TRADING_PROFIT_SPLIT,
} from './constants.js';
import type { FeeAllocation, TradingProfitShares } from './types.js';

/** §12 invariant: the five fee buckets must reconcile to exactly 100%. */
export const FEE_SPLIT_TOTAL =
  FEE_SPLIT.companyReserve +
  COMMUNITY_POOL_SPLIT.directReferral +
  COMMUNITY_POOL_SPLIT.generation +
  COMMUNITY_POOL_SPLIT.rank +
  COMMUNITY_POOL_SPLIT.leadership;

/** §12 invariant: the three profit buckets must reconcile to exactly 100%. */
export const PROFIT_SPLIT_TOTAL =
  TRADING_PROFIT_SPLIT.client +
  TRADING_PROFIT_SPLIT.sponsor +
  TRADING_PROFIT_SPLIT.company;

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

  const companyReserveCents = feeCents * FEE_SPLIT.companyReserve;
  const directReferralPoolCents = feeCents * COMMUNITY_POOL_SPLIT.directReferral;
  const generationPoolCents = feeCents * COMMUNITY_POOL_SPLIT.generation;
  const rankPoolContributionCents = feeCents * COMMUNITY_POOL_SPLIT.rank;
  const leadershipPoolContributionCents = feeCents * COMMUNITY_POOL_SPLIT.leadership;

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
  const expectedCommunityPool = feeCents * FEE_SPLIT.communityPool;

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

  const clientCents = periodRealizedProfitCents * TRADING_PROFIT_SPLIT.client;
  const sponsorCents = periodRealizedProfitCents * TRADING_PROFIT_SPLIT.sponsor;
  const companyCents = periodRealizedProfitCents * TRADING_PROFIT_SPLIT.company;

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