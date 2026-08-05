/**
 * Wishlist API Routes
 *
 * - GET    /api/wishlist        - the user's saved products, hydrated
 * - GET    /api/wishlist/count  - just the number, for the header badge
 * - POST   /api/wishlist/merge        - fold a guest's local list in on sign-in
 * - POST   /api/wishlist/:productId   - save
 * - DELETE /api/wishlist/:productId   - unsave
 *
 * All endpoints require authentication.
 *
 * WHY THERE IS NO WISHLIST TABLE
 *
 * `users.wishlist_product_ids text[]` already existed with no routes over it.
 * A join table would be the better model — per-row timestamps, and a cheap
 * per-product save count for the PDP social proof mesonart shows ("49 saves").
 * An array column answers that second question with a sequential scan. Not
 * worth a migration for an affordance and a badge; revisit when Phase E wants
 * real saves counters.
 *
 * See docs/design/mesonart/PLAN-OF-ACTION.md, feature 1.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database";
import { products } from "../database/schema/products";
import { users } from "../database/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/auth";

// ============================================================================
// Validation
// ============================================================================

/**
 * Product ids land straight in a text[] with no foreign key behind them, so
 * nothing at the database level rejects a malformed value — it would simply
 * sit in the array forever, matching no product and inflating nothing but
 * confusion. This is the only gate.
 */
const productIdSchema = z.string().uuid();

/**
 * The body of a sign-in merge: whatever the guest saved in localStorage.
 *
 * The cap is not a product rule — it is the difference between a wishlist and
 * a payload someone hand-wrote to make Postgres build a 100k-element array.
 */
const mergeBodySchema = z.object({
  productIds: z.array(productIdSchema).max(500),
});

/**
 * The body of a reorder: the whole list, in its new order.
 *
 * Same cap as the merge, and for the same reason — this is the boundary
 * between a wishlist and a hand-written payload.
 */
const reorderBodySchema = z.object({
  productIds: z.array(productIdSchema).max(500),
});

// ============================================================================
// Router
// ============================================================================

export const wishlistApp = new Hono<{ Variables: AuthVariables }>();

wishlistApp.use("*", requireAuth);

/** The saved ids for the current user, treating a null column as empty. */
async function savedIdsFor(userId: string): Promise<string[]> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, wishlistProductIds: true },
  });
  // Rows predating the column carry null rather than the [] default.
  return row?.wishlistProductIds ?? [];
}

/**
 * GET /api/wishlist
 *
 * Hydrates the saved ids into product rows, in the same shape the product
 * cards already consume.
 */
/**
 * Saved ids to product rows, in the shape the product cards already consume.
 *
 * Inner join semantics on purpose: a product deleted from the catalogue leaves
 * a dangling id in every wishlist that held it, and there is no FK to cascade.
 * Dropping the miss beats 404ing the whole request over one stale entry.
 */
async function hydrate(ids: string[]) {
  if (ids.length === 0) return [];

  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      title: products.title,
      slug: products.slug,
      basePrice: products.basePrice,
      images: products.images,
      orientation: products.orientation,
      styles: products.styles,
      isFeatured: products.isFeatured,
      isAiGenerated: products.isAiGenerated,
    })
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.status, "active")));

  /**
   * Return them in the order the ARRAY holds, not the order Postgres happens
   * to return rows in.
   *
   * `inArray` places no ordering on the result, so this endpoint used to hand
   * back an effectively arbitrary sequence. The client sets its `ids` from
   * this response, which meant a signed-in shopper's "saved order" was
   * whatever the planner produced — and once reordering existed, dragging a
   * card would have appeared to do nothing after a reload.
   *
   * Sorted here rather than with `array_position` in SQL because the miss case
   * has to be handled anyway: a product deleted from the catalogue leaves a
   * dangling id with no row to sort, and dropping it is already this
   * function's contract.
   */
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

wishlistApp.get("/", async (c) => {
  const user = c.get("user");

  try {
    const items = await hydrate(await savedIdsFor(user.id));
    return c.json({ items });
  } catch (error) {
    console.error("Failed to load wishlist:", error);
    return c.json({ error: "Failed to load wishlist" }, 500);
  }
});

/**
 * GET /api/wishlist/count
 *
 * Separate from the list so the header badge does not pull a product join on
 * every page. Counts LIVE products rather than raw array entries — otherwise
 * a dangling id makes the badge say 2 while the list shows 1.
 */
