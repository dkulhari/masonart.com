/**
 * Size Constants Tests
 *
 * Comprehensive tests for poster size constants including:
 * - Poster size definitions
 * - Helper functions
 * - Size constraints
 * - Conversion utilities
 */

import { describe, it, expect } from 'vitest';
import {
  POSTER_SIZES,
  SIZE_CONSTRAINTS,
  INCHES_TO_CM,
  getSizeById,
  getPopularSizes,
  getSizesByAspectRatio,
  isValidSizeLabel,
  inchesToCm,
  cmToInches,
  type PosterSize,
} from '../../src/constants/sizes.js';

describe('POSTER_SIZES constant', () => {
  it('should have at least 15 poster sizes defined', () => {
    expect(POSTER_SIZES.length).toBeGreaterThanOrEqual(15);
  });

  it('should have unique IDs for all sizes', () => {
    const ids = POSTER_SIZES.map((size) => size.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(POSTER_SIZES.length);
  });

  it('should have unique labels for all sizes', () => {
    const labels = POSTER_SIZES.map((size) => size.label);
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(POSTER_SIZES.length);
  });

  it('should have valid dimensions for all sizes', () => {
    POSTER_SIZES.forEach((size) => {
      expect(size.widthInches).toBeGreaterThan(0);
      expect(size.heightInches).toBeGreaterThan(0);
      expect(size.widthCm).toBeGreaterThan(0);
      expect(size.heightCm).toBeGreaterThan(0);
    });
  });

  it('should have consistent display order (no duplicates)', () => {
    const orders = POSTER_SIZES.map((size) => size.displayOrder);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(POSTER_SIZES.length);
  });

  it('should have at least one popular size', () => {
    const popularSizes = POSTER_SIZES.filter((size) => size.isPopular);
    expect(popularSizes.length).toBeGreaterThan(0);
  });

  it('should have valid label format (NxN inches or NxN cm)', () => {
    POSTER_SIZES.forEach((size) => {
      expect(size.label).toMatch(/^\d+x\d+\s+(inches|cm)$/);
    });
  });

  it('should have label matching dimensions', () => {
    POSTER_SIZES.forEach((size) => {
      const expectedLabel = `${size.widthInches}x${size.heightInches} inches`;
      expect(size.label).toBe(expectedLabel);
    });
  });

  it('should have cm dimensions matching inch dimensions (approximately)', () => {
    POSTER_SIZES.forEach((size) => {
      const expectedWidthCm = Math.round(size.widthInches * INCHES_TO_CM);
      const expectedHeightCm = Math.round(size.heightInches * INCHES_TO_CM);

      // Allow 1cm tolerance for rounding
      expect(Math.abs(size.widthCm - expectedWidthCm)).toBeLessThanOrEqual(1);
      expect(Math.abs(size.heightCm - expectedHeightCm)).toBeLessThanOrEqual(1);
    });
  });

  it('should have aspect ratios defined', () => {
    POSTER_SIZES.forEach((size) => {
      expect(size.aspectRatio).toBeTruthy();
      expect(size.aspectRatio.length).toBeGreaterThan(0);
    });
  });
});

describe('Size categories', () => {
  it('should have square sizes (equal width and height)', () => {
    const squareSizes = POSTER_SIZES.filter(
      (size) => size.widthInches === size.heightInches
    );
    expect(squareSizes.length).toBeGreaterThan(0);

    squareSizes.forEach((size) => {
      expect(size.id).toContain('square');
      expect(size.aspectRatio).toBe('1:1');
    });
  });

  it('should have portrait sizes (height > width)', () => {
    const portraitSizes = POSTER_SIZES.filter(
      (size) => size.heightInches > size.widthInches
    );
    expect(portraitSizes.length).toBeGreaterThan(0);

    portraitSizes.forEach((size) => {
      expect(size.id).toContain('portrait');
    });
  });

  it('should have landscape sizes (width > height)', () => {
    const landscapeSizes = POSTER_SIZES.filter(
      (size) => size.widthInches > size.heightInches && !size.id.includes('panoramic')
    );
    expect(landscapeSizes.length).toBeGreaterThan(0);

    landscapeSizes.forEach((size) => {
      expect(size.id).toContain('landscape');
    });
  });

  it('should have panoramic sizes (very wide aspect ratio)', () => {
    const panoramicSizes = POSTER_SIZES.filter((size) => size.id.includes('panoramic'));
    expect(panoramicSizes.length).toBeGreaterThan(0);

    panoramicSizes.forEach((size) => {
      expect(size.widthInches).toBeGreaterThan(size.heightInches * 1.5);
    });
  });
});

describe('Popular sizes', () => {
  it('should have 12x12 inches as a popular size', () => {
    const size = POSTER_SIZES.find((s) => s.widthInches === 12 && s.heightInches === 12);
    expect(size?.isPopular).toBe(true);
  });

  it('should have 8x10 inches as a popular size', () => {
    const size = POSTER_SIZES.find((s) => s.widthInches === 8 && s.heightInches === 10);
    expect(size?.isPopular).toBe(true);
  });

  it('should have 16x20 inches as a popular size', () => {
    const size = POSTER_SIZES.find((s) => s.widthInches === 16 && s.heightInches === 20);
    expect(size?.isPopular).toBe(true);
  });

  it('should have 18x24 inches as a popular size', () => {
    const size = POSTER_SIZES.find((s) => s.widthInches === 18 && s.heightInches === 24);
    expect(size?.isPopular).toBe(true);
  });

  it('should have 24x36 inches as a popular size', () => {
    const size = POSTER_SIZES.find((s) => s.widthInches === 24 && s.heightInches === 36);
    expect(size?.isPopular).toBe(true);
  });
});

describe('getSizeById helper', () => {
  it('should return size for valid ID', () => {
    const size = getSizeById('square-12x12');
    expect(size).toBeDefined();
    expect(size?.id).toBe('square-12x12');
    expect(size?.widthInches).toBe(12);
    expect(size?.heightInches).toBe(12);
  });

  it('should return size for portrait-8x10', () => {
    const size = getSizeById('portrait-8x10');
    expect(size).toBeDefined();
    expect(size?.widthInches).toBe(8);
    expect(size?.heightInches).toBe(10);
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

describe('getPopularSizes helper', () => {
  it('should return only popular sizes', () => {
    const popularSizes = getPopularSizes();
    expect(popularSizes.length).toBeGreaterThan(0);

    popularSizes.forEach((size) => {
      expect(size.isPopular).toBe(true);
    });
  });

  it('should return at least 5 popular sizes', () => {
    const popularSizes = getPopularSizes();
    expect(popularSizes.length).toBeGreaterThanOrEqual(5);
  });

  it('should include common sizes in popular sizes', () => {
    const popularSizes = getPopularSizes();
    const popularIds = popularSizes.map((s) => s.id);

    expect(popularIds).toContain('portrait-18x24');
    expect(popularIds).toContain('portrait-16x20');
  });
});

describe('getSizesByAspectRatio helper', () => {
  it('should return all square sizes for 1:1 aspect ratio', () => {
    const squareSizes = getSizesByAspectRatio('1:1');
    expect(squareSizes.length).toBeGreaterThan(0);

    squareSizes.forEach((size) => {
      expect(size.aspectRatio).toBe('1:1');
      expect(size.widthInches).toBe(size.heightInches);
    });
  });

  it('should return sizes for 4:5 aspect ratio', () => {
    const sizes = getSizesByAspectRatio('4:5');
    expect(sizes.length).toBeGreaterThan(0);

    sizes.forEach((size) => {
      expect(size.aspectRatio).toBe('4:5');
    });
  });

  it('should return sizes for 3:4 aspect ratio', () => {
    const sizes = getSizesByAspectRatio('3:4');
    expect(sizes.length).toBeGreaterThan(0);

    sizes.forEach((size) => {
      expect(size.aspectRatio).toBe('3:4');
    });
  });

  it('should return empty array for invalid aspect ratio', () => {
    const sizes = getSizesByAspectRatio('invalid:ratio');
    expect(sizes).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    const sizes = getSizesByAspectRatio('');
    expect(sizes).toEqual([]);
  });
});

describe('isValidSizeLabel helper', () => {
  it('should validate correct inch format', () => {
    expect(isValidSizeLabel('12x16 inches')).toBe(true);
    expect(isValidSizeLabel('8x10 inches')).toBe(true);
    expect(isValidSizeLabel('24x36 inches')).toBe(true);
  });

  it('should validate correct cm format', () => {
    expect(isValidSizeLabel('30x40 cm')).toBe(true);
    expect(isValidSizeLabel('20x25 cm')).toBe(true);
    expect(isValidSizeLabel('61x91 cm')).toBe(true);
  });

  it('should reject format without space', () => {
    expect(isValidSizeLabel('12x16inches')).toBe(false);
    expect(isValidSizeLabel('30x40cm')).toBe(false);
  });

  it('should reject format with wrong unit', () => {
    expect(isValidSizeLabel('12x16 mm')).toBe(false);
    expect(isValidSizeLabel('12x16 meters')).toBe(false);
  });

  it('should reject format without x separator', () => {
    expect(isValidSizeLabel('12 16 inches')).toBe(false);
    expect(isValidSizeLabel('12-16 inches')).toBe(false);
  });

  it('should reject non-numeric dimensions', () => {
    expect(isValidSizeLabel('axb inches')).toBe(false);
    expect(isValidSizeLabel('twelve x sixteen inches')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidSizeLabel('')).toBe(false);
  });

  it('should reject just numbers', () => {
    expect(isValidSizeLabel('12x16')).toBe(false);
  });
});

describe('inchesToCm helper', () => {
  it('should convert inches to cm correctly', () => {
    expect(inchesToCm(8)).toBe(20);
    expect(inchesToCm(12)).toBe(30);
    expect(inchesToCm(16)).toBe(41);
    expect(inchesToCm(24)).toBe(61);
  });

  it('should round to nearest integer', () => {
    expect(inchesToCm(10)).toBe(25); // 10 * 2.54 = 25.4 -> 25
    expect(inchesToCm(18)).toBe(46); // 18 * 2.54 = 45.72 -> 46
  });

  it('should handle zero', () => {
    expect(inchesToCm(0)).toBe(0);
  });

  it('should handle decimal inches', () => {
    expect(inchesToCm(1.5)).toBe(4); // 1.5 * 2.54 = 3.81 -> 4
    expect(inchesToCm(2.5)).toBe(6); // 2.5 * 2.54 = 6.35 -> 6
  });
});

describe('cmToInches helper', () => {
  it('should convert cm to inches correctly', () => {
    expect(cmToInches(20)).toBe(7.87);
    expect(cmToInches(30)).toBe(11.81);
    expect(cmToInches(41)).toBe(16.14);
  });

  it('should round to 2 decimal places', () => {
    expect(cmToInches(25)).toBe(9.84);
    expect(cmToInches(50)).toBe(19.69);
  });

  it('should handle zero', () => {
    expect(cmToInches(0)).toBe(0);
  });

  it('should handle decimal cm', () => {
    expect(cmToInches(10.5)).toBe(4.13);
    expect(cmToInches(15.75)).toBe(6.2);
  });

  it('should be inverse of inchesToCm (approximately)', () => {
    const inches = 12;
    const cm = inchesToCm(inches);
    const backToInches = cmToInches(cm);

    // Allow small tolerance due to rounding
    expect(Math.abs(backToInches - inches)).toBeLessThan(0.5);
  });
});

describe('INCHES_TO_CM constant', () => {
  it('should have correct conversion factor', () => {
    expect(INCHES_TO_CM).toBe(2.54);
  });

  it('should be used in conversion functions', () => {
    const testInches = 10;
    expect(inchesToCm(testInches)).toBe(Math.round(testInches * INCHES_TO_CM));
  });
});

describe('SIZE_CONSTRAINTS constant', () => {
  it('should have minimum width constraint', () => {
    expect(SIZE_CONSTRAINTS.MIN_WIDTH_INCHES).toBe(4);
    expect(SIZE_CONSTRAINTS.MIN_WIDTH_CM).toBe(10);
  });

  it('should have maximum width constraint', () => {
    expect(SIZE_CONSTRAINTS.MAX_WIDTH_INCHES).toBe(48);
    expect(SIZE_CONSTRAINTS.MAX_WIDTH_CM).toBe(122);
  });

  it('should have minimum height constraint', () => {
    expect(SIZE_CONSTRAINTS.MIN_HEIGHT_INCHES).toBe(4);
    expect(SIZE_CONSTRAINTS.MIN_HEIGHT_CM).toBe(10);
  });

  it('should have maximum height constraint', () => {
    expect(SIZE_CONSTRAINTS.MAX_HEIGHT_INCHES).toBe(72);
    expect(SIZE_CONSTRAINTS.MAX_HEIGHT_CM).toBe(183);
  });

  it('should have logical constraints (min < max)', () => {
    expect(SIZE_CONSTRAINTS.MIN_WIDTH_INCHES).toBeLessThan(
      SIZE_CONSTRAINTS.MAX_WIDTH_INCHES
    );
    expect(SIZE_CONSTRAINTS.MIN_HEIGHT_INCHES).toBeLessThan(
      SIZE_CONSTRAINTS.MAX_HEIGHT_INCHES
    );
    expect(SIZE_CONSTRAINTS.MIN_WIDTH_CM).toBeLessThan(SIZE_CONSTRAINTS.MAX_WIDTH_CM);
    expect(SIZE_CONSTRAINTS.MIN_HEIGHT_CM).toBeLessThan(
      SIZE_CONSTRAINTS.MAX_HEIGHT_CM
    );
  });

  it('should have all sizes within constraints', () => {
    POSTER_SIZES.forEach((size) => {
      expect(size.widthInches).toBeGreaterThanOrEqual(SIZE_CONSTRAINTS.MIN_WIDTH_INCHES);
      expect(size.widthInches).toBeLessThanOrEqual(SIZE_CONSTRAINTS.MAX_WIDTH_INCHES);
      expect(size.heightInches).toBeGreaterThanOrEqual(SIZE_CONSTRAINTS.MIN_HEIGHT_INCHES);
      expect(size.heightInches).toBeLessThanOrEqual(SIZE_CONSTRAINTS.MAX_HEIGHT_INCHES);
    });
  });
});

describe('PosterSize type structure', () => {
  it('should have all required fields', () => {
    POSTER_SIZES.forEach((size) => {
      expect(size).toHaveProperty('id');
      expect(size).toHaveProperty('label');
      expect(size).toHaveProperty('widthInches');
      expect(size).toHaveProperty('heightInches');
      expect(size).toHaveProperty('widthCm');
      expect(size).toHaveProperty('heightCm');
      expect(size).toHaveProperty('aspectRatio');
      expect(size).toHaveProperty('isPopular');
      expect(size).toHaveProperty('displayOrder');
    });
  });

  it('should have correct field types', () => {
    POSTER_SIZES.forEach((size) => {
      expect(typeof size.id).toBe('string');
      expect(typeof size.label).toBe('string');
      expect(typeof size.widthInches).toBe('number');
      expect(typeof size.heightInches).toBe('number');
      expect(typeof size.widthCm).toBe('number');
      expect(typeof size.heightCm).toBe('number');
      expect(typeof size.aspectRatio).toBe('string');
      expect(typeof size.isPopular).toBe('boolean');
      expect(typeof size.displayOrder).toBe('number');
    });
  });
});
