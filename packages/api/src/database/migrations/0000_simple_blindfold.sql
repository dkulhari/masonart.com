CREATE TYPE "public"."frame_type" AS ENUM('none', 'black', 'white', 'wood', 'walnut', 'oak', 'gold', 'silver');--> statement-breakpoint
CREATE TYPE "public"."orientation" AS ENUM('square', 'portrait', 'landscape', 'panoramic', 'round');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_subscription_tier" AS ENUM('free', 'premium', 'unlimited');--> statement-breakpoint
CREATE TYPE "public"."trade_account_type" AS ENUM('interior-designer', 'architect', 'staging-company', 'hospitality', 'office-designer', 'art-consultant', 'other');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('none', 'pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'trade', 'admin', 'super-admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended', 'pending-verification');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'pending_payment', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refund_requested', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('regular', 'ai_generated', 'trade');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'processing', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_aspect_ratio" AS ENUM('square', 'portrait', 'landscape', 'panoramic');--> statement-breakpoint
CREATE TYPE "public"."ai_gallery_visibility" AS ENUM('private', 'public', 'unlisted');--> statement-breakpoint
CREATE TYPE "public"."ai_generation_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_model_provider" AS ENUM('stable-diffusion', 'dall-e-3', 'midjourney', 'fal-ai', 'gemini');--> statement-breakpoint
CREATE TYPE "public"."ai_moderation_status" AS ENUM('pending_review', 'approved', 'rejected', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."ai_style_preset" AS ENUM('wabi-sabi', 'abstract-expression', 'botanical', 'geometric-modern', 'vintage-poster', 'pop-art', 'watercolor', 'photography', 'line-art', 'typography', 'ink-wash', 'digital-art', 'minimalist-modern', 'impressionist', 'art-deco');--> statement-breakpoint
CREATE TYPE "public"."ai_rejection_category" AS ENUM('nsfw', 'violence', 'hate_speech', 'copyright', 'illegal_content', 'spam', 'low_quality', 'other');--> statement-breakpoint
CREATE TYPE "public"."ai_review_action" AS ENUM('approved', 'rejected', 'flagged', 'escalated', 'appealed', 'appeal_approved', 'appeal_rejected');--> statement-breakpoint
CREATE TYPE "public"."wallet_transaction_status" AS ENUM('pending', 'completed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."wallet_transaction_type" AS ENUM('credit', 'debit', 'refund', 'bonus', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'label_created', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_type" AS ENUM('full', 'partial', 'store_credit');--> statement-breakpoint
CREATE TYPE "public"."return_reason" AS ENUM('defective', 'wrong_item', 'not_as_described', 'changed_mind', 'other');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('pending', 'approved', 'rejected', 'shipped_back', 'received', 'refunded', 'closed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('order_confirmation', 'shipped', 'out_for_delivery', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."approval_author_type" AS ENUM('admin', 'customer');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending_upload', 'pending_approval', 'changes_requested', 'approved', 'expired');--> statement-breakpoint
CREATE TABLE "frames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "frame_type" NOT NULL,
	"description" text,
	"material" text,
	"thickness" numeric(4, 2),
	"color" text,
	"price_modifier" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"price_addition" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"image_url" text,
	"thumbnail_url" text,
	"available_sizes" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"size_label" text NOT NULL,
	"width_inches" integer NOT NULL,
	"height_inches" integer NOT NULL,
	"width_cm" integer,
	"height_cm" integer,
	"price" numeric(10, 2) NOT NULL,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"is_in_stock" boolean DEFAULT true NOT NULL,
	"variant_sku" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"base_price" numeric(10, 2) NOT NULL,
	"styles" text[],
	"subjects" text[],
	"colors" text[],
	"rooms" text[],
	"tags" text[],
	"orientation" "orientation" NOT NULL,
	"artist_id" uuid,
	"images" jsonb DEFAULT '[]'::jsonb,
	"seo_title" text,
	"seo_description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"featured_order" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"ai_generation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text DEFAULT 'both' NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"address_line_1" text NOT NULL,
	"address_line_2" text,
	"landmark" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "trade_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"business_name" text NOT NULL,
	"business_type" "trade_account_type" NOT NULL,
	"website" text,
	"tax_id" text,
	"registration_number" text,
	"portfolio_urls" text[],
	"years_in_business" integer,
	"estimated_monthly_volume" text,
	"notes" text,
	"status" "trade_status" DEFAULT 'pending' NOT NULL,
	"discount_percentage" integer,
	"payment_terms" text,
	"reviewer_notes" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"trade_status" "trade_status" DEFAULT 'none' NOT NULL,
	"ai_credits_remaining" integer DEFAULT 5 NOT NULL,
	"ai_subscription_tier" "ai_subscription_tier" DEFAULT 'free',
	"wallet_balance_paise" integer DEFAULT 0 NOT NULL,
	"free_generations_remaining" integer DEFAULT 3 NOT NULL,
	"total_wallet_top_ups_paise" integer DEFAULT 0 NOT NULL,
	"total_wallet_spent_paise" integer DEFAULT 0 NOT NULL,
	"notification_preferences" jsonb DEFAULT '{"email":true,"sms":false,"push":true,"whatsapp":false,"enabledCategories":["order-updates","new-arrivals"],"followedArtistIds":[]}'::jsonb,
	"wishlist_product_ids" text[] DEFAULT '{}',
	"default_address_id" uuid,
	"default_payment_method_id" uuid,
	"last_login_at" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"frame_id" uuid,
	"snapshot" jsonb NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"frame_price" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"item_discount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"ai_generation_id" uuid,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"customizations" jsonb,
	"is_fulfilled" boolean DEFAULT false NOT NULL,
	"fulfilled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"user_id" text,
	"guest_email" text,
	"guest_phone" text,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"order_type" "order_type" DEFAULT 'regular' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"payment_details" jsonb,
	"shipping_address" jsonb NOT NULL,
	"billing_address_id" uuid,
	"shipping_details" jsonb,
	"shipping_method" text,
	"shipping_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"coupon_code" text,
	"coupon_discount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"trade_discount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"customer_notes" text,
	"internal_notes" text,
	"tracking_token" text,
	"tracking_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"shipped_at" timestamp,
	"delivered_at" timestamp,
	"cancelled_at" timestamp,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_tracking_token_unique" UNIQUE("tracking_token")
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"frame_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"frame_price" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"ai_generation_id" uuid,
	"ai_details" jsonb,
	"customizations" jsonb,
	"is_reserved" boolean DEFAULT false NOT NULL,
	"reserved_until" timestamp,
	"is_saved_for_later" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"session_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"coupon_code" text,
	"coupon_discount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"last_activity_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_banned_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" text NOT NULL,
	"is_regex" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"category" text,
	"severity" text DEFAULT 'high' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generation_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"session_id" text,
	"prompt_details" jsonb NOT NULL,
	"prompt_text" text NOT NULL,
	"style_preset" "ai_style_preset" NOT NULL,
	"aspect_ratio" "ai_aspect_ratio" NOT NULL,
	"status" "ai_generation_status" DEFAULT 'queued' NOT NULL,
	"model_provider" "ai_model_provider" DEFAULT 'stable-diffusion' NOT NULL,
	"model_version" text,
	"model_config" jsonb,
	"images" jsonb DEFAULT '[]'::jsonb,
	"variation_count" integer DEFAULT 4 NOT NULL,
	"selected_image_id" text,
	"selected_image_url" text,
	"visibility" "ai_gallery_visibility" DEFAULT 'private' NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"is_purchased" boolean DEFAULT false NOT NULL,
	"product_id" uuid,
	"order_id" uuid,
	"moderation_result" jsonb,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"moderation_status" "ai_moderation_status" DEFAULT 'pending_review' NOT NULL,
	"moderated_at" timestamp,
	"moderated_by" text,
	"rejection_reason" text,
	"rejection_category" text,
	"processing_time_ms" integer,
	"error_message" text,
	"error_code" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"estimated_cost" integer,
	"actual_cost" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"queued_at" timestamp,
	"processing_started_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp
);
--> statement-breakpoint
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
CREATE TABLE "ai_usage_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"period_type" text DEFAULT 'day' NOT NULL,
	"generations_count" integer DEFAULT 0 NOT NULL,
	"successful_generations" integer DEFAULT 0 NOT NULL,
	"failed_generations" integer DEFAULT 0 NOT NULL,
	"total_cost" integer DEFAULT 0 NOT NULL,
	"generations_limit" integer NOT NULL,
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
CREATE TABLE "wallet_pricing_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value_int" integer NOT NULL,
	"description" text,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_pricing_config_unique_key_effective" UNIQUE("key","effective_from")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "wallet_transaction_type" NOT NULL,
	"status" "wallet_transaction_status" DEFAULT 'pending' NOT NULL,
	"amount_paise" integer NOT NULL,
	"balance_after_paise" integer NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"ai_generation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"order_item_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"moderator_id" text,
	"moderator_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shipping_option_id" uuid,
	"tracking_number" varchar(100),
	"carrier" varchar(100) NOT NULL,
	"tracking_url" varchar(500),
	"status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"shipped_at" timestamp,
	"estimated_delivery_at" timestamp,
	"delivered_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"carrier" varchar(100) NOT NULL,
	"description" text,
	"base_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"estimated_days_min" integer NOT NULL,
	"estimated_days_max" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"days_allowed" integer NOT NULL,
	"condition_required" varchar(255),
	"refund_type" "refund_type" DEFAULT 'full' NOT NULL,
	"refund_percentage" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"reason" "return_reason" NOT NULL,
	"reason_details" text,
	"status" "return_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"processed_at" timestamp,
	"refund_amount" numeric(10, 2),
	"admin_notes" text,
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
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address" ADD CONSTRAINT "address_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_application" ADD CONSTRAINT "trade_application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_application" ADD CONSTRAINT "trade_application_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_frame_id_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."frames"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_billing_address_id_address_id_fk" FOREIGN KEY ("billing_address_id") REFERENCES "public"."address"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_frame_id_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."frames"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_banned_prompts" ADD CONSTRAINT "ai_banned_prompts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_likes" ADD CONSTRAINT "ai_generation_likes_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_likes" ADD CONSTRAINT "ai_generation_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_moderated_by_user_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_tracking" ADD CONSTRAINT "ai_usage_tracking_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_color_palettes" ADD CONSTRAINT "user_color_palettes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_reviews" ADD CONSTRAINT "ai_generation_reviews_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_reviews" ADD CONSTRAINT "ai_generation_reviews_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_pricing_config" ADD CONSTRAINT "wallet_pricing_config_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_ai_generation_id_ai_generations_id_fk" FOREIGN KEY ("ai_generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderator_id_user_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD CONSTRAINT "order_shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD CONSTRAINT "order_shipments_shipping_option_id_shipping_options_id_fk" FOREIGN KEY ("shipping_option_id") REFERENCES "public"."shipping_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_comments" ADD CONSTRAINT "approval_comments_approval_id_production_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."production_approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_photos" ADD CONSTRAINT "approval_photos_approval_id_production_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."production_approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_approvals" ADD CONSTRAINT "production_approvals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_approvals" ADD CONSTRAINT "production_approvals_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frames_type_idx" ON "frames" USING btree ("type");--> statement-breakpoint
CREATE INDEX "frames_active_idx" ON "frames" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "frames_sort_order_idx" ON "frames" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_sort_order_idx" ON "product_variants" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_featured_idx" ON "products" USING btree ("is_featured","featured_order");--> statement-breakpoint
CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_provider_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "address_user_id_idx" ON "address" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "address_default_idx" ON "address" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_token_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "trade_application_user_id_idx" ON "trade_application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_application_status_idx" ON "trade_application" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trade_application_submitted_at_idx" ON "trade_application" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_status_idx" ON "user" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_trade_status_idx" ON "user" USING btree ("trade_status");--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_id_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_guest_email_idx" ON "orders" USING btree ("guest_email");--> statement-breakpoint
CREATE INDEX "orders_tracking_token_idx" ON "orders" USING btree ("tracking_token");--> statement-breakpoint
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_items_product_id_idx" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "cart_items_frame_id_idx" ON "cart_items" USING btree ("frame_id");--> statement-breakpoint
CREATE INDEX "cart_items_saved_for_later_idx" ON "cart_items" USING btree ("cart_id","is_saved_for_later");--> statement-breakpoint
CREATE INDEX "cart_items_reserved_until_idx" ON "cart_items" USING btree ("reserved_until");--> statement-breakpoint
CREATE INDEX "carts_user_id_idx" ON "carts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "carts_session_id_idx" ON "carts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "carts_active_idx" ON "carts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "carts_expires_at_idx" ON "carts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "carts_last_activity_at_idx" ON "carts" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "ai_banned_prompts_active_idx" ON "ai_banned_prompts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ai_banned_prompts_category_idx" ON "ai_banned_prompts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "ai_generation_likes_generation_id_idx" ON "ai_generation_likes" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "ai_generation_likes_user_id_idx" ON "ai_generation_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_generation_likes_unique_idx" ON "ai_generation_likes" USING btree ("generation_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_generations_user_id_idx" ON "ai_generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_generations_session_id_idx" ON "ai_generations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ai_generations_status_idx" ON "ai_generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_generations_style_preset_idx" ON "ai_generations" USING btree ("style_preset");--> statement-breakpoint
CREATE INDEX "ai_generations_visibility_idx" ON "ai_generations" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "ai_generations_created_at_idx" ON "ai_generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_is_purchased_idx" ON "ai_generations" USING btree ("is_purchased");--> statement-breakpoint
CREATE INDEX "ai_generations_product_id_idx" ON "ai_generations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "ai_generations_public_gallery_idx" ON "ai_generations" USING btree ("visibility","status","likes_count");--> statement-breakpoint
CREATE INDEX "ai_generations_needs_review_idx" ON "ai_generations" USING btree ("needs_review","is_flagged");--> statement-breakpoint
CREATE INDEX "ai_generations_moderation_status_idx" ON "ai_generations" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "ai_prompt_suggestions_style_preset_idx" ON "ai_prompt_suggestions" USING btree ("style_preset");--> statement-breakpoint
CREATE INDEX "ai_prompt_suggestions_source_idx" ON "ai_prompt_suggestions" USING btree ("source");--> statement-breakpoint
CREATE INDEX "ai_prompt_suggestions_active_idx" ON "ai_prompt_suggestions" USING btree ("is_active","style_preset");--> statement-breakpoint
CREATE INDEX "ai_usage_tracking_user_id_idx" ON "ai_usage_tracking" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_tracking_period_idx" ON "ai_usage_tracking" USING btree ("user_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "ai_usage_tracking_period_type_idx" ON "ai_usage_tracking" USING btree ("period_type");--> statement-breakpoint
CREATE INDEX "user_color_palettes_user_id_idx" ON "user_color_palettes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_color_palettes_is_default_idx" ON "user_color_palettes" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "ai_generation_reviews_generation_id_idx" ON "ai_generation_reviews" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "ai_generation_reviews_reviewer_id_idx" ON "ai_generation_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "ai_generation_reviews_action_idx" ON "ai_generation_reviews" USING btree ("action");--> statement-breakpoint
CREATE INDEX "ai_generation_reviews_created_at_idx" ON "ai_generation_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallet_pricing_config_key_idx" ON "wallet_pricing_config" USING btree ("key");--> statement-breakpoint
CREATE INDEX "wallet_pricing_config_effective_idx" ON "wallet_pricing_config" USING btree ("effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "wallet_transactions_user_id_idx" ON "wallet_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "wallet_transactions_status_idx" ON "wallet_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wallet_transactions_razorpay_order_idx" ON "wallet_transactions" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_razorpay_payment_idx" ON "wallet_transactions" USING btree ("razorpay_payment_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_ai_generation_idx" ON "wallet_transactions" USING btree ("ai_generation_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_created_at_idx" ON "wallet_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallet_transactions_user_type_status_idx" ON "wallet_transactions" USING btree ("user_id","type","status");--> statement-breakpoint
CREATE INDEX "reviews_product_id_idx" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "reviews_user_id_idx" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reviews_order_item_id_idx" ON "reviews" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reviews_created_at_idx" ON "reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reviews_product_status_idx" ON "reviews" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "order_shipments_order_id_idx" ON "order_shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_shipments_status_idx" ON "order_shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_shipments_tracking_number_idx" ON "order_shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "shipping_options_is_active_idx" ON "shipping_options" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "shipping_options_sort_order_idx" ON "shipping_options" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "return_policies_is_active_idx" ON "return_policies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "return_requests_order_id_idx" ON "return_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "return_requests_user_id_idx" ON "return_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "return_requests_status_idx" ON "return_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "return_requests_requested_at_idx" ON "return_requests" USING btree ("requested_at");--> statement-breakpoint
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
CREATE INDEX "production_approvals_deadline_idx" ON "production_approvals" USING btree ("deadline_at");