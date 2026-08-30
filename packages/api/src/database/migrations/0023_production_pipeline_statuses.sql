-- production-pipeline phase 1: the workflow statuses and the fulfilment tier.
--
-- ADD VALUE statements and NOTHING else, deliberately.
--
-- `drizzle-kit migrate` wraps the whole pending batch in ONE transaction, and
-- Postgres refuses any use of a value added by `ALTER TYPE ... ADD VALUE` in
-- that same transaction: `unsafe use of new value "x" of enum type y`. Note
-- that splitting the ADD VALUE and its first use across two migration FILES
-- does not help — on a fresh database both files are in the same batch. That is
-- #580, and 0018:1-12 is the write-up.
--
-- So: no backfill here, no index predicate, no CHECK constraint. Retiring
-- `sent` on existing rows is a SCRIPT that runs after this batch commits
-- (#675). `sent` itself STAYS in the type: dropping an enum value means
-- recreating the type and rewriting every dependent column, and rows still
-- carry it until that script runs. Its retirement is enforced by the transition
-- matrix giving it zero in-edges and zero out-edges (#676).
--
-- No CHECK constraint enforces the state machine either. Zero CHECKs exist in
-- this repo, and tests/database/raw-sql-objects.test.ts scans migrations only
-- for FUNCTION|TRIGGER|POLICY — so one added here would be silently absent from
-- every database somebody builds with `db:push`, which is the exact shape of
-- #663. The chokepoint is `assertTransition`, in code, covered by tests.
--
-- BEFORE places each value in workflow order rather than appending it, so the
-- enum's sort order still reads as the sequence of work and matches the drizzle
-- DSL array. `qc_passed` and `cancelled` are pre-existing values, so naming
-- them here is a catalog lookup, not a use of anything new.

-- Work finished, shot list uploaded, blocked on us: the whole admin QC queue.
ALTER TYPE "public"."production_job_status" ADD VALUE 'qc_submitted' BEFORE 'qc_passed';--> statement-breakpoint
-- This vendor's custody ended. One value, not two: parcel-to-next-vendor and
-- parcel-to-courier are the same fact about the job.
ALTER TYPE "public"."production_job_status" ADD VALUE 'dispatched' BEFORE 'cancelled';--> statement-breakpoint
-- Appended, not positioned: the audit tiers have no workflow order to preserve.
ALTER TYPE "public"."audit_category" ADD VALUE 'fulfilment';
