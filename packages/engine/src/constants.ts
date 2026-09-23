/**
 * Copinex Compensation Engine — Global Constants
 * Source: Copinex Calculation Spec, Section 1
 *
 * Money rule: ALL monetary values are integer cents. $50.00 = 5000.
 */

/** One-time fee paid by every new member on signup. §1 */
export const REGISTRATION_FEE_CENTS = 50_00;

/** Minimum a client must fund into their own broker account to activate copy-trading. NOT company revenue. §1 */
export const MIN_FUNDING_CENTS = 50_00;

/** Max direct placements per matrix position (3×3 matrix). §1 */
export const MATRIX_WIDTH = 3;

/** Max levels wide before spillover triggers. §1 */
export const MATRIX_DEPTH = 3;

/** Generation Bonus applies to levels 2 through 6 of a member's downline. §1 */
export const GENERATION_LEVELS = [2, 3, 4, 5, 6] as const;

/** Cap on a single referral leg's contribution to Associate Rank Team Volume. §1, §5 */
export const MAX_LEG_CONTRIBUTION = 0.4;

/** Registration fee split — top-level buckets. §2. Must reconcile to 100%. */
export const FEE_SPLIT = {
  /** Non-distributable. Company revenue. */
  companyReserve: 0.45,
  /** Feeds the 4 bonus types below. */
  communityPool: 0.55,
} as const;

/** Community Rewards Pool breakdown — 55% of fee, four sub-pools. §2. */
export const COMMUNITY_POOL_SPLIT = {
  /** Instant, per-registration, paid to direct sponsor. */
  directReferral: 0.3,
  /** Instant, per-registration, split across 5 generation tiers. */
  generation: 0.1,
  /** Accrues to a pool; paid only on milestone qualification. */
  rank: 0.08,
  /** Accrues to a pool; paid only on leadership rank qualification. */
  leadership: 0.07,
} as const;

/** Generation Bonus rates, Gen 2–6. §4. Gen 1 is the Direct Referral Bonus (§3). */
export const GENERATION_RATES: Readonly<Record<number, number>> = {
  2: 0.04, // $2.00
  3: 0.02, // $1.00
  4: 0.015, // $0.75
  5: 0.015, // $0.75
  6: 0.01, // $0.50
} as const;

/** Associate Rank milestones. §5. (rank_id, min_personal_referrals, min_team_volume, reward_cents) */
export const ASSOCIATE_RANKS = [
  { rankId: 1, minPersonalReferrals: 3, minTeamVolume: 12, rewardCents: 35_00 },
  { rankId: 2, minPersonalReferrals: 7, minTeamVolume: 40, rewardCents: 80_00 },
  { rankId: 3, minPersonalReferrals: 15, minTeamVolume: 130, rewardCents: 250_00 },
  { rankId: 4, minPersonalReferrals: 25, minTeamVolume: 700, rewardCents: 700_00 },
  { rankId: 5, minPersonalReferrals: 35, minTeamVolume: 2_500, rewardCents: 2_000_00 },
  { rankId: 6, minPersonalReferrals: 60, minTeamVolume: 6_000, rewardCents: 6_000_00 },
  { rankId: 7, minPersonalReferrals: 100, minTeamVolume: 17_000, rewardCents: 25_000_00 },
  { rankId: 8, minPersonalReferrals: 150, minTeamVolume: 60_000, rewardCents: 50_000_00 },
] as const;

/**
 * Leadership Ranks. §6. Rewards are NON-CASH — modeled as SKU, not currency.
 * (rank_id, name, required_associate_rank_of_team, min_legs, min_team_members, reward_sku)
 */
export const LEADERSHIP_RANKS = [
  { rankId: 1, name: 'Bronze Leader', requiredAssociateRank: 3, minLegs: 2, minTeamMembers: 3, rewardSku: 'SMARTPHONE' },
  { rankId: 2, name: 'Silver Leader', requiredAssociateRank: 4, minLegs: 2, minTeamMembers: 3, rewardSku: 'LAPTOP' },
  { rankId: 3, name: 'Gold Leader', requiredAssociateRank: 5, minLegs: 2, minTeamMembers: 3, rewardSku: 'LUXURY_WATCH' },
  { rankId: 4, name: 'Platinum Leader', requiredAssociateRank: 6, minLegs: 2, minTeamMembers: 3, rewardSku: 'INTERNATIONAL_TRIP' },
  { rankId: 5, name: 'Diamond Leader', requiredAssociateRank: 7, minLegs: 2, minTeamMembers: 3, rewardSku: 'LUXURY_VEHICLE' },
  { rankId: 6, name: 'Crown Diamond', requiredAssociateRank: 8, minLegs: 2, minTeamMembers: 3, rewardSku: 'HOME_APARTMENT' },
] as const;

/** Trading Profit Sharing split. §7. Applies ONLY to realized profit > 0. */
export const TRADING_PROFIT_SPLIT = {
  /** Retains majority of realized profit on their own funded account. */
  client: 0.6,
  /** Paid to the client's direct Sponsor. */
  sponsor: 0.1,
  /** Funds trade execution, AI infra, trader oversight, risk mgmt. */
  company: 0.3,
} as const;

/** Compression window — how far up the upline to search for a qualified (Active) member. §9.2 */
export const COMPRESSION_STOP_AT_GEN = 6;