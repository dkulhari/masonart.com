/**
 * Review Media Upload Routes
 *
 * - POST /api/reviews/:reviewId/media/presign  - authorise a direct-to-R2 PUT
 * - POST /api/reviews/:reviewId/media/complete - record the uploaded object
 *
 * WHY UPLOADS DO NOT GO THROUGH HONO
 *
 * A review video is capped at 200MB. Routing that through the API means
 * buffering it in the Node process and holding a request open for the whole
 * transfer, on a box that also serves the storefront. The browser PUTs
 * straight to R2 against a short-lived presigned URL instead, and only tells
 * us the object key afterwards.
 *
 * That split is why `complete` exists, and why it re-validates everything
 * `presign` already checked: the two calls are minutes apart and nothing
 * guarantees the second one came from the same page, or that the review has
 * not been moderated in between.
 *
 * Images land `ready` — `uploadOptimizedImage` is not involved, the original
 * is servable as-is. Videos land `processing` and hand off to the transcode
 * worker, because a phone MP4 is routinely 10-bit 4:2:2 that no desktop
 * browser will play.
 *
 * These live here rather than in routes/reviews.ts, which is already past 600
 * lines and covers a different concern (reading and moderating reviews).
 *
 * @see packages/api/src/queues/review-media.ts
 * @see packages/api/src/lib/storage.ts
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";

import { db } from "../database";
import { reviews } from "../database/schema/reviews";
import {
  reviewMedia,
  type ReviewMediaType,
} from "../database/schema/review-media";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { deleteCachedPattern } from "../lib/redis";
import {
  REVIEW_MEDIA_LIMITS,
  StoragePaths,
  getPresignedUploadUrl,
  getPublicUrl,
} from "../lib/storage";
import { reviewMediaQueue } from "../queues/review-media";

// ============================================================================
// Constants
// ============================================================================

/**
 * Hard ceiling on media per review.
 *
 * The 6th is a 409, not a silent drop: the client has already uploaded the
 * bytes by the time `complete` runs, and pretending it worked would leave an
 * orphan object nobody ever renders.
 */
const MAX_MEDIA_PER_REVIEW = 5;

/** Presigned PUT lifetime. Long enough for a 200MB clip on hotel wifi. */
const PRESIGN_EXPIRY_SECONDS = 15 * 60;

/**
 * Keep this in step with REVIEW_CACHE_PREFIX in routes/reviews.ts — the keys
 * written there are the keys invalidated here.
 */
const REVIEW_CACHE_PREFIX = "reviews:";

/**
 * Extension per accepted content type.
 *
 * `getExtensionFromContentType` in lib/storage.ts only knows images and falls
 * back to 'jpg', which would key an .mp4 upload as .jpg — and the transcode
 * worker recomputes its derivative keys from the source key, so the mistake
 * would follow the file all the way to playback.
 */
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

// ============================================================================
// Validation
// ============================================================================

const reviewIdSchema = z.string().uuid();

/**
 * `sizeBytes` is the browser's declared size, not a measured one, so it is a
 * cheap early reject rather than the enforcement point — R2 is told the same
 * content type in the signature, and the worker probes the real file.
 */
const presignBodySchema = z.object({
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive(),
  filename: z.string().min(1).max(255).optional(),
});

const completeBodySchema = z.object({
  key: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(128),
  sortOrder: z.number().int().min(0).max(MAX_MEDIA_PER_REVIEW).optional(),
});

// ============================================================================
// Helpers
// ============================================================================

interface MediaKind {
  mediaType: ReviewMediaType;
  maxBytes: number;
  extension: string;
}

/**
 * Resolve an accepted content type to its media kind and size cap.
 *
 * Gated on REVIEW_MEDIA_LIMITS rather than `isValidImageType`, which also
 * admits image/gif — an animated gif has no transcode path here and would be
 * served as a still first frame on some clients.
 */
