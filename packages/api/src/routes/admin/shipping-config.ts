/**
 * Admin Shipping Configuration Routes
 *
 * - GET /api/admin/shipping-config - the threshold in force, who set it, when,
 *   and anything already scheduled to replace it
 * - PUT /api/admin/shipping-config - set the free-shipping threshold
 *
 * Follows `routes/admin/wallet-config.ts`, which is the repo's precedent for an
 * effective-dated key/value config edited by an admin. Three deliberate
 * departures from it, all of them because of what this particular value is:
 *
 * 1. **Whole rupees, no unit hop.** `walletPricingConfig` stores paise, because
 *    its figures are derived and a paisa matters. This one is a *displayed*
 *    number — the same figure the storefront prints as "Free shipping on orders
 *    over ₹999" — so it is stored exactly as `FREE_SHIPPING_THRESHOLD` is
 *    written (#569, schema/shipping.ts). The form posts rupees, the table holds
 *    rupees, the copy prints rupees. A conversion anywhere in that chain is a
 *    100x pricing bug waiting for someone to add it.
 *
 * 2. **A scheduled row is not clobbered.** wallet-config ends *every* open row
 *    for the key on write. Here that would silently delete a threshold an admin
 *    scheduled for a sale weekend, with nothing in the response to say so.
 *    Only the row actually in force at the new value's start is closed; rows
 *    that start later survive, and come back in `warnings` so the admin is told
 *    their new value has an expiry they did not set.
 *
 * 3. **Reads bypass the cache.** `resolveFreeShippingThreshold` goes to the
 *    table, not to Redis, so an edit is visible on reload instead of appearing
 *    not to have saved for up to five minutes.
 *
 * Cache invalidation goes through `invalidateFreeShippingThreshold`, which owns
 * the key and calls `deleteCached` on one complete key with no wildcard in it —
 * the mistake `tests/routes/admin/shipping-cache-purge.test.ts` guards this
 * directory against.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";

import { db } from "../../database";
import { recordAudit } from "../../lib/audit";
import { shippingConfig } from "../../database/schema/shipping";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import { FREE_SHIPPING_THRESHOLD_WARN_ABOVE } from "@chobii/shared";
import {
  SHIPPING_CONFIG_DEFAULTS,
  SHIPPING_CONFIG_KEYS,
  invalidateFreeShippingThreshold,
  resolveFreeShippingThreshold,
} from "../../lib/shipping-config";

// ============================================================================
// Validation
// ============================================================================

/**
 * Rupees, whole, not negative.
 *
 * `.int()` and `.nonnegative()` rather than `.positive()`: a negative or
 * fractional threshold is meaningless, but **0 is a legitimate setting** —
 * "everything ships free" — and #569 went out of its way to honour a configured
 * 0 rather than let it fall back to 999. Rejecting it here would put the API
 * and the accessor in disagreement about what the table may contain. It warns
 * instead.
 */
