CREATE TYPE "public"."ai_moderation_status" AS ENUM('pending_review', 'approved', 'rejected', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."ai_rejection_category" AS ENUM('nsfw', 'violence', 'hate_speech', 'copyright', 'illegal_content', 'spam', 'low_quality', 'other');--> statement-breakpoint
CREATE TYPE "public"."ai_review_action" AS ENUM('approved', 'rejected', 'flagged', 'escalated', 'appealed', 'appeal_approved', 'appeal_rejected');--> statement-breakpoint
CREATE TABLE "ai_generation_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"reviewer_id" text,
	"action" "ai_review_action" NOT NULL,
	"reason" text,
	"category" "ai_rejection_category",
	"previous_status" text,
	"new_status" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "moderation_status" "ai_moderation_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "moderated_at" timestamp;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "moderated_by" text;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "rejection_category" text;--> statement-breakpoint
ALTER TABLE "ai_generation_reviews" ADD CONSTRAINT "ai_generation_reviews_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_reviews" ADD CONSTRAINT "ai_generation_reviews_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generation_reviews_generation_id_idx" ON "ai_generation_reviews" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "ai_generation_reviews_reviewer_id_idx" ON "ai_generation_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "ai_generation_reviews_action_idx" ON "ai_generation_reviews" USING btree ("action");--> statement-breakpoint
CREATE INDEX "ai_generation_reviews_created_at_idx" ON "ai_generation_reviews" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_moderated_by_user_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_moderation_status_idx" ON "ai_generations" USING btree ("moderation_status");