function resolveMediaKind(contentType: string): MediaKind | null {
  const normalised = contentType.toLowerCase().trim();
  const extension = EXTENSION_BY_CONTENT_TYPE[normalised];
  if (!extension) return null;

  if ((REVIEW_MEDIA_LIMITS.image.types as readonly string[]).includes(normalised)) {
    return {
      mediaType: "image",
      maxBytes: REVIEW_MEDIA_LIMITS.image.maxBytes,
      extension,
    };
  }

  if ((REVIEW_MEDIA_LIMITS.video.types as readonly string[]).includes(normalised)) {
    return {
      mediaType: "video",
      maxBytes: REVIEW_MEDIA_LIMITS.video.maxBytes,
      extension,
    };
  }

  return null;
}

/** The prefix every object key for this review must sit under. */
function mediaPrefixFor(reviewId: string): string {
  // reviewMedia(id, 'x') -> `reviews/<id>/media/x`; drop the filename.
  const sample = StoragePaths.reviewMedia(reviewId, "x");
  return sample.slice(0, sample.length - 1);
}

interface ReviewRow {
  id: string;
  userId: string;
  productId: string;
  status: string;
}

/**
 * Load the review and assert the caller may attach media to it.
 *
 * Returns either the row or the response to send instead. Ownership is an
 * exact user-id match rather than `canAccess`: an admin has no business
 * attaching photos to a customer's review, and the moderation queue is where
 * staff act on media.
 */
async function loadAttachableReview(
  reviewId: string,
  userId: string
): Promise<{ review: ReviewRow } | { error: string; status: 403 | 404 | 409 }> {
  const rows = await db
    .select({
      id: reviews.id,
      userId: reviews.userId,
      productId: reviews.productId,
      status: reviews.status,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  const review = rows[0] as ReviewRow | undefined;
  if (!review) {
    return { error: "Review not found", status: 404 };
  }

  if (review.userId !== userId) {
    return { error: "You can only attach media to your own reviews", status: 403 };
  }

  // Media on an already-approved review would go live without ever passing
  // moderation, so the window closes when the review leaves `pending`.
  if (review.status !== "pending") {
    return {
      error: "Media can only be attached while the review is pending review",
      status: 409,
    };
  }

  return { review };
}

/** How many media rows this review already has. */
async function countMedia(reviewId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(reviewMedia)
    .where(eq(reviewMedia.reviewId, reviewId));

  return Number(rows[0]?.count ?? 0);
}

/**
 * Drop every cached surface that embeds this product's review media.
 *
 * Mirrors invalidateProductReviewCaches in routes/reviews.ts — new media
 * changes the PDP wall, the /reviews page and the home strip alike.
 */
async function invalidateReviewCaches(productId: string): Promise<void> {
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}product:v2:${productId}:*`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}stats:${productId}`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}all:v1:*`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}media:v1:*`);
}

// ============================================================================
// Router
// ============================================================================

const reviewMediaApp = new Hono<{ Variables: AuthVariables }>();

reviewMediaApp.use("*", requireAuth);

/**
 * POST /api/reviews/:reviewId/media/presign
 *
 * Returns a short-lived PUT url and the object key the client must report
 * back to `complete`. Creates no row — an abandoned upload should leave
 * nothing behind but an unreferenced object.
 */
