/**
 * Admin CRUD for sale promotions.
 *
 * - GET    /api/admin/promotions          - list, with derived isActive
 * - POST   /api/admin/promotions          - create
 * - PATCH  /api/admin/promotions/:id      - update, replacing the membership sets
 * - POST   /api/admin/promotions/:id/enable | /disable
 * - DELETE /api/admin/promotions/:id
 *
 * Three rules govern this file.
 *
 * **Every mutating handler ends with `invalidatePricingCaches()`.** Two caches
 * hold a promotion's effects and neither expires on its own fast enough to be
 * left alone:
 *
 * - the resolver's 60s in-process active-promotion list, cleared by
 *   `invalidateActivePromotions()` — without it an admin who enables a sale
 *   watches the storefront ignore them for up to a minute and enables it again;
 * - the Redis product-response cache (300–900s), dropped by
 *   `purgeProductResponseCache()`. Product list, detail, featured and related
 *   bodies carry the resolved `sale` block, so without this the chrome turns
 *   over immediately while the *prices* stay pre-sale for the rest of the TTL —
 *   and stay discounted for the rest of it on the way back out (#525).
 *
 * **`isActive` is derived, never read.** There is no status column — see
 * database/schema/promotions.ts. The same row answers differently as the clock
 * moves, and `isPromotionActive` is the one place that decision is made.
 *
 * **Membership is replaced wholesale, inside a transaction.** The pinned and
 * excluded product sets are cleared and re-inserted together; a partial
 * replacement leaves stale ids that keep discounting products the admin just
 * removed.
 *
 * Unlike the storefront payload, `endsAt` IS serialized here. It is private to
 * customers (the countdown ships as a resolved deadline instead), but the admin
 * edit form cannot round-trip a date it is never told.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createPromotionInputSchema,
  updatePromotionInputSchema,
  type CreatePromotionInput,
} from "@chobii/shared";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../database";
import { products } from "../../database/schema/products";
import {
  promotionExclusions,
  promotionProducts,
  promotions,
} from "../../database/schema/promotions";
import {
  invalidateActivePromotions,
  isPromotionActive,
  type Promotion,
} from "../../lib/promotion-pricing";
import { purgeProductResponseCache } from "../../lib/redis";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";

// ============================================================================
// Cache invalidation
// ============================================================================

/**
 * Everything that has to forget a price, in the one place it can be kept
 * complete.
 *
 * Both caches, always, on every mutating path — including the ones that only
 * look like they change nothing. A disable that skipped the Redis purge would
 * leave the storefront selling a sale the admin just switched off, which is
 * the more expensive direction to be wrong in.
 *
 * Awaited before the handler responds, so an admin UI that refetches the
 * storefront the instant the save returns sees the new prices rather than the
 * ones it was trying to change.
 */
async function invalidatePricingCaches(): Promise<void> {
  invalidateActivePromotions();
  await purgeProductResponseCache();
}

// ============================================================================
// Serialization
// ============================================================================

type MembershipSets = {
  productIds: string[];
  excludedProductIds: string[];
};

const EMPTY_MEMBERSHIP: MembershipSets = {
  productIds: [],
  excludedProductIds: [],
};

/**
 * One row as the admin UI consumes it: the stored columns plus the derived
 * state and the two membership sets.
 */
function serialize(
  promotion: Promotion,
  membership: MembershipSets,
  now: Date
) {
  return {
    id: promotion.id,
    name: promotion.name,
    headline: promotion.headline,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    scopeType: promotion.scopeType,
    scopeFilter: promotion.scopeFilter ?? null,
    membersOnly: promotion.membersOnly,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    isEnabled: promotion.isEnabled,
    /** Derived from isEnabled + the window. No column backs this. */
    isActive: isPromotionActive(promotion, now),
    priority: promotion.priority,
    perCustomerOrderLimit: promotion.perCustomerOrderLimit,
    countdownMode: promotion.countdownMode,
    rollingWindowMinutes: promotion.rollingWindowMinutes,
    rollingJitterMinutes: promotion.rollingJitterMinutes,
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
    ...membership,
  };
}

/**
 * The membership rows for a set of promotions, in two queries rather than two
 * per row. Keyed by promotion id, unlike the resolver's flattened sets — the
 * admin list has to show which promotion owns which id.
 */
