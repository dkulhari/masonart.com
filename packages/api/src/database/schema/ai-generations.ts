// AI generations database schema for the Poster & Frame E-Commerce Platform
// Following the patterns defined in docs/poster-app-tech-stack.md

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  jsonb,
  pgEnum,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { products } from "./products";
import { orders } from "./orders";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * AI generation prompt details stored as JSONB
 */
export interface AIPromptDetails {
  prompt: string;
  negativePrompt?: string;
  stylePreset: string;
  aspectRatio: string;
  colorMood?: string;
  colorPalette?: string[];
  referenceImageUrl?: string;
  seed?: number;
}

/**
 * Generated image stored as JSONB
 */
export interface AIGeneratedImageData {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  highResUrl?: string;
  width: number;
  height: number;
  variationIndex: number;
  seed: number;
  isSelected: boolean;
  hasWatermark: boolean;
}

/**
 * Content moderation result stored as JSONB
 */
export interface AIModerationResult {
  isPassed: boolean;
  flags: string[];
  riskScore: number;
  needsManualReview: boolean;
  moderatedAt: string; // ISO timestamp
  reviewedBy?: string;
  reviewerNotes?: string;
}

/**
 * AI model configuration used for generation
 */
export interface AIModelConfig {
  provider: string;
  version?: string;
  cfgScale?: number;
  steps?: number;
  sampler?: string;
}

// ============================================================================
// Enums
// ============================================================================

/**
 * AI generation status enum
 */
export const aiGenerationStatusEnum = pgEnum("ai_generation_status", [
  "queued", // Generation request queued
  "processing", // AI is generating images
  "completed", // Generation complete
  "failed", // Generation failed
  "cancelled", // User cancelled the request
]);

/**
 * AI model provider enum
 */
export const aiModelProviderEnum = pgEnum("ai_model_provider", [
  "stable-diffusion", // Stable Diffusion via Replicate
  "dall-e-3", // OpenAI DALL-E 3
  "midjourney", // Midjourney (if supported)
  "fal-ai", // FAL.ai
]);

/**
 * AI gallery visibility enum
 */
export const aiGalleryVisibilityEnum = pgEnum("ai_gallery_visibility", [
  "private", // Only visible to creator
  "public", // Visible in public gallery
  "unlisted", // Accessible via link only
]);

/**
 * AI style preset enum
 */
export const aiStylePresetEnum = pgEnum("ai_style_preset", [
  "wabi-sabi",
  "abstract-expression",
  "botanical",
  "geometric-modern",
  "vintage-poster",
  "pop-art",
  "watercolor",
  "photography",
  "line-art",
  "typography",
]);

/**
 * AI aspect ratio enum
 */
export const aiAspectRatioEnum = pgEnum("ai_aspect_ratio", [
  "square", // 1:1
  "portrait", // 2:3
  "landscape", // 3:2
  "panoramic", // 16:9
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * AI generations table - Stores all AI generation requests and results
 */
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // User/session identification
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sessionId: text("session_id"), // For guest users

    // Prompt details stored as JSONB for flexibility
    promptDetails: jsonb("prompt_details").$type<AIPromptDetails>().notNull(),

    // Denormalized fields for querying (from promptDetails)
    promptText: text("prompt_text").notNull(), // Main prompt text for search
    stylePreset: aiStylePresetEnum("style_preset").notNull(),
    aspectRatio: aiAspectRatioEnum("aspect_ratio").notNull(),

    // Generation status
    status: aiGenerationStatusEnum("status").default("queued").notNull(),

    // AI model info
    modelProvider: aiModelProviderEnum("model_provider")
      .default("stable-diffusion")
      .notNull(),
    modelVersion: text("model_version"),
    modelConfig: jsonb("model_config").$type<AIModelConfig>(),

    // Generated images (array of image data)
    images: jsonb("images").$type<AIGeneratedImageData[]>().default([]),
    variationCount: integer("variation_count").default(4).notNull(),

    // Selected image (when user picks one)
    selectedImageId: text("selected_image_id"),
    selectedImageUrl: text("selected_image_url"),

    // Gallery visibility
    visibility: aiGalleryVisibilityEnum("visibility")
      .default("private")
      .notNull(),

    // Engagement metrics
    likesCount: integer("likes_count").default(0).notNull(),
    viewsCount: integer("views_count").default(0).notNull(),

    // Purchase/conversion tracking
    isPurchased: boolean("is_purchased").default(false).notNull(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),

    // Content moderation
    moderationResult: jsonb("moderation_result").$type<AIModerationResult>(),
    isFlagged: boolean("is_flagged").default(false).notNull(),
    needsReview: boolean("needs_review").default(false).notNull(),

    // Processing metrics
    processingTimeMs: integer("processing_time_ms"),
    errorMessage: text("error_message"),
    errorCode: text("error_code"),
    retryCount: integer("retry_count").default(0).notNull(),

    // Queue priority (lower = higher priority)
    priority: integer("priority").default(100).notNull(),

    // Cost tracking (in smallest currency unit, e.g., cents)
    estimatedCost: integer("estimated_cost"),
    actualCost: integer("actual_cost"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    queuedAt: timestamp("queued_at"),
    processingStartedAt: timestamp("processing_started_at"),
    completedAt: timestamp("completed_at"),
    expiresAt: timestamp("expires_at"), // When generation should be cleaned up
  },
  (table) => ({
    userIdIdx: index("ai_generations_user_id_idx").on(table.userId),
    sessionIdIdx: index("ai_generations_session_id_idx").on(table.sessionId),
    statusIdx: index("ai_generations_status_idx").on(table.status),
    stylePresetIdx: index("ai_generations_style_preset_idx").on(
      table.stylePreset
    ),
    visibilityIdx: index("ai_generations_visibility_idx").on(table.visibility),
    createdAtIdx: index("ai_generations_created_at_idx").on(table.createdAt),
    isPurchasedIdx: index("ai_generations_is_purchased_idx").on(
      table.isPurchased
    ),
    productIdIdx: index("ai_generations_product_id_idx").on(table.productId),
    publicGalleryIdx: index("ai_generations_public_gallery_idx").on(
      table.visibility,
      table.status,
      table.likesCount
    ),
    needsReviewIdx: index("ai_generations_needs_review_idx").on(
      table.needsReview,
      table.isFlagged
    ),
  })
);

/**
 * AI generation likes table - Tracks user likes on public gallery items
 */
export const aiGenerationLikes = pgTable(
  "ai_generation_likes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id")
      .references(() => aiGenerations.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    generationIdIdx: index("ai_generation_likes_generation_id_idx").on(
      table.generationId
    ),
    userIdIdx: index("ai_generation_likes_user_id_idx").on(table.userId),
    // Unique constraint: one like per user per generation
    uniqueLikeIdx: index("ai_generation_likes_unique_idx").on(
      table.generationId,
      table.userId
    ),
  })
);

