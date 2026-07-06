/**
 * AI Generation Schema Tests
 *
 * Comprehensive tests for AI generation-related Zod schemas including:
 * - AI generation validation
 * - Generation parameters validation
 * - Style preset validation
 * - Image generation validation
 * - Stats validation
 */

import { describe, it, expect } from "vitest";
import {
  AIGenerationSchema,
  AIGenerationCreateSchema,
  AIGenerationUpdateSchema,
  AIGenerationStatusSchema,
  AIModelSchema,
  AspectRatioSchema,
  StylePresetSchema,
  ModerationStatusSchema,
  AIGenerationParametersSchema,
  AIGenerationImageSchema,
  StylePresetDetailSchema,
  AIGenerationFilterSchema,
  AIGenerationStatsSchema,
  AIImageSelectionSchema,
  AIGenerationRegenerateSchema,
} from "../../src/schemas/ai.js";

describe("AI Generation Status Schema", () => {
  it("should accept valid statuses", () => {
    const statuses = ["pending", "processing", "completed", "failed", "cancelled"];
    statuses.forEach((status) => {
      expect(AIGenerationStatusSchema.safeParse(status).success).toBe(true);
    });
  });

  it("should reject invalid statuses", () => {
    expect(AIGenerationStatusSchema.safeParse("running").success).toBe(false);
    expect(AIGenerationStatusSchema.safeParse("success").success).toBe(false);
    expect(AIGenerationStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("AI Model Schema", () => {
  it("should accept valid AI models", () => {
    const models = ["sdxl", "sd-2-1", "dalle-3", "midjourney", "stable-diffusion-xl-lightning"];
    models.forEach((model) => {
      expect(AIModelSchema.safeParse(model).success).toBe(true);
    });
  });

  it("should reject invalid models", () => {
    expect(AIModelSchema.safeParse("gpt-4").success).toBe(false);
    expect(AIModelSchema.safeParse("stable-diffusion").success).toBe(false);
    expect(AIModelSchema.safeParse("").success).toBe(false);
  });
});

describe("Aspect Ratio Schema", () => {
  it("should accept valid aspect ratios", () => {
    const ratios = ["1:1", "4:5", "3:4", "2:3", "4:3", "16:9", "21:9"];
    ratios.forEach((ratio) => {
      expect(AspectRatioSchema.safeParse(ratio).success).toBe(true);
    });
  });

  it("should reject invalid aspect ratios", () => {
    expect(AspectRatioSchema.safeParse("1:2").success).toBe(false);
    expect(AspectRatioSchema.safeParse("16x9").success).toBe(false);
    expect(AspectRatioSchema.safeParse("").success).toBe(false);
  });
});

describe("Style Preset Schema", () => {
  it("should accept valid style presets", () => {
    const presets = [
      "wabi-sabi",
      "abstract-expression",
      "botanical",
      "vintage-poster",
      "minimalist",
      "geometric",
      "watercolor",
      "line-art",
      "pop-art",
      "surrealism",
    ];
    presets.forEach((preset) => {
      expect(StylePresetSchema.safeParse(preset).success).toBe(true);
    });
  });

  it("should reject invalid style presets", () => {
    expect(StylePresetSchema.safeParse("realistic").success).toBe(false);
    expect(StylePresetSchema.safeParse("modern").success).toBe(false);
    expect(StylePresetSchema.safeParse("").success).toBe(false);
  });
});

describe("Moderation Status Schema", () => {
  it("should accept valid moderation statuses", () => {
    const statuses = ["pending", "approved", "rejected", "flagged"];
    statuses.forEach((status) => {
      expect(ModerationStatusSchema.safeParse(status).success).toBe(true);
    });
  });

  it("should reject invalid moderation statuses", () => {
    expect(ModerationStatusSchema.safeParse("reviewed").success).toBe(false);
    expect(ModerationStatusSchema.safeParse("banned").success).toBe(false);
    expect(ModerationStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("AI Generation Parameters Schema", () => {
  const validParameters = {
    cfgScale: 7.5,
    steps: 30,
    sampler: "DPM++ 2M Karras",
    seed: 123456,
    negativePrompt: "blurry, low quality, distorted",
  };

  it("should validate valid parameters", () => {
    const result = AIGenerationParametersSchema.safeParse(validParameters);
    expect(result.success).toBe(true);
  });

  it("should accept empty parameters", () => {
    const result = AIGenerationParametersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  describe("CFG scale validation", () => {
    it("should accept CFG scale between 1 and 20", () => {
      expect(AIGenerationParametersSchema.safeParse({ cfgScale: 1 }).success).toBe(true);
      expect(AIGenerationParametersSchema.safeParse({ cfgScale: 7.5 }).success).toBe(true);
      expect(AIGenerationParametersSchema.safeParse({ cfgScale: 20 }).success).toBe(true);
    });

    it("should reject CFG scale below 1", () => {
      expect(AIGenerationParametersSchema.safeParse({ cfgScale: 0.5 }).success).toBe(false);
    });

    it("should reject CFG scale above 20", () => {
      expect(AIGenerationParametersSchema.safeParse({ cfgScale: 21 }).success).toBe(false);
    });
  });

  describe("Steps validation", () => {
    it("should accept steps between 1 and 150", () => {
      expect(AIGenerationParametersSchema.safeParse({ steps: 1 }).success).toBe(true);
      expect(AIGenerationParametersSchema.safeParse({ steps: 50 }).success).toBe(true);
      expect(AIGenerationParametersSchema.safeParse({ steps: 150 }).success).toBe(true);
    });

    it("should reject steps below 1", () => {
      expect(AIGenerationParametersSchema.safeParse({ steps: 0 }).success).toBe(false);
    });

    it("should reject steps above 150", () => {
      expect(AIGenerationParametersSchema.safeParse({ steps: 151 }).success).toBe(false);
    });

    it("should reject non-integer steps", () => {
      expect(AIGenerationParametersSchema.safeParse({ steps: 30.5 }).success).toBe(false);
    });
  });

  describe("Seed validation", () => {
    it("should accept non-negative integer seeds", () => {
      expect(AIGenerationParametersSchema.safeParse({ seed: 0 }).success).toBe(true);
      expect(AIGenerationParametersSchema.safeParse({ seed: 123456 }).success).toBe(true);
    });

    it("should reject negative seeds", () => {
      expect(AIGenerationParametersSchema.safeParse({ seed: -1 }).success).toBe(false);
    });

    it("should reject non-integer seeds", () => {
      expect(AIGenerationParametersSchema.safeParse({ seed: 123.45 }).success).toBe(false);
    });
  });

  describe("Negative prompt validation", () => {
    it("should accept negative prompts up to 1000 characters", () => {
      expect(
        AIGenerationParametersSchema.safeParse({ negativePrompt: "A".repeat(1000) }).success
      ).toBe(true);
    });

    it("should reject negative prompts over 1000 characters", () => {
      expect(
        AIGenerationParametersSchema.safeParse({ negativePrompt: "A".repeat(1001) }).success
      ).toBe(false);
    });
  });
});

describe("AI Generation Image Schema", () => {
  const validImage = {
    url: "https://cdn.example.com/ai-gen/image1.jpg",
    width: 1024,
    height: 1024,
    isSelected: true,
    thumbnailUrl: "https://cdn.example.com/ai-gen/image1-thumb.jpg",
  };

  it("should validate valid generation image", () => {
    const result = AIGenerationImageSchema.safeParse(validImage);
    expect(result.success).toBe(true);
  });

  it("should validate image without optional thumbnail", () => {
    const { thumbnailUrl, ...image } = validImage;
    const result = AIGenerationImageSchema.safeParse(image);
    expect(result.success).toBe(true);
  });

  describe("Image URL validation", () => {
    it("should accept valid URLs", () => {
      const validUrls = [
        "https://cdn.example.com/image.jpg",
        "http://example.com/image.png",
        "https://example.com/path/to/image.webp",
      ];
      validUrls.forEach((url) => {
        expect(AIGenerationImageSchema.safeParse({ ...validImage, url }).success).toBe(true);
      });
    });

    it("should reject invalid URLs", () => {
      expect(AIGenerationImageSchema.safeParse({ ...validImage, url: "not-a-url" }).success).toBe(
        false
      );
    });
  });

  describe("Dimensions validation", () => {
    it("should accept positive integer dimensions", () => {
      expect(
        AIGenerationImageSchema.safeParse({ ...validImage, width: 512, height: 768 }).success
      ).toBe(true);
      expect(
        AIGenerationImageSchema.safeParse({ ...validImage, width: 2048, height: 2048 }).success
      ).toBe(true);
    });

    it("should reject zero dimensions", () => {
      expect(AIGenerationImageSchema.safeParse({ ...validImage, width: 0 }).success).toBe(false);
      expect(AIGenerationImageSchema.safeParse({ ...validImage, height: 0 }).success).toBe(false);
    });

    it("should reject negative dimensions", () => {
      expect(AIGenerationImageSchema.safeParse({ ...validImage, width: -1024 }).success).toBe(
        false
      );
      expect(AIGenerationImageSchema.safeParse({ ...validImage, height: -1024 }).success).toBe(
        false
      );
    });

    it("should reject non-integer dimensions", () => {
      expect(AIGenerationImageSchema.safeParse({ ...validImage, width: 1024.5 }).success).toBe(
        false
      );
      expect(AIGenerationImageSchema.safeParse({ ...validImage, height: 1024.5 }).success).toBe(
        false
      );
    });
  });
});

describe("AI Generation Schema", () => {
  const validGeneration = {
    id: "gen_1234567890",
    userId: "user_1234567890",
    prompt: "A serene ocean landscape with minimalist aesthetic",
    enhancedPrompt:
      "A serene ocean landscape with minimalist aesthetic, wabi-sabi style, muted earth tones",
    stylePreset: "wabi-sabi" as const,
    aspectRatio: "16:9" as const,
    model: "sdxl" as const,
    parameters: {
      cfgScale: 7,
      steps: 30,
      sampler: "DPM++ 2M Karras",
    },
    status: "completed" as const,
    images: [
      {
        url: "https://cdn.example.com/ai-gen/image1.jpg",
        width: 1024,
        height: 576,
        isSelected: true,
      },
    ],
    selectedImageId: "img_123",
    moderationStatus: "approved" as const,
    isPublic: false,
    likes: 0,
    views: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: new Date(),
  };

  it("should validate a complete valid generation", () => {
    const result = AIGenerationSchema.safeParse(validGeneration);
    expect(result.success).toBe(true);
  });

  it("should validate generation without optional fields", () => {
    const {
      enhancedPrompt,
      parameters,
      selectedImageId,
      errorMessage,
      processingTimeMs,
      creditsUsed,
      moderationNotes,
      moderatedBy,
      moderatedAt,
      completedAt,
      ...generation
    } = validGeneration;
    const result = AIGenerationSchema.safeParse(generation);
    expect(result.success).toBe(true);
  });

  describe("Prompt validation", () => {
    it("should accept prompts between 3 and 1000 characters", () => {
      expect(AIGenerationSchema.safeParse({ ...validGeneration, prompt: "cat" }).success).toBe(
        true
      );
      expect(
        AIGenerationSchema.safeParse({ ...validGeneration, prompt: "A".repeat(1000) }).success
      ).toBe(true);
    });

    it("should reject prompts under 3 characters", () => {
      expect(AIGenerationSchema.safeParse({ ...validGeneration, prompt: "ab" }).success).toBe(
        false
      );
    });

    it("should reject prompts over 1000 characters", () => {
      expect(
        AIGenerationSchema.safeParse({ ...validGeneration, prompt: "A".repeat(1001) }).success
      ).toBe(false);
    });
  });

  describe("Enhanced prompt validation", () => {
    it("should accept enhanced prompts up to 2000 characters", () => {
      expect(
        AIGenerationSchema.safeParse({ ...validGeneration, enhancedPrompt: "A".repeat(2000) })
          .success
      ).toBe(true);
    });

    it("should reject enhanced prompts over 2000 characters", () => {
      expect(
        AIGenerationSchema.safeParse({ ...validGeneration, enhancedPrompt: "A".repeat(2001) })
          .success
      ).toBe(false);
    });
  });

  describe("Images validation", () => {
    it("should accept empty images array", () => {
      expect(AIGenerationSchema.safeParse({ ...validGeneration, images: [] }).success).toBe(true);
    });

    it("should accept up to 10 images", () => {
      const images = Array(10).fill({
        url: "https://cdn.example.com/image.jpg",
        width: 1024,
        height: 1024,
        isSelected: false,
      });
      expect(AIGenerationSchema.safeParse({ ...validGeneration, images }).success).toBe(true);
    });

    it("should reject more than 10 images", () => {
      const images = Array(11).fill({
        url: "https://cdn.example.com/image.jpg",
        width: 1024,
        height: 1024,
        isSelected: false,
      });
      expect(AIGenerationSchema.safeParse({ ...validGeneration, images }).success).toBe(false);
    });
  });

  describe("Error message validation", () => {
    it("should accept error messages up to 500 characters", () => {
      expect(
        AIGenerationSchema.safeParse({ ...validGeneration, errorMessage: "A".repeat(500) }).success
      ).toBe(true);
    });

    it("should reject error messages over 500 characters", () => {
      expect(
        AIGenerationSchema.safeParse({ ...validGeneration, errorMessage: "A".repeat(501) }).success
      ).toBe(false);
    });
  });

  describe("Moderation notes validation", () => {
    it("should accept moderation notes up to 1000 characters", () => {
      expect(
        AIGenerationSchema.safeParse({ ...validGeneration, moderationNotes: "A".repeat(1000) })
          .success
      ).toBe(true);
    });

    it("should reject moderation notes over 1000 characters", () => {
      expect(
        AIGenerationSchema.safeParse({ ...validGeneration, moderationNotes: "A".repeat(1001) })
          .success
      ).toBe(false);
    });
  });

  describe("Stats validation", () => {
    it("should accept non-negative integer values", () => {
      const generation = {
        ...validGeneration,
        processingTimeMs: 5000,
        creditsUsed: 10,
        likes: 42,
        views: 150,
      };
      expect(AIGenerationSchema.safeParse(generation).success).toBe(true);
    });

    it("should reject negative stats", () => {
      expect(AIGenerationSchema.safeParse({ ...validGeneration, likes: -1 }).success).toBe(false);
      expect(AIGenerationSchema.safeParse({ ...validGeneration, views: -1 }).success).toBe(false);
    });
  });
});

describe("AI Generation Create Schema", () => {
  const validCreate = {
    prompt: "A serene ocean landscape",
    stylePreset: "wabi-sabi" as const,
    aspectRatio: "16:9" as const,
    model: "sdxl" as const,
    parameters: {
      cfgScale: 7,
      steps: 30,
    },
    isPublic: true,
  };

  it("should validate valid creation request", () => {
    const result = AIGenerationCreateSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it("should validate with minimal required fields", () => {
    const minimal = {
      prompt: "A serene ocean landscape",
      stylePreset: "wabi-sabi" as const,
      aspectRatio: "16:9" as const,
    };
    const result = AIGenerationCreateSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("should default model to sdxl", () => {
    const minimal = {
      prompt: "A serene ocean landscape",
      stylePreset: "wabi-sabi" as const,
      aspectRatio: "16:9" as const,
    };
    const result = AIGenerationCreateSchema.safeParse(minimal);
    if (result.success) {
      expect(result.data.model).toBe("sdxl");
    }
  });

  it("should default isPublic to false", () => {
    const minimal = {
      prompt: "A serene ocean landscape",
      stylePreset: "wabi-sabi" as const,
      aspectRatio: "16:9" as const,
    };
    const result = AIGenerationCreateSchema.safeParse(minimal);
    if (result.success) {
      expect(result.data.isPublic).toBe(false);
    }
  });
});

describe("Style Preset Detail Schema", () => {
  const validPreset = {
    id: "wabi-sabi" as const,
    name: "Wabi-Sabi",
    description: "Minimalist Japanese aesthetic embracing imperfection",
    promptModifiers: "minimalist, imperfect, natural textures, muted earth tones",
    negativePrompt: "saturated colors, perfect symmetry, glossy",
    thumbnailUrl: "https://cdn.example.com/presets/wabi-sabi.jpg",
    exampleImages: [
      "https://cdn.example.com/examples/wabi-1.jpg",
      "https://cdn.example.com/examples/wabi-2.jpg",
    ],
    cfgScale: 7,
    sampler: "DPM++ 2M Karras",
    isActive: true,
  };

  it("should validate valid style preset detail", () => {
    const result = StylePresetDetailSchema.safeParse(validPreset);
    expect(result.success).toBe(true);
  });

  it("should validate preset without optional fields", () => {
    const { thumbnailUrl, exampleImages, ...preset } = validPreset;
    const result = StylePresetDetailSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  describe("Example images validation", () => {
    it("should accept up to 5 example images", () => {
      const images = Array(5).fill("https://cdn.example.com/example.jpg");
      expect(
        StylePresetDetailSchema.safeParse({ ...validPreset, exampleImages: images }).success
      ).toBe(true);
    });

    it("should reject more than 5 example images", () => {
      const images = Array(6).fill("https://cdn.example.com/example.jpg");
      expect(
        StylePresetDetailSchema.safeParse({ ...validPreset, exampleImages: images }).success
      ).toBe(false);
    });
  });

  describe("Prompt modifiers validation", () => {
    it("should accept prompt modifiers up to 1000 characters", () => {
      expect(
        StylePresetDetailSchema.safeParse({ ...validPreset, promptModifiers: "A".repeat(1000) })
          .success
      ).toBe(true);
    });

    it("should reject prompt modifiers over 1000 characters", () => {
      expect(
        StylePresetDetailSchema.safeParse({ ...validPreset, promptModifiers: "A".repeat(1001) })
          .success
      ).toBe(false);
    });
  });
});

describe("AI Generation Filter Schema", () => {
  it("should accept empty filter", () => {
    const result = AIGenerationFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept partial filters", () => {
    const filters = [
      { userId: "user_123" },
      { status: "completed" },
      { stylePreset: "wabi-sabi" },
      { model: "sdxl" },
      { moderationStatus: "approved" },
      { isPublic: true },
      { dateFrom: new Date() },
      { dateTo: new Date() },
      { search: "ocean" },
      { limit: 20 },
      { offset: 40 },
    ];

    filters.forEach((filter) => {
      const result = AIGenerationFilterSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });
  });

  it("should accept combined filters", () => {
    const filter = {
      userId: "user_123",
      status: "completed" as const,
      stylePreset: "wabi-sabi" as const,
      model: "sdxl" as const,
      moderationStatus: "approved" as const,
      isPublic: true,
      dateFrom: new Date("2024-01-01"),
      dateTo: new Date("2024-12-31"),
      search: "ocean landscape",
      limit: 50,
      offset: 0,
    };

    const result = AIGenerationFilterSchema.safeParse(filter);
    expect(result.success).toBe(true);
  });

  describe("Pagination validation", () => {
    it("should accept valid limit values", () => {
      expect(AIGenerationFilterSchema.safeParse({ limit: 1 }).success).toBe(true);
      expect(AIGenerationFilterSchema.safeParse({ limit: 50 }).success).toBe(true);
      expect(AIGenerationFilterSchema.safeParse({ limit: 100 }).success).toBe(true);
    });

    it("should reject limit over 100", () => {
      expect(AIGenerationFilterSchema.safeParse({ limit: 101 }).success).toBe(false);
    });

    it("should reject zero or negative limit", () => {
      expect(AIGenerationFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(AIGenerationFilterSchema.safeParse({ limit: -1 }).success).toBe(false);
    });

    it("should accept zero offset", () => {
      expect(AIGenerationFilterSchema.safeParse({ offset: 0 }).success).toBe(true);
    });

    it("should reject negative offset", () => {
      expect(AIGenerationFilterSchema.safeParse({ offset: -1 }).success).toBe(false);
    });
  });
});

describe("AI Generation Stats Schema", () => {
  const validStats = {
    totalGenerations: 1000,
    successfulGenerations: 950,
    failedGenerations: 50,
    totalCreditsUsed: 10000,
    averageProcessingTimeMs: 5000,
    mostUsedStyle: "wabi-sabi" as const,
    mostUsedAspectRatio: "16:9" as const,
  };

  it("should validate valid stats", () => {
    const result = AIGenerationStatsSchema.safeParse(validStats);
    expect(result.success).toBe(true);
  });

  it("should validate stats without optional fields", () => {
    const { mostUsedStyle, mostUsedAspectRatio, ...stats } = validStats;
    const result = AIGenerationStatsSchema.safeParse(stats);
    expect(result.success).toBe(true);
  });

  it("should accept zero values", () => {
    const zeroStats = {
      totalGenerations: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      totalCreditsUsed: 0,
      averageProcessingTimeMs: 0,
    };
    expect(AIGenerationStatsSchema.safeParse(zeroStats).success).toBe(true);
  });

  it("should reject negative values", () => {
    expect(AIGenerationStatsSchema.safeParse({ ...validStats, totalGenerations: -1 }).success).toBe(
      false
    );
    expect(
      AIGenerationStatsSchema.safeParse({ ...validStats, averageProcessingTimeMs: -1 }).success
    ).toBe(false);
  });
});

describe("AI Image Selection Schema", () => {
  const validSelection = {
    generationId: "gen_1234567890",
    imageUrl: "https://cdn.example.com/ai-gen/image1.jpg",
  };

  it("should validate valid image selection", () => {
    const result = AIImageSelectionSchema.safeParse(validSelection);
    expect(result.success).toBe(true);
  });

  it("should reject empty generation ID", () => {
    expect(AIImageSelectionSchema.safeParse({ ...validSelection, generationId: "" }).success).toBe(
      false
    );
  });

  it("should reject invalid image URL", () => {
    expect(
      AIImageSelectionSchema.safeParse({ ...validSelection, imageUrl: "not-a-url" }).success
    ).toBe(false);
  });
});

describe("AI Generation Regenerate Schema", () => {
  const validRegenerate = {
    generationId: "gen_1234567890",
    modifiedPrompt: "A serene ocean landscape at sunset",
    stylePreset: "watercolor" as const,
    aspectRatio: "4:3" as const,
    parameters: {
      cfgScale: 8,
      steps: 40,
    },
  };

  it("should validate valid regenerate request", () => {
    const result = AIGenerationRegenerateSchema.safeParse(validRegenerate);
    expect(result.success).toBe(true);
  });

  it("should validate with only generation ID", () => {
    const minimal = {
      generationId: "gen_1234567890",
    };
    const result = AIGenerationRegenerateSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("should reject empty generation ID", () => {
    expect(
      AIGenerationRegenerateSchema.safeParse({ ...validRegenerate, generationId: "" }).success
    ).toBe(false);
  });

  describe("Modified prompt validation", () => {
    it("should accept prompts between 3 and 1000 characters", () => {
      expect(
        AIGenerationRegenerateSchema.safeParse({ ...validRegenerate, modifiedPrompt: "cat" })
          .success
      ).toBe(true);
      expect(
        AIGenerationRegenerateSchema.safeParse({
          ...validRegenerate,
          modifiedPrompt: "A".repeat(1000),
        }).success
      ).toBe(true);
    });

    it("should reject prompts under 3 characters", () => {
      expect(
        AIGenerationRegenerateSchema.safeParse({ ...validRegenerate, modifiedPrompt: "ab" }).success
      ).toBe(false);
    });

    it("should reject prompts over 1000 characters", () => {
      expect(
        AIGenerationRegenerateSchema.safeParse({
          ...validRegenerate,
          modifiedPrompt: "A".repeat(1001),
        }).success
      ).toBe(false);
    });
  });
});
