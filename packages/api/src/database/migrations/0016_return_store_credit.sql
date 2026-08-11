-- Store credit returns: record the settlement, the consent, and the card.
--
-- Hand-written, as 0014 and 0015 were: drizzle-kit's snapshot is behind at
-- 0013, so `generate` would bundle unrelated frame changes into this file.
--
-- refund_type on the request, not just on the policy. return_policies.refund_type
-- says what a policy prefers; this says what happened to this return. Nullable
-- because it is unknown until a refund is processed, and every existing row
-- predates the column.
ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "refund_type" "refund_type";--> statement-breakpoint
-- Consent. A store credit refund is a substitution of what the customer gets
-- back, and doing that without agreement is what invites chargebacks.
ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "store_credit_accepted_at" timestamp with time zone;--> statement-breakpoint
-- What was issued. Also the idempotency guard: a return that already has a
-- card cannot be settled as store credit again.
ALTER TABLE "return_requests" ADD COLUMN IF NOT EXISTS "store_credit_gift_card_id" uuid;--> statement-breakpoint
-- SET NULL rather than CASCADE: deleting a card must not delete the record
-- that a return happened.
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_store_credit_gift_card_id_gift_card_id_fk" FOREIGN KEY ("store_credit_gift_card_id") REFERENCES "public"."gift_card"("id") ON DELETE set null ON UPDATE no action;