async function loadMembership(
  promotionIds: string[]
): Promise<Map<string, MembershipSets>> {
  const byId = new Map<string, MembershipSets>(
    promotionIds.map((id) => [id, { productIds: [], excludedProductIds: [] }])
  );
  if (promotionIds.length === 0) return byId;

  const [pinned, excluded] = await Promise.all([
    db
      .select({
        promotionId: promotionProducts.promotionId,
        productId: promotionProducts.productId,
      })
      .from(promotionProducts)
      .where(inArray(promotionProducts.promotionId, promotionIds)),
    db
      .select({
        promotionId: promotionExclusions.promotionId,
        productId: promotionExclusions.productId,
      })
      .from(promotionExclusions)
      .where(inArray(promotionExclusions.promotionId, promotionIds)),
  ]);

  for (const row of pinned) {
    byId.get(row.promotionId)?.productIds.push(row.productId);
  }
  for (const row of excluded) {
    byId.get(row.promotionId)?.excludedProductIds.push(row.productId);
  }
  return byId;
}

// ============================================================================
// Validation helpers
// ============================================================================

/**
 * Product ids the admin named that do not exist.
 *
 * Checked up front so a typo comes back as a 400 naming the ids rather than a
 * 500 from a foreign key violation halfway through the write.
 */
async function unknownProductIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await db
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, ids));
  const known = new Set(found.map((row) => row.id));
  return ids.filter((id) => !known.has(id));
}

/** The columns a create/update body maps onto, dates already parsed. */
function toColumns(input: CreatePromotionInput) {
  return {
    name: input.name,
    headline: input.headline,
    discountType: input.discountType,
    discountValue: input.discountValue,
    scopeType: input.scopeType,
    scopeFilter: input.scopeFilter ?? null,
    membersOnly: input.membersOnly,
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    isEnabled: input.isEnabled,
    priority: input.priority,
    perCustomerOrderLimit: input.perCustomerOrderLimit ?? null,
    countdownMode: input.countdownMode,
    rollingWindowMinutes: input.rollingWindowMinutes,
    rollingJitterMinutes: input.rollingJitterMinutes,
  };
}

/** Deduplicated so a repeated id cannot trip the composite primary key. */
function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}

// ============================================================================
// Route Handler
// ============================================================================

export const adminPromotionsApp = new Hono<{ Variables: AuthVariables }>();

adminPromotionsApp.use("*", requireAuth);
adminPromotionsApp.use("*", requireAdmin);

// ============================================================================
// GET / - list with derived active state
// ============================================================================

adminPromotionsApp.get("/", async (c) => {
  const now = new Date();

  // Tiny table, admin-only: no pagination, ordered so a running sale is near
  // the top and the newest edit is easy to find.
  const rows = await db
    .select()
    .from(promotions)
    .orderBy(desc(promotions.priority), desc(promotions.createdAt));

  const membership = await loadMembership(rows.map((row) => row.id));

  return c.json(
    rows.map((row) =>
      serialize(row, membership.get(row.id) ?? EMPTY_MEMBERSHIP, now)
    )
  );
});

// ============================================================================
// POST / - create
// ============================================================================

adminPromotionsApp.post(
  "/",
  zValidator("json", createPromotionInputSchema),
  async (c) => {
    const input = c.req.valid("json");
    const pinned = uniqueIds(input.productIds);
    const excluded = uniqueIds(input.excludedProductIds);

    const unknown = await unknownProductIds([
      ...new Set([...pinned, ...excluded]),
    ]);
    if (unknown.length > 0) {
      return c.json({ error: "Unknown product ids", unknown }, 400);
    }

    const user = c.get("user");

    // One transaction: a promotion must never be observable without the
    // membership rows that decide what it applies to.
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(promotions)
        .values({ ...toColumns(input), createdBy: user?.id ?? null })
        .returning();
      if (!row) throw new Error("Promotion insert returned no row");

      if (pinned.length > 0) {
        await tx
          .insert(promotionProducts)
          .values(pinned.map((productId) => ({ promotionId: row.id, productId })));
      }
      if (excluded.length > 0) {
        await tx
          .insert(promotionExclusions)
          .values(
            excluded.map((productId) => ({ promotionId: row.id, productId }))
          );
      }
      return row;
    });

    await invalidatePricingCaches();

    return c.json(
      serialize(
        created,
        { productIds: pinned, excludedProductIds: excluded },
        new Date()
      ),
      201
    );
  }
);

