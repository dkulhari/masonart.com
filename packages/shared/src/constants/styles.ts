/**
 * Style Constants for MasonArt Platform
 *
 * Defines all style presets, subjects, colors, rooms, and collections
 * based on the requirements specification (Sections 4.1 and 6.2).
 */

import type {
  PosterStyle,
  PosterSubject,
  ProductColor,
  RoomType,
  PosterOrientation,
  CollectionType,
} from '../types/product';

// ============================================================================
// Style Definitions
// ============================================================================

/**
 * Style configuration with display name and description
 */
export interface StyleConfig {
  /** Style identifier (matches PosterStyle type) */
  id: PosterStyle;
  /** Display name for UI */
  name: string;
  /** Description for tooltips and detail views */
  description: string;
  /** Keywords for search and SEO */
  keywords: string[];
  /** Related styles for suggestions */
  relatedStyles: PosterStyle[];
}

/**
 * All poster styles with their configurations
 */
export const STYLE_CONFIGS: readonly StyleConfig[] = [
  {
    id: 'wabi-sabi',
    name: 'Wabi-Sabi',
    description: 'Embracing imperfection and transience with minimalist, organic aesthetics',
    keywords: ['imperfect', 'organic', 'natural', 'minimal', 'japanese', 'zen'],
    relatedStyles: ['minimalist', 'texture-art', 'abstract'],
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Clean lines and simple forms, focusing on essential elements',
    keywords: ['simple', 'clean', 'modern', 'sleek', 'understated'],
    relatedStyles: ['wabi-sabi', 'modern-contemporary', 'abstract'],
  },
  {
    id: 'abstract',
    name: 'Abstract',
    description: 'Non-representational art focusing on color, shape, and emotion',
    keywords: ['expressive', 'colorful', 'modern', 'artistic', 'creative'],
    relatedStyles: ['modern-contemporary', 'minimalist', 'texture-art'],
  },
  {
    id: 'modern-contemporary',
    name: 'Modern Contemporary',
    description: 'Current artistic trends blending traditional and modern elements',
    keywords: ['contemporary', 'modern', 'trendy', 'current', 'stylish'],
    relatedStyles: ['abstract', 'minimalist', 'pop-art'],
  },
  {
    id: 'vintage',
    name: 'Vintage',
    description: 'Classic designs with nostalgic appeal from past eras',
    keywords: ['classic', 'nostalgic', 'antique', 'old-world', 'timeless'],
    relatedStyles: ['retro', 'photographic', 'typography'],
  },
  {
    id: 'retro',
    name: 'Retro',
    description: 'Bold, colorful designs inspired by mid-century aesthetics',
    keywords: ['60s', '70s', 'mid-century', 'colorful', 'groovy'],
    relatedStyles: ['vintage', 'pop-art', 'typography'],
  },
  {
    id: 'pop-art',
    name: 'Pop Art',
    description: 'Bold colors and graphic imagery inspired by popular culture',
    keywords: ['bold', 'colorful', 'graphic', 'fun', 'vibrant'],
    relatedStyles: ['retro', 'modern-contemporary', 'abstract'],
  },
  {
    id: 'bohemian',
    name: 'Bohemian',
    description: 'Eclectic, free-spirited designs with rich colors and patterns',
    keywords: ['boho', 'eclectic', 'free-spirited', 'colorful', 'artistic'],
    relatedStyles: ['texture-art', 'abstract', 'vintage'],
  },
  {
    id: 'surrealist',
    name: 'Surrealist',
    description: 'Dreamlike imagery that challenges reality and logic',
    keywords: ['dream', 'fantasy', 'imaginative', 'unusual', 'creative'],
    relatedStyles: ['abstract', 'photographic', 'modern-contemporary'],
  },
  {
    id: 'photographic',
    name: 'Photographic',
    description: 'High-quality photography capturing real moments and scenes',
    keywords: ['photo', 'realistic', 'documentary', 'nature', 'landscape'],
    relatedStyles: ['vintage', 'modern-contemporary', 'surrealist'],
  },
  {
    id: 'typography',
    name: 'Typography',
    description: 'Text-focused designs featuring beautiful lettering and fonts',
    keywords: ['text', 'letters', 'fonts', 'words', 'quotes'],
    relatedStyles: ['quotes', 'minimalist', 'retro'],
  },
  {
    id: 'quotes',
    name: 'Quotes',
    description: 'Inspiring and motivational words beautifully designed',
    keywords: ['inspiration', 'motivation', 'words', 'sayings', 'text'],
    relatedStyles: ['typography', 'minimalist', 'modern-contemporary'],
  },
  {
    id: 'texture-art',
    name: 'Texture Art',
    description: 'Focus on tactile qualities and surface textures',
    keywords: ['tactile', 'surface', 'material', 'organic', 'natural'],
    relatedStyles: ['wabi-sabi', 'abstract', 'bohemian'],
  },
] as const;

