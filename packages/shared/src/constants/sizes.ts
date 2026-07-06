/**
 * Size Constants for MasonArt Platform
 *
 * Defines all available product sizes with their dimensions, price tiers,
 * and display labels based on the requirements specification (Section 4.3).
 */

import type { ProductSize, SizeCategory, PriceTier } from "../types/product";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts inches to centimeters (rounded to nearest whole number)
 */
const inchesToCm = (inches: number): number => Math.round(inches * 2.54);

/**
 * Creates a size ID from dimensions
 */
const createSizeId = (width: number, height: number, category: SizeCategory): string => {
  return `${category}-${width}x${height}`;
};

/**
 * Creates a display label in inches format
 */
const createDisplayLabel = (width: number, height: number): string => {
  return `${width}" × ${height}"`;
};

/**
 * Creates a display label in metric format
 */
const createDisplayLabelMetric = (widthCm: number, heightCm: number): string => {
  return `${widthCm} × ${heightCm} cm`;
};

/**
 * Factory function to create a ProductSize object
 */
const createSize = (
  widthInches: number,
  heightInches: number,
  priceTier: PriceTier,
  category: SizeCategory
): ProductSize => {
  const widthCm = inchesToCm(widthInches);
  const heightCm = inchesToCm(heightInches);

  return {
    id: createSizeId(widthInches, heightInches, category),
    widthInches,
    heightInches,
    widthCm,
    heightCm,
    priceTier,
    category,
    displayLabel: createDisplayLabel(widthInches, heightInches),
    displayLabelMetric: createDisplayLabelMetric(widthCm, heightCm),
  };
};

// ============================================================================
// Square Sizes
// ============================================================================

/**
 * Square poster sizes (equal width and height)
 */
export const SQUARE_SIZES: readonly ProductSize[] = [
  createSize(12, 12, 1, "square"),
  createSize(16, 16, 1, "square"),
  createSize(20, 20, 2, "square"),
  createSize(24, 24, 2, "square"),
  createSize(30, 30, 3, "square"),
  createSize(36, 36, 3, "square"),
  createSize(40, 40, 4, "square"),
  createSize(48, 48, 4, "square"),
] as const;

// ============================================================================
// Portrait/Landscape Sizes
// ============================================================================

/**
 * Portrait/Landscape poster sizes (can be used in either orientation)
 * Listed as width × height for portrait orientation
 */
export const PORTRAIT_LANDSCAPE_SIZES: readonly ProductSize[] = [
  createSize(12, 16, 1, "portrait-landscape"),
  createSize(16, 20, 1, "portrait-landscape"),
  createSize(18, 24, 2, "portrait-landscape"),
  createSize(24, 32, 2, "portrait-landscape"),
  createSize(24, 36, 3, "portrait-landscape"),
  createSize(30, 40, 3, "portrait-landscape"),
  createSize(36, 48, 4, "portrait-landscape"),
  createSize(40, 60, 4, "portrait-landscape"),
] as const;

// ============================================================================
// Panoramic Sizes
// ============================================================================

/**
 * Panoramic poster sizes (wide format for landscape scenes)
 */
export const PANORAMIC_SIZES: readonly ProductSize[] = [
  createSize(12, 36, 2, "panoramic"),
  createSize(16, 48, 3, "panoramic"),
  createSize(20, 60, 4, "panoramic"),
  createSize(24, 72, 4, "panoramic"),
] as const;

// ============================================================================
// All Sizes Combined
// ============================================================================

/**
 * All available product sizes
 */
export const ALL_SIZES: readonly ProductSize[] = [
  ...SQUARE_SIZES,
  ...PORTRAIT_LANDSCAPE_SIZES,
  ...PANORAMIC_SIZES,
] as const;

// ============================================================================
// Size Maps for Quick Lookups
// ============================================================================

/**
 * Map of size IDs to ProductSize objects for O(1) lookup
 */
export const SIZE_BY_ID: ReadonlyMap<string, ProductSize> = new Map(
  ALL_SIZES.map((size) => [size.id, size])
);

/**
 * Map of price tiers to their associated sizes
 */
export const SIZES_BY_TIER: ReadonlyMap<PriceTier, readonly ProductSize[]> = new Map([
  [1, ALL_SIZES.filter((s) => s.priceTier === 1)],
  [2, ALL_SIZES.filter((s) => s.priceTier === 2)],
  [3, ALL_SIZES.filter((s) => s.priceTier === 3)],
  [4, ALL_SIZES.filter((s) => s.priceTier === 4)],
]);

/**
 * Map of categories to their associated sizes
 */
export const SIZES_BY_CATEGORY: ReadonlyMap<SizeCategory, readonly ProductSize[]> = new Map([
  ["square", SQUARE_SIZES],
  ["portrait-landscape", PORTRAIT_LANDSCAPE_SIZES],
  ["panoramic", PANORAMIC_SIZES],
]);

// ============================================================================
// Size Utility Functions
// ============================================================================

/**
 * Get a size by its ID
 */
export const getSizeById = (id: string): ProductSize | undefined => {
  return SIZE_BY_ID.get(id);
};

/**
 * Get all sizes for a specific price tier
 */
export const getSizesByTier = (tier: PriceTier): readonly ProductSize[] => {
  return SIZES_BY_TIER.get(tier) ?? [];
};

/**
 * Get all sizes for a specific category
 */
export const getSizesByCategory = (category: SizeCategory): readonly ProductSize[] => {
  return SIZES_BY_CATEGORY.get(category) ?? [];
};

/**
 * Check if a size ID is valid
 */
export const isValidSizeId = (id: string): boolean => {
  return SIZE_BY_ID.has(id);
};

/**
 * Get the aspect ratio of a size (width / height)
 */
export const getAspectRatio = (size: ProductSize): number => {
  return size.widthInches / size.heightInches;
};

/**
 * Check if a size is square
 */
export const isSquareSize = (size: ProductSize): boolean => {
  return size.widthInches === size.heightInches;
};

/**
 * Get sizes compatible with a specific orientation
 */
export const getSizesForOrientation = (
  orientation: "square" | "portrait" | "landscape" | "panoramic"
): readonly ProductSize[] => {
  switch (orientation) {
    case "square":
      return SQUARE_SIZES;
    case "portrait":
    case "landscape":
      return PORTRAIT_LANDSCAPE_SIZES;
    case "panoramic":
      return PANORAMIC_SIZES;
    default:
      return [];
  }
};

// ============================================================================
// Size Constants for Common Use Cases
// ============================================================================

/**
 * Default size for new products
 */
export const DEFAULT_SIZE_ID = "portrait-landscape-16x20";

/**
 * Smallest available size
 */
export const SMALLEST_SIZE = SQUARE_SIZES[0];

/**
 * Largest available size
 */
export const LARGEST_SIZE = PANORAMIC_SIZES[PANORAMIC_SIZES.length - 1];

/**
 * Most popular sizes (commonly used for featured products)
 */
export const POPULAR_SIZES: readonly string[] = [
  "square-16x16",
  "portrait-landscape-16x20",
  "portrait-landscape-24x36",
  "panoramic-16x48",
] as const;
