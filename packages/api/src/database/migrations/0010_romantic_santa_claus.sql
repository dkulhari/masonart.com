CREATE TYPE "public"."gift_card_transaction_type" AS ENUM('issue', 'redeem', 'refund', 'adjustment', 'void');--> statement-breakpoint
CREATE TABLE "gift_card_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_card_id" uuid NOT NULL,
	"type" "gift_card_transaction_type" NOT NULL,
	"amount_paise" integer NOT NULL,
	"balance_after_paise" integer NOT NULL,
	"order_id" uuid,
	"user_id" text,
	"created_by" text,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"code_last4" text NOT NULL,
	"initial_balance_paise" integer NOT NULL,
	"balance_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"issued_by_user_id" text,
	"purchase_order_id" uuid,
	"recipient_email" text,
	"recipient_name" text,
	"sender_name" text,
	"message" text,
	"send_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gift_card_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "order_gift_card" (
	"order_id" uuid NOT NULL,
	"gift_card_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_gift_card_order_id_gift_card_id_pk" PRIMARY KEY("order_id","gift_card_id")
);
--> statement-breakpoint
ALTER TABLE "gift_card_transaction" ADD CONSTRAINT "gift_card_transaction_gift_card_id_gift_card_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transaction" ADD CONSTRAINT "gift_card_transaction_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transaction" ADD CONSTRAINT "gift_card_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transaction" ADD CONSTRAINT "gift_card_transaction_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card" ADD CONSTRAINT "gift_card_issued_by_user_id_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card" ADD CONSTRAINT "gift_card_purchase_order_id_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_gift_card" ADD CONSTRAINT "order_gift_card_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_gift_card" ADD CONSTRAINT "order_gift_card_gift_card_id_gift_card_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_card"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_card_transaction_gift_card_idx" ON "gift_card_transaction" USING btree ("gift_card_id");--> statement-breakpoint
CREATE INDEX "gift_card_transaction_order_idx" ON "gift_card_transaction" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "gift_card_transaction_card_order_type_idx" ON "gift_card_transaction" USING btree ("gift_card_id","order_id","type");--> statement-breakpoint
CREATE INDEX "gift_card_last4_idx" ON "gift_card" USING btree ("code_last4");--> statement-breakpoint
CREATE INDEX "gift_card_purchase_order_idx" ON "gift_card" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "gift_card_send_at_idx" ON "gift_card" USING btree ("send_at");