/**
 * All poster style IDs
 */
export const ALL_STYLES: readonly PosterStyle[] = STYLE_CONFIGS.map((s) => s.id);

/**
 * Map of style IDs to style configs for quick lookup
 */
export const STYLE_BY_ID: ReadonlyMap<PosterStyle, StyleConfig> = new Map(
  STYLE_CONFIGS.map((style) => [style.id, style])
);

// ============================================================================
// Subject Definitions
// ============================================================================

/**
 * Subject configuration with display name and description
 */
export interface SubjectConfig {
  /** Subject identifier (matches PosterSubject type) */
  id: PosterSubject;
  /** Display name for UI */
  name: string;
  /** Description for tooltips */
  description: string;
  /** Keywords for search and SEO */
  keywords: string[];
}

/**
 * All poster subjects with their configurations
 */
export const SUBJECT_CONFIGS: readonly SubjectConfig[] = [
  {
    id: 'nature-landscape',
    name: 'Nature & Landscape',
    description: 'Scenic views of natural landscapes, forests, and outdoor scenes',
    keywords: ['nature', 'landscape', 'outdoor', 'forest', 'scenery', 'trees'],
  },
  {
    id: 'flowers-botanical',
    name: 'Flowers & Botanical',
    description: 'Beautiful floral arrangements and botanical illustrations',
    keywords: ['flowers', 'botanical', 'plants', 'garden', 'floral', 'bloom'],
  },
  {
    id: 'animals',
    name: 'Animals',
    description: 'Wildlife, pets, and animal portraits',
    keywords: ['animals', 'wildlife', 'pets', 'creatures', 'fauna'],
  },
  {
    id: 'abstract-geometric',
    name: 'Abstract & Geometric',
    description: 'Non-representational shapes, patterns, and geometric designs',
    keywords: ['abstract', 'geometric', 'shapes', 'patterns', 'modern'],
  },
  {
    id: 'people-portraits',
    name: 'People & Portraits',
    description: 'Human figures, faces, and portrait photography',
    keywords: ['people', 'portraits', 'faces', 'human', 'figures'],
  },
  {
    id: 'city-architecture',
    name: 'City & Architecture',
    description: 'Urban landscapes, buildings, and architectural details',
    keywords: ['city', 'architecture', 'urban', 'buildings', 'skyline'],
  },
  {
    id: 'sea-ocean',
    name: 'Sea & Ocean',
    description: 'Coastal scenes, marine life, and oceanic imagery',
    keywords: ['sea', 'ocean', 'beach', 'coastal', 'marine', 'waves'],
  },
  {
    id: 'mountains',
    name: 'Mountains',
    description: 'Mountain ranges, peaks, and alpine scenery',
    keywords: ['mountains', 'peaks', 'alpine', 'hills', 'highlands'],
  },
  {
    id: 'motivational',
    name: 'Motivational',
    description: 'Inspiring quotes and uplifting messages',
    keywords: ['motivational', 'inspiration', 'quotes', 'positive', 'uplifting'],
  },
  {
    id: 'ai-generated',
    name: 'AI Generated',
    description: 'Custom artwork created using AI technology',
    keywords: ['ai', 'generated', 'custom', 'unique', 'personalized'],
  },
] as const;

/**
 * All poster subject IDs
 */
export const ALL_SUBJECTS: readonly PosterSubject[] = SUBJECT_CONFIGS.map((s) => s.id);

/**
 * Map of subject IDs to subject configs for quick lookup
 */
export const SUBJECT_BY_ID: ReadonlyMap<PosterSubject, SubjectConfig> = new Map(
  SUBJECT_CONFIGS.map((subject) => [subject.id, subject])
);

// ============================================================================
// Color Definitions
// ============================================================================

/**
 * Color configuration with display name and hex value
 */
