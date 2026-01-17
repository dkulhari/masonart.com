/**
 * AI Style Presets for MasonArt Platform
 *
 * Comprehensive style preset configurations for AI image generation.
 * Each preset includes prompt modifiers, negative prompts, and model parameters
 * optimized for high-quality poster-suitable artwork.
 *
 * Based on patterns from docs/poster-app-tech-stack.md (Section 4.3)
 */

import type {
  AIStylePreset,
  AIAspectRatio,
  AIModelProvider,
} from "../database/schema/ai-generations";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * AI model parameters for fine-tuning generation
 */
export interface AIModelParameters {
  /** Classifier-Free Guidance scale (how closely to follow the prompt) */
  cfgScale: number;
  /** Number of inference steps */
  steps: number;
  /** Sampling method */
  sampler: string;
  /** Scheduler type (for some models) */
  scheduler?: string;
}

/**
 * Complete style preset configuration
 */
export interface StylePresetConfig {
  /** Style preset identifier */
  id: AIStylePreset;
  /** Display name */
  name: string;
  /** Description for UI */
  description: string;
  /** Keywords for search/filtering */
  keywords: string[];
  /** Prompt modifiers to append to user prompt */
  promptModifiers: string;
  /** Negative prompt (what to avoid) */
  negativePrompt: string;
  /** Model parameters */
  modelParams: AIModelParameters;
  /** Quality enhancers to append */
  qualityEnhancers: string;
  /** Best aspect ratios for this style */
  recommendedAspectRatios: AIAspectRatio[];
  /** Preferred AI model provider */
  preferredProvider: AIModelProvider;
  /** Category for grouping */
  category: "artistic" | "photographic" | "illustrative" | "decorative";
  /** Whether available for all users or premium only */
  isPremium: boolean;
}

/**
 * Aspect ratio configuration with dimensions
 */
export interface AspectRatioConfig {
  /** Aspect ratio identifier */
  id: AIAspectRatio;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Width ratio */
  widthRatio: number;
  /** Height ratio */
  heightRatio: number;
  /** Output width for SDXL (optimized dimensions) */
  sdxlWidth: number;
  /** Output height for SDXL */
  sdxlHeight: number;
  /** Output width for DALL-E 3 */
  dalleWidth: number;
  /** Output height for DALL-E 3 */
  dalleHeight: number;
  /** Suitable poster orientations */
  suitableFor: string[];
}

/**
 * Color mood configuration for prompt enhancement
 */
export interface ColorMoodConfig {
  /** Color mood identifier */
  id: string;
  /** Display name */
  name: string;
  /** Prompt additions for this mood */
  promptAdditions: string;
  /** Colors typically associated */
  associatedColors: string[];
}

// ============================================================================
// Style Preset Configurations
// ============================================================================

/**
 * Complete style preset configurations
 * These provide comprehensive AI generation parameters for each style
 */
