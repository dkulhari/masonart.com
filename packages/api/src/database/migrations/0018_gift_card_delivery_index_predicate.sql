-- Bring already-migrated databases in line with the corrected 0015.
--
-- 0015 originally made the delivery index partial on
-- `order_type = 'gift_card'`. That value is added to the enum by 0011, and
-- drizzle-kit runs the whole batch in one transaction, so a FRESH database
-- could never apply the chain at all: `unsafe use of new value "gift_card" of
-- enum type order_type` (#580). A database migrated before that discovery has
-- the old index and would otherwise disagree with the schema forever.
--
-- Same rows either way: `gift_card_purchase IS NOT NULL` is the column the
-- standalone purchase lives on, and the sweep's WHERE clause carries that
-- conjunct, so the planner can still prove the predicate.
DROP INDEX IF EXISTS "orders_gift_card_delivery_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_gift_card_delivery_idx" ON "orders" USING btree ("id") WHERE "orders"."gift_card_purchase" IS NOT NULL AND "orders"."payment_status" = 'paid';
