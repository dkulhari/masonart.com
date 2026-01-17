/**
 * AI Generation Zod Schemas for MasonArt Platform
 *
 * Provides runtime validation for AI generation-related data.
 * These schemas match the types defined in ../types/ai.ts
 */

import { z } from 'zod';
import { productColorSchema, posterOrientationSchema } from './product';

// ============================================================================
// Enum Schemas
// ============================================================================

export const aiStylePresetSchema = z.enum([
  'wabi-sabi',
  'abstract-expression',
  'botanical',
  'geometric-modern',
  'vintage-poster',
  'pop-art',
  'watercolor',
  'photography',
  'line-art',
  'typography',
]);

export const aiAspectRatioSchema = z.enum([
  'square',
  'portrait',
  'landscape',
  'panoramic',
]);

export const aiColorMoodSchema = z.enum([
  'warm',
  'cool',
  'neutral',
  'vibrant',
  'muted',
  'monochrome',
  'earth-tones',
  'pastel',
]);

export const aiGenerationStatusSchema = z.enum([
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export const aiSubscriptionTierSchema = z.enum([
  'guest',
  'free',
  'premium',
  'unlimited',
]);

export const aiModelProviderSchema = z.enum([
  'stable-diffusion',
  'dall-e-3',
  'midjourney',
]);

export const galleryVisibilitySchema = z.enum([
  'private',
  'public',
  'unlisted',
]);

// ============================================================================
// Generation Input Schemas
// ============================================================================

export const aiGenerationPromptSchema = z.object({
  prompt: z.string().min(3).max(1000),
  negativePrompt: z.string().max(500).optional(),
  stylePreset: aiStylePresetSchema,
  aspectRatio: aiAspectRatioSchema,
  colorMood: aiColorMoodSchema.optional(),
  colorPalette: z.array(productColorSchema).max(5).optional(),
  referenceImageUrl: z.string().url().optional(),
  seed: z.number().int().nonnegative().optional(),
});

export const aiGenerationRequestSchema = z.object({
  prompt: aiGenerationPromptSchema,
  variationCount: z.number().int().min(1).max(4).default(4),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  isPriority: z.boolean().default(false),
  enableUpscaling: z.boolean().default(false),
});

// ============================================================================
// Generation Output Schemas
// ============================================================================

export const aiGeneratedImageSchema = z.object({
  id: z.string().min(1),
  generationId: z.string().min(1),
  imageUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  highResUrl: z.string().url().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  variationIndex: z.number().int().min(1).max(4),
  seed: z.number().int().nonnegative(),
  isSelected: z.boolean(),
  hasWatermark: z.boolean(),
});

export const aiGenerationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  prompt: aiGenerationPromptSchema,
  status: aiGenerationStatusSchema,
  modelProvider: aiModelProviderSchema,
  modelVersion: z.string().optional(),
  images: z.array(aiGeneratedImageSchema),
  selectedImageId: z.string().optional(),
  isPurchased: z.boolean(),
  productId: z.string().optional(),
  orderId: z.string().optional(),
  visibility: galleryVisibilitySchema,
  likesCount: z.number().int().nonnegative(),
  viewsCount: z.number().int().nonnegative(),
  processingTimeMs: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date(),
});

export const aiGenerationListItemSchema = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  stylePreset: aiStylePresetSchema,
  aspectRatio: aiAspectRatioSchema,
  status: aiGenerationStatusSchema,
  thumbnailUrl: z.string().url().optional(),
  isPurchased: z.boolean(),
  visibility: galleryVisibilitySchema,
  likesCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
});

// ============================================================================
// Gallery Schemas
// ============================================================================

export const galleryItemCreatorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().url().optional(),
});

export const galleryItemSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  creator: galleryItemCreatorSchema,
  promptPreview: z.string(),
  stylePreset: aiStylePresetSchema,
  aspectRatio: aiAspectRatioSchema,
  thumbnailUrl: z.string().url(),
  imageUrl: z.string().url(),
  likesCount: z.number().int().nonnegative(),
  viewsCount: z.number().int().nonnegative(),
  isPurchased: z.boolean(),
  productId: z.string().optional(),
  isLikedByCurrentUser: z.boolean().optional(),
  createdAt: z.coerce.date(),
});

