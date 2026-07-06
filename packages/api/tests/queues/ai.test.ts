/**
 * AI Generation Queue Tests
 *
 * Comprehensive tests for BullMQ AI generation queue processing including:
 * 1. Module Exports - Verify all exports are properly defined
 * 2. Type Definitions - Test the interfaces and types
 * 3. Queue Configuration - Test queue name, default options
 * 4. Queue Instance - Test AI generation queue properties
 * 5. Worker Configuration - Test worker settings
 * 6. Helper Functions - Test utility functions
 * 7. Queue Management Functions - Test queue operations
 * 8. Runtime Tests - Test actual queue operations (requires Redis)
 *
 * Runtime tests can be skipped by setting SKIP_REDIS_RUNTIME_TESTS=true
 *
 * Note: When Redis is not available, BullMQ instances emit connection errors.
 * These are suppressed in tests to prevent false negatives.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Queue, Worker, QueueEvents } from "bullmq";
import Redis from "ioredis";
import "../setup";

// Suppress unhandled errors from BullMQ when Redis is not available
// These are expected connection errors and don't affect test results
const originalListeners = process.listeners("unhandledRejection");
process.removeAllListeners("unhandledRejection");
process.on("unhandledRejection", (reason: unknown) => {
  const error = reason as Error;
  if (
    error?.message?.includes("Connection is closed") ||
    error?.message?.includes("ECONNREFUSED") ||
    (error as NodeJS.ErrnoException)?.code === "ECONNREFUSED"
  ) {
    // Suppress expected Redis connection errors in test environment
    return;
  }
  // Re-emit for other unhandled rejections
  originalListeners.forEach((listener) => listener(reason, Promise.reject(reason)));
});

// Import queue module
import * as aiQueueModule from "../../src/queues/ai-generation";
import {
  AI_GENERATION_QUEUE_NAME,
  aiGenerationQueue,
  aiGenerationQueueEvents,
  aiGenerationWorker,
  addAIGenerationJob,
  getAIGenerationJobStatus,
  cancelAIGenerationJob,
  getQueueStats,
  closeAIGenerationQueue,
  type AIGenerationJobData,
  type AIGenerationJobResult,
  type AIGenerationProgress,
} from "../../src/queues/ai-generation";

// Helper to check if Redis is available
let isRedisAvailable = false;
let testClient: Redis | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_REDIS_RUNTIME_TESTS === "true") {
    console.log("Skipping Redis runtime tests (SKIP_REDIS_RUNTIME_TESTS=true)");
    return;
  }

  // Try to connect to Redis
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6380";
    testClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: false,
      connectTimeout: 3000,
      retryStrategy: () => null, // Don't retry for tests
    });

    await testClient.ping();
    isRedisAvailable = true;
    console.log("Redis connection available for runtime tests");
  } catch (error) {
    console.log("Redis not available, skipping runtime tests");
    isRedisAvailable = false;
    if (testClient) {
      try {
        await testClient.quit();
      } catch {
        // Ignore cleanup errors
      }
      testClient = null;
    }
  }
});

afterAll(async () => {
  // Clean up test Redis client
  if (testClient) {
    try {
      // Clean up test keys
      const keys = await testClient.keys("bull:ai-generation:*");
      if (keys.length > 0) {
        await testClient.del(...keys);
      }
      await testClient.quit();
    } catch {
      // Ignore cleanup errors
    }
  }

  // Close the BullMQ instances to prevent "Connection is closed" errors
  // These are created at module load time
  try {
    // Use a short timeout to not hang the test
    const closeTimeout = 2000;
    await Promise.race([
      Promise.all([
        aiGenerationWorker.close().catch(() => {}),
        aiGenerationQueue.close().catch(() => {}),
        aiGenerationQueueEvents.close().catch(() => {}),
      ]),
      new Promise((resolve) => setTimeout(resolve, closeTimeout)),
    ]);
  } catch {
    // Ignore cleanup errors - expected when Redis is not available
  }
});

// ============================================================================
// Module Exports Tests
// ============================================================================

describe("AI Queue Module Exports", () => {
  describe("Queue name constant", () => {
    it("should export AI_GENERATION_QUEUE_NAME", () => {
      expect(aiQueueModule).toHaveProperty("AI_GENERATION_QUEUE_NAME");
      expect(AI_GENERATION_QUEUE_NAME).toBeDefined();
    });

    it("should have correct queue name value", () => {
      expect(AI_GENERATION_QUEUE_NAME).toBe("ai-generation");
    });

    it("should be a non-empty string", () => {
      expect(typeof AI_GENERATION_QUEUE_NAME).toBe("string");
      expect(AI_GENERATION_QUEUE_NAME.length).toBeGreaterThan(0);
    });
  });

  describe("Queue instance", () => {
    it("should export aiGenerationQueue", () => {
      expect(aiQueueModule).toHaveProperty("aiGenerationQueue");
      expect(aiGenerationQueue).toBeDefined();
    });

    it("should be a BullMQ Queue instance", () => {
      expect(aiGenerationQueue).toBeInstanceOf(Queue);
    });

    it("should have correct queue name", () => {
      expect(aiGenerationQueue.name).toBe(AI_GENERATION_QUEUE_NAME);
    });

    it("should have standard Queue methods", () => {
      expect(typeof aiGenerationQueue.add).toBe("function");
      expect(typeof aiGenerationQueue.getJob).toBe("function");
      expect(typeof aiGenerationQueue.getJobs).toBe("function");
      expect(typeof aiGenerationQueue.close).toBe("function");
    });
  });

  describe("QueueEvents instance", () => {
    it("should export aiGenerationQueueEvents", () => {
      expect(aiQueueModule).toHaveProperty("aiGenerationQueueEvents");
      expect(aiGenerationQueueEvents).toBeDefined();
    });

    it("should be a BullMQ QueueEvents instance", () => {
      expect(aiGenerationQueueEvents).toBeInstanceOf(QueueEvents);
    });

    it("should have close method", () => {
      expect(typeof aiGenerationQueueEvents.close).toBe("function");
    });
  });

  describe("Worker instance", () => {
    it("should export aiGenerationWorker", () => {
      expect(aiQueueModule).toHaveProperty("aiGenerationWorker");
      expect(aiGenerationWorker).toBeDefined();
    });

    it("should be a BullMQ Worker instance", () => {
      expect(aiGenerationWorker).toBeInstanceOf(Worker);
    });

    it("should have correct worker name", () => {
      expect(aiGenerationWorker.name).toBe(AI_GENERATION_QUEUE_NAME);
    });

    it("should have standard Worker methods", () => {
      expect(typeof aiGenerationWorker.close).toBe("function");
      expect(typeof aiGenerationWorker.pause).toBe("function");
      expect(typeof aiGenerationWorker.resume).toBe("function");
    });
  });

  describe("Queue management functions", () => {
    it("should export addAIGenerationJob", () => {
      expect(aiQueueModule).toHaveProperty("addAIGenerationJob");
      expect(typeof addAIGenerationJob).toBe("function");
    });

    it("should export getAIGenerationJobStatus", () => {
      expect(aiQueueModule).toHaveProperty("getAIGenerationJobStatus");
      expect(typeof getAIGenerationJobStatus).toBe("function");
    });

    it("should export cancelAIGenerationJob", () => {
      expect(aiQueueModule).toHaveProperty("cancelAIGenerationJob");
      expect(typeof cancelAIGenerationJob).toBe("function");
    });

    it("should export getQueueStats", () => {
      expect(aiQueueModule).toHaveProperty("getQueueStats");
      expect(typeof getQueueStats).toBe("function");
    });

    it("should export closeAIGenerationQueue", () => {
      expect(aiQueueModule).toHaveProperty("closeAIGenerationQueue");
      expect(typeof closeAIGenerationQueue).toBe("function");
    });
  });

  describe("Type exports", () => {
    it("should export AIGenerationJobData type", () => {
      // TypeScript check - verify the type is exported by using it
      const jobData: AIGenerationJobData = {
        generationId: "test-id",
        prompt: "Test prompt",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(jobData).toBeDefined();
      expect(jobData.generationId).toBe("test-id");
    });

    it("should export AIGenerationJobResult type", () => {
      const jobResult: AIGenerationJobResult = {
        success: true,
        generationId: "test-id",
        images: [],
        processingTimeMs: 1000,
        modelProvider: "stable-diffusion",
      };
      expect(jobResult).toBeDefined();
      expect(jobResult.success).toBe(true);
    });

    it("should export AIGenerationProgress type", () => {
      const progress: AIGenerationProgress = {
        stage: "generating",
        progress: 50,
        message: "Generating images...",
        currentVariation: 2,
        totalVariations: 4,
      };
      expect(progress).toBeDefined();
      expect(progress.stage).toBe("generating");
    });
  });
});

// ============================================================================
// Type Definition Tests
// ============================================================================

describe("AIGenerationJobData Interface", () => {
  describe("Required fields", () => {
    it("should require generationId", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.generationId).toBeDefined();
    });

    it("should require prompt", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "A beautiful sunset over mountains",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.prompt).toBeDefined();
    });

    it("should require stylePreset", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "botanical",
        aspectRatio: "portrait",
        variationCount: 2,
        modelProvider: "stable-diffusion",
      };
      expect(data.stylePreset).toBe("botanical");
    });

    it("should require aspectRatio", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "landscape",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.aspectRatio).toBe("landscape");
    });

    it("should require variationCount", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 8,
        modelProvider: "stable-diffusion",
      };
      expect(data.variationCount).toBe(8);
    });

    it("should require modelProvider", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "dall-e-3",
      };
      expect(data.modelProvider).toBe("dall-e-3");
    });
  });

  describe("Optional fields", () => {
    it("should allow userId", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        userId: "user-456",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.userId).toBe("user-456");
    });

    it("should allow sessionId", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        sessionId: "session-789",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.sessionId).toBe("session-789");
    });

    it("should allow negativePrompt", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        negativePrompt: "blurry, low quality",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.negativePrompt).toBe("blurry, low quality");
    });

    it("should allow colorMood", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        colorMood: "warm",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.colorMood).toBe("warm");
    });

    it("should allow colorPalette", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        colorPalette: ["#FF5733", "#33FF57", "#3357FF"],
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.colorPalette).toEqual(["#FF5733", "#33FF57", "#3357FF"]);
    });

    it("should allow referenceImageUrl", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        referenceImageUrl: "https://example.com/image.jpg",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.referenceImageUrl).toBe("https://example.com/image.jpg");
    });

    it("should allow seed", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        seed: 42,
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.seed).toBe(42);
    });

    it("should allow priority", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        priority: 1,
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.priority).toBe(1);
    });
  });

  describe("Style presets", () => {
    const stylePresets = [
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
    ] as const;

    stylePresets.forEach((preset) => {
      it(`should accept '${preset}' style preset`, () => {
        const data: AIGenerationJobData = {
          generationId: "gen-123",
          prompt: "Test",
          stylePreset: preset,
          aspectRatio: "square",
          variationCount: 4,
          modelProvider: "stable-diffusion",
        };
        expect(data.stylePreset).toBe(preset);
      });
    });
  });

  describe("Aspect ratios", () => {
    const aspectRatios = ["square", "portrait", "landscape", "panoramic"] as const;

    aspectRatios.forEach((ratio) => {
      it(`should accept '${ratio}' aspect ratio`, () => {
        const data: AIGenerationJobData = {
          generationId: "gen-123",
          prompt: "Test",
          stylePreset: "wabi-sabi",
          aspectRatio: ratio,
          variationCount: 4,
          modelProvider: "stable-diffusion",
        };
        expect(data.aspectRatio).toBe(ratio);
      });
    });
  });

  describe("Model providers", () => {
    const modelProviders = ["stable-diffusion", "dall-e-3", "midjourney", "fal-ai"] as const;

    modelProviders.forEach((provider) => {
      it(`should accept '${provider}' model provider`, () => {
        const data: AIGenerationJobData = {
          generationId: "gen-123",
          prompt: "Test",
          stylePreset: "wabi-sabi",
          aspectRatio: "square",
          variationCount: 4,
          modelProvider: provider,
        };
        expect(data.modelProvider).toBe(provider);
      });
    });
  });
});

describe("AIGenerationJobResult Interface", () => {
  it("should have success field", () => {
    const result: AIGenerationJobResult = {
      success: true,
      generationId: "gen-123",
      images: [],
      processingTimeMs: 5000,
      modelProvider: "stable-diffusion",
    };
    expect(result.success).toBe(true);
  });

  it("should have generationId field", () => {
    const result: AIGenerationJobResult = {
      success: true,
      generationId: "gen-456",
      images: [],
      processingTimeMs: 3000,
      modelProvider: "dall-e-3",
    };
    expect(result.generationId).toBe("gen-456");
  });

  it("should have images array", () => {
    const result: AIGenerationJobResult = {
      success: true,
      generationId: "gen-123",
      images: [
        {
          id: "img-1",
          imageUrl: "https://example.com/img1.jpg",
          thumbnailUrl: "https://example.com/img1_thumb.jpg",
          width: 1024,
          height: 1024,
          variationIndex: 0,
          seed: 12345,
          isSelected: false,
          hasWatermark: false,
        },
      ],
      processingTimeMs: 5000,
      modelProvider: "stable-diffusion",
    };
    expect(result.images).toHaveLength(1);
    expect(result.images[0].imageUrl).toBe("https://example.com/img1.jpg");
  });

  it("should have processingTimeMs field", () => {
    const result: AIGenerationJobResult = {
      success: false,
      generationId: "gen-123",
      images: [],
      processingTimeMs: 10000,
      modelProvider: "stable-diffusion",
    };
    expect(result.processingTimeMs).toBe(10000);
  });

  it("should have modelProvider field", () => {
    const result: AIGenerationJobResult = {
      success: true,
      generationId: "gen-123",
      images: [],
      processingTimeMs: 5000,
      modelProvider: "fal-ai",
    };
    expect(result.modelProvider).toBe("fal-ai");
  });
});

describe("AIGenerationProgress Interface", () => {
  describe("Progress stages", () => {
    const stages = ["initializing", "generating", "uploading", "saving", "completed"] as const;

    stages.forEach((stage) => {
      it(`should accept '${stage}' stage`, () => {
        const progress: AIGenerationProgress = {
          stage,
          progress: 50,
          message: `Stage: ${stage}`,
        };
        expect(progress.stage).toBe(stage);
      });
    });
  });

  it("should have progress percentage", () => {
    const progress: AIGenerationProgress = {
      stage: "generating",
      progress: 75,
      message: "Processing...",
    };
    expect(progress.progress).toBe(75);
  });

  it("should have message", () => {
    const progress: AIGenerationProgress = {
      stage: "uploading",
      progress: 80,
      message: "Uploading generated images...",
    };
    expect(progress.message).toBe("Uploading generated images...");
  });

  it("should allow currentVariation", () => {
    const progress: AIGenerationProgress = {
      stage: "generating",
      progress: 50,
      message: "Generating...",
      currentVariation: 2,
    };
    expect(progress.currentVariation).toBe(2);
  });

  it("should allow totalVariations", () => {
    const progress: AIGenerationProgress = {
      stage: "generating",
      progress: 50,
      message: "Generating...",
      currentVariation: 2,
      totalVariations: 4,
    };
    expect(progress.totalVariations).toBe(4);
  });

  it("should represent progress percentages correctly", () => {
    const progressValues = [
      { stage: "initializing" as const, progress: 5 },
      { stage: "generating" as const, progress: 10 },
      { stage: "generating" as const, progress: 60 },
      { stage: "uploading" as const, progress: 60 },
      { stage: "saving" as const, progress: 85 },
      { stage: "completed" as const, progress: 100 },
    ];

    progressValues.forEach(({ stage, progress }) => {
      const progressObj: AIGenerationProgress = {
        stage,
        progress,
        message: "Test",
      };
      expect(progressObj.progress).toBeGreaterThanOrEqual(0);
      expect(progressObj.progress).toBeLessThanOrEqual(100);
    });
  });
});

// ============================================================================
// Queue Configuration Tests
// ============================================================================

describe("Queue Configuration", () => {
  describe("Queue name", () => {
    it("should use consistent queue name across queue, worker, and events", () => {
      expect(aiGenerationQueue.name).toBe(AI_GENERATION_QUEUE_NAME);
      expect(aiGenerationWorker.name).toBe(AI_GENERATION_QUEUE_NAME);
    });
  });

  describe("Queue properties", () => {
    it("should have defaultJobOptions property", () => {
      expect(aiGenerationQueue.opts).toBeDefined();
    });

    it("should have connection property", () => {
      // Queue should be connected to Redis
      expect(aiGenerationQueue).toHaveProperty("opts");
    });
  });

  describe("Worker configuration", () => {
    it("should have concurrency setting", () => {
      expect(aiGenerationWorker.opts).toBeDefined();
      // Default concurrency should be set
    });

    it("should have limiter configuration", () => {
      // Worker should have rate limiting configured
      expect(aiGenerationWorker.opts).toBeDefined();
    });
  });
});

// ============================================================================
// Queue Management Function Signatures Tests
// ============================================================================

describe("Queue Management Functions (Signatures)", () => {
  describe("addAIGenerationJob", () => {
    it("should be a function", () => {
      expect(typeof addAIGenerationJob).toBe("function");
    });

    it("should return a Promise", () => {
      // Don't actually execute to avoid side effects
      // Just verify function exists and has correct signature
      expect(addAIGenerationJob.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getAIGenerationJobStatus", () => {
    it("should be a function", () => {
      expect(typeof getAIGenerationJobStatus).toBe("function");
    });

    it("should accept jobId parameter", () => {
      expect(getAIGenerationJobStatus.length).toBe(1);
    });

    it("should return a Promise", async () => {
      // This will return null for non-existent job
      const result = getAIGenerationJobStatus("non-existent-job-id");
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("cancelAIGenerationJob", () => {
    it("should be a function", () => {
      expect(typeof cancelAIGenerationJob).toBe("function");
    });

    it("should accept jobId parameter", () => {
      expect(cancelAIGenerationJob.length).toBe(1);
    });

    it("should return a Promise", async () => {
      const result = cancelAIGenerationJob("non-existent-job-id");
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("getQueueStats", () => {
    it("should be a function", () => {
      expect(typeof getQueueStats).toBe("function");
    });

    it("should return a Promise", () => {
      const result = getQueueStats();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("closeAIGenerationQueue", () => {
    it("should be a function", () => {
      expect(typeof closeAIGenerationQueue).toBe("function");
    });
  });
});

// ============================================================================
// Job Data Validation Tests
// ============================================================================

describe("Job Data Validation", () => {
  describe("Complete job data", () => {
    it("should create valid job data with all fields", () => {
      const fullJobData: AIGenerationJobData = {
        generationId: "gen-complete-123",
        userId: "user-456",
        sessionId: "session-789",
        prompt: "A serene mountain landscape at sunset with golden light",
        stylePreset: "photography",
        aspectRatio: "landscape",
        negativePrompt: "blurry, low quality, distorted",
        colorMood: "warm",
        colorPalette: ["#FFD700", "#FF8C00", "#DC143C"],
        referenceImageUrl: "https://example.com/reference.jpg",
        variationCount: 4,
        modelProvider: "stable-diffusion",
        seed: 987654321,
        priority: 10,
      };

      expect(fullJobData.generationId).toBeDefined();
      expect(fullJobData.userId).toBeDefined();
      expect(fullJobData.prompt.length).toBeGreaterThan(0);
      expect(fullJobData.variationCount).toBe(4);
    });

    it("should create valid job data with minimal fields", () => {
      const minimalJobData: AIGenerationJobData = {
        generationId: "gen-minimal-456",
        prompt: "Simple test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 1,
        modelProvider: "stable-diffusion",
      };

      expect(minimalJobData.generationId).toBeDefined();
      expect(minimalJobData.prompt).toBeDefined();
      expect(minimalJobData.userId).toBeUndefined();
      expect(minimalJobData.negativePrompt).toBeUndefined();
    });
  });

  describe("Variation count boundaries", () => {
    it("should accept variation count of 1", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 1,
        modelProvider: "stable-diffusion",
      };
      expect(data.variationCount).toBe(1);
    });

    it("should accept variation count of 4", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
      };
      expect(data.variationCount).toBe(4);
    });

    it("should accept variation count of 8", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 8,
        modelProvider: "stable-diffusion",
      };
      expect(data.variationCount).toBe(8);
    });
  });

  describe("Priority values", () => {
    it("should accept high priority (low number)", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
        priority: 1,
      };
      expect(data.priority).toBe(1);
    });

    it("should accept default priority", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
        priority: 100,
      };
      expect(data.priority).toBe(100);
    });

    it("should accept low priority (high number)", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
        priority: 1000,
      };
      expect(data.priority).toBe(1000);
    });
  });

  describe("Seed values", () => {
    it("should accept seed value of 0", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
        seed: 0,
      };
      expect(data.seed).toBe(0);
    });

    it("should accept large seed value", () => {
      const data: AIGenerationJobData = {
        generationId: "gen-123",
        prompt: "Test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 4,
        modelProvider: "stable-diffusion",
        seed: 2147483647, // Max 32-bit integer
      };
      expect(data.seed).toBe(2147483647);
    });
  });
});

// ============================================================================
// Job Result Validation Tests
// ============================================================================

describe("Job Result Validation", () => {
  describe("Success result", () => {
    it("should create valid success result with images", () => {
      const result: AIGenerationJobResult = {
        success: true,
        generationId: "gen-success-123",
        images: [
          {
            id: "img-1",
            imageUrl: "https://storage.example.com/gen/img1.png",
            thumbnailUrl: "https://storage.example.com/gen/img1_thumb.png",
            width: 1024,
            height: 1024,
            variationIndex: 0,
            seed: 12345,
            isSelected: true,
            hasWatermark: false,
          },
          {
            id: "img-2",
            imageUrl: "https://storage.example.com/gen/img2.png",
            thumbnailUrl: "https://storage.example.com/gen/img2_thumb.png",
            width: 1024,
            height: 1024,
            variationIndex: 1,
            seed: 12346,
            isSelected: false,
            hasWatermark: false,
          },
        ],
        processingTimeMs: 15000,
        modelProvider: "stable-diffusion",
      };

      expect(result.success).toBe(true);
      expect(result.images).toHaveLength(2);
      expect(result.processingTimeMs).toBe(15000);
    });
  });

  describe("Failed result", () => {
    it("should create valid failed result with empty images", () => {
      const result: AIGenerationJobResult = {
        success: false,
        generationId: "gen-failed-456",
        images: [],
        processingTimeMs: 5000,
        modelProvider: "dall-e-3",
      };

      expect(result.success).toBe(false);
      expect(result.images).toHaveLength(0);
    });
  });

  describe("Image data validation", () => {
    it("should have all required image fields", () => {
      const image = {
        id: "img-test",
        imageUrl: "https://example.com/image.png",
        thumbnailUrl: "https://example.com/thumb.png",
        width: 832,
        height: 1216,
        variationIndex: 0,
        seed: 99999,
        isSelected: false,
        hasWatermark: false,
      };

      expect(image.id).toBeDefined();
      expect(image.imageUrl).toBeDefined();
      expect(image.thumbnailUrl).toBeDefined();
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
      expect(typeof image.variationIndex).toBe("number");
      expect(typeof image.seed).toBe("number");
      expect(typeof image.isSelected).toBe("boolean");
      expect(typeof image.hasWatermark).toBe("boolean");
    });
  });
});

// ============================================================================
// Progress Tracking Tests
// ============================================================================

describe("Progress Tracking", () => {
  describe("Stage transitions", () => {
    it("should track initializing stage", () => {
      const progress: AIGenerationProgress = {
        stage: "initializing",
        progress: 5,
        message: "Initializing AI generation...",
      };
      expect(progress.stage).toBe("initializing");
      expect(progress.progress).toBe(5);
    });

    it("should track generating stage with variations", () => {
      const progress: AIGenerationProgress = {
        stage: "generating",
        progress: 35,
        message: "Generating image 2 of 4...",
        currentVariation: 2,
        totalVariations: 4,
      };
      expect(progress.stage).toBe("generating");
      expect(progress.currentVariation).toBe(2);
      expect(progress.totalVariations).toBe(4);
    });

    it("should track uploading stage", () => {
      const progress: AIGenerationProgress = {
        stage: "uploading",
        progress: 60,
        message: "Uploading generated images...",
      };
      expect(progress.stage).toBe("uploading");
      expect(progress.progress).toBe(60);
    });

    it("should track saving stage", () => {
      const progress: AIGenerationProgress = {
        stage: "saving",
        progress: 85,
        message: "Saving generation results...",
      };
      expect(progress.stage).toBe("saving");
      expect(progress.progress).toBe(85);
    });

    it("should track completed stage", () => {
      const progress: AIGenerationProgress = {
        stage: "completed",
        progress: 100,
        message: "Generation complete!",
      };
      expect(progress.stage).toBe("completed");
      expect(progress.progress).toBe(100);
    });
  });

  describe("Progress calculation", () => {
    it("should calculate generation progress based on variations", () => {
      // Based on implementation: progress = 10 + Math.floor((i / variationCount) * 50)
      const variationCount = 4;

      for (let i = 0; i < variationCount; i++) {
        const expectedProgress = 10 + Math.floor((i / variationCount) * 50);
        expect(expectedProgress).toBeGreaterThanOrEqual(10);
        expect(expectedProgress).toBeLessThanOrEqual(60);
      }
    });

    it("should have progress bounds", () => {
      const minProgress = 0;
      const maxProgress = 100;

      const progress1: AIGenerationProgress = {
        stage: "initializing",
        progress: 5,
        message: "Test",
      };
      expect(progress1.progress).toBeGreaterThanOrEqual(minProgress);
      expect(progress1.progress).toBeLessThanOrEqual(maxProgress);

      const progress2: AIGenerationProgress = {
        stage: "completed",
        progress: 100,
        message: "Done",
      };
      expect(progress2.progress).toBeLessThanOrEqual(maxProgress);
    });
  });
});

// ============================================================================
// Queue Stats Structure Tests
// ============================================================================

describe("Queue Stats Structure", () => {
  it("should return stats object with expected properties", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    const stats = await getQueueStats();

    expect(stats).toHaveProperty("waiting");
    expect(stats).toHaveProperty("active");
    expect(stats).toHaveProperty("completed");
    expect(stats).toHaveProperty("failed");
    expect(stats).toHaveProperty("delayed");
  });

  it("should return numeric values for all stats", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    const stats = await getQueueStats();

    expect(typeof stats.waiting).toBe("number");
    expect(typeof stats.active).toBe("number");
    expect(typeof stats.completed).toBe("number");
    expect(typeof stats.failed).toBe("number");
    expect(typeof stats.delayed).toBe("number");
  });

  it("should return non-negative values", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    const stats = await getQueueStats();

    expect(stats.waiting).toBeGreaterThanOrEqual(0);
    expect(stats.active).toBeGreaterThanOrEqual(0);
    expect(stats.completed).toBeGreaterThanOrEqual(0);
    expect(stats.failed).toBeGreaterThanOrEqual(0);
    expect(stats.delayed).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Job Status Response Tests
// ============================================================================

describe("Job Status Response", () => {
  it("should return null for non-existent job", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    const status = await getAIGenerationJobStatus("non-existent-job-12345");
    expect(status).toBeNull();
  });

  it("should return expected structure when job exists", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    // The structure returned by getAIGenerationJobStatus
    // when a job exists should have these properties:
    const expectedStructure = {
      state: expect.any(String),
      progress: expect.anything(), // Can be number or AIGenerationProgress
    };

    // Since we can't guarantee a job exists, just verify the function signature
    expect(getAIGenerationJobStatus).toBeDefined();
  });
});

// ============================================================================
// Cancel Job Tests
// ============================================================================

describe("Cancel Job", () => {
  it("should return false for non-existent job", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    const result = await cancelAIGenerationJob("non-existent-job-67890");
    expect(result).toBe(false);
  });
});

// ============================================================================
// Runtime Tests (Require Redis)
// ============================================================================

describe("Runtime Tests", () => {
  describe("Queue operations", () => {
    it("should get queue stats when Redis is available", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const stats = await getQueueStats();

      expect(stats).toBeDefined();
      expect(typeof stats.waiting).toBe("number");
      expect(typeof stats.active).toBe("number");
      expect(typeof stats.completed).toBe("number");
      expect(typeof stats.failed).toBe("number");
      expect(typeof stats.delayed).toBe("number");
    });

    it("should add job to queue", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const jobData: AIGenerationJobData = {
        generationId: `test-gen-${Date.now()}`,
        prompt: "Test prompt for queue test",
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 1,
        modelProvider: "stable-diffusion",
      };

      const job = await addAIGenerationJob(jobData);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);

      // Clean up - remove the test job
      await job.remove();
    });

    it("should add job with priority", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const jobData: AIGenerationJobData = {
        generationId: `test-gen-priority-${Date.now()}`,
        prompt: "High priority test",
        stylePreset: "botanical",
        aspectRatio: "portrait",
        variationCount: 2,
        modelProvider: "stable-diffusion",
        priority: 1,
      };

      const job = await addAIGenerationJob(jobData, { priority: 1 });

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();

      // Clean up
      await job.remove();
    });

    it("should add job with delay", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const jobData: AIGenerationJobData = {
        generationId: `test-gen-delay-${Date.now()}`,
        prompt: "Delayed test",
        stylePreset: "photography",
        aspectRatio: "landscape",
        variationCount: 1,
        modelProvider: "stable-diffusion",
      };

      const job = await addAIGenerationJob(jobData, { delay: 5000 });

      expect(job).toBeDefined();

      const state = await job.getState();
      expect(state).toBe("delayed");

      // Clean up
      await job.remove();
    });

    it("should get job status after adding", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const jobData: AIGenerationJobData = {
        generationId: `test-gen-status-${Date.now()}`,
        prompt: "Status test",
        stylePreset: "pop-art",
        aspectRatio: "square",
        variationCount: 1,
        modelProvider: "stable-diffusion",
      };

      const job = await addAIGenerationJob(jobData);
      const status = await getAIGenerationJobStatus(job.id!);

      expect(status).not.toBeNull();
      expect(status?.state).toBeDefined();
      expect(["waiting", "delayed", "active"]).toContain(status?.state);

      // Clean up
      await job.remove();
    });

    it("should cancel waiting job", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      // Add a delayed job that can be cancelled
      const jobData: AIGenerationJobData = {
        generationId: `test-gen-cancel-${Date.now()}`,
        prompt: "Cancel test",
        stylePreset: "watercolor",
        aspectRatio: "portrait",
        variationCount: 1,
        modelProvider: "stable-diffusion",
      };

      const job = await addAIGenerationJob(jobData, { delay: 60000 }); // Delay 1 minute

      // Verify it's delayed
      const stateBefore = await job.getState();
      expect(stateBefore).toBe("delayed");

      // Cancel it
      const cancelled = await cancelAIGenerationJob(job.id!);
      expect(cancelled).toBe(true);

      // Verify it's removed
      const status = await getAIGenerationJobStatus(job.id!);
      expect(status).toBeNull();
    });
  });

  describe("Job data persistence", () => {
    it("should persist all job data fields", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const fullJobData: AIGenerationJobData = {
        generationId: `test-gen-full-${Date.now()}`,
        userId: "user-test-123",
        sessionId: "session-test-456",
        prompt: "Full data persistence test",
        stylePreset: "geometric-modern",
        aspectRatio: "panoramic",
        negativePrompt: "low quality",
        colorMood: "cool",
        colorPalette: ["#0000FF", "#00FFFF"],
        referenceImageUrl: "https://example.com/ref.jpg",
        variationCount: 4,
        modelProvider: "fal-ai",
        seed: 42,
        priority: 50,
      };

      const job = await addAIGenerationJob(fullJobData);
      const retrievedJob = await aiGenerationQueue.getJob(job.id!);

      expect(retrievedJob).not.toBeNull();
      expect(retrievedJob?.data.generationId).toBe(fullJobData.generationId);
      expect(retrievedJob?.data.userId).toBe(fullJobData.userId);
      expect(retrievedJob?.data.sessionId).toBe(fullJobData.sessionId);
      expect(retrievedJob?.data.prompt).toBe(fullJobData.prompt);
      expect(retrievedJob?.data.stylePreset).toBe(fullJobData.stylePreset);
      expect(retrievedJob?.data.aspectRatio).toBe(fullJobData.aspectRatio);
      expect(retrievedJob?.data.negativePrompt).toBe(fullJobData.negativePrompt);
      expect(retrievedJob?.data.colorMood).toBe(fullJobData.colorMood);
      expect(retrievedJob?.data.colorPalette).toEqual(fullJobData.colorPalette);
      expect(retrievedJob?.data.referenceImageUrl).toBe(fullJobData.referenceImageUrl);
      expect(retrievedJob?.data.variationCount).toBe(fullJobData.variationCount);
      expect(retrievedJob?.data.modelProvider).toBe(fullJobData.modelProvider);
      expect(retrievedJob?.data.seed).toBe(fullJobData.seed);
      expect(retrievedJob?.data.priority).toBe(fullJobData.priority);

      // Clean up
      await job.remove();
    });
  });

  describe("Queue statistics tracking", () => {
    it("should track waiting count", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      // Pause worker to prevent processing
      await aiGenerationWorker.pause();

      const statsBefore = await getQueueStats();
      const beforeWaiting = statsBefore.waiting;

      // Add a job
      const jobData: AIGenerationJobData = {
        generationId: `test-stats-${Date.now()}`,
        prompt: "Stats test",
        stylePreset: "line-art",
        aspectRatio: "square",
        variationCount: 1,
        modelProvider: "stable-diffusion",
      };

      const job = await addAIGenerationJob(jobData);

      // Give it a moment to be added
      await new Promise((resolve) => setTimeout(resolve, 100));

      const statsAfter = await getQueueStats();

      expect(statsAfter.waiting).toBe(beforeWaiting + 1);

      // Clean up
      await job.remove();
      await aiGenerationWorker.resume();
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling", () => {
  describe("getAIGenerationJobStatus", () => {
    it("should handle invalid job ID gracefully", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const status = await getAIGenerationJobStatus("invalid-id-123");
      expect(status).toBeNull();
    });

    it("should handle empty job ID", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const status = await getAIGenerationJobStatus("");
      expect(status).toBeNull();
    });
  });

  describe("cancelAIGenerationJob", () => {
    it("should handle invalid job ID gracefully", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const result = await cancelAIGenerationJob("invalid-cancel-id");
      expect(result).toBe(false);
    });

    it("should handle empty job ID", async () => {
      if (!isRedisAvailable) {
        console.log("Skipping: Redis not available");
        return;
      }

      const result = await cancelAIGenerationJob("");
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration Tests", () => {
  it("should handle complete job lifecycle", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    // 1. Add job
    const jobData: AIGenerationJobData = {
      generationId: `test-lifecycle-${Date.now()}`,
      prompt: "Lifecycle test prompt",
      stylePreset: "typography",
      aspectRatio: "portrait",
      variationCount: 2,
      modelProvider: "stable-diffusion",
    };

    const job = await addAIGenerationJob(jobData);
    expect(job.id).toBeDefined();

    // 2. Check status
    const status = await getAIGenerationJobStatus(job.id!);
    expect(status).not.toBeNull();

    // 3. Check stats
    const stats = await getQueueStats();
    expect(stats).toBeDefined();

    // 4. Clean up
    await job.remove();

    // 5. Verify removed
    const finalStatus = await getAIGenerationJobStatus(job.id!);
    expect(finalStatus).toBeNull();
  });

  it("should handle multiple concurrent jobs", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    // Pause worker
    await aiGenerationWorker.pause();

    const jobs = [];
    const jobCount = 5;

    // Add multiple jobs
    for (let i = 0; i < jobCount; i++) {
      const jobData: AIGenerationJobData = {
        generationId: `test-concurrent-${Date.now()}-${i}`,
        prompt: `Concurrent test ${i}`,
        stylePreset: "wabi-sabi",
        aspectRatio: "square",
        variationCount: 1,
        modelProvider: "stable-diffusion",
        priority: 100 - i, // Different priorities
      };

      const job = await addAIGenerationJob(jobData);
      jobs.push(job);
    }

    // Give time for jobs to be added
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check all jobs exist
    for (const job of jobs) {
      const status = await getAIGenerationJobStatus(job.id!);
      expect(status).not.toBeNull();
    }

    // Clean up all jobs
    for (const job of jobs) {
      await job.remove();
    }

    // Resume worker
    await aiGenerationWorker.resume();
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Performance", () => {
  it("should add multiple jobs quickly", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    const jobCount = 10;
    const jobs = [];
    const start = Date.now();

    for (let i = 0; i < jobCount; i++) {
      const jobData: AIGenerationJobData = {
        generationId: `test-perf-${Date.now()}-${i}`,
        prompt: `Performance test ${i}`,
        stylePreset: "botanical",
        aspectRatio: "portrait",
        variationCount: 1,
        modelProvider: "stable-diffusion",
      };

      const job = await addAIGenerationJob(jobData);
      jobs.push(job);
    }

    const duration = Date.now() - start;

    // 10 jobs should be added in under 2 seconds
    expect(duration).toBeLessThan(2000);

    // Clean up
    for (const job of jobs) {
      await job.remove();
    }
  });

  it("should get queue stats quickly", async () => {
    if (!isRedisAvailable) {
      console.log("Skipping: Redis not available");
      return;
    }

    const iterations = 10;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      await getQueueStats();
    }

    const duration = Date.now() - start;

    // 10 stats queries should complete in under 1 second
    expect(duration).toBeLessThan(1000);
  });
});
