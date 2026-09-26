CREATE TYPE "public"."pamm_connection_status" AS ENUM('REQUESTED', 'LINKED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"pamm_link" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pamm_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"broker_id" uuid NOT NULL,
	"status" "pamm_connection_status" DEFAULT 'REQUESTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pamm_connections" ADD CONSTRAINT "pamm_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pamm_connections" ADD CONSTRAINT "pamm_connections_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brokers_code_idx" ON "brokers" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pamm_connections_user_idx" ON "pamm_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pamm_connections_broker_idx" ON "pamm_connections" USING btree ("broker_id");
--> statement-breakpoint
-- PAMM link must be a usable URL (the redirect target).
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_pamm_link_nonempty" CHECK (length("pamm_link") > 0);