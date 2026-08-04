/**
 * Products API Routes
 *
 * Provides public API endpoints for product catalog:
 * - GET /api/products - List products with filters and pagination
 * - GET /api/products/search - Search products by query
 * - GET /api/products/featured - Get featured products
 * - GET /api/products/:slug - Get product by slug
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, or, ilike, desc, asc, sql, inArray, type SQL } from "drizzle-orm";

import { db } from "../database";
import {
  products,
  productVariants,
  frames,
  orientationEnum,
} from "../database/schema/products";
import { reviews } from "../database/schema/reviews";
import {
  styleSchema,
  subjectSchema,
  colorSchema,
  roomSchema,
  orientationSchema,
  vibeSchema,
  aestheticSchema,
  mediumSchema,
  uniquenessSchema,
  availabilitySchema,
  STYLE_OPTIONS,
} from "@chobii/shared";
import { unitsSoldSql } from "../lib/product-sales";
import { optionalAuth, type OptionalAuthVariables } from "../middleware/auth";
import { getCached, setCached, CacheKeys } from "../lib/redis";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;
const CACHE_TTL_PRODUCTS = 300; // 5 minutes
const CACHE_TTL_PRODUCT_DETAIL = 600; // 10 minutes
const CACHE_TTL_FEATURED = 900; // 15 minutes

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for product listing
 */
/**
 * A comma-separated facet parameter, every value checked against its
 * vocabulary.
 *
 * Two things this buys:
 *
 * 1. **Safety.** The array filters below build a postgres ARRAY literal with
 *    `sql.raw` and hand-rolled quote escaping. That is only ever safe while
 *    the values are constrained; this constrains them.
 * 2. **Honesty.** An unknown value is a 400. Ignoring it would hand the
 *    shopper an unfiltered grid that they believe was filtered — the worst of
 *    the available failure modes. A partly-valid list fails too, rather than
 *    quietly filtering on the half we recognised.
 */
const facetList = (member: z.ZodTypeAny) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
    )
    .refine(
      (values) =>
        values === undefined || values.every((v) => member.safeParse(v).success),
      { message: "Unknown filter value" }
    );

const listProductsQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),

  // Filters — every value checked against the shared vocabulary.
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

  // Sorting
  sortBy: z.enum(["createdAt", "updatedAt", "title", "basePrice", "featuredOrder", "salesCount"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

/**
 * Search query parameters
 */
const searchProductsQuerySchema = z.object({
  q: z.string().min(1).max(200),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
});

/**
 * Featured products query parameters
 */
const featuredProductsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional().default(12),
});

/**
 * Query parameters for related products. Defaults to 5 — the number of slots
 * the product page's "You May Also Like" row renders.
 */
const relatedProductsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).optional().default(5),
});

// ============================================================================
// Route Handler
// ============================================================================

const productsApp = new Hono<{ Variables: OptionalAuthVariables }>();

// Apply optional auth to all routes
productsApp.use("*", optionalAuth);

// ============================================================================
// GET /api/products - List Products
// ============================================================================