export interface ColorConfig {
  /** Color identifier (matches ProductColor type) */
  id: ProductColor;
  /** Display name for UI */
  name: string;
  /** Hex color code for display */
  hex: string;
  /** Alternative hex codes for multi-tone colors */
  altHex?: string[];
  /** Description */
  description: string;
}

/**
 * All product colors with their configurations
 */
export const COLOR_CONFIGS: readonly ColorConfig[] = [
  {
    id: 'black',
    name: 'Black',
    hex: '#000000',
    description: 'Deep black tones',
  },
  {
    id: 'white',
    name: 'White',
    hex: '#FFFFFF',
    description: 'Pure white tones',
  },
  {
    id: 'beige',
    name: 'Beige',
    hex: '#F5F5DC',
    description: 'Warm beige tones',
  },
  {
    id: 'neutral',
    name: 'Neutral',
    hex: '#D3D3D3',
    description: 'Neutral grey and taupe tones',
  },
  {
    id: 'blue',
    name: 'Blue',
    hex: '#4169E1',
    description: 'Various shades of blue',
  },
  {
    id: 'green',
    name: 'Green',
    hex: '#228B22',
    description: 'Natural green tones',
  },
  {
    id: 'gold',
    name: 'Gold',
    hex: '#FFD700',
    description: 'Warm gold and amber tones',
  },
  {
    id: 'pink',
    name: 'Pink',
    hex: '#FF69B4',
    description: 'Soft to vibrant pink tones',
  },
  {
    id: 'red',
    name: 'Red',
    hex: '#DC143C',
    description: 'Bold red tones',
  },
  {
    id: 'grey',
    name: 'Grey',
    hex: '#808080',
    description: 'Various shades of grey',
  },
  {
    id: 'black-white',
    name: 'Black & White',
    hex: '#000000',
    altHex: ['#FFFFFF'],
    description: 'Monochrome black and white',
  },
  {
    id: 'colorful',
    name: 'Colorful',
    hex: '#FF6B6B',
    altHex: ['#4ECDC4', '#FFE66D', '#95E1D3'],
    description: 'Vibrant multi-colored',
  },
  {
    id: 'multi',
    name: 'Multi-Color',
    hex: '#FF6B6B',
    altHex: ['#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'],
    description: 'Multiple colors combined',
  },
  {
    id: 'earth-tones',
    name: 'Earth Tones',
    hex: '#8B4513',
    altHex: ['#A0522D', '#D2691E', '#BC8F8F'],
    description: 'Natural earthy colors',
  },
] as const;

/**
 * All product color IDs
 */
export const ALL_COLORS: readonly ProductColor[] = COLOR_CONFIGS.map((c) => c.id);

/**
 * Map of color IDs to color configs for quick lookup
 */
export const COLOR_BY_ID: ReadonlyMap<ProductColor, ColorConfig> = new Map(
  COLOR_CONFIGS.map((color) => [color.id, color])
);

// ============================================================================
// Room Definitions
// ============================================================================

/**
 * Room configuration with display name and description
 */
export interface RoomConfig {
  /** Room identifier (matches RoomType type) */
  id: RoomType;
  /** Display name for UI */
  name: string;
  /** Description */
  description: string;
  /** Recommended styles for this room */
  recommendedStyles: PosterStyle[];
  /** Recommended colors for this room */
  recommendedColors: ProductColor[];
}

/**
 * All room types with their configurations
 */
export const ROOM_CONFIGS: readonly RoomConfig[] = [
  {
    id: 'living-room',
    name: 'Living Room',
    description: 'The heart of the home, perfect for statement pieces',
    recommendedStyles: ['modern-contemporary', 'abstract', 'photographic'],
    recommendedColors: ['neutral', 'earth-tones', 'blue'],
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    description: 'A peaceful retreat for relaxing artwork',
    recommendedStyles: ['minimalist', 'wabi-sabi', 'abstract'],
    recommendedColors: ['beige', 'white', 'grey'],
  },
  {
    id: 'office',
    name: 'Office',
    description: 'Professional space for inspiring or calming pieces',
    recommendedStyles: ['minimalist', 'typography', 'quotes'],
    recommendedColors: ['black-white', 'blue', 'grey'],
  },
  {
    id: 'kitchen-dining',
    name: 'Kitchen & Dining',
    description: 'Spaces for food, family, and vibrant art',
    recommendedStyles: ['vintage', 'pop-art', 'photographic'],
    recommendedColors: ['colorful', 'green', 'gold'],
  },
  {
    id: 'kids-room',
    name: 'Kids Room',
    description: 'Playful and imaginative spaces',
    recommendedStyles: ['pop-art', 'surrealist', 'bohemian'],
    recommendedColors: ['colorful', 'pink', 'blue'],
  },
  {
    id: 'bathroom',
    name: 'Bathroom',
    description: 'Spa-like atmosphere with calming imagery',
    recommendedStyles: ['minimalist', 'photographic', 'wabi-sabi'],
    recommendedColors: ['white', 'beige', 'blue'],
  },
  {
    id: 'entryway',
    name: 'Entryway',
    description: 'First impressions with welcoming art',
    recommendedStyles: ['modern-contemporary', 'abstract', 'typography'],
    recommendedColors: ['neutral', 'gold', 'black-white'],
  },
] as const;

