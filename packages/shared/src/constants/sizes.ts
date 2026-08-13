/**
 * Size Constants for chobii.art Platform
 *
 * Defines all available product sizes with their dimensions, price tiers,
 * and display labels based on the requirements specification (Section 4.3).
 */

import type { ProductSize, SizeCategory, PriceTier } from '../types/product';

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
 * Creates a label carrying both units inline, e.g. `36" × 48" / 91 × 122 cm`.
 *
 * mesonart prints every size this way. A unit toggle makes the customer pick a
 * system before they can read the list; this makes it scannable in either.
 */
const createDisplayLabelDual = (
  widthInches: number,
  heightInches: number,
  widthCm: number,
  heightCm: number
): string => {
  return `${createDisplayLabel(widthInches, heightInches)} / ${createDisplayLabelMetric(widthCm, heightCm)}`;
};

/**
 * Factory function to create a ProductSize object.
 *
 * `priceTier` is NOT passed in — it is derived from the step's position in its
 * ladder by buildLadder() below. With 13-17 steps per ladder, hand-assigning a
 * 1-4 tier per size stopped being meaningful; the tier survives only because
 * `productSizeSchema` requires it, while the real money question is answered by
 * priceForSize().
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
    displayLabelDual: createDisplayLabelDual(
      widthInches,
      heightInches,
      widthCm,
      heightCm
    ),
  };
};

/**
 * Builds a ladder from `[width, height]` pairs, sorting by area and deriving
 * each step's price tier from its quartile position.
 *
 * Sorting here rather than trusting the literal order is deliberate: the
 * ladders below interleave our small poster steps with mesonart's larger
 * canvas steps, and area order is not the order either list was written in.
 * Everything downstream — variant `sortOrder`, the taper in priceForSize(),
 * the size list on the PDP — assumes ascending area.
 */
const buildLadder = (
  steps: readonly (readonly [number, number])[],
  category: SizeCategory
): readonly ProductSize[] => {
  const byArea = [...steps].sort((a, b) => a[0] * a[1] - b[0] * b[1]);

  return byArea.map(([width, height], index) => {
    const quartile = Math.min(
      4,
      Math.floor((index * 4) / byArea.length) + 1
    ) as PriceTier;
    return createSize(width, height, quartile, category);
  });
};

// ============================================================================
// Square Sizes
// ============================================================================

/**
 * Square poster sizes (equal width and height).
 *
 * Our original 12-48" steps, plus mesonart's measured `square-10` ladder
 * (24 30 32 36 40 44 48 55 60 72). Theirs starts at 24" because they sell
 * hand-painted canvases; we genuinely sell 12-20" posters, so this is a
 * superset rather than a replacement — the ceiling is what was missing.
 */
export const SQUARE_SIZES: readonly ProductSize[] = buildLadder(
  [
    [12, 12],
    [16, 16],
    [20, 20],
    [24, 24],
    [30, 30],
    [32, 32],
    [36, 36],
    [40, 40],
    [44, 44],
    [48, 48],
    [55, 55],
    [60, 60],
    [72, 72],
  ],
  'square'
);

// ============================================================================
// Portrait/Landscape Sizes
// ============================================================================

/**
 * Portrait/Landscape poster sizes (can be used in either orientation).
 * Listed as width × height for portrait orientation — short side first.
 *
 * Our original steps plus mesonart's measured `rect-14`, transposed: their
 * table is long-side-first (24×20, 32×24, …) and is shared verbatim between
 * `Orientation_Vertical` and `Orientation_Horizontal`, with only the H/W
 * labelling swapped. Same numbers here, short side first.
 *
 * §5.2 is the thing to understand about this ladder: it deliberately spans
 * FIVE aspect ratios — 4:3, 3:2, 6:5, 27:20 and 44:29 — interleaved rather
 * than grouped. Ratio is a manufacturing instruction chosen at the size step,
 * not a property of the artwork, which is why our square 1500×1500 master
 * image is not in conflict with it (§5.6.1).
 */
export const PORTRAIT_LANDSCAPE_SIZES: readonly ProductSize[] = buildLadder(
  [
    [12, 16],
    [16, 20],
    [18, 24],
    [20, 24],
    [24, 32],
    [24, 36],
    [30, 40],
    [32, 48],
    [36, 48],
    [36, 54],
    [40, 54],
    [40, 60],
    [48, 64],
    [48, 72],
    [54, 72],
    [53, 80],
    [60, 80],
  ],
  'portrait-landscape'
);

