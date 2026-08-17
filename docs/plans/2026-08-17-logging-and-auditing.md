# Logging & Auditing — Prompt + Comprehensive Spec

Date: 2026-08-17
Feature (ticketrack): `admin-audit-log`
Status: spec approved for autonomous implementation on `main`

---

## Part 0 — The Prompt

> Reusable, self-contained instruction. Anything below Part 1 is the answer to it.

```text
Add a logging and auditing capability to this codebase if one does not already exist.

1. AUDIT FIRST, DO NOT ASSUME.
   Grep the schema for an audit table. Grep for a logger. Report exactly what exists,
   what is partial, and what is missing, with file:line evidence. Do not build a second
   logger next to the existing one.

2. SPEC BEFORE CODE. The spec must settle, explicitly:
   - Generic append-only audit table captured centrally, vs. per-domain actor columns.
     Pick one, say why, and say what the loser costs.
   - Scope tiers: which actions are launch-gating (money, privilege) and which are not
     (catalogue, config, content).
   - Payload: actor identity snapshot, action name, entity type+id, before/after delta,
     client IP, user agent, request id, outcome.
   - Client IP provenance behind a CDN/tunnel (the first x-forwarded-for hop is
     client-forgeable — do not trust it).
   - Immutability: enforced in the database, not by app-level discipline.
   - Retention and PII: a window, a purge job, and a redactor. Name the regime.
   - Failure policy: an audit write must never roll back the business action that
     already happened, and must never be silently dropped.
   - Correlation: one id joins a log line to an audit row to a support ticket.

3. IMPLEMENT ON main USING THE tt-* SKILLS, WITHOUT HUMAN INPUT.
   /tt-plan-feature to turn the spec into phased tickets carrying structured TDD steps,
   then work each ticket TDD-first: failing test, minimal implementation, passing test,
   scoped test command only, one commit per ticket referencing the ticket number.
   Never run a pathless/whole-workspace test runner — the machine is shared.

4. THEN WORKFLOW-TEST THE RECENTLY COMPLETED FEATURES end to end and report pass/fail
   with evidence. Report honestly: a skipped step is a skipped step.
```

---

## Part 1 — Current State (evidence)

### What exists

| Concern | State | Evidence |
|---|---|---|
| Structured logger | **Exists.** pino, JSON in prod, pretty in dev, `createChildLogger` helper unused. | `packages/api/src/lib/logger.ts:18-52` |
| Request logging | **Partial.** One global middleware logs method/path/status/duration. No request id, no actor, no IP, no error body. | `packages/api/src/index.ts:93-102` |
| Redaction | **Missing.** pino has no `redact` config, so any `logger.info({ body })` leaks cookies/tokens. | `packages/api/src/lib/logger.ts` |
| Error capture | Sentry initialised, `captureException` used. Not correlated to a request id. | `packages/api/src/lib/sentry.ts`, `index.ts:10` |
| Trustworthy client IP | **Exists but not reused for audit.** `getClientIp` prefers `cf-connecting-ip`, then the LAST x-forwarded-for hop. | `packages/api/src/middleware/rate-limit.ts:31-38` |
| Generic audit trail | **Missing.** No audit table anywhere in `src/database/schema/`. | `ls packages/api/src/database/schema/` — 20 files, none audit |

### Per-domain actor columns that do exist

- `ai_generation_reviews` — full moderation trail incl. ip/user agent (`schema/ai-generation-reviews.ts:47-90`)
- `gift_card_ledger` — `issued_by_user_id` + mandatory reason (`routes/admin/gift-cards.ts:65`)
- `promotions.created_by`, `shipping_config.created_by`, approvals reviewer

### The gap — actions with money or privilege and NO actor record

| Path | File | Impact |
|---|---|---|
| Return approve / reject / process-refund | `routes/admin/returns.ts:460,536,606,671` | Money leaves. Nobody knows who. |
| Order status change / cancellation | `routes/admin/orders.ts` | Fulfilment disputes unanswerable. |
| Role assignment | `routes/admin/customers.ts:355` (`PUT /:id/role`) | Privilege escalation with no record of who promoted whom. `currentUser` is read only to block self-demotion, never stored. |
| Product price / stock edits | `routes/admin/products.ts` | Price changes untraceable. |
| Frame / promotion / collection / shipping-option deletes | `routes/admin/*.ts` (11 delete handlers) | Catalogue destruction untraceable. |
| Vendor rates, payables, invites | `routes/admin/vendor-*.ts` | Payables disputes unanswerable. |

**Conclusion: build it.** Logging gets hardened; auditing is new.

---

## Part 2 — Decisions

### D1. Generic append-only table, captured centrally — not per-domain columns

