CREATE TYPE "public"."withdrawal_status" AS ENUM('PENDING', 'PAID', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."bonus_type" ADD VALUE 'DEPOSIT';--> statement-breakpoint
ALTER TYPE "public"."bonus_type" ADD VALUE 'WITHDRAWAL';--> statement-breakpoint
ALTER TYPE "public"."bonus_type" ADD VALUE 'WITHDRAWAL_REFUND';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_type" "wallet_type" DEFAULT 'WITHDRAWAL' NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "withdrawal_status" DEFAULT 'PENDING' NOT NULL,
	"admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawal_user_idx" ON "withdrawal_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawal_status_idx" ON "withdrawal_requests" USING btree ("status");
--> statement-breakpoint
-- ── Phase 1: CHECK constraints (audit P1) ──────────────────────────────
-- Money can never go negative; amounts must be sane. Enforced at the DB,
-- not just the app layer.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_nonneg" CHECK ("balance_cents" >= 0);
--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_balance_nonneg" CHECK ("balance_cents" >= 0);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_amount_nonzero" CHECK ("amount_cents" <> 0);
--> statement-breakpoint
ALTER TABLE "fee_allocations" ADD CONSTRAINT "fee_alloc_buckets_nonneg" CHECK ("company_reserve_cents" >= 0 AND "direct_referral_pool_cents" >= 0 AND "generation_pool_cents" >= 0 AND "rank_pool_contribution_cents" >= 0 AND "leadership_pool_contribution_cents" >= 0);
--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_principal_min" CHECK ("principal_cents" >= 5000);
--> statement-breakpoint
ALTER TABLE "investment_packages" ADD CONSTRAINT "packages_range_check" CHECK ("min_amount_cents" > 0 AND ("max_amount_cents" IS NULL OR "max_amount_cents" >= "min_amount_cents"));
--> statement-breakpoint
ALTER TABLE "investment_packages" ADD CONSTRAINT "packages_rates_positive" CHECK ("monthly_rate_bps" > 0 AND "daily_rate_bps" > 0);
--> statement-breakpoint
ALTER TABLE "investment_earnings" ADD CONSTRAINT "earnings_amount_positive" CHECK ("amount_cents" > 0);
--> statement-breakpoint
ALTER TABLE "investment_commissions" ADD CONSTRAINT "commissions_amount_positive" CHECK ("amount_cents" > 0);
--> statement-breakpoint
ALTER TABLE "investment_commissions" ADD CONSTRAINT "commissions_level_range" CHECK ("level" BETWEEN 1 AND 6);
--> statement-breakpoint
ALTER TABLE "trading_settlements" ADD CONSTRAINT "settlements_shares_nonneg" CHECK ("realized_profit_cents" >= 0 AND "client_share_cents" >= 0 AND "sponsor_share_cents" >= 0 AND "company_share_cents" >= 0);
--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_amount_positive" CHECK ("amount_cents" > 0);
--> statement-breakpoint
-- The §2 five-bucket split must exactly account for the registration fee.
CREATE OR REPLACE FUNCTION enforce_fee_allocation_sum() RETURNS trigger AS $$
BEGIN
  IF NEW."company_reserve_cents" + NEW."direct_referral_pool_cents" + NEW."generation_pool_cents" + NEW."rank_pool_contribution_cents" + NEW."leadership_pool_contribution_cents" <> (SELECT "fee_cents" FROM "registrations" WHERE "id" = NEW."registration_id") THEN
    RAISE EXCEPTION 'fee allocation must sum to the registration fee';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "fee_allocation_sum_check" BEFORE INSERT OR UPDATE ON "fee_allocations" FOR EACH ROW EXECUTE FUNCTION enforce_fee_allocation_sum();