CREATE TYPE "public"."countdown_mode" AS ENUM('real', 'rolling');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."promotion_scope" AS ENUM('all', 'filter', 'products');--> statement-breakpoint
CREATE TABLE "promotion_exclusion" (
	"promotion_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "promotion_exclusion_promotion_id_product_id_pk" PRIMARY KEY("promotion_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "promotion_product" (
	"promotion_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "promotion_product_promotion_id_product_id_pk" PRIMARY KEY("promotion_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "promotion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"headline" text NOT NULL,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"scope_type" "promotion_scope" NOT NULL,
	"scope_filter" jsonb,
	"members_only" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"per_customer_order_limit" integer,
	"countdown_mode" "countdown_mode" DEFAULT 'rolling' NOT NULL,
	"rolling_window_minutes" integer DEFAULT 720 NOT NULL,
	"rolling_jitter_minutes" integer DEFAULT 90 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promotion_exclusion" ADD CONSTRAINT "promotion_exclusion_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_exclusion" ADD CONSTRAINT "promotion_exclusion_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_product" ADD CONSTRAINT "promotion_product_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_product" ADD CONSTRAINT "promotion_product_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promotion_exclusion_product_idx" ON "promotion_exclusion" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "promotion_product_product_idx" ON "promotion_product" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "promotion_active_idx" ON "promotion" USING btree ("is_enabled","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "promotion_priority_idx" ON "promotion" USING btree ("priority");