/**
 * All room type IDs
 */
export const ALL_ROOMS: readonly RoomType[] = ROOM_CONFIGS.map((r) => r.id);

/**
 * Map of room IDs to room configs for quick lookup
 */
export const ROOM_BY_ID: ReadonlyMap<RoomType, RoomConfig> = new Map(
  ROOM_CONFIGS.map((room) => [room.id, room])
);

// ============================================================================
// Orientation Definitions
// ============================================================================

/**
 * Orientation configuration with display name and description
 */
export interface OrientationConfig {
  /** Orientation identifier (matches PosterOrientation type) */
  id: PosterOrientation;
  /** Display name for UI */
  name: string;
  /** Description */
  description: string;
  /** Icon name for UI (optional) */
  iconName?: string;
}

/**
 * All orientations with their configurations
 */
export const ORIENTATION_CONFIGS: readonly OrientationConfig[] = [
  {
    id: 'square',
    name: 'Square',
    description: 'Equal width and height',
    iconName: 'square',
  },
  {
    id: 'portrait',
    name: 'Portrait (Vertical)',
    description: 'Taller than wide, vertical orientation',
    iconName: 'rectangle-portrait',
  },
  {
    id: 'landscape',
    name: 'Landscape (Horizontal)',
    description: 'Wider than tall, horizontal orientation',
    iconName: 'rectangle-landscape',
  },
  {
    id: 'panoramic',
    name: 'Panoramic',
    description: 'Extra wide for sweeping views',
    iconName: 'rectangle-wide',
  },
  {
    id: 'round',
    name: 'Round',
    description: 'Circular format',
    iconName: 'circle',
  },
  {
    id: 'circular',
    name: 'Circular',
    description: 'Circular format (alternative)',
    iconName: 'circle',
  },
  {
    id: 'diptych',
    name: 'Diptych (Set of 2)',
    description: 'Two-piece artwork set',
    iconName: 'grid-2',
  },
  {
    id: 'triptych',
    name: 'Triptych (Set of 3)',
    description: 'Three-piece artwork set',
    iconName: 'grid-3',
  },
] as const;

/**
 * All orientation IDs
 */
export const ALL_ORIENTATIONS: readonly PosterOrientation[] = ORIENTATION_CONFIGS.map((o) => o.id);

/**
 * Map of orientation IDs to orientation configs for quick lookup
 */
export const ORIENTATION_BY_ID: ReadonlyMap<PosterOrientation, OrientationConfig> = new Map(
  ORIENTATION_CONFIGS.map((orientation) => [orientation.id, orientation])
);

// ============================================================================
// Collection Type Definitions
// ============================================================================

/**
 * Collection type configuration with display name and description
 */
export interface CollectionTypeConfig {
  /** Collection type identifier (matches CollectionType type) */
  id: CollectionType;
  /** Display name for UI */
  name: string;
  /** Description */
  description: string;
  /** Whether this collection should be featured */
  isFeatured: boolean;
}

/**
 * All collection types with their configurations
 */
