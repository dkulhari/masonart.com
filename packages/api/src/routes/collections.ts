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
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  styleSchema,
  subjectSchema,
  colorSchema,
  roomSchema,
  vibeSchema,
  aestheticSchema,
  mediumSchema,
  uniquenessSchema,
  availabilitySchema,
  orientationSchema,
} from "@chobii/shared";

import { db } from "../database";
import { products } from "../database/schema/products";
import { reviews } from "../database/schema/reviews";
import {
  countCollection,
  listDiscoverCollections,
  findActiveCollectionBySlug,
  resolveManualMembers,
  mergeCollectionFilters,
  resolveCollectionSort,
  buildProductConditions,
  IMPOSSIBLE,
  type CollectionFilters,
  type CollectionRuleShape,
} from "../lib/collection-resolver";
import { representativesFor } from "../lib/collection-imagery";
import { facetList } from "../lib/facet-query";
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

// ============================================================================
// GET /api/collections/:slug
// ============================================================================

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

const detailQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .default(DEFAULT_PAGE_SIZE),
  styles: facetList(styleSchema),
  subjects: facetList(subjectSchema),
  colors: facetList(colorSchema),
  rooms: facetList(roomSchema),
  vibe: facetList(vibeSchema),
  aesthetic: facetList(aestheticSchema),
  medium: facetList(mediumSchema),
  orientation: orientationSchema.optional(),
  uniqueness: uniquenessSchema.optional(),
  availability: availabilitySchema.optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  isFeatured: z.coerce.boolean().optional(),
  isAiGenerated: z.coerce.boolean().optional(),
  sortBy: z
    .enum([
      "createdAt",
      "updatedAt",
      "title",
      "basePrice",
      "featuredOrder",
      "salesCount",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/** The empty page. Same shape as a populated one, so the client branches on nothing. */
const emptyPage = (collection: Collection, page: number, pageSize: number) => ({
  collection: publicCollection(collection),
  items: [],
  total: 0,
  page,
  pageSize,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: page > 1,
  facets: {},
});

function publicCollection(collection: Collection) {
  return {
    id: collection.id,
    slug: collection.slug,
    title: collection.title,
    subtitle: collection.subtitle ?? null,
    description: collection.description ?? null,
    imageUrl: collection.imageUrl ?? null,
    kind: collection.kind,
    seoTitle: collection.seoTitle ?? null,
    seoDescription: collection.seoDescription ?? null,
  };
}

/**
 * Facet counts **scoped to the collection**.
 *
 * Deliberately computed against the collection's own base conditions and NOT
 * the shopper's current facets. Two reasons: catalogue-wide counts would offer
 * filters that return nothing inside this collection, and folding the
 * shopper's own selection in would zero every sibling option the moment they
 * tick one — the sidebar would collapse as they used it.
 */
async function collectionFacetCounts(
  baseConditions: ReturnType<typeof buildProductConditions>
): Promise<Record<string, { value: string; count: number }[]>> {
  const arrayFacet = async (
    column:
      | typeof products.styles
      | typeof products.subjects
      | typeof products.colors
      | typeof products.rooms
      | typeof products.vibe
      | typeof products.aesthetic
      | typeof products.medium
  ) =>
    db
      .select({
        value: sql<string>`unnest(${column})`,
        count: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(and(...baseConditions))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`);

  const scalarFacet = async (
    column:
      | typeof products.orientation
      | typeof products.uniqueness
      | typeof products.availability
  ) =>
    db
      .select({
        value: sql<string>`${column}`,
        count: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(and(...baseConditions))
      .groupBy(column)
      .orderBy(sql`2 desc`);

  return {
    styles: await arrayFacet(products.styles),
    subjects: await arrayFacet(products.subjects),
    colors: await arrayFacet(products.colors),
    rooms: await arrayFacet(products.rooms),
    vibe: await arrayFacet(products.vibe),
    aesthetic: await arrayFacet(products.aesthetic),
    medium: await arrayFacet(products.medium),
    orientation: await scalarFacet(products.orientation),
    uniqueness: await scalarFacet(products.uniqueness),
    availability: await scalarFacet(products.availability),
  };
}

/**
 * Registered after `/` and after any literal segment. Anything added below
 * this line is read as a slug, which is the trap products.ts documents for
 * `/facets`.
 */
collectionsApp.get("/:slug", async (c) => {
  const parsed = detailQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      { error: "Invalid query parameters", details: parsed.error.issues },
      400
    );
  }

  const query = parsed.data;

  try {
    const collection = await findActiveCollectionBySlug(c.req.param("slug"));
    if (!collection) {
      return c.json({ error: "Collection not found" }, 404);
    }

    const shopperFilters: CollectionFilters = {
      styles: query.styles,
      subjects: query.subjects,
      colors: query.colors,
      rooms: query.rooms,
      vibe: query.vibe,
      aesthetic: query.aesthetic,
      medium: query.medium,
      orientation: query.orientation,
      uniqueness: query.uniqueness,
      availability: query.availability,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      isFeatured: query.isFeatured,
      isAiGenerated: query.isAiGenerated,
    };

    /**
     * A manual collection's membership is its rule. The shopper's facets still
     * narrow within it, so a curated list behaves like any other collection
     * once you are standing in it.
     */
    let memberIds: string[] | null = null;
    if (collection.kind === "manual") {
      memberIds = await resolveManualMembers(collection.id);
      if (memberIds.length === 0) {
        return c.json(emptyPage(collection, query.page, query.pageSize));
      }
    }

    const merged = mergeCollectionFilters(
      collection.kind === "rule"
        ? (collection.rule as CollectionRuleShape | null)
        : null,
      shopperFilters
    );

    /**
     * No product can satisfy both. Answer without asking the database — the
     * result is already known, and issuing the query would only be slower.
     */
    if (merged === IMPOSSIBLE) {
      return c.json(emptyPage(collection, query.page, query.pageSize));
    }

    const conditions = buildProductConditions(merged);
    if (memberIds) {
      conditions.push(inArray(products.id, memberIds) as never);
    }

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(and(...conditions));
    const total = countRow?.count ?? 0;

    /**
     * Order.
     *
     * A manual collection orders by the admin's positions, which is the only
     * thing a rule cannot express — so it wins over any stored sort. An
     * explicit shopper sort still overrides it, because a shopper who picks
     * "price low to high" means it.
     */
    const sort = resolveCollectionSort(
      collection.kind === "rule"
        ? (collection.rule as CollectionRuleShape | null)
        : null,
      { sortBy: query.sortBy, sortOrder: query.sortOrder }
    );

    const direction = sort.sortOrder === "asc" ? asc : desc;
    const SORT_COLUMNS = {
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      title: products.title,
      basePrice: products.basePrice,
      featuredOrder: products.featuredOrder,
      // Mirrors routes/products.ts, which also falls back here.
      salesCount: products.createdAt,
    } as const;
    const sortColumn =
      SORT_COLUMNS[sort.sortBy as keyof typeof SORT_COLUMNS] ??
      products.createdAt;

    const useMemberOrder = Boolean(memberIds) && !query.sortBy;
    const orderBy = useMemberOrder
      ? [
          sql`array_position(ARRAY[${sql.join(
            (memberIds as string[]).map((id) => sql`${id}`),
            sql`, `
          )}]::uuid[], ${products.id})`,
        ]
      : [direction(sortColumn)];

    const items = await db
      .select({
        id: products.id,
        sku: products.sku,
        title: products.title,
        slug: products.slug,
        description: products.description,
        basePrice: products.basePrice,
        styles: products.styles,
        subjects: products.subjects,
        colors: products.colors,
        orientation: products.orientation,
        images: products.images,
        isFeatured: products.isFeatured,
        isAiGenerated: products.isAiGenerated,
        featuredOrder: products.featuredOrder,
        createdAt: products.createdAt,
        // Same aggregate contract as the product list: NULL average rather
        // than a synthetic 0, which would render as "rated badly".
        averageRating: sql<
          number | null
        >`round(avg(${reviews.rating})::numeric, 1)`,
        reviewCount: sql<number>`count(${reviews.id})::int`,
      })
      .from(products)
      .leftJoin(
        reviews,
        and(eq(reviews.productId, products.id), eq(reviews.status, "approved"))
      )
      .where(and(...conditions))
      .groupBy(products.id)
      .orderBy(...orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    /**
     * Facet counts describe the COLLECTION, not the current filter state, so
     * they are computed from the collection's own conditions with the
     * shopper's facets left out.
     */
    const baseFilters = mergeCollectionFilters(
      collection.kind === "rule"
        ? (collection.rule as CollectionRuleShape | null)
        : null,
      {}
    );
    const baseConditions =
      baseFilters === IMPOSSIBLE ? conditions : buildProductConditions(baseFilters);
    if (memberIds) {
      baseConditions.push(inArray(products.id, memberIds) as never);
    }

    const facets = await collectionFacetCounts(baseConditions);

    return c.json({
      collection: publicCollection(collection),
      /**
       * The sort actually applied, so the toolbar can name it.
       *
       * Not derivable on the client: the rule is not in the public payload, so
       * a collection that IS a sort — Best Sellers — rendered "Newest First"
       * over a list ordered by units sold. The label has to come from whoever
       * resolved it.
       */
      appliedSort: sort,
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
      hasNextPage: query.page * query.pageSize < total,
      hasPreviousPage: query.page > 1,
      facets,
    });
  } catch (error) {
    console.error("Error fetching collection:", error);
    return c.json({ error: "Failed to fetch collection" }, 500);
  }
});

export default collectionsApp;
