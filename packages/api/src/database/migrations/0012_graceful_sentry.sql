DROP INDEX "gift_card_purchase_order_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gift_card_purchase" jsonb;--> statement-breakpoint
ALTER TABLE "gift_card" ADD CONSTRAINT "gift_card_purchase_order_id_unique" UNIQUE("purchase_order_id");