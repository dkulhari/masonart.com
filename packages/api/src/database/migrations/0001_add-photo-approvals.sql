CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('order_confirmation', 'shipped', 'out_for_delivery', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."approval_author_type" AS ENUM('admin', 'customer');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending_upload', 'pending_approval', 'changes_requested', 'approved', 'expired');--> statement-breakpoint
ALTER TYPE "public"."ai_style_preset" ADD VALUE 'ink-wash';--> statement-breakpoint
ALTER TYPE "public"."ai_style_preset" ADD VALUE 'digital-art';--> statement-breakpoint
ALTER TYPE "public"."ai_style_preset" ADD VALUE 'minimalist-modern';--> statement-breakpoint
ALTER TYPE "public"."ai_style_preset" ADD VALUE 'impressionist';--> statement-breakpoint
ALTER TYPE "public"."ai_style_preset" ADD VALUE 'art-deco';--> statement-breakpoint
CREATE TABLE "ai_prompt_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt" text NOT NULL,
	"style_preset" "ai_style_preset" NOT NULL,
	"color_mood" text,
	"source" text DEFAULT 'curated' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_color_palettes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"colors" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_order_confirmation" boolean DEFAULT true NOT NULL,
	"email_shipped" boolean DEFAULT true NOT NULL,
	"email_out_for_delivery" boolean DEFAULT true NOT NULL,
	"email_delivered" boolean DEFAULT true NOT NULL,
	"sms_order_confirmation" boolean DEFAULT false NOT NULL,
	"sms_shipped" boolean DEFAULT false NOT NULL,
	"sms_out_for_delivery" boolean DEFAULT false NOT NULL,
	"sms_delivered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"recipient_email" text,
	"recipient_phone" text,
	"sent_at" timestamp,
	"error_message" text,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_id" uuid NOT NULL,
	"author_type" "approval_author_type" NOT NULL,
	"author_id" text,
	"comment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_id" uuid NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"uploaded_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"status" "approval_status" DEFAULT 'pending_upload' NOT NULL,
	"approval_token" text NOT NULL,
	"token_expires_at" timestamp,
	"approved_at" timestamp,
	"approved_by" text,
	"deadline_at" timestamp,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_approvals_approval_token_unique" UNIQUE("approval_token")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_token" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_color_palettes" ADD CONSTRAINT "user_color_palettes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_comments" ADD CONSTRAINT "approval_comments_approval_id_production_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."production_approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_photos" ADD CONSTRAINT "approval_photos_approval_id_production_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."production_approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_approvals" ADD CONSTRAINT "production_approvals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_approvals" ADD CONSTRAINT "production_approvals_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_prompt_suggestions_style_preset_idx" ON "ai_prompt_suggestions" USING btree ("style_preset");--> statement-breakpoint
CREATE INDEX "ai_prompt_suggestions_source_idx" ON "ai_prompt_suggestions" USING btree ("source");--> statement-breakpoint
CREATE INDEX "ai_prompt_suggestions_active_idx" ON "ai_prompt_suggestions" USING btree ("is_active","style_preset");--> statement-breakpoint
CREATE INDEX "user_color_palettes_user_id_idx" ON "user_color_palettes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_color_palettes_is_default_idx" ON "user_color_palettes" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_order_id_idx" ON "notifications" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notifications_channel_idx" ON "notifications" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "approval_comments_approval_id_idx" ON "approval_comments" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX "approval_comments_created_at_idx" ON "approval_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "approval_photos_approval_id_idx" ON "approval_photos" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX "approval_photos_sort_order_idx" ON "approval_photos" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "production_approvals_order_id_idx" ON "production_approvals" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "production_approvals_order_item_id_idx" ON "production_approvals" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "production_approvals_status_idx" ON "production_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_approvals_token_idx" ON "production_approvals" USING btree ("approval_token");--> statement-breakpoint
CREATE INDEX "production_approvals_deadline_idx" ON "production_approvals" USING btree ("deadline_at");--> statement-breakpoint
CREATE INDEX "orders_tracking_token_idx" ON "orders" USING btree ("tracking_token");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_token_unique" UNIQUE("tracking_token");