The gap is precisely the set of paths nobody remembered to add a column to. Per-domain
columns need a migration per action forever, and each one is another chance to forget.
A generic table plus a catch-all middleware means a route added next month is audited by
default, without its author doing anything.

**Cost of the loser (accepted):** the generic table's `before`/`after` are `jsonb`, so
they carry no referential integrity and no compile-time shape. Mitigated by a typed action
registry in `@chobii/shared` — an unknown action name fails typecheck.

**Existing per-domain trails stay.** `ai_generation_reviews` and the gift-card ledger are
domain records with their own semantics and queries; they are not deleted or migrated.
The audit log duplicates the *actor* fact for them, which is intentional redundancy: one
place answers "who did what", always.

### D2. Two capture layers, not one

1. **Middleware (floor).** Every non-GET request under `/api/admin/*` and `/api/vendor/*`
   writes a row: actor, method, route, params, status code, outcome. Cannot be forgotten.
   Coarse: no entity delta.
2. **`recordAudit()` (ceiling).** Explicit call inside the handler for money/privilege
   paths, carrying entity type+id and the before/after delta. Precise.

When a handler calls `recordAudit()`, the middleware row for that request is suppressed
(the handler marks the context as audited) so one action is one row.

### D3. Scope tiers

- **Tier 1 — launch gate (`money`, `privilege`).** Refunds, store credit, wallet
  adjustments, gift-card issue/disable/enable, order cancellation, order status changes,
  role assignment, vendor-user creation/invite. History cannot be backfilled: launching
  without the write path means the first disputed refund has no answer.
- **Tier 2 — same sprint (`catalogue`, `config`).** Product/variant/frame/promotion/
  collection writes and deletes, shipping and wallet config, vendor rate cards.
- **Read UI — not a gate.** A viewer can be added any time; it is in this feature because
  a write-only log nobody can read is only half an answer.

### D4. Payload

Actor identity is **snapshotted** (`actor_email`, `actor_role` copied at write time), not
only referenced. A deleted or demoted user must not erase or rewrite history.

### D5. Client IP

