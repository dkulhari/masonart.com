/**
 * Style Constants for MasonArt Platform
 *
 * Art style presets for AI generation and product categorization
 * Includes prompt modifiers, negative prompts, and generation parameters
 */

export interface StylePresetConfig {
  id: string;
  name: string;
  description: string;
  promptModifiers: string;
  negativePrompt: string;
  cfgScale: number;
  sampler: string;
  thumbnailUrl?: string;
  exampleImages?: readonly string[];
  isActive: boolean;
  category: 'modern' | 'traditional' | 'abstract' | 'nature' | 'minimalist';
  displayOrder: number;
}

export interface StyleCategory {
  id: string;
  name: string;
  description: string;
  styles: readonly string[]; // Style IDs
}

/**
 * AI Art Style Presets
 * These define the visual aesthetic for AI-generated posters
 */
export const STYLE_PRESETS: readonly StylePresetConfig[] = [
  {
    id: 'wabi-sabi',
    name: 'Wabi-Sabi',
    description: 'Japanese aesthetic embracing imperfection and transience',
    promptModifiers:
      'wabi-sabi aesthetic, imperfect beauty, natural textures, earth tones, minimalist composition, organic forms, zen simplicity',
    negativePrompt:
      'perfect, symmetrical, polished, artificial, bright colors, complex patterns, ornate details',
    cfgScale: 7.5,
    sampler: 'DPM++ 2M Karras',
    thumbnailUrl: 'https://cdn.masonart.com/styles/wabi-sabi.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/wabi-sabi-1.jpg',
      'https://cdn.masonart.com/examples/wabi-sabi-2.jpg',
    ],
    isActive: true,
    category: 'minimalist',
    displayOrder: 1,
  },
  {
    id: 'abstract-expression',
    name: 'Abstract Expression',
    description: 'Bold colors and emotional, gestural brushstrokes',
    promptModifiers:
      'abstract expressionism, bold brushstrokes, vibrant colors, emotional energy, dynamic composition, spontaneous marks, textured layers',
    negativePrompt:
      'realistic, detailed, representational, muted colors, static, photographic, precise',
    cfgScale: 8.0,
    sampler: 'DPM++ 2M Karras',
    thumbnailUrl: 'https://cdn.masonart.com/styles/abstract-expression.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/abstract-expression-1.jpg',
      'https://cdn.masonart.com/examples/abstract-expression-2.jpg',
    ],
    isActive: true,
    category: 'abstract',
    displayOrder: 2,
  },
  {
    id: 'botanical',
    name: 'Botanical',
    description: 'Detailed plant studies in vintage scientific illustration style',
    promptModifiers:
      'botanical illustration, scientific accuracy, detailed plant anatomy, vintage herbarium style, watercolor technique, natural history, delicate linework',
    negativePrompt:
      'cartoon, abstract, modern, artificial, simplified, digital art, 3D render',
    cfgScale: 7.0,
    sampler: 'Euler a',
    thumbnailUrl: 'https://cdn.masonart.com/styles/botanical.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/botanical-1.jpg',
      'https://cdn.masonart.com/examples/botanical-2.jpg',
    ],
    isActive: true,
    category: 'nature',
    displayOrder: 3,
  },
  {
    id: 'vintage-poster',
    name: 'Vintage Poster',
    description: 'Mid-century travel poster aesthetic with bold typography',
    promptModifiers:
      'vintage travel poster, mid-century modern, bold typography, limited color palette, screen print style, retro illustration, geometric shapes',
    negativePrompt:
      'modern, photographic, detailed, 3D, gradient, complex shadows, realistic texture',
    cfgScale: 7.5,
    sampler: 'Euler a',
    thumbnailUrl: 'https://cdn.masonart.com/styles/vintage-poster.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/vintage-poster-1.jpg',
      'https://cdn.masonart.com/examples/vintage-poster-2.jpg',
    ],
    isActive: true,
    category: 'traditional',
    displayOrder: 4,
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Clean, simple forms with intentional negative space',
    promptModifiers:
      'minimalist design, clean lines, simple shapes, negative space, limited color palette, balanced composition, modern aesthetic, subtle elegance',
    negativePrompt:
      'complex, detailed, ornate, cluttered, busy, textured, decorative, excessive elements',
    cfgScale: 6.5,
    sampler: 'DPM++ SDE Karras',
    thumbnailUrl: 'https://cdn.masonart.com/styles/minimalist.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/minimalist-1.jpg',
      'https://cdn.masonart.com/examples/minimalist-2.jpg',
    ],
    isActive: true,
    category: 'minimalist',
    displayOrder: 5,
  },
  {
    id: 'geometric',
    name: 'Geometric',
    description: 'Bold geometric patterns and shapes with modern color palettes',
    promptModifiers:
      'geometric art, bold shapes, mathematical patterns, modern color blocking, precise forms, symmetry, clean edges, contemporary design',
    negativePrompt:
      'organic, flowing, curved, soft, natural, hand-drawn, irregular, imperfect',
    cfgScale: 7.0,
    sampler: 'Euler a',
    thumbnailUrl: 'https://cdn.masonart.com/styles/geometric.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/geometric-1.jpg',
      'https://cdn.masonart.com/examples/geometric-2.jpg',
    ],
    isActive: true,
    category: 'modern',
    displayOrder: 6,
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    description: 'Soft, fluid watercolor paintings with organic color blending',
    promptModifiers:
      'watercolor painting, soft edges, color bleeding, transparent layers, fluid brushwork, organic textures, delicate washes, artistic spontaneity',
    negativePrompt:
      'digital, hard edges, opaque, flat colors, precise, geometric, vector art, sharp details',
    cfgScale: 7.5,
    sampler: 'DPM++ 2M Karras',
    thumbnailUrl: 'https://cdn.masonart.com/styles/watercolor.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/watercolor-1.jpg',
      'https://cdn.masonart.com/examples/watercolor-2.jpg',
    ],
    isActive: true,
    category: 'traditional',
    displayOrder: 7,
  },
  {
    id: 'line-art',
    name: 'Line Art',
    description: 'Clean, continuous line drawings with elegant simplicity',
    promptModifiers:
      'continuous line drawing, single line art, elegant linework, minimalist illustration, flowing contours, artistic economy, expressive strokes',
    negativePrompt:
      'colored, filled, shaded, textured, complex, detailed background, photographic, realistic',
    cfgScale: 6.0,
    sampler: 'Euler a',
    thumbnailUrl: 'https://cdn.masonart.com/styles/line-art.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/line-art-1.jpg',
      'https://cdn.masonart.com/examples/line-art-2.jpg',
    ],
    isActive: true,
    category: 'minimalist',
    displayOrder: 8,
  },
  {
    id: 'pop-art',
    name: 'Pop Art',
    description: 'Bold, vibrant colors inspired by 1960s pop culture',
    promptModifiers:
      'pop art style, bold colors, high contrast, halftone dots, comic book aesthetic, vibrant palette, graphic design, cultural iconography',
    negativePrompt:
      'muted, subtle, realistic, traditional, detailed shading, natural colors, subdued',
    cfgScale: 8.0,
    sampler: 'DPM++ SDE Karras',
    thumbnailUrl: 'https://cdn.masonart.com/styles/pop-art.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/pop-art-1.jpg',
      'https://cdn.masonart.com/examples/pop-art-2.jpg',
    ],
    isActive: true,
    category: 'modern',
    displayOrder: 9,
  },
  {
    id: 'surrealism',
    name: 'Surrealism',
    description: 'Dreamlike, fantastical imagery with unexpected juxtapositions',
    promptModifiers:
      'surrealism, dreamlike atmosphere, impossible scenarios, fantastical elements, symbolic imagery, subconscious exploration, unexpected combinations',
    negativePrompt:
      'realistic, mundane, ordinary, logical, conventional, straightforward, documentary',
    cfgScale: 8.5,
    sampler: 'DPM++ 2M Karras',
    thumbnailUrl: 'https://cdn.masonart.com/styles/surrealism.jpg',
    exampleImages: [
      'https://cdn.masonart.com/examples/surrealism-1.jpg',
      'https://cdn.masonart.com/examples/surrealism-2.jpg',
    ],
    isActive: true,
    category: 'abstract',
    displayOrder: 10,
  },
] as const;

