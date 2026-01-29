/**
 * AI Types for MasonArt Platform
 *
 * Defines all AI generation-related types including prompts, style presets,
 * generation history, and community gallery based on the requirements specification.
 */

import type { PosterOrientation, ProductColor } from './product';

// ============================================================================
// Enums & Literal Types
// ============================================================================

/**
 * AI style presets matching catalog styles - 15 total
 */
export type AIStylePreset =
  // Original 10 presets
  | 'wabi-sabi'
  | 'abstract-expression'
  | 'botanical'
  | 'geometric-modern'
  | 'vintage-poster'
  | 'pop-art'
  | 'watercolor'
  | 'photography'
  | 'line-art'
  | 'typography'
  // 5 new presets added in full-ai-generator feature
  | 'ink-wash'
  | 'digital-art'
  | 'minimalist-modern'
  | 'impressionist'
  | 'art-deco';

/**
 * Aspect ratio options for AI generation
 */
export type AIAspectRatio =
  | 'square'
  | 'portrait'
  | 'landscape'
  | 'panoramic';

/**
 * Color mood options for AI generation
 */
export type AIColorMood =
  | 'warm'
  | 'cool'
  | 'neutral'
  | 'vibrant'
  | 'muted'
  | 'monochrome'
  | 'earth-tones'
  | 'pastel';

/**
 * AI generation status
 */
export type AIGenerationStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * User subscription tier for AI generation
 */
export type AISubscriptionTier =
  | 'guest'
  | 'free'
  | 'premium'
  | 'unlimited';

/**
 * AI model provider options
 */
export type AIModelProvider =
  | 'stable-diffusion'
  | 'dall-e-3'
  | 'midjourney';

/**
 * Gallery visibility options
 */
export type GalleryVisibility =
  | 'private'
  | 'public'
  | 'unlisted';

// ============================================================================
// Generation Input Types
// ============================================================================

/**
 * AI generation prompt input
 */
export interface AIGenerationPrompt {
  /** Main text prompt */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Style preset selection */
  stylePreset: AIStylePreset;
  /** Aspect ratio selection */
  aspectRatio: AIAspectRatio;
  /** Color mood selection */
  colorMood?: AIColorMood;
  /** Specific colors to include */
  colorPalette?: ProductColor[];
  /** Reference to user's saved custom palette */
  customPaletteId?: string;
  /** Reference image URL (optional) */
  referenceImageUrl?: string;
  /** Reference image weight (0.1-1.0), how closely to follow reference */
  referenceImageWeight?: number;
  /** Seed for reproducibility (optional) */
  seed?: number;
}

/**
 * AI generation request
 */
export interface AIGenerationRequest {
  /** Generation prompt details */
  prompt: AIGenerationPrompt;
  /** Number of variations to generate */
  variationCount: number;
  /** User ID making the request */
  userId?: string;
  /** Session ID (for guest users) */
  sessionId?: string;
  /** Priority queue (for premium users) */
  isPriority: boolean;
  /** Enable upscaling */
  enableUpscaling: boolean;
}

// ============================================================================
// Generation Output Types
// ============================================================================

/**
 * Upscale status for images
 */
export type AIUpscaleStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Upscale multiplier options
 */
export type AIUpscaleMultiplier = 2 | 4;

/**
 * Generated image output
 */
export interface AIGeneratedImage {
  /** Unique image ID */
  id: string;
  /** Generation ID this belongs to */
  generationId: string;
  /** Image URL (watermarked for non-purchased) */
  imageUrl: string;
  /** Thumbnail URL */
  thumbnailUrl: string;
  /** High-res URL (only for purchased) */
  highResUrl?: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Variation index (1-4) */
  variationIndex: number;
  /** Seed used for this image */
  seed: number;
  /** Whether this was selected by user */
  isSelected: boolean;
  /** Whether watermark is present */
  hasWatermark: boolean;
  /** URL of upscaled image (if upscaled) */
  upscaledImageUrl?: string;
  /** Upscale multiplier used (2x or 4x) */
  upscaleMultiplier?: AIUpscaleMultiplier;
  /** Status of upscaling operation */
  upscaleStatus?: AIUpscaleStatus;
  /** When the image was upscaled */
  upscaledAt?: Date;
}

