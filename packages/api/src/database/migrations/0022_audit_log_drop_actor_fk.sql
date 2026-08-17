-- Drop the actor foreign key from admin_audit_log.
--
-- 0021 created it ON DELETE SET NULL and installed a trigger refusing every
-- UPDATE. Postgres implements SET NULL *as* an UPDATE on the referencing row, so
-- the two contradicted each other: deleting any user who had ever appeared in
-- the audit log failed, reporting the audit trigger from inside a `delete from
-- "user"` — a confusing failure a long way from its cause. Caught by the admin
-- gift-cards and customers suites, whose teardown deletes their test staff.
--
-- The fix is to drop the constraint rather than to teach the trigger an
-- exception. An append-only ledger must not carry a constraint whose entire job
-- is to rewrite it, and re-opening the UPDATE path to save a reference we do not
-- want is the worse trade.
--
-- actor_user_id stays as plain text. A dangling id is the intended state once an
-- account is deleted: actor_email and actor_role are snapshots taken at write
-- time, so the row still answers who acted, and reads join LEFT — which they
-- needed anyway, since SET NULL would have produced the same missing actor.

ALTER TABLE "admin_audit_log" DROP CONSTRAINT IF EXISTS "admin_audit_log_actor_user_id_user_id_fk";