productsApp.get(
  "/",
  zValidator("query", listProductsQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const {
      page,
      pageSize,
      styles,
      subjects,
      colors,
      rooms,
      vibe,
      aesthetic,
      medium,
      orientation,
      uniqueness,
      availability,
      priceMin,
      priceMax,
      isFeatured,
      isAiGenerated,
      sortBy,
      sortOrder,
    } = query;

    // Build cache key from query params
    const cacheKey = `${CacheKeys.PRODUCT_LIST}${JSON.stringify(query)}`;

    // Try to get from cache
    const cached = await getCached<{ items: unknown[]; total: number }>(cacheKey);
    if (cached) {
      return c.json({
        ...cached,
        page,
        pageSize,
        totalPages: Math.ceil(cached.total / pageSize),
        hasNextPage: page * pageSize < cached.total,
        hasPreviousPage: page > 1,
        fromCache: true,
      });
    }

    // Build where conditions
    const conditions: ReturnType<typeof eq>[] = [];

    // Only show active products
    conditions.push(eq(products.status, "active"));

    // Filter by orientation
    if (orientation) {
      /**
       * `orientationSchema` widens to `string` (the shared vocabulary types
       * ids as string), so it does not narrow to the pg enum union on its own.
       * The cast is safe because validation has already restricted the value
       * to the six vocabulary ids, and product-facet-columns.test.ts asserts
       * the enum carries exactly those six.
       */
      conditions.push(
        eq(
          products.orientation,
          orientation as (typeof orientationEnum.enumValues)[number]
        )
      );
    }

    // Filter by featured status
    if (isFeatured !== undefined) {
      conditions.push(eq(products.isFeatured, isFeatured));
    }

    // Filter by AI generated
    if (isAiGenerated !== undefined) {
      conditions.push(eq(products.isAiGenerated, isAiGenerated));
    }

    // Filter by price range (base price)
    if (priceMin !== undefined) {
      conditions.push(sql`${products.basePrice}::numeric >= ${priceMin}`);
    }
    if (priceMax !== undefined) {
      conditions.push(sql`${products.basePrice}::numeric <= ${priceMax}`);
    }

    /**
     * Array-facet overlap.
     *
     * The values are already validated against the shared vocabularies by
     * `facetList`, so they are drawn from a closed set — which is what makes
     * building the literal safe. The previous version escaped quotes by hand
     * on unvalidated input, which was one careless caller away from being an
     * injection vector.
     *
     * Parameterised rather than `sql.raw` now, so the escaping question does
     * not arise at all.
     */
    const overlapFilter = (
      column:
        | typeof products.styles
        | typeof products.subjects
        | typeof products.colors
        | typeof products.rooms
        | typeof products.vibe
        | typeof products.aesthetic
        | typeof products.medium,
      values: string[] | undefined
    ) => {
      if (!values?.length) return;
      /**
       * Each element is bound as its own parameter. Passing the JS array as a
       * single bind and casting it (`${values}::text[]`) does NOT work —
       * postgres.js sends it as one scalar and the server answers
       * "malformed array literal".
       */
      const elements = sql.join(
        values.map((value) => sql`${value}`),
        sql`, `
      );
      conditions.push(sql`${column} && ARRAY[${elements}]::text[]`);
    };

    overlapFilter(products.styles, styles);
    overlapFilter(products.subjects, subjects);
    overlapFilter(products.colors, colors);
    overlapFilter(products.rooms, rooms);
    overlapFilter(products.vibe, vibe);
    overlapFilter(products.aesthetic, aesthetic);
    overlapFilter(products.medium, medium);

    // Single-valued facets.
    if (uniqueness) {
      conditions.push(eq(products.uniqueness, uniqueness));
    }
    if (availability) {
      conditions.push(eq(products.availability, availability));
    }

    // Build sort order
    const orderByColumn = {
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      title: products.title,
      basePrice: products.basePrice,
      featuredOrder: products.featuredOrder,
      salesCount: products.createdAt,
    }[sortBy];

    const orderByDirection = sortOrder === "asc" ? asc : desc;

    /**
     * `featuredOrder` and `popularOrder` are both nullable and null on most
     * of the catalogue. Postgres sorts nulls first on DESC and last on ASC by
     * default, so "Featured" without an explicit NULLS LAST leads with the
     * products nobody featured — the exact opposite of what the option says.
     */
    const nullsLast = (column: typeof products.featuredOrder, direction: "asc" | "desc") =>
      direction === "asc"
        ? sql`${column} asc nulls last`
        : sql`${column} desc nulls last`;

    const orderByClauses: SQL[] =
      sortBy === "salesCount"
        ? [
            /**
             * Curator pin first, real units second. The pin reorders; it
             * never rewrites the number, which is why both are visible to
             * an admin side by side.
             */
            desc(products.isPopular),
            nullsLast(products.popularOrder, "asc"),
            sql`${unitsSoldSql()} desc`,
            nullsLast(products.featuredOrder, "asc"),
            desc(products.createdAt),
          ]
        : sortBy === "featuredOrder"
          ? [nullsLast(products.featuredOrder, sortOrder), desc(products.createdAt)]
          : [orderByDirection(orderByColumn)];

    // Calculate offset
    const offset = (page - 1) * pageSize;

    try {
      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(and(...conditions));

      const total = countResult[0]?.count ?? 0;

      // Get products
      const productList = await db
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
          /**
           * Review aggregate.
           *
           * NULL average, not 0, when a product has no approved reviews —
           * a synthetic 0.0 renders as "rated badly" rather than "not yet
           * rated", which is the fabricated-social-proof problem the parity
           * analysis rules out. The card omits the star row entirely on null.
           *
           * `count` is 0 rather than null because "0 reviews" is a true
           * statement and the UI wants a number.
           */
          averageRating: sql<
            number | null
          >`round(avg(${reviews.rating})::numeric, 1)`,
          reviewCount: sql<number>`count(${reviews.id})::int`,
        })
        .from(products)
        /**
         * A join, not a correlated subquery per row: on a 24-card page the
         * subquery form is an N+1 wearing a disguise.
         *
         * Only `approved` reviews count — a pending or rejected one must not
         * move a public rating.
         */
        .leftJoin(
          reviews,
          and(eq(reviews.productId, products.id), eq(reviews.status, "approved"))
        )
        .where(and(...conditions))
        .groupBy(products.id)
        .orderBy(...orderByClauses)
        .limit(pageSize)
        .offset(offset);

      const result = {
        items: productList,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      };

      // Cache the result
      await setCached(cacheKey, { items: productList, total }, CACHE_TTL_PRODUCTS);

      return c.json(result);
    } catch (error) {
      console.error("Error fetching products:", error);
      return c.json({ error: "Failed to fetch products" }, 500);
    }
  }
);