export const STYLE_PRESETS: Record<AIStylePreset, StylePresetConfig> = {
  "wabi-sabi": {
    id: "wabi-sabi",
    name: "Wabi-Sabi",
    description: "Embracing imperfection and transience with minimalist, organic aesthetics",
    keywords: ["minimalist", "organic", "imperfect", "zen", "japanese", "natural", "serene"],
    promptModifiers:
      "minimalist composition, organic textures, muted earth tones, japanese aesthetic, wabi-sabi philosophy, subtle imperfections, natural materials, serene atmosphere, contemplative mood, asymmetrical balance",
    negativePrompt:
      "saturated colors, vibrant, perfect symmetry, glossy, artificial, digital art style, complex, busy, cluttered, neon, fluorescent, harsh lighting, overprocessed",
    modelParams: {
      cfgScale: 7.0,
      steps: 30,
      sampler: "DPM++ 2M Karras",
    },
    qualityEnhancers:
      "high resolution, fine art print quality, museum quality, masterpiece",
    recommendedAspectRatios: ["square", "portrait"],
    preferredProvider: "stable-diffusion",
    category: "artistic",
    isPremium: false,
  },

  "abstract-expression": {
    id: "abstract-expression",
    name: "Abstract Expression",
    description: "Bold brushstrokes and emotional expression in non-representational form",
    keywords: [
      "abstract",
      "expressionism",
      "bold",
      "emotional",
      "dynamic",
      "gestural",
      "modern",
    ],
    promptModifiers:
      "abstract expressionism, bold brushstrokes, emotional intensity, dynamic composition, gestural marks, action painting, expressive color, spontaneous energy, dramatic contrasts, painterly texture",
    negativePrompt:
      "realistic, photographic, precise lines, digital, clean edges, minimal, structured, geometric only, flat colors, low contrast",
    modelParams: {
      cfgScale: 8.0,
      steps: 35,
      sampler: "Euler a",
    },
    qualityEnhancers:
      "gallery artwork, fine art, museum piece, high resolution canvas texture",
    recommendedAspectRatios: ["square", "landscape"],
    preferredProvider: "stable-diffusion",
    category: "artistic",
    isPremium: false,
  },

  botanical: {
    id: "botanical",
    name: "Botanical",
    description: "Elegant floral and plant illustrations with natural beauty",
    keywords: ["floral", "botanical", "plants", "nature", "garden", "organic", "soft"],
    promptModifiers:
      "botanical illustration style, soft watercolor effect, delicate details, nature inspired, organic forms, elegant composition, garden aesthetics, natural color palette, scientific illustration quality, pressed flower aesthetic",
    negativePrompt:
      "artificial, neon colors, harsh contrast, digital art style, 3d render, harsh shadows, cartoon style, pixelated, blurry, dark atmosphere",
    modelParams: {
      cfgScale: 7.5,
      steps: 32,
      sampler: "DPM++ SDE Karras",
    },
    qualityEnhancers:
      "detailed illustration, archival quality, vintage botanical print, hand-painted quality",
    recommendedAspectRatios: ["portrait", "square"],
    preferredProvider: "stable-diffusion",
    category: "illustrative",
    isPremium: false,
  },

  "geometric-modern": {
    id: "geometric-modern",
    name: "Geometric Modern",
    description: "Clean lines and geometric shapes in contemporary design",
    keywords: ["geometric", "modern", "minimal", "shapes", "clean", "contemporary", "design"],
    promptModifiers:
      "geometric shapes, modern design, clean precise lines, minimalist composition, contemporary art, structured layout, bold shapes, graphic design aesthetic, balanced proportions, sharp edges",
    negativePrompt:
      "organic shapes, messy, chaotic, cluttered, hand-drawn, sketchy, realistic textures, complex details, vintage, retro, grunge",
    modelParams: {
      cfgScale: 7.5,
      steps: 28,
      sampler: "DPM++ 2M",
    },
    qualityEnhancers:
      "vector-like quality, crisp edges, print-ready, graphic poster, clean render",
    recommendedAspectRatios: ["square", "portrait", "landscape"],
    preferredProvider: "stable-diffusion",
    category: "decorative",
    isPremium: false,
  },

  "vintage-poster": {
    id: "vintage-poster",
    name: "Vintage Poster",
    description: "Nostalgic retro designs with classic poster aesthetics",
    keywords: ["vintage", "retro", "nostalgic", "classic", "poster", "aged", "warm"],
    promptModifiers:
      "vintage poster art style, retro aesthetic, nostalgic atmosphere, film grain texture, warm color palette, aged paper effect, classic design elements, mid-century influence, letterpress style, propaganda poster aesthetic",
    negativePrompt:
      "modern, digital, clean, minimalist, contemporary, futuristic, neon, cold colors, sterile, high-tech",
    modelParams: {
      cfgScale: 7.0,
      steps: 30,
      sampler: "DPM++ 2M",
    },
    qualityEnhancers:
      "vintage print quality, aged texture, collectible poster, museum archive quality",
    recommendedAspectRatios: ["portrait", "landscape"],
    preferredProvider: "stable-diffusion",
    category: "decorative",
    isPremium: false,
  },

  "pop-art": {
    id: "pop-art",
    name: "Pop Art",
    description: "Bold colors and graphic imagery inspired by popular culture",
    keywords: ["pop art", "bold", "colorful", "graphic", "vibrant", "fun", "contemporary"],
    promptModifiers:
      "pop art style, bold vibrant colors, high contrast, comic book aesthetic, Ben-Day dots, flat graphic colors, Andy Warhol influence, Roy Lichtenstein style, screen print effect, cultural commentary",
    negativePrompt:
      "muted colors, subtle, realistic, photographic, painterly, soft edges, natural palette, minimalist, monochrome, dark",
    modelParams: {
      cfgScale: 8.5,
      steps: 30,
      sampler: "Euler",
    },
    qualityEnhancers:
      "screen print quality, bold poster, gallery pop art, vivid colors, crisp graphics",
    recommendedAspectRatios: ["square", "portrait"],
    preferredProvider: "stable-diffusion",
    category: "artistic",
    isPremium: false,
  },

  watercolor: {
    id: "watercolor",
    name: "Watercolor",
    description: "Soft, flowing artistic effects with transparent washes",
    keywords: [
      "watercolor",
      "soft",
      "flowing",
      "artistic",
      "transparent",
      "delicate",
      "ethereal",
    ],
    promptModifiers:
      "watercolor painting style, soft blending, flowing transparent layers, wet on wet technique, paper texture visible, artistic brushwork, ethereal atmosphere, soft edges, color bleeding, impressionistic details",
    negativePrompt:
      "sharp digital, vector art, hard edges, solid flat colors, 3d render, photorealistic, stark contrast, neon, harsh lines, mechanical",
    modelParams: {
      cfgScale: 7.0,
      steps: 35,
      sampler: "DPM++ 2M SDE",
    },
    qualityEnhancers:
      "fine art watercolor, museum quality, handpainted appearance, premium paper texture",
    recommendedAspectRatios: ["portrait", "square", "landscape"],
    preferredProvider: "stable-diffusion",
    category: "artistic",
    isPremium: false,
  },

  photography: {
    id: "photography",
    name: "Photography",
    description: "Photorealistic imagery with professional quality",
    keywords: [
      "photorealistic",
      "realistic",
      "photography",
      "detailed",
      "professional",
      "sharp",
    ],
    promptModifiers:
      "professional photography, photorealistic, high detail, natural lighting, DSLR quality, sharp focus, depth of field, cinematic composition, editorial quality, lifestyle photography",
    negativePrompt:
      "illustration, cartoon, painting, drawing, anime, digital art, unrealistic, low quality, blurry, noise, artifacts, oversaturated, HDR overprocessed",
    modelParams: {
      cfgScale: 6.5,
      steps: 40,
      sampler: "DPM++ 2M Karras",
    },
    qualityEnhancers:
      "8K resolution, professional photo, magazine quality, award winning photography",
    recommendedAspectRatios: ["landscape", "portrait", "panoramic"],
    preferredProvider: "dall-e-3",
    category: "photographic",
    isPremium: true,
  },

  "line-art": {
    id: "line-art",
    name: "Line Art",
    description: "Minimalist designs with elegant single-stroke aesthetics",
    keywords: ["line art", "minimal", "elegant", "simple", "outline", "sketch", "monochrome"],
    promptModifiers:
      "line art style, single continuous line, minimalist drawing, elegant outlines, black and white, simple strokes, hand-drawn quality, contour drawing, sketch aesthetic, fine linework",
    negativePrompt:
      "filled colors, shading, gradients, complex, detailed textures, colorful, photorealistic, 3d, multiple colors, busy composition",
    modelParams: {
      cfgScale: 7.0,
      steps: 25,
      sampler: "DPM++ 2M",
    },
    qualityEnhancers:
      "crisp lines, gallery quality, fine art print, clean vector-like finish",
    recommendedAspectRatios: ["square", "portrait"],
    preferredProvider: "stable-diffusion",
    category: "illustrative",
    isPremium: false,
  },

  typography: {
    id: "typography",
    name: "Typography",
    description: "Text-focused artistic designs with beautiful letterforms",
    keywords: ["typography", "text", "letters", "fonts", "words", "design", "quotes"],
    promptModifiers:
      "typographic art, beautiful lettering, artistic text layout, font design, decorative typography, creative word arrangement, calligraphic elements, text as art, graphic text design, poster typography",
    negativePrompt:
      "blurry text, illegible, distorted letters, messy, chaotic arrangement, low resolution, pixelated text, handwriting errors, misspellings",
    modelParams: {
      cfgScale: 8.0,
      steps: 35,
      sampler: "Euler a",
    },
    qualityEnhancers:
      "crisp text, print quality, professional typography, graphic design quality",
    recommendedAspectRatios: ["portrait", "square"],
    preferredProvider: "stable-diffusion",
    category: "decorative",
    isPremium: false,
  },
};

