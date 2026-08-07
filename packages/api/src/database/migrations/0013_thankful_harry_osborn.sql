CREATE TABLE "shipping_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value_int" integer NOT NULL,
	"description" text,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_config_unique_key_effective" UNIQUE("key","effective_from")
);
--> statement-breakpoint
ALTER TABLE "shipping_config" ADD CONSTRAINT "shipping_config_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_config_key_idx" ON "shipping_config" USING btree ("key");--> statement-breakpoint
CREATE INDEX "shipping_config_effective_idx" ON "shipping_config" USING btree ("effective_from","effective_to");