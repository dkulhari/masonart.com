/**
 * Reviews API Routes
 *
 * Provides public API endpoints for product reviews:
 * - GET /api/products/:productId/reviews - List reviews for a product
 * - GET /api/reviews/:reviewId - Get a single review
 * - PATCH /api/reviews/:reviewId - Update own review
 * - DELETE /api/reviews/:reviewId - Delete own review
 *
 * Note: Review creation is only available via order items endpoint
 * (POST /api/orders/:orderId/items/:orderItemId/review)
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { mainImage, type ProductImage } from "@chobii/shared";

import { db } from "../database";
import { reviews, type ReviewStatus } from "../database/schema/reviews";
import {
  reviewMedia,
  type ReviewMediaStatus,
  type ReviewMediaType,
} from "../database/schema/review-media";
import { products } from "../database/schema/products";
import { orderItems, type OrderItemSnapshot } from "../database/schema/orders";
import { users } from "../database/schema/users";
import {
  requireAuth,
  optionalAuth,
  canAccess,
  type AuthVariables,
  type OptionalAuthVariables,
} from "../middleware/auth";
import { getCached, setCached, deleteCachedPattern } from "../lib/redis";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const CACHE_TTL_REVIEWS = 300; // 5 minutes

/**
 * Hard ceiling on the flat media feed.
 *
 * The PDP media wall and the home strip both render a bounded number of
 * tiles, and neither paginates. Without a cap this is an unbounded read that
 * grows with the review table forever.
 */
const MEDIA_FEED_LIMIT = 60;

// Add reviews cache key to CacheKeys if not already defined
const REVIEW_CACHE_PREFIX = "reviews:";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for creating a new review
 */
const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(255).optional(),
  content: z.string().min(10).max(5000),
});

/**
 * Schema for updating a review
 */
const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(255).optional(),
  content: z.string().min(10).max(5000).optional(),
});

/**
 * Query parameters for listing reviews
 */
const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(["newest", "highest", "lowest"]).default("newest"),
});

/**
 * Query parameters for the flat media feed.
 *
 * `productId` is optional — the PDP wall passes it, the home strip does not.
 * A malformed one is a 400 rather than a silently unfiltered feed, which
 * would show one product's page another product's customer photos.
 */
const mediaFeedQuerySchema = z.object({
  productId: z.string().uuid().optional(),
});

// ============================================================================
// Review media
// ============================================================================

/**
 * The public shape of one piece of review media.
 *
 * `processingStatus` and `processingError` are deliberately absent: the
 * pipeline's state is not the customer's business, and the only rows that
 * reach here are `ready` ones anyway.
 */
interface ReviewMediaPayload {
  id: string;
  reviewId: string;
  mediaType: ReviewMediaType;
  url: string;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

/** Columns every read of review media selects. One definition, four callers. */
const reviewMediaColumns = {
  id: reviewMedia.id,
  reviewId: reviewMedia.reviewId,
  mediaType: reviewMedia.mediaType,
  url: reviewMedia.url,
  thumbnailUrl: reviewMedia.thumbnailUrl,
  posterUrl: reviewMedia.posterUrl,
  durationSeconds: reviewMedia.durationSeconds,
  width: reviewMedia.width,
  height: reviewMedia.height,
  sortOrder: reviewMedia.sortOrder,
};

/**
 * Ready media for a set of reviews, grouped by review id.
 *
 * One `inArray` query for the whole page — the four read paths that embed
 * media all go through here, so none of them can regress into an N+1.
 *
 * `processing` and `failed` rows are invisible to the public. A half-
 * transcoded video renders as a broken tile, and a failed one never renders
 * at all; both look like a bug in the store rather than a pipeline that is
 * still working.
 */
async function fetchMediaByReview(
  reviewIds: string[]
): Promise<Map<string, ReviewMediaPayload[]>> {
  const byReview = new Map<string, ReviewMediaPayload[]>();

  // No reviews on this page: skip the round trip entirely. `inArray` with an
  // empty list is also a query drizzle has to special-case.
  if (reviewIds.length === 0) return byReview;

  const rows = await db
    .select(reviewMediaColumns)
    .from(reviewMedia)
    .where(
      and(
        inArray(reviewMedia.reviewId, reviewIds),
        eq(reviewMedia.processingStatus, "ready" as ReviewMediaStatus)
      )
    )
    .orderBy(asc(reviewMedia.sortOrder), asc(reviewMedia.createdAt));

  for (const row of rows) {
    const existing = byReview.get(row.reviewId);
    if (existing) {
      existing.push(row);
    } else {
      byReview.set(row.reviewId, [row]);
    }
  }

  return byReview;
}

/**
 * Attach `media` to a list of review rows, preserving their order.
 *
 * Every review gets a `media` array, empty ones included — a missing key and
 * an empty array are the same thing to a renderer right up until the first
 * `.map()` on undefined.
 */
async function withMedia<T extends { id: string }>(
  rows: T[]
): Promise<Array<T & { media: ReviewMediaPayload[] }>> {
  const byReview = await fetchMediaByReview(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, media: byReview.get(row.id) ?? [] }));
}