/**
 * AI generation result
 */
export interface AIGeneration {
  /** Unique generation ID */
  id: string;
  /** User ID (null for guests) */
  userId?: string;
  /** Session ID (for guests) */
  sessionId?: string;
  /** Original prompt details */
  prompt: AIGenerationPrompt;
  /** Generation status */
  status: AIGenerationStatus;
  /** AI model used */
  modelProvider: AIModelProvider;
  /** Model version */
  modelVersion?: string;
  /** Generated images */
  images: AIGeneratedImage[];
  /** Selected image ID (if user chose one) */
  selectedImageId?: string;
  /** Whether this generation was purchased */
  isPurchased: boolean;
  /** Associated product ID (if converted to product) */
  productId?: string;
  /** Associated order ID (if purchased) */
  orderId?: string;
  /** Gallery visibility setting */
  visibility: GalleryVisibility;
  /** Likes count (for public gallery) */
  likesCount: number;
  /** Views count */
  viewsCount: number;
  /** Processing time in milliseconds */
  processingTimeMs?: number;
  /** Error message (if failed) */
  errorMessage?: string;
  /** When the generation was requested */
  createdAt: Date;
  /** When the generation completed */
  completedAt?: Date;
  /** When the generation was last updated */
  updatedAt: Date;
}

/**
 * AI generation for list display
 */
export interface AIGenerationListItem {
  id: string;
  prompt: string;
  stylePreset: AIStylePreset;
  aspectRatio: AIAspectRatio;
  status: AIGenerationStatus;
  thumbnailUrl?: string;
  isPurchased: boolean;
  visibility: GalleryVisibility;
  likesCount: number;
  createdAt: Date;
}

// ============================================================================
// Gallery Types
// ============================================================================

/**
 * Public gallery item
 */
export interface GalleryItem {
  /** Generation ID */
  id: string;
  /** Creator user ID */
  userId: string;
  /** Creator public profile */
  creator: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  /** Prompt (may be truncated for display) */
  promptPreview: string;
  /** Style preset used */
  stylePreset: AIStylePreset;
  /** Aspect ratio */
  aspectRatio: AIAspectRatio;
  /** Selected image thumbnail URL */
  thumbnailUrl: string;
  /** Selected image full URL */
  imageUrl: string;
  /** Likes count */
  likesCount: number;
  /** Views count */
  viewsCount: number;
  /** Whether purchased */
  isPurchased: boolean;
  /** Associated product ID (if available for sale) */
  productId?: string;
  /** Whether current user has liked */
  isLikedByCurrentUser?: boolean;
  /** When created */
  createdAt: Date;
}

/**
 * Gallery filter options
 */
export interface GalleryFilters {
  stylePresets?: AIStylePreset[];
  aspectRatios?: AIAspectRatio[];
  colorMoods?: AIColorMood[];
  onlyPurchased?: boolean;
  creatorUserId?: string;
  searchQuery?: string;
  sortBy?: 'recent' | 'popular' | 'most-liked';
}

/**
 * Paginated gallery response
 */
