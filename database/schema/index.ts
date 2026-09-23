/**
 * Copinex PostgreSQL schema — preliminary, per analysis §6.
 * Money columns are integer cents (integer/bigint). Never floats.
 */
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ── Enums ──────────────────────────────────────────────

export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'INACTIVE', 'SUSPENDED']);

export const bonusTypeEnum = pgEnum('bonus_type', [
  'DIRECT_REFERRAL_BONUS',
  'GENERATION_BONUS_GEN2',
  'GENERATION_BONUS_GEN3',
  'GENERATION_BONUS_GEN4',
  'GENERATION_BONUS_GEN5',
  'GENERATION_BONUS_GEN6',
  'RANK_MILESTONE',
  'SPONSOR_OVERRIDE',
  'TRADING_PROFIT_RETAINED',
  'TRADING_PERFORMANCE_SHARE',
]);

export const payoutStatusEnum = pgEnum('payout_status', ['PAID', 'FLAGGED', 'REVIEW', 'VOID']);

export const settlementStatusEnum = pgEnum('settlement_status', ['PENDING', 'PROCESSED', 'FAILED']);

// ── Tables ─────────────────────────────────────────────

/** Members. Self-referential: sponsor_id (PEM) + placement_parent_id (matrix). §8/§9. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name'),
    sponsorId: uuid('sponsor_id').references((): any => users.id),
    placementParentId: uuid('placement_parent_id').references((): any => users.id),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    isActive: boolean('is_active').notNull().default(true),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    highestAssociateRank: integer('highest_associate_rank').notNull().default(0),
    highestLeadershipRank: integer('highest_leadership_rank').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_idx').on(t.email),
    index('users_sponsor_idx').on(t.sponsorId),
    index('users_placement_idx').on(t.placementParentId),
  ],
);

/** One wallet per member. balance_cents is integer cents. */
export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    balanceCents: bigint('balance_cents', { mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    version: integer('version').notNull().default(0), // optimistic lock
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('wallets_user_idx').on(t.userId)],
);

/** Append-only ledger. Every money movement, with balance_after for audit. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: bonusTypeEnum('type').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(), // signed: +credit / -debit
    balanceAfterCents: bigint('balance_after_cents', { mode: 'number' }).notNull(),
    sourceType: text('source_type').notNull(), // 'registration' | 'settlement' | ...
    sourceId: uuid('source_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ledger_user_created_idx').on(t.userId, t.createdAt),
    index('ledger_source_idx').on(t.sourceType, t.sourceId),
  ],
);

/** Every $50 registration. */
export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    feeCents: integer('fee_cents').notNull().default(5000),
    status: text('status').notNull().default('PAID'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('registrations_user_idx').on(t.userId)],
);

/** The §2 five-bucket split of each registration fee. CHECK: sum = feeCents. */
export const feeAllocations = pgTable(
  'fee_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id),
    companyReserveCents: integer('company_reserve_cents').notNull(),
    directReferralPoolCents: integer('direct_referral_pool_cents').notNull(),
    generationPoolCents: integer('generation_pool_cents').notNull(),
    rankPoolContributionCents: integer('rank_pool_contribution_cents').notNull(),
    leadershipPoolContributionCents: integer('leadership_pool_contribution_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fee_alloc_registration_idx').on(t.registrationId)],
);

/** Shared, accumulating pools (rank + leadership). §10 — balance-monitored. */
export const pools = pgTable(
  'pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(), // 'RANK_BONUS' | 'LEADERSHIP_BONUS'
    balanceCents: bigint('balance_cents', { mode: 'number' }).notNull().default(0),
    version: integer('version').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pools_name_idx').on(t.name)],
);

/** Direct + generation bonus payouts. §3/§4. */
export const bonusPayouts = pgTable(
  'bonus_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id),
    type: bonusTypeEnum('type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    sourceRegistrationId: uuid('source_registration_id')
      .notNull()
      .references(() => registrations.id),
    generation: integer('generation'), // null for direct referral
    compressed: boolean('compressed').notNull().default(false),
    status: payoutStatusEnum('status').notNull().default('PAID'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bonus_recipient_idx').on(t.recipientId),
    index('bonus_source_idx').on(t.sourceRegistrationId),
  ],
);

/** One-time Associate Rank milestone payouts. §5. */
export const rankMilestones = pgTable(
  'rank_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    rankId: integer('rank_id').notNull(),
    rewardCents: integer('reward_cents').notNull(),
    status: payoutStatusEnum('status').notNull().default('PAID'), // FLAGGED if pool underfunded
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('rank_milestone_user_rank_idx').on(t.userId, t.rankId)],
);

/** Non-cash Leadership rewards — SKU, not currency. §6. */
export const leadershipRewards = pgTable(
  'leadership_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    rankId: integer('rank_id').notNull(),
    rewardSku: text('reward_sku').notNull(),
    status: payoutStatusEnum('status').notNull().default('REVIEW'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('leadership_reward_user_rank_idx').on(t.userId, t.rankId)],
);

/** Per-member team volume cache (per-leg breakdown for the 40% cap). §5. */
export const teamVolume = pgTable(
  'team_volume',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    totalVolumeCents: bigint('total_volume_cents', { mode: 'number' }).notNull().default(0),
    /** Map of leg sponsor-id → volume cents. Drives MAX_LEG_CONTRIBUTION. */
    legVolumes: jsonb('leg_volumes').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('team_volume_user_idx').on(t.userId)],
);

/** §7 trading profit settlements. UNIQUE(period, client_id) → idempotent. */
export const tradingSettlements = pgTable(
  'trading_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: text('period').notNull(), // '2026-09'
    clientId: uuid('client_id')
      .notNull()
      .references(() => users.id),
    realizedProfitCents: bigint('realized_profit_cents', { mode: 'number' }).notNull(),
    clientShareCents: bigint('client_share_cents', { mode: 'number' }).notNull(),
    sponsorShareCents: bigint('sponsor_share_cents', { mode: 'number' }).notNull(),
    companyShareCents: bigint('company_share_cents', { mode: 'number' }).notNull(),
    status: settlementStatusEnum('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('settlement_period_client_idx').on(t.period, t.clientId)],
);

/** Configurable policy knobs (Active Member window, rates overrides). §9.1. */
export const config = pgTable(
  'config',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    description: text('description'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);