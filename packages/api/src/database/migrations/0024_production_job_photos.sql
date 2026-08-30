-- production-pipeline phase 1: the QC photo table (#674).
--
-- One row per photograph a vendor uploads against the shot list in
-- `@chobii/shared/schemas/production-qc` (`QC_SHOT_LIST`). Design:
-- docs/superpowers/specs/2026-08-30-production-pipeline-design.md §7.
--
-- Three decisions are visible in the DDL below and worth naming here, because
-- the next person to touch this file will otherwise reach for all three:
--
-- 1. `slot` is `text`, not a new enum type. The vocabulary lives in the shared
--    package so the vendor portal and the API read one copy, and
--    `schema/shipping.ts` records that a VALUE import from that ESM-only
--    package inside `schema/` breaks `drizzle-kit generate` outright.
--
-- 2. The unique index is PARTIAL — `WHERE superseded_at IS NULL` — which is
--    what makes the table append-only AND still able to hold a reshoot. A
--    blanket unique would refuse the second upload to a slot, destroying the
--    rework history; no unique at all would let two photos both claim to be
--    the live shot. Precedent: `gift_card_standalone_purchase_order_unique`
--    in 0018.
--
--    The predicate deliberately names NO enum value. 0023 added
--    `qc_submitted`, `dispatched` and `fulfilment`, and `drizzle-kit migrate`
--    replays the whole pending batch in ONE transaction, so on a fresh
--    database a literal here would die with `unsafe use of new value` even
--    though it was added by a different file. That is #580, and
--    tests/database/migration-enum-literals.test.ts is the standing guard.
--
-- 3. `object_key`, never a URL. `approval_photos.url` is the counter-example:
--    a stored URL cannot be re-signed when it expires and places the object
--    outside the signing-scope allow-list, making the URL itself the
--    capability. Keys are built by `StoragePaths.productionQcPhoto` as
--    `production-qc/<jobId>/<slot>/<filename>`.
--
-- No CHECK constraint appears below, and none should. Zero exist in this repo,
-- and tests/database/raw-sql-objects.test.ts scans migrations only for
-- FUNCTION|TRIGGER|POLICY — so one added here would be silently absent from
-- any database somebody builds with `db:push`, which is the shape of #663.
--
-- `job_id` is ON DELETE CASCADE, which removes rows and leaves the R2 objects
-- orphaned forever. That is why the 400-day retention sweep calls
-- `deleteByPrefix('production-qc/<jobId>/')` BEFORE deleting rows.

CREATE TABLE "production_job_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"superseded_at" timestamp,
	"review_id" uuid
);
--> statement-breakpoint
ALTER TABLE "production_job_photos" ADD CONSTRAINT "production_job_photos_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_photos" ADD CONSTRAINT "production_job_photos_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_job_photos" ADD CONSTRAINT "production_job_photos_review_id_production_job_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."production_job_reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_job_photos_job_id_idx" ON "production_job_photos" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_job_photos_live_slot_unique" ON "production_job_photos" USING btree ("job_id","slot") WHERE "production_job_photos"."superseded_at" IS NULL;