export interface PaginatedGallery {
  items: GalleryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ============================================================================
// Usage & Subscription Types
// ============================================================================

/**
 * AI usage tier limits
 */
export interface AIUsageTierLimits {
  /** Tier name */
  tier: AISubscriptionTier;
  /** Generations per day (for free) or per month (for premium) */
  generationsLimit: number;
  /** Period for the limit */
  limitPeriod: 'session' | 'day' | 'month';
  /** Max variations per generation */
  maxVariations: number;
  /** Whether watermark is shown on preview */
  hasWatermarkPreview: boolean;
  /** Whether priority queue is available */
  hasPriorityQueue: boolean;
  /** Whether upscaling is available */
  hasUpscaling: boolean;
  /** Available style presets (empty = all) */
  availableStyles?: AIStylePreset[];
  /** Whether generation history is saved */
  hasHistorySave: boolean;
}

/**
 * User's AI usage status
 */
export interface AIUsageStatus {
  /** User's subscription tier */
  tier: AISubscriptionTier;
  /** Generations used in current period */
  generationsUsed: number;
  /** Generations remaining */
  generationsRemaining: number;
  /** Tier limits */
  limits: AIUsageTierLimits;
  /** When the period resets */
  periodResetsAt?: Date;
  /** Subscription expiry (for paid tiers) */
  subscriptionExpiresAt?: Date;
}

/**
 * AI subscription plan
 */
export interface AISubscriptionPlan {
  /** Plan ID */
  id: string;
  /** Plan name */
  name: string;
  /** Plan tier */
  tier: AISubscriptionTier;
  /** Monthly price in smallest currency unit */
  monthlyPrice: number;
  /** Annual price in smallest currency unit */
  annualPrice: number;
  /** Currency code */
  currency: string;
  /** Features included */
  features: string[];
  /** Tier limits */
  limits: AIUsageTierLimits;
  /** Whether this is the most popular */
  isPopular: boolean;
  /** Whether currently available for purchase */
  isAvailable: boolean;
}

// ============================================================================
// Job Queue Types
// ============================================================================

/**
 * AI generation job in queue
 */
export interface AIGenerationJob {
  /** Job ID */
  id: string;
  /** Generation ID */
  generationId: string;
  /** User ID */
  userId?: string;
  /** Job status */
  status: 'queued' | 'processing' | 'completed' | 'failed';
  /** Priority (lower = higher priority) */
  priority: number;
  /** Retry count */
  retryCount: number;
  /** Max retries allowed */
  maxRetries: number;
  /** Queue position (1-based) */
  queuePosition?: number;
  /** Estimated wait time in seconds */
  estimatedWaitSeconds?: number;
  /** When the job was queued */
  queuedAt: Date;
  /** When processing started */
  processingStartedAt?: Date;
  /** When the job completed */
  completedAt?: Date;
}

// ============================================================================
// AI Service Configuration Types
// ============================================================================

/**
 * Style preset configuration
 */
export interface AIStylePresetConfig {
  /** Preset identifier */
  id: AIStylePreset;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Preview image URL */
  previewImageUrl: string;
  /** AI model parameters */
  modelParams: {
    /** Base prompt additions */
    basePrompt: string;
    /** Negative prompt additions */
    negativePrompt: string;
    /** CFG scale */
    cfgScale: number;
    /** Steps */
    steps: number;
    /** Sampler */
    sampler: string;
  };
  /** Whether this preset is available */
  isAvailable: boolean;
  /** Available for tiers */
  availableForTiers: AISubscriptionTier[];
}

/**
 * Aspect ratio configuration
 */
export interface AIAspectRatioConfig {
  /** Aspect ratio identifier */
  id: AIAspectRatio;
  /** Display name */
  name: string;
  /** Width ratio */
  widthRatio: number;
  /** Height ratio */
  heightRatio: number;
  /** Output width in pixels */
  outputWidth: number;
  /** Output height in pixels */
  outputHeight: number;
  /** Best for poster orientations */
  suitableFor: PosterOrientation[];
}

// ============================================================================
// Moderation Types
// ============================================================================

/**
 * Content moderation result
 */
export interface AIContentModeration {
  /** Generation ID */
  generationId: string;
  /** Whether content passed moderation */
  isPassed: boolean;
  /** Moderation flags */
  flags: string[];
  /** Risk score (0-1) */
  riskScore: number;
  /** Whether manual review is needed */
  needsManualReview: boolean;
  /** When moderation was performed */
  moderatedAt: Date;
  /** Moderator user ID (if manually reviewed) */
  reviewedBy?: string;
  /** Reviewer notes */
  reviewerNotes?: string;
}

/**
 * Banned prompt pattern
 */
export interface AIBannedPromptPattern {
  /** Pattern ID */
  id: string;
  /** Regex pattern */
  pattern: string;
  /** Reason for ban */
  reason: string;
  /** Whether pattern is active */
  isActive: boolean;
  /** When the pattern was created */
  createdAt: Date;
}
