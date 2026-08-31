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
import { asc, eq, inArray } from "drizzle-orm";
import {
  createCollectionSchema,
  updateCollectionSchema,
  collectionMembersSchema,
  discoverOrderSchema,
} from "@chobii/shared";

import { db } from "../../database";
import { diffRecords, recordAudit } from "../../lib/audit";
import {
  collections,
  collectionProducts,
} from "../../database/schema/collections";
import { products } from "../../database/schema/products";
import {
  countCollection,
  resolveManualMembers,
} from "../../lib/collection-resolver";
import {
  requireAuth,
  requireContentManager,
  type AuthVariables,
} from "../../middleware/auth";
import { deleteCached, CacheKeys } from "../../lib/redis";
import { isUniqueViolation } from "../../lib/pg-errors";

export const adminCollectionsApp = new Hono<{ Variables: AuthVariables }>();

adminCollectionsApp.use("*", requireAuth);
adminCollectionsApp.use("*", requireContentManager);

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
// PUT /discover-order — rewrite the rail's order
// ============================================================================

/**
 * Registered BEFORE `/:id`. `discover-order` is a literal segment, and Hono
 * matches in registration order — below `/:id` it would be read as a
 * collection id. Same trap `products.ts` documents for `/facets`.
 */
adminCollectionsApp.put(
  "/discover-order",
  zValidator("json", discoverOrderSchema),
  async (c) => {
    const { collectionIds } = c.req.valid("json");

    if (new Set(collectionIds).size !== collectionIds.length) {
      return c.json({ error: "Duplicate collection ids" }, 400);
    }

    try {
      /**
       * Every id checked up front, so a bad one fails before any write rather
       * than partway through the reorder.
       */
      /**
       * `discoverOrder` is selected as well as `id` because it is the ONLY
       * record of the order being replaced. The reorder overwrites it in place,
       * so read here or the previous rail is unrecoverable a statement later.
       */
      let previousOrder: string[] = [];
      if (collectionIds.length > 0) {
        const found = await db
          .select({ id: collections.id, discoverOrder: collections.discoverOrder })
          .from(collections)
          .where(inArray(collections.id, collectionIds));

        const known = new Set(found.map((row) => row.id));
        const unknown = collectionIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          return c.json({ error: "Unknown collection ids", unknown }, 400);
        }

        previousOrder = [...found]
          .sort((a, b) => (a.discoverOrder ?? 0) - (b.discoverOrder ?? 0))
          .map((row) => row.id);
      }

      /**
       * One transaction, not a loop of updates.
       *
       * A per-row loop that fails halfway leaves the rail in an order that
       * never existed and that nobody chose — worse than either the old order
       * or the new one.
       */
      await db.transaction(async (tx) => {
        for (const [index, id] of collectionIds.entries()) {
          await tx
            .update(collections)
            .set({ discoverOrder: index, updatedAt: new Date() })
            .where(eq(collections.id, id));
        }
      });

      await bustCollectionCache();

      /**
       * One row for the rail, not one per collection: this is a single decision
       * about an ordering, and N rows would make the timeline read as N edits.
       * `entityId` is null for the same reason — the entity is the rail.
       */
      await recordAudit(c, {
        action: "collection.updated",
        entityType: "collection",
        entityId: null,
        summary: `Reordered the discover rail (${collectionIds.length} collections)`,
        before: { discoverOrder: previousOrder },
        after: { discoverOrder: collectionIds },
      });

      return c.json({ success: true, ordered: collectionIds.length });
    } catch (error) {
      console.error("Error reordering collections:", error);
      return c.json({ error: "Failed to reorder collections" }, 500);
    }
  }
);

// ============================================================================
// PUT /:id/products — replace manual membership
// ============================================================================

/**
 * Whole-list replace, not per-row add and remove.
 *
 * The position is the only thing distinguishing a curated list from a set, and
 * incremental edits make position arithmetic the client's problem — every
 * caller would have to renumber, and they would each do it slightly wrong.
 */
