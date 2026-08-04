ALTER TYPE "public"."orientation" ADD VALUE 'set-of-2-3';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "vibe" text[];--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "aesthetic" text[];--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "medium" text[];--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "uniqueness" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "availability" text;