/**
 * Vendor Access Middleware
 *
 * Resolves the caller into a single vendorId and puts it in context. It does
 * NOT authorise anything by itself — the row scoping in `lib/vendor-scope.ts`
 * does that. This only answers "which vendor is asking", and refuses when
 * there is no single answer.
 *
 * A vendor-role user with no vendor_users row is 403. Never an unscoped query,
 * never a fallback to "all": the failure mode this guards against is a missing
 * link silently reading as no filter.
 *
 * The 401/403 bodies come from the same helpers `requireRole` uses, so the API
 * answers a vendor refusal in exactly the shape it answers every other one.
 */

import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../database";
import { vendorUsers } from "../database/schema/vendor-users";
import { vendors } from "../database/schema/vendors";
import {
  createUnauthorizedError,
  createForbiddenError,
  type AuthVariables,
} from "./auth";

export type VendorVariables = AuthVariables & { vendorId: string };

export const requireVendor = createMiddleware<{ Variables: VendorVariables }>(
  async (c, next) => {
    const user = c.get("user");
    if (!user) {
      throw createUnauthorizedError("Authentication required");
    }

    // One row by construction: vendor_users has a UNIQUE on user_id, so this
    // is a lookup, not a choice.
    const rows = await db
      .select({ vendorId: vendorUsers.vendorId, status: vendors.status })
      .from(vendorUsers)
      .innerJoin(vendors, eq(vendors.id, vendorUsers.vendorId))
      .where(eq(vendorUsers.userId, user.id))
      .limit(1);

    const link = rows[0];
    if (!link) {
      // Role without linkage is not a lesser permission — it is no permission.
      throw createForbiddenError("No vendor account is linked to this user");
    }

    if (link.status !== "active") {
      // Suspending a vendor suspends its logins. Inactive is refused too:
      // "not active" is the condition, not "suspended" specifically.
      throw createForbiddenError("This vendor account is not active");
    }

    c.set("vendorId", link.vendorId);
    await next();
  }
);
