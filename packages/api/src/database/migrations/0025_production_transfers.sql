-- production-pipeline phase 1, last of it: inter-vendor transfers, order
-- consolidation, the job lifecycle columns, and one correction to #674 (#675).
--
-- Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §5
--
-- ## The transfer is its own entity
--
-- "A's job goes dispatched, B's job goes received" cannot express this, for
-- four reasons, the first fatal: in the consolidation case the rolled poster
-- has frame_id NULL, so VENDOR B HAS NO JOB FOR IT AT ALL — there is no second
-- row to move. Also one parcel carries several jobs; there is freight money
-- with nowhere to sit; and "lost" is a GAP in the record with no docket to
-- chase, which is not a state either status can hold.
--
-- ## Three things you will want to add below, and must not
--
-- 1. A TRANSFER STATUS ENUM. There is none, deliberately. State derives from
--    dispatched_at / received_at / lost_at, mirroring production_jobs' own
--    date-driven shape. Given the enum hazard in this repo (next paragraph), a
--    fourth transfer state next year then costs a nullable timestamp instead of
--    a migration nobody can apply.
--
-- 2. AN ENUM LITERAL, anywhere. 0023 added 'qc_submitted', 'dispatched' and
--    'fulfilment' with ALTER TYPE … ADD VALUE, and drizzle-kit migrate replays
--    the whole pending batch in ONE transaction — so on a fresh database a
--    literal here dies with "unsafe use of new value" even though 0023 is a
--    different file. That is #580; 0018:1-12 is the write-up, and
--    tests/database/migration-enum-literals.test.ts is the standing guard.
--    Note that "dispatched_at" below is a column NAME, not a value: nothing on
--    this page ever compares against the enum type.
--
--    This is exactly why retiring 'sent' on existing rows is a SCRIPT
--    (src/database/retire-sent-status.ts, run after this batch commits) and not
--    an UPDATE in this file.
--
-- 3. A CHECK CONSTRAINT. Zero exist in this repo, and
--    tests/database/raw-sql-objects.test.ts scans migrations only for
--    FUNCTION|TRIGGER|POLICY — so one added here would be silently absent from
--    any database built with db:push, the exact shape of #663. The invariants
--    worth having read OTHER rows anyway (a job on a transfer must belong to
--    from_vendor_id), and a trigger doing that under READ COMMITTED is a race
--    dressed as enforcement.
--
-- ## What each piece is for
--
-- production_transfer_jobs carries BOTH a composite primary key AND a unique
-- index on job_id alone, and the second is not redundant: (t1, j) and (t2, j)
-- are two perfectly good pairs, so without it one job rides two parcels and the
-- readiness gate can no longer say which leg it took. A job is on at most one
-- transfer, EVER — a lost transfer produces a REPLACEMENT job, linked by the
-- new production_jobs.replaces_job_id, so the original never needs a second.
--
-- cost_amount is numeric(10,2) INR, matching orders, products and vendor_rates.
-- NOT paise, NOT whole rupees — this repo has been bitten by that 100x before.
-- It is also not a payable: we chose the routing, so it never enters
-- sumPayable, and amount_expected vs amount_actual keeps meaning "negotiation
-- on the work".
--
-- order_consolidation is a TABLE, not a column on orders. That keeps a supplier
-- foreign key off the customer table and out of every wholesale select() of
-- orders. Its primary key is the constraint — exactly one consolidator per
-- order — and the ABSENCE of a row is meaningful: undecided, which the label
-- gate reads as a blocker. decided_by NULL means "system default".
--
-- ## settlement_id: set null -> restrict
--
-- The DROP/ADD pair below is a bug fix, not churn. Under ON DELETE set null,
-- deleting a settlement did not merely drop a pointer: the payables query is
--   SUM(COALESCE(amount_actual, amount_expected)) WHERE settlement_id IS NULL
-- so every job that settlement paid for silently reappeared as owed, with
-- nothing left in the record to say the money had already moved.
--
-- ## The two ALTER COLUMN statements on production_job_photos correct #674
--
-- uploaded_at and superseded_at landed as bare `timestamp`. Every column this
-- feature ADDS is timestamptz, because admin_audit_log.created_at already is
-- and a QC dispute reads a photo row and an audit row side by side — a server
-- timezone change must not pull them apart. The table is new and empty, so the
-- type change is free.
--
-- production_jobs' own five pre-existing date columns are NOT converted. That
-- is named debt (§11), and doing it here would rewrite a table that holds rows
-- for a reason nobody asked for in this ticket.

CREATE TABLE "order_consolidation" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_transfer_jobs" (
	"transfer_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	CONSTRAINT "production_transfer_jobs_transfer_id_job_id_pk" PRIMARY KEY("transfer_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "production_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_vendor_id" uuid NOT NULL,
	"to_vendor_id" uuid NOT NULL,
	"carrier" text,
	"reference" text,
	"piece_count" integer DEFAULT 1 NOT NULL,
	"cost_amount" numeric(10, 2),
	"dispatched_at" timestamp with time zone,
	"expected_by" timestamp with time zone,
	"received_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"lost_note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_jobs" DROP CONSTRAINT "production_jobs_settlement_id_vendor_settlements_id_fk";
--> statement-breakpoint
ALTER TABLE "production_job_photos" ALTER COLUMN "uploaded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_job_photos" ALTER COLUMN "uploaded_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "production_job_photos" ALTER COLUMN "superseded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "qc_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "replaces_job_id" uuid;--> statement-breakpoint
ALTER TABLE "order_consolidation" ADD CONSTRAINT "order_consolidation_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_consolidation" ADD CONSTRAINT "order_consolidation_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_consolidation" ADD CONSTRAINT "order_consolidation_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transfer_jobs" ADD CONSTRAINT "production_transfer_jobs_transfer_id_production_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."production_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transfer_jobs" ADD CONSTRAINT "production_transfer_jobs_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transfers" ADD CONSTRAINT "production_transfers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transfers" ADD CONSTRAINT "production_transfers_from_vendor_id_vendors_id_fk" FOREIGN KEY ("from_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transfers" ADD CONSTRAINT "production_transfers_to_vendor_id_vendors_id_fk" FOREIGN KEY ("to_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_transfers" ADD CONSTRAINT "production_transfers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_consolidation_vendor_id_idx" ON "order_consolidation" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_transfer_jobs_job_id_unique" ON "production_transfer_jobs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "production_transfers_order_id_idx" ON "production_transfers" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "production_transfers_from_vendor_id_idx" ON "production_transfers" USING btree ("from_vendor_id");--> statement-breakpoint
CREATE INDEX "production_transfers_to_vendor_id_idx" ON "production_transfers" USING btree ("to_vendor_id");--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_replaces_job_id_production_jobs_id_fk" FOREIGN KEY ("replaces_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_settlement_id_vendor_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."vendor_settlements"("id") ON DELETE restrict ON UPDATE no action;