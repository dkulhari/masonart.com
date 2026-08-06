ALTER TABLE "user" ADD COLUMN "gallery_member" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "gallery_joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "join_source" text;