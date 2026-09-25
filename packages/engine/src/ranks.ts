/**
 * Copinex Compensation Engine — Associate Ranks (§5) & Leadership Ranks (§6)
 *
 * §5 — Associate Ranks 1–8: qualification = minPersonalReferrals AND
 *      minTeamVolume (both must hold). Team volume applies the 40% leg cap:
 *      no single leg may contribute more than 40% of the UNCAPPED total.
 *      Evaluation is BOTTOM-UP (rank N requires rank N-1 already earned) and
 *      each rank is paid ONCE. Pool solvency is decided in pools.ts (§10).
 *
 * §6 — Leadership Ranks 1–6: SELF-QUALIFICATION gate (the member must already
 *      hold the required associate rank) plus 2 legs × 3 members at that
 *      associate rank. Rewards are NON-CASH — modeled as SKU, not currency.
 */
import { ASSOCIATE_RANKS, LEADERSHIP_RANKS, MAX_LEG_CONTRIBUTION } from './constants.js';
import type { LeadershipReward, RankMilestone } from './types.js';

/**
 * Apply the 40% leg cap to team volume.
 *
 * Each leg is capped at 40% of the UNCAPPED total; the capped total is the sum
 * of the capped legs. When no leg exceeds the cap, capped === uncapped.
 * floor() keeps the cap an integer number of cents.
 */
export function computeCappedTeamVolume(legVolumesCents: number[]): number {
  for (const v of legVolumesCents) {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`computeCappedTeamVolume: leg volumes must be non-negative integers, got ${v}`);
    }
  }
  const uncapped = legVolumesCents.reduce((sum, v) => sum + v, 0);
  if (uncapped === 0) return 0;
  const cap = Math.floor(uncapped * MAX_LEG_CONTRIBUTION);
  return legVolumesCents.reduce((sum, v) => sum + Math.min(v, cap), 0);
}

/** Inputs for §5 Associate Rank evaluation. */
export interface AssociateRankContext {
  /** Number of personal (direct) referrals. */
  personalReferrals: number;
  /** Team volume per direct leg, in cents, BEFORE the 40% cap. */
  legVolumesCents: number[];
  /** Highest associate rank already earned (paid). 0 = none. */
  highestEarnedRank: number;
}

/**
 * §5 — Evaluate which NEW associate ranks the member qualifies for.
 *
 * Bottom-up: only ranks strictly above `highestEarnedRank` are considered, so a
 * member can never skip a rank. Returns newly-qualified milestones in ascending
 * rank order. `flagged` is left false here — pool solvency is applied by
 * pools.ts at payout time.
 */
export function evaluateAssociateRanks(ctx: AssociateRankContext): RankMilestone[] {
  if (!Number.isInteger(ctx.personalReferrals) || ctx.personalReferrals < 0) {
    throw new Error(
      `evaluateAssociateRanks: personalReferrals must be a non-negative integer, got ${ctx.personalReferrals}`,
    );
  }
  const teamVolume = computeCappedTeamVolume(ctx.legVolumesCents);
  const qualified: RankMilestone[] = [];
  for (const rank of ASSOCIATE_RANKS) {
    if (rank.rankId <= ctx.highestEarnedRank) continue;
    if (ctx.personalReferrals >= rank.minPersonalReferrals && teamVolume >= rank.minTeamVolumeCents) {
      qualified.push({ rankId: rank.rankId, rewardCents: rank.rewardCents, flagged: false });
    }
  }
  return qualified;
}

/** Inputs for §6 Leadership Rank evaluation. */
export interface LeadershipContext {
  /** The member's own highest associate rank (self-qualification gate). */
  highestAssociateRank: number;
  /** Highest leadership rank already earned. 0 = none. */
  highestLeadershipRank: number;
  /** For each direct leg: the associate rank of every member in that leg. */
  legsMemberRanks: number[][];
}

/**
 * §6 — Evaluate which NEW leadership ranks the member qualifies for.
 *
 * For leadership rank R (requiring associate rank Q): at least minLegs (2)
 * direct legs must each contain at least minTeamMembers (3) members holding
 * associate rank >= Q. Progressive (ranks above highestLeadershipRank only).
 */
export function evaluateLeadershipRanks(ctx: LeadershipContext): LeadershipReward[] {
  for (const leg of ctx.legsMemberRanks) {
    for (const r of leg) {
      if (!Number.isInteger(r) || r < 0) {
        throw new Error(`evaluateLeadershipRanks: member ranks must be non-negative integers, got ${r}`);
      }
    }
  }

  const qualified: LeadershipReward[] = [];
  for (const rank of LEADERSHIP_RANKS) {
    if (rank.rankId <= ctx.highestLeadershipRank) continue;
    // Self-qualification gate: the member must already hold the required rank.
    if (ctx.highestAssociateRank < rank.requiredAssociateRank) continue;
    const legsWithEnough = ctx.legsMemberRanks.filter(
      (leg) => leg.filter((r) => r >= rank.requiredAssociateRank).length >= rank.minTeamMembers,
    ).length;
    if (legsWithEnough >= rank.minLegs) {
      qualified.push({ rankId: rank.rankId, rewardSku: rank.rewardSku });
    }
  }
  return qualified;
}