/**
 * AI banned prompts table - Patterns to block in content moderation
 */
export const aiBannedPrompts = pgTable(
  "ai_banned_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pattern: text("pattern").notNull(), // Regex pattern or keyword
    isRegex: boolean("is_regex").default(false).notNull(),
    reason: text("reason").notNull(),
    category: text("category"), // e.g., "nsfw", "violence", "copyright"
    severity: text("severity", {
      enum: ["low", "medium", "high", "critical"],
    })
      .default("high")
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    activeIdx: index("ai_banned_prompts_active_idx").on(table.isActive),
    categoryIdx: index("ai_banned_prompts_category_idx").on(table.category),
  })
);

/**
 * AI usage tracking table - Tracks user's AI generation usage for rate limiting
 */
export const aiUsageTracking = pgTable(
  "ai_usage_tracking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    // Period tracking
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    periodType: text("period_type", { enum: ["day", "month"] })
      .default("day")
      .notNull(),

    // Usage counts
    generationsCount: integer("generations_count").default(0).notNull(),
    successfulGenerations: integer("successful_generations")
      .default(0)
      .notNull(),
    failedGenerations: integer("failed_generations").default(0).notNull(),

    // Cost tracking
    totalCost: integer("total_cost").default(0).notNull(),

    // Limits at time of tracking
    generationsLimit: integer("generations_limit").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("ai_usage_tracking_user_id_idx").on(table.userId),
    periodIdx: index("ai_usage_tracking_period_idx").on(
      table.userId,
      table.periodStart,
      table.periodEnd
    ),
    periodTypeIdx: index("ai_usage_tracking_period_type_idx").on(
      table.periodType
    ),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * AI generations relations
 */
export const aiGenerationsRelations = relations(
  aiGenerations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [aiGenerations.userId],
      references: [users.id],
    }),
    product: one(products, {
      fields: [aiGenerations.productId],
      references: [products.id],
    }),
    order: one(orders, {
      fields: [aiGenerations.orderId],
      references: [orders.id],
    }),
    likes: many(aiGenerationLikes),
  })
);

/**
 * AI generation likes relations
 */
export const aiGenerationLikesRelations = relations(
  aiGenerationLikes,
  ({ one }) => ({
    generation: one(aiGenerations, {
      fields: [aiGenerationLikes.generationId],
      references: [aiGenerations.id],
    }),
    user: one(users, {
      fields: [aiGenerationLikes.userId],
      references: [users.id],
    }),
  })
);

/**
 * AI banned prompts relations
 */
export const aiBannedPromptsRelations = relations(
  aiBannedPrompts,
  ({ one }) => ({
    creator: one(users, {
      fields: [aiBannedPrompts.createdBy],
      references: [users.id],
    }),
  })
);

/**
 * AI usage tracking relations
 */
export const aiUsageTrackingRelations = relations(
  aiUsageTracking,
  ({ one }) => ({
    user: one(users, {
      fields: [aiUsageTracking.userId],
      references: [users.id],
    }),
  })
);

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type AIGeneration = typeof aiGenerations.$inferSelect;
export type NewAIGeneration = typeof aiGenerations.$inferInsert;

export type AIGenerationLike = typeof aiGenerationLikes.$inferSelect;
export type NewAIGenerationLike = typeof aiGenerationLikes.$inferInsert;

export type AIBannedPrompt = typeof aiBannedPrompts.$inferSelect;
export type NewAIBannedPrompt = typeof aiBannedPrompts.$inferInsert;

export type AIUsageTracking = typeof aiUsageTracking.$inferSelect;
export type NewAIUsageTracking = typeof aiUsageTracking.$inferInsert;

export type AIGenerationStatus =
  (typeof aiGenerationStatusEnum.enumValues)[number];
export type AIModelProvider =
  (typeof aiModelProviderEnum.enumValues)[number];
export type AIGalleryVisibility =
  (typeof aiGalleryVisibilityEnum.enumValues)[number];
export type AIStylePreset = (typeof aiStylePresetEnum.enumValues)[number];
export type AIAspectRatio = (typeof aiAspectRatioEnum.enumValues)[number];