export const COLLECTION_TYPE_CONFIGS: readonly CollectionTypeConfig[] = [
  {
    id: 'new-arrivals',
    name: 'New Arrivals',
    description: 'Recently added products',
    isFeatured: true,
  },
  {
    id: 'best-sellers',
    name: 'Best Sellers',
    description: 'Top selling products',
    isFeatured: true,
  },
  {
    id: 'staff-picks',
    name: 'Staff Picks',
    description: 'Curated selections by our team',
    isFeatured: true,
  },
  {
    id: 'seasonal',
    name: 'Seasonal Collections',
    description: 'Themed collections for the season',
    isFeatured: true,
  },
  {
    id: 'sale',
    name: 'Sale',
    description: 'Discounted products',
    isFeatured: true,
  },
  {
    id: 'ai-generated-gallery',
    name: 'AI Generated Gallery',
    description: 'Community AI-generated artwork',
    isFeatured: true,
  },
] as const;

/**
 * All collection type IDs
 */
export const ALL_COLLECTION_TYPES: readonly CollectionType[] = COLLECTION_TYPE_CONFIGS.map(
  (c) => c.id
);

/**
 * Map of collection type IDs to collection type configs
 */
export const COLLECTION_TYPE_BY_ID: ReadonlyMap<CollectionType, CollectionTypeConfig> = new Map(
  COLLECTION_TYPE_CONFIGS.map((config) => [config.id, config])
);

// ============================================================================
// AI Style Presets (for AI Generator)
// ============================================================================

/**
 * AI Style preset definition with prompt hints
 * Note: This complements the AIStylePreset type in types/ai.ts
 */
export interface AIStylePresetDefinition {
  /** Style preset ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** AI model tuning notes */
  modelTuning: string;
  /** Mapping to PosterStyle for categorization */
  posterStyle: PosterStyle;
  /** Example prompt keywords */
  promptKeywords: string[];
  /** Default negative prompts */
  negativePrompts: string[];
}

/**
 * AI style presets for the AI poster generator
 */
export const AI_STYLE_PRESETS: readonly AIStylePresetDefinition[] = [
  {
    id: 'ai-wabi-sabi',
    name: 'Wabi-Sabi',
    description: 'Minimalist, imperfect, neutral tones',
    modelTuning: 'Muted colors, texture, organic imperfections',
    posterStyle: 'wabi-sabi',
    promptKeywords: ['minimalist', 'organic', 'neutral', 'texture', 'imperfect', 'zen'],
    negativePrompts: ['saturated', 'bright', 'perfect', 'symmetrical'],
  },
  {
    id: 'ai-abstract-expression',
    name: 'Abstract Expression',
    description: 'Bold, emotional, gestural strokes',
    modelTuning: 'High contrast, movement, expressive brushwork',
    posterStyle: 'abstract',
    promptKeywords: ['bold', 'emotional', 'gestural', 'expressive', 'dynamic'],
    negativePrompts: ['realistic', 'detailed', 'photographic'],
  },
  {
    id: 'ai-botanical',
    name: 'Botanical',
    description: 'Floral, nature-inspired designs',
    modelTuning: 'Soft, organic, natural color palette',
    posterStyle: 'photographic',
    promptKeywords: ['floral', 'botanical', 'plants', 'nature', 'organic', 'soft'],
    negativePrompts: ['artificial', 'neon', 'harsh'],
  },
  {
    id: 'ai-geometric-modern',
    name: 'Geometric Modern',
    description: 'Clean lines, shapes, structured designs',
    modelTuning: 'Precise, structured, bold shapes',
    posterStyle: 'minimalist',
    promptKeywords: ['geometric', 'modern', 'clean', 'shapes', 'structured', 'precise'],
    negativePrompts: ['organic', 'messy', 'chaotic'],
  },
  {
    id: 'ai-vintage-poster',
    name: 'Vintage Poster',
    description: 'Retro, nostalgic feel with grain',
    modelTuning: 'Grain, warm tones, aged appearance',
    posterStyle: 'vintage',
    promptKeywords: ['vintage', 'retro', 'nostalgic', 'aged', 'warm', 'grain'],
    negativePrompts: ['modern', 'digital', 'clean'],
  },
  {
    id: 'ai-pop-art',
    name: 'Pop Art',
    description: 'Bold, colorful, graphic style',
    modelTuning: 'High saturation, bold outlines, flat colors',
    posterStyle: 'pop-art',
    promptKeywords: ['bold', 'colorful', 'pop', 'graphic', 'vibrant', 'flat'],
    negativePrompts: ['muted', 'realistic', 'subtle'],
  },
  {
    id: 'ai-watercolor',
    name: 'Watercolor',
    description: 'Soft, flowing, artistic effects',
    modelTuning: 'Bleed effects, soft edges, transparent layers',
    posterStyle: 'abstract',
    promptKeywords: ['watercolor', 'soft', 'flowing', 'artistic', 'transparent', 'fluid'],
    negativePrompts: ['sharp', 'digital', 'harsh'],
  },
  {
    id: 'ai-photography',
    name: 'Photography',
    description: 'Realistic, detailed imagery',
    modelTuning: 'Photorealistic, high detail, natural lighting',
    posterStyle: 'photographic',
    promptKeywords: ['photorealistic', 'detailed', 'realistic', 'photography', 'natural'],
    negativePrompts: ['illustration', 'cartoon', 'abstract'],
  },
  {
    id: 'ai-line-art',
    name: 'Line Art',
    description: 'Minimalist single-stroke designs',
    modelTuning: 'Single stroke style, continuous lines, minimal',
    posterStyle: 'minimalist',
    promptKeywords: ['line', 'minimal', 'stroke', 'simple', 'outline', 'continuous'],
    negativePrompts: ['filled', 'colorful', 'complex'],
  },
  {
    id: 'ai-typography',
    name: 'Typography',
    description: 'Text-focused artistic designs',
    modelTuning: 'Clean type, layout focus, readable',
    posterStyle: 'typography',
    promptKeywords: ['typography', 'text', 'letters', 'words', 'layout', 'fonts'],
    negativePrompts: ['imagery', 'illustration', 'complex'],
  },
] as const;

