/**
 * Frame Constants for chobii.art Platform
 *
 * Defines all frame options, mat options, and glass options
 * with their pricing based on the requirements specification (Section 5).
 */

import type {
  FrameOption,
  FrameType,
  MatOptionConfig,
  MatOption,
  GlassOptionConfig,
  GlassOption,
  PriceModifier,
} from '../types/product';

// ============================================================================
// Price Modifier Helpers
// ============================================================================

/**
 * Creates a percentage-based price modifier
 */
const percentageModifier = (percentage: number): PriceModifier => ({
  type: 'percentage',
  value: percentage,
});

/**
 * Creates a fixed-price modifier in INR (stored in paise)
 */
const fixedModifierINR = (amountInRupees: number): PriceModifier => ({
  type: 'fixed',
  value: amountInRupees * 100, // Convert to paise
  currency: 'INR',
});

/**
 * Base modifier (no additional cost)
 */
const baseModifier = (): PriceModifier => ({
  type: 'percentage',
  value: 0,
});

// ============================================================================
// Frame Options
// ============================================================================

/**
 * Poster only option (rolled in protective tube)
 */
export const POSTER_ONLY_FRAME: FrameOption = {
  id: 'frame-poster-only',
  type: 'poster-only',
  name: 'Poster Only (Rolled)',
  description: 'Shipped in a protective tube, ready to be framed by you',
  priceModifier: baseModifier(),
  material: 'Premium poster paper',
  isAvailable: true,
};

/**
 * Stretched canvas (frameless, gallery-wrapped)
 */
export const STRETCHED_CANVAS_FRAME: FrameOption = {
  id: 'frame-stretched-canvas',
  type: 'stretched-canvas',
  name: 'Stretched Canvas',
  description: 'Gallery-wrapped canvas, ready to hang with no frame needed',
  priceModifier: percentageModifier(30),
  material: 'Premium canvas with wooden stretcher bars',
  isAvailable: true,
};

/**
 * Black frame option
 */
export const BLACK_FRAME: FrameOption = {
  id: 'frame-black',
  type: 'black-frame',
  name: 'Black Frame',
  description: 'Classic matte black frame, timeless and versatile',
  priceModifier: percentageModifier(40),
  availableColors: ['matte-black'],
  material: 'Solid wood with matte finish',
  isAvailable: true,
};

/**
 * White frame option
 */
export const WHITE_FRAME: FrameOption = {
  id: 'frame-white',
  type: 'white-frame',
  name: 'White Frame',
  description: 'Clean modern white frame, perfect for contemporary spaces',
  priceModifier: percentageModifier(40),
  availableColors: ['pure-white', 'off-white'],
  material: 'Solid wood with satin finish',
  isAvailable: true,
};

/**
 * Natural wood frame option
 */
export const NATURAL_WOOD_FRAME: FrameOption = {
  id: 'frame-natural-wood',
  type: 'natural-wood-frame',
  name: 'Natural Wood Frame',
  description: 'Light oak finish, brings warmth and natural beauty',
  priceModifier: percentageModifier(45),
  availableColors: ['light-oak', 'honey-oak'],
  material: 'Natural oak wood with protective sealant',
  isAvailable: true,
};

/**
 * Dark wood frame option
 */
export const DARK_WOOD_FRAME: FrameOption = {
  id: 'frame-dark-wood',
  type: 'dark-wood-frame',
  name: 'Dark Wood Frame',
  description: 'Rich walnut/espresso finish, elegant and sophisticated',
  priceModifier: percentageModifier(45),
  availableColors: ['walnut', 'espresso', 'mahogany'],
  material: 'Premium hardwood with rich stain finish',
  isAvailable: true,
};

/**
 * Gold frame option
 */
export const GOLD_FRAME: FrameOption = {
  id: 'frame-gold',
  type: 'gold-frame',
  name: 'Gold Frame',
  description: 'Brushed gold metallic finish, luxurious and eye-catching',
  priceModifier: percentageModifier(50),
  availableColors: ['brushed-gold', 'antique-gold'],
  material: 'Aluminum with premium gold finish',
  isAvailable: true,
};

/**
 * Silver frame option
 */
export const SILVER_FRAME: FrameOption = {
  id: 'frame-silver',
  type: 'silver-frame',
  name: 'Silver Frame',
  description: 'Brushed silver metallic finish, sleek and modern',
  priceModifier: percentageModifier(50),
  availableColors: ['brushed-silver', 'chrome'],
  material: 'Aluminum with premium silver finish',
  isAvailable: true,
};