// ============================================================================
// GET /api/products/search - Search Products
// ============================================================================

productsApp.get(
  "/search",
  zValidator("query", searchProductsQuerySchema),
  async (c) => {
    const { q, page, pageSize } = c.req.valid("query");

    const offset = (page - 1) * pageSize;

    // Build search pattern for ILIKE
    const searchPattern = `%${q}%`;

    try {
      // Search in title, description, tags, and SKU
      const searchConditions = or(
        ilike(products.title, searchPattern),
        ilike(products.description, searchPattern),
        ilike(products.sku, searchPattern),
        sql`array_to_string(${products.tags}, ' ') ILIKE ${searchPattern}`,
        sql`array_to_string(${products.styles}, ' ') ILIKE ${searchPattern}`,
        sql`array_to_string(${products.subjects}, ' ') ILIKE ${searchPattern}`
      );

      const whereCondition = and(
        eq(products.status, "active"),
        searchConditions
      );

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(whereCondition);

      const total = countResult[0]?.count ?? 0;

      // Get matching products
      const productList = await db
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
          createdAt: products.createdAt,
        })
        .from(products)
        .where(whereCondition)
        .orderBy(desc(products.isFeatured), desc(products.createdAt))
        .limit(pageSize)
        .offset(offset);

      return c.json({
        query: q,
        items: productList,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      console.error("Error searching products:", error);
      return c.json({ error: "Failed to search products" }, 500);
    }
  }
);

// ============================================================================
// GET /api/products/featured - Get Featured Products
// ============================================================================

productsApp.get(
  "/featured",
  zValidator("query", featuredProductsQuerySchema),
  async (c) => {
    const { limit } = c.req.valid("query");

    // Check cache
    const cacheKey = `${CacheKeys.PRODUCT}featured:${limit}`;
    const cached = await getCached<unknown[]>(cacheKey);
    if (cached) {
      return c.json({ items: cached, fromCache: true });
    }

    try {
      const featuredProducts = await db
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
        })
        .from(products)
        .where(
          and(
            eq(products.status, "active"),
            eq(products.isFeatured, true)
          )
        )
        .orderBy(asc(products.featuredOrder), desc(products.createdAt))
        .limit(limit);

      // Cache the result
      await setCached(cacheKey, featuredProducts, CACHE_TTL_FEATURED);

      return c.json({ items: featuredProducts });
    } catch (error) {
      console.error("Error fetching featured products:", error);
      return c.json({ error: "Failed to fetch featured products" }, 500);
    }
  }
);

// ============================================================================
// GET /api/products/collections - Discover Chips
// ============================================================================

/**
 * The Discover chip carousel's data (analysis §1.3.2).
 *
 * mesonart runs a scrollable rail of circular collection chips between the
 * page header and the grid. We have no collection entity, so a "collection"
 * here is a style from the vocabulary in @chobii/shared — the same list the
 * filter sidebar renders and the list endpoint validates against. Labels come
 * from that module and never from the database, which stores ids: a label
 * read back out of a row is how two views of the same taxonomy drift apart.
 *
 * Imagery has no source of its own either. Each chip borrows the main image
 * of a representative product in that style — highest `featuredOrder` first,
 * newest as the fallback — so the rail restyles itself as the catalogue
 * changes instead of waiting on twelve curated assets that do not exist.
 *
 * Styles with no active products are dropped: a chip leading to an empty
 * grid is worse than no chip.
 *
 * Registered BEFORE `/:slug`, same as `/facets`.
 */
