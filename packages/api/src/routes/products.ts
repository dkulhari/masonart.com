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
import { eq, and, or, ilike, desc, asc, sql, inArray, arrayOverlaps } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "../database";
import { products, productVariants, frames } from "../database/schema/products";
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
// Helpers
// ============================================================================

/**
 * Build a parameterized array-overlap (&&) condition from a comma-separated
 * filter value. Returns undefined when the filter is absent or empty.
 */
function csvArrayOverlap(column: AnyPgColumn, csv: string | undefined) {
  if (!csv) return undefined;
  const values = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return values.length > 0 ? arrayOverlaps(column, values) : undefined;
}

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for product listing
 */
const listProductsQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),

  // Filters
  styles: z.string().optional(), // comma-separated list
  subjects: z.string().optional(), // comma-separated list
  colors: z.string().optional(), // comma-separated list
  rooms: z.string().optional(), // comma-separated list
  orientation: z.enum(["square", "portrait", "landscape", "panoramic", "round"]).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  isFeatured: z.coerce.boolean().optional(),
  isAiGenerated: z.coerce.boolean().optional(),

  // Sorting
  sortBy: z.enum(["createdAt", "updatedAt", "title", "basePrice", "featuredOrder"]).optional().default("createdAt"),
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
      orientation,
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
      conditions.push(eq(products.orientation, orientation));
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

    // Filter by array fields (styles, subjects, colors, rooms) using the
    // array overlap operator (&&) with parameterized values
    const arrayFilters = [
      csvArrayOverlap(products.styles, styles),
      csvArrayOverlap(products.subjects, subjects),
      csvArrayOverlap(products.colors, colors),
      csvArrayOverlap(products.rooms, rooms),
    ];
    for (const filter of arrayFilters) {
      if (filter) {
        conditions.push(filter);
      }
    }

    // Build sort order
    const orderByColumn = {
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      title: products.title,
      basePrice: products.basePrice,
      featuredOrder: products.featuredOrder,
    }[sortBy];

    const orderByDirection = sortOrder === "asc" ? asc : desc;

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
        })
        .from(products)
        .where(and(...conditions))
        .orderBy(orderByDirection(orderByColumn))
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
