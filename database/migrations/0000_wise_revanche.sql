CREATE TYPE "public"."bonus_type" AS ENUM('DIRECT_REFERRAL_BONUS', 'GENERATION_BONUS_GEN2', 'GENERATION_BONUS_GEN3', 'GENERATION_BONUS_GEN4', 'GENERATION_BONUS_GEN5', 'GENERATION_BONUS_GEN6', 'RANK_MILESTONE', 'SPONSOR_OVERRIDE', 'TRADING_PROFIT_RETAINED', 'TRADING_PERFORMANCE_SHARE', 'INVESTMENT_DAILY_PROFIT', 'INVESTMENT_MONTHLY_PROFIT', 'UPLINE_INVESTMENT_COMMISSION');--> statement-breakpoint
CREATE TYPE "public"."earning_status" AS ENUM('LOCKED', 'AVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."investment_status" AS ENUM('ACTIVE', 'MATURED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('PAID', 'FLAGGED', 'REVIEW', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('MEMBER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('COPINEX', 'WITHDRAWAL');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bonus_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "bonus_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"source_registration_id" uuid NOT NULL,
	"generation" integer,
	"compressed" boolean DEFAULT false NOT NULL,
	"status" "payout_status" DEFAULT 'PAID' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"company_reserve_cents" integer NOT NULL,
	"direct_referral_pool_cents" integer NOT NULL,
	"generation_pool_cents" integer NOT NULL,
	"rank_pool_contribution_cents" integer NOT NULL,
	"leadership_pool_contribution_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investment_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" uuid NOT NULL,
	"period" text NOT NULL,
	"payer_user_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "payout_status" DEFAULT 'PAID' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investment_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "earning_status" DEFAULT 'LOCKED' NOT NULL,
	"credited_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investment_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" integer NOT NULL,
	"name" text NOT NULL,
	"min_amount_cents" integer NOT NULL,
	"max_amount_cents" integer,
	"monthly_rate_bps" integer NOT NULL,
	"daily_rate_bps" integer NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"principal_cents" integer NOT NULL,
	"status" "investment_status" DEFAULT 'ACTIVE' NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"accrual_end_date" timestamp with time zone NOT NULL,
	"available_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leadership_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rank_id" integer NOT NULL,
	"reward_sku" text NOT NULL,
	"status" "payout_status" DEFAULT 'REVIEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_type" "wallet_type" DEFAULT 'COPINEX' NOT NULL,
	"type" "bonus_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"balance_after_cents" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"balance_cents" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rank_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rank_id" integer NOT NULL,
	"reward_cents" integer NOT NULL,
	"status" "payout_status" DEFAULT 'PAID' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fee_cents" integer DEFAULT 5000 NOT NULL,
	"status" text DEFAULT 'PAID' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_volume" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_volume_cents" bigint DEFAULT 0 NOT NULL,
	"leg_volumes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trading_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"client_id" uuid NOT NULL,
	"realized_profit_cents" bigint NOT NULL,
	"client_share_cents" bigint NOT NULL,
	"sponsor_share_cents" bigint NOT NULL,
	"company_share_cents" bigint NOT NULL,
	"status" "settlement_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text,
	"sponsor_id" uuid,
	"placement_parent_id" uuid,
	"role" "user_role" DEFAULT 'MEMBER' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_activity_at" timestamp with time zone,
	"highest_associate_rank" integer DEFAULT 0 NOT NULL,
	"highest_leadership_rank" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_type" "wallet_type" DEFAULT 'COPINEX' NOT NULL,
	"balance_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bonus_payouts" ADD CONSTRAINT "bonus_payouts_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bonus_payouts" ADD CONSTRAINT "bonus_payouts_source_registration_id_registrations_id_fk" FOREIGN KEY ("source_registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_allocations" ADD CONSTRAINT "fee_allocations_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investment_commissions" ADD CONSTRAINT "investment_commissions_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investment_commissions" ADD CONSTRAINT "investment_commissions_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investment_commissions" ADD CONSTRAINT "investment_commissions_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investment_earnings" ADD CONSTRAINT "investment_earnings_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investment_earnings" ADD CONSTRAINT "investment_earnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investments" ADD CONSTRAINT "investments_package_id_investment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."investment_packages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leadership_rewards" ADD CONSTRAINT "leadership_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rank_milestones" ADD CONSTRAINT "rank_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_volume" ADD CONSTRAINT "team_volume_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trading_settlements" ADD CONSTRAINT "trading_settlements_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_sponsor_id_users_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_placement_parent_id_users_id_fk" FOREIGN KEY ("placement_parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonus_recipient_idx" ON "bonus_payouts" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonus_source_idx" ON "bonus_payouts" USING btree ("source_registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_alloc_registration_idx" ON "fee_allocations" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "investment_commissions_period_recipient_idx" ON "investment_commissions" USING btree ("investment_id","period","recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investment_commissions_recipient_idx" ON "investment_commissions" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "investment_earnings_period_idx" ON "investment_earnings" USING btree ("investment_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investment_earnings_user_idx" ON "investment_earnings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investment_earnings_status_idx" ON "investment_earnings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "investment_packages_tier_idx" ON "investment_packages" USING btree ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investments_user_idx" ON "investments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investments_status_idx" ON "investments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leadership_reward_user_rank_idx" ON "leadership_rewards" USING btree ("user_id","rank_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_user_created_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_source_idx" ON "ledger_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pools_name_idx" ON "pools" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rank_milestone_user_rank_idx" ON "rank_milestones" USING btree ("user_id","rank_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registrations_user_idx" ON "registrations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_volume_user_idx" ON "team_volume" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_period_client_idx" ON "trading_settlements" USING btree ("period","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_sponsor_idx" ON "users" USING btree ("sponsor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_placement_idx" ON "users" USING btree ("placement_parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_user_type_idx" ON "wallets" USING btree ("user_id","wallet_type");