adminCollectionsApp.put(
  "/:id/products",
  zValidator("json", collectionMembersSchema),
  async (c) => {
    const { productIds } = c.req.valid("json");
    const id = c.req.param("id");

    if (new Set(productIds).size !== productIds.length) {
      return c.json({ error: "Duplicate product ids" }, 400);
    }

    try {
      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, id))
        .limit(1);

      if (!collection) return c.json({ error: "Collection not found" }, 404);

      /**
       * A rule collection already has a membership rule. Giving it an explicit
       * list too is the same "two sources of membership" the shared schema
       * refuses on kind/rule — whichever the resolver honours, the other is a
       * lie the admin can still see and edit.
       */
      if (collection.kind !== "manual") {
        return c.json(
          { error: "Only a manual collection can have an explicit member list" },
          400
        );
      }

      if (productIds.length > 0) {
        const found = await db
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, productIds));

        const known = new Set(found.map((row) => row.id));
        const unknown = productIds.filter((pid) => !known.has(pid));
        if (unknown.length > 0) {
          return c.json({ error: "Unknown product ids", unknown }, 400);
        }
      }

      /**
       * Clear and re-insert inside one transaction. A collection must never be
       * observable as empty midway through a reorder.
       */
      const previousMembers = await db.transaction(async (tx) => {
        // RETURNING on the clear, rather than a SELECT before it: the rows are
        // read and removed in one statement inside the same transaction, so
        // there is no window where the two could disagree about what was there.
        const cleared = await tx
          .delete(collectionProducts)
          .where(eq(collectionProducts.collectionId, id))
          .returning({
            productId: collectionProducts.productId,
            position: collectionProducts.position,
          });

        if (productIds.length > 0) {
          await tx.insert(collectionProducts).values(
            productIds.map((productId, position) => ({
              collectionId: id,
              productId,
              position,
            }))
          );
        }

        return [...cleared]
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((row) => row.productId);
      });

      await bustCollectionCache(collection.slug);

      // A whole-list replace: what LEFT the collection is only visible here.
      await recordAudit(c, {
        action: "collection.updated",
        entityType: "collection",
        entityId: collection.id,
        summary: `Set the member list of '${collection.slug}' to ${productIds.length} product(s)`,
        before: { productIds: previousMembers },
        after: { productIds },
      });

      return c.json({ success: true, members: productIds.length });
    } catch (error) {
      console.error("Error setting collection members:", error);
      return c.json({ error: "Failed to set collection members" }, 500);
    }
  }
);

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

    /**
     * Manual membership travels WITH the row.
     *
     * The edit form replaces the member list on save, so a form that loaded
     * without it would post an empty array and wipe the curation — which is
     * exactly what happened the first time a collection was staged from the
     * wishlist. Reading it here is what makes the round trip non-destructive.
     */
    const productIds =
      row.kind === "manual" ? await resolveManualMembers(row.id) : [];

    return c.json({
      collection: { ...row, count: await countCollection(row), productIds },
    });
  } catch (error) {
    console.error("Error fetching collection:", error);
    return c.json({ error: "Failed to fetch collection" }, 500);
  }
});

/**
 * The keys a `collection.updated` delta reports on. Deliberately the same set
 * the PATCH handler writes, minus `updatedAt` — a timestamp that moves on every
 * patch would make every row look like a change and bury the one that was.
 */
const AUDITED_COLLECTION_KEYS = [
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
] as const;

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
      // Read before the write, so the audit row can carry a delta rather than
      // the whole record. A patch touches a handful of keys out of thirteen.
      const [before] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, id))
        .limit(1);

      if (!before) return c.json({ error: "Collection not found" }, 404);

      const [row] = await db
        .update(collections)
        .set(patch)
        .where(eq(collections.id, id))
        .returning();

      if (!row) return c.json({ error: "Collection not found" }, 404);

      await bustCollectionCache(row.slug);

      const delta = diffRecords(
        before as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        // `updatedAt` moves on every patch and says nothing about intent.
        AUDITED_COLLECTION_KEYS
      );

      await recordAudit(c, {
        action: "collection.updated",
        entityType: "collection",
        entityId: row.id,
        summary: `Updated collection '${row.slug}'`,
        before: delta.before,
        after: delta.after,
      });

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

    // A hard delete that cascades its membership rows: this is the only
    // remaining record that the collection, and what was curated into it,
    // ever existed.
    await recordAudit(c, {
      action: "collection.deleted",
      entityType: "collection",
      entityId: row.id,
      summary: `Deleted collection '${row.slug}' and its membership rows`,
      before: row as unknown as Record<string, unknown>,
    });

    return c.json({ success: true, id: row.id });
  } catch (error) {
    console.error("Error deleting collection:", error);
    return c.json({ error: "Failed to delete collection" }, 500);
  }
});

export default adminCollectionsApp;
