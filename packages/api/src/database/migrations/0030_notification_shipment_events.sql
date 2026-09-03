-- order-dispatch-tracking phase 9 (#733): the two courier outcomes a customer
-- has to hear about, as notification types.
--
-- ADD VALUE statements and NOTHING else, for the reason 0026 gives: `drizzle-kit
-- migrate` runs the pending batch in one transaction, and Postgres refuses any
-- use of a value added by ALTER TYPE ... ADD VALUE inside that transaction.
-- tests/database/migration-enum-literals.test.ts enforces it.
--
-- Appended, not positioned: the drizzle DSL array in schema/notifications.ts
-- lists them last, and enumsortorder has to match it.
--
-- An NDR: an attempt failed and the courier still holds the parcel. Somebody
-- has to act, usually the customer by being reachable.
-- An RTO: the parcel is coming back to the vendor who despatched it. A
-- different message, because the next step is a re-delivery or a refund.
ALTER TYPE "public"."notification_type" ADD VALUE 'delivery_attempt_failed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'returning_to_sender';