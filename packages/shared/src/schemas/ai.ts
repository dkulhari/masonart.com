/**
 * AI Generation Schemas for MasonArt Platform
 *
 * Zod schemas for validating AI poster generation data including:
 * - AI generation requests
 * - AI generation records
 * - Style presets
 * - Generation parameters
 */

import { z } from 'zod';

/**
 * AI generation status enum
 */
export const AIGenerationStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export type AIGenerationStatus = z.infer<typeof AIGenerationStatusSchema>;

/**
 * AI model enum
 */
export const AIModelSchema = z.enum([
  'sdxl',
  'sd-2-1',
  'dalle-3',
  'midjourney',
  'stable-diffusion-xl-lightning',
]);
export type AIModel = z.infer<typeof AIModelSchema>;

/**
 * Aspect ratio enum
 */
export const AspectRatioSchema = z.enum([
  '1:1', // Square
  '4:5', // Portrait
  '3:4', // Portrait
  '2:3', // Portrait
  '4:3', // Landscape
  '16:9', // Landscape
  '21:9', // Panoramic
]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

/**
 * Style preset enum
 */
export const StylePresetSchema = z.enum([
  'wabi-sabi',
  'abstract-expression',
  'botanical',
  'vintage-poster',
  'minimalist',
  'geometric',
  'watercolor',
  'line-art',
  'pop-art',
  'surrealism',
]);
export type StylePreset = z.infer<typeof StylePresetSchema>;

/**
 * Moderation status enum
 */
export const ModerationStatusSchema = z.enum(['pending', 'approved', 'rejected', 'flagged']);
export type ModerationStatus = z.infer<typeof ModerationStatusSchema>;

/**
 * AI Generation Parameters Schema
 */
export const AIGenerationParametersSchema = z.object({
  cfgScale: z
    .number()
    .min(1, 'CFG scale must be at least 1')
    .max(20, 'CFG scale must be at most 20')
    .optional(),
  steps: z
    .number()
    .int()
    .min(1, 'Steps must be at least 1')
    .max(150, 'Steps must be at most 150')
    .optional(),
  sampler: z.string().max(50).optional(),
  seed: z.number().int().nonnegative().optional(),
  negativePrompt: z.string().max(1000).optional(),
});
export type AIGenerationParameters = z.infer<typeof AIGenerationParametersSchema>;

/**
 * AI Generation Image Schema
 */
export const AIGenerationImageSchema = z.object({
  url: z.string().url('Image URL must be a valid URL'),
  width: z.number().int().positive('Image width must be a positive integer'),
  height: z.number().int().positive('Image height must be a positive integer'),
  isSelected: z.boolean(),
  thumbnailUrl: z.string().url('Thumbnail URL must be a valid URL').optional(),
});
export type AIGenerationImage = z.infer<typeof AIGenerationImageSchema>;

/**
 * AI Generation Schema
 */
export const AIGenerationSchema = z.object({
  id: z.string().min(1, 'Generation ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  prompt: z
    .string()
    .min(3, 'Prompt must be at least 3 characters')
    .max(1000, 'Prompt must be 1000 characters or less'),
  enhancedPrompt: z.string().max(2000).optional(),
  stylePreset: StylePresetSchema,
  aspectRatio: AspectRatioSchema,
  model: AIModelSchema,
  parameters: AIGenerationParametersSchema.optional(),
  status: AIGenerationStatusSchema,
  images: z
    .array(AIGenerationImageSchema)
    .max(10, 'Maximum 10 images per generation'),
  selectedImageId: z.string().optional(),
  moderationStatus: ModerationStatusSchema,
  moderationNotes: z.string().max(1000).optional(),
  moderatedBy: z.string().optional(),
  moderatedAt: z.date().optional(),
  errorMessage: z.string().max(500).optional(),
  processingTimeMs: z.number().int().nonnegative().optional(),
  creditsUsed: z.number().int().nonnegative().optional(),
  isPublic: z.boolean(),
  likes: z.number().int().nonnegative(),
  views: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
});
export type AIGeneration = z.infer<typeof AIGenerationSchema>;

/**
 * AI Generation Create Schema (request from user)
 */
export const AIGenerationCreateSchema = z.object({
  prompt: z
    .string()
    .min(3, 'Prompt must be at least 3 characters')
    .max(1000, 'Prompt must be 1000 characters or less'),
  stylePreset: StylePresetSchema,
  aspectRatio: AspectRatioSchema,
  model: AIModelSchema.optional().default('sdxl'),
  parameters: AIGenerationParametersSchema.optional(),
  isPublic: z.boolean().optional().default(false),
});
export type AIGenerationCreate = z.infer<typeof AIGenerationCreateSchema>;

/**
 * AI Generation Update Schema
 */
export const AIGenerationUpdateSchema = AIGenerationSchema.partial().required({ id: true });
export type AIGenerationUpdate = z.infer<typeof AIGenerationUpdateSchema>;

/**
 * Style Preset Detail Schema
 */
export const StylePresetDetailSchema = z.object({
  id: StylePresetSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  promptModifiers: z.string().max(1000),
  negativePrompt: z.string().max(1000),
  thumbnailUrl: z.string().url().optional(),
  exampleImages: z.array(z.string().url()).max(5).optional(),
  cfgScale: z.number().min(1).max(20),
  sampler: z.string().max(50),
  isActive: z.boolean(),
});
export type StylePresetDetail = z.infer<typeof StylePresetDetailSchema>;

/**
 * AI Generation Filter Schema (for API queries)
 */
export const AIGenerationFilterSchema = z.object({
  userId: z.string().optional(),
  status: AIGenerationStatusSchema.optional(),
  stylePreset: StylePresetSchema.optional(),
  model: AIModelSchema.optional(),
  moderationStatus: ModerationStatusSchema.optional(),
  isPublic: z.boolean().optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  search: z.string().optional(), // Search by prompt
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type AIGenerationFilter = z.infer<typeof AIGenerationFilterSchema>;

/**
 * AI Generation Stats Schema
 */
export const AIGenerationStatsSchema = z.object({
  totalGenerations: z.number().int().nonnegative(),
  successfulGenerations: z.number().int().nonnegative(),
  failedGenerations: z.number().int().nonnegative(),
  totalCreditsUsed: z.number().int().nonnegative(),
  averageProcessingTimeMs: z.number().nonnegative(),
  mostUsedStyle: StylePresetSchema.optional(),
  mostUsedAspectRatio: AspectRatioSchema.optional(),
});
export type AIGenerationStats = z.infer<typeof AIGenerationStatsSchema>;

/**
 * AI Image Selection Schema
 */
export const AIImageSelectionSchema = z.object({
  generationId: z.string().min(1, 'Generation ID is required'),
  imageUrl: z.string().url('Image URL must be a valid URL'),
});
export type AIImageSelection = z.infer<typeof AIImageSelectionSchema>;

/**
 * AI Generation Regenerate Schema
 */
export const AIGenerationRegenerateSchema = z.object({
  generationId: z.string().min(1, 'Generation ID is required'),
  modifiedPrompt: z
    .string()
    .min(3, 'Prompt must be at least 3 characters')
    .max(1000, 'Prompt must be 1000 characters or less')
    .optional(),
  stylePreset: StylePresetSchema.optional(),
  aspectRatio: AspectRatioSchema.optional(),
  parameters: AIGenerationParametersSchema.optional(),
});
export type AIGenerationRegenerate = z.infer<typeof AIGenerationRegenerateSchema>;
