ALTER TABLE "orders" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promotion_discount" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE set null ON UPDATE no action;