/**
 * Frame Constants for MasonArt Platform
 *
 * Frame types, materials, and pricing information
 * Used for frame selection and price calculations
 */

export interface FrameMaterial {
  id: string;
  name: string;
  description: string;
  priceModifier: number; // Multiplier for base price (e.g., 1.20 = 20% markup)
  isPopular: boolean;
  displayOrder: number;
}

export interface FrameType {
  id: string;
  name: string;
  type: string; // Kebab-case identifier
  description: string;
  materials: readonly string[]; // Material IDs
  imageUrl: string;
  isActive: boolean;
  displayOrder: number;
}

export interface FrameFinish {
  id: string;
  name: string;
  description: string;
  additionalCost: number; // Fixed cost in currency units
}

/**
 * Frame materials with pricing modifiers
 */
export const FRAME_MATERIALS: readonly FrameMaterial[] = [
  {
    id: 'wood-oak',
    name: 'Oak Wood',
    description: 'Natural oak wood with visible grain patterns',
    priceModifier: 1.4, // 40% markup
    isPopular: true,
    displayOrder: 1,
  },
  {
    id: 'wood-walnut',
    name: 'Walnut Wood',
    description: 'Rich dark walnut wood with elegant finish',
    priceModifier: 1.6, // 60% markup
    isPopular: true,
    displayOrder: 2,
  },
  {
    id: 'wood-maple',
    name: 'Maple Wood',
    description: 'Light maple wood with smooth texture',
    priceModifier: 1.5, // 50% markup
    isPopular: false,
    displayOrder: 3,
  },
  {
    id: 'wood-bamboo',
    name: 'Bamboo',
    description: 'Sustainable bamboo with natural texture',
    priceModifier: 1.3, // 30% markup
    isPopular: false,
    displayOrder: 4,
  },
  {
    id: 'metal-aluminum',
    name: 'Aluminum',
    description: 'Sleek aluminum frame in various colors',
    priceModifier: 1.35, // 35% markup
    isPopular: true,
    displayOrder: 5,
  },
  {
    id: 'metal-brass',
    name: 'Brass',
    description: 'Premium brass frame with vintage appeal',
    priceModifier: 1.8, // 80% markup
    isPopular: false,
    displayOrder: 6,
  },
  {
    id: 'metal-steel',
    name: 'Steel',
    description: 'Industrial steel frame with modern look',
    priceModifier: 1.4, // 40% markup
    isPopular: false,
    displayOrder: 7,
  },
  {
    id: 'composite-mdf',
    name: 'MDF',
    description: 'Durable MDF composite with painted finish',
    priceModifier: 1.2, // 20% markup
    isPopular: true,
    displayOrder: 8,
  },
  {
    id: 'acrylic-clear',
    name: 'Clear Acrylic',
    description: 'Modern frameless acrylic with edge polish',
    priceModifier: 1.5, // 50% markup
    isPopular: true,
    displayOrder: 9,
  },
] as const;

/**
 * Frame types with descriptions
 */
export const FRAME_TYPES: readonly FrameType[] = [
  {
    id: 'frame-classic',
    name: 'Classic Frame',
    type: 'classic',
    description: 'Traditional frame with 1-2 inch border',
    materials: ['wood-oak', 'wood-walnut', 'wood-maple'],
    imageUrl: 'https://cdn.masonart.com/frames/classic.jpg',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'frame-modern',
    name: 'Modern Frame',
    type: 'modern',
    description: 'Sleek contemporary frame with minimal profile',
    materials: ['metal-aluminum', 'metal-steel', 'composite-mdf'],
    imageUrl: 'https://cdn.masonart.com/frames/modern.jpg',
    isActive: true,
    displayOrder: 2,
  },
  {
    id: 'frame-rustic',
    name: 'Rustic Frame',
    type: 'rustic',
    description: 'Distressed wood frame with vintage character',
    materials: ['wood-oak', 'wood-walnut', 'wood-bamboo'],
    imageUrl: 'https://cdn.masonart.com/frames/rustic.jpg',
    isActive: true,
    displayOrder: 3,
  },
  {
    id: 'frame-floating',
    name: 'Floating Frame',
    type: 'floating',
    description: 'Creates illusion of artwork floating in the frame',
    materials: ['wood-oak', 'wood-walnut', 'metal-aluminum'],
    imageUrl: 'https://cdn.masonart.com/frames/floating.jpg',
    isActive: true,
    displayOrder: 4,
  },
  {
    id: 'frame-gallery',
    name: 'Gallery Frame',
    type: 'gallery',
    description: 'Museum-quality frame with wide mat border',
    materials: ['wood-oak', 'wood-walnut', 'wood-maple', 'metal-brass'],
    imageUrl: 'https://cdn.masonart.com/frames/gallery.jpg',
    isActive: true,
    displayOrder: 5,
  },
  {
    id: 'frame-shadow-box',
    name: 'Shadow Box',
    type: 'shadow-box',
    description: 'Deep frame creating 3D shadow effect',
    materials: ['wood-oak', 'wood-walnut', 'composite-mdf'],
    imageUrl: 'https://cdn.masonart.com/frames/shadow-box.jpg',
    isActive: true,
    displayOrder: 6,
  },
  {
    id: 'frame-acrylic',
    name: 'Acrylic Frame',
    type: 'acrylic',
    description: 'Frameless modern acrylic display',
    materials: ['acrylic-clear'],
    imageUrl: 'https://cdn.masonart.com/frames/acrylic.jpg',
    isActive: true,
    displayOrder: 7,
  },
  {
    id: 'frame-ornate',
    name: 'Ornate Frame',
    type: 'ornate',
    description: 'Decorative frame with detailed molding',
    materials: ['wood-walnut', 'metal-brass'],
    imageUrl: 'https://cdn.masonart.com/frames/ornate.jpg',
    isActive: true,
    displayOrder: 8,
  },
] as const;

