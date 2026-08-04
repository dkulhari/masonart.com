ALTER TABLE "products" ADD COLUMN "popular_order" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_popular" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "products_popular_idx" ON "products" USING btree ("is_popular","popular_order");