wishlistApp.get("/count", async (c) => {
  const user = c.get("user");

  try {
    const ids = await savedIdsFor(user.id);
    if (ids.length === 0) {
      return c.json({ count: 0 });
    }

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.status, "active")));

    return c.json({ count: result[0]?.count ?? 0 });
  } catch (error) {
    console.error("Failed to count wishlist:", error);
    return c.json({ error: "Failed to count wishlist" }, 500);
  }
});

/**
 * POST /api/wishlist/:productId
 *
 * Idempotent. The UI is an optimistic toggle, so a double-click must not 409
 * or produce a duplicate entry.
 *
 * The append is done in SQL rather than read-modify-write: two concurrent
 * saves from two tabs would otherwise each read the old array and the second
 * would clobber the first. `array_append` guarded by a containment check is
 * atomic and idempotent in one statement.
 */
/**
 * POST /api/wishlist/replace
 *
 * Swap the whole list for a different one. Used when staff load a collection's
 * members in to rearrange them.
 *
 * ## Why this is not PUT /api/wishlist
 *
 * `PUT` refuses ANY change to the set — its permutation guard exists so a tab
 * left open since before an item was saved elsewhere cannot silently drop it.
 * Loading a collection is exactly a set change, so it cannot go through that
 * door, and loosening the guard would reopen the hole it closed.
 *
 * Two operations, two endpoints: reordering stays absolutely guarded, and
 * replacement is opt-in and named for what it does. Do not merge them.
 *
 * MUST be registered before `/:productId` — both are POST, Hono matches in
 * registration order, and "replace" is not a uuid, so the param route would
 * answer 400 for every call. Same trap as `/merge`.
 */
wishlistApp.post(
  "/replace",
  zValidator("json", reorderBodySchema),
  async (c) => {
    const user = c.get("user");
    const { productIds } = c.req.valid("json");

    if (new Set(productIds).size !== productIds.length) {
      return c.json({ error: "Duplicate product ids" }, 400);
    }

    try {
      /**
       * Every id checked against the catalogue before anything is written. A
       * wishlist full of ids matching no product renders as an empty page with
       * a non-zero badge — the same mismatch `/count` already works to avoid.
       */
      if (productIds.length > 0) {
        const found = await db
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, productIds));

        const known = new Set(found.map((row) => row.id));
        const unknown = productIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          return c.json({ error: "Unknown product ids", unknown }, 400);
        }
      }

      await db
        .update(users)
        .set({ wishlistProductIds: productIds })
        .where(eq(users.id, user.id));

      return c.json({ productIds });
    } catch (error) {
      console.error("Failed to replace wishlist:", error);
      return c.json({ error: "Failed to replace wishlist" }, 500);
    }
  }
);

/**
 * POST /api/wishlist/merge
 *
 * Signing in folds the guest's localStorage list into the account. The result
 * is a UNION: an id the account already holds is never dropped because the
 * guest list lacked it, since the guest list is one device's opinion and the
 * account is every device's.
 *
 * MUST be registered before `/:productId` — both are POST, Hono matches in
 * registration order, and "merge" is not a uuid, so the param route would
 * answer 400 for every sign-in.
 *
 * The union runs in SQL for the same reason the single add does: two tabs
 * signing in at once would otherwise each read the old array and the second
 * would clobber the first. `returning` hands back the post-merge column, so
 * the response reflects what the database actually holds rather than what this
 * request happened to send.
 */
wishlistApp.post("/merge", async (c) => {
  const user = c.get("user");

  const body = await c.req.json().catch(() => null);
  const parsed = mergeBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid product ids" }, 400);
  }
  const { productIds } = parsed.data;

  try {
    // Nothing local to contribute — the common case, and not worth a write.
    if (productIds.length === 0) {
      return c.json({ items: await hydrate(await savedIdsFor(user.id)) });
    }

    // Bound parameters, not an interpolated string: zod having already
    // rejected non-uuids is a reason this is safe today, not a reason to build
    // SQL by concatenation.
    const incoming = sql`ARRAY[${sql.join(
      productIds.map((id) => sql`${id}`),
      sql`, `
    )}]::text[]`;

    const rows = await db
      .update(users)
      .set({
        wishlistProductIds: sql`
          COALESCE(${users.wishlistProductIds}, '{}') || ARRAY(
            SELECT DISTINCT candidate
            FROM unnest(${incoming}) AS candidate
            WHERE NOT COALESCE(${users.wishlistProductIds}, '{}') @> ARRAY[candidate]
          )
        `,
      })
      .where(eq(users.id, user.id))
      .returning({ wishlistProductIds: users.wishlistProductIds });

    const merged = rows[0]?.wishlistProductIds ?? [];
    return c.json({ items: await hydrate(merged) });
  } catch (error) {
    console.error("Failed to merge wishlist:", error);
    return c.json({ error: "Failed to merge wishlist" }, 500);
  }
});

