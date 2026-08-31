-- order-dispatch-tracking phase 1: the states a real courier reports.
--
-- ADD VALUE statements and NOTHING else, deliberately.
--
-- `drizzle-kit migrate` wraps the whole pending batch in ONE transaction, and
-- Postgres refuses any use of a value added by `ALTER TYPE ... ADD VALUE` in
-- that same transaction: `unsafe use of new value "x" of enum type y`. Note
-- that splitting the ADD VALUE and its first use across two migration FILES
-- does not help — on a fresh database both files are in the same batch. That is
-- #580, 0023 is the precedent, and tests/database/migration-enum-literals.test.ts
-- is the guard that enforces it across every migration.
--
-- So: no backfill here, no index predicate, no CHECK constraint. The dispatch
-- COLUMNS are a separate migration for exactly this reason, and the backfill
-- that moves orders.shipping_details is a third — it uses only values that
-- came from the original CREATE TYPE, which are never blacklisted.
--
-- BEFORE places each value in lifecycle order rather than appending it, so the
-- type's `enumsortorder` still reads as the sequence of work and matches the
-- drizzle DSL array. `delivered` and `failed` are pre-existing values, so
-- naming them here is a catalog lookup, not a use of anything new.

-- An attempt failed and the courier is holding the parcel. Before `delivered`
-- because an NDR happens on a delivery ATTEMPT. NOT `failed`, which is the end
-- of the line rather than a state anybody can act on.
ALTER TYPE "public"."shipment_status" ADD VALUE 'undelivered' BEFORE 'delivered';--> statement-breakpoint
-- Going back to the pickup location, and arrived there. The pickup location is
-- the consolidating vendor's address, so an RTO parcel lands back with the
-- vendor who despatched it, not with us.
ALTER TYPE "public"."shipment_status" ADD VALUE 'rto_initiated' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."shipment_status" ADD VALUE 'rto_delivered' BEFORE 'failed';--> statement-breakpoint
-- The courier cannot account for it. Distinct from an RTO, where we know
-- exactly where the goods are.
ALTER TYPE "public"."shipment_status" ADD VALUE 'lost' BEFORE 'failed';--> statement-breakpoint
-- The LABEL is dead: voided, or the shipment cancelled. `failed` is a failed
-- DELIVERY and never meant this, which is why `lib/vendor-scope.ts` had to
-- guess the live label by recency — the table could not say which label a
-- courier would still honour.
ALTER TYPE "public"."shipment_status" ADD VALUE 'cancelled' BEFORE 'failed';
