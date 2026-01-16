/**
 * Style Constants Tests
 *
 * Comprehensive tests for AI art style presets including:
 * - Style presets
 * - Style categories
 * - Helper functions
 * - Generation parameters
 * - Samplers
 */

import { describe, it, expect } from 'vitest';
import {
  STYLE_PRESETS,
  STYLE_CATEGORIES,
  STYLE_CONSTRAINTS,
  AVAILABLE_SAMPLERS,
  getStylePresetById,
  getStyleCategoryById,
  getActiveStylePresets,
  getStylesByCategory,
  isValidStylePreset,
  type StylePresetConfig,
  type StyleCategory,
  type Sampler,
} from '../../src/constants/styles.js';

describe('STYLE_PRESETS constant', () => {
  it('should have exactly 10 style presets defined', () => {
    expect(STYLE_PRESETS.length).toBe(10);
  });

  it('should have unique IDs for all presets', () => {
    const ids = STYLE_PRESETS.map((style) => style.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(STYLE_PRESETS.length);
  });

  it('should have unique names for all presets', () => {
    const names = STYLE_PRESETS.map((style) => style.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(STYLE_PRESETS.length);
  });

  it('should have descriptions for all presets', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.description).toBeTruthy();
      expect(style.description.length).toBeGreaterThan(20);
    });
  });

  it('should have prompt modifiers for all presets', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.promptModifiers).toBeTruthy();
      expect(style.promptModifiers.length).toBeGreaterThan(20);
    });
  });

  it('should have negative prompts for all presets', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.negativePrompt).toBeTruthy();
      expect(style.negativePrompt.length).toBeGreaterThan(10);
    });
  });

  it('should have valid CFG scale for all presets', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.cfgScale).toBeGreaterThanOrEqual(STYLE_CONSTRAINTS.MIN_CFG_SCALE);
      expect(style.cfgScale).toBeLessThanOrEqual(STYLE_CONSTRAINTS.MAX_CFG_SCALE);
    });
  });

  it('should have sampler defined for all presets', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.sampler).toBeTruthy();
      expect(AVAILABLE_SAMPLERS).toContain(style.sampler as Sampler);
    });
  });

  it('should have valid categories for all presets', () => {
    const validCategories = ['modern', 'traditional', 'abstract', 'nature', 'minimalist'];

    STYLE_PRESETS.forEach((style) => {
      expect(validCategories).toContain(style.category);
    });
  });

  it('should have consistent display order (no duplicates)', () => {
    const orders = STYLE_PRESETS.map((style) => style.displayOrder);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(STYLE_PRESETS.length);
  });

  it('should have at least one active preset', () => {
    const activePresets = STYLE_PRESETS.filter((style) => style.isActive);
    expect(activePresets.length).toBeGreaterThan(0);
  });

  it('should have display order from 1 to N', () => {
    const orders = STYLE_PRESETS.map((style) => style.displayOrder).sort((a, b) => a - b);
    expect(orders[0]).toBe(1);
    expect(orders[orders.length - 1]).toBe(STYLE_PRESETS.length);
  });
});

describe('Specific style presets', () => {
  it('should have wabi-sabi style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'wabi-sabi');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Wabi-Sabi');
    expect(style?.category).toBe('minimalist');
  });

  it('should have abstract-expression style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'abstract-expression');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Abstract Expression');
    expect(style?.category).toBe('abstract');
  });

  it('should have botanical style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'botanical');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Botanical');
    expect(style?.category).toBe('nature');
  });

  it('should have vintage-poster style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'vintage-poster');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Vintage Poster');
    expect(style?.category).toBe('traditional');
  });

  it('should have minimalist style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'minimalist');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Minimalist');
    expect(style?.category).toBe('minimalist');
  });

  it('should have geometric style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'geometric');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Geometric');
    expect(style?.category).toBe('modern');
  });

  it('should have watercolor style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'watercolor');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Watercolor');
    expect(style?.category).toBe('traditional');
  });

  it('should have line-art style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'line-art');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Line Art');
    expect(style?.category).toBe('minimalist');
  });

  it('should have pop-art style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'pop-art');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Pop Art');
    expect(style?.category).toBe('modern');
  });

  it('should have surrealism style', () => {
    const style = STYLE_PRESETS.find((s) => s.id === 'surrealism');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Surrealism');
    expect(style?.category).toBe('abstract');
  });
});