productsApp.get("/collections", async (c) => {
  const cacheKey = `${CacheKeys.PRODUCT}collections:v1`;

  const cached = await getCached<Record<string, unknown>>(cacheKey);
  if (cached) return c.json({ ...cached, fromCache: true });

  try {
    /**
     * One grouped pass. `styles` is text[], so it needs unnest before it can
     * be grouped — the same shape as `arrayFacet` in the facets route below.
     *
     * The representative image is picked inside the aggregate rather than by
     * a second query: array_agg with an ORDER BY takes the winner per group
     * in the same scan. Prefer the image explicitly typed `main`; fall back
     * to the first element, which the ProductImage contract documents as the
     * main image after sorting.
     */
    const rows = await db
      .select({
        style: sql<string>`t.style`,
        count: sql<number>`count(*)::int`,
        image: sql<
          string | null
        >`(array_agg(t.image order by t.featured_order asc nulls last, t.created_at desc))[1]`,
      })
      .from(
        sql`(
          select
            unnest(${products.styles}) as style,
            coalesce(
              (
                select element ->> 'url'
                from jsonb_array_elements(${products.images}) as element
                where element ->> 'type' = 'main'
                limit 1
              ),
              ${products.images} -> 0 ->> 'url'
            ) as image,
            ${products.featuredOrder} as featured_order,
            ${products.createdAt} as created_at
          from ${products}
          where ${products.status} = 'active'
        ) as t`
      )
      .groupBy(sql`t.style`);

    const byStyle = new Map(rows.map((row) => [row.style, row]));

    /**
     * Driven by the vocabulary, not the query result: this both supplies the
     * labels and fixes the order, and it silently drops any free-text value
     * that reached the column — such a value has no label and filtering on
     * it would 400.
     */
    const collections = STYLE_OPTIONS.flatMap((option) => {
      const row = byStyle.get(option.id);
      if (!row || row.count <= 0) return [];
      return [
        {
          id: option.id,
          label: option.label,
          count: row.count,
          image: row.image ?? null,
        },
      ];
    });

    const result = { collections };

    await setCached(cacheKey, result, CACHE_TTL_PRODUCTS);

    return c.json(result);
  } catch (error) {
    console.error("Error fetching collections:", error);
    return c.json({ error: "Failed to fetch collections" }, 500);
  }
});

// ============================================================================
// GET /api/products/facets - Per-Option Counts
// ============================================================================

/**
 * Counts for every facet option, so the sidebar can render "Wabi-Sabi (788)"
 * the way mesonart does (analysis §1.3.4).
 *
 * This has to live on the server. The client only ever holds the current page
 * of 24, so counting there would report the page, not the catalogue.
 *
 * Registered BEFORE `/:slug` — otherwise "facets" is read as a product slug.
 */
productsApp.get("/facets", async (c) => {
  /**
   * Versioned key. The payload gained five groups; without bumping this a
   * cached entry from before the deploy serves the old shape to a sidebar
   * that expects the new one.
   */
  const cacheKey = `${CacheKeys.PRODUCT}facets:v2`;

  const cached = await getCached<Record<string, unknown>>(cacheKey);
  if (cached) return c.json({ ...cached, fromCache: true });

  try {
    /**
     * styles/subjects/colors/rooms are `text[]`, so each needs unnest before
     * it can be grouped. orientation is a plain enum column and groups
     * directly.
     */
    type ArrayFacetColumn =
      | typeof products.styles
      | typeof products.subjects
      | typeof products.colors
      | typeof products.rooms
      | typeof products.vibe
      | typeof products.aesthetic
      | typeof products.medium;

    const arrayFacet = async (column: ArrayFacetColumn) => {
      const rows = await db
        .select({
          value: sql<string>`unnest(${column})`,
          count: sql<number>`count(*)::int`,
        })
        .from(products)
        .where(eq(products.status, "active"))
        .groupBy(sql`1`)
        .orderBy(sql`2 desc`);
      return rows;
    };

    /** A scalar column groups directly — no unnest needed. */
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
        .where(eq(products.status, "active"))
        .groupBy(column)
        .orderBy(sql`2 desc`);

    const [
      styles,
      subjects,
      colors,
      rooms,
      vibe,
      aesthetic,
      medium,
      orientation,
      uniqueness,
      availability,
    ] = await Promise.all([
      arrayFacet(products.styles),
      arrayFacet(products.subjects),
      arrayFacet(products.colors),
      arrayFacet(products.rooms),
      arrayFacet(products.vibe),
      arrayFacet(products.aesthetic),
      arrayFacet(products.medium),
      scalarFacet(products.orientation),
      scalarFacet(products.uniqueness),
      scalarFacet(products.availability),
    ]);

    const result = {
      styles,
      subjects,
      colors,
      rooms,
      vibe,
      aesthetic,
      medium,
      orientation,
      uniqueness,
      availability,
    };
    await setCached(cacheKey, result, CACHE_TTL_PRODUCTS);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching product facets:", error);
    return c.json({ error: "Failed to fetch facets" }, 500);
  }
});