reviewMediaApp.post(
  "/:reviewId/media/presign",
  zValidator("json", presignBodySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }
  }),
  async (c) => {
    const reviewId = c.req.param("reviewId");
    const { contentType, sizeBytes } = c.req.valid("json");
    const user = c.get("user");

    if (!reviewIdSchema.safeParse(reviewId).success) {
      return c.json({ error: "Invalid review ID" }, 400);
    }

    try {
      const loaded = await loadAttachableReview(reviewId, user.id);
      if ("error" in loaded) {
        return c.json({ error: loaded.error }, loaded.status);
      }

      const kind = resolveMediaKind(contentType);
      if (!kind) {
        return c.json(
          {
            error: "Unsupported media type",
            allowed: [
              ...REVIEW_MEDIA_LIMITS.image.types,
              ...REVIEW_MEDIA_LIMITS.video.types,
            ],
          },
          400
        );
      }

      if (sizeBytes > kind.maxBytes) {
        return c.json(
          {
            error: `File is too large. The limit for ${kind.mediaType} is ${Math.round(
              kind.maxBytes / (1024 * 1024)
            )}MB.`,
            maxBytes: kind.maxBytes,
          },
          400
        );
      }

      const existing = await countMedia(reviewId);
      if (existing >= MAX_MEDIA_PER_REVIEW) {
        return c.json(
          {
            error: `A review may have at most ${MAX_MEDIA_PER_REVIEW} photos or videos.`,
            limit: MAX_MEDIA_PER_REVIEW,
          },
          409
        );
      }

      // The client's filename never reaches the key: it is attacker-controlled
      // and the worker needs a key it can recompute, not one it has to quote.
      const key = StoragePaths.reviewMedia(
        reviewId,
        `${crypto.randomUUID()}.${kind.extension}`
      );

      const uploadUrl = await getPresignedUploadUrl(
        key,
        contentType,
        PRESIGN_EXPIRY_SECONDS
      );

      return c.json({
        uploadUrl,
        key,
        contentType,
        mediaType: kind.mediaType,
        maxBytes: kind.maxBytes,
        expiresInSeconds: PRESIGN_EXPIRY_SECONDS,
      });
    } catch (error) {
      console.error("Error presigning review media upload:", error);
      return c.json({ error: "Failed to prepare upload" }, 500);
    }
  }
);

/**
 * POST /api/reviews/:reviewId/media/complete
 *
 * Records the uploaded object. Images are immediately servable; videos are
 * parked at `processing` and handed to the transcode worker, which fills in
 * the playable rendition, poster frame and dimensions.
 */
reviewMediaApp.post(
  "/:reviewId/media/complete",
  zValidator("json", completeBodySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }
  }),
  async (c) => {
    const reviewId = c.req.param("reviewId");
    const { key, contentType, sortOrder } = c.req.valid("json");
    const user = c.get("user");

    if (!reviewIdSchema.safeParse(reviewId).success) {
      return c.json({ error: "Invalid review ID" }, 400);
    }

    try {
      const loaded = await loadAttachableReview(reviewId, user.id);
      if ("error" in loaded) {
        return c.json({ error: loaded.error }, loaded.status);
      }
      const { review } = loaded;

      // The key is client-supplied. Without this check a caller can point a
      // media row at any object in the bucket — including another customer's
      // upload — and have it rendered under their own review.
      if (!key.startsWith(mediaPrefixFor(reviewId))) {
        return c.json({ error: "Upload key does not belong to this review" }, 400);
      }

      const kind = resolveMediaKind(contentType);
      if (!kind) {
        return c.json({ error: "Unsupported media type" }, 400);
      }

      const existing = await countMedia(reviewId);
      if (existing >= MAX_MEDIA_PER_REVIEW) {
        return c.json(
          {
            error: `A review may have at most ${MAX_MEDIA_PER_REVIEW} photos or videos.`,
            limit: MAX_MEDIA_PER_REVIEW,
          },
          409
        );
      }

      const url = getPublicUrl(key);
      const isVideo = kind.mediaType === "video";

      const [inserted] = await db
        .insert(reviewMedia)
        .values({
          reviewId,
          mediaType: kind.mediaType,
          url,
          // A video's thumbnail is the poster frame, which does not exist
          // until the worker has run.
          thumbnailUrl: isVideo ? null : url,
          sortOrder: sortOrder ?? existing,
          processingStatus: isVideo ? "processing" : "ready",
        })
        .returning();

      if (isVideo && inserted) {
        await reviewMediaQueue.add("transcode", {
          mediaId: inserted.id,
          sourceKey: key,
        });
      }

      await invalidateReviewCaches(review.productId);

      return c.json(
        {
          media: {
            id: inserted!.id,
            reviewId,
            mediaType: kind.mediaType,
            url: inserted!.url,
            thumbnailUrl: inserted!.thumbnailUrl ?? null,
            posterUrl: inserted!.posterUrl ?? null,
            sortOrder: inserted!.sortOrder,
            processingStatus: inserted!.processingStatus,
          },
        },
        201
      );
    } catch (error) {
      console.error("Error completing review media upload:", error);
      return c.json({ error: "Failed to record upload" }, 500);
    }
  }
);

export default reviewMediaApp;
export { reviewMediaApp, MAX_MEDIA_PER_REVIEW };