wishlistApp.post("/:productId", async (c) => {
  const user = c.get("user");
  const parsed = productIdSchema.safeParse(c.req.param("productId"));

  if (!parsed.success) {
    return c.json({ error: "Invalid product id" }, 400);
  }
  const productId = parsed.data;

  try {
    await db
      .update(users)
      .set({
        wishlistProductIds: sql`
          CASE
            WHEN COALESCE(${users.wishlistProductIds}, '{}') @> ARRAY[${productId}]::text[]
              THEN ${users.wishlistProductIds}
            ELSE array_append(COALESCE(${users.wishlistProductIds}, '{}'), ${productId})
          END
        `,
      })
      .where(eq(users.id, user.id));

    return c.json({ saved: true, productId });
  } catch (error) {
    console.error("Failed to add to wishlist:", error);
    return c.json({ error: "Failed to add to wishlist" }, 500);
  }
});

/**
 * DELETE /api/wishlist/:productId
 *
 * Idempotent for the same reason as POST. `array_remove` on an absent value
 * is a no-op, so this needs no guard.
 */
wishlistApp.delete("/:productId", async (c) => {
  const user = c.get("user");
  const parsed = productIdSchema.safeParse(c.req.param("productId"));

  if (!parsed.success) {
    return c.json({ error: "Invalid product id" }, 400);
  }
  const productId = parsed.data;

  try {
    await db
      .update(users)
      .set({
        wishlistProductIds: sql`array_remove(COALESCE(${users.wishlistProductIds}, '{}'), ${productId})`,
      })
      .where(eq(users.id, user.id));

    return c.json({ saved: false, productId });
  } catch (error) {
    console.error("Failed to remove from wishlist:", error);
    return c.json({ error: "Failed to remove from wishlist" }, 500);
  }
});

/**
 * PUT /api/wishlist
 *
 * Rewrite the saved order. `wishlist_product_ids` is a `text[]`, so the array
 * order IS the order and a reorder is a single write — no position column, no
 * per-row updates.
 *
 * ## Why this refuses anything but a permutation
 *
 * A plain "replace the array" endpoint is a data-loss bug wearing a feature's
 * clothes. A tab left open since before the shopper saved something on their
 * phone still holds the old list; dragging one card there would post that list
 * and silently delete the newer item.
 *
 * So the write is accepted only when the incoming ids are the same SET as the
 * stored ones. That is exactly what a reorder is, and never what a stale write
 * is — the guard rejects nothing legitimate. A mismatch returns 409 carrying
 * the current list, so the client resyncs instead of overwriting.
 *
 * Adding and removing stay on POST/DELETE `/:productId`, which mutate the
 * array in place and cannot clobber a concurrent write. This endpoint is only
 * for order.
 */
wishlistApp.put("/", zValidator("json", reorderBodySchema), async (c) => {
  const user = c.get("user");
  const { productIds } = c.req.valid("json");

  try {
    const saved = await savedIdsFor(user.id);

    /**
     * Same multiset, not merely the same set: `[A, A, B]` shares a set with
     * `[A, B]` but is not a permutation of it, and de-duplicating silently
     * would make the response disagree with what was written.
     */
    const isPermutation =
      productIds.length === saved.length &&
      [...productIds].sort().join(" ") === [...saved].sort().join(" ");

    if (!isPermutation) {
      return c.json(
        {
          error: "The list has changed since it was loaded",
          productIds: saved,
        },
        409
      );
    }

    await db
      .update(users)
      .set({ wishlistProductIds: productIds })
      .where(eq(users.id, user.id));

    return c.json({ productIds });
  } catch (error) {
    console.error("Failed to reorder wishlist:", error);
    return c.json({ error: "Failed to reorder wishlist" }, 500);
  }
});

export default wishlistApp;