/**
 * Floating frame option
 */
export const FLOATING_FRAME: FrameOption = {
  id: 'frame-floating',
  type: 'floating-frame',
  name: 'Floating Frame',
  description: 'Modern floating effect with visible gap around artwork',
  priceModifier: percentageModifier(55),
  availableColors: ['black', 'white', 'natural-wood'],
  material: 'Premium wood with shadow box design',
  isAvailable: true,
};

/**
 * All frame options
 */
export const ALL_FRAME_OPTIONS: readonly FrameOption[] = [
  POSTER_ONLY_FRAME,
  STRETCHED_CANVAS_FRAME,
  BLACK_FRAME,
  WHITE_FRAME,
  NATURAL_WOOD_FRAME,
  DARK_WOOD_FRAME,
  GOLD_FRAME,
  SILVER_FRAME,
  FLOATING_FRAME,
] as const;

/**
 * Frame options that are actual frames (not poster-only or canvas)
 */
export const ACTUAL_FRAME_OPTIONS: readonly FrameOption[] = ALL_FRAME_OPTIONS.filter(
  (frame) => frame.type !== 'poster-only' && frame.type !== 'stretched-canvas'
);

// ============================================================================
// Mat/Mount Options
// ============================================================================

/**
 * No mat option
 */
export const NO_MAT: MatOptionConfig = {
  id: 'mat-none',
  type: 'no-mat',
  name: 'No Mat',
  description: 'Frame edge to edge, no matting',
  borderWidth: 0,
  priceModifier: baseModifier(),
  isAvailable: true,
};

/**
 * White mat option
 */
export const WHITE_MAT: MatOptionConfig = {
  id: 'mat-white',
  type: 'white-mat',
  name: 'White Mat',
  description: '2" white border, classic and clean',
  borderWidth: 2,
  priceModifier: fixedModifierINR(500),
  isAvailable: true,
};

/**
 * Off-white/cream mat option
 */
export const OFF_WHITE_MAT: MatOptionConfig = {
  id: 'mat-off-white',
  type: 'off-white-mat',
  name: 'Off-White Mat',
  description: '2" cream border, warm and elegant',
  borderWidth: 2,
  priceModifier: fixedModifierINR(500),
  isAvailable: true,
};

/**
 * Black mat option
 */
export const BLACK_MAT: MatOptionConfig = {
  id: 'mat-black',
  type: 'black-mat',
  name: 'Black Mat',
  description: '2" black border, dramatic and sophisticated',
  borderWidth: 2,
  priceModifier: fixedModifierINR(500),
  isAvailable: true,
};

/**
 * Double mat option
 */
export const DOUBLE_MAT: MatOptionConfig = {
  id: 'mat-double',
  type: 'double-mat',
  name: 'Double Mat',
  description: 'Two-layer mat effect, adds depth and dimension',
  borderWidth: 2.5,
  priceModifier: fixedModifierINR(800),
  isAvailable: true,
};

/**
 * All mat options
 */
export const ALL_MAT_OPTIONS: readonly MatOptionConfig[] = [
  NO_MAT,
  WHITE_MAT,
  OFF_WHITE_MAT,
  BLACK_MAT,
  DOUBLE_MAT,
] as const;

/**
 * Mat options that add a mat (excluding no-mat)
 */
export const ACTUAL_MAT_OPTIONS: readonly MatOptionConfig[] = ALL_MAT_OPTIONS.filter(
  (mat) => mat.type !== 'no-mat'
);

// ============================================================================
// Glass/Acrylic Options
// ============================================================================

/**
 * Standard glass option
 */
export const STANDARD_GLASS: GlassOptionConfig = {
  id: 'glass-standard',
  type: 'standard-glass',
  name: 'Standard Glass',
  description: 'Regular picture glass, clear and protective',
  priceModifier: baseModifier(),
  hasUVProtection: false,
  isAntiReflective: false,
  isAvailable: true,
};

/**
 * Non-glare glass option
 */
export const NON_GLARE_GLASS: GlassOptionConfig = {
  id: 'glass-non-glare',
  type: 'non-glare-glass',
  name: 'Non-Glare Glass',
  description: 'Reduced reflections for better visibility in bright spaces',
  priceModifier: fixedModifierINR(400),
  hasUVProtection: false,
  isAntiReflective: true,
  isAvailable: true,
};

