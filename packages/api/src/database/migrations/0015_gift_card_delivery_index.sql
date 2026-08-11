-- Index the gift card delivery sweep's query; drop the index it no longer uses.
--
-- Hand-written rather than generated: drizzle-kit's snapshot is behind at 0013
-- (0014 is hand-written too), so `generate` would bundle unrelated frame
-- changes into this migration.
--
-- Nothing reads gift_card.send_at. The sweep was expected to ask gift_card
-- what was due; minting then moved to delivery time, so a scheduled card does
-- not exist yet at the moment the sweep looks for it.
DROP INDEX IF EXISTS "gift_card_send_at_idx";--> statement-breakpoint
-- What the sweep actually runs is a scan of orders every five minutes, looking
-- for paid gift card orders with no card behind them. Partial, because gift
-- card orders are a fraction of a percent of the largest table in the system.
-- The send date stays out of the index: (gift_card_purchase ->> 'sendAt')
-- ::timestamptz is STABLE, not IMMUTABLE, and Postgres rejects it outright.
-- Measured at 200k orders: 17.1ms sequential scan to 6.3ms bitmap scan, 48kB.
CREATE INDEX IF NOT EXISTS "orders_gift_card_delivery_idx" ON "orders" USING btree ("id") WHERE "orders"."order_type" = 'gift_card' AND "orders"."payment_status" = 'paid';