`getClientIp()` from `middleware/rate-limit.ts` — `cf-connecting-ip`, then the **last**
x-forwarded-for hop, then `x-real-ip`. The first x-forwarded-for entry is whatever the
client sent (#291). No second implementation.

### D6. Immutability in the database

A `BEFORE UPDATE OR DELETE` trigger raises an exception. `UPDATE` is always refused.
`DELETE` is refused unless the transaction has set `chobii.audit_purge = 'on'`, which only
the retention job does. App-level discipline is not immutability.

### D7. Retention & PII

India's DPDP Act applies — rows carry customer emails. Window: **400 days**
(`AUDIT_RETENTION_DAYS`, default 400), purged daily by a background worker inside the
guarded transaction. Redactor drops any key matching
`password|token|secret|otp|signature|cvv|card` (case-insensitive) and truncates strings
over 2 KB, applied to `before`, `after` and `metadata` before insert.

### D8. Failure policy

`recordAudit()` **never throws**. A failed audit write must not roll back a refund that
already left the building. It logs at `error` with the request id and raises the existing
`alertCritical` path. Where the audit belongs to the same transaction as the money move,
callers pass the `tx` handle and get atomicity by choice, not by default.

### D9. Correlation

One `request_id` (from `x-request-id`, else `cf-ray`, else generated) is bound to the
child logger, echoed in the response header, written into every audit row, and included
in 5xx error bodies so a support ticket carries the join key.

---

## Part 3 — Design

### 3.1 Schema — `packages/api/src/database/schema/audit-log.ts`

```ts
export const auditCategoryEnum = pgEnum("audit_category", [
  "money", "privilege", "catalogue", "config", "content",
])
export const auditOutcomeEnum = pgEnum("audit_outcome", ["success", "failure"])

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  // Actor — referenced AND snapshotted (D4)
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorEmail: text("actor_email"),
  actorRole: text("actor_role"),

  // What happened
  action: text("action").notNull(),              // "return.refund_processed"
  category: auditCategoryEnum("category").notNull(),
  outcome: auditOutcomeEnum("outcome").notNull().default("success"),
  summary: text("summary"),                       // one human line for the viewer

  // What it happened to
  entityType: text("entity_type"),                // "order" | "user" | "gift_card" | ...
  entityId: text("entity_id"),

  // Evidence
  before: jsonb("before"),
  after: jsonb("after"),
  metadata: jsonb("metadata"),                    // { method, path, params, status }

  // Correlation and provenance
  requestId: text("request_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (t) => ({
  createdAtIdx: index("admin_audit_log_created_at_idx").on(t.createdAt),
  actorIdx:     index("admin_audit_log_actor_idx").on(t.actorUserId),
  actionIdx:    index("admin_audit_log_action_idx").on(t.action),
  categoryIdx:  index("admin_audit_log_category_idx").on(t.category),
  entityIdx:    index("admin_audit_log_entity_idx").on(t.entityType, t.entityId),
  requestIdx:   index("admin_audit_log_request_id_idx").on(t.requestId),
}))
```

Migration adds the trigger (hand-written SQL appended to the generated migration):

```sql
CREATE OR REPLACE FUNCTION admin_audit_log_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'admin_audit_log is append-only: UPDATE is not permitted';
  END IF;
  IF current_setting('chobii.audit_purge', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'admin_audit_log is append-only: DELETE requires the retention job';
  END IF;
  RETURN OLD;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER admin_audit_log_immutable_trg
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_immutable();
```

### 3.2 Shared contract — `packages/shared/src/schemas/audit-log.ts`

- `auditCategorySchema`, `auditOutcomeSchema`
- `AUDIT_ACTIONS` — the typed registry: `"return.refund_processed"`, `"user.role_changed"`,
  `"order.status_changed"`, `"order.cancelled"`, `"gift_card.issued"`, … plus
  `"admin.request"` for the middleware floor. `AuditAction = typeof AUDIT_ACTIONS[number]`.
- `auditLogQuerySchema` — filters (`actor`, `action`, `category`, `entityType`, `entityId`,
  `from`, `to`, `q`, `limit`, `cursor`). Coerces numbers and splits comma-joined arrays —
  the router serialises every search param as a string.
- `auditLogEntrySchema` — the response row.

### 3.3 Service — `packages/api/src/lib/audit.ts`

```ts
recordAudit(c: Context, entry: AuditEntryInput, tx?: Transaction): Promise<void>  // never throws
redactAuditPayload(value: unknown): unknown                                        // D7
diffRecords(before, after, keys?): { before, after }                               // changed keys only
```

`recordAudit` derives actor from `c.get("user")`, IP from `getClientIp(c)`, request id from
`c.get("requestId")`, marks `c.set("audited", true)`, redacts, then inserts.

### 3.4 Request context — `packages/api/src/middleware/request-context.ts`

Assigns/propagates the request id, sets `requestId` + a bound child logger on the context,
echoes `x-request-id` on the response, and replaces the ad-hoc log line in `index.ts` with
one that carries `requestId`, `actorId`, `ip`, `status`, `duration`. pino gains a `redact`
config for `req.headers.cookie`, `req.headers.authorization`, `*.password`, `*.token`,
`*.otp`, `*.signature`.

### 3.5 Audit middleware — `packages/api/src/middleware/audit.ts`

Mounted on `/api/admin/*` and `/api/vendor/*`. After `next()`: skip GET/HEAD/OPTIONS, skip
when `c.get("audited")`, else insert one `admin.request` row with method/path/params/status
and `outcome` derived from the status code (`< 400` → success).

### 3.6 Read API — `packages/api/src/routes/admin/audit-log.ts`

- `GET /api/admin/audit-log` — filters + cursor pagination, `admin`/`super-admin` only
  (explicitly **not** `content-manager`: entries carry customer emails).
- `GET /api/admin/audit-log/entity/:type/:id` — one entity's timeline.

### 3.7 Admin UI — `packages/web/app/routes/admin/audit-log/index.tsx`

Filter bar (actor, category, action, date range, free text), a table (time, actor, action,
entity, outcome), a detail drawer rendering the before/after diff. `validateSearch` coerces
via the shared schema.

### 3.8 Retention — `packages/api/src/queues/audit-retention.ts`

Daily: `SET LOCAL chobii.audit_purge = 'on'` then delete rows older than
`AUDIT_RETENTION_DAYS`, logging the deleted count. Registered in `background.ts`.

---

## Part 4 — Phased plan

| Phase | Tickets | Content |
|---|---|---|
| 1. Contract | 2 | shared zod + action registry; schema file + migration + immutability trigger |
| 2. Core | 3 | redactor + diff; `recordAudit`; request-context middleware and logger redaction |
| 3. Capture | 2 | audit middleware floor; suppression handshake |
| 4. Tier 1 | 3 | returns/refund, orders status+cancel, role change + gift cards |
| 5. Tier 2 | 2 | products/frames/promotions/collections; shipping/wallet config + vendor rates |
| 6. Read | 2 | admin read API; admin UI route |
| 7. Ops | 2 | retention worker + env; E2E + OPERATIONS.md runbook |

## Part 5 — Testing

- **Unit** — redactor drops secret-ish keys and truncates; diff returns only changed keys;
  action registry rejects unknown names at typecheck.
- **Integration (real DB, 5440 override)** — insert works; `UPDATE` raises; `DELETE` raises
  without the guard and succeeds with it; purge deletes only aged rows.
- **Route** — role change writes one `privilege` row with before/after; refund writes one
  `money` row; a failing handler writes `outcome: failure`; a handler that calls
  `recordAudit` produces exactly one row, not two.
- **E2E** — admin changes a role, `/admin/audit-log` shows the entry, filters narrow it.

Every test command is scoped to a path. No pathless runner — the box is shared.

## Part 5b — Delivered (2026-08-17)

Implemented on `main`, 17 tickets, one commit each. Two defects were found by the work's
own tests and fixed rather than filed and left:

| Ticket | What shipped |
|---|---|
| #635 | Shared action registry (43 actions), category map, query + entry schemas |
| #636 | `admin_audit_log` table, 6 indexes, migration 0021, immutability trigger |
| #637 | Redactor + changed-keys delta |
| #638 | `recordAudit` — never throws, tx-aware, claims the request |
| #639 | Request id correlation, pino redaction, 500 bodies carry the id |
| #640 | Middleware floor over admin + vendor mutations |
| #641–#643 | Tier 1: returns money paths, order status/cancel/refund, role changes + gift cards |
| #644 | Tier 2: products, frames, promotions, collections, shipping and wallet config |
| #645 | Read API — filters, keyset paging, entity timeline, admin-only |
| #646 | `/admin/audit-log` viewer with before/after drawer |
| #647 | Retention purge behind the guard, `AUDIT_RETENTION_DAYS` |
| #648 | E2E (9 tests) + OPERATIONS.md §3b |
| #649 | **Fixed:** the actor FK was `ON DELETE SET NULL`, which Postgres implements as an UPDATE — the trigger refused it, so deleting any user who had acted failed. FK dropped; the snapshot columns are what carry the actor now. |
| #650 | **Fixed:** the floor recorded anonymous 401s — 863 of 878 rows on the live table before the rule was added. 401-without-actor is now skipped; 403 and anything with an actor are kept. |

Evidence, not assertion:

- Trigger verified against the dev database — `UPDATE` refused, unguarded `DELETE` refused,
  guarded `DELETE` removed the row.
- Retention `DELETE` verified live — a 500-day-old row removed, today's kept.
- After a full E2E sweep the table held 432 rows across all five categories with named
  actors, readable summaries and both outcomes present.

## Part 5c — Workflow test of recently completed features

Run against a private API (`:3010`) and web (`:4321`) pair on this branch, with every
failure diffed against a pre-work baseline before being called a regression.

| Suite | Result |
|---|---|
| `packages/shared` unit | **972 / 972** |
| `packages/web` unit | **3312 / 3312** |
| `packages/api` unit | **4946 passed, 24 failed** — all 24 reproduce identically at `485fa949` |
| E2E `audit-log` (new) | **9 / 9** |
| E2E `admin-vendor-lifecycle` | **13 / 13** — the whole vendor feature, incl. both refusals |
| E2E `admin-approvals` | **26 / 26** |
| E2E `collections.admin` | **11 / 11** |
| E2E `wishlist-collection-edit.admin` | **7 / 7** |
| E2E `gift-cards` | 9 / 10, the failure passes on retry — the known checkout race |
| E2E `admin-orders` | 126 / 127 — stale: expects the Export button `f72c9b81` removed |
| E2E `admin-products` | 93 / 99 — stale: native `confirm()` before `2411e0df` |
| E2E `admin-frames` | 0 / 4 — stale: size buttons became a `<select>` in `2f29ee65` |
| E2E `admin-dashboard` | 82 / 85 — empty-order-state tests cannot pass on a seeded DB |
| E2E `wishlist-staging.admin` | 5 / 6 — fails on the pre-work server too |

One genuine regression was introduced and fixed during the sweep: the product write path's
second insert (the audit row) displaced the `product-orientation-guard` suite's
last-insert recorder. `recordAudit` is now stubbed there, since what lands in the audit
table is asserted in `catalogue-audit.test.ts`.

The stale-spec findings are filed against `qa-e2e-testing` (#651–#654). Worth saying
plainly: **the E2E suite has drifted behind the UI changes of the last week** — the frames
suite tests nothing at all today, and four suites fail for reasons that have nothing to do
with whatever change is being reviewed.

## Part 6 — Risks

| Risk | Mitigation |
|---|---|
| Audit write on the hot path adds latency | One indexed insert; middleware runs after the response body is produced; failure is swallowed (D8) |
| jsonb payload bloat | Redactor truncates >2 KB strings; deltas store changed keys only |
| PII in an append-only table | 400-day purge, admin-only read, redactor |
| Double-counting rows | `c.set("audited", true)` handshake, asserted by a route test |
| Trigger blocks a legitimate migration | Trigger is row-level on UPDATE/DELETE only; schema changes are unaffected |
