/**
 * AI Style Presets Tests
 *
 * Comprehensive tests for AI style presets validation including:
 * 1. Style Preset Configurations - Verify all 10 presets have correct structure
 * 2. Aspect Ratio Configurations - Verify all 4 aspect ratios with dimensions
 * 3. Color Mood Configurations - Verify all 8 color moods
 * 4. Prompt Construction Functions - Test enhanced and negative prompt building
 * 5. Image Dimension Functions - Test dimension calculation for different providers
 * 6. Model Parameter Functions - Test style-specific model parameters
 * 7. Style Recommendation Functions - Test filtering and search capabilities
 * 8. Validation Functions - Test preset, ratio, and mood validation
 *
 * Based on packages/api/src/ai/style-presets.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import "../setup";

// Import style presets module
import * as stylePresetsModule from "../../src/ai/style-presets";
import {
  STYLE_PRESETS,
  ASPECT_RATIOS,
  COLOR_MOODS,
  constructEnhancedPrompt,
  constructNegativePrompt,
  getImageDimensions,
  getModelParameters,
  getRecommendedStylesForAspectRatio,
  getStylesByCategory,
  getAvailableStyles,
  searchStylePresets,
  isValidStylePreset,
  isValidAspectRatio,
  isValidColorMood,
  type StylePresetConfig,
  type AspectRatioConfig,
  type ColorMoodConfig,
  type AIModelParameters,
} from "../../src/ai/style-presets";

import type {
  AIStylePreset,
  AIAspectRatio,
  AIModelProvider,
} from "../../src/database/schema/ai-generations";

// ============================================================================
// Module Exports Tests
// ============================================================================

describe("Style Presets Module Exports", () => {
  describe("Configuration exports", () => {
    it("should export STYLE_PRESETS", () => {
      expect(stylePresetsModule).toHaveProperty("STYLE_PRESETS");
      expect(STYLE_PRESETS).toBeDefined();
    });

    it("should export ASPECT_RATIOS", () => {
      expect(stylePresetsModule).toHaveProperty("ASPECT_RATIOS");
      expect(ASPECT_RATIOS).toBeDefined();
    });

    it("should export COLOR_MOODS", () => {
      expect(stylePresetsModule).toHaveProperty("COLOR_MOODS");
      expect(COLOR_MOODS).toBeDefined();
    });
  });

  describe("Function exports", () => {
    it("should export constructEnhancedPrompt", () => {
      expect(stylePresetsModule).toHaveProperty("constructEnhancedPrompt");
      expect(typeof constructEnhancedPrompt).toBe("function");
    });

    it("should export constructNegativePrompt", () => {
      expect(stylePresetsModule).toHaveProperty("constructNegativePrompt");
      expect(typeof constructNegativePrompt).toBe("function");
    });

    it("should export getImageDimensions", () => {
      expect(stylePresetsModule).toHaveProperty("getImageDimensions");
      expect(typeof getImageDimensions).toBe("function");
    });

    it("should export getModelParameters", () => {
      expect(stylePresetsModule).toHaveProperty("getModelParameters");
      expect(typeof getModelParameters).toBe("function");
    });

    it("should export getRecommendedStylesForAspectRatio", () => {
      expect(stylePresetsModule).toHaveProperty("getRecommendedStylesForAspectRatio");
      expect(typeof getRecommendedStylesForAspectRatio).toBe("function");
    });

    it("should export getStylesByCategory", () => {
      expect(stylePresetsModule).toHaveProperty("getStylesByCategory");
      expect(typeof getStylesByCategory).toBe("function");
    });

    it("should export getAvailableStyles", () => {
      expect(stylePresetsModule).toHaveProperty("getAvailableStyles");
      expect(typeof getAvailableStyles).toBe("function");
    });

    it("should export searchStylePresets", () => {
      expect(stylePresetsModule).toHaveProperty("searchStylePresets");
      expect(typeof searchStylePresets).toBe("function");
    });

    it("should export isValidStylePreset", () => {
      expect(stylePresetsModule).toHaveProperty("isValidStylePreset");
      expect(typeof isValidStylePreset).toBe("function");
    });

    it("should export isValidAspectRatio", () => {
      expect(stylePresetsModule).toHaveProperty("isValidAspectRatio");
      expect(typeof isValidAspectRatio).toBe("function");
    });

    it("should export isValidColorMood", () => {
      expect(stylePresetsModule).toHaveProperty("isValidColorMood");
      expect(typeof isValidColorMood).toBe("function");
    });
  });
});

// ============================================================================
// Style Presets Configuration Tests
// ============================================================================

describe("STYLE_PRESETS Configuration", () => {
  const expectedStylePresets: AIStylePreset[] = [
    // Original 10 presets
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
    // 5 new presets added in full-ai-generator feature
    "ink-wash",
    "digital-art",
    "minimalist-modern",
    "impressionist",
    "art-deco",
  ];

  describe("Preset count and keys", () => {
    it("should have exactly 15 style presets", () => {
      const presetCount = Object.keys(STYLE_PRESETS).length;
      expect(presetCount).toBe(15);
    });

    it("should have all expected style preset keys", () => {
      expectedStylePresets.forEach((preset) => {
        expect(STYLE_PRESETS).toHaveProperty(preset);
      });
    });
  });

  describe("Preset structure validation", () => {
    expectedStylePresets.forEach((presetId) => {
      describe(`${presetId} preset`, () => {
        const preset = STYLE_PRESETS[presetId];

        it("should have required id field", () => {
          expect(preset.id).toBe(presetId);
        });

        it("should have non-empty name", () => {
          expect(preset.name).toBeDefined();
          expect(typeof preset.name).toBe("string");
          expect(preset.name.length).toBeGreaterThan(0);
        });

        it("should have non-empty description", () => {
          expect(preset.description).toBeDefined();
          expect(typeof preset.description).toBe("string");
          expect(preset.description.length).toBeGreaterThan(10);
        });

        it("should have keywords array with at least 3 keywords", () => {
          expect(Array.isArray(preset.keywords)).toBe(true);
          expect(preset.keywords.length).toBeGreaterThanOrEqual(3);
          preset.keywords.forEach((keyword) => {
            expect(typeof keyword).toBe("string");
            expect(keyword.length).toBeGreaterThan(0);
          });
        });

        it("should have non-empty promptModifiers", () => {
          expect(preset.promptModifiers).toBeDefined();
          expect(typeof preset.promptModifiers).toBe("string");
          expect(preset.promptModifiers.length).toBeGreaterThan(20);
        });

        it("should have non-empty negativePrompt", () => {
          expect(preset.negativePrompt).toBeDefined();
          expect(typeof preset.negativePrompt).toBe("string");
          expect(preset.negativePrompt.length).toBeGreaterThan(10);
        });

        it("should have valid modelParams", () => {
          expect(preset.modelParams).toBeDefined();
          expect(typeof preset.modelParams.cfgScale).toBe("number");
          expect(preset.modelParams.cfgScale).toBeGreaterThanOrEqual(1);
          expect(preset.modelParams.cfgScale).toBeLessThanOrEqual(20);
          expect(typeof preset.modelParams.steps).toBe("number");
          expect(preset.modelParams.steps).toBeGreaterThanOrEqual(10);
          expect(preset.modelParams.steps).toBeLessThanOrEqual(100);
          expect(typeof preset.modelParams.sampler).toBe("string");
          expect(preset.modelParams.sampler.length).toBeGreaterThan(0);
        });

        it("should have non-empty qualityEnhancers", () => {
          expect(preset.qualityEnhancers).toBeDefined();
          expect(typeof preset.qualityEnhancers).toBe("string");
          expect(preset.qualityEnhancers.length).toBeGreaterThan(10);
        });

        it("should have recommendedAspectRatios array", () => {
          expect(Array.isArray(preset.recommendedAspectRatios)).toBe(true);
          expect(preset.recommendedAspectRatios.length).toBeGreaterThanOrEqual(1);
          const validAspectRatios: AIAspectRatio[] = [
            "square",
            "portrait",
            "landscape",
            "panoramic",
          ];
          preset.recommendedAspectRatios.forEach((ratio) => {
            expect(validAspectRatios).toContain(ratio);
          });
        });

        it("should have valid preferredProvider", () => {
          const validProviders: AIModelProvider[] = [
            "stable-diffusion",
            "dall-e-3",
            "midjourney",
            "fal-ai",
          ];
          expect(validProviders).toContain(preset.preferredProvider);
        });

        it("should have valid category", () => {
          const validCategories = ["artistic", "photographic", "illustrative", "decorative"];
          expect(validCategories).toContain(preset.category);
        });

        it("should have boolean isPremium", () => {
          expect(typeof preset.isPremium).toBe("boolean");
        });
      });
    });
  });

  describe("Premium vs non-premium presets", () => {
    it("should have at least one premium preset", () => {
      const premiumPresets = Object.values(STYLE_PRESETS).filter((p) => p.isPremium);
      expect(premiumPresets.length).toBeGreaterThanOrEqual(1);
    });

    it("should have more non-premium than premium presets", () => {
      const premiumPresets = Object.values(STYLE_PRESETS).filter((p) => p.isPremium);
      const nonPremiumPresets = Object.values(STYLE_PRESETS).filter((p) => !p.isPremium);
      expect(nonPremiumPresets.length).toBeGreaterThan(premiumPresets.length);
    });

    it("should have photography as premium preset", () => {
      expect(STYLE_PRESETS["photography"].isPremium).toBe(true);
    });

    it("should have wabi-sabi as non-premium preset", () => {
      expect(STYLE_PRESETS["wabi-sabi"].isPremium).toBe(false);
    });
  });

  describe("Category distribution", () => {
    it("should have presets in artistic category", () => {
      const artisticPresets = Object.values(STYLE_PRESETS).filter((p) => p.category === "artistic");
      expect(artisticPresets.length).toBeGreaterThanOrEqual(1);
    });

    it("should have presets in illustrative category", () => {
      const illustrativePresets = Object.values(STYLE_PRESETS).filter(
        (p) => p.category === "illustrative"
      );
      expect(illustrativePresets.length).toBeGreaterThanOrEqual(1);
    });

    it("should have presets in decorative category", () => {
      const decorativePresets = Object.values(STYLE_PRESETS).filter(
        (p) => p.category === "decorative"
      );
      expect(decorativePresets.length).toBeGreaterThanOrEqual(1);
    });

    it("should have presets in photographic category", () => {
      const photographicPresets = Object.values(STYLE_PRESETS).filter(
        (p) => p.category === "photographic"
      );
      expect(photographicPresets.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================================================================
// Aspect Ratio Configuration Tests
// ============================================================================

describe("ASPECT_RATIOS Configuration", () => {
  const expectedAspectRatios: AIAspectRatio[] = ["square", "portrait", "landscape", "panoramic"];

  describe("Ratio count and keys", () => {
    it("should have exactly 4 aspect ratios", () => {
      const ratioCount = Object.keys(ASPECT_RATIOS).length;
      expect(ratioCount).toBe(4);
    });

    it("should have all expected aspect ratio keys", () => {
      expectedAspectRatios.forEach((ratio) => {
        expect(ASPECT_RATIOS).toHaveProperty(ratio);
      });
    });
  });

  describe("Ratio structure validation", () => {
    expectedAspectRatios.forEach((ratioId) => {
      describe(`${ratioId} aspect ratio`, () => {
        const ratio = ASPECT_RATIOS[ratioId];

        it("should have required id field", () => {
          expect(ratio.id).toBe(ratioId);
        });

        it("should have non-empty name", () => {
          expect(ratio.name).toBeDefined();
          expect(typeof ratio.name).toBe("string");
          expect(ratio.name.length).toBeGreaterThan(0);
        });

        it("should have non-empty description", () => {
          expect(ratio.description).toBeDefined();
          expect(typeof ratio.description).toBe("string");
          expect(ratio.description.length).toBeGreaterThan(10);
        });

        it("should have valid widthRatio", () => {
          expect(typeof ratio.widthRatio).toBe("number");
          expect(ratio.widthRatio).toBeGreaterThan(0);
        });

        it("should have valid heightRatio", () => {
          expect(typeof ratio.heightRatio).toBe("number");
          expect(ratio.heightRatio).toBeGreaterThan(0);
        });

        it("should have valid SDXL dimensions", () => {
          expect(typeof ratio.sdxlWidth).toBe("number");
          expect(ratio.sdxlWidth).toBeGreaterThanOrEqual(512);
          expect(ratio.sdxlWidth).toBeLessThanOrEqual(2048);
          expect(typeof ratio.sdxlHeight).toBe("number");
          expect(ratio.sdxlHeight).toBeGreaterThanOrEqual(512);
          expect(ratio.sdxlHeight).toBeLessThanOrEqual(2048);
        });

        it("should have valid DALL-E dimensions", () => {
          expect(typeof ratio.dalleWidth).toBe("number");
          expect(ratio.dalleWidth).toBeGreaterThanOrEqual(1024);
          expect(typeof ratio.dalleHeight).toBe("number");
          expect(ratio.dalleHeight).toBeGreaterThanOrEqual(1024);
        });

        it("should have suitableFor array", () => {
          expect(Array.isArray(ratio.suitableFor)).toBe(true);
          expect(ratio.suitableFor.length).toBeGreaterThanOrEqual(1);
        });
      });
    });
  });

  describe("Specific aspect ratio values", () => {
    it("should have 1:1 ratio for square", () => {
      expect(ASPECT_RATIOS.square.widthRatio).toBe(1);
      expect(ASPECT_RATIOS.square.heightRatio).toBe(1);
    });

    it("should have 2:3 ratio for portrait", () => {
      expect(ASPECT_RATIOS.portrait.widthRatio).toBe(2);
      expect(ASPECT_RATIOS.portrait.heightRatio).toBe(3);
    });

    it("should have 3:2 ratio for landscape", () => {
      expect(ASPECT_RATIOS.landscape.widthRatio).toBe(3);
      expect(ASPECT_RATIOS.landscape.heightRatio).toBe(2);
    });

    it("should have 16:9 ratio for panoramic", () => {
      expect(ASPECT_RATIOS.panoramic.widthRatio).toBe(16);
      expect(ASPECT_RATIOS.panoramic.heightRatio).toBe(9);
    });
  });

  describe("SDXL dimensions validation", () => {
    it("should have 1024x1024 for square", () => {
      expect(ASPECT_RATIOS.square.sdxlWidth).toBe(1024);
      expect(ASPECT_RATIOS.square.sdxlHeight).toBe(1024);
    });

    it("should have portrait dimensions (width < height)", () => {
      expect(ASPECT_RATIOS.portrait.sdxlWidth).toBeLessThan(ASPECT_RATIOS.portrait.sdxlHeight);
    });

    it("should have landscape dimensions (width > height)", () => {
      expect(ASPECT_RATIOS.landscape.sdxlWidth).toBeGreaterThan(ASPECT_RATIOS.landscape.sdxlHeight);
    });

    it("should have panoramic dimensions (very wide)", () => {
      expect(ASPECT_RATIOS.panoramic.sdxlWidth).toBeGreaterThan(ASPECT_RATIOS.panoramic.sdxlHeight);
      const aspectRatio = ASPECT_RATIOS.panoramic.sdxlWidth / ASPECT_RATIOS.panoramic.sdxlHeight;
      expect(aspectRatio).toBeGreaterThan(1.5);
    });
  });
});

// ============================================================================
// Color Mood Configuration Tests
// ============================================================================

describe("COLOR_MOODS Configuration", () => {
  const expectedColorMoods = [
    "warm",
    "cool",
    "neutral",
    "vibrant",
    "muted",
    "monochrome",
    "earth-tones",
    "pastel",
  ];

  describe("Mood count and keys", () => {
    it("should have exactly 8 color moods", () => {
      const moodCount = Object.keys(COLOR_MOODS).length;
      expect(moodCount).toBe(8);
    });

    it("should have all expected color mood keys", () => {
      expectedColorMoods.forEach((mood) => {
        expect(COLOR_MOODS).toHaveProperty(mood);
      });
    });
  });

  describe("Mood structure validation", () => {
    expectedColorMoods.forEach((moodId) => {
      describe(`${moodId} color mood`, () => {
        const mood = COLOR_MOODS[moodId];

        it("should have required id field", () => {
          expect(mood.id).toBe(moodId);
        });

        it("should have non-empty name", () => {
          expect(mood.name).toBeDefined();
          expect(typeof mood.name).toBe("string");
          expect(mood.name.length).toBeGreaterThan(0);
        });

        it("should have non-empty promptAdditions", () => {
          expect(mood.promptAdditions).toBeDefined();
          expect(typeof mood.promptAdditions).toBe("string");
          expect(mood.promptAdditions.length).toBeGreaterThan(10);
        });

        it("should have associatedColors array", () => {
          expect(Array.isArray(mood.associatedColors)).toBe(true);
          expect(mood.associatedColors.length).toBeGreaterThanOrEqual(2);
          mood.associatedColors.forEach((color) => {
            expect(typeof color).toBe("string");
            expect(color.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  describe("Specific mood values", () => {
    it("warm mood should include warm color terms", () => {
      expect(COLOR_MOODS.warm.promptAdditions.toLowerCase()).toContain("warm");
    });

    it("cool mood should include cool color terms", () => {
      expect(COLOR_MOODS.cool.promptAdditions.toLowerCase()).toContain("cool");
    });

    it("monochrome mood should include monochrome terms", () => {
      expect(COLOR_MOODS.monochrome.promptAdditions.toLowerCase()).toContain("monochrom");
    });

    it("pastel mood should include pastel terms", () => {
      expect(COLOR_MOODS.pastel.promptAdditions.toLowerCase()).toContain("pastel");
    });
  });
});

// ============================================================================
// Prompt Construction Function Tests
// ============================================================================

describe("constructEnhancedPrompt", () => {
  describe("Basic prompt construction", () => {
    it("should return user prompt if style preset is invalid", () => {
      const result = constructEnhancedPrompt(
        "A beautiful sunset",
        "invalid-preset" as AIStylePreset
      );
      expect(result).toBe("A beautiful sunset");
    });

    it("should combine user prompt with style modifiers", () => {
      const result = constructEnhancedPrompt("A beautiful sunset", "wabi-sabi");
      expect(result).toContain("A beautiful sunset");
      expect(result).toContain("minimalist");
    });

    it("should include quality enhancers", () => {
      const result = constructEnhancedPrompt("A beautiful sunset", "photography");
      expect(result.toLowerCase()).toContain("quality");
    });
  });

  describe("With color mood", () => {
    it("should add color mood when specified", () => {
      const result = constructEnhancedPrompt("A forest scene", "botanical", { colorMood: "warm" });
      expect(result.toLowerCase()).toContain("warm");
    });

    it("should ignore invalid color mood", () => {
      const result = constructEnhancedPrompt("A forest scene", "botanical", {
        colorMood: "invalid-mood",
      });
      expect(result).not.toContain("invalid-mood");
    });
  });

  describe("With color palette", () => {
    it("should add color palette when specified", () => {
      const result = constructEnhancedPrompt("A sunset", "watercolor", {
        colorPalette: ["#FF5733", "#33FF57"],
      });
      expect(result).toContain("color palette");
      expect(result).toContain("#FF5733");
      expect(result).toContain("#33FF57");
    });

    it("should not add empty color palette", () => {
      const result = constructEnhancedPrompt("A sunset", "watercolor", { colorPalette: [] });
      expect(result).not.toContain("color palette");
    });
  });

  describe("With additional modifiers", () => {
    it("should add additional modifiers when specified", () => {
      const result = constructEnhancedPrompt("A portrait", "line-art", {
        additionalModifiers: "elegant and refined",
      });
      expect(result).toContain("elegant and refined");
    });
  });

  describe("Combined options", () => {
    it("should combine all options correctly", () => {
      const result = constructEnhancedPrompt("A mountain landscape", "photography", {
        colorMood: "cool",
        colorPalette: ["#0000FF", "#00FFFF"],
        additionalModifiers: "misty morning atmosphere",
      });

      expect(result).toContain("A mountain landscape");
      expect(result.toLowerCase()).toContain("cool");
      expect(result).toContain("#0000FF");
      expect(result).toContain("misty morning atmosphere");
    });
  });

  describe("All style presets", () => {
    const stylePresets: AIStylePreset[] = [
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
      "ink-wash",
      "digital-art",
      "minimalist-modern",
      "impressionist",
      "art-deco",
    ];

    stylePresets.forEach((preset) => {
      it(`should construct enhanced prompt for ${preset}`, () => {
        const result = constructEnhancedPrompt("Test prompt", preset);
        expect(result.length).toBeGreaterThan("Test prompt".length);
        expect(result).toContain("Test prompt");
      });
    });
  });
});

describe("constructNegativePrompt", () => {
  describe("Basic negative prompt construction", () => {
    it("should return additional negative if style preset is invalid", () => {
      const result = constructNegativePrompt("invalid-preset" as AIStylePreset, "custom negative");
      expect(result).toBe("custom negative");
    });

    it("should return empty string if no preset and no additional", () => {
      const result = constructNegativePrompt("invalid-preset" as AIStylePreset);
      expect(result).toBe("");
    });

    it("should include style-specific negative prompt", () => {
      const result = constructNegativePrompt("wabi-sabi");
      expect(result).toContain("saturated");
    });

    it("should include common quality negative prompts", () => {
      const result = constructNegativePrompt("photography");
      expect(result.toLowerCase()).toContain("low quality");
      expect(result.toLowerCase()).toContain("blurry");
    });
  });

  describe("With additional negative prompt", () => {
    it("should append additional negative prompt", () => {
      const result = constructNegativePrompt("botanical", "ugly, deformed");
      expect(result).toContain("ugly, deformed");
    });
  });

  describe("All style presets", () => {
    const stylePresets: AIStylePreset[] = [
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
      "ink-wash",
      "digital-art",
      "minimalist-modern",
      "impressionist",
      "art-deco",
    ];

    stylePresets.forEach((preset) => {
      it(`should construct negative prompt for ${preset}`, () => {
        const result = constructNegativePrompt(preset);
        expect(result.length).toBeGreaterThan(10);
      });
    });
  });
});

// ============================================================================
// Image Dimension Function Tests
// ============================================================================

describe("getImageDimensions", () => {
  describe("Stable Diffusion provider", () => {
    it("should return SDXL dimensions for stable-diffusion", () => {
      const dims = getImageDimensions("square", "stable-diffusion");
      expect(dims.width).toBe(ASPECT_RATIOS.square.sdxlWidth);
      expect(dims.height).toBe(ASPECT_RATIOS.square.sdxlHeight);
    });

    it("should return portrait SDXL dimensions", () => {
      const dims = getImageDimensions("portrait", "stable-diffusion");
      expect(dims.width).toBe(ASPECT_RATIOS.portrait.sdxlWidth);
      expect(dims.height).toBe(ASPECT_RATIOS.portrait.sdxlHeight);
    });

    it("should return landscape SDXL dimensions", () => {
      const dims = getImageDimensions("landscape", "stable-diffusion");
      expect(dims.width).toBe(ASPECT_RATIOS.landscape.sdxlWidth);
      expect(dims.height).toBe(ASPECT_RATIOS.landscape.sdxlHeight);
    });

    it("should return panoramic SDXL dimensions", () => {
      const dims = getImageDimensions("panoramic", "stable-diffusion");
      expect(dims.width).toBe(ASPECT_RATIOS.panoramic.sdxlWidth);
      expect(dims.height).toBe(ASPECT_RATIOS.panoramic.sdxlHeight);
    });
  });

  describe("DALL-E 3 provider", () => {
    it("should return DALL-E dimensions for dall-e-3", () => {
      const dims = getImageDimensions("square", "dall-e-3");
      expect(dims.width).toBe(ASPECT_RATIOS.square.dalleWidth);
      expect(dims.height).toBe(ASPECT_RATIOS.square.dalleHeight);
    });

    it("should return portrait DALL-E dimensions", () => {
      const dims = getImageDimensions("portrait", "dall-e-3");
      expect(dims.width).toBe(ASPECT_RATIOS.portrait.dalleWidth);
      expect(dims.height).toBe(ASPECT_RATIOS.portrait.dalleHeight);
    });
  });

  describe("FAL.ai provider", () => {
    it("should return SDXL dimensions for fal-ai (same as SD)", () => {
      const dims = getImageDimensions("square", "fal-ai");
      expect(dims.width).toBe(ASPECT_RATIOS.square.sdxlWidth);
      expect(dims.height).toBe(ASPECT_RATIOS.square.sdxlHeight);
    });
  });

  describe("Default behavior", () => {
    it("should return 1024x1024 for unknown aspect ratio", () => {
      const dims = getImageDimensions("unknown" as AIAspectRatio, "stable-diffusion");
      expect(dims.width).toBe(1024);
      expect(dims.height).toBe(1024);
    });

    it("should return SDXL dimensions for unknown provider", () => {
      const dims = getImageDimensions("portrait", "midjourney");
      expect(dims.width).toBe(ASPECT_RATIOS.portrait.sdxlWidth);
      expect(dims.height).toBe(ASPECT_RATIOS.portrait.sdxlHeight);
    });
  });
});

// ============================================================================
// Model Parameter Function Tests
// ============================================================================

describe("getModelParameters", () => {
  describe("Valid style presets", () => {
    const stylePresets: AIStylePreset[] = [
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
      "ink-wash",
      "digital-art",
      "minimalist-modern",
      "impressionist",
      "art-deco",
    ];

    stylePresets.forEach((preset) => {
      it(`should return model parameters for ${preset}`, () => {
        const params = getModelParameters(preset);
        expect(params).toBeDefined();
        expect(typeof params.cfgScale).toBe("number");
        expect(typeof params.steps).toBe("number");
        expect(typeof params.sampler).toBe("string");
      });

      it(`should return correct parameters for ${preset}`, () => {
        const params = getModelParameters(preset);
        const expectedParams = STYLE_PRESETS[preset].modelParams;
        expect(params.cfgScale).toBe(expectedParams.cfgScale);
        expect(params.steps).toBe(expectedParams.steps);
        expect(params.sampler).toBe(expectedParams.sampler);
      });
    });
  });

  describe("Default parameters", () => {
    it("should return default parameters for invalid preset", () => {
      const params = getModelParameters("invalid-preset" as AIStylePreset);
      expect(params.cfgScale).toBe(7.0);
      expect(params.steps).toBe(30);
      expect(params.sampler).toBe("DPM++ 2M Karras");
    });
  });

  describe("Parameter ranges", () => {
    const stylePresets: AIStylePreset[] = [
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
    ];

    stylePresets.forEach((preset) => {
      it(`${preset} should have cfgScale between 1 and 20`, () => {
        const params = getModelParameters(preset);
        expect(params.cfgScale).toBeGreaterThanOrEqual(1);
        expect(params.cfgScale).toBeLessThanOrEqual(20);
      });

      it(`${preset} should have steps between 10 and 100`, () => {
        const params = getModelParameters(preset);
        expect(params.steps).toBeGreaterThanOrEqual(10);
        expect(params.steps).toBeLessThanOrEqual(100);
      });
    });
  });
});

// ============================================================================
// Style Recommendation Function Tests
// ============================================================================

describe("getRecommendedStylesForAspectRatio", () => {
  describe("Square aspect ratio", () => {
    it("should return styles that recommend square", () => {
      const styles = getRecommendedStylesForAspectRatio("square");
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
      styles.forEach((style) => {
        expect(STYLE_PRESETS[style].recommendedAspectRatios).toContain("square");
      });
    });
  });

  describe("Portrait aspect ratio", () => {
    it("should return styles that recommend portrait", () => {
      const styles = getRecommendedStylesForAspectRatio("portrait");
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
      styles.forEach((style) => {
        expect(STYLE_PRESETS[style].recommendedAspectRatios).toContain("portrait");
      });
    });
  });

  describe("Landscape aspect ratio", () => {
    it("should return styles that recommend landscape", () => {
      const styles = getRecommendedStylesForAspectRatio("landscape");
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
    });
  });

  describe("Panoramic aspect ratio", () => {
    it("should return styles that recommend panoramic", () => {
      const styles = getRecommendedStylesForAspectRatio("panoramic");
      expect(Array.isArray(styles)).toBe(true);
      // Panoramic may have fewer recommendations
    });
  });
});

describe("getStylesByCategory", () => {
  describe("Artistic category", () => {
    it("should return only artistic styles", () => {
      const styles = getStylesByCategory("artistic");
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
      styles.forEach((style) => {
        expect(style.category).toBe("artistic");
      });
    });
  });

  describe("Photographic category", () => {
    it("should return only photographic styles", () => {
      const styles = getStylesByCategory("photographic");
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
      styles.forEach((style) => {
        expect(style.category).toBe("photographic");
      });
    });
  });

  describe("Illustrative category", () => {
    it("should return only illustrative styles", () => {
      const styles = getStylesByCategory("illustrative");
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
      styles.forEach((style) => {
        expect(style.category).toBe("illustrative");
      });
    });
  });

  describe("Decorative category", () => {
    it("should return only decorative styles", () => {
      const styles = getStylesByCategory("decorative");
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
      styles.forEach((style) => {
        expect(style.category).toBe("decorative");
      });
    });
  });

  describe("Category totals", () => {
    it("should sum to total number of presets", () => {
      const artistic = getStylesByCategory("artistic");
      const photographic = getStylesByCategory("photographic");
      const illustrative = getStylesByCategory("illustrative");
      const decorative = getStylesByCategory("decorative");
      const total = artistic.length + photographic.length + illustrative.length + decorative.length;
      expect(total).toBe(15);
    });
  });
});

describe("getAvailableStyles", () => {
  describe("Without premium", () => {
    it("should return only non-premium styles by default", () => {
      const styles = getAvailableStyles();
      expect(Array.isArray(styles)).toBe(true);
      styles.forEach((style) => {
        expect(style.isPremium).toBe(false);
      });
    });

    it("should return only non-premium styles with includePremium=false", () => {
      const styles = getAvailableStyles(false);
      expect(Array.isArray(styles)).toBe(true);
      styles.forEach((style) => {
        expect(style.isPremium).toBe(false);
      });
    });
  });

  describe("With premium", () => {
    it("should return all styles with includePremium=true", () => {
      const styles = getAvailableStyles(true);
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBe(15); // All presets
    });

    it("should include premium styles when requested", () => {
      const styles = getAvailableStyles(true);
      const hasPremium = styles.some((style) => style.isPremium);
      expect(hasPremium).toBe(true);
    });
  });
});

describe("searchStylePresets", () => {
  describe("Search by name", () => {
    it("should find wabi-sabi by name", () => {
      const results = searchStylePresets("wabi");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.id === "wabi-sabi")).toBe(true);
    });

    it("should find botanical by name", () => {
      const results = searchStylePresets("botanical");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.id === "botanical")).toBe(true);
    });
  });

  describe("Search by description", () => {
    it('should find styles with "minimalist" in description', () => {
      const results = searchStylePresets("minimalist");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should find styles with "bold" in description', () => {
      const results = searchStylePresets("bold");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Search by keyword", () => {
    it('should find styles with "modern" keyword', () => {
      const results = searchStylePresets("modern");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should find styles with "organic" keyword', () => {
      const results = searchStylePresets("organic");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Case insensitive search", () => {
    it("should find styles regardless of case", () => {
      const lowerResults = searchStylePresets("botanical");
      const upperResults = searchStylePresets("BOTANICAL");
      const mixedResults = searchStylePresets("BotaNiCal");
      expect(lowerResults.length).toBe(upperResults.length);
      expect(lowerResults.length).toBe(mixedResults.length);
    });
  });

  describe("Empty results", () => {
    it("should return empty array for no matches", () => {
      const results = searchStylePresets("xyznonsense123");
      expect(results).toEqual([]);
    });
  });
});

// ============================================================================
// Validation Function Tests
// ============================================================================

describe("isValidStylePreset", () => {
  describe("Valid presets", () => {
    const validPresets: AIStylePreset[] = [
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
      "ink-wash",
      "digital-art",
      "minimalist-modern",
      "impressionist",
      "art-deco",
    ];

    validPresets.forEach((preset) => {
      it(`should return true for ${preset}`, () => {
        expect(isValidStylePreset(preset)).toBe(true);
      });
    });
  });

  describe("Invalid presets", () => {
    const invalidPresets = ["invalid", "random", "", "wabi_sabi", "WABI-SABI", "undefined"];

    invalidPresets.forEach((preset) => {
      it(`should return false for "${preset}"`, () => {
        expect(isValidStylePreset(preset)).toBe(false);
      });
    });
  });
});

describe("isValidAspectRatio", () => {
  describe("Valid aspect ratios", () => {
    const validRatios: AIAspectRatio[] = ["square", "portrait", "landscape", "panoramic"];

    validRatios.forEach((ratio) => {
      it(`should return true for ${ratio}`, () => {
        expect(isValidAspectRatio(ratio)).toBe(true);
      });
    });
  });

  describe("Invalid aspect ratios", () => {
    const invalidRatios = ["invalid", "widescreen", "16:9", "", "SQUARE", "vertical"];

    invalidRatios.forEach((ratio) => {
      it(`should return false for "${ratio}"`, () => {
        expect(isValidAspectRatio(ratio)).toBe(false);
      });
    });
  });
});

describe("isValidColorMood", () => {
  describe("Valid color moods", () => {
    const validMoods = [
      "warm",
      "cool",
      "neutral",
      "vibrant",
      "muted",
      "monochrome",
      "earth-tones",
      "pastel",
    ];

    validMoods.forEach((mood) => {
      it(`should return true for ${mood}`, () => {
        expect(isValidColorMood(mood)).toBe(true);
      });
    });
  });

  describe("Invalid color moods", () => {
    const invalidMoods = ["invalid", "hot", "cold", "", "WARM", "earthy", "rainbow"];

    invalidMoods.forEach((mood) => {
      it(`should return false for "${mood}"`, () => {
        expect(isValidColorMood(mood)).toBe(false);
      });
    });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe("Type Guards", () => {
  describe("AIStylePreset type guard", () => {
    it("should narrow type for valid preset", () => {
      const input = "wabi-sabi";
      if (isValidStylePreset(input)) {
        // Type should be narrowed to AIStylePreset
        const preset: AIStylePreset = input;
        expect(STYLE_PRESETS[preset]).toBeDefined();
      }
    });
  });

  describe("AIAspectRatio type guard", () => {
    it("should narrow type for valid ratio", () => {
      const input = "square";
      if (isValidAspectRatio(input)) {
        // Type should be narrowed to AIAspectRatio
        const ratio: AIAspectRatio = input;
        expect(ASPECT_RATIOS[ratio]).toBeDefined();
      }
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration Tests", () => {
  describe("Full generation workflow", () => {
    it("should create complete generation configuration", () => {
      const userPrompt = "A serene mountain landscape at sunset";
      const stylePreset: AIStylePreset = "photography";
      const aspectRatio: AIAspectRatio = "landscape";
      const colorMood = "warm";
      const provider: AIModelProvider = "stable-diffusion";

      // Validate inputs
      expect(isValidStylePreset(stylePreset)).toBe(true);
      expect(isValidAspectRatio(aspectRatio)).toBe(true);
      expect(isValidColorMood(colorMood)).toBe(true);

      // Get configuration
      const enhancedPrompt = constructEnhancedPrompt(userPrompt, stylePreset, { colorMood });
      const negativePrompt = constructNegativePrompt(stylePreset);
      const dimensions = getImageDimensions(aspectRatio, provider);
      const modelParams = getModelParameters(stylePreset);

      // Verify configuration
      expect(enhancedPrompt).toContain(userPrompt);
      expect(negativePrompt.length).toBeGreaterThan(0);
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.height).toBeGreaterThan(0);
      expect(modelParams.cfgScale).toBeGreaterThan(0);
    });
  });

  describe("Style preset discovery workflow", () => {
    it("should find and validate style for specific needs", () => {
      // User wants a style with square aspect ratio
      const recommendedStyles = getRecommendedStylesForAspectRatio("square");
      expect(recommendedStyles.length).toBeGreaterThan(0);

      // Get non-premium options
      const availableStyles = getAvailableStyles(false);
      const nonPremiumRecommended = recommendedStyles.filter((style) =>
        availableStyles.some((s) => s.id === style)
      );
      expect(nonPremiumRecommended.length).toBeGreaterThan(0);

      // Get first valid style
      const chosenStyle = nonPremiumRecommended[0];
      expect(isValidStylePreset(chosenStyle)).toBe(true);
    });
  });

  describe("Search and apply workflow", () => {
    it("should search, select, and apply a style preset", () => {
      // Search for minimalist styles
      const searchResults = searchStylePresets("minimal");
      expect(searchResults.length).toBeGreaterThan(0);

      // Select first result
      const selectedStyle = searchResults[0];
      expect(isValidStylePreset(selectedStyle.id)).toBe(true);

      // Apply to a prompt
      const prompt = "A zen garden";
      const enhanced = constructEnhancedPrompt(prompt, selectedStyle.id);
      expect(enhanced).toContain(prompt);
      expect(enhanced.length).toBeGreaterThan(prompt.length);
    });
  });
});

// ============================================================================
// Edge Cases and Boundary Tests
// ============================================================================

describe("Edge Cases", () => {
  describe("Empty inputs", () => {
    it("should handle empty user prompt", () => {
      const result = constructEnhancedPrompt("", "wabi-sabi");
      expect(result).toContain(STYLE_PRESETS["wabi-sabi"].promptModifiers);
    });

    it("should handle empty search term", () => {
      const results = searchStylePresets("");
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Special characters", () => {
    it("should handle prompts with special characters", () => {
      const prompt = 'A "beautiful" sunset & mountains <with> [brackets]';
      const result = constructEnhancedPrompt(prompt, "photography");
      expect(result).toContain(prompt);
    });
  });

  describe("Long inputs", () => {
    it("should handle very long prompts", () => {
      const longPrompt = "A ".repeat(500) + "beautiful sunset";
      const result = constructEnhancedPrompt(longPrompt, "watercolor");
      expect(result).toContain("beautiful sunset");
    });
  });

  describe("Unicode characters", () => {
    it("should handle prompts with unicode", () => {
      const prompt = "A beautiful 日本 山 风景 🏔️";
      const result = constructEnhancedPrompt(prompt, "wabi-sabi");
      expect(result).toContain(prompt);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Performance", () => {
  it("should construct enhanced prompt quickly", () => {
    const iterations = 1000;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      constructEnhancedPrompt("Test prompt", "photography", {
        colorMood: "warm",
        colorPalette: ["#FF0000", "#00FF00"],
      });
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Should complete in under 100ms
  });

  it("should validate presets quickly", () => {
    const iterations = 10000;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      isValidStylePreset("wabi-sabi");
      isValidAspectRatio("square");
      isValidColorMood("warm");
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // Should complete in under 50ms
  });

  it("should search presets quickly", () => {
    const iterations = 100;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      searchStylePresets("minimal");
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Should complete in under 100ms
  });
});
