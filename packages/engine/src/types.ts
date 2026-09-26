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
  | 'TRADING_PERFORMANCE_SHARE'
  | 'INVESTMENT_PRINCIPAL'
  | 'INVESTMENT_DAILY_PROFIT'
  | 'INVESTMENT_MONTHLY_PROFIT'
  | 'UPLINE_INVESTMENT_COMMISSION';

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
}

/** Generation bonus payout decision for one generation tier. §4. */
export interface GenerationPayout {
  generation: number;
  recipientId: string | null;
  amountCents: number;
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

// ── Investment Packages ───────────────────────────────

/** One of the five investment tiers. All money values in cents, rates in bps. */
export interface InvestmentPackage {
  tier: number;
  name: string;
  minAmountCents: number;
  /** null = no upper bound (tier 5: $5,000+). */
  maxAmountCents: number | null;
  /** Monthly return in basis points (1000 = 10%). */
  monthlyRateBps: number;
  /** Daily return in basis points (33 = 0.33%). */
  dailyRateBps: number;
}

/** One daily accrual within the first 90 days. */
export interface DailyCredit {
  day: number;
  amountCents: number;
  creditedAt: Date;
  /** All daily credits unlock together after the 90-day settlement period. */
  availableAt: Date;
}

/** One monthly credit after the 90-day window. Capital stays active indefinitely. */
export interface MonthlyCredit {
  /** Calendar month key, e.g. 'M2026-10'. */
  period: string;
  amountCents: number;
  creditedAt: Date;
}

/** The full earning schedule for an investment. */
export interface InvestmentSchedule {
  dailyCredits: DailyCredit[];
  /** Monthly profit in cents — credited each calendar month after day 90. */
  monthlyProfitCents: number;
}

/** A member in the sponsor chain, with distance from the investor. */
export interface UplineMember {
  userId: string;
  /** 1 = direct sponsor, 2 = sponsor's sponsor, etc. */
  level: number;
}

/** One upline commission payout. */
export interface UplineCommissionPayout {
  recipientId: string;
  level: number;
  amountCents: number;
}