describe('Style preset content validation', () => {
  it('should have prompt modifiers with multiple keywords', () => {
    STYLE_PRESETS.forEach((style) => {
      const keywords = style.promptModifiers.split(',');
      expect(keywords.length).toBeGreaterThan(3);
    });
  });

  it('should have negative prompts with multiple keywords', () => {
    STYLE_PRESETS.forEach((style) => {
      const keywords = style.negativePrompt.split(',');
      expect(keywords.length).toBeGreaterThan(2);
    });
  });

  it('should have thumbnail URLs in correct format', () => {
    STYLE_PRESETS.forEach((style) => {
      if (style.thumbnailUrl) {
        expect(style.thumbnailUrl).toMatch(/^https?:\/\/.+/);
        expect(style.thumbnailUrl).toContain('cdn.masonart.com');
      }
    });
  });

  it('should have example images in correct format', () => {
    STYLE_PRESETS.forEach((style) => {
      if (style.exampleImages) {
        expect(style.exampleImages.length).toBeLessThanOrEqual(5);
        style.exampleImages.forEach((url) => {
          expect(url).toMatch(/^https?:\/\/.+/);
          expect(url).toContain('cdn.masonart.com');
        });
      }
    });
  });

  it('should have prompt modifiers within length constraint', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.promptModifiers.length).toBeLessThanOrEqual(
        STYLE_CONSTRAINTS.MAX_PROMPT_LENGTH
      );
    });
  });

  it('should have negative prompts within length constraint', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.negativePrompt.length).toBeLessThanOrEqual(
        STYLE_CONSTRAINTS.MAX_NEGATIVE_PROMPT_LENGTH
      );
    });
  });
});

