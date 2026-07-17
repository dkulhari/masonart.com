/**
 * AI Generation Queue and Worker
 *
 * BullMQ queue for processing AI image generation jobs asynchronously.
 * Handles the full lifecycle: queue -> process -> upload -> save -> notify.
 *
 * Based on patterns from docs/poster-app-tech-stack.md
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { eq } from "drizzle-orm";
import { redis, createRedisConnection, CacheKeys } from "../lib/redis";
import { uploadAIGeneration } from "../lib/storage";
import { db } from "../database";
import {
  aiGenerations,
  type AIGeneratedImageData,
  type AIStylePreset,
  type AIAspectRatio,
  type AIModelProvider,
} from "../database/schema";
import { refundToWallet } from "../services/wallet";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Job data for AI generation queue
 */
export interface AIGenerationJobData {
  /** Database generation record ID */
  generationId: string;
  /** User ID (optional for guests) */
  userId?: string;
  /** Session ID for guest users */
  sessionId?: string;
  /** User prompt text */
  prompt: string;
  /** Style preset to apply */
  stylePreset: AIStylePreset;
  /** Aspect ratio for the generated image */
  aspectRatio: AIAspectRatio;
  /** Optional negative prompt */
  negativePrompt?: string;
  /** Optional color mood */
  colorMood?: string;
  /** Optional color palette */
  colorPalette?: string[];
  /** Optional reference image URL */
  referenceImageUrl?: string;
  /** Number of variations to generate */
  variationCount: number;
  /** AI model provider to use */
  modelProvider: AIModelProvider;
  /** Optional seed for reproducibility */
  seed?: number;
  /** Job priority (lower = higher priority) */
  priority?: number;
}

/**
 * Job result returned after successful processing
 */
export interface AIGenerationJobResult {
  success: boolean;
  generationId: string;
  images: AIGeneratedImageData[];
  processingTimeMs: number;
  modelProvider: AIModelProvider;
}

/**
 * Job progress data for real-time updates
 */
export interface AIGenerationProgress {
  stage: "initializing" | "generating" | "uploading" | "saving" | "completed";
  progress: number; // 0-100
  message: string;
  currentVariation?: number;
  totalVariations?: number;
}

// ============================================================================
// Queue Configuration
// ============================================================================

/**
 * Queue name constant
 */
export const AI_GENERATION_QUEUE_NAME = "ai-generation";

/**
 * Default job options
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 5000, // Start with 5 seconds, then 10s, 20s
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    count: 1000, // Keep at most 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
  },
};

/**
 * AI Generation Queue
 *
 * Use this to add new generation jobs to the queue.
 */
export const aiGenerationQueue = new Queue<AIGenerationJobData, AIGenerationJobResult>(
  AI_GENERATION_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  }
);

/**
 * Queue Events for monitoring
 */
export const aiGenerationQueueEvents = new QueueEvents(AI_GENERATION_QUEUE_NAME, {
  connection: createRedisConnection(),
});

// ============================================================================
// Worker Implementation
// ============================================================================

/**
 * Process an AI generation job
 *
 * This is the main worker function that:
 * 1. Updates status to processing
 * 2. Calls AI API to generate images
 * 3. Uploads images to S3/R2
 * 4. Saves results to database
 * 5. Notifies user of completion
 */