/**
 * Frame finishes and treatments
 */
export const FRAME_FINISHES: readonly FrameFinish[] = [
  {
    id: 'finish-natural',
    name: 'Natural',
    description: 'Natural wood finish with protective coating',
    additionalCost: 0,
  },
  {
    id: 'finish-stained',
    name: 'Stained',
    description: 'Custom stained finish in various colors',
    additionalCost: 15,
  },
  {
    id: 'finish-painted-white',
    name: 'Painted White',
    description: 'Clean white painted finish',
    additionalCost: 10,
  },
  {
    id: 'finish-painted-black',
    name: 'Painted Black',
    description: 'Classic black painted finish',
    additionalCost: 10,
  },
  {
    id: 'finish-distressed',
    name: 'Distressed',
    description: 'Weathered distressed finish for vintage look',
    additionalCost: 20,
  },
  {
    id: 'finish-metallic',
    name: 'Metallic',
    description: 'Metallic paint finish (gold, silver, bronze)',
    additionalCost: 25,
  },
] as const;

/**
 * Helper function to get frame material by ID
 */
export function getFrameMaterialById(id: string): FrameMaterial | undefined {
  return FRAME_MATERIALS.find((material) => material.id === id);
}

/**
 * Helper function to get frame type by ID
 */
export function getFrameTypeById(id: string): FrameType | undefined {
  return FRAME_TYPES.find((frame) => frame.id === id);
}

/**
 * Helper function to get frame finish by ID
 */
export function getFrameFinishById(id: string): FrameFinish | undefined {
  return FRAME_FINISHES.find((finish) => finish.id === id);
}

/**
 * Helper function to get popular frame materials
 */
export function getPopularFrameMaterials(): readonly FrameMaterial[] {
  return FRAME_MATERIALS.filter((material) => material.isPopular);
}

/**
 * Helper function to get active frame types
 */
export function getActiveFrameTypes(): readonly FrameType[] {
  return FRAME_TYPES.filter((frame) => frame.isActive);
}

/**
 * Helper function to get materials for a specific frame type
 */
export function getMaterialsForFrameType(frameTypeId: string): readonly FrameMaterial[] {
  const frameType = getFrameTypeById(frameTypeId);
  if (!frameType) return [];

  return FRAME_MATERIALS.filter((material) =>
    frameType.materials.includes(material.id)
  );
}

/**
 * Helper function to calculate frame price
 */
export function calculateFramePrice(
  basePrice: number,
  materialId: string,
  finishId?: string
): number {
  const material = getFrameMaterialById(materialId);
  if (!material) return basePrice;

  let price = basePrice * material.priceModifier;

  if (finishId) {
    const finish = getFrameFinishById(finishId);
    if (finish) {
      price += finish.additionalCost;
    }
  }

  return Math.round(price * 100) / 100; // Round to 2 decimal places
}

/**
 * Frame pricing constraints
 */
export const FRAME_CONSTRAINTS = {
  MIN_PRICE_MODIFIER: 1.0,
  MAX_PRICE_MODIFIER: 3.0,
  MIN_ADDITIONAL_COST: 0,
  MAX_ADDITIONAL_COST: 100,
} as const;