// ============================================================================
// Panoramic Sizes
// ============================================================================

/**
 * Panoramic poster sizes.
 *
 * Our original four steps were uniformly 3:1 — one proportion scaled up.
 * mesonart's measured `pano-11` mixes 2:1 (×7), 3:1 (×3) and 8:3 (×1), which
 * is the same point as the rectangular ladder: the steps are manufacturing
 * sizes, not a single shape at four scales.
 *
 * Listed SHORT SIDE FIRST, like every ladder here — `[12, 36]` is the 3:1
 * rectangle, and a panorama sells it 36 wide. Whoever emits a poster from a
 * step is the one that turns it; `orientFor` in the seed does. This used to
 * say "wide format" while storing the opposite, and eight products shipped a
 * tall size list on the strength of it (#601).
 */
export const PANORAMIC_SIZES: readonly ProductSize[] = buildLadder(
  [
    [12, 36],
    [18, 36],
    [16, 48],
    [24, 48],
    [20, 60],
    [24, 72],
    [30, 60],
    [30, 80],
    [36, 72],
    [30, 90],
    [40, 80],
    [45, 90],
    [50, 100],
  ],
  'panoramic'
);

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
  ['square', SQUARE_SIZES],
  ['portrait-landscape', PORTRAIT_LANDSCAPE_SIZES],
  ['panoramic', PANORAMIC_SIZES],
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

// ============================================================================
// Area-Based Pricing
// ============================================================================

/**
 * How far the per-square-inch rate falls from the smallest step to the largest.
 *
 * Measured on mesonart: $0.454/in² at their entry step down to $0.311/in² at
 * their largest, a decline of ~31%. We adopt the SHAPE, not the dollar figures
 * — their catalogue is hand-painted canvas in USD and ours is printed art in
 * INR, so the absolute rate is meaningless to us but the taper is not: it is
 * what stops a 5,000in² piece costing 35× a 144in² one.
 */
const TAPER_FLOOR = 0.69;

const areaOf = (size: Pick<ProductSize, 'widthInches' | 'heightInches'>): number =>
  size.widthInches * size.heightInches;

/**
 * Price a single ladder step from the product's base price.
 *
 * Replaces the hand-entered "size addition" per variant, which had to be
 * retyped for every product and drifted between the seed and the shared
 * ladder.
 *
 * Two properties matter and both are asserted in tests:
 *
 * 1. **The smallest step is exactly `basePrice`.** Every product card and
 *    listing renders `From <basePrice>`; if the entry step stops matching it,
 *    the whole catalogue quotes a price no variant actually sells at.
 * 2. **Price tracks area, not proportion** (§5.5). Two steps of equal area at
 *    different aspect ratios cost the same, because the cost driver is
 *    material and printed surface.
 *
 * The taper is interpolated in log-area space across the step's own ladder, so
 * it always spans the measured ~31% end to end regardless of how deep that
 * ladder is. Anchoring it to a raw area ratio instead would make the decline a
 * function of ladder span — our square ladder covers 36× area against their
 * 10×, and the same exponent would have tapered it nearly 45%.
 */
export const priceForSize = (basePrice: number, size: ProductSize): number => {
  const ladder = SIZES_BY_CATEGORY.get(size.category) ?? [];
  const first = ladder[0];
  const last = ladder[ladder.length - 1];
  if (!first || !last) return Math.round(basePrice);

  const areaMin = areaOf(first);
  const areaMax = areaOf(last);
  const area = areaOf(size);

  const span = Math.log(areaMax / areaMin);
  // A one-step ladder has no span to interpolate across; charge the base.
  const position = span > 0 ? Math.log(area / areaMin) / span : 0;
  const taper = 1 - (1 - TAPER_FLOOR) * position;

  return Math.round(basePrice * (area / areaMin) * taper);
};

/**
 * Get sizes compatible with a specific orientation
 */
export const getSizesForOrientation = (
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic'
): readonly ProductSize[] => {
  switch (orientation) {
    case 'square':
      return SQUARE_SIZES;
    case 'portrait':
    case 'landscape':
      return PORTRAIT_LANDSCAPE_SIZES;
    case 'panoramic':
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
export const DEFAULT_SIZE_ID = 'portrait-landscape-16x20';

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
  'square-16x16',
  'portrait-landscape-16x20',
  'portrait-landscape-24x36',
  'panoramic-16x48',
] as const;