/**
 * Acrylic/Plexiglass option
 */
export const ACRYLIC_GLASS: GlassOptionConfig = {
  id: 'glass-acrylic',
  type: 'acrylic',
  name: 'Acrylic/Plexiglass',
  description: 'Shatter-resistant and lightweight, ideal for large pieces',
  priceModifier: fixedModifierINR(600),
  hasUVProtection: true,
  isAntiReflective: false,
  isAvailable: true,
};

/**
 * Museum glass option
 */
export const MUSEUM_GLASS: GlassOptionConfig = {
  id: 'glass-museum',
  type: 'museum-glass',
  name: 'Museum Glass',
  description: 'Premium UV protection and anti-reflective coating',
  priceModifier: fixedModifierINR(1200),
  hasUVProtection: true,
  isAntiReflective: true,
  isAvailable: true,
};

/**
 * All glass options
 */
export const ALL_GLASS_OPTIONS: readonly GlassOptionConfig[] = [
  STANDARD_GLASS,
  NON_GLARE_GLASS,
  ACRYLIC_GLASS,
  MUSEUM_GLASS,
] as const;

// ============================================================================
// Lookup Maps
// ============================================================================

/**
 * Map of frame option IDs to FrameOption objects
 */
export const FRAME_BY_ID: ReadonlyMap<string, FrameOption> = new Map(
  ALL_FRAME_OPTIONS.map((frame) => [frame.id, frame])
);

/**
 * Map of frame types to FrameOption objects
 */
export const FRAME_BY_TYPE: ReadonlyMap<FrameType, FrameOption> = new Map(
  ALL_FRAME_OPTIONS.map((frame) => [frame.type, frame])
);

/**
 * Map of mat option IDs to MatOptionConfig objects
 */
export const MAT_BY_ID: ReadonlyMap<string, MatOptionConfig> = new Map(
  ALL_MAT_OPTIONS.map((mat) => [mat.id, mat])
);

/**
 * Map of mat types to MatOptionConfig objects
 */
export const MAT_BY_TYPE: ReadonlyMap<MatOption, MatOptionConfig> = new Map(
  ALL_MAT_OPTIONS.map((mat) => [mat.type, mat])
);

/**
 * Map of glass option IDs to GlassOptionConfig objects
 */
export const GLASS_BY_ID: ReadonlyMap<string, GlassOptionConfig> = new Map(
  ALL_GLASS_OPTIONS.map((glass) => [glass.id, glass])
);

/**
 * Map of glass types to GlassOptionConfig objects
 */
export const GLASS_BY_TYPE: ReadonlyMap<GlassOption, GlassOptionConfig> = new Map(
  ALL_GLASS_OPTIONS.map((glass) => [glass.type, glass])
);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a frame option by ID
 */
export const getFrameById = (id: string): FrameOption | undefined => {
  return FRAME_BY_ID.get(id);
};

/**
 * Get a frame option by type
 */
export const getFrameByType = (type: FrameType): FrameOption | undefined => {
  return FRAME_BY_TYPE.get(type);
};

/**
 * Get a mat option by ID
 */
export const getMatById = (id: string): MatOptionConfig | undefined => {
  return MAT_BY_ID.get(id);
};

/**
 * Get a mat option by type
 */
export const getMatByType = (type: MatOption): MatOptionConfig | undefined => {
  return MAT_BY_TYPE.get(type);
};

/**
 * Get a glass option by ID
 */
export const getGlassById = (id: string): GlassOptionConfig | undefined => {
  return GLASS_BY_ID.get(id);
};

/**
 * Get a glass option by type
 */
export const getGlassByType = (type: GlassOption): GlassOptionConfig | undefined => {
  return GLASS_BY_TYPE.get(type);
};

/**
 * Check if a frame option requires glass
 */
export const frameRequiresGlass = (frame: FrameOption): boolean => {
  // Poster only and stretched canvas don't use glass
  return frame.type !== 'poster-only' && frame.type !== 'stretched-canvas';
};

/**
 * Check if a frame option can have a mat
 */
export const frameCanHaveMat = (frame: FrameOption): boolean => {
  // Only actual frames can have mats, not poster-only or stretched canvas
  return frame.type !== 'poster-only' && frame.type !== 'stretched-canvas';
};

/**
 * Get available glass options for a frame type
 */
