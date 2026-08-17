-- Append-only audit trail for admin and vendor actions.
--
-- Until now the actor was recorded only where someone remembered a column:
-- gift cards (issued_by_user_id), promotions on create, approvals, AI
-- moderation and shipping config. Refunds, order cancellation, role assignment
-- and price edits recorded nobody. Money moved and privilege escalated with no
-- record of who did it, and audit history cannot be backfilled.
--
-- The table is generic on purpose so that middleware can capture every mutating
-- admin/vendor request without each route's author opting in.
--
-- actor_user_id is ON DELETE SET NULL, never cascade: deleting a user must not
-- delete the evidence of what that user did. actor_email and actor_role are
-- snapshots taken at write time, so history survives the account and records
-- the role held at the moment of the action.
--
-- The trigger at the bottom is what makes "append-only" true rather than
-- aspirational. UPDATE is always refused. DELETE is refused unless the
-- transaction has set chobii.audit_purge = 'on', which only the retention job
-- does (see src/queues/audit-retention.ts). The person being audited must not
-- be able to edit the audit.

CREATE TYPE "public"."audit_category" AS ENUM('money', 'privilege', 'catalogue', 'config', 'content');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('success', 'failure');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"actor_role" text,
	"action" text NOT NULL,
	"category" "audit_category" NOT NULL,
	"outcome" "audit_outcome" DEFAULT 'success' NOT NULL,
	"summary" text,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"request_id" text,
	"ip_address" text,
	"user_agent" text
);--> statement-breakpoint

ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_actor_idx" ON "admin_audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_action_idx" ON "admin_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_category_idx" ON "admin_audit_log" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_entity_idx" ON "admin_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_request_id_idx" ON "admin_audit_log" USING btree ("request_id");--> statement-breakpoint

-- Immutability. current_setting(..., true) returns NULL rather than raising when
-- the setting was never set, which is the normal case for every request-path
-- transaction — so the DELETE branch refuses by default and only the retention
-- job's `SET LOCAL chobii.audit_purge = 'on'` opens it.
CREATE OR REPLACE FUNCTION admin_audit_log_immutable() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'UPDATE' THEN
		RAISE EXCEPTION 'admin_audit_log is append-only: UPDATE is not permitted';
	END IF;

	IF current_setting('chobii.audit_purge', true) IS DISTINCT FROM 'on' THEN
		RAISE EXCEPTION 'admin_audit_log is append-only: DELETE requires the retention job';
	END IF;

	RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS admin_audit_log_immutable_trg ON "admin_audit_log";--> statement-breakpoint

CREATE TRIGGER admin_audit_log_immutable_trg
	BEFORE UPDATE OR DELETE ON "admin_audit_log"
	FOR EACH ROW EXECUTE FUNCTION admin_audit_log_immutable();
