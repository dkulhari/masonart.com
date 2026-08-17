/**
 * Vendor Account Invite
 *
 * - POST /api/admin/vendors/:id/invite   { email, name?, contactId? }
 *
 * Vendors cannot self-register. There is no vendor sign-up form, no
 * self-service claim link, no OAuth route into the role — an admin invites a
 * supplier or that supplier has no login. This endpoint is therefore the ONLY
 * path to a vendor account, which is why most of it is refusals.
 *
 * **The account and the link are one unit.** The `vendor` role by itself
 * grants nothing: access comes from the `vendor_users` row plus the row
 * scoping in `lib/vendor-scope.ts`. A user with role `vendor` and no link is
 * refused by `requireVendor` — an account that can sign in and do absolutely
 * nothing, which from the outside is indistinguishable from a broken guard. So
 * the promotion and the link go in one transaction, and if that transaction
 * fails after Better Auth has already created the account, the account is
 * deleted again. Better Auth's signup cannot join our transaction (it manages
 * its own writes), so the cleanup is a compensating delete rather than a
 * rollback — the observable guarantee is the same: no orphan.
 *
 * **The account is minted through `auth.api.signUpEmail`, never by inserting
 * into `user` directly.** Better Auth has expectations about what a valid
 * account looks like — the credential row in `account`, the id format, the
 * hashing — and a hand-written row satisfies the foreign keys while being
 * unable to sign in. `database/init-super-admin.ts` takes the same route for
 * the same reason.
 *
 * **An existing customer account is never silently converted.** Promoting a
 * shopper's login to a vendor login is a privilege change against a real
 * person who did not ask for it, and it would also hand the supplier that
 * person's order history. Refused with a 409; if the same human really is both,
 * that is a second account with a second address.
 *
 * **A user already linked to a vendor is a 422.** `UNIQUE(user_id)` on
 * `vendor_users` would stop it anyway, but a constraint violation surfacing as
 * a 500 tells the admin to file a bug instead of telling them the account is
 * spoken for. The constraint is still there and still caught, for the race.
 *
 * Suspension is deliberately NOT handled here. `requireVendor` already refuses
 * a login whose vendor is not active; a second mechanism would be a second
 * thing to get wrong.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "../../database";
import { auth } from "../../auth";
import { users } from "../../database/schema/users";
import { vendors } from "../../database/schema/vendors";
import { vendorUsers } from "../../database/schema/vendor-users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import { isUniqueViolation } from "../../lib/pg-errors";

// ============================================================================
// Validation
// ============================================================================

const idParamSchema = z.object({ id: z.string().uuid() });

const inviteSchema = z.object({
  email: z.string().trim().email().max(200).toLowerCase(),
  name: z.string().trim().min(1).max(200).optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminVendorInviteApp = new Hono<{ Variables: AuthVariables }>();

adminVendorInviteApp.use("*", requireAuth, requireAdmin);

function failed(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { error: `Failed to ${action}: ${message}` } as const;
}

/**
 * A password nobody knows, including us.
 *
 * The vendor sets their own from the reset link below; this value exists only
 * because Better Auth's email signup requires one. Two UUIDs rather than one
 * so it comfortably clears any minimum length.
 */