// ============================================================================
// Review card shape
// ============================================================================

/**
 * The variant the reviewer actually bought — the "Item type:" line on a card.
 *
 * Returned as parts rather than a composed string. "40''H x 30''W /
 * Stretch+Gold Frame" is presentation: the separator, the ordering and whether
 * a frameless purchase says anything at all are the card's call, and a string
 * baked here would have to be parsed back apart the first time one surface
 * wanted it differently.
 *
 * Every part is nullable. A frameless poster is a real purchase, not a missing
 * value.
 */
interface ReviewItemTypePayload {
  sizeLabel: string | null;
  frameName: string | null;
  frameType: string | null;
}

/**
 * The product chip on a review card: enough to render a thumbnail, a title and
 * a link, plus the sku the badge shows.
 */
interface ReviewProductPayload {
  id: string;
  title: string;
  slug: string;
  sku: string;
  imageUrl: string | null;
}

/**
 * Columns every read selects for the product chip. One definition, three
 * reads — the same reasoning as `reviewMediaColumns` above.
 *
 * `images` is selected but never returned: the chip carries one url, chosen
 * the same way the product cards choose it, and the caller has no use for the
 * whole array.
 */
const reviewProductColumns = {
  id: products.id,
  title: products.title,
  slug: products.slug,
  sku: products.sku,
  images: products.images,
};

type ReviewProductRow = {
  id: string;
  title: string;
  slug: string;
  sku: string;
  images: unknown;
};

/**
 * Columns every read selects from the order item behind the review.
 *
 * One join on `reviews.order_item_id`, never a lookup per row — the whole
 * point of the shared definition next door. The size and frame live inside the
 * purchase-time `snapshot`, so this is one jsonb column rather than three.
 */
const reviewOrderItemColumns = {
  itemSnapshot: orderItems.snapshot,
};

function toItemType(
  snapshot: OrderItemSnapshot | null | undefined
): ReviewItemTypePayload | null {
  if (!snapshot) return null;

  const itemType = {
    sizeLabel: snapshot.sizeLabel ?? null,
    frameName: snapshot.frameName ?? null,
    frameType: snapshot.frameType ?? null,
  };

  // A snapshot with none of the three is no better than no snapshot; null lets
  // the card drop the line rather than render "Item type:" followed by nothing.
  return itemType.sizeLabel || itemType.frameName || itemType.frameType
    ? itemType
    : null;
}

function toProductChip(
  product: ReviewProductRow | null | undefined
): ReviewProductPayload | null {
  if (!product?.id) return null;

  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    imageUrl: mainImage(product.images as ProductImage[] | null)?.url ?? null,
  };
}

/**
 * Turn one selected review row into the public card shape.
 *
 * `verified` is derived, not stored. `reviews.order_item_id` is NOT NULL
 * behind an FK, so a row in this table *is* a purchase — a column would only
 * be a second, driftable copy of that fact.
 *
 * The product is passed in rather than read off the row because the two list
 * reads get it from different places: the site-wide list joins it per row,
 * while the product-scoped list already looked the one product up to decide
 * whether to 404 and has no reason to join it again.
 */