describe('STYLE_CATEGORIES constant', () => {
  it('should have exactly 5 categories defined', () => {
    expect(STYLE_CATEGORIES.length).toBe(5);
  });

  it('should have unique IDs for all categories', () => {
    const ids = STYLE_CATEGORIES.map((cat) => cat.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(STYLE_CATEGORIES.length);
  });

  it('should have descriptions for all categories', () => {
    STYLE_CATEGORIES.forEach((category) => {
      expect(category.description).toBeTruthy();
      expect(category.description.length).toBeGreaterThan(10);
    });
  });

  it('should have at least one style in each category', () => {
    STYLE_CATEGORIES.forEach((category) => {
      expect(category.styles.length).toBeGreaterThan(0);
    });
  });

  it('should reference valid style IDs', () => {
    const validStyleIds = STYLE_PRESETS.map((s) => s.id);

    STYLE_CATEGORIES.forEach((category) => {
      category.styles.forEach((styleId) => {
        expect(validStyleIds).toContain(styleId);
      });
    });
  });
});

describe('Specific categories', () => {
  it('should have modern category', () => {
    const category = STYLE_CATEGORIES.find((c) => c.id === 'modern');
    expect(category).toBeDefined();
    expect(category?.name).toBe('Modern');
    expect(category?.styles).toContain('geometric');
    expect(category?.styles).toContain('pop-art');
  });

  it('should have traditional category', () => {
    const category = STYLE_CATEGORIES.find((c) => c.id === 'traditional');
    expect(category).toBeDefined();
    expect(category?.name).toBe('Traditional');
    expect(category?.styles).toContain('vintage-poster');
    expect(category?.styles).toContain('watercolor');
  });

  it('should have abstract category', () => {
    const category = STYLE_CATEGORIES.find((c) => c.id === 'abstract');
    expect(category).toBeDefined();
    expect(category?.name).toBe('Abstract');
    expect(category?.styles).toContain('abstract-expression');
    expect(category?.styles).toContain('surrealism');
  });

  it('should have nature category', () => {
    const category = STYLE_CATEGORIES.find((c) => c.id === 'nature');
    expect(category).toBeDefined();
    expect(category?.name).toBe('Nature');
    expect(category?.styles).toContain('botanical');
  });

  it('should have minimalist category', () => {
    const category = STYLE_CATEGORIES.find((c) => c.id === 'minimalist');
    expect(category).toBeDefined();
    expect(category?.name).toBe('Minimalist');
    expect(category?.styles).toContain('wabi-sabi');
    expect(category?.styles).toContain('minimalist');
    expect(category?.styles).toContain('line-art');
  });
});

describe('getStylePresetById helper', () => {
  it('should return style for valid ID', () => {
    const style = getStylePresetById('wabi-sabi');
    expect(style).toBeDefined();
    expect(style?.id).toBe('wabi-sabi');
    expect(style?.name).toBe('Wabi-Sabi');
  });

  it('should return style for geometric', () => {
    const style = getStylePresetById('geometric');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Geometric');
  });

  it('should return undefined for invalid ID', () => {
    const style = getStylePresetById('invalid-style-id');
    expect(style).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    const style = getStylePresetById('');
    expect(style).toBeUndefined();
  });
});

describe('getStyleCategoryById helper', () => {
  it('should return category for valid ID', () => {
    const category = getStyleCategoryById('modern');
    expect(category).toBeDefined();
    expect(category?.id).toBe('modern');
    expect(category?.name).toBe('Modern');
  });

  it('should return category for minimalist', () => {
    const category = getStyleCategoryById('minimalist');
    expect(category).toBeDefined();
    expect(category?.name).toBe('Minimalist');
  });

  it('should return undefined for invalid ID', () => {
    const category = getStyleCategoryById('invalid-category-id');
    expect(category).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    const category = getStyleCategoryById('');
    expect(category).toBeUndefined();
  });
});

describe('getActiveStylePresets helper', () => {
  it('should return only active presets', () => {
    const activePresets = getActiveStylePresets();
    expect(activePresets.length).toBeGreaterThan(0);

    activePresets.forEach((style) => {
      expect(style.isActive).toBe(true);
    });
  });

  it('should return all presets if all are active', () => {
    const activePresets = getActiveStylePresets();
    expect(activePresets.length).toBe(STYLE_PRESETS.length);
  });

  it('should include wabi-sabi in active presets', () => {
    const activePresets = getActiveStylePresets();
    const activeIds = activePresets.map((s) => s.id);
    expect(activeIds).toContain('wabi-sabi');
  });
});

describe('getStylesByCategory helper', () => {
  it('should return styles for modern category', () => {
    const styles = getStylesByCategory('modern');
    expect(styles.length).toBeGreaterThan(0);

    styles.forEach((style) => {
      expect(style.category).toBe('modern');
    });
  });

  it('should return styles for minimalist category', () => {
    const styles = getStylesByCategory('minimalist');
    expect(styles.length).toBeGreaterThan(0);

    styles.forEach((style) => {
      expect(style.category).toBe('minimalist');
    });

    const styleIds = styles.map((s) => s.id);
    expect(styleIds).toContain('wabi-sabi');
    expect(styleIds).toContain('minimalist');
    expect(styleIds).toContain('line-art');
  });

  it('should return styles for traditional category', () => {
    const styles = getStylesByCategory('traditional');
    expect(styles.length).toBeGreaterThan(0);

    const styleIds = styles.map((s) => s.id);
    expect(styleIds).toContain('vintage-poster');
    expect(styleIds).toContain('watercolor');
  });

  it('should return empty array for invalid category', () => {
    const styles = getStylesByCategory('invalid-category');
    expect(styles).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    const styles = getStylesByCategory('');
    expect(styles).toEqual([]);
  });

  it('should return styles matching category definition', () => {
    STYLE_CATEGORIES.forEach((category) => {
      const styles = getStylesByCategory(category.id);
      const styleIds = styles.map((s) => s.id);

      // All styles in category definition should be returned
      category.styles.forEach((styleId) => {
        expect(styleIds).toContain(styleId);
      });
    });
  });
});

describe('isValidStylePreset helper', () => {
  it('should validate existing style IDs', () => {
    expect(isValidStylePreset('wabi-sabi')).toBe(true);
    expect(isValidStylePreset('geometric')).toBe(true);
    expect(isValidStylePreset('pop-art')).toBe(true);
    expect(isValidStylePreset('botanical')).toBe(true);
  });

  it('should invalidate non-existing style IDs', () => {
    expect(isValidStylePreset('invalid-style')).toBe(false);
    expect(isValidStylePreset('random-id')).toBe(false);
  });

  it('should invalidate empty string', () => {
    expect(isValidStylePreset('')).toBe(false);
  });

  it('should invalidate similar but incorrect IDs', () => {
    expect(isValidStylePreset('wabi_sabi')).toBe(false); // underscore instead of dash
    expect(isValidStylePreset('WabiSabi')).toBe(false); // different case
    expect(isValidStylePreset('wabi-sabi ')).toBe(false); // trailing space
  });
});

describe('STYLE_CONSTRAINTS constant', () => {
  it('should have minimum CFG scale', () => {
    expect(STYLE_CONSTRAINTS.MIN_CFG_SCALE).toBe(1);
  });

  it('should have maximum CFG scale', () => {
    expect(STYLE_CONSTRAINTS.MAX_CFG_SCALE).toBe(20);
  });

  it('should have default CFG scale', () => {
    expect(STYLE_CONSTRAINTS.DEFAULT_CFG_SCALE).toBe(7.5);
  });

  it('should have minimum steps', () => {
    expect(STYLE_CONSTRAINTS.MIN_STEPS).toBe(20);
  });

  it('should have maximum steps', () => {
    expect(STYLE_CONSTRAINTS.MAX_STEPS).toBe(150);
  });

  it('should have default steps', () => {
    expect(STYLE_CONSTRAINTS.DEFAULT_STEPS).toBe(50);
  });

  it('should have maximum prompt length', () => {
    expect(STYLE_CONSTRAINTS.MAX_PROMPT_LENGTH).toBe(1000);
  });

  it('should have maximum negative prompt length', () => {
    expect(STYLE_CONSTRAINTS.MAX_NEGATIVE_PROMPT_LENGTH).toBe(1000);
  });

  it('should have logical constraints (min < default < max)', () => {
    expect(STYLE_CONSTRAINTS.MIN_CFG_SCALE).toBeLessThan(
      STYLE_CONSTRAINTS.DEFAULT_CFG_SCALE
    );
    expect(STYLE_CONSTRAINTS.DEFAULT_CFG_SCALE).toBeLessThan(
      STYLE_CONSTRAINTS.MAX_CFG_SCALE
    );

    expect(STYLE_CONSTRAINTS.MIN_STEPS).toBeLessThan(STYLE_CONSTRAINTS.DEFAULT_STEPS);
    expect(STYLE_CONSTRAINTS.DEFAULT_STEPS).toBeLessThan(STYLE_CONSTRAINTS.MAX_STEPS);
  });

  it('should have all preset CFG scales within constraints', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.cfgScale).toBeGreaterThanOrEqual(STYLE_CONSTRAINTS.MIN_CFG_SCALE);
      expect(style.cfgScale).toBeLessThanOrEqual(STYLE_CONSTRAINTS.MAX_CFG_SCALE);
    });
  });
});