// ============================================================================
// PATCH /:id - update, replacing the membership sets
// ============================================================================

adminPromotionsApp.patch(
  "/:id",
  zValidator("json", updatePromotionInputSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const pinned = uniqueIds(input.productIds);
    const excluded = uniqueIds(input.excludedProductIds);

    const [existing] = await db
      .select({ id: promotions.id })
      .from(promotions)
      .where(eq(promotions.id, id));
    if (!existing) {
      return c.json(
        { error: "NotFound", message: "Promotion not found", code: "NOT_FOUND" },
        404
      );
    }

    const unknown = await unknownProductIds([
      ...new Set([...pinned, ...excluded]),
    ]);
    if (unknown.length > 0) {
      return c.json({ error: "Unknown product ids", unknown }, 400);
    }

    /**
     * Clear and re-insert both sets inside the same transaction as the update.
     * Deleting and inserting outside one would leave a window where a sitewide
     * promotion has lost its exclusions, and a failure between the two would
     * make that permanent.
     */
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(promotions)
        .set(toColumns(input))
        .where(eq(promotions.id, id))
        .returning();
      if (!row) throw new Error("Promotion update returned no row");

      await tx
        .delete(promotionProducts)
        .where(eq(promotionProducts.promotionId, id));
      await tx
        .delete(promotionExclusions)
        .where(eq(promotionExclusions.promotionId, id));

      if (pinned.length > 0) {
        await tx
          .insert(promotionProducts)
          .values(pinned.map((productId) => ({ promotionId: id, productId })));
      }
      if (excluded.length > 0) {
        await tx
          .insert(promotionExclusions)
          .values(excluded.map((productId) => ({ promotionId: id, productId })));
      }
      return row;
    });

    await invalidatePricingCaches();

    return c.json(
      serialize(
        updated,
        { productIds: pinned, excludedProductIds: excluded },
        new Date()
      )
    );
  }
);

// ============================================================================
// POST /:id/enable | /:id/disable
// ============================================================================

/**
 * Enable and disable are their own endpoints rather than a PATCH field.
 * Flipping a live sale off is the one action an admin takes in a hurry, and it
 * should not require sending back a whole valid promotion body to do it.
 */
async function setEnabled(id: string, isEnabled: boolean) {
  const [row] = await db
    .update(promotions)
    .set({ isEnabled })
    .where(eq(promotions.id, id))
    .returning();
  return row;
}

adminPromotionsApp.post("/:id/enable", async (c) => {
  const row = await setEnabled(c.req.param("id"), true);
  if (!row) {
    return c.json(
      { error: "NotFound", message: "Promotion not found", code: "NOT_FOUND" },
      404
    );
  }

  await invalidatePricingCaches();

  const membership = await loadMembership([row.id]);
  return c.json(
    serialize(row, membership.get(row.id) ?? EMPTY_MEMBERSHIP, new Date())
  );
});

adminPromotionsApp.post("/:id/disable", async (c) => {
  const row = await setEnabled(c.req.param("id"), false);
  if (!row) {
    return c.json(
      { error: "NotFound", message: "Promotion not found", code: "NOT_FOUND" },
      404
    );
  }

  await invalidatePricingCaches();

  const membership = await loadMembership([row.id]);
  return c.json(
    serialize(row, membership.get(row.id) ?? EMPTY_MEMBERSHIP, new Date())
  );
});

// ============================================================================
// DELETE /:id
// ============================================================================

adminPromotionsApp.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Membership rows cascade (onDelete: 'cascade' in the schema), so this is
  // one statement rather than a transaction.
  const [deleted] = await db
    .delete(promotions)
    .where(eq(promotions.id, id))
    .returning({ id: promotions.id });

  if (!deleted) {
    return c.json(
      { error: "NotFound", message: "Promotion not found", code: "NOT_FOUND" },
      404
    );
  }

  await invalidatePricingCaches();

  return c.json({ success: true, id });
});