function toReviewCard<T extends { itemSnapshot?: OrderItemSnapshot | null }>(
  row: T,
  product: ReviewProductRow | null | undefined
) {
  // `itemSnapshot` is the raw purchase record and never leaves the API; a row
  // that also carries a joined `product` has it replaced by the chip below.
  const { itemSnapshot, ...rest } = row;

  return {
    ...rest,
    verified: true as const,
    itemType: toItemType(itemSnapshot),
    product: toProductChip(product),
  };
}

/**
 * Rating summary for a product. Mirrors ReviewStatsResponse in
 * packages/web/app/hooks/useReviews.ts — keep the two in step.
 */
interface ReviewStatsPayload {
  averageRating: number;
  totalReviews: number;
  distribution: Array<{
    rating: number;
    count: number;
    percentage: number;
  }>;
}

/**
 * Turn per-rating counts into the summary the product page renders.
 *
 * Exported so the arithmetic — average rounding, percentages, and the
 * always-five-buckets guarantee — can be tested without a database. Seeding
 * real reviews requires a full order chain, since reviews.order_item_id is
 * NOT NULL with an FK.
 */
export function buildReviewStats(
  rows: Array<{ rating: number | string; count: number | string }>
): ReviewStatsPayload {
  const countByRating = new Map(
    rows.map((row) => [Number(row.rating), Number(row.count)])
  );

  const totalReviews = [...countByRating.values()].reduce(
    (sum, count) => sum + count,
    0
  );
  const ratingSum = [...countByRating.entries()].reduce(
    (sum, [rating, count]) => sum + rating * count,
    0
  );

  return {
    // One decimal place — matches how the summary renders it.
    averageRating: totalReviews
      ? Math.round((ratingSum / totalReviews) * 10) / 10
      : 0,
    totalReviews,
    distribution: [5, 4, 3, 2, 1].map((rating) => {
      const count = countByRating.get(rating) ?? 0;
      return {
        rating,
        count,
        percentage: totalReviews ? Math.round((count / totalReviews) * 100) : 0,
      };
    }),
  };
}

/**
 * Drop every cached read for a product's reviews — the paginated lists and
 * the rating summary.
 *
 * The list keys embed page/pageSize/sortBy, so clearing them needs a pattern
 * delete. The previous code passed a "...:*" string to deleteCached, which
 * deletes one exact key; the wildcard was never expanded, so stale review
 * lists survived edits and deletions for the full 5-minute TTL.
 */