async function processAIGenerationJob(
  job: Job<AIGenerationJobData, AIGenerationJobResult>
): Promise<AIGenerationJobResult> {
  const startTime = Date.now();
  const { generationId, userId, variationCount, modelProvider } = job.data;

  try {
    // Update status to processing
    await updateGenerationStatus(generationId, "processing", {
      processingStartedAt: new Date(),
    });

    await job.updateProgress({
      stage: "initializing",
      progress: 5,
      message: "Initializing AI generation...",
    } satisfies AIGenerationProgress);

    // Stage 1: Generate images via AI API
    await job.updateProgress({
      stage: "generating",
      progress: 10,
      message: "Generating images with AI...",
      currentVariation: 0,
      totalVariations: variationCount,
    } satisfies AIGenerationProgress);

    const generatedImages = await generateImagesWithAI(job);

    // Stage 2: Upload images to storage
    await job.updateProgress({
      stage: "uploading",
      progress: 60,
      message: "Uploading generated images...",
    } satisfies AIGenerationProgress);

    const uploadedImages = await uploadGeneratedImages(
      generatedImages,
      generationId,
      userId || job.data.sessionId || "anonymous"
    );

    // Stage 3: Save to database
    await job.updateProgress({
      stage: "saving",
      progress: 85,
      message: "Saving generation results...",
    } satisfies AIGenerationProgress);

    const processingTimeMs = Date.now() - startTime;

    await updateGenerationWithResults(generationId, uploadedImages, processingTimeMs);

    // Stage 4: Notify user (cache invalidation for real-time updates)
    await job.updateProgress({
      stage: "completed",
      progress: 100,
      message: "Generation complete!",
    } satisfies AIGenerationProgress);

    if (userId) {
      await notifyUserOfCompletion(userId, generationId);
    }

    return {
      success: true,
      generationId,
      images: uploadedImages,
      processingTimeMs,
      modelProvider,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorCode = error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN";

    await updateGenerationStatus(generationId, "failed", {
      errorMessage,
      errorCode,
      processingTimeMs,
      retryCount: job.attemptsMade,
    });

    // Refund wallet if this was the last retry attempt
    if (userId && job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      try {
        await refundForFailedGeneration(userId, generationId, errorMessage);
      } catch (refundError) {
        // Log refund error but don't throw - the main error is more important
        console.error(
          `Failed to refund for generation ${generationId}:`,
          refundError instanceof Error ? refundError.message : refundError
        );
      }
    }

    throw error;
  }
}

/**
 * Refund wallet for a failed generation
 */
async function refundForFailedGeneration(
  userId: string,
  generationId: string,
  reason: string
): Promise<void> {
  // Find the debit transaction for this generation
  const debitTransaction = await db.query.walletTransactions.findFirst({
    where: (wt, { and, eq }) =>
      and(
        eq(wt.userId, userId),
        eq(wt.aiGenerationId, generationId),
        eq(wt.type, "debit"),
        eq(wt.status, "completed")
      ),
  });

  if (!debitTransaction) {
    // No transaction found - likely used free generation
    return;
  }

  // Check if already refunded
  const existingRefund = await db.query.walletTransactions.findFirst({
    where: (wt, { and, eq }) =>
      and(
        eq(wt.userId, userId),
        eq(wt.aiGenerationId, generationId),
        eq(wt.type, "refund")
      ),
  });

  if (existingRefund) {
    // Already refunded
    return;
  }

  // Process refund
  await refundToWallet(
    userId,
    debitTransaction.amountPaise,
    `Generation failed: ${reason}`,
    debitTransaction.id,
    generationId
  );

  console.info(
    `Refunded ${debitTransaction.amountPaise} paise to user ${userId} for failed generation ${generationId}`
  );
}

// ============================================================================
// AI Generation Logic
// ============================================================================

/**
 * Generate images using the configured AI provider
 *
 * This function handles the actual AI API calls.
 * In production, this would call Replicate, OpenAI, FAL.ai, etc.
 */
async function generateImagesWithAI(
  job: Job<AIGenerationJobData, AIGenerationJobResult>
): Promise<GeneratedImageBuffer[]> {
  const { prompt, stylePreset, aspectRatio, variationCount, modelProvider, seed } = job.data;

  // Get dimensions based on aspect ratio
  const dimensions = getImageDimensions(aspectRatio);

  // Construct enhanced prompt with style modifiers
  const enhancedPrompt = constructEnhancedPrompt(prompt, stylePreset);

  // Generate images based on provider
  const images: GeneratedImageBuffer[] = [];

  for (let i = 0; i < variationCount; i++) {
    await job.updateProgress({
      stage: "generating",
      progress: 10 + Math.floor((i / variationCount) * 50),
      message: `Generating image ${i + 1} of ${variationCount}...`,
      currentVariation: i + 1,
      totalVariations: variationCount,
    } satisfies AIGenerationProgress);

    // Generate unique seed for this variation
    const variationSeed = seed ? seed + i : Math.floor(Math.random() * 2147483647);

    // Call AI provider API
    const imageBuffer = await callAIProvider(modelProvider, {
      prompt: enhancedPrompt,
      width: dimensions.width,
      height: dimensions.height,
      seed: variationSeed,
    });

    images.push({
      buffer: imageBuffer,
      width: dimensions.width,
      height: dimensions.height,
      seed: variationSeed,
      variationIndex: i,
    });
  }

  return images;
}

/**
 * Generated image buffer with metadata
 */
interface GeneratedImageBuffer {
  buffer: Buffer;
  width: number;
  height: number;
  seed: number;
  variationIndex: number;
}

/**
 * Call the AI provider API to generate an image
 *
 * This is a placeholder that should be implemented with actual API calls.
 * Each provider has different SDKs/APIs.
 */
async function callAIProvider(
  provider: AIModelProvider,
  params: {
    prompt: string;
    width: number;
    height: number;
    seed: number;
  }
): Promise<Buffer> {
  switch (provider) {
    case "stable-diffusion":
      return callReplicateAPI(params);
    case "dall-e-3":
      return callOpenAIAPI(params);
    case "fal-ai":
      return callFalAI(params);
    default:
      return callReplicateAPI(params);
  }
}

/**
 * Call Replicate API (Stable Diffusion)
 *
 * Placeholder - implement with Replicate SDK
 * @see https://replicate.com/docs
 */
async function callReplicateAPI(params: {
  prompt: string;
  width: number;
  height: number;
  seed: number;
}): Promise<Buffer> {
  // TODO: Implement with Replicate SDK
  // const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  // const output = await replicate.run("stability-ai/sdxl:...", { input: params });

  // For now, return a placeholder (in production, this would be real AI output)
  return createPlaceholderImage(params.width, params.height, params.seed);
}

/**
 * Call OpenAI DALL-E 3 API
 *
 * Placeholder - implement with OpenAI SDK
 * @see https://platform.openai.com/docs/api-reference/images
 */
async function callOpenAIAPI(params: {
  prompt: string;
  width: number;
  height: number;
  seed: number;
}): Promise<Buffer> {
  // TODO: Implement with OpenAI SDK
  // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // const response = await openai.images.generate({ prompt: params.prompt, ... });

  return createPlaceholderImage(params.width, params.height, params.seed);
}

/**
 * Call FAL.ai API
 *
 * Placeholder - implement with FAL SDK
 * @see https://fal.ai/docs
 */
async function callFalAI(params: {
  prompt: string;
  width: number;
  height: number;
  seed: number;
}): Promise<Buffer> {
  // TODO: Implement with FAL SDK
  // import * as fal from "@fal-ai/serverless-client";
  // const result = await fal.run("fal-ai/flux/schnell", { input: { prompt: params.prompt } });

  return createPlaceholderImage(params.width, params.height, params.seed);
}

/**
 * Create a placeholder image buffer
 *
 * This is a development placeholder. In production, this would be
 * replaced by actual AI-generated images from the provider APIs.
 */
function createPlaceholderImage(width: number, height: number, seed: number): Buffer {
  // Create a simple PNG placeholder
  // In production, this would be the actual generated image
  const placeholderData = JSON.stringify({
    type: "placeholder",
    width,
    height,
    seed,
    generatedAt: new Date().toISOString(),
  });

  return Buffer.from(placeholderData);
}

// ============================================================================
// Image Upload Logic
// ============================================================================

/**
 * Upload generated images to storage
 */
async function uploadGeneratedImages(
  images: GeneratedImageBuffer[],
  generationId: string,
  userId: string
): Promise<AIGeneratedImageData[]> {
  const uploadedImages: AIGeneratedImageData[] = [];

  for (const image of images) {
    const result = await uploadAIGeneration(
      image.buffer,
      userId,
      generationId,
      image.variationIndex
    );

    // Generate thumbnail URL (in production, create actual thumbnail)
    const thumbnailUrl = result.url; // Same as main for now

    uploadedImages.push({
      id: `${generationId}-${image.variationIndex}`,
      imageUrl: result.url,
      thumbnailUrl,
      width: image.width,
      height: image.height,
      variationIndex: image.variationIndex,
      seed: image.seed,
      isSelected: false,
      hasWatermark: false,
    });
  }

  return uploadedImages;
}

// ============================================================================
// Database Update Functions
// ============================================================================

/**
 * Update generation status in database
 */
async function updateGenerationStatus(
  generationId: string,
  status: "queued" | "processing" | "completed" | "failed" | "cancelled",
  additionalFields: Partial<{
    processingStartedAt: Date;
    completedAt: Date;
    errorMessage: string;
    errorCode: string;
    processingTimeMs: number;
    retryCount: number;
  }> = {}
): Promise<void> {
  await db
    .update(aiGenerations)
    .set({
      status,
      ...additionalFields,
      updatedAt: new Date(),
    })
    .where(eq(aiGenerations.id, generationId));
}

/**
 * Update generation with completed results
 */
async function updateGenerationWithResults(
  generationId: string,
  images: AIGeneratedImageData[],
  processingTimeMs: number
): Promise<void> {
  await db
    .update(aiGenerations)
    .set({
      status: "completed",
      images,
      completedAt: new Date(),
      processingTimeMs,
      updatedAt: new Date(),
    })
    .where(eq(aiGenerations.id, generationId));
}

// ============================================================================
// Notification Functions
// ============================================================================

/**
 * Notify user of generation completion
 *
 * This uses Redis pub/sub or cache invalidation to trigger
 * real-time updates on the frontend.
 */
async function notifyUserOfCompletion(userId: string, generationId: string): Promise<void> {
  // Invalidate user's generation cache
  const cacheKey = `${CacheKeys.AI_GENERATION}${userId}:${generationId}`;
  await redis.del(cacheKey);

  // Publish completion event (can be used with WebSocket server)
  await redis.publish(
    "ai-generation:completed",
    JSON.stringify({
      userId,
      generationId,
      timestamp: new Date().toISOString(),
    })
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get image dimensions based on aspect ratio
 */
function getImageDimensions(aspectRatio: AIAspectRatio): { width: number; height: number } {
  // Using standard SDXL dimensions
  const dimensions: Record<AIAspectRatio, { width: number; height: number }> = {
    square: { width: 1024, height: 1024 },
    portrait: { width: 832, height: 1216 },
    landscape: { width: 1216, height: 832 },
    panoramic: { width: 1344, height: 768 },
  };

  return dimensions[aspectRatio] || dimensions.square;
}

/**
 * Construct enhanced prompt with style modifiers
 *
 * This adds style-specific keywords to improve generation quality.
 * Full style presets are defined in src/ai/style-presets.ts
 */
function constructEnhancedPrompt(prompt: string, stylePreset: AIStylePreset): string {
  // Basic style modifiers (full implementation in style-presets.ts)
  const styleModifiers: Record<AIStylePreset, string> = {
    "wabi-sabi":
      "minimalist, imperfect, natural textures, muted earth tones, japanese aesthetic, serene",
    "abstract-expression":
      "abstract expressionism, bold brushstrokes, emotional, dynamic, gestural",
    botanical: "botanical illustration, soft watercolor, delicate details, nature, organic forms",
    "geometric-modern": "geometric shapes, modern design, clean lines, minimalist, contemporary",
    "vintage-poster": "vintage poster art, retro, nostalgic, film grain, warm tones, classic",
    "pop-art": "pop art style, bold colors, high contrast, comic book aesthetic, vibrant",
    watercolor: "watercolor painting, soft edges, flowing colors, artistic, ethereal",
    photography: "professional photography, high quality, detailed, realistic, sharp focus",
    "line-art": "line art, minimalist drawing, black and white, elegant lines, sketch style",
    typography: "typography art, decorative text, letterform design, artistic composition",
    "ink-wash": "ink wash painting, sumi-e style, flowing brushstrokes, monochrome gradients, zen, negative space",
    "digital-art": "digital art, concept art style, vibrant colors, cinematic lighting, detailed illustration",
    "minimalist-modern": "minimalist design, scandinavian aesthetic, clean geometric forms, muted palette, refined",
    impressionist: "impressionist painting, visible brushstrokes, soft natural light, atmospheric, painterly",
    "art-deco": "art deco style, 1920s glamour, geometric patterns, gold accents, symmetrical, elegant",
  };

  const modifier = styleModifiers[stylePreset] || "";
  return modifier ? `${prompt}, ${modifier}` : prompt;
}

// ============================================================================
// Worker Instance
// ============================================================================

/**
 * AI Generation Worker
 *
 * This worker processes jobs from the ai-generation queue.
 * It uses a separate Redis connection as recommended by BullMQ.
 */
export const aiGenerationWorker = new Worker<AIGenerationJobData, AIGenerationJobResult>(
  AI_GENERATION_QUEUE_NAME,
  processAIGenerationJob,
  {
    connection: createRedisConnection(),
    concurrency: 2, // Process up to 2 jobs simultaneously
    limiter: {
      max: 10, // Max 10 jobs per minute
      duration: 60000,
    },
  }
);

// ============================================================================
// Event Handlers
// ============================================================================

// Worker event handlers
aiGenerationWorker.on("completed", (job, result) => {
  if (process.env.NODE_ENV !== "test") {
    // Log completion in non-test environments
    const logMessage = `AI generation job ${job.id} completed in ${result.processingTimeMs}ms`;
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.info(logMessage);
    }
  }
});

aiGenerationWorker.on("failed", (job, error) => {
  if (process.env.NODE_ENV !== "test") {
    const logMessage = `AI generation job ${job?.id} failed: ${error.message}`;
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error(logMessage, error);
    }
  }
});

aiGenerationWorker.on("progress", (job, progress) => {
  if (process.env.NODE_ENV === "development") {
    const progressData = progress as AIGenerationProgress;
    // eslint-disable-next-line no-console
    console.info(
      `AI generation job ${job.id}: ${progressData.stage} (${progressData.progress}%)`
    );
  }
});

// ============================================================================
// Queue Management Functions
// ============================================================================

/**
 * Add a new AI generation job to the queue
 */
export async function addAIGenerationJob(
  data: AIGenerationJobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<Job<AIGenerationJobData, AIGenerationJobResult>> {
  return aiGenerationQueue.add("generate", data, {
    priority: options?.priority ?? data.priority ?? 100,
    delay: options?.delay,
  });
}

/**
 * Get job status by ID
 */
export async function getAIGenerationJobStatus(
  jobId: string
): Promise<{
  state: string;
  progress: AIGenerationProgress | number;
  result?: AIGenerationJobResult;
  failedReason?: string;
} | null> {
  const job = await aiGenerationQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const progress = job.progress as AIGenerationProgress | number;

  return {
    state,
    progress,
    result: job.returnvalue ?? undefined,
    failedReason: job.failedReason ?? undefined,
  };
}

/**
 * Cancel a pending or active job
 */
export async function cancelAIGenerationJob(jobId: string): Promise<boolean> {
  const job = await aiGenerationQueue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state === "waiting" || state === "delayed") {
    await job.remove();
    return true;
  }

  // Cannot cancel active or completed jobs
  return false;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    aiGenerationQueue.getWaitingCount(),
    aiGenerationQueue.getActiveCount(),
    aiGenerationQueue.getCompletedCount(),
    aiGenerationQueue.getFailedCount(),
    aiGenerationQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Gracefully close the worker and queue
 */
export async function closeAIGenerationQueue(): Promise<void> {
  await aiGenerationWorker.close();
  await aiGenerationQueue.close();
  await aiGenerationQueueEvents.close();
}

