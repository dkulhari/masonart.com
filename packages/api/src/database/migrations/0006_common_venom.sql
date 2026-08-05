CREATE TYPE "public"."review_media_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TABLE "review_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"media_type" "review_media_type" NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"poster_url" text,
	"duration_seconds" integer,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"processing_status" "review_media_status" DEFAULT 'ready' NOT NULL,
	"processing_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_media_review_id_idx" ON "review_media" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "review_media_review_sort_idx" ON "review_media" USING btree ("review_id","sort_order");