/**
 * Test Fixtures for AI Generations
 *
 * Provides reusable test data for AI generation-related tests
 */

export interface AIGenerationImage {
  url: string;
  width: number;
  height: number;
  isSelected: boolean;
  thumbnailUrl?: string;
}

export interface AIGenerationParameters {
  cfgScale?: number;
  steps?: number;
  sampler?: string;
  seed?: number;
  negativePrompt?: string;
}

export type AIModel =
  | "sdxl"
  | "sd-2-1"
  | "dalle-3"
  | "midjourney"
  | "stable-diffusion-xl-lightning";
export type AspectRatio = "1:1" | "4:5" | "3:4" | "2:3" | "4:3" | "16:9" | "21:9";
export type StylePreset =
  | "wabi-sabi"
  | "abstract-expression"
  | "botanical"
  | "vintage-poster"
  | "minimalist"
  | "geometric"
  | "watercolor"
  | "line-art"
  | "pop-art"
  | "surrealism";
export type AIGenerationStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type ModerationStatus = "pending" | "approved" | "rejected" | "flagged";

export interface AIGeneration {
  id: string;
  userId: string;
  prompt: string;
  enhancedPrompt?: string;
  stylePreset: StylePreset;
  aspectRatio: AspectRatio;
  model: AIModel;
  parameters?: AIGenerationParameters;
  status: AIGenerationStatus;
  images: AIGenerationImage[];
  selectedImageId?: string;
  moderationStatus: ModerationStatus;
  moderationNotes?: string;
  moderatedBy?: string;
  moderatedAt?: Date;
  errorMessage?: string;
  processingTimeMs?: number;
  creditsUsed?: number;
  isPublic: boolean;
  likes: number;
  views: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * Create a test AI generation with optional overrides
 */
export function createAIGeneration(overrides?: Partial<AIGeneration>): AIGeneration {
  const now = new Date();

  return {
    id: "ai_gen_1234567890",
    userId: "user_1234567890",
    prompt:
      "A serene Japanese garden with cherry blossoms, koi pond, and traditional stone lanterns",
    enhancedPrompt:
      "A serene Japanese garden with cherry blossoms in full bloom, koi pond with crystal clear water, traditional stone lanterns, morning mist, soft natural lighting, highly detailed, 8k resolution, peaceful atmosphere",
    stylePreset: "wabi-sabi",
    aspectRatio: "4:3",
    model: "sdxl",
    parameters: {
      cfgScale: 7.5,
      steps: 30,
      sampler: "DPM++ 2M Karras",
      seed: 12345678,
      negativePrompt: "blurry, low quality, distorted, ugly, watermark",
    },
    status: "completed",
    images: [
      {
        url: "https://cdn.example.com/ai/ai_gen_1234567890_0.jpg",
        width: 1024,
        height: 768,
        isSelected: true,
        thumbnailUrl: "https://cdn.example.com/ai/ai_gen_1234567890_0_thumb.jpg",
      },
      {
        url: "https://cdn.example.com/ai/ai_gen_1234567890_1.jpg",
        width: 1024,
        height: 768,
        isSelected: false,
        thumbnailUrl: "https://cdn.example.com/ai/ai_gen_1234567890_1_thumb.jpg",
      },
      {
        url: "https://cdn.example.com/ai/ai_gen_1234567890_2.jpg",
        width: 1024,
        height: 768,
        isSelected: false,
        thumbnailUrl: "https://cdn.example.com/ai/ai_gen_1234567890_2_thumb.jpg",
      },
      {
        url: "https://cdn.example.com/ai/ai_gen_1234567890_3.jpg",
        width: 1024,
        height: 768,
        isSelected: false,
        thumbnailUrl: "https://cdn.example.com/ai/ai_gen_1234567890_3_thumb.jpg",
      },
    ],
    selectedImageId: "ai_gen_1234567890_0",
    moderationStatus: "approved",
    moderationNotes: undefined,
    moderatedBy: undefined,
    moderatedAt: undefined,
    errorMessage: undefined,
    processingTimeMs: 12500,
    creditsUsed: 1,
    isPublic: true,
    likes: 42,
    views: 156,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    ...overrides,
  };
}

/**
 * Create a pending AI generation
 */
export function createPendingAIGeneration(overrides?: Partial<AIGeneration>): AIGeneration {
  return createAIGeneration({
    status: "pending",
    images: [],
    selectedImageId: undefined,
    moderationStatus: "pending",
    processingTimeMs: undefined,
    completedAt: undefined,
    ...overrides,
  });
}

/**
 * Create a processing AI generation
 */
export function createProcessingAIGeneration(overrides?: Partial<AIGeneration>): AIGeneration {
  return createAIGeneration({
    status: "processing",
    images: [],
    selectedImageId: undefined,
    moderationStatus: "pending",
    processingTimeMs: undefined,
    completedAt: undefined,
    ...overrides,
  });
}

/**
 * Create a failed AI generation
 */
export function createFailedAIGeneration(overrides?: Partial<AIGeneration>): AIGeneration {
  return createAIGeneration({
    status: "failed",
    images: [],
    selectedImageId: undefined,
    moderationStatus: "pending",
    errorMessage: "Content moderation failed: potentially inappropriate content detected",
    processingTimeMs: 1500,
    creditsUsed: 0,
    completedAt: undefined,
    ...overrides,
  });
}

/**
 * Create an AI generation pending moderation
 */
export function createPendingModerationAIGeneration(
  overrides?: Partial<AIGeneration>
): AIGeneration {
  return createAIGeneration({
    status: "completed",
    moderationStatus: "pending",
    isPublic: false,
    ...overrides,
  });
}

/**
 * Create a rejected AI generation
 */
export function createRejectedAIGeneration(overrides?: Partial<AIGeneration>): AIGeneration {
  return createAIGeneration({
    status: "completed",
    moderationStatus: "rejected",
    moderationNotes: "Content violates community guidelines",
    moderatedBy: "admin_001",
    moderatedAt: new Date(),
    isPublic: false,
    ...overrides,
  });
}

/**
 * Create multiple AI generations for a user
 */
export function createAIGenerations(userId: string, count: number = 5): AIGeneration[] {
  const generations: AIGeneration[] = [];
  const now = new Date();

  const templates = [
    {
      prompt: "A serene Japanese garden with cherry blossoms",
      stylePreset: "wabi-sabi" as StylePreset,
      aspectRatio: "4:3" as AspectRatio,
    },
    {
      prompt: "Abstract geometric patterns in vibrant colors",
      stylePreset: "geometric" as StylePreset,
      aspectRatio: "1:1" as AspectRatio,
    },
    {
      prompt: "Vintage travel poster of Paris",
      stylePreset: "vintage-poster" as StylePreset,
      aspectRatio: "2:3" as AspectRatio,
    },
    {
      prompt: "Botanical illustration of tropical flowers",
      stylePreset: "botanical" as StylePreset,
      aspectRatio: "4:5" as AspectRatio,
    },
    {
      prompt: "Minimalist mountain landscape at sunset",
      stylePreset: "minimalist" as StylePreset,
      aspectRatio: "16:9" as AspectRatio,
    },
  ];

  const statuses: AIGenerationStatus[] = [
    "completed",
    "completed",
    "completed",
    "processing",
    "pending",
  ];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    const status = statuses[i % statuses.length];
    const createdAt = new Date(now.getTime() - (count - i) * 24 * 60 * 60 * 1000);

    generations.push(
      createAIGeneration({
        id: `ai_gen_${userId}_${i}`,
        userId,
        prompt: template.prompt,
        stylePreset: template.stylePreset,
        aspectRatio: template.aspectRatio,
        status,
        images:
          status === "completed"
            ? [
                {
                  url: `https://cdn.example.com/ai/ai_gen_${userId}_${i}_0.jpg`,
                  width: 1024,
                  height: 768,
                  isSelected: true,
                  thumbnailUrl: `https://cdn.example.com/ai/ai_gen_${userId}_${i}_0_thumb.jpg`,
                },
              ]
            : [],
        moderationStatus: status === "completed" ? "approved" : "pending",
        isPublic: status === "completed" && i % 2 === 0,
        likes: status === "completed" ? Math.floor(Math.random() * 50) : 0,
        views: status === "completed" ? Math.floor(Math.random() * 200) : 0,
        createdAt,
        updatedAt: createdAt,
        completedAt: status === "completed" ? createdAt : undefined,
      })
    );
  }