const updateThresholdSchema = z.object({
  value: z.coerce
    .number({ invalid_type_error: "value must be a number" })
    .int("value must be a whole number of rupees")
    .nonnegative("value must not be negative"),
  description: z.string().max(500).optional(),
  /** Omit for "now". A future date schedules the change; #569 honours it on read. */
  effectiveFrom: z.coerce.date().optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminShippingConfigApp = new Hono<{ Variables: AuthVariables }>();

adminShippingConfigApp.use("*", requireAuth, requireAdmin);

const KEY = SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD;

/** Rows for the key that start in the future, soonest first. */
async function scheduledRows(now: Date) {
  return db
    .select({
      id: shippingConfig.id,
      value: shippingConfig.valueInt,
      description: shippingConfig.description,
      effectiveFrom: shippingConfig.effectiveFrom,
      effectiveTo: shippingConfig.effectiveTo,
      createdAt: shippingConfig.createdAt,
      createdById: shippingConfig.createdBy,
      createdByName: users.name,
      createdByEmail: users.email,
    })
    .from(shippingConfig)
    .leftJoin(users, eq(users.id, shippingConfig.createdBy))
    .where(and(eq(shippingConfig.key, KEY), gt(shippingConfig.effectiveFrom, now)))
    .orderBy(asc(shippingConfig.effectiveFrom));
}

/** Who set the row in force, for the "who changed it, and when" line. */
async function creatorOf(userId: string | null) {
  if (!userId) return null;

  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ?? null;
}

// ============================================================================
// GET /api/admin/shipping-config
// ============================================================================

adminShippingConfigApp.get("/", async (c) => {
  try {
    const now = new Date();

    // The live resolve, not the cached accessor: an admin must be shown what
    // the table says. Showing them Redis makes a just-saved edit look lost.
    const resolved = await resolveFreeShippingThreshold(now);
    const scheduled = await scheduledRows(now);

    return c.json({
      key: KEY,
      /** Whole rupees. Same unit as the table, the copy and the charge. */
      value: resolved.value,
      /** Whether that came from a row or from the bundled constant. */
      source: resolved.source,
      defaultValue: SHIPPING_CONFIG_DEFAULTS[KEY],
      description: resolved.row?.description ?? null,
      effectiveFrom: resolved.row?.effectiveFrom ?? null,
      effectiveTo: resolved.row?.effectiveTo ?? null,
      updatedAt: resolved.row?.updatedAt ?? null,
      updatedBy: await creatorOf(resolved.row?.createdBy ?? null),
      /** When the answer next changes on the clock alone, if it does. */
      nextChangeAt: resolved.nextChangeAt,
      scheduled,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json(
      { error: `Failed to read shipping config: ${errorMessage}` },
      500
    );
  }
});

// ============================================================================
// PUT /api/admin/shipping-config
// ============================================================================

adminShippingConfigApp.put(
  "/",
  zValidator("json", updateThresholdSchema),
  async (c) => {
    const user = c.get("user");
    const { value, description, effectiveFrom } = c.req.valid("json");
    const startsAt = effectiveFrom ?? new Date();

    try {
      // Anything already scheduled to start at or after this value's start
      // would supersede it. It is NOT deleted — an admin who scheduled a sale
      // weekend meant it — but the response says so, because a new threshold
      // with an expiry nobody set is exactly the kind of surprise that ends up
      // as a pricing incident.
      const pending = await scheduledRows(startsAt);

      // Close only the row in force at `startsAt`. wallet-config ends every
      // open row for the key; that would silently drop `pending`.
      await db
        .update(shippingConfig)
        .set({ effectiveTo: startsAt, updatedAt: new Date() })
        .where(
          and(
            eq(shippingConfig.key, KEY),
            lte(shippingConfig.effectiveFrom, startsAt),
            or(
              isNull(shippingConfig.effectiveTo),
              gt(shippingConfig.effectiveTo, startsAt)
            )
          )
        );

      const [row] = await db
        .insert(shippingConfig)
        .values({
          key: KEY,
          valueInt: value,
          description:
            description ??
            "Net, post-discount rupee amount at or above which standard shipping is free",
          effectiveFrom: startsAt,
          createdBy: user.id,
        })
        .returning();

      // Immediately, rather than at the end of the accessor's TTL.
      await invalidateFreeShippingThreshold();

      const warnings: string[] = [];
      if (value === 0) {
        warnings.push(
          "A threshold of ₹0 gives every order free shipping, including a single postcard."
        );
      }
      if (value > FREE_SHIPPING_THRESHOLD_WARN_ABOVE) {
        warnings.push(
          `A threshold of ₹${value.toLocaleString(
            "en-IN"
          )} is high enough that almost no basket will qualify for free shipping.`
        );
      }
      for (const scheduled of pending) {
        warnings.push(
          `A change to ₹${scheduled.value.toLocaleString(
            "en-IN"
          )} is already scheduled for ${scheduled.effectiveFrom.toISOString()} and will replace this value then. It has been left in place.`
        );
      }

      // One money rule that every storefront surface prints, effective-dated.
      // The warnings go in too: "nobody said this would make every order free"
      // is answerable only if the warning shown at the time is on the record.
      await recordAudit(c, {
        action: "shipping_config.updated",
        entityType: "shipping_config",
        entityId: KEY,
        summary: `Free shipping threshold set to ${value}, effective ${startsAt.toISOString()}`,
        after: {
          key: KEY,
          valueInt: row?.valueInt ?? value,
          effectiveFrom: startsAt,
          description: row?.description ?? description ?? null,
        },
        metadata: { warnings, pendingCount: pending.length },
      });

      return c.json({
        message: "Free shipping threshold updated",
        config: {
          key: KEY,
          value: row?.valueInt ?? value,
          effectiveFrom: row?.effectiveFrom ?? startsAt,
          effectiveTo: row?.effectiveTo ?? null,
        },
        warnings,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // (key, effective_from) is unique: two edits at the same instant, or a
      // re-submitted form, land here rather than as a 500.
      if (/unique|duplicate key/i.test(errorMessage)) {
        return c.json(
          {
            error:
              "A shipping config row already exists with that effective-from time. Choose a different time.",
          },
          409
        );
      }

      return c.json(
        { error: `Failed to update shipping config: ${errorMessage}` },
        500
      );
    }
  }
);

export { adminShippingConfigApp };
export default adminShippingConfigApp;
