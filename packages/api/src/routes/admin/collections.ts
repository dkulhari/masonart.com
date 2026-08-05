/**
 * Admin Collections API.
 *
 * - GET    /api/admin/collections      list, including inactive, with counts
 * - GET    /api/admin/collections/:id  one row, for the edit form
 * - POST   /api/admin/collections      create
 * - PATCH  /api/admin/collections/:id  update
 * - DELETE /api/admin/collections/:id  delete, cascading manual membership
 *
 * Behind the same role gate as `/api/admin/products`: a collection is
 * catalogue content, so whoever can edit products can edit these.
 *
 * ## Cache busting is not optional here
 *
 * The rail this feeds used to be derived from a constants file, so the endpoint
 * it replaced had no invalidation to do — its input could only change with a
 * deploy. This one's input is a table an admin edits at runtime, and the public
 * payload is cached for five minutes. Every write below busts the public keys,
 * or the storefront keeps serving the old rail for the rest of the TTL.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import {
  createCollectionSchema,
  updateCollectionSchema,
} from "@chobii/shared";

import { db } from "../../database";
import { collections } from "../../database/schema/collections";
import { countCollection } from "../../lib/collection-resolver";
import {
  requireAuth,
  requireContentManager,
  type AuthVariables,
} from "../../middleware/auth";
import { deleteCached, CacheKeys } from "../../lib/redis";

export const adminCollectionsApp = new Hono<{ Variables: AuthVariables }>();

adminCollectionsApp.use("*", requireAuth);
adminCollectionsApp.use("*", requireContentManager);

/**
 * Postgres unique-violation.
 *
 * Translated to a 409 naming the offending slug rather than allowed to surface
 * as a 500 — the admin needs to know which slug is taken, and "internal server
 * error" tells them to file a bug instead of picking another name.
 */
const UNIQUE_VIOLATION = "23505";

/**
 * Drizzle WRAPS the driver error. Checking `error.code` alone matches nothing:
 * the thrown object carries `{ query, params, cause, stack }` and the postgres
 * code sits on `error.cause.code`. Verified against the live database — an
 * insert colliding on `collections_slug_unique` produces
 * `code: undefined` at the top level and `cause.code: '23505'` beneath.
 *
 * Both are checked, because the unwrapped shape is what a direct driver call
 * would throw and there is no reason to be brittle about which layer raised it.
 */
const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const top = (error as { code?: string }).code;
  const cause = (error as { cause?: { code?: string } }).cause?.code;
  return top === UNIQUE_VIOLATION || cause === UNIQUE_VIOLATION;
};

/**
 * Drop every cached public collections payload.
 *
 * Prefix-wide rather than key-by-key: the public list is keyed by its query
 * (`discover=true` today, more later), and an admin write can change what any
 * of them would return.
 */
async function bustCollectionCache(slug?: string): Promise<void> {
  await deleteCached(`${CacheKeys.COLLECTION}list:discover=true`);
  await deleteCached(`${CacheKeys.COLLECTION}list:discover=false`);
  if (slug) await deleteCached(`${CacheKeys.COLLECTION}detail:${slug}`);
}

// ============================================================================
// GET / — list
// ============================================================================

adminCollectionsApp.get("/", async (c) => {
  try {
    /**
     * No `isActive` filter, unlike the public endpoint. An admin who
     * deactivated a collection still has to be able to find it again.
     */
    const rows = await db
      .select()
      .from(collections)
      .orderBy(asc(collections.sortOrder), asc(collections.title));

    /**
     * Counts come from the resolver, so the admin list and the storefront
     * agree about what a rule resolves to. A rule matching nothing is the
     * failure worth surfacing here rather than on the storefront.
     */
    const withCounts = [];
    for (const row of rows) {
      withCounts.push({ ...row, count: await countCollection(row) });
    }

    return c.json({ collections: withCounts });
  } catch (error) {
    console.error("Error listing collections:", error);
    return c.json({ error: "Failed to list collections" }, 500);
  }
});

// ============================================================================
// GET /:id — one row for the edit form
// ============================================================================

adminCollectionsApp.get("/:id", async (c) => {
  try {
    const [row] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, c.req.param("id")))
      .limit(1);

    if (!row) return c.json({ error: "Collection not found" }, 404);

    return c.json({ collection: { ...row, count: await countCollection(row) } });
  } catch (error) {
    console.error("Error fetching collection:", error);
    return c.json({ error: "Failed to fetch collection" }, 500);
  }
});

// ============================================================================
// POST / — create
// ============================================================================

adminCollectionsApp.post(
  "/",
  zValidator("json", createCollectionSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      const [row] = await db
        .insert(collections)
        .values({
          slug: input.slug,
          title: input.title,
          subtitle: input.subtitle ?? null,
          description: input.description ?? null,
          kind: input.kind,
          rule: input.rule ?? null,
          imageUrl: input.imageUrl ?? null,
          isActive: input.isActive,
          showInDiscover: input.showInDiscover,
          discoverOrder: input.discoverOrder ?? null,
          sortOrder: input.sortOrder,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
        })
        .returning();

      await bustCollectionCache(input.slug);

      return c.json({ collection: row }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return c.json(
          { error: "A collection with that slug already exists", slug: input.slug },
          409
        );
      }
      console.error("Error creating collection:", error);
      return c.json({ error: "Failed to create collection" }, 500);
    }
  }
);

// ============================================================================
// PATCH /:id — update
// ============================================================================

adminCollectionsApp.patch(
  "/:id",
  zValidator("json", updateCollectionSchema),
  async (c) => {
    const input = c.req.valid("json");
    const id = c.req.param("id");

    /**
     * Only the supplied keys are written. `undefined` means "not being
     * changed"; an explicit `null` means "clear it", and the two must stay
     * distinguishable or a patch that renames a collection would also wipe its
     * image.
     */
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "slug",
      "title",
      "subtitle",
      "description",
      "kind",
      "rule",
      "imageUrl",
      "isActive",
      "showInDiscover",
      "discoverOrder",
      "sortOrder",
      "seoTitle",
      "seoDescription",
    ] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }

    try {
      const [row] = await db
        .update(collections)
        .set(patch)
        .where(eq(collections.id, id))
        .returning();

      if (!row) return c.json({ error: "Collection not found" }, 404);

      await bustCollectionCache(row.slug);

      return c.json({ collection: row });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return c.json(
          {
            error: "A collection with that slug already exists",
            slug: input.slug,
          },
          409
        );
      }
      console.error("Error updating collection:", error);
      return c.json({ error: "Failed to update collection" }, 500);
    }
  }
);

// ============================================================================
// DELETE /:id
// ============================================================================

adminCollectionsApp.delete("/:id", async (c) => {
  try {
    /**
     * `collection_products` cascades on the foreign key, so manual membership
     * goes with it — no orphan rows to sweep, and no second statement that
     * could fail after the parent is gone.
     */
    const [row] = await db
      .delete(collections)
      .where(eq(collections.id, c.req.param("id")))
      .returning();

    if (!row) return c.json({ error: "Collection not found" }, 404);

    await bustCollectionCache(row.slug);

    return c.json({ success: true, id: row.id });
  } catch (error) {
    console.error("Error deleting collection:", error);
    return c.json({ error: "Failed to delete collection" }, 500);
  }
});

export default adminCollectionsApp;