/**
 * Style categories for organizing presets
 */
export const STYLE_CATEGORIES: readonly StyleCategory[] = [
  {
    id: 'modern',
    name: 'Modern',
    description: 'Contemporary and bold artistic styles',
    styles: ['geometric', 'pop-art'],
  },
  {
    id: 'traditional',
    name: 'Traditional',
    description: 'Classic artistic techniques and aesthetics',
    styles: ['vintage-poster', 'watercolor'],
  },
  {
    id: 'abstract',
    name: 'Abstract',
    description: 'Non-representational and expressive styles',
    styles: ['abstract-expression', 'surrealism'],
  },
  {
    id: 'nature',
    name: 'Nature',
    description: 'Organic and natural world inspired',
    styles: ['botanical'],
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Simple, clean, and intentional designs',
    styles: ['wabi-sabi', 'minimalist', 'line-art'],
  },
] as const;

/**
 * Helper function to get style preset by ID
 */
export function getStylePresetById(id: string): StylePresetConfig | undefined {
  return STYLE_PRESETS.find((style) => style.id === id);
}

/**
 * Helper function to get style category by ID
 */
export function getStyleCategoryById(id: string): StyleCategory | undefined {
  return STYLE_CATEGORIES.find((category) => category.id === id);
}

/**
 * Helper function to get active style presets
 */
export function getActiveStylePresets(): readonly StylePresetConfig[] {
  return STYLE_PRESETS.filter((style) => style.isActive);
}

/**
 * Helper function to get styles by category
 */
export function getStylesByCategory(categoryId: string): readonly StylePresetConfig[] {
  const category = getStyleCategoryById(categoryId);
  if (!category) return [];

  return STYLE_PRESETS.filter((style) => category.styles.includes(style.id));
}

/**
 * Helper function to validate style preset ID
 */
export function isValidStylePreset(id: string): boolean {
  return STYLE_PRESETS.some((style) => style.id === id);
}

/**
 * AI generation parameter constraints
 */
export const STYLE_CONSTRAINTS = {
  MIN_CFG_SCALE: 1,
  MAX_CFG_SCALE: 20,
  DEFAULT_CFG_SCALE: 7.5,
  MIN_STEPS: 20,
  MAX_STEPS: 150,
  DEFAULT_STEPS: 50,
  MAX_PROMPT_LENGTH: 1000,
  MAX_NEGATIVE_PROMPT_LENGTH: 1000,
} as const;

/**
 * Available samplers for AI generation
 */
export const AVAILABLE_SAMPLERS = [
  'Euler a',
  'Euler',
  'DPM++ 2M Karras',
  'DPM++ SDE Karras',
  'DPM++ 2S a Karras',
  'DDIM',
  'PLMS',
  'UniPC',
] as const;

export type Sampler = (typeof AVAILABLE_SAMPLERS)[number];
