/**
 * Size Constants Tests
 *
 * Comprehensive tests for poster size constants including:
 * - Square, portrait-landscape, and panoramic size arrays
 * - ALL_SIZES combined array
 * - Lookup maps (SIZE_BY_ID, SIZES_BY_TIER, SIZES_BY_CATEGORY)
 * - Helper functions (getSizeById, getSizesByTier, etc.)
 * - Default values and popular sizes
 */

import { describe, it, expect } from 'vitest';
import {
  // Size arrays
  SQUARE_SIZES,
  PORTRAIT_LANDSCAPE_SIZES,
  PANORAMIC_SIZES,
  ALL_SIZES,
  // Lookup maps
  SIZE_BY_ID,
  SIZES_BY_TIER,
  SIZES_BY_CATEGORY,
  // Helper functions
  getSizeById,
  getSizesByTier,
  getSizesByCategory,
  isValidSizeId,
  getAspectRatio,
  isSquareSize,
  getSizesForOrientation,
  // Constants
  DEFAULT_SIZE_ID,
  SMALLEST_SIZE,
  LARGEST_SIZE,
  POPULAR_SIZES,
} from '../../src/constants/sizes.js';

// ============================================================================
// Square Sizes Tests
// ============================================================================

describe('SQUARE_SIZES constant', () => {
  it('should have 8 square sizes defined', () => {
    expect(SQUARE_SIZES.length).toBe(8);
  });

  it('should have all sizes with equal width and height', () => {
    SQUARE_SIZES.forEach((size) => {
      expect(size.widthInches).toBe(size.heightInches);
    });
  });

  it('should have unique IDs for all sizes', () => {
    const ids = SQUARE_SIZES.map((size) => size.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(SQUARE_SIZES.length);
  });

  it('should have IDs starting with "square-"', () => {
    SQUARE_SIZES.forEach((size) => {
      expect(size.id).toMatch(/^square-\d+x\d+$/);
    });
  });

  it('should have category set to "square"', () => {
    SQUARE_SIZES.forEach((size) => {
      expect(size.category).toBe('square');
    });
  });

  it('should have valid price tiers (1-4)', () => {
    SQUARE_SIZES.forEach((size) => {
      expect(size.priceTier).toBeGreaterThanOrEqual(1);
      expect(size.priceTier).toBeLessThanOrEqual(4);
    });
  });

  it('should have correct display labels in inches format', () => {
    SQUARE_SIZES.forEach((size) => {
      expect(size.displayLabel).toBe(`${size.widthInches}" × ${size.heightInches}"`);
    });
  });

  it('should have metric display labels', () => {
    SQUARE_SIZES.forEach((size) => {
      expect(size.displayLabelMetric).toMatch(/^\d+ × \d+ cm$/);
    });
  });

  it('should have correct cm dimensions (approximately inches * 2.54)', () => {
    SQUARE_SIZES.forEach((size) => {
      const expectedCm = Math.round(size.widthInches * 2.54);
      expect(Math.abs(size.widthCm - expectedCm)).toBeLessThanOrEqual(1);
    });
  });

  it('should include standard square sizes', () => {
    const dimensions = SQUARE_SIZES.map((s) => s.widthInches);
    expect(dimensions).toContain(12);
    expect(dimensions).toContain(16);
    expect(dimensions).toContain(24);
    expect(dimensions).toContain(36);
  });
});

// ============================================================================
// Portrait/Landscape Sizes Tests
// ============================================================================

describe('PORTRAIT_LANDSCAPE_SIZES constant', () => {
  it('should have 8 portrait/landscape sizes defined', () => {
    expect(PORTRAIT_LANDSCAPE_SIZES.length).toBe(8);
  });

  it('should have all sizes with width less than height (portrait)', () => {
    PORTRAIT_LANDSCAPE_SIZES.forEach((size) => {
      expect(size.widthInches).toBeLessThan(size.heightInches);
    });
  });

  it('should have unique IDs for all sizes', () => {
    const ids = PORTRAIT_LANDSCAPE_SIZES.map((size) => size.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(PORTRAIT_LANDSCAPE_SIZES.length);
  });

  it('should have IDs starting with "portrait-landscape-"', () => {
    PORTRAIT_LANDSCAPE_SIZES.forEach((size) => {
      expect(size.id).toMatch(/^portrait-landscape-\d+x\d+$/);
    });
  });

  it('should have category set to "portrait-landscape"', () => {
    PORTRAIT_LANDSCAPE_SIZES.forEach((size) => {
      expect(size.category).toBe('portrait-landscape');
    });
  });

  it('should have valid price tiers (1-4)', () => {
    PORTRAIT_LANDSCAPE_SIZES.forEach((size) => {
      expect(size.priceTier).toBeGreaterThanOrEqual(1);
      expect(size.priceTier).toBeLessThanOrEqual(4);
    });
  });

  it('should include common portrait sizes', () => {
    const findSize = (w: number, h: number) =>
      PORTRAIT_LANDSCAPE_SIZES.find((s) => s.widthInches === w && s.heightInches === h);

    expect(findSize(12, 16)).toBeDefined();
    expect(findSize(16, 20)).toBeDefined();
    expect(findSize(18, 24)).toBeDefined();
    expect(findSize(24, 36)).toBeDefined();
  });
});

// ============================================================================
// Panoramic Sizes Tests
// ============================================================================

describe('PANORAMIC_SIZES constant', () => {
  it('should have 4 panoramic sizes defined', () => {
    expect(PANORAMIC_SIZES.length).toBe(4);
  });

  it('should have very wide aspect ratios (width << height)', () => {
    PANORAMIC_SIZES.forEach((size) => {
      // Panoramic sizes have height at least 2x width
      expect(size.heightInches).toBeGreaterThanOrEqual(size.widthInches * 2);
    });
  });

  it('should have unique IDs for all sizes', () => {
    const ids = PANORAMIC_SIZES.map((size) => size.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(PANORAMIC_SIZES.length);
  });

  it('should have IDs starting with "panoramic-"', () => {
    PANORAMIC_SIZES.forEach((size) => {
      expect(size.id).toMatch(/^panoramic-\d+x\d+$/);
    });
  });

  it('should have category set to "panoramic"', () => {
    PANORAMIC_SIZES.forEach((size) => {
      expect(size.category).toBe('panoramic');
    });
  });

  it('should have valid price tiers (2-4)', () => {
    PANORAMIC_SIZES.forEach((size) => {
      expect(size.priceTier).toBeGreaterThanOrEqual(2);
      expect(size.priceTier).toBeLessThanOrEqual(4);
    });
  });

  it('should include expected panoramic sizes', () => {
    const findSize = (w: number, h: number) =>
      PANORAMIC_SIZES.find((s) => s.widthInches === w && s.heightInches === h);

    expect(findSize(12, 36)).toBeDefined();
    expect(findSize(16, 48)).toBeDefined();
    expect(findSize(24, 72)).toBeDefined();
  });
});

// ============================================================================
// ALL_SIZES Tests
// ============================================================================

describe('ALL_SIZES constant', () => {
  it('should combine all size categories', () => {
    const expectedLength =
      SQUARE_SIZES.length + PORTRAIT_LANDSCAPE_SIZES.length + PANORAMIC_SIZES.length;
    expect(ALL_SIZES.length).toBe(expectedLength);
  });

  it('should have 20 total sizes', () => {
    expect(ALL_SIZES.length).toBe(20);
  });

  it('should have unique IDs across all sizes', () => {
    const ids = ALL_SIZES.map((size) => size.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ALL_SIZES.length);
  });

  it('should include all square sizes', () => {
    SQUARE_SIZES.forEach((squareSize) => {
      expect(ALL_SIZES).toContainEqual(squareSize);
    });
  });

  it('should include all portrait/landscape sizes', () => {
    PORTRAIT_LANDSCAPE_SIZES.forEach((plSize) => {
      expect(ALL_SIZES).toContainEqual(plSize);
    });
  });

  it('should include all panoramic sizes', () => {
    PANORAMIC_SIZES.forEach((panoramicSize) => {
      expect(ALL_SIZES).toContainEqual(panoramicSize);
    });
  });

  it('should have all required fields for each size', () => {
    ALL_SIZES.forEach((size) => {
      expect(size).toHaveProperty('id');
      expect(size).toHaveProperty('widthInches');
      expect(size).toHaveProperty('heightInches');
      expect(size).toHaveProperty('widthCm');
      expect(size).toHaveProperty('heightCm');
      expect(size).toHaveProperty('priceTier');
      expect(size).toHaveProperty('category');
      expect(size).toHaveProperty('displayLabel');
      expect(size).toHaveProperty('displayLabelMetric');
    });
  });
});

// ============================================================================
// SIZE_BY_ID Map Tests
// ============================================================================

describe('SIZE_BY_ID map', () => {
  it('should be a Map with all sizes', () => {
    expect(SIZE_BY_ID).toBeInstanceOf(Map);
    expect(SIZE_BY_ID.size).toBe(ALL_SIZES.length);
  });

  it('should allow O(1) lookup by ID', () => {
    const size = SIZE_BY_ID.get('square-16x16');
    expect(size).toBeDefined();
    expect(size?.widthInches).toBe(16);
    expect(size?.heightInches).toBe(16);
  });

  it('should return undefined for invalid IDs', () => {
    expect(SIZE_BY_ID.get('invalid-id')).toBeUndefined();
    expect(SIZE_BY_ID.get('')).toBeUndefined();
  });

  it('should have correct size objects for all entries', () => {
    SIZE_BY_ID.forEach((size, id) => {
      expect(size.id).toBe(id);
    });
  });
});

// ============================================================================
// SIZES_BY_TIER Map Tests
// ============================================================================

describe('SIZES_BY_TIER map', () => {
  it('should be a Map with 4 tiers', () => {
    expect(SIZES_BY_TIER).toBeInstanceOf(Map);
    expect(SIZES_BY_TIER.size).toBe(4);
  });

  it('should have tiers 1 through 4', () => {
    expect(SIZES_BY_TIER.has(1)).toBe(true);
    expect(SIZES_BY_TIER.has(2)).toBe(true);
    expect(SIZES_BY_TIER.has(3)).toBe(true);
    expect(SIZES_BY_TIER.has(4)).toBe(true);
  });

  it('should have sizes in each tier', () => {
    for (let tier = 1; tier <= 4; tier++) {
      const tierSizes = SIZES_BY_TIER.get(tier as 1 | 2 | 3 | 4);
      expect(tierSizes).toBeDefined();
      expect(tierSizes!.length).toBeGreaterThan(0);
    }
  });

  it('should have sizes correctly assigned to tiers', () => {
    SIZES_BY_TIER.forEach((sizes, tier) => {
      sizes.forEach((size) => {
        expect(size.priceTier).toBe(tier);
      });
    });
  });

  it('should include all sizes across all tiers', () => {
    let totalSizes = 0;
    SIZES_BY_TIER.forEach((sizes) => {
      totalSizes += sizes.length;
    });
    expect(totalSizes).toBe(ALL_SIZES.length);
  });
});

// ============================================================================
// SIZES_BY_CATEGORY Map Tests
// ============================================================================

describe('SIZES_BY_CATEGORY map', () => {
  it('should be a Map with 3 categories', () => {
    expect(SIZES_BY_CATEGORY).toBeInstanceOf(Map);
    expect(SIZES_BY_CATEGORY.size).toBe(3);
  });

  it('should have all three categories', () => {
    expect(SIZES_BY_CATEGORY.has('square')).toBe(true);
    expect(SIZES_BY_CATEGORY.has('portrait-landscape')).toBe(true);
    expect(SIZES_BY_CATEGORY.has('panoramic')).toBe(true);
  });

  it('should map to correct size arrays', () => {
    expect(SIZES_BY_CATEGORY.get('square')).toBe(SQUARE_SIZES);
    expect(SIZES_BY_CATEGORY.get('portrait-landscape')).toBe(PORTRAIT_LANDSCAPE_SIZES);
    expect(SIZES_BY_CATEGORY.get('panoramic')).toBe(PANORAMIC_SIZES);
  });
});

// ============================================================================
// getSizeById Helper Tests
// ============================================================================

describe('getSizeById helper', () => {
  it('should return size for valid square ID', () => {
    const size = getSizeById('square-12x12');
    expect(size).toBeDefined();
    expect(size?.id).toBe('square-12x12');
    expect(size?.widthInches).toBe(12);
    expect(size?.heightInches).toBe(12);
  });

  it('should return size for valid portrait-landscape ID', () => {
    const size = getSizeById('portrait-landscape-16x20');
    expect(size).toBeDefined();
    expect(size?.widthInches).toBe(16);
    expect(size?.heightInches).toBe(20);
  });

  it('should return size for valid panoramic ID', () => {
    const size = getSizeById('panoramic-12x36');
    expect(size).toBeDefined();
    expect(size?.widthInches).toBe(12);
    expect(size?.heightInches).toBe(36);
  });

  it('should return undefined for invalid ID', () => {
    const size = getSizeById('invalid-size-id');
    expect(size).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    const size = getSizeById('');
    expect(size).toBeUndefined();
  });
});

// ============================================================================
// getSizesByTier Helper Tests
// ============================================================================

describe('getSizesByTier helper', () => {
  it('should return tier 1 sizes', () => {
    const tier1Sizes = getSizesByTier(1);
    expect(tier1Sizes.length).toBeGreaterThan(0);
    tier1Sizes.forEach((size) => {
      expect(size.priceTier).toBe(1);
    });
  });

  it('should return tier 2 sizes', () => {
    const tier2Sizes = getSizesByTier(2);
    expect(tier2Sizes.length).toBeGreaterThan(0);
    tier2Sizes.forEach((size) => {
      expect(size.priceTier).toBe(2);
    });
  });

  it('should return tier 3 sizes', () => {
    const tier3Sizes = getSizesByTier(3);
    expect(tier3Sizes.length).toBeGreaterThan(0);
    tier3Sizes.forEach((size) => {
      expect(size.priceTier).toBe(3);
    });
  });

  it('should return tier 4 sizes', () => {
    const tier4Sizes = getSizesByTier(4);
    expect(tier4Sizes.length).toBeGreaterThan(0);
    tier4Sizes.forEach((size) => {
      expect(size.priceTier).toBe(4);
    });
  });

  it('should return empty array for invalid tier', () => {
    const sizes = getSizesByTier(5 as 1 | 2 | 3 | 4);
    expect(sizes).toEqual([]);
  });
});

// ============================================================================
// getSizesByCategory Helper Tests
// ============================================================================

describe('getSizesByCategory helper', () => {
  it('should return square sizes for "square" category', () => {
    const sizes = getSizesByCategory('square');
    expect(sizes.length).toBe(SQUARE_SIZES.length);
    sizes.forEach((size) => {
      expect(size.category).toBe('square');
    });
  });

  it('should return portrait-landscape sizes', () => {
    const sizes = getSizesByCategory('portrait-landscape');
    expect(sizes.length).toBe(PORTRAIT_LANDSCAPE_SIZES.length);
    sizes.forEach((size) => {
      expect(size.category).toBe('portrait-landscape');
    });
  });

  it('should return panoramic sizes', () => {
    const sizes = getSizesByCategory('panoramic');
    expect(sizes.length).toBe(PANORAMIC_SIZES.length);
    sizes.forEach((size) => {
      expect(size.category).toBe('panoramic');
    });
  });

  it('should return empty array for invalid category', () => {
    const sizes = getSizesByCategory('invalid' as 'square' | 'portrait-landscape' | 'panoramic');
    expect(sizes).toEqual([]);
  });
});

// ============================================================================
// isValidSizeId Helper Tests
// ============================================================================

describe('isValidSizeId helper', () => {
  it('should return true for valid square size IDs', () => {
    expect(isValidSizeId('square-12x12')).toBe(true);
    expect(isValidSizeId('square-16x16')).toBe(true);
    expect(isValidSizeId('square-24x24')).toBe(true);
  });

  it('should return true for valid portrait-landscape IDs', () => {
    expect(isValidSizeId('portrait-landscape-16x20')).toBe(true);
    expect(isValidSizeId('portrait-landscape-18x24')).toBe(true);
    expect(isValidSizeId('portrait-landscape-24x36')).toBe(true);
  });

  it('should return true for valid panoramic IDs', () => {
    expect(isValidSizeId('panoramic-12x36')).toBe(true);
    expect(isValidSizeId('panoramic-16x48')).toBe(true);
  });

  it('should return false for invalid IDs', () => {
    expect(isValidSizeId('invalid-id')).toBe(false);
    expect(isValidSizeId('square-100x100')).toBe(false);
    expect(isValidSizeId('')).toBe(false);
  });
});

// ============================================================================
// getAspectRatio Helper Tests
// ============================================================================

describe('getAspectRatio helper', () => {
  it('should return 1 for square sizes', () => {
    const squareSize = getSizeById('square-16x16');
    expect(squareSize).toBeDefined();
    expect(getAspectRatio(squareSize!)).toBe(1);
  });

  it('should return correct ratio for portrait sizes', () => {
    const portraitSize = getSizeById('portrait-landscape-16x20');
    expect(portraitSize).toBeDefined();
    expect(getAspectRatio(portraitSize!)).toBe(16 / 20);
  });

  it('should return correct ratio for panoramic sizes', () => {
    const panoramicSize = getSizeById('panoramic-12x36');
    expect(panoramicSize).toBeDefined();
    expect(getAspectRatio(panoramicSize!)).toBe(12 / 36);
  });

  it('should return ratio less than 1 for portrait orientation', () => {
    PORTRAIT_LANDSCAPE_SIZES.forEach((size) => {
      expect(getAspectRatio(size)).toBeLessThan(1);
    });
  });

  it('should return ratio less than 0.5 for panoramic', () => {
    PANORAMIC_SIZES.forEach((size) => {
      expect(getAspectRatio(size)).toBeLessThanOrEqual(0.5);
    });
  });
});

// ============================================================================
// isSquareSize Helper Tests
// ============================================================================

describe('isSquareSize helper', () => {
  it('should return true for all square sizes', () => {
    SQUARE_SIZES.forEach((size) => {
      expect(isSquareSize(size)).toBe(true);
    });
  });

  it('should return false for portrait-landscape sizes', () => {
    PORTRAIT_LANDSCAPE_SIZES.forEach((size) => {
      expect(isSquareSize(size)).toBe(false);
    });
  });

  it('should return false for panoramic sizes', () => {
    PANORAMIC_SIZES.forEach((size) => {
      expect(isSquareSize(size)).toBe(false);
    });
  });
});

// ============================================================================
// getSizesForOrientation Helper Tests
// ============================================================================

describe('getSizesForOrientation helper', () => {
  it('should return square sizes for "square" orientation', () => {
    const sizes = getSizesForOrientation('square');
    expect(sizes).toBe(SQUARE_SIZES);
  });

  it('should return portrait-landscape sizes for "portrait" orientation', () => {
    const sizes = getSizesForOrientation('portrait');
    expect(sizes).toBe(PORTRAIT_LANDSCAPE_SIZES);
  });

  it('should return portrait-landscape sizes for "landscape" orientation', () => {
    const sizes = getSizesForOrientation('landscape');
    expect(sizes).toBe(PORTRAIT_LANDSCAPE_SIZES);
  });

  it('should return panoramic sizes for "panoramic" orientation', () => {
    const sizes = getSizesForOrientation('panoramic');
    expect(sizes).toBe(PANORAMIC_SIZES);
  });

  it('should return empty array for invalid orientation', () => {
    const sizes = getSizesForOrientation('invalid' as 'square' | 'portrait' | 'landscape' | 'panoramic');
    expect(sizes).toEqual([]);
  });
});

// ============================================================================
// Default Values Tests
// ============================================================================

describe('DEFAULT_SIZE_ID constant', () => {
  it('should be a valid size ID', () => {
    expect(isValidSizeId(DEFAULT_SIZE_ID)).toBe(true);
  });

  it('should be "portrait-landscape-16x20"', () => {
    expect(DEFAULT_SIZE_ID).toBe('portrait-landscape-16x20');
  });

  it('should map to a valid size', () => {
    const defaultSize = getSizeById(DEFAULT_SIZE_ID);
    expect(defaultSize).toBeDefined();
    expect(defaultSize?.widthInches).toBe(16);
    expect(defaultSize?.heightInches).toBe(20);
  });
});

describe('SMALLEST_SIZE constant', () => {
  it('should be the first square size', () => {
    expect(SMALLEST_SIZE).toBe(SQUARE_SIZES[0]);
  });

  it('should be the 12x12 size', () => {
    expect(SMALLEST_SIZE.widthInches).toBe(12);
    expect(SMALLEST_SIZE.heightInches).toBe(12);
  });

  it('should be in price tier 1', () => {
    expect(SMALLEST_SIZE.priceTier).toBe(1);
  });
});

describe('LARGEST_SIZE constant', () => {
  it('should be the last panoramic size', () => {
    expect(LARGEST_SIZE).toBe(PANORAMIC_SIZES[PANORAMIC_SIZES.length - 1]);
  });

  it('should be the 24x72 size', () => {
    expect(LARGEST_SIZE.widthInches).toBe(24);
    expect(LARGEST_SIZE.heightInches).toBe(72);
  });

  it('should be in price tier 4', () => {
    expect(LARGEST_SIZE.priceTier).toBe(4);
  });
});

// ============================================================================
// POPULAR_SIZES Tests
// ============================================================================

describe('POPULAR_SIZES constant', () => {
  it('should have 4 popular size IDs', () => {
    expect(POPULAR_SIZES.length).toBe(4);
  });

  it('should contain valid size IDs', () => {
    POPULAR_SIZES.forEach((id) => {
      expect(isValidSizeId(id)).toBe(true);
    });
  });

  it('should include expected popular sizes', () => {
    expect(POPULAR_SIZES).toContain('square-16x16');
    expect(POPULAR_SIZES).toContain('portrait-landscape-16x20');
    expect(POPULAR_SIZES).toContain('portrait-landscape-24x36');
    expect(POPULAR_SIZES).toContain('panoramic-16x48');
  });

  it('should map to actual size objects', () => {
    POPULAR_SIZES.forEach((id) => {
      const size = getSizeById(id);
      expect(size).toBeDefined();
    });
  });
});

// ============================================================================
// Price Tier Distribution Tests
// ============================================================================

describe('Price tier distribution', () => {
  it('should have smaller sizes in lower tiers', () => {
    const tier1Sizes = getSizesByTier(1);
    const tier4Sizes = getSizesByTier(4);

    const avgTier1Area =
      tier1Sizes.reduce((sum, s) => sum + s.widthInches * s.heightInches, 0) / tier1Sizes.length;
    const avgTier4Area =
      tier4Sizes.reduce((sum, s) => sum + s.widthInches * s.heightInches, 0) / tier4Sizes.length;

    expect(avgTier1Area).toBeLessThan(avgTier4Area);
  });

  it('should have tier 1 sizes with smallest dimensions', () => {
    const tier1Sizes = getSizesByTier(1);
    tier1Sizes.forEach((size) => {
      expect(size.widthInches).toBeLessThanOrEqual(20);
    });
  });

  it('should have tier 4 sizes with largest dimensions', () => {
    const tier4Sizes = getSizesByTier(4);
    tier4Sizes.forEach((size) => {
      const area = size.widthInches * size.heightInches;
      // Tier 4 includes large squares and panoramic sizes
      expect(area).toBeGreaterThanOrEqual(1200);
    });
  });
});

// ============================================================================
// Type Structure Validation
// ============================================================================

describe('ProductSize type structure', () => {
  it('should have all required fields with correct types', () => {
    ALL_SIZES.forEach((size) => {
      expect(typeof size.id).toBe('string');
      expect(typeof size.widthInches).toBe('number');
      expect(typeof size.heightInches).toBe('number');
      expect(typeof size.widthCm).toBe('number');
      expect(typeof size.heightCm).toBe('number');
      expect(typeof size.priceTier).toBe('number');
      expect(typeof size.category).toBe('string');
      expect(typeof size.displayLabel).toBe('string');
      expect(typeof size.displayLabelMetric).toBe('string');
    });
  });

  it('should have positive dimensions', () => {
    ALL_SIZES.forEach((size) => {
      expect(size.widthInches).toBeGreaterThan(0);
      expect(size.heightInches).toBeGreaterThan(0);
      expect(size.widthCm).toBeGreaterThan(0);
      expect(size.heightCm).toBeGreaterThan(0);
    });
  });
});
