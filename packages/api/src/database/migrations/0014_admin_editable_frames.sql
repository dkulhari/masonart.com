-- Frames become admin-writable.
--
-- Hand-written rather than generated: drizzle-kit emits no backfill, and every
-- statement below depends on the one before it.

ALTER TABLE "frames" ADD COLUMN "category" text;--> statement-breakpoint
-- Backfill BEFORE the NOT NULL, or the seven seeded rows fail the constraint.
-- rolled and frameless are formats and map to themselves; every other value in
-- the old enum is a moulding around a stretched canvas, so it folds into framed.
UPDATE frames SET category = CASE "type"::text
  WHEN 'rolled'    THEN 'rolled'
  WHEN 'frameless' THEN 'frameless'
  ELSE 'framed'
END;--> statement-breakpoint
CREATE TYPE "public"."frame_category" AS ENUM('rolled', 'frameless', 'framed');--> statement-breakpoint
ALTER TABLE "frames" ALTER COLUMN "category" SET DATA TYPE "public"."frame_category" USING "category"::"public"."frame_category";--> statement-breakpoint
ALTER TABLE "frames" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "frames" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
-- Only now: Postgres refuses to drop a type a column still references.
DROP TYPE "public"."frame_type";--> statement-breakpoint
DROP INDEX IF EXISTS "frames_type_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "frames_type_idx" ON "frames" USING btree ("type");
