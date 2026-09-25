/**
 * Copinex Compensation Engine — Pool Management (§10)
 *
 * Rank Pool and Leadership Pool accrue company-wide (+$4 / +$3.50 per
 * registration) and pay out ONLY on milestone qualification. The hard rule:
 * NEVER pay beyond the accrued pool balance — when the balance is insufficient,
 * the payout is FLAGGED for admin review instead of paid (§10, flag-not-pay).
 * The API applies this atomically with SELECT ... FOR UPDATE on the pool row.
 */
import { allocateRegistrationFee } from './allocation.js';

/**
 * §5 — Rank Pool accrual per registration: 8% of the fee ($4.00).
 * Derived from the allocation itself so the accrual can never drift from what
 * allocateRegistrationFee actually puts into the pool.
 */
export const RANK_POOL_ACCRUAL_CENTS = allocateRegistrationFee().rankPoolContributionCents;

/** §6 — Leadership Pool accrual per registration: 7% of the fee ($3.50). */
export const LEADERSHIP_POOL_ACCRUAL_CENTS = allocateRegistrationFee().leadershipPoolContributionCents;

/** True when the pool balance can cover the reward, to the cent. */
export function checkPoolSolvency(balanceCents: number, rewardCents: number): boolean {
  if (!Number.isInteger(balanceCents) || balanceCents < 0) {
    throw new Error(`checkPoolSolvency: balanceCents must be a non-negative integer, got ${balanceCents}`);
  }
  if (!Number.isInteger(rewardCents) || rewardCents <= 0) {
    throw new Error(`checkPoolSolvency: rewardCents must be a positive integer, got ${rewardCents}`);
  }
  return balanceCents >= rewardCents;
}

/** Decision of the §10 pay-vs-flag rule for one reward. */
export interface PoolPayoutDecision {
  /** True when the reward should be paid from the pool. */
  payable: boolean;
  /** True when the pool is underfunded — payout must go to admin review, not paid. */
  flagged: boolean;
  /** Balance after paying (unchanged when flagged). */
  remainingBalanceCents: number;
}

/**
 * §10 — Apply the flag-not-pay rule to a reward against a pool balance.
 */
export function resolvePoolPayout(balanceCents: number, rewardCents: number): PoolPayoutDecision {
  const payable = checkPoolSolvency(balanceCents, rewardCents);
  return {
    payable,
    flagged: !payable,
    remainingBalanceCents: payable ? balanceCents - rewardCents : balanceCents,
  };
}