/**
 * Admin Customers API Routes
 *
 * Endpoints for administrators to view users and assign the content-manager
 * role:
 * - GET /api/admin/customers - List users (filtered, sorted, paginated)
 * - PUT /api/admin/customers/:id/role - Assign role (customer | content-manager)
 *
 * Security invariants:
 * - Gated by requireAdmin: content-managers cannot manage roles
 * - Only 'customer' and 'content-manager' are assignable (no privilege
 *   escalation to admin/super-admin via this endpoint)
 * - Existing admin/super-admin accounts cannot be modified here
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
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "../../database";
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

const customerQuerySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    role: z.preprocess(toArray, z.array(z.enum(USER_ROLES)).min(1)).optional(),
    status: z.enum(USER_STATUSES).optional(),
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
    const {
      search,
      role,
      status,
      joinedFrom,
      joinedTo,
      sortBy,
      sortOrder,
      page,
      pageSize,
    } = c.req.valid("query");

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
    if (joinedFrom) {
      conditions.push(gte(users.createdAt, new Date(`${joinedFrom}T00:00:00.000Z`)));
    }
    if (joinedTo) {
      // Widen to end-of-day so the range is inclusive of `joinedTo` itself
      conditions.push(lte(users.createdAt, new Date(`${joinedTo}T23:59:59.999Z`)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const direction = sortOrder === "asc" ? asc : desc;
    // Tie-break on id so pagination stays stable across pages
    const orderBy = [direction(SORT_COLUMNS[sortBy]), asc(users.id)];

    const [[{ total }], data] = await Promise.all([
      db.select({ total: count() }).from(users).where(where),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

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

    return c.json({ success: true, id, role });
  }
);
