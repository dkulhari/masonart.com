/**
 * Size Constants for MasonArt Platform
 *
 * Standard poster sizes with dimensions in inches
 * Used for product variants and pricing calculations
 */

export interface PosterSize {
  id: string;
  label: string;
  widthInches: number;
  heightInches: number;
  widthCm: number;
  heightCm: number;
  aspectRatio: string;
  isPopular: boolean;
  displayOrder: number;
}

/**
 * Conversion factor: 1 inch = 2.54 cm
 */
export const INCHES_TO_CM = 2.54;

/**
 * Standard poster sizes
 * Sizes are ordered by popularity and dimensions
 */
export const POSTER_SIZES: readonly PosterSize[] = [
  // Square formats
  {
    id: 'square-8x8',
    label: '8x8 inches',
    widthInches: 8,
    heightInches: 8,
    widthCm: 20,
    heightCm: 20,
    aspectRatio: '1:1',
    isPopular: false,
    displayOrder: 1,
  },
  {
    id: 'square-12x12',
    label: '12x12 inches',
    widthInches: 12,
    heightInches: 12,
    widthCm: 30,
    heightCm: 30,
    aspectRatio: '1:1',
    isPopular: true,
    displayOrder: 2,
  },
  {
    id: 'square-16x16',
    label: '16x16 inches',
    widthInches: 16,
    heightInches: 16,
    widthCm: 41,
    heightCm: 41,
    aspectRatio: '1:1',
    isPopular: false,
    displayOrder: 3,
  },

  // Portrait formats
  {
    id: 'portrait-8x10',
    label: '8x10 inches',
    widthInches: 8,
    heightInches: 10,
    widthCm: 20,
    heightCm: 25,
    aspectRatio: '4:5',
    isPopular: true,
    displayOrder: 4,
  },
  {
    id: 'portrait-11x14',
    label: '11x14 inches',
    widthInches: 11,
    heightInches: 14,
    widthCm: 28,
    heightCm: 36,
    aspectRatio: '11:14',
    isPopular: false,
    displayOrder: 5,
  },
  {
    id: 'portrait-12x16',
    label: '12x16 inches',
    widthInches: 12,
    heightInches: 16,
    widthCm: 30,
    heightCm: 41,
    aspectRatio: '3:4',
    isPopular: true,
    displayOrder: 6,
  },
  {
    id: 'portrait-16x20',
    label: '16x20 inches',
    widthInches: 16,
    heightInches: 20,
    widthCm: 41,
    heightCm: 51,
    aspectRatio: '4:5',
    isPopular: true,
    displayOrder: 7,
  },
  {
    id: 'portrait-18x24',
    label: '18x24 inches',
    widthInches: 18,
    heightInches: 24,
    widthCm: 46,
    heightCm: 61,
    aspectRatio: '3:4',
    isPopular: true,
    displayOrder: 8,
  },
  {
    id: 'portrait-24x36',
    label: '24x36 inches',
    widthInches: 24,
    heightInches: 36,
    widthCm: 61,
    heightCm: 91,
    aspectRatio: '2:3',
    isPopular: true,
    displayOrder: 9,
  },

  // Landscape formats
  {
    id: 'landscape-10x8',
    label: '10x8 inches',
    widthInches: 10,
    heightInches: 8,
    widthCm: 25,
    heightCm: 20,
    aspectRatio: '5:4',
    isPopular: false,
    displayOrder: 10,
  },
  {
    id: 'landscape-14x11',
    label: '14x11 inches',
    widthInches: 14,
    heightInches: 11,
    widthCm: 36,
    heightCm: 28,
    aspectRatio: '14:11',
    isPopular: false,
    displayOrder: 11,
  },
  {
    id: 'landscape-16x12',
    label: '16x12 inches',
    widthInches: 16,
    heightInches: 12,
    widthCm: 41,
    heightCm: 30,
    aspectRatio: '4:3',
    isPopular: true,
    displayOrder: 12,
  },
  {
    id: 'landscape-20x16',
    label: '20x16 inches',
    widthInches: 20,
    heightInches: 16,
    widthCm: 51,
    heightCm: 41,
    aspectRatio: '5:4',
    isPopular: false,
    displayOrder: 13,
  },
  {
    id: 'landscape-24x18',
    label: '24x18 inches',
    widthInches: 24,
    heightInches: 18,
    widthCm: 61,
    heightCm: 46,
    aspectRatio: '4:3',
    isPopular: true,
    displayOrder: 14,
  },
  {
    id: 'landscape-36x24',
    label: '36x24 inches',
    widthInches: 36,
    heightInches: 24,
    widthCm: 91,
    heightCm: 61,
    aspectRatio: '3:2',
    isPopular: false,
    displayOrder: 15,
  },

  // Panoramic formats
  {
    id: 'panoramic-12x6',
    label: '12x6 inches',
    widthInches: 12,
    heightInches: 6,
    widthCm: 30,
    heightCm: 15,
    aspectRatio: '2:1',
    isPopular: false,
    displayOrder: 16,
  },
  {
    id: 'panoramic-20x10',
    label: '20x10 inches',
    widthInches: 20,
    heightInches: 10,
    widthCm: 51,
    heightCm: 25,
    aspectRatio: '2:1',
    isPopular: true,
    displayOrder: 17,
  },
  {
    id: 'panoramic-30x10',
    label: '30x10 inches',
    widthInches: 30,
    heightInches: 10,
    widthCm: 76,
    heightCm: 25,
    aspectRatio: '3:1',
    isPopular: false,
    displayOrder: 18,
  },
  {
    id: 'panoramic-36x12',
    label: '36x12 inches',
    widthInches: 36,
    heightInches: 12,
    widthCm: 91,
    heightCm: 30,
    aspectRatio: '3:1',
    isPopular: true,
    displayOrder: 19,
  },
] as const;

/**
 * Helper function to get size by ID
 */
export function getSizeById(id: string): PosterSize | undefined {
  return POSTER_SIZES.find((size) => size.id === id);
}

/**
 * Helper function to get all popular sizes
 */
export function getPopularSizes(): readonly PosterSize[] {
  return POSTER_SIZES.filter((size) => size.isPopular);
}

/**
 * Helper function to get sizes by aspect ratio
 */
export function getSizesByAspectRatio(aspectRatio: string): readonly PosterSize[] {
  return POSTER_SIZES.filter((size) => size.aspectRatio === aspectRatio);
}

/**
 * Helper function to validate size label format
 */
export function isValidSizeLabel(label: string): boolean {
  return /^\d+x\d+\s+(inches|cm)$/.test(label);
}

/**
 * Helper function to convert inches to cm
 */
export function inchesToCm(inches: number): number {
  return Math.round(inches * INCHES_TO_CM);
}

/**
 * Helper function to convert cm to inches
 */
export function cmToInches(cm: number): number {
  return Math.round((cm / INCHES_TO_CM) * 100) / 100;
}

/**
 * Minimum and maximum dimensions
 */
export const SIZE_CONSTRAINTS = {
  MIN_WIDTH_INCHES: 4,
  MAX_WIDTH_INCHES: 48,
  MIN_HEIGHT_INCHES: 4,
  MAX_HEIGHT_INCHES: 72,
  MIN_WIDTH_CM: 10,
  MAX_WIDTH_CM: 122,
  MIN_HEIGHT_CM: 10,
  MAX_HEIGHT_CM: 183,
} as const;
