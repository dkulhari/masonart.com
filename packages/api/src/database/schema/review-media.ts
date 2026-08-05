// Review media database schema for the Review Surfaces feature
// Customer photos AND videos attached to product reviews.
//
// Media carries no moderation status of its own — it inherits the parent
// review's `status`. `processingStatus` tracks the transcode pipeline only.

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { reviews } from "./reviews";

// ============================================================================
// Enums
// ============================================================================

/**
 * Media kind enum
 * - image: customer photo
 * - video: customer video clip
 */
export const reviewMediaTypeEnum = pgEnum("review_media_type", [
  "image",
  "video",
]);

/**
 * Transcode/processing pipeline status — NOT moderation.
 * Moderation is inherited from the parent review's `status`.
 * - processing: upload accepted, renditions being generated
 * - ready: renditions available, safe to serve
 * - failed: pipeline failed, see processingError
 */
export const reviewMediaStatusEnum = pgEnum("review_media_status", [
  "processing",
  "ready",
  "failed",
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Review media table - photos and videos attached to a product review
 */
export const reviewMedia = pgTable(
  "review_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Parent review reference — media is deleted with its review
    reviewId: uuid("review_id")
      .references(() => reviews.id, { onDelete: "cascade" })
      .notNull(),

    // What kind of media this row holds
    mediaType: reviewMediaTypeEnum("media_type").notNull(),

    // Media URLs
    url: text("url").notNull(), // Playable/displayable rendition
    thumbnailUrl: text("thumbnail_url"), // Grid thumb (images: webp variant)
    posterUrl: text("poster_url"), // Video poster frame, null for images

    // Media metadata
    durationSeconds: integer("duration_seconds"), // Video only
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),

    // Display order within the review
    sortOrder: integer("sort_order").default(0).notNull(),

    // Transcode pipeline tracking (not moderation)
    processingStatus: reviewMediaStatusEnum("processing_status")
      .default("ready")
      .notNull(),
    processingError: text("processing_error"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    reviewIdIdx: index("review_media_review_id_idx").on(table.reviewId),
    // Composite index for fetching a review's media in display order
    reviewSortIdx: index("review_media_review_sort_idx").on(
      table.reviewId,
      table.sortOrder
    ),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Review media relations
 */
export const reviewMediaRelations = relations(reviewMedia, ({ one }) => ({
  review: one(reviews, {
    fields: [reviewMedia.reviewId],
    references: [reviews.id],
  }),
}));

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type ReviewMedia = typeof reviewMedia.$inferSelect;
export type NewReviewMedia = typeof reviewMedia.$inferInsert;

export type ReviewMediaType = (typeof reviewMediaTypeEnum.enumValues)[number];
export type ReviewMediaStatus =
  (typeof reviewMediaStatusEnum.enumValues)[number];