function unusablePassword(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

const adminVendorInviteRoute = adminVendorInviteApp.post(
  "/:id/invite",
  zValidator("param", idParamSchema),
  zValidator("json", inviteSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { email, name } = c.req.valid("json");

    try {
      const [vendor] = await db
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(eq(vendors.id, id))
        .limit(1);

      if (!vendor) return c.json({ error: "Vendor not found" }, 404);

      const [existing] = await db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      // ---------------------------------------------------------------------
      // An account already exists for this address
      // ---------------------------------------------------------------------
      if (existing) {
        if (existing.role !== "vendor") {
          return c.json(
            {
              error: `An account already exists for ${email} with the role "${existing.role}". It will not be converted to a vendor login — invite a different address.`,
            },
            409
          );
        }

        const [link] = await db
          .select({ id: vendorUsers.id, vendorId: vendorUsers.vendorId })
          .from(vendorUsers)
          .where(eq(vendorUsers.userId, existing.id))
          .limit(1);

        if (link) {
          return c.json(
            {
              error:
                link.vendorId === id
                  ? `${email} is already linked to this vendor.`
                  : `${email} is already linked to another vendor. One user belongs to one vendor.`,
            },
            422
          );
        }

        // A vendor-role account with no link: exactly the orphan this endpoint
        // refuses to create. Adopting it is better than leaving it stranded.
        //
        // The read above is not a lock, so UNIQUE(user_id) is still the thing
        // that decides. Caught here so the loser of a race gets the same 422
        // as the caller who was merely too late, not a 500.
        let created;
        try {
          [created] = await db
            .insert(vendorUsers)
            .values({ vendorId: id, userId: existing.id })
            .returning();
        } catch (error) {
          if (isUniqueViolation(error)) {
            return c.json(
              { error: `${email} is already linked to a vendor. One user belongs to one vendor.` },
              422
            );
          }
          throw error;
        }

        return c.json(
          {
            message: "Existing vendor account linked",
            created: false,
            user: existing,
            link: created ?? { vendorId: id, userId: existing.id },
            passwordResetSent: false,
          },
          201
        );
      }

      // ---------------------------------------------------------------------
      // Mint a new account
      // ---------------------------------------------------------------------
      const signUp = await auth.api.signUpEmail({
        body: {
          email,
          password: unusablePassword(),
          name: name ?? vendor.name ?? email,
        },
      });

      const newUserId = signUp?.user?.id;
      if (!newUserId) {
        throw new Error("Better Auth returned no user for the invited address");
      }

      let invitedUser;
      try {
        invitedUser = await db.transaction(async (tx) => {
          // Better Auth creates every account as `customer`; the role is set
          // here, in the same transaction as the link, so the two can never
          // exist apart.
          const [promoted] = await tx
            .update(users)
            .set({ role: "vendor", status: "active", updatedAt: new Date() })
            .where(eq(users.id, newUserId))
            .returning({
              id: users.id,
              email: users.email,
              name: users.name,
              role: users.role,
            });

          const [link] = await tx
            .insert(vendorUsers)
            .values({ vendorId: id, userId: newUserId })
            .returning();

          return {
            user: promoted ?? { id: newUserId, email, name: name ?? email, role: "vendor" },
            link: link ?? { vendorId: id, userId: newUserId },
          };
        });
      } catch (error) {
        // Compensating delete: the transaction rolled back, but the account
        // Better Auth wrote is outside it. Leaving it behind would leave a
        // login that can do nothing.
        await db.delete(users).where(eq(users.id, newUserId));

        if (isUniqueViolation(error)) {
          return c.json(
            {
              error: `${email} could not be linked: that user is already linked to a vendor.`,
            },
            422
          );
        }
        throw error;
      }

      // Delivery of the credential is best-effort ON PURPOSE. The account and
      // the link are committed; failing the request now would send the admin
      // into a retry that answers 409. An un-sent mail is recoverable from the
      // ordinary password-reset flow, and the flag says which happened.
      let passwordResetSent = false;
      try {
        await auth.api.requestPasswordReset({
          body: {
            email,
            redirectTo: `${process.env.FRONTEND_URL || "http://localhost:3001"}/reset-password`,
          },
        });
        passwordResetSent = true;
      } catch (error) {
        console.error(`Vendor invite: could not send the set-password mail to ${email}`, error);
      }

      return c.json(
        {
          message: "Vendor account invited",
          created: true,
          user: invitedUser.user,
          link: invitedUser.link,
          passwordResetSent,
        },
        201
      );
    } catch (error) {
      return c.json(failed("invite vendor user", error), 500);
    }
  }
);

export { adminVendorInviteApp, adminVendorInviteRoute };
export default adminVendorInviteApp;
