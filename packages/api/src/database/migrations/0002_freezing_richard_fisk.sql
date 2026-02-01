ALTER TYPE "public"."ai_model_provider" ADD VALUE 'gemini';--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "order_item_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_order_item_id_idx" ON "reviews" USING btree ("order_item_id");