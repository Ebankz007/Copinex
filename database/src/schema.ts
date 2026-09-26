/**
 * Copinex PostgreSQL schema — preliminary, per analysis §6.
 * Money columns are integer cents (integer/bigint). Never floats.
 *
 * Extended for the 90-Day Investment Package feature:
 *  - wallet_type (COPINEX / WITHDRAWAL) — the spec names a Withdrawal Wallet
 *  - user role (MEMBER / ADMIN) — admin package management
 *  - investment_packages / investments / investment_earnings / investment_commissions
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

export const userRoleEnum = pgEnum('user_role', ['MEMBER', 'ADMIN']);

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
  'INVESTMENT_PRINCIPAL',
  'INVESTMENT_DAILY_PROFIT',
  'INVESTMENT_MONTHLY_PROFIT',
  'UPLINE_INVESTMENT_COMMISSION',
  // Money rails (Phase 1): deposits, withdrawal holds, withdrawal refunds
  'DEPOSIT',
  'WITHDRAWAL',
  'WITHDRAWAL_REFUND',
]);

export const payoutStatusEnum = pgEnum('payout_status', ['PAID', 'FLAGGED', 'REVIEW', 'VOID']);

export const withdrawalStatusEnum = pgEnum('withdrawal_status', ['PENDING', 'PAID', 'REJECTED']);

export const settlementStatusEnum = pgEnum('settlement_status', ['PENDING', 'PROCESSED', 'FAILED']);

/** Crypto payment rail (Pay2Crypto, 2026-09-26): what the invoice pays for. */
export const paymentPurposeEnum = pgEnum('payment_purpose', ['ACTIVATION', 'DEPOSIT']);

export const paymentStatusEnum = pgEnum('payment_status', ['PENDING', 'PAID', 'EXPIRED', 'FAILED']);

export const walletTypeEnum = pgEnum('wallet_type', ['COPINEX', 'WITHDRAWAL']);

export const investmentStatusEnum = pgEnum('investment_status', ['ACTIVE', 'MATURED', 'CLOSED']);

export const earningStatusEnum = pgEnum('earning_status', ['LOCKED', 'AVAILABLE']);

export const pammConnectionStatusEnum = pgEnum('pamm_connection_status', [
  'REQUESTED',
  'LINKED',
]);

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
    role: userRoleEnum('role').notNull().default('MEMBER'),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    isActive: boolean('is_active').notNull().default(true),
    /** Active Member policy (§9.1, answered 2026-09-26): Active = paid the $50 activation fee. */
    membershipActivated: boolean('membership_activated').notNull().default(false),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
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

/**
 * Wallets. One row per (user, wallet_type):
 *  - COPINEX   — main wallet (fees, bonuses, commissions)
 *  - WITHDRAWAL — investment profit wallet (the spec's "Withdrawal Wallet")
 */
export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    walletType: walletTypeEnum('wallet_type').notNull().default('COPINEX'),
    balanceCents: bigint('balance_cents', { mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    version: integer('version').notNull().default(0), // optimistic lock
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('wallets_user_type_idx').on(t.userId, t.walletType)],
);

/** Append-only ledger. Every money movement, with balance_after for audit. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    walletType: walletTypeEnum('wallet_type').notNull().default('COPINEX'),
    type: bonusTypeEnum('type').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(), // signed: +credit / -debit
    balanceAfterCents: bigint('balance_after_cents', { mode: 'number' }).notNull(),
    sourceType: text('source_type').notNull(), // 'registration' | 'settlement' | 'investment' | ...
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
    /** PENDING until the $50 activation fee is collected, then PAID (Active Member policy). */
    status: text('status').notNull().default('PENDING'),
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
    // Vestigial: compression was removed 2026-09-26 (every account earns
    // regardless of Active status). Always false; kept for audit compatibility.
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

// ── 90-Day Investment Packages ─────────────────────────

/** The five investment tiers. Rates in bps; amounts in integer cents. */
export const investmentPackages = pgTable(
  'investment_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tier: integer('tier').notNull(),
    name: text('name').notNull(),
    minAmountCents: integer('min_amount_cents').notNull(),
    /** null = no upper bound (tier 5: $5,000+). */
    maxAmountCents: integer('max_amount_cents'),
    monthlyRateBps: integer('monthly_rate_bps').notNull(),
    dailyRateBps: integer('daily_rate_bps').notNull(),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | INACTIVE
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('investment_packages_tier_idx').on(t.tier)],
);

