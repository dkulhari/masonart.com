-- A gift card can be bought in the same cart as a poster.
--
-- Hand-written, as 0014-0016 were: drizzle-kit's snapshot is behind at 0013,
-- so `generate` would bundle unrelated frame changes into this file.

-- A cart line says what it is, rather than being inferred from the product
-- behind it. Every existing row is a product line.
CREATE TYPE "public"."cart_line_type" AS ENUM('product', 'gift_card');--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "line_type" "cart_line_type" DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "gift_card_purchase" jsonb;--> statement-breakpoint
-- A gift card line has no product and no variant. The alternative was dummy
-- catalogue rows, which would then need excluding by hand from listing,
-- facets, search, the sitemap and the sale resolver.
ALTER TABLE "cart_items" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ALTER COLUMN "variant_id" DROP NOT NULL;--> statement-breakpoint

-- The purchase moves onto the line for a mixed order. orders.gift_card_purchase
-- stays for the standalone /gift-cards flow, which creates an order with no
-- line items at all.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "gift_card_purchase" jsonb;--> statement-breakpoint

-- Minting idempotency moves down a level, from the order to the line.
--
-- One card per order was the guarantee only while a gift card had to be an
-- order of its own. Both constraints below exist at once: the unique column
-- for lines, and a PARTIAL unique index for orders whose purchase is on the
-- order itself. Dropping the old blanket unique without the partial one would
-- silently remove the protection from every card bought before this migration.
ALTER TABLE "gift_card" ADD COLUMN IF NOT EXISTS "purchase_order_item_id" uuid;--> statement-breakpoint
ALTER TABLE "gift_card" ADD CONSTRAINT "gift_card_purchase_order_item_id_order_items_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card" ADD CONSTRAINT "gift_card_purchase_order_item_id_unique" UNIQUE("purchase_order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gift_card_standalone_purchase_order_unique" ON "gift_card" USING btree ("purchase_order_id") WHERE "gift_card"."purchase_order_item_id" IS NULL;--> statement-breakpoint
-- Only now, with the replacement in place.
ALTER TABLE "gift_card" DROP CONSTRAINT IF EXISTS "gift_card_purchase_order_id_unique";