describe('AVAILABLE_SAMPLERS constant', () => {
  it('should have at least 5 samplers available', () => {
    expect(AVAILABLE_SAMPLERS.length).toBeGreaterThanOrEqual(5);
  });

  it('should have unique sampler names', () => {
    const uniqueSamplers = new Set(AVAILABLE_SAMPLERS);
    expect(uniqueSamplers.size).toBe(AVAILABLE_SAMPLERS.length);
  });

  it('should include common samplers', () => {
    expect(AVAILABLE_SAMPLERS).toContain('Euler a');
    expect(AVAILABLE_SAMPLERS).toContain('DPM++ 2M Karras');
    expect(AVAILABLE_SAMPLERS).toContain('DDIM');
  });

  it('should have all preset samplers in available list', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(AVAILABLE_SAMPLERS).toContain(style.sampler as Sampler);
    });
  });
});

describe('CFG scale distribution', () => {
  it('should have variety in CFG scales across presets', () => {
    const cfgScales = STYLE_PRESETS.map((s) => s.cfgScale);
    const uniqueScales = new Set(cfgScales);
    expect(uniqueScales.size).toBeGreaterThan(2);
  });

  it('should have CFG scales in reasonable range', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style.cfgScale).toBeGreaterThanOrEqual(6.0);
      expect(style.cfgScale).toBeLessThanOrEqual(9.0);
    });
  });
});

describe('Sampler distribution', () => {
  it('should use DPM++ 2M Karras for multiple presets', () => {
    const dpmPresets = STYLE_PRESETS.filter((s) => s.sampler === 'DPM++ 2M Karras');
    expect(dpmPresets.length).toBeGreaterThan(0);
  });

  it('should use Euler a for multiple presets', () => {
    const eulerPresets = STYLE_PRESETS.filter((s) => s.sampler === 'Euler a');
    expect(eulerPresets.length).toBeGreaterThan(0);
  });
});

describe('Type structure validation', () => {
  it('should have all required fields in StylePreset', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(style).toHaveProperty('id');
      expect(style).toHaveProperty('name');
      expect(style).toHaveProperty('description');
      expect(style).toHaveProperty('promptModifiers');
      expect(style).toHaveProperty('negativePrompt');
      expect(style).toHaveProperty('cfgScale');
      expect(style).toHaveProperty('sampler');
      expect(style).toHaveProperty('isActive');
      expect(style).toHaveProperty('category');
      expect(style).toHaveProperty('displayOrder');
    });
  });

  it('should have all required fields in StyleCategory', () => {
    STYLE_CATEGORIES.forEach((category) => {
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('name');
      expect(category).toHaveProperty('description');
      expect(category).toHaveProperty('styles');
    });
  });

  it('should have correct field types in StylePreset', () => {
    STYLE_PRESETS.forEach((style) => {
      expect(typeof style.id).toBe('string');
      expect(typeof style.name).toBe('string');
      expect(typeof style.description).toBe('string');
      expect(typeof style.promptModifiers).toBe('string');
      expect(typeof style.negativePrompt).toBe('string');
      expect(typeof style.cfgScale).toBe('number');
      expect(typeof style.sampler).toBe('string');
      expect(typeof style.isActive).toBe('boolean');
      expect(typeof style.category).toBe('string');
      expect(typeof style.displayOrder).toBe('number');
    });
  });
});