// ============================================================================
// GET /api/products/frames - Get Available Frames
// ============================================================================

productsApp.get("/frames", async (c) => {
  // Check cache
  const cacheKey = `${CacheKeys.PRODUCT}frames`;
  const cached = await getCached<unknown[]>(cacheKey);
  if (cached) {
    return c.json({ items: cached, fromCache: true });
  }

  try {
    const frameList = await db
      .select({
        id: frames.id,
        name: frames.name,
        type: frames.type,
        description: frames.description,
        material: frames.material,
        thickness: frames.thickness,
        color: frames.color,
        priceModifier: frames.priceModifier,
        priceAddition: frames.priceAddition,
        imageUrl: frames.imageUrl,
        thumbnailUrl: frames.thumbnailUrl,
        availableSizes: frames.availableSizes,
        sortOrder: frames.sortOrder,
      })
      .from(frames)
      .where(eq(frames.isActive, true))
      .orderBy(asc(frames.sortOrder));

    // Cache for 15 minutes (frames don't change often)
    await setCached(cacheKey, frameList, CACHE_TTL_FEATURED);

    return c.json({ items: frameList });
  } catch (error) {
    console.error("Error fetching frames:", error);
    return c.json({ error: "Failed to fetch frames" }, 500);
  }
});

// ============================================================================
// GET /api/products/:slug - Get Product by Slug
// ============================================================================

productsApp.get("/:slug", async (c) => {
  const { slug } = c.req.param();

  // Validate slug format
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return c.json({ error: "Invalid slug format" }, 400);
  }

  // Check cache
  const cacheKey = `${CacheKeys.PRODUCT}${slug}`;
  const cached = await getCached<object>(cacheKey);
  if (cached) {
    return c.json({ ...cached, fromCache: true });
  }

  try {
    // Get product with variants using query
    const product = await db.query.products.findFirst({
      where: eq(products.slug, slug),
      with: {
        variants: {
          where: eq(productVariants.isActive, true),
          orderBy: asc(productVariants.sortOrder),
        },
      },
    });

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    // Only return active products for public API
    if (product.status !== "active") {
      return c.json({ error: "Product not found" }, 404);
    }

    // Get available frames
    const availableFrames = await db
      .select({
        id: frames.id,
        name: frames.name,
        type: frames.type,
        description: frames.description,
        material: frames.material,
        priceModifier: frames.priceModifier,
        priceAddition: frames.priceAddition,
        imageUrl: frames.imageUrl,
        thumbnailUrl: frames.thumbnailUrl,
      })
      .from(frames)
      .where(eq(frames.isActive, true))
      .orderBy(asc(frames.sortOrder));

    const result = {
      ...product,
      frames: availableFrames,
    };

    // Cache the result
    await setCached(cacheKey, result, CACHE_TTL_PRODUCT_DETAIL);

    return c.json(result);
  } catch (error) {
    console.error("Error fetching product:", error);
    return c.json({ error: "Failed to fetch product" }, 500);
  }
});

// ============================================================================
// GET /api/products/:slug/related - Get Related Products
// ============================================================================

