-- Phase 1 of the vendor-management feature: the vendor directory, the
-- production job pipeline, and the link that says which vendor a vendor-role
-- user belongs to. Nine tables, five enums, one new user_role value.
--
-- Hand-assembled from drizzle-kit's own DDL rather than emitted by
-- `db:generate`. The snapshot history in meta/ stops at 0013 while migrations
-- run to 0018 (0014-0018 were hand-written), so a generate here would replay
-- five migrations' worth of unrelated drift -- including a frame_type ->
-- frame_category rename prompt -- against a database shared by other work.
-- Every statement below is additive: no DROP, no TRUNCATE, no ALTER COLUMN.
--
-- ALTER TYPE ... ADD VALUE is safe inside drizzle's single transaction on
-- PG12+ because nothing here *uses* 'vendor' as a literal; see 0018's note on
-- how that bit 0015.
ALTER TYPE "public"."user_role" ADD VALUE 'vendor';--> statement-breakpoint
CREATE TYPE "public"."vendor_capability_kind" AS ENUM('print', 'frame');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."production_job_stage" AS ENUM('print', 'frame');--> statement-breakpoint
CREATE TYPE "public"."production_job_status" AS ENUM('draft', 'assigned', 'sent', 'received', 'qc_passed', 'qc_failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."production_job_verdict" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "vendor_status" DEFAULT 'active' NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'IN',
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "vendor_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"contact_role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "vendor_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"kind" "vendor_capability_kind" NOT NULL,
	"max_width_inches" integer,
	"max_height_inches" integer,
	"finishes" text[],
	"stated_turnaround_days" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "vendor_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"kind" "vendor_capability_kind" NOT NULL,
	"longest_edge_min_inches" integer NOT NULL,
	"longest_edge_max_inches" integer NOT NULL,
	"finish" text,
	"amount" numeric(10, 2) NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "vendor_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reference" text,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "production_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stage" "production_job_stage" NOT NULL,
	"vendor_id" uuid,
	"status" "production_job_status" DEFAULT 'draft' NOT NULL,
	"assigned_at" timestamp,
	"sent_at" timestamp,
	"due_at" timestamp,
	"received_at" timestamp,
	"amount_expected" numeric(10, 2),
	"amount_actual" numeric(10, 2),
	"settlement_id" uuid,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "production_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_job_items_job_item_unique" UNIQUE("job_id","order_item_id")
);--> statement-breakpoint
CREATE TABLE "production_job_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"reviewer_id" text,
	"verdict" "production_job_verdict" NOT NULL,
	"defects" text[],
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "vendor_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_users_user_id_unique" UNIQUE("user_id")
);--> statement-breakpoint
ALTER TABLE "vendor_capabilities" ADD CONSTRAINT "vendor_capabilities_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_items" ADD CONSTRAINT "production_job_items_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_items" ADD CONSTRAINT "production_job_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_reviews" ADD CONSTRAINT "production_job_reviews_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_reviews" ADD CONSTRAINT "production_job_reviews_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_settlement_id_vendor_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."vendor_settlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_users" ADD CONSTRAINT "vendor_users_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_users" ADD CONSTRAINT "vendor_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_capabilities_vendor_id_idx" ON "vendor_capabilities" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_capabilities_kind_idx" ON "vendor_capabilities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "vendor_contacts_vendor_id_idx" ON "vendor_contacts" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_rates_vendor_id_idx" ON "vendor_rates" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_rates_lookup_idx" ON "vendor_rates" USING btree ("vendor_id","kind","effective_from");--> statement-breakpoint
CREATE INDEX "vendors_status_idx" ON "vendors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendors_name_idx" ON "vendors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "production_job_items_job_id_idx" ON "production_job_items" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "production_job_items_order_item_id_idx" ON "production_job_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "production_job_reviews_job_id_idx" ON "production_job_reviews" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "production_job_reviews_created_at_idx" ON "production_job_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "production_jobs_order_id_idx" ON "production_jobs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "production_jobs_vendor_id_idx" ON "production_jobs" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "production_jobs_status_idx" ON "production_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_jobs_stage_idx" ON "production_jobs" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "production_jobs_settlement_idx" ON "production_jobs" USING btree ("vendor_id","settlement_id");--> statement-breakpoint
CREATE INDEX "vendor_settlements_vendor_id_idx" ON "vendor_settlements" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_settlements_paid_at_idx" ON "vendor_settlements" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "vendor_users_vendor_id_idx" ON "vendor_users" USING btree ("vendor_id");