/** A member's investment. Capital stays active after the 90-day settlement period. */
export const investments = pgTable(
  'investments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    packageId: uuid('package_id')
      .notNull()
      .references(() => investmentPackages.id),
    principalCents: integer('principal_cents').notNull(),
    status: investmentStatusEnum('status').notNull().default('ACTIVE'),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    accrualEndDate: timestamp('accrual_end_date', { withTimezone: true }).notNull(),
    availableDate: timestamp('available_date', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('investments_user_idx').on(t.userId),
    index('investments_status_idx').on(t.status),
  ],
);

/**
 * Earning credits. period: 'D001'..'D090' (daily) or 'M2026-10' (monthly).
 * UNIQUE(investment_id, period) makes the accrual job idempotent.
 */
export const investmentEarnings = pgTable(
  'investment_earnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investmentId: uuid('investment_id')
      .notNull()
      .references(() => investments.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    period: text('period').notNull(),
    kind: text('kind').notNull(), // 'DAILY' | 'MONTHLY'
    amountCents: integer('amount_cents').notNull(),
    status: earningStatusEnum('status').notNull().default('LOCKED'),
    creditedAt: timestamp('credited_at', { withTimezone: true }).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('investment_earnings_period_idx').on(t.investmentId, t.period),
    index('investment_earnings_user_idx').on(t.userId),
    index('investment_earnings_status_idx').on(t.status),
  ],
);

/**
 * Member-initiated withdrawal requests. Funds are held immediately (debited
 * from the wallet) on request; admin approves (PAID — money leaves the
 * platform) or rejects (REJECTED — refunded to the wallet).
 */
export const withdrawalRequests = pgTable(
  'withdrawal_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    walletType: walletTypeEnum('wallet_type').notNull().default('WITHDRAWAL'),
    amountCents: integer('amount_cents').notNull(),
    status: withdrawalStatusEnum('status').notNull().default('PENDING'),
    /** Admin who approved/rejected. null while PENDING. */
    adminId: uuid('admin_id').references((): any => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** On-chain payout reference (USDT TRC20 txid) recorded by the admin when the manual payout is sent. */
    payoutTxid: text('payout_txid'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('withdrawal_user_idx').on(t.userId),
    index('withdrawal_status_idx').on(t.status),
  ],
);

/**
 * Crypto payments (Pay2Crypto). One row per invoice created against the
 * gateway. PENDING → PAID on the confirmation webhook (ACTIVATION activates
 * the membership, DEPOSIT credits the COPINEX wallet). `paymentRef` is the
 * join key the gateway echoes back; `gatewayTxid` is the checkout reference.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    purpose: paymentPurposeEnum('purpose').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USDT'),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    /** Merchant-side reference echoed by the gateway (join key for webhooks). */
    paymentRef: text('payment_ref').notNull(),
    /** Pay2Crypto checkout reference (txid from /invoices/create). */
    gatewayTxid: text('gateway_txid'),
    /** Hosted checkout URL returned by the gateway. */
    paymentUrl: text('payment_url'),
    /** On-chain transaction hash from the confirmation webhook. */
    txHash: text('tx_hash'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_user_idx').on(t.userId),
    uniqueIndex('payments_ref_idx').on(t.paymentRef),
    index('payments_status_idx').on(t.status),
  ],
);

/** The 20% upline commission payouts generated by monthly profit. */
export const investmentCommissions = pgTable(
  'investment_commissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    investmentId: uuid('investment_id')
      .notNull()
      .references(() => investments.id),
    period: text('period').notNull(), // 'M2026-10'
    payerUserId: uuid('payer_user_id')
      .notNull()
      .references(() => users.id),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id),
    level: integer('level').notNull(), // 1 = direct sponsor
    amountCents: integer('amount_cents').notNull(),
    status: payoutStatusEnum('status').notNull().default('PAID'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('investment_commissions_period_recipient_idx').on(
      t.investmentId,
      t.period,
      t.recipientId,
    ),
    index('investment_commissions_recipient_idx').on(t.recipientId),
  ],
);

// ── PAMM Service ───────────────────────────────────────

/**
 * Partner brokers offering PAMM accounts. Admin-managed directory.
 * `pammLink` is the broker's private PAMM link the client is redirected to
 * after requesting a connection; the investment happens broker-side.
 */
export const brokers = pgTable(
  'brokers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    code: text('code').notNull(), // 'PU' | 'DV' — displayed on the card
    pammLink: text('pamm_link').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('brokers_code_idx').on(t.code)],
);

/**
 * A client's PAMM connection request. Status stays REQUESTED after the
 * redirect; LINKED is reserved for when broker-side confirmation exists.
 */
export const pammConnections = pgTable(
  'pamm_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    brokerId: uuid('broker_id')
      .notNull()
      .references(() => brokers.id),
    status: pammConnectionStatusEnum('status').notNull().default('REQUESTED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pamm_connections_user_idx').on(t.userId),
    index('pamm_connections_broker_idx').on(t.brokerId),
  ],
);