export const galleryFiltersSchema = z.object({
  stylePresets: z.array(aiStylePresetSchema).optional(),
  aspectRatios: z.array(aiAspectRatioSchema).optional(),
  colorMoods: z.array(aiColorMoodSchema).optional(),
  onlyPurchased: z.boolean().optional(),
  creatorUserId: z.string().optional(),
  searchQuery: z.string().optional(),
  sortBy: z.enum(['recent', 'popular', 'most-liked']).optional(),
});

export const paginatedGallerySchema = z.object({
  items: z.array(galleryItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

// ============================================================================
// Usage & Subscription Schemas
// ============================================================================

export const aiUsageTierLimitsSchema = z.object({
  tier: aiSubscriptionTierSchema,
  generationsLimit: z.number().int().nonnegative(),
  limitPeriod: z.enum(['session', 'day', 'month']),
  maxVariations: z.number().int().positive(),
  hasWatermarkPreview: z.boolean(),
  hasPriorityQueue: z.boolean(),
  hasUpscaling: z.boolean(),
  availableStyles: z.array(aiStylePresetSchema).optional(),
  hasHistorySave: z.boolean(),
});

export const aiUsageStatusSchema = z.object({
  tier: aiSubscriptionTierSchema,
  generationsUsed: z.number().int().nonnegative(),
  generationsRemaining: z.number().int().nonnegative(),
  limits: aiUsageTierLimitsSchema,
  periodResetsAt: z.coerce.date().optional(),
  subscriptionExpiresAt: z.coerce.date().optional(),
});

export const aiSubscriptionPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: aiSubscriptionTierSchema,
  monthlyPrice: z.number().int().nonnegative(),
  annualPrice: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  features: z.array(z.string()),
  limits: aiUsageTierLimitsSchema,
  isPopular: z.boolean(),
  isAvailable: z.boolean(),
});

// ============================================================================
// Job Queue Schemas
// ============================================================================

export const aiGenerationJobSchema = z.object({
  id: z.string().min(1),
  generationId: z.string().min(1),
  userId: z.string().optional(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  priority: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
  queuePosition: z.number().int().positive().optional(),
  estimatedWaitSeconds: z.number().int().nonnegative().optional(),
  queuedAt: z.coerce.date(),
  processingStartedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
});

// ============================================================================
// Configuration Schemas
// ============================================================================

export const aiStylePresetConfigSchema = z.object({
  id: aiStylePresetSchema,
  name: z.string().min(1),
  description: z.string(),
  previewImageUrl: z.string().url(),
  modelParams: z.object({
    basePrompt: z.string(),
    negativePrompt: z.string(),
    cfgScale: z.number().positive(),
    steps: z.number().int().positive(),
    sampler: z.string(),
  }),
  isAvailable: z.boolean(),
  availableForTiers: z.array(aiSubscriptionTierSchema),
});

export const aiAspectRatioConfigSchema = z.object({
  id: aiAspectRatioSchema,
  name: z.string().min(1),
  widthRatio: z.number().positive(),
  heightRatio: z.number().positive(),
  outputWidth: z.number().int().positive(),
  outputHeight: z.number().int().positive(),
  suitableFor: z.array(posterOrientationSchema),
});

// ============================================================================
// Moderation Schemas
// ============================================================================

export const aiContentModerationSchema = z.object({
  generationId: z.string().min(1),
  isPassed: z.boolean(),
  flags: z.array(z.string()),
  riskScore: z.number().min(0).max(1),
  needsManualReview: z.boolean(),
  moderatedAt: z.coerce.date(),
  reviewedBy: z.string().optional(),
  reviewerNotes: z.string().max(1000).optional(),
});

export const aiBannedPromptPatternSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  reason: z.string(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
});

// ============================================================================
// Input Schemas (for API requests)
// ============================================================================

/**
 * Schema for creating a new AI generation
 */
export const createAIGenerationInputSchema = z.object({
  prompt: z.string().min(3).max(1000),
  negativePrompt: z.string().max(500).optional(),
  stylePreset: aiStylePresetSchema,
  aspectRatio: aiAspectRatioSchema,
  colorMood: aiColorMoodSchema.optional(),
  colorPalette: z.array(productColorSchema).max(5).optional(),
  referenceImageUrl: z.string().url().optional(),
  variationCount: z.number().int().min(1).max(4).default(4),
});

/**
 * Schema for selecting a generated image
 */
export const selectGeneratedImageInputSchema = z.object({
  generationId: z.string().min(1),
  imageId: z.string().min(1),
});

/**
 * Schema for regenerating variations
 */
export const regenerateVariationsInputSchema = z.object({
  generationId: z.string().min(1),
  modifiedPrompt: z.string().min(3).max(1000).optional(),
  keepSeed: z.boolean().default(false),
});

/**
 * Schema for updating gallery visibility
 */
export const updateGalleryVisibilityInputSchema = z.object({
  generationId: z.string().min(1),
  visibility: galleryVisibilitySchema,
});

/**
 * Schema for liking a gallery item
 */
export const likeGalleryItemInputSchema = z.object({
  generationId: z.string().min(1),
});

/**
 * Schema for creating a product from AI generation
 */
export const createProductFromAIInputSchema = z.object({
  generationId: z.string().min(1),
  imageId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

/**
 * Schema for purchasing an AI subscription
 */
export const purchaseAISubscriptionInputSchema = z.object({
  planId: z.string().min(1),
  billingPeriod: z.enum(['monthly', 'annual']),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type AIStylePresetSchema = z.infer<typeof aiStylePresetSchema>;
export type AIAspectRatioSchema = z.infer<typeof aiAspectRatioSchema>;
export type AIColorMoodSchema = z.infer<typeof aiColorMoodSchema>;
export type AIGenerationStatusSchema = z.infer<typeof aiGenerationStatusSchema>;
export type AISubscriptionTierSchema = z.infer<typeof aiSubscriptionTierSchema>;
export type AIModelProviderSchema = z.infer<typeof aiModelProviderSchema>;
export type GalleryVisibilitySchema = z.infer<typeof galleryVisibilitySchema>;
export type AIGenerationPromptSchema = z.infer<typeof aiGenerationPromptSchema>;
export type AIGenerationRequestSchema = z.infer<typeof aiGenerationRequestSchema>;
export type AIGeneratedImageSchema = z.infer<typeof aiGeneratedImageSchema>;
export type AIGenerationSchema = z.infer<typeof aiGenerationSchema>;
export type AIGenerationListItemSchema = z.infer<typeof aiGenerationListItemSchema>;
export type GalleryItemSchema = z.infer<typeof galleryItemSchema>;
export type GalleryFiltersSchema = z.infer<typeof galleryFiltersSchema>;
export type PaginatedGallerySchema = z.infer<typeof paginatedGallerySchema>;
export type AIUsageTierLimitsSchema = z.infer<typeof aiUsageTierLimitsSchema>;
export type AIUsageStatusSchema = z.infer<typeof aiUsageStatusSchema>;
export type AISubscriptionPlanSchema = z.infer<typeof aiSubscriptionPlanSchema>;
export type AIGenerationJobSchema = z.infer<typeof aiGenerationJobSchema>;
export type AIStylePresetConfigSchema = z.infer<typeof aiStylePresetConfigSchema>;
export type AIAspectRatioConfigSchema = z.infer<typeof aiAspectRatioConfigSchema>;
export type AIContentModerationSchema = z.infer<typeof aiContentModerationSchema>;
export type AIBannedPromptPatternSchema = z.infer<typeof aiBannedPromptPatternSchema>;
export type CreateAIGenerationInputSchema = z.infer<typeof createAIGenerationInputSchema>;
export type SelectGeneratedImageInputSchema = z.infer<typeof selectGeneratedImageInputSchema>;
export type RegenerateVariationsInputSchema = z.infer<typeof regenerateVariationsInputSchema>;
export type UpdateGalleryVisibilityInputSchema = z.infer<typeof updateGalleryVisibilityInputSchema>;
export type LikeGalleryItemInputSchema = z.infer<typeof likeGalleryItemInputSchema>;
export type CreateProductFromAIInputSchema = z.infer<typeof createProductFromAIInputSchema>;
export type PurchaseAISubscriptionInputSchema = z.infer<typeof purchaseAISubscriptionInputSchema>;
