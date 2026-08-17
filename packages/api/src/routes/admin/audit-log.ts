/**
 * Admin Audit Log Routes
 *
 * Reading the trail. A write-only log answers a subpoena and nothing else; this
 * is the endpoint behind the question people actually ask — "who refunded order
 * CH-1042, and what did it look like before they did".
 *
 * ## Who may read it
 *
 * `admin` and `super-admin` only. Deliberately narrower than the rest of the
 * admin API: `content-manager` can edit the catalogue but must not read this,
 * because rows carry customer emails and every domain's actions at once. Being
 * staff is not on its own a reason to hold the audit log.
 *
 * ## Paging
 *
 * Keyset, not offset. The table only grows and is written on every admin
 * mutation, so an offset page 40 would drift while someone reads it. The cursor
 * is the `(createdAt, id)` of the last row seen, and `id` breaks the tie for
 * rows sharing a millisecond — which happens whenever one request writes twice.
 *
 * Design: docs/plans/2026-08-17-logging-and-auditing.md §3.6
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "../../database";
import { adminAuditLog } from "../../database/schema/audit-log";
import {
  auditLogQuerySchema,
  AUDIT_LOG_PAGE_SIZE,
  type AuditLogQuery,
} from "@chobii/shared";
import {
  requireAuth,
  requireRole,
  type AuthVariables,
} from "../../middleware/auth";

const adminAuditLogApp = new Hono<{ Variables: AuthVariables }>();

adminAuditLogApp.use("*", requireAuth);
// Not requireContentManager. See the module comment.
adminAuditLogApp.use("*", requireRole(["admin", "super-admin"]));

/** The columns the viewer renders. Selected explicitly so a new column added to
 * the table does not silently start crossing the wire. */
const ENTRY_COLUMNS = {
  id: adminAuditLog.id,
  createdAt: adminAuditLog.createdAt,
  actorUserId: adminAuditLog.actorUserId,
  actorEmail: adminAuditLog.actorEmail,
  actorRole: adminAuditLog.actorRole,
  action: adminAuditLog.action,
  category: adminAuditLog.category,
  outcome: adminAuditLog.outcome,
  summary: adminAuditLog.summary,
  entityType: adminAuditLog.entityType,
  entityId: adminAuditLog.entityId,
  before: adminAuditLog.before,
  after: adminAuditLog.after,
  metadata: adminAuditLog.metadata,
  requestId: adminAuditLog.requestId,
  ipAddress: adminAuditLog.ipAddress,
  userAgent: adminAuditLog.userAgent,
};

/**
 * `<iso timestamp>|<uuid>` — opaque to the caller, and cheap to validate. A
 * malformed cursor is ignored rather than rejected: a stale bookmark should send
 * someone to the first page, not to an error.
 */
function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;

  const [iso, id] = cursor.split("|");
  if (!iso || !id) return null;

  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return null;

  return { createdAt, id };
}

const encodeCursor = (row: { createdAt: Date; id: string }) =>
  `${row.createdAt.toISOString()}|${row.id}`;

function buildFilters(query: AuditLogQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.actor) filters.push(eq(adminAuditLog.actorUserId, query.actor));
  if (query.requestId) filters.push(eq(adminAuditLog.requestId, query.requestId));
  if (query.outcome) filters.push(eq(adminAuditLog.outcome, query.outcome));
  if (query.entityType) filters.push(eq(adminAuditLog.entityType, query.entityType));
  if (query.entityId) filters.push(eq(adminAuditLog.entityId, query.entityId));

  // Bound as arrays, not spread into an IN list one parameter at a time (#e3c2620d).
  if (query.action?.length) filters.push(inArray(adminAuditLog.action, query.action));
  if (query.category?.length) filters.push(inArray(adminAuditLog.category, query.category));

  if (query.from) filters.push(gte(adminAuditLog.createdAt, query.from));
  if (query.to) filters.push(lte(adminAuditLog.createdAt, query.to));

  if (query.q) {
    // Bound, never interpolated: this string comes from a URL.
    const pattern = `%${query.q}%`;
    const match = or(
      ilike(adminAuditLog.summary, pattern),
      ilike(adminAuditLog.actorEmail, pattern),
      ilike(adminAuditLog.entityId, pattern)
    );
    if (match) filters.push(match);
  }

  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    // Strictly after the last row seen, in the same order the rows come back.
    const keyset = or(
      lt(adminAuditLog.createdAt, cursor.createdAt),
      and(eq(adminAuditLog.createdAt, cursor.createdAt), lt(adminAuditLog.id, sql`${cursor.id}::uuid`))
    );
    if (keyset) filters.push(keyset);
  }

  return filters;
}

async function readPage(query: AuditLogQuery, extra: SQL[] = []) {
  const filters = [...buildFilters(query), ...extra];

  const rows = await db
    .select(ENTRY_COLUMNS)
    .from(adminAuditLog)
    .where(filters.length ? and(...filters) : sql`true`)
    .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
    .limit(query.limit);

  // A cursor on a short page would give the viewer an endless "load more".
  const nextCursor =
    rows.length === query.limit && rows.length > 0
      ? encodeCursor(rows[rows.length - 1] as { createdAt: Date; id: string })
      : null;

  return { entries: rows, nextCursor };
}

// ============================================================================
// GET /api/admin/audit-log
// ============================================================================

adminAuditLogApp.get("/", zValidator("query", auditLogQuerySchema), async (c) => {
  const query = c.req.valid("query");

  return c.json(await readPage(query));
});

// ============================================================================
// GET /api/admin/audit-log/entity/:type/:id
// ============================================================================

/**
 * One entity's history, newest first — what the order or customer screen links
 * to. Same shape as the list so the viewer can render either with one component.
 */
adminAuditLogApp.get("/entity/:type/:id", async (c) => {
  const query = auditLogQuerySchema.parse({
    limit: c.req.query("limit") ?? AUDIT_LOG_PAGE_SIZE,
    cursor: c.req.query("cursor"),
  });

  return c.json(
    await readPage(query, [
      eq(adminAuditLog.entityType, c.req.param("type")),
      eq(adminAuditLog.entityId, c.req.param("id")),
    ])
  );
});

export { adminAuditLogApp };
export default adminAuditLogApp;