async function invalidateProductReviewCaches(productId: string): Promise<void> {
  // Keep these prefixes in step with the keys the reads write. They were
  // bumped to v2 when media was embedded and again when the card fields
  // landed; a pattern still pointing at an older shape deletes nothing and the
  // stale entries live out their full TTL.
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}product:v3:${productId}:*`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}stats:${productId}`);

  // A review edit or deletion also moves the site-wide surfaces: the /reviews
  // page, the home strip and the media wall all read the same rows.
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}all:v2:*`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}media:v1:*`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}stats:catalogue:v1`);
}

// ============================================================================
// Route Handlers
// ============================================================================

// Product reviews routes (nested under products)
const productReviewsApp = new Hono<{ Variables: OptionalAuthVariables }>();

// Apply optional auth to list reviews (shows user's own pending reviews if logged in)
productReviewsApp.use("*", optionalAuth);

/**
 * GET /api/products/:productId/reviews/stats - Rating summary for a product
 *
 * Consumed by the product detail page's review summary block. Registered
 * before "/" so the literal segment is matched first.
 *
 * Returns every star bucket, including empty ones, so the UI can render a
 * stable five-row distribution without filling gaps itself.
 */
productReviewsApp.get("/stats", async (c) => {
  const productId = c.req.param("productId");

  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
    return c.json({ error: "Invalid product ID" }, 400);
  }

  const cacheKey = `${REVIEW_CACHE_PREFIX}stats:${productId}`;
  const cached = await getCached<ReviewStatsPayload>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  try {
    const product = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (product.length === 0) {
      return c.json({ error: "Product not found" }, 404);
    }

    // One grouped query rather than five counts.
    const rows = await db
      .select({
        rating: reviews.rating,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.productId, productId),
          eq(reviews.status, "approved" as ReviewStatus)
        )
      )
      .groupBy(reviews.rating);

    const payload = buildReviewStats(rows);

    await setCached(cacheKey, payload, CACHE_TTL_REVIEWS);

    return c.json(payload);
  } catch (error) {
    console.error("Error fetching review stats:", error);
    return c.json({ error: "Failed to fetch review stats" }, 500);
  }
});

/**
 * GET /api/products/:productId/reviews - List reviews for a product
 */
productReviewsApp.get(
  "/",
  zValidator("query", listReviewsQuerySchema),
  async (c) => {
    const productId = c.req.param("productId");
    const { page, pageSize, sortBy } = c.req.valid("query");
    const user = c.get("user");

    // Validate productId is a valid UUID
    if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
      return c.json({ error: "Invalid product ID" }, 400);
    }

    // Build cache key.
    //
    // v2 added `media` on every item; v3 adds `verified`, `itemType` and the
    // product chip. Same reason both times: nodes with a warm cache keep
    // serving the older shape for the full TTL after deploy, so the cards that
    // land on those nodes render without the badge or the item type while the
    // ones next to them render with it.
    const cacheKey = `${REVIEW_CACHE_PREFIX}product:v3:${productId}:${page}:${pageSize}:${sortBy}`;

    // Try cache first (only for non-authenticated requests)
    if (!user) {
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
    }

    try {
      // Check if product exists.
      //
      // Selects the chip columns rather than just the id: every review on this
      // page is about this one product, so the lookup that already decides the
      // 404 is also the cheapest possible source for the chip. Joining
      // `products` per row would repeat the same values down the page for no
      // extra information.
      const product = await db
        .select(reviewProductColumns)
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product.length) {
        return c.json({ error: "Product not found" }, 404);
      }

      const productChip = product[0] as ReviewProductRow;

      // Build sort order
      const orderBy = {
        newest: desc(reviews.createdAt),
        highest: desc(reviews.rating),
        lowest: asc(reviews.rating),
      }[sortBy];

      // Base condition: approved reviews for this product
      const baseCondition = and(
        eq(reviews.productId, productId),
        eq(reviews.status, "approved" as ReviewStatus)
      );

      // Get total count of approved reviews
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(baseCondition);

      const total = countResult[0]?.count ?? 0;

      // Calculate offset
      const offset = (page - 1) * pageSize;

      // Get approved reviews with author info
      const reviewList = await db
        .select({
          id: reviews.id,
          productId: reviews.productId,
          rating: reviews.rating,
          title: reviews.title,
          content: reviews.content,
          status: reviews.status,
          createdAt: reviews.createdAt,
          updatedAt: reviews.updatedAt,
          author: {
            id: users.id,
            name: users.name,
          },
          ...reviewOrderItemColumns,
        })
        .from(reviews)
        .leftJoin(users, eq(reviews.userId, users.id))
        // One join for the whole page's item types. left, not inner: an order
        // item that has gone missing costs the review its "Item type:" line,
        // not its place on the page.
        .leftJoin(orderItems, eq(reviews.orderItemId, orderItems.id))
        .where(baseCondition)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset);

      // If user is logged in, also fetch their own pending reviews for this product
      let userPendingReviews: typeof reviewList = [];
      if (user) {
        userPendingReviews = await db
          .select({
            id: reviews.id,
            productId: reviews.productId,
            rating: reviews.rating,
            title: reviews.title,
            content: reviews.content,
            status: reviews.status,
            createdAt: reviews.createdAt,
            updatedAt: reviews.updatedAt,
            author: {
              id: users.id,
              name: users.name,
            },
            ...reviewOrderItemColumns,
          })
          .from(reviews)
          .leftJoin(users, eq(reviews.userId, users.id))
          .leftJoin(orderItems, eq(reviews.orderItemId, orderItems.id))
          .where(
            and(
              eq(reviews.productId, productId),
              eq(reviews.userId, user.id),
              eq(reviews.status, "pending" as ReviewStatus)
            )
          );
      }

      // Embed each review's ready media. Two grouped queries at most, never
      // one per review.
      const items = (await withMedia(reviewList)).map((row) =>
        toReviewCard(row, productChip)
      );
      const pendingWithMedia = user
        ? (await withMedia(userPendingReviews)).map((row) =>
            toReviewCard(row, productChip)
          )
        : [];

      const result = {
        items,
        userPendingReviews: user ? pendingWithMedia : undefined,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      };

      // Cache the result (only for non-authenticated requests)
      if (!user) {
        await setCached(cacheKey, { items, total }, CACHE_TTL_REVIEWS);
      }

      return c.json(result);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      return c.json({ error: "Failed to fetch reviews" }, 500);
    }
  }
);

// Individual review routes
const reviewsApp = new Hono<{ Variables: OptionalAuthVariables }>();
reviewsApp.use("*", optionalAuth);

/**
 * GET /api/reviews/stats - catalogue-wide review aggregate
 *
 * Feeds the collection-grid promo tile (analysis §1.3.6). The stats route
 * above it is per-product; this is the figure for the whole catalogue.
 *
 * `averageRating` is null, not 0, when nothing is approved — the same rule
 * the product list applies to its per-product aggregate. A synthetic 0.0
 * renders as "rated badly" rather than "not yet rated". The tile renders
 * nothing on null rather than rounding a thin sample up into a marketing
 * number.
 *
 * Registered BEFORE `/:reviewId`, or "stats" is read as a review id.
 */
reviewsApp.get("/stats", async (c) => {
  const cacheKey = `${REVIEW_CACHE_PREFIX}stats:catalogue:v1`;

  const cached = await getCached<{
    averageRating: number | null;
    reviewCount: number;
  }>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const [row] = await db
      .select({
        averageRating: sql<
          string | null
        >`round(avg(${reviews.rating})::numeric, 1)`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(eq(reviews.status, "approved" as ReviewStatus));

    const reviewCount = row?.reviewCount ?? 0;

    const payload = {
      // postgres hands numeric back as a string; a string here renders fine
      // and then silently concatenates the first time anything does
      // arithmetic on it.
      averageRating:
        reviewCount > 0 && row?.averageRating != null
          ? Number(row.averageRating)
          : null,
      reviewCount,
    };

    await setCached(cacheKey, payload, CACHE_TTL_REVIEWS);

    return c.json(payload);
  } catch (error) {
    console.error("Error fetching catalogue review stats:", error);
    return c.json({ error: "Failed to fetch review stats" }, 500);
  }
});

/**
 * GET /api/reviews/media - flat feed of ready customer media
 *
 * Feeds the PDP media wall (`?productId=`) and the site-wide strip (no
 * filter). Flat rather than grouped by review because both surfaces render a
 * tile per photo, not a card per review; grouping here would only be undone
 * by the caller.
 *
 * Registered BEFORE `/:reviewId` — the same trap as `/stats` above. Behind
 * that route, "media" is a review id, and a malformed one at that, so the
 * whole wall would 400.
 */
reviewsApp.get(
  "/media",
  zValidator("query", mediaFeedQuerySchema),
  async (c) => {
    const { productId } = c.req.valid("query");

    const cacheKey = `${REVIEW_CACHE_PREFIX}media:v1:${productId ?? "all"}`;

    const cached = await getCached<{
      items: unknown[];
      total: number;
    }>(cacheKey);
    if (cached) {
      return c.json({ ...cached, fromCache: true });
    }

    try {
      // Media inherits its parent review's moderation state, so an approved
      // review is a precondition for showing any of its photos — a rejected
      // review's images must not survive the rejection as anonymous tiles.
      const conditions = [
        eq(reviewMedia.processingStatus, "ready" as ReviewMediaStatus),
        eq(reviews.status, "approved" as ReviewStatus),
      ];

      if (productId) {
        conditions.push(eq(reviews.productId, productId));
      }

      const rows = await db
        .select({
          ...reviewMediaColumns,
          productId: reviews.productId,
          rating: reviews.rating,
          reviewCreatedAt: reviews.createdAt,
        })
        .from(reviewMedia)
        .innerJoin(reviews, eq(reviewMedia.reviewId, reviews.id))
        .where(and(...conditions))
        .orderBy(desc(reviews.createdAt), asc(reviewMedia.sortOrder))
        .limit(MEDIA_FEED_LIMIT);

      const payload = { items: rows, total: rows.length };

      await setCached(cacheKey, payload, CACHE_TTL_REVIEWS);

      return c.json(payload);
    } catch (error) {
      console.error("Error fetching review media feed:", error);
      return c.json({ error: "Failed to fetch review media" }, 500);
    }
  }
);

/**
 * GET /api/reviews - every approved review across the catalogue
 *
 * The product-scoped list above answers "what do people say about this
 * poster". This answers "what do people say", which is what the /reviews page
 * and the home strip need and what nothing exposed before.
 *
 * Each item carries the product it is about — a review shown away from its
 * product detail page is unreadable without one — and its ready media.
 *
 * Registered BEFORE `/:reviewId`. `/` and `/:reviewId` do not actually
 * collide, but keeping every literal above the wildcard is the rule this file
 * is easiest to get wrong on.
 */
reviewsApp.get(
  "/",
  zValidator("query", listReviewsQuerySchema),
  async (c) => {
    const { page, pageSize, sortBy } = c.req.valid("query");

    // sortBy is part of the key, not just the query: two orderings share a
    // page number, and a key without it serves "highest" from the "newest"
    // entry.
    //
    // v2 since the item gained `verified`, `itemType` and the sku on its chip;
    // a warm node on v1 would serve cards the grid renders half-empty.
    const cacheKey = `${REVIEW_CACHE_PREFIX}all:v2:${page}:${pageSize}:${sortBy}`;

    const cached = await getCached<Record<string, unknown>>(cacheKey);
    if (cached) {
      return c.json({ ...cached, fromCache: true });
    }

    try {
      const baseCondition = eq(reviews.status, "approved" as ReviewStatus);

      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(baseCondition);

      const total = countResult[0]?.count ?? 0;

      const orderBy = {
        newest: desc(reviews.createdAt),
        highest: desc(reviews.rating),
        lowest: asc(reviews.rating),
      }[sortBy];

      const reviewList = await db
        .select({
          id: reviews.id,
          productId: reviews.productId,
          rating: reviews.rating,
          title: reviews.title,
          content: reviews.content,
          createdAt: reviews.createdAt,
          updatedAt: reviews.updatedAt,
          author: {
            id: users.id,
            name: users.name,
          },
          product: reviewProductColumns,
          ...reviewOrderItemColumns,
        })
        .from(reviews)
        // inner join: a review whose product has been deleted has nowhere to
        // link to, so it is not showable on a site-wide surface.
        .innerJoin(products, eq(reviews.productId, products.id))
        .leftJoin(users, eq(reviews.userId, users.id))
        // One join for the whole page's item types, never a lookup per row.
        .leftJoin(orderItems, eq(reviews.orderItemId, orderItems.id))
        .where(baseCondition)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const items = (await withMedia(reviewList)).map((row) =>
        toReviewCard(row, row.product)
      );

      const payload = {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      };

      await setCached(cacheKey, payload, CACHE_TTL_REVIEWS);

      return c.json(payload);
    } catch (error) {
      console.error("Error fetching site-wide reviews:", error);
      return c.json({ error: "Failed to fetch reviews" }, 500);
    }
  }
);

/**
 * GET /api/reviews/:reviewId - Get a single review
 */
reviewsApp.get("/:reviewId", async (c) => {
  const reviewId = c.req.param("reviewId");
  const user = c.get("user");

  // Validate reviewId
  if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
    return c.json({ error: "Invalid review ID" }, 400);
  }

  try {
    const reviewResult = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        userId: reviews.userId,
        rating: reviews.rating,
        title: reviews.title,
        content: reviews.content,
        status: reviews.status,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt,
        author: {
          id: users.id,
          name: users.name,
        },
        product: reviewProductColumns,
        ...reviewOrderItemColumns,
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      // Both joins on the one query the route already made: a single review is
      // still a card, and a card needs its chip and its item type.
      .leftJoin(products, eq(reviews.productId, products.id))
      .leftJoin(orderItems, eq(reviews.orderItemId, orderItems.id))
      .where(eq(reviews.id, reviewId))
      .limit(1);

    if (!reviewResult.length) {
      return c.json({ error: "Review not found" }, 404);
    }

    const review = reviewResult[0]!;

    // Only show approved reviews, unless it's the owner viewing their own
    if (review.status !== "approved") {
      if (!user || user.id !== review.userId) {
        return c.json({ error: "Review not found" }, 404);
      }
    }

    // Fetched after the visibility gate, not before: a caller who may not see
    // the review may not see its photos either, and there is no reason to
    // query for media we are about to throw away.
    const media = (await fetchMediaByReview([review.id])).get(review.id) ?? [];

    return c.json({
      review: { ...toReviewCard(review, review.product), media },
    });
  } catch (error) {
    console.error("Error fetching review:", error);
    return c.json({ error: "Failed to fetch review" }, 500);
  }
});

// Protected review routes
const protectedReviewsApp = new Hono<{ Variables: AuthVariables }>();
protectedReviewsApp.use("*", requireAuth);

/**
 * PATCH /api/reviews/:reviewId - Update own review
 */
protectedReviewsApp.patch(
  "/:reviewId",
  zValidator("json", updateReviewSchema),
  async (c) => {
    const reviewId = c.req.param("reviewId");
    const updates = c.req.valid("json");
    const user = c.get("user");

    // Validate reviewId
    if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
      return c.json({ error: "Invalid review ID" }, 400);
    }

    // Must provide at least one field to update
    if (!updates.rating && !updates.title && !updates.content) {
      return c.json({ error: "No updates provided" }, 400);
    }

    try {
      // Get the existing review
      const existingReview = await db
        .select({
          id: reviews.id,
          userId: reviews.userId,
          productId: reviews.productId,
        })
        .from(reviews)
        .where(eq(reviews.id, reviewId))
        .limit(1);

      if (!existingReview.length) {
        return c.json({ error: "Review not found" }, 404);
      }

      // Check ownership - only owner can update
      if (!canAccess(user, existingReview[0]!.userId)) {
        throw new HTTPException(403, { message: "You can only update your own reviews" });
      }

      // Update the review and reset status to pending
      const [updatedReview] = await db
        .update(reviews)
        .set({
          ...updates,
          status: "pending", // Reset to pending for re-moderation
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, reviewId))
        .returning();

      // Invalidate cache. These are wildcard keys, so they need
      // deleteCachedPattern — deleteCached takes an exact key and was
      // silently deleting a literal "...:*" that never existed.
      await invalidateProductReviewCaches(existingReview[0]!.productId);

      return c.json({
        message: "Review updated successfully",
        review: {
          id: updatedReview!.id,
          rating: updatedReview!.rating,
          title: updatedReview!.title,
          content: updatedReview!.content,
          status: updatedReview!.status,
          updatedAt: updatedReview!.updatedAt,
        },
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      console.error("Error updating review:", error);
      return c.json({ error: "Failed to update review" }, 500);
    }
  }
);

/**
 * DELETE /api/reviews/:reviewId - Delete own review
 */
protectedReviewsApp.delete("/:reviewId", async (c) => {
  const reviewId = c.req.param("reviewId");
  const user = c.get("user");

  // Validate reviewId
  if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
    return c.json({ error: "Invalid review ID" }, 400);
  }

  try {
    // Get the existing review
    const existingReview = await db
      .select({
        id: reviews.id,
        userId: reviews.userId,
        productId: reviews.productId,
      })
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);

    if (!existingReview.length) {
      return c.json({ error: "Review not found" }, 404);
    }

    // Check ownership - only owner can delete
    if (!canAccess(user, existingReview[0]!.userId)) {
      throw new HTTPException(403, { message: "You can only delete your own reviews" });
    }

    // Delete the review
    await db.delete(reviews).where(eq(reviews.id, reviewId));

    // Invalidate cache
    await invalidateProductReviewCaches(existingReview[0]!.productId);

    return c.json({ message: "Review deleted successfully" });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error deleting review:", error);
    return c.json({ error: "Failed to delete review" }, 500);
  }
});

// Export the routers
export {
  productReviewsApp,
  reviewsApp,
  protectedReviewsApp,
  createReviewSchema,
  updateReviewSchema,
  listReviewsQuerySchema,
};
