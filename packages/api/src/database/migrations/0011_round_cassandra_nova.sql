ALTER TYPE "public"."order_type" ADD VALUE 'gift_card';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gift_card_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;