// ============================================================================
// Aspect Ratio Configurations
// ============================================================================

/**
 * Aspect ratio configurations with optimized dimensions for each provider
 */
export const ASPECT_RATIOS: Record<AIAspectRatio, AspectRatioConfig> = {
  square: {
    id: "square",
    name: "Square (1:1)",
    description: "Perfect for symmetrical compositions and modern layouts",
    widthRatio: 1,
    heightRatio: 1,
    sdxlWidth: 1024,
    sdxlHeight: 1024,
    dalleWidth: 1024,
    dalleHeight: 1024,
    suitableFor: ["square"],
  },
  portrait: {
    id: "portrait",
    name: "Portrait (2:3)",
    description: "Ideal for vertical wall spaces and traditional poster formats",
    widthRatio: 2,
    heightRatio: 3,
    sdxlWidth: 832,
    sdxlHeight: 1216,
    dalleWidth: 1024,
    dalleHeight: 1792,
    suitableFor: ["portrait"],
  },
  landscape: {
    id: "landscape",
    name: "Landscape (3:2)",
    description: "Great for horizontal displays and scenic views",
    widthRatio: 3,
    heightRatio: 2,
    sdxlWidth: 1216,
    sdxlHeight: 832,
    dalleWidth: 1792,
    dalleHeight: 1024,
    suitableFor: ["landscape"],
  },
  panoramic: {
    id: "panoramic",
    name: "Panoramic (16:9)",
    description: "Extra wide format for dramatic landscapes and cinematic scenes",
    widthRatio: 16,
    heightRatio: 9,
    sdxlWidth: 1344,
    sdxlHeight: 768,
    dalleWidth: 1792,
    dalleHeight: 1024, // DALL-E doesn't support exact 16:9, using closest
    suitableFor: ["panoramic", "landscape"],
  },
};

