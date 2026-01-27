// Reviews database schema for Product Reviews feature
// Following the patterns defined in docs/poster-app-tech-stack.md

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
import { products } from "./products";
import { users } from "./users";

// ============================================================================
// Enums
// ============================================================================

/**
 * Review status enum for moderation workflow
 * - pending: Review submitted, awaiting moderation
 * - approved: Review approved and visible on product page
 * - rejected: Review rejected by moderator
 */
export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Reviews table - Product reviews with ratings and moderation
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Product being reviewed
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),

    // User who wrote the review (text type to match Better Auth users table)
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    // Review content
    rating: integer("rating").notNull(), // 1-5 stars
    title: text("title"), // Optional review title
    content: text("content").notNull(), // Review text

    // Moderation
    status: reviewStatusEnum("status").default("pending").notNull(),
    moderatorId: text("moderator_id").references(() => users.id, {
      onDelete: "set null",
    }),
    moderatorNotes: text("moderator_notes"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    // Indexes for common query patterns
    productIdIdx: index("reviews_product_id_idx").on(table.productId),
    userIdIdx: index("reviews_user_id_idx").on(table.userId),
    statusIdx: index("reviews_status_idx").on(table.status),
    createdAtIdx: index("reviews_created_at_idx").on(table.createdAt),
    // Composite index for listing approved reviews by product
    productStatusIdx: index("reviews_product_status_idx").on(
      table.productId,
      table.status
    ),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Reviews relations
 */
export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  author: one(users, {
    fields: [reviews.userId],
    references: [users.id],
    relationName: "reviewAuthor",
  }),
  moderator: one(users, {
    fields: [reviews.moderatorId],
    references: [users.id],
    relationName: "reviewModerator",
  }),
}));

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