export const getGlassOptionsForFrame = (frame: FrameOption): readonly GlassOptionConfig[] => {
  if (!frameRequiresGlass(frame)) {
    return [];
  }
  return ALL_GLASS_OPTIONS;
};

/**
 * Get available mat options for a frame type
 */
export const getMatOptionsForFrame = (frame: FrameOption): readonly MatOptionConfig[] => {
  if (!frameCanHaveMat(frame)) {
    return [];
  }
  return ALL_MAT_OPTIONS;
};

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default frame option (poster only)
 */
export const DEFAULT_FRAME = POSTER_ONLY_FRAME;

/**
 * Default mat option (no mat)
 */
export const DEFAULT_MAT = NO_MAT;

/**
 * Default glass option (standard glass)
 */
export const DEFAULT_GLASS = STANDARD_GLASS;

// ============================================================================
// Gift Wrap Option
// ============================================================================

/**
 * Gift wrap price in INR (stored in paise)
 */
export const GIFT_WRAP_PRICE_INR = 25000; // 250 rupees in paise

/**
 * Gift wrap option configuration
 */
export const GIFT_WRAP_CONFIG = {
  id: 'gift-wrap',
  name: 'Gift Wrapping',
  description: 'Premium gift wrapping with ribbon and personalized message card',
  price: GIFT_WRAP_PRICE_INR,
  currency: 'INR',
  isAvailable: true,
} as const;

// ============================================================================
// Frame Price Addition (database rows)
// ============================================================================

/**
 * The two pricing columns a `frames` row carries.
 *
 * Both are `decimal` in the database and therefore arrive as strings; numbers
 * are accepted too so a caller that has already parsed does not have to
 * re-stringify.
 */
export interface FramePriceColumns {
  /** `1.40` means "the piece plus 40%". `1.00` (or absent) means no markup. */
  priceModifier?: string | number | null;
  /** A flat sum on top, in rupees. `0.00` on every seeded frame today. */
  priceAddition?: string | number | null;
}

const toAmount = (value: string | number | null | undefined, fallback: number): number => {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * What a frame adds to one unit of the piece it is wrapped around.
 *
 * THE one frame-pricing formula (#511 final review, finding 1). The storefront
 * quotes it before the write, `POST /api/cart/items` stores it, and
 * `POST /api/orders` charges what was stored — three surfaces that have to
 * produce the same number to the paisa, or the drawer visibly re-prices itself
 * the moment the server's answer lands and the customer is charged something
 * other than what the button promised.
 *
 * A frame is a percentage of the piece, not a flat fee: a moulding for a 12x16
 * and one for a 60x80 are not the same amount of timber. `priceAddition` is
 * added on top for the day a frame carries a genuine flat component; it is
 * `0.00` on every frame seeded today, which is exactly why reading it ALONE —
 * as the cart route did — quoted every framed line at zero and undercharged
 * every framed order by the whole markup.
 *
 * Rounded to the rupee, deliberately, and here rather than at display time, so
 * the number the CTA quotes is the number that reaches the cart.
 *
 * A modifier below 1.00 is clamped to no markup rather than allowed to
 * discount the piece: frames do not make artwork cheaper, and a bad row should
 * not be able to sell at a loss.
 */
export const frameAddition = (
  unitPrice: number,
  frame: FramePriceColumns | null | undefined
): number => {
  if (!frame) return 0;
  const rate = Math.max(0, toAmount(frame.priceModifier, 1) - 1);
  return Math.round(unitPrice * rate) + toAmount(frame.priceAddition, 0);
};

/**
 * The print prices the admin frame form quotes a frame against.
 *
 * Three rather than one, and they live here rather than in the form because
 * the preview and its test both need the same figures — a preview whose sample
 * prices drift from its test asserts nothing.
 *
 * Three because a frame is priced as a proportion of the piece precisely so
 * its cost tracks the size of it (see `frameAddition` above). A single sample
 * row would show the admin a number while hiding the behaviour they are
 * actually choosing. Small, mid and large, spanning the catalogue, in order.
 */
export const FRAME_PREVIEW_REFERENCE_PRICES: readonly number[] = [
  1499, 4999, 14999,
];

/**
 * What an admin may upload as imagery, shared by the product and frame
 * endpoints.
 *
 * Two endpoints holding two private copies of this is how one of them ends up
 * quietly accepting a format the image pipeline cannot process.
 */
export const ADMIN_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_ADMIN_IMAGE_MB = 10;
