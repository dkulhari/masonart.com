/**
 * AI Generation Reviews Schema
 *
 * Tracks all moderation actions on AI generations for audit trail.
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { aiGenerations } from "./ai-generations";

/**
 * Review action enum
 */
export const aiReviewActionEnum = pgEnum("ai_review_action", [
  "approved",
  "rejected",
  "flagged",
  "escalated",
  "appealed",
  "appeal_approved",
  "appeal_rejected",
]);

/**
 * Rejection category enum
 */
export const aiRejectionCategoryEnum = pgEnum("ai_rejection_category", [
  "nsfw",
  "violence",
  "hate_speech",
  "copyright",
  "illegal_content",
  "spam",
  "low_quality",
  "other",
]);

/**
 * AI generation reviews table - Audit log of all moderation actions
 */
export const aiGenerationReviews = pgTable(
  "ai_generation_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // References
    generationId: uuid("generation_id")
      .references(() => aiGenerations.id, { onDelete: "cascade" })
      .notNull(),
    reviewerId: text("reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Action details
    action: aiReviewActionEnum("action").notNull(),
    reason: text("reason"), // Free-text reason
    category: aiRejectionCategoryEnum("category"), // Structured category

    // Context
    previousStatus: text("previous_status"), // Status before this action
    newStatus: text("new_status"), // Status after this action

    // Audit info
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    generationIdIdx: index("ai_generation_reviews_generation_id_idx").on(
      table.generationId
    ),
    reviewerIdIdx: index("ai_generation_reviews_reviewer_id_idx").on(
      table.reviewerId
    ),
    actionIdx: index("ai_generation_reviews_action_idx").on(table.action),
    createdAtIdx: index("ai_generation_reviews_created_at_idx").on(
      table.createdAt
    ),
  })
);

/**
 * Relations
 */
export const aiGenerationReviewsRelations = relations(
  aiGenerationReviews,
  ({ one }) => ({
    generation: one(aiGenerations, {
      fields: [aiGenerationReviews.generationId],
      references: [aiGenerations.id],
    }),
    reviewer: one(users, {
      fields: [aiGenerationReviews.reviewerId],
      references: [users.id],
    }),
  })
);

// Type exports
export type AIGenerationReview = typeof aiGenerationReviews.$inferSelect;
export type NewAIGenerationReview = typeof aiGenerationReviews.$inferInsert;
export type AIReviewAction = (typeof aiReviewActionEnum.enumValues)[number];
export type AIRejectionCategory =
  (typeof aiRejectionCategoryEnum.enumValues)[number];
