/**
 * Public collections API.
 *
 * Supersedes `GET /api/products/collections`, which built the Discover rail
 * out of `STYLE_OPTIONS`. That endpoint could only ever describe styles —
 * measured on mesonart 2026-08-05, their rail also carries seven subjects, an
 * orientation, and two entries (`Latest Work`, `Bestseller`) that are a date
 * window and a sort. Reading the `collections` table instead makes all of
 * those expressible, and lets an admin author a fifteenth.
 *
 * Route registration order matters: any literal segment must be registered
 * before `/:slug`, the same trap `products.ts` documents for `/facets` and
 * `/collections`.
 */

import { Hono } from "hono";
import { z } from "zod";

import {
  countCollection,
  listDiscoverCollections,
} from "../lib/collection-resolver";
import { representativesFor } from "../lib/collection-imagery";
import { getCached, setCached, CacheKeys } from "../lib/redis";
import type { Collection } from "../database/schema/collections";

export const collectionsApp = new Hono();

/** Same 5 minutes the product list uses. */
const CACHE_TTL_COLLECTIONS = 300;

const listQuerySchema = z.object({
  discover: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export interface CollectionChip {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  count: number;
  image: string | null;
  /**
   * Whether `image` is a matted product photo rather than an image the admin
   * uploaded.
   *
   * Not cosmetic, and not something the client can infer. Product `main`
   * images are composited onto a mat at a fixed fraction of the longest side,
   * and the chip compensates by scaling past the mat edge (`chipArtScale()`).
   * An admin upload has no mat, so applying the same scale crops into the
   * picture. The server is the only place that knows which one it sent.
   */
  imageIsMatted: boolean;
  /** The representative product's orientation; null when the image is the admin's. */
  orientation: string | null;
}

// ============================================================================
// GET /api/collections
// ============================================================================

collectionsApp.get("/", async (c) => {
  const parsed = listQuerySchema.safeParse({
    discover: c.req.query("discover"),
  });
  if (!parsed.success) {
    return c.json({ error: "Invalid query parameters" }, 400);
  }

  const cacheKey = `${CacheKeys.COLLECTION}list:discover=${parsed.data.discover}`;

  const cached = await getCached<{ collections: CollectionChip[] }>(cacheKey);
  if (cached) return c.json({ ...cached, fromCache: true });

  try {
    // Only the discover rail exists as a caller today; the flag is here so the
    // admin list and the nav can share this endpoint without a second one.
    const rows: Collection[] = await listDiscoverCollections();

    /**
     * Counts first, because they decide two things: whether a collection is
     * shown at all, and — through `totals` — which collection gets to pick its
     * representative artwork first.
     */
    const totals = new Map<string, number>();
    for (const row of rows) {
      totals.set(row.id, await countCollection(row));
    }

    /**
     * A chip leading to an empty grid is worse than no chip. #406's rule, kept
     * — and now it can also hide a collection whose rule stopped matching
     * anything, which a facet-derived rail could not express.
     */
    const populated = rows.filter((row) => (totals.get(row.id) ?? 0) > 0);

    const representatives = await representativesFor(populated, totals);

    const collections: CollectionChip[] = populated.map((row) => {
      const representative = representatives.get(row.id);
      const usingAdminImage = Boolean(row.imageUrl);

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        subtitle: row.subtitle ?? null,
        count: totals.get(row.id) ?? 0,
        image: row.imageUrl ?? representative?.image ?? null,
        imageIsMatted: !usingAdminImage && Boolean(representative?.image),
        orientation: usingAdminImage ? null : representative?.orientation ?? null,
      };
    });

    const result = { collections };
    await setCached(cacheKey, result, CACHE_TTL_COLLECTIONS);

    return c.json(result);
  } catch (error) {
    console.error("Error fetching collections:", error);
    return c.json({ error: "Failed to fetch collections" }, 500);
  }
});

export default collectionsApp;
