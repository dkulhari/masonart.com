/**
 * Admin Audit Log Schema
 *
 * One append-only row per admin or vendor action: who did it, to what, what
 * changed, from where, and whether it succeeded.
 *
 * ## Why one generic table rather than per-domain actor columns
 *
 * The repo has precedent both ways — `ai_generation_reviews` and the gift-card
 * ledger carry their own actor columns. But the gap this table closes is
 * precisely the set of paths nobody remembered to add a column to: refunds,
 * order cancellation, role assignment, price edits. Per-domain columns need a
 * migration per action forever, and each one is another chance to forget. A
 * generic table captured in middleware means a route added next month is
 * audited by default.
 *
 * The existing per-domain trails stay. They are domain records with their own
 * queries; this table duplicates the actor fact for them deliberately, so that
 * one place answers "who did what", always.
 *
 * ## Append-only means append-only — and it is NOT in this file
 *
 * The migration installs a BEFORE UPDATE OR DELETE trigger. UPDATE is always
 * refused. DELETE is refused unless the transaction has set
 * `chobii.audit_purge = 'on'`, which only the retention job does. App-level
 * discipline is not immutability — the point of an audit log is that the person
 * being audited cannot edit it.
 *
 * That trigger is raw SQL in `migrations/0021_admin_audit_log.sql`, because the
 * drizzle DSL cannot express a trigger. **So `drizzle-kit push` does not create
 * it.** A database built with `bun run db:push` has this table and none of its
 * immutability: UPDATE and DELETE both succeed (#663). Build every database
 * with `bun run db:migrate`.
 *
 * The trigger and its function are declared in `src/database/raw-sql-objects.ts`
 * so that `tests/database/raw-sql-objects.test.ts` can assert they are actually
 * present in whatever database the suite is pointed at. Anything else you add
 * in raw SQL belongs in that manifest too — the test fails until it is there.
 *
 * ## Actor is snapshotted, not only referenced
 *
 * `actor_user_id` is ON DELETE SET NULL, never cascade: deleting a user must not
 * delete the evidence of what that user did. `actor_email` and `actor_role` are
 * copies taken at write time, so history survives the account and records the
 * role held *at the moment of the action*, not the one held today.
 *
 * Design: docs/plans/2026-08-17-logging-and-auditing.md §3.1
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

/**
 * Scope tier. `money` and `privilege` are the launch gate — history cannot be
 * backfilled, so an unrecorded refund is unanswerable forever.
 */
export const auditCategoryEnum = pgEnum("audit_category", [
  "money",
  "privilege",
  "catalogue",
  "config",
  "content",
]);

/**
 * A refused action is evidence too: a rejected privilege change is exactly what
 * an investigation wants to see. Refusals are recorded, not dropped.
 */
export const auditOutcomeEnum = pgEnum("audit_outcome", ["success", "failure"]);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * With time zone: a dispute about a refund crossing a date boundary needs
     * one clock, and the rest of this schema's audit-ish columns predate that
     * lesson.
     */
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    // ── Who ──────────────────────────────────────────────────────────────────
    /**
     * Deliberately NOT a foreign key (#649).
     *
     * It was one, ON DELETE SET NULL, until the first user deletion failed:
     * Postgres implements SET NULL as an UPDATE on this row, and the trigger
     * below refuses every UPDATE. An append-only ledger must not carry a
     * constraint whose whole job is to rewrite it.
     *
     * So a dangling id is the intended state once an account is deleted. That is
     * the point of the snapshot columns beside it — the row still says who acted
     * even when the account is gone. Reads join LEFT.
     */
    actorUserId: text("actor_user_id"),
    /** Snapshot. Outlives the account by design. */
    actorEmail: text("actor_email"),
    /** Snapshot of the role held when the action happened, not today's. */
    actorRole: text("actor_role"),

    // ── What ─────────────────────────────────────────────────────────────────
    /**
     * `entity.verb_past_tense`, from the closed `AUDIT_ACTIONS` registry in
     * `@chobii/shared`. Stored as text rather than an enum so adding an action
     * does not need a migration — the registry is the guard rail, and it is
     * enforced at the call site where a typo can still be caught.
     */
    action: text("action").notNull(),
    category: auditCategoryEnum("category").notNull(),
    outcome: auditOutcomeEnum("outcome").notNull().default("success"),
    /** One human line for the viewer, so the list is readable without a diff. */
    summary: text("summary"),

    // ── To what ──────────────────────────────────────────────────────────────
    entityType: text("entity_type"),
    entityId: text("entity_id"),

    // ── Evidence ─────────────────────────────────────────────────────────────
    /** Changed keys only, redacted. Not the whole row — these grow forever. */
    before: jsonb("before"),
    after: jsonb("after"),
    /** Request shape: method, path, params, status. Redacted. */
    metadata: jsonb("metadata"),

    // ── Provenance ───────────────────────────────────────────────────────────
    /** Joins this row to the API log lines for the same request. */
    requestId: text("request_id"),
    /**
     * From `getClientIp()`: cf-connecting-ip, then the LAST x-forwarded-for
     * hop. The first hop is whatever the client sent and is forgeable (#291).
     */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => ({
    createdAtIdx: index("admin_audit_log_created_at_idx").on(table.createdAt),
    actorIdx: index("admin_audit_log_actor_idx").on(table.actorUserId),
    actionIdx: index("admin_audit_log_action_idx").on(table.action),
    categoryIdx: index("admin_audit_log_category_idx").on(table.category),
    entityIdx: index("admin_audit_log_entity_idx").on(
      table.entityType,
      table.entityId
    ),
    requestIdIdx: index("admin_audit_log_request_id_idx").on(table.requestId),
  })
);

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  actor: one(users, {
    fields: [adminAuditLog.actorUserId],
    references: [users.id],
  }),
}));

export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLogRow = typeof adminAuditLog.$inferInsert;