// ============================================================================
// Color Mood Configurations
// ============================================================================

/**
 * Color mood configurations for prompt enhancement
 */
export const COLOR_MOODS: Record<string, ColorMoodConfig> = {
  warm: {
    id: "warm",
    name: "Warm",
    promptAdditions: "warm color temperature, golden tones, amber hues, sunset colors, cozy atmosphere",
    associatedColors: ["gold", "orange", "red", "yellow", "brown"],
  },
  cool: {
    id: "cool",
    name: "Cool",
    promptAdditions: "cool color temperature, blue tones, cyan hues, fresh atmosphere, calming palette",
    associatedColors: ["blue", "cyan", "teal", "purple", "grey"],
  },
  neutral: {
    id: "neutral",
    name: "Neutral",
    promptAdditions: "neutral color palette, balanced tones, beige and grey, understated colors, sophisticated palette",
    associatedColors: ["beige", "grey", "cream", "taupe", "white"],
  },
  vibrant: {
    id: "vibrant",
    name: "Vibrant",
    promptAdditions: "vibrant saturated colors, bold color choices, energetic palette, high saturation",
    associatedColors: ["red", "orange", "yellow", "green", "blue", "purple"],
  },
  muted: {
    id: "muted",
    name: "Muted",
    promptAdditions: "muted desaturated colors, soft tones, subdued palette, gentle color harmony",
    associatedColors: ["dusty rose", "sage", "slate", "mauve", "ivory"],
  },
  monochrome: {
    id: "monochrome",
    name: "Monochrome",
    promptAdditions: "monochromatic color scheme, single color family, tonal variations, elegant simplicity",
    associatedColors: ["black", "white", "grey"],
  },
  "earth-tones": {
    id: "earth-tones",
    name: "Earth Tones",
    promptAdditions: "earthy natural colors, organic palette, forest and soil tones, natural pigments",
    associatedColors: ["brown", "green", "beige", "terracotta", "olive"],
  },
  pastel: {
    id: "pastel",
    name: "Pastel",
    promptAdditions: "soft pastel colors, light tints, gentle hues, dreamy palette, delicate tones",
    associatedColors: ["pink", "lavender", "mint", "peach", "baby blue"],
  },
};

// ============================================================================
// Prompt Construction Functions
// ============================================================================

/**
 * Construct an enhanced prompt by combining user prompt with style modifiers
 */