  return generations;
}

/**
 * Create AI generation parameters with optional overrides
 */
export function createAIParameters(
  overrides?: Partial<AIGenerationParameters>
): AIGenerationParameters {
  return {
    cfgScale: 7.5,
    steps: 30,
    sampler: "DPM++ 2M Karras",
    seed: Math.floor(Math.random() * 1000000000),
    negativePrompt: "blurry, low quality, distorted, ugly, watermark",
    ...overrides,
  };
}

/**
 * Style presets with their descriptions for testing
 */
export const stylePresets: Record<StylePreset, { name: string; description: string }> = {
  "wabi-sabi": {
    name: "Wabi-Sabi",
    description: "Japanese aesthetic emphasizing imperfection and transience",
  },
  "abstract-expression": {
    name: "Abstract Expression",
    description: "Bold, gestural abstract art with emotional intensity",
  },
  botanical: {
    name: "Botanical",
    description: "Detailed illustrations of plants and flowers",
  },
  "vintage-poster": {
    name: "Vintage Poster",
    description: "Retro travel and advertisement poster style",
  },
  minimalist: {
    name: "Minimalist",
    description: "Clean, simple designs with minimal elements",
  },
  geometric: {
    name: "Geometric",
    description: "Bold shapes and patterns in striking compositions",
  },
  watercolor: {
    name: "Watercolor",
    description: "Soft, flowing watercolor painting style",
  },
  "line-art": {
    name: "Line Art",
    description: "Elegant continuous line drawings",
  },
  "pop-art": {
    name: "Pop Art",
    description: "Bold colors and graphic style inspired by pop culture",
  },
  surrealism: {
    name: "Surrealism",
    description: "Dreamlike, imaginative imagery",
  },
};

/**
 * Aspect ratios with their dimensions for testing
 */
export const aspectRatios: Record<AspectRatio, { label: string; width: number; height: number }> = {
  "1:1": { label: "Square", width: 1024, height: 1024 },
  "4:5": { label: "Portrait (4:5)", width: 896, height: 1120 },
  "3:4": { label: "Portrait (3:4)", width: 896, height: 1194 },
  "2:3": { label: "Portrait (2:3)", width: 832, height: 1248 },
  "4:3": { label: "Landscape (4:3)", width: 1152, height: 864 },
  "16:9": { label: "Widescreen (16:9)", width: 1280, height: 720 },
  "21:9": { label: "Ultrawide (21:9)", width: 1344, height: 576 },
};