/**
 * Map of AI style preset IDs to presets
 */
export const AI_STYLE_BY_ID: ReadonlyMap<string, AIStylePresetDefinition> = new Map(
  AI_STYLE_PRESETS.map((preset) => [preset.id, preset])
);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get style config by ID
 */
export const getStyleById = (id: PosterStyle): StyleConfig | undefined => {
  return STYLE_BY_ID.get(id);
};

/**
 * Get subject config by ID
 */
export const getSubjectById = (id: PosterSubject): SubjectConfig | undefined => {
  return SUBJECT_BY_ID.get(id);
};

/**
 * Get color config by ID
 */
export const getColorById = (id: ProductColor): ColorConfig | undefined => {
  return COLOR_BY_ID.get(id);
};

/**
 * Get room config by ID
 */
export const getRoomById = (id: RoomType): RoomConfig | undefined => {
  return ROOM_BY_ID.get(id);
};

/**
 * Get orientation config by ID
 */
export const getOrientationById = (id: PosterOrientation): OrientationConfig | undefined => {
  return ORIENTATION_BY_ID.get(id);
};

/**
 * Get AI style preset by ID
 */
export const getAIStyleById = (id: string): AIStylePresetDefinition | undefined => {
  return AI_STYLE_BY_ID.get(id);
};

/**
 * Get recommended styles for a room
 */
export const getStylesForRoom = (roomId: RoomType): readonly PosterStyle[] => {
  const room = ROOM_BY_ID.get(roomId);
  return room?.recommendedStyles ?? [];
};

/**
 * Get recommended colors for a room
 */
export const getColorsForRoom = (roomId: RoomType): readonly ProductColor[] => {
  const room = ROOM_BY_ID.get(roomId);
  return room?.recommendedColors ?? [];
};

/**
 * Get related styles for a given style
 */
export const getRelatedStyles = (styleId: PosterStyle): readonly PosterStyle[] => {
  const style = STYLE_BY_ID.get(styleId);
  return style?.relatedStyles ?? [];
};

/**
 * Search styles by keyword
 */
export const searchStylesByKeyword = (keyword: string): readonly StyleConfig[] => {
  const lowerKeyword = keyword.toLowerCase();
  return STYLE_CONFIGS.filter(
    (style) =>
      style.name.toLowerCase().includes(lowerKeyword) ||
      style.description.toLowerCase().includes(lowerKeyword) ||
      style.keywords.some((k) => k.toLowerCase().includes(lowerKeyword))
  );
};

/**
 * Search subjects by keyword
 */
export const searchSubjectsByKeyword = (keyword: string): readonly SubjectConfig[] => {
  const lowerKeyword = keyword.toLowerCase();
  return SUBJECT_CONFIGS.filter(
    (subject) =>
      subject.name.toLowerCase().includes(lowerKeyword) ||
      subject.description.toLowerCase().includes(lowerKeyword) ||
      subject.keywords.some((k) => k.toLowerCase().includes(lowerKeyword))
  );
};