export function constructEnhancedPrompt(
  userPrompt: string,
  stylePreset: AIStylePreset,
  options?: {
    colorMood?: string;
    colorPalette?: string[];
    additionalModifiers?: string;
  }
): string {
  const preset = STYLE_PRESETS[stylePreset];
  if (!preset) {
    return userPrompt;
  }

  const parts: string[] = [userPrompt];

  // Add style modifiers
  parts.push(preset.promptModifiers);

  // Add quality enhancers
  parts.push(preset.qualityEnhancers);

  // Add color mood if specified
  if (options?.colorMood) {
    const colorMoodConfig = COLOR_MOODS[options.colorMood];
    if (colorMoodConfig) {
      parts.push(colorMoodConfig.promptAdditions);
    }
  }

  // Add specific color palette if provided
  if (options?.colorPalette && options.colorPalette.length > 0) {
    parts.push(`color palette: ${options.colorPalette.join(", ")}`);
  }

  // Add any additional custom modifiers
  if (options?.additionalModifiers) {
    parts.push(options.additionalModifiers);
  }

  return parts.join(", ");
}

/**
 * Construct the negative prompt for a style preset
 */
export function constructNegativePrompt(
  stylePreset: AIStylePreset,
  additionalNegative?: string
): string {
  const preset = STYLE_PRESETS[stylePreset];
  if (!preset) {
    return additionalNegative || "";
  }

  const parts: string[] = [preset.negativePrompt];

  // Add common negative prompts for quality
  parts.push("low quality, blurry, artifacts, watermark, signature, text overlay");

  if (additionalNegative) {
    parts.push(additionalNegative);
  }

  return parts.join(", ");
}

/**
 * Get image dimensions for a given aspect ratio and provider
 */
export function getImageDimensions(
  aspectRatio: AIAspectRatio,
  provider: AIModelProvider
): { width: number; height: number } {
  const config = ASPECT_RATIOS[aspectRatio];
  if (!config) {
    // Default to square if unknown
    return { width: 1024, height: 1024 };
  }

  switch (provider) {
    case "dall-e-3":
      return { width: config.dalleWidth, height: config.dalleHeight };
    case "stable-diffusion":
    case "fal-ai":
    default:
      return { width: config.sdxlWidth, height: config.sdxlHeight };
  }
}

/**
 * Get model parameters for a style preset
 */
export function getModelParameters(stylePreset: AIStylePreset): AIModelParameters {
  const preset = STYLE_PRESETS[stylePreset];
  if (!preset) {
    // Default parameters
    return {
      cfgScale: 7.0,
      steps: 30,
      sampler: "DPM++ 2M Karras",
    };
  }
  return preset.modelParams;
}

/**
 * Get recommended style presets for a given aspect ratio
 */
export function getRecommendedStylesForAspectRatio(aspectRatio: AIAspectRatio): AIStylePreset[] {
  return (Object.values(STYLE_PRESETS) as StylePresetConfig[])
    .filter((preset) => preset.recommendedAspectRatios.includes(aspectRatio))
    .map((preset) => preset.id);
}

/**
 * Get style presets by category
 */
export function getStylesByCategory(
  category: StylePresetConfig["category"]
): StylePresetConfig[] {
  return (Object.values(STYLE_PRESETS) as StylePresetConfig[]).filter(
    (preset) => preset.category === category
  );
}

/**
 * Get all available style presets (optionally filtered by premium status)
 */
export function getAvailableStyles(includePremium: boolean = false): StylePresetConfig[] {
  return (Object.values(STYLE_PRESETS) as StylePresetConfig[]).filter(
    (preset) => includePremium || !preset.isPremium
  );
}

/**
 * Search style presets by keyword
 */
export function searchStylePresets(keyword: string): StylePresetConfig[] {
  const lowerKeyword = keyword.toLowerCase();
  return (Object.values(STYLE_PRESETS) as StylePresetConfig[]).filter(
    (preset) =>
      preset.name.toLowerCase().includes(lowerKeyword) ||
      preset.description.toLowerCase().includes(lowerKeyword) ||
      preset.keywords.some((k) => k.toLowerCase().includes(lowerKeyword))
  );
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a style preset is valid
 */
export function isValidStylePreset(preset: string): preset is AIStylePreset {
  return preset in STYLE_PRESETS;
}

/**
 * Check if an aspect ratio is valid
 */
export function isValidAspectRatio(ratio: string): ratio is AIAspectRatio {
  return ratio in ASPECT_RATIOS;
}

/**
 * Check if a color mood is valid
 */
export function isValidColorMood(mood: string): boolean {
  return mood in COLOR_MOODS;
}

// ============================================================================
// Export Types
// ============================================================================

export type {
  AIStylePreset,
  AIAspectRatio,
};