productsApp.get(
  "/:slug/related",
  zValidator("query", relatedProductsQuerySchema),
  async (c) => {
    const { slug } = c.req.param();
    const { limit } = c.req.valid("query");

    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return c.json({ error: "Invalid slug format" }, 400);
    }

    const cacheKey = `${CacheKeys.PRODUCT}related:${slug}:${limit}`;
    const cached = await getCached<unknown[]>(cacheKey);
    if (cached) {
      return c.json({ items: cached, fromCache: true });
    }

    try {
      const source = await db
        .select({
          id: products.id,
          styles: products.styles,
          subjects: products.subjects,
        })
        .from(products)
        .where(and(eq(products.slug, slug), eq(products.status, "active")))
        .limit(1);

      if (source.length === 0) {
        return c.json({ error: "Product not found" }, 404);
      }

      const { id, styles, subjects } = source[0]!;

      // Interpolating a JS array straight into a sql`` template binds it as a
      // record tuple — Postgres then rejects it with "cannot cast type record
      // to text[]". Build a real ARRAY[...] literal with each element as its
      // own bound parameter instead.
      const toTextArray = (values: string[]) =>
        values.length === 0
          ? sql`ARRAY[]::text[]`
          : sql`ARRAY[${sql.join(
              values.map((value) => sql`${value}`),
              sql`, `
            )}]::text[]`;

      const styleList = toTextArray(styles ?? []);
      const subjectList = toTextArray(subjects ?? []);

      // Rank by how many tag families overlap, so a product sharing both a
      // style and a subject outranks one sharing only a style.
      //
      // && is the Postgres array-overlap operator. Note there is no core `&`
      // intersection operator for text[] (that belongs to the intarray
      // extension, integers only), so this scores 0-2 by family rather than
      // counting individual shared tags.
      const overlapScore = sql<number>`(
        (case when ${products.styles} && ${styleList} then 1 else 0 end) +
        (case when ${products.subjects} && ${subjectList} then 1 else 0 end)
      )`;

      const related = await db
        .select({
          id: products.id,
          sku: products.sku,
          title: products.title,
          slug: products.slug,
          basePrice: products.basePrice,
          styles: products.styles,
          subjects: products.subjects,
          colors: products.colors,
          orientation: products.orientation,
          images: products.images,
          isAiGenerated: products.isAiGenerated,
        })
        .from(products)
        .where(
          and(
            eq(products.status, "active"),
            // Never recommend the product the user is already looking at.
            sql`${products.id} <> ${id}`,
            sql`(${products.styles} && ${styleList} OR ${products.subjects} && ${subjectList})`
          )
        )
        .orderBy(desc(overlapScore), desc(products.createdAt))
        .limit(limit);

      await setCached(cacheKey, related, CACHE_TTL_FEATURED);

      return c.json({ items: related });
    } catch (error) {
      console.error("Error fetching related products:", error);
      return c.json({ error: "Failed to fetch related products" }, 500);
    }
  }
);

// ============================================================================
// GET /api/products/:slug/variants - Get Product Variants
// ============================================================================

productsApp.get("/:slug/variants", async (c) => {
  const { slug } = c.req.param();

  // Validate slug format
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return c.json({ error: "Invalid slug format" }, 400);
  }

  try {
    // First get the product to get its ID
    const product = await db
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    if (!product[0] || product[0].status !== "active") {
      return c.json({ error: "Product not found" }, 404);
    }

    // Get all active variants for this product
    const variants = await db
      .select({
        id: productVariants.id,
        sizeLabel: productVariants.sizeLabel,
        widthInches: productVariants.widthInches,
        heightInches: productVariants.heightInches,
        widthCm: productVariants.widthCm,
        heightCm: productVariants.heightCm,
        price: productVariants.price,
        stockQuantity: productVariants.stockQuantity,
        isInStock: productVariants.isInStock,
        variantSku: productVariants.variantSku,
        sortOrder: productVariants.sortOrder,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, product[0].id),
          eq(productVariants.isActive, true)
        )
      )
      .orderBy(asc(productVariants.sortOrder));

    return c.json({ items: variants });
  } catch (error) {
    console.error("Error fetching product variants:", error);
    return c.json({ error: "Failed to fetch product variants" }, 500);
  }
});

// ============================================================================
// GET /api/products/by-ids - Get Products by IDs
// ============================================================================

productsApp.post(
  "/by-ids",
  zValidator("json", z.object({ ids: z.array(z.string().uuid()).max(50) })),
  async (c) => {
    const { ids } = c.req.valid("json");

    if (ids.length === 0) {
      return c.json({ items: [] });
    }

    try {
      const productList = await db
        .select({
          id: products.id,
          sku: products.sku,
          title: products.title,
          slug: products.slug,
          basePrice: products.basePrice,
          images: products.images,
          orientation: products.orientation,
        })
        .from(products)
        .where(
          and(
            eq(products.status, "active"),
            inArray(products.id, ids)
          )
        );

      return c.json({ items: productList });
    } catch (error) {
      console.error("Error fetching products by IDs:", error);
      return c.json({ error: "Failed to fetch products" }, 500);
    }
  }
);

// Export the router
export { productsApp };
export default productsApp;
