/**
 * Admin Customers API Routes
 *
 * Endpoints for administrators to view users and assign the content-manager
 * role:
 * - GET /api/admin/customers - List users
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
import { desc, eq } from "drizzle-orm";
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

adminCustomersApp.get("/", async (c) => {
  const customers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return c.json({ customers });
});

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
