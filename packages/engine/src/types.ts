/**
 * Copinex Compensation Engine — Domain Types
 * Source: Copinex Calculation Spec (structure implied by pseudocode in §2–§10)
 */

/** Ledger/bonus types — every money movement is typed and traceable. */
export type BonusType =
  | 'DIRECT_REFERRAL_BONUS'
  | `GENERATION_BONUS_GEN${2 | 3 | 4 | 5 | 6}`
  | 'RANK_MILESTONE'
  | 'SPONSOR_OVERRIDE'
  | 'TRADING_PROFIT_RETAINED'
  | 'TRADING_PERFORMANCE_SHARE';

/** Result of §2 fee allocation. All values in cents. */
export interface FeeAllocation {
  companyReserveCents: number;
  directReferralPoolCents: number;
  generationPoolCents: number;
  rankPoolContributionCents: number;
  leadershipPoolContributionCents: number;
}

/** Result of §7 trading profit share. All values in cents. */
export interface TradingProfitShares {
  clientCents: number;
  sponsorCents: number;
  companyCents: number;
}

/** A member in the downline tree. §9. */
export interface Member {
  id: string;
  /** Direct sponsor (PEM). One level up. */
  sponsorId: string | null;
  /** Matrix placement parent. §8. */
  placementParentId: string | null;
  isActive: boolean;
  highestAssociateRank: number;
  highestLeadershipRank: number;
}

/** Direct referral bonus payout decision. §3. */
export interface DirectReferralPayout {
  recipientId: string | null;
  amountCents: number;
  compressed: boolean;
}

/** Generation bonus payout decision for one generation tier. §4. */
export interface GenerationPayout {
  generation: number;
  recipientId: string | null;
  amountCents: number;
  compressed: boolean;
}

/** Associate rank evaluation result. §5. */
export interface RankMilestone {
  rankId: number;
  rewardCents: number;
  /** Pool balance was insufficient — payout must be flagged for admin review, not auto-paid. §10 */
  flagged: boolean;
}

/** Leadership rank evaluation result. §6. */
export interface LeadershipReward {
  rankId: number;
  rewardSku: string;
}

/** Matrix placement result. §8. */
export interface MatrixPlacement {
  /** The member whose direct row accepted the placement (sponsor or spillover target). */
  placementParentId: string;
  spilledOver: boolean;
}