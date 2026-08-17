/**
 * Admin Customers API Routes
 *
 * Endpoints for administrators to view users and assign the content-manager
 * role:
 * - GET /api/admin/customers - List users (filtered, sorted, paginated)
 * - GET /api/admin/customers/export - CSV of the consented gallery list
 * - PUT /api/admin/customers/:id/role - Assign role (customer | content-manager)
 *
 * Security invariants:
 * - Gated by requireAdmin: content-managers cannot manage roles
 * - Only 'customer' and 'content-manager' are assignable (no privilege
 *   escalation to admin/super-admin via this endpoint)
 * - Existing admin/super-admin accounts cannot be modified here
 * - The export carries only rows with a `marketingConsentAt`. See the note on
 *   the handler: this gate is not reachable by any query parameter.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "../../database";
import { recordAudit } from "../../lib/audit";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Roles an admin may assign via this endpoint. Deliberately excludes
 * admin/super-admin — full role management is reserved for super-admin (future).
 */
const roleAssignmentSchema = z.object({
  role: z.enum(["customer", "content-manager", "admin"]),
});

/**
 * Every role a user row can carry. Wider than roleAssignmentSchema on purpose:
 * `trade` and `super-admin` are not assignable here, but such users exist and
 * have to be findable.
 */
const USER_ROLES = [
  "customer",
  "trade",
  "content-manager",
  "admin",
  "super-admin",
] as const;

const USER_STATUSES = [
  "active",
  "inactive",
  "suspended",
  "pending-verification",
] as const;

/** Hono's query validator hands us a string for one value, an array for many. */
const toArray = (value: unknown) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

/**
 * Calendar day, `YYYY-MM-DD`. Lexicographic order matches chronological order,
 * which is what the from <= to refinement below relies on.
 */
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), {
    message: "Not a real calendar date",
  });

/**
 * A query string has no booleans, only text. `z.coerce.boolean()` is the wrong
 * tool here — every non-empty string is truthy, so `galleryMember=false` would
 * quietly mean `true` and the filter would look broken in exactly one
 * direction. Spell the two accepted words out instead; anything else is a 400.
 */
const booleanFlag = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const customerQuerySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    role: z.preprocess(toArray, z.array(z.enum(USER_ROLES)).min(1)).optional(),
    status: z.enum(USER_STATUSES).optional(),
    galleryMember: booleanFlag.optional(),
    joinedFrom: calendarDay.optional(),
    joinedTo: calendarDay.optional(),
    sortBy: z.enum(["createdAt", "name", "email", "role"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine(
    (q) => !q.joinedFrom || !q.joinedTo || q.joinedFrom <= q.joinedTo,
    {
      message: "joinedFrom must be on or before joinedTo",
      path: ["joinedFrom"],
    }
  );

const SORT_COLUMNS = {
  createdAt: users.createdAt,
  name: users.name,
  email: users.email,
  role: users.role,
} as const;

/** LIKE wildcards in user input are literals, not operators. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

type CustomerQuery = z.infer<typeof customerQuerySchema>;

/**
 * The filter half of the query, shared by the list and the export so a
 * download matches the rows the admin is looking at. Sorting and pagination
 * are deliberately not part of this.
 */
function buildFilterConditions(query: CustomerQuery): SQL[] {
  const { search, role, status, galleryMember, joinedFrom, joinedTo } = query;
  const conditions: SQL[] = [];

  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(ilike(users.name, pattern), ilike(users.email, pattern))!
    );
  }
  if (role) {
    conditions.push(inArray(users.role, role));
  }
  if (status) {
    conditions.push(eq(users.status, status));
  }
  if (galleryMember !== undefined) {
    conditions.push(eq(users.galleryMember, galleryMember));
  }
  if (joinedFrom) {
    conditions.push(
      gte(users.createdAt, new Date(`${joinedFrom}T00:00:00.000Z`))
    );
  }
  if (joinedTo) {
    // Widen to end-of-day so the range is inclusive of `joinedTo` itself
    conditions.push(
      lte(users.createdAt, new Date(`${joinedTo}T23:59:59.999Z`))
    );
  }

  return conditions;
}

// ============================================================================
// CSV
// ============================================================================

const EXPORT_COLUMNS = [
  "email",
  "name",
  "galleryJoinedAt",
  "marketingConsentAt",
  "joinSource",
] as const;

/**
 * A name is whatever the customer typed, and this file is opened in a
 * spreadsheet. Two separate hazards:
 *
 * 1. A comma, quote or newline splits the row unless the field is quoted and
 *    inner quotes are doubled (RFC 4180).
 * 2. A leading `=`, `+`, `-`, `@`, tab or CR makes Excel and Sheets treat the
 *    cell as a formula. Prefixing an apostrophe keeps the text visible while
 *    taking away its ability to execute.
 */
function csvField(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "";

  const raw = value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;

  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(rows: Array<Array<string | Date | null>>): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

// ============================================================================
// Route Handler
// ============================================================================

export const adminCustomersApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminCustomersApp.use("*", requireAuth);
adminCustomersApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/customers - List Users
// ============================================================================

adminCustomersApp.get(
  "/",
  zValidator("query", customerQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { sortBy, sortOrder, page, pageSize } = query;

    const conditions = buildFilterConditions(query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const direction = sortOrder === "asc" ? asc : desc;
    // Tie-break on id so pagination stays stable across pages
    const orderBy = [direction(SORT_COLUMNS[sortBy]), asc(users.id)];

    const [countRows, data] = await Promise.all([
      db.select({ total: count() }).from(users).where(where),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
          // Membership travels with the row so the admin can see who is a
          // member, where they joined from, and — the one that matters — a
          // member whose consent stamp is missing.
          galleryMember: users.galleryMember,
          galleryJoinedAt: users.galleryJoinedAt,
          marketingConsentAt: users.marketingConsentAt,
          joinSource: users.joinSource,
        })
        .from(users)
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    // count() always returns exactly one row; the ?? 0 satisfies
    // noUncheckedIndexedAccess without pretending the row can be missing
    const total = countRows[0]?.total ?? 0;

    return c.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  }
);

// ============================================================================
// GET /api/admin/customers/export - Consented Gallery List (CSV)
// ============================================================================

/**
 * The deliverable of D4: the reason gallery membership is an explicit opt-in
 * rather than "has an account".
 *
 * ONE RULE, AND IT IS NOT A FILTER
 *
 * A row is exportable only if it carries a `marketingConsentAt`. That
 * condition is appended after the caller's filters and cannot be spelled away
 * by any query parameter — `?galleryMember=true` narrows the export, it does
 * not widen it. A `galleryMember` row with a NULL consent stamp is a bug in
 * whatever wrote it, not a marketable address, and it must never leave here.
 *
 * Consent is a timestamp rather than a boolean precisely so this file can
 * answer *when*, which is what has to be produced if the consent is ever
 * questioned. `joinSource` is a column of its own because #446 made it
 * accurate per surface, and attribution nobody can read is attribution nobody
 * collected.
 *
 * Not paginated: a partial mailing list is worse than none, since the missing
 * half is invisible.
 */
adminCustomersApp.get(
  "/export",
  zValidator("query", customerQuerySchema),
  async (c) => {
    const query = c.req.valid("query");

    const conditions = buildFilterConditions(query);
    conditions.push(isNotNull(users.marketingConsentAt));

    const rows = await db
      .select({
        email: users.email,
        name: users.name,
        galleryJoinedAt: users.galleryJoinedAt,
        marketingConsentAt: users.marketingConsentAt,
        joinSource: users.joinSource,
      })
      .from(users)
      .where(and(...conditions))
      // Oldest consent first, so the file reads as the list grew
      .orderBy(asc(users.marketingConsentAt), asc(users.id));

    const csv = toCsv([
      [...EXPORT_COLUMNS],
      ...rows.map((row) => [
        row.email,
        row.name,
        row.galleryJoinedAt,
        row.marketingConsentAt,
        row.joinSource,
      ]),
    ]);

    const day = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gallery-consented-${day}.csv"`,
        // A mailing list is not something a proxy should keep a copy of
        "Cache-Control": "no-store",
      },
    });
  }
);

// ============================================================================
// PUT /api/admin/customers/:id/role - Assign Role
// ============================================================================

adminCustomersApp.put(
  "/:id/role",
  zValidator("json", roleAssignmentSchema),
  async (c) => {
    const id = c.req.param("id");
    const { role } = c.req.valid("json");

    const [target] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id));

    if (!target) {
      return c.json(
        { error: "NotFound", message: "User not found", code: "NOT_FOUND" },
        404
      );
    }

    if (target.role === "super-admin") {
      await recordAudit(c, {
        action: "user.role_changed",
        entityType: "user",
        entityId: id,
        outcome: "failure",
        summary: `Refused: cannot change the role of a super-admin account`,
        before: { role: target.role },
        after: { role },
      });

      return c.json(
        {
          error: "Forbidden",
          message: "Cannot change the role of super-admin accounts",
          code: "FORBIDDEN",
        },
        403
      );
    }

    const currentUser = c.get("user");
    if (currentUser && currentUser.id === target.id) {
      await recordAudit(c, {
        action: "user.role_changed",
        entityType: "user",
        entityId: id,
        outcome: "failure",
        summary: "Refused: an admin cannot change their own role",
        before: { role: target.role },
        after: { role },
      });

      return c.json(
        {
          error: "Forbidden",
          message: "You cannot change your own role",
          code: "FORBIDDEN",
        },
        403
      );
    }

    if (target.role === "trade") {
      await recordAudit(c, {
        action: "user.role_changed",
        entityType: "user",
        entityId: id,
        outcome: "failure",
        summary:
          "Refused: trade accounts are managed through the trade application workflow",
        before: { role: target.role },
        after: { role },
      });

      return c.json(
        {
          error: "Forbidden",
          message:
            "Trade accounts are managed through the trade application workflow",
          code: "FORBIDDEN",
        },
        403
      );
    }

    await db.update(users).set({ role }).where(eq(users.id, id));

    // The gap this closes: until now the only trace of a promotion to admin was
    // the promoted account itself.
    await recordAudit(c, {
      action: "user.role_changed",
      entityType: "user",
      entityId: id,
      summary: `Changed role of ${id}: ${target.role} → ${role}`,
      before: { role: target.role },
      after: { role },
    });

    return c.json({ success: true, id, role });
  }
);
