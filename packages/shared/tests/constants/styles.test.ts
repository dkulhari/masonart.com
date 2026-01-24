/**
 * Style Constants Tests
 *
 * Comprehensive tests for style, subject, color, room, orientation, and AI preset constants including:
 * - Style configurations (STYLE_CONFIGS, ALL_STYLES, STYLE_BY_ID)
 * - Subject configurations (SUBJECT_CONFIGS, ALL_SUBJECTS, SUBJECT_BY_ID)
 * - Color configurations (COLOR_CONFIGS, ALL_COLORS, COLOR_BY_ID)
 * - Room configurations (ROOM_CONFIGS, ALL_ROOMS, ROOM_BY_ID)
 * - Orientation configurations (ORIENTATION_CONFIGS, ALL_ORIENTATIONS, ORIENTATION_BY_ID)
 * - Collection type configurations (COLLECTION_TYPE_CONFIGS, ALL_COLLECTION_TYPES, COLLECTION_TYPE_BY_ID)
 * - AI style presets (AI_STYLE_PRESETS, AI_STYLE_BY_ID)
 * - Helper functions for lookup and search
 */

import { describe, it, expect } from 'vitest';
import {
  // Style constants
  STYLE_CONFIGS,
  ALL_STYLES,
  STYLE_BY_ID,
  // Subject constants
  SUBJECT_CONFIGS,
  ALL_SUBJECTS,
  SUBJECT_BY_ID,
  // Color constants
  COLOR_CONFIGS,
  ALL_COLORS,
  COLOR_BY_ID,
  // Room constants
  ROOM_CONFIGS,
  ALL_ROOMS,
  ROOM_BY_ID,
  // Orientation constants
  ORIENTATION_CONFIGS,
  ALL_ORIENTATIONS,
  ORIENTATION_BY_ID,
  // Collection type constants
  COLLECTION_TYPE_CONFIGS,
  ALL_COLLECTION_TYPES,
  COLLECTION_TYPE_BY_ID,
  // AI style presets
  AI_STYLE_PRESETS,
  AI_STYLE_BY_ID,
  // Helper functions
  getStyleById,
  getSubjectById,
  getColorById,
  getRoomById,
  getOrientationById,
  getAIStyleById,
  getStylesForRoom,
  getColorsForRoom,
  getRelatedStyles,
  searchStylesByKeyword,
  searchSubjectsByKeyword,
} from '../../src/constants/styles.js';

// ============================================================================
// Style Configs Tests
// ============================================================================

describe('STYLE_CONFIGS constant', () => {
  it('should have 13 style configurations', () => {
    expect(STYLE_CONFIGS.length).toBe(13);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(STYLE_CONFIGS)).toBe(true);
  });

  it('should have correct structure for each style', () => {
    STYLE_CONFIGS.forEach((style) => {
      expect(style).toHaveProperty('id');
      expect(style).toHaveProperty('name');
      expect(style).toHaveProperty('description');
      expect(style).toHaveProperty('keywords');
      expect(style).toHaveProperty('relatedStyles');
    });
  });

  it('should have wabi-sabi style', () => {
    const wabiSabi = STYLE_CONFIGS.find((s) => s.id === 'wabi-sabi');
    expect(wabiSabi).toBeDefined();
    expect(wabiSabi?.name).toBe('Wabi-Sabi');
    expect(wabiSabi?.description).toContain('imperfection');
  });

  it('should have minimalist style', () => {
    const minimalist = STYLE_CONFIGS.find((s) => s.id === 'minimalist');
    expect(minimalist).toBeDefined();
    expect(minimalist?.name).toBe('Minimalist');
  });

  it('should have abstract style', () => {
    const abstract = STYLE_CONFIGS.find((s) => s.id === 'abstract');
    expect(abstract).toBeDefined();
    expect(abstract?.name).toBe('Abstract');
  });

  it('should have modern-contemporary style', () => {
    const modern = STYLE_CONFIGS.find((s) => s.id === 'modern-contemporary');
    expect(modern).toBeDefined();
    expect(modern?.name).toBe('Modern Contemporary');
  });

  it('should have keywords array for each style', () => {
    STYLE_CONFIGS.forEach((style) => {
      expect(Array.isArray(style.keywords)).toBe(true);
      expect(style.keywords.length).toBeGreaterThan(0);
    });
  });

  it('should have relatedStyles array for each style', () => {
    STYLE_CONFIGS.forEach((style) => {
      expect(Array.isArray(style.relatedStyles)).toBe(true);
    });
  });

  it('should have unique IDs', () => {
    const ids = STYLE_CONFIGS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(STYLE_CONFIGS.length);
  });
});

// ============================================================================
// ALL_STYLES Tests
// ============================================================================

describe('ALL_STYLES array', () => {
  it('should be an array of style IDs', () => {
    expect(Array.isArray(ALL_STYLES)).toBe(true);
    expect(ALL_STYLES.length).toBe(STYLE_CONFIGS.length);
  });

  it('should contain string IDs', () => {
    ALL_STYLES.forEach((style) => {
      expect(typeof style).toBe('string');
    });
  });

  it('should contain expected style IDs', () => {
    expect(ALL_STYLES).toContain('wabi-sabi');
    expect(ALL_STYLES).toContain('minimalist');
    expect(ALL_STYLES).toContain('abstract');
    expect(ALL_STYLES).toContain('modern-contemporary');
    expect(ALL_STYLES).toContain('vintage');
    expect(ALL_STYLES).toContain('retro');
    expect(ALL_STYLES).toContain('pop-art');
    expect(ALL_STYLES).toContain('bohemian');
    expect(ALL_STYLES).toContain('surrealist');
    expect(ALL_STYLES).toContain('photographic');
    expect(ALL_STYLES).toContain('typography');
    expect(ALL_STYLES).toContain('quotes');
    expect(ALL_STYLES).toContain('texture-art');
  });
});

// ============================================================================
// STYLE_BY_ID Map Tests
// ============================================================================

describe('STYLE_BY_ID map', () => {
  it('should be a Map with all styles', () => {
    expect(STYLE_BY_ID).toBeInstanceOf(Map);
    expect(STYLE_BY_ID.size).toBe(STYLE_CONFIGS.length);
  });

  it('should allow O(1) lookup by ID', () => {
    const style = STYLE_BY_ID.get('wabi-sabi');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Wabi-Sabi');
  });

  it('should return undefined for invalid IDs', () => {
    expect(STYLE_BY_ID.get('invalid-id' as 'wabi-sabi')).toBeUndefined();
  });
});

// ============================================================================
// Subject Configs Tests
// ============================================================================

describe('SUBJECT_CONFIGS constant', () => {
  it('should have 10 subject configurations', () => {
    expect(SUBJECT_CONFIGS.length).toBe(10);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(SUBJECT_CONFIGS)).toBe(true);
  });

  it('should have correct structure for each subject', () => {
    SUBJECT_CONFIGS.forEach((subject) => {
      expect(subject).toHaveProperty('id');
      expect(subject).toHaveProperty('name');
      expect(subject).toHaveProperty('description');
      expect(subject).toHaveProperty('keywords');
    });
  });

  it('should have nature-landscape subject', () => {
    const nature = SUBJECT_CONFIGS.find((s) => s.id === 'nature-landscape');
    expect(nature).toBeDefined();
    expect(nature?.name).toBe('Nature & Landscape');
  });

  it('should have flowers-botanical subject', () => {
    const flowers = SUBJECT_CONFIGS.find((s) => s.id === 'flowers-botanical');
    expect(flowers).toBeDefined();
    expect(flowers?.name).toBe('Flowers & Botanical');
  });

  it('should have ai-generated subject', () => {
    const ai = SUBJECT_CONFIGS.find((s) => s.id === 'ai-generated');
    expect(ai).toBeDefined();
    expect(ai?.name).toBe('AI Generated');
  });

  it('should have abstract-geometric subject', () => {
    const abstract = SUBJECT_CONFIGS.find((s) => s.id === 'abstract-geometric');
    expect(abstract).toBeDefined();
    expect(abstract?.name).toBe('Abstract & Geometric');
  });

  it('should have unique IDs', () => {
    const ids = SUBJECT_CONFIGS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(SUBJECT_CONFIGS.length);
  });
});

// ============================================================================
// ALL_SUBJECTS Tests
// ============================================================================

describe('ALL_SUBJECTS array', () => {
  it('should be an array of subject IDs', () => {
    expect(Array.isArray(ALL_SUBJECTS)).toBe(true);
    expect(ALL_SUBJECTS.length).toBe(SUBJECT_CONFIGS.length);
  });

  it('should contain expected subject IDs', () => {
    expect(ALL_SUBJECTS).toContain('nature-landscape');
    expect(ALL_SUBJECTS).toContain('flowers-botanical');
    expect(ALL_SUBJECTS).toContain('animals');
    expect(ALL_SUBJECTS).toContain('abstract-geometric');
    expect(ALL_SUBJECTS).toContain('ai-generated');
  });
});

// ============================================================================
// SUBJECT_BY_ID Map Tests
// ============================================================================

describe('SUBJECT_BY_ID map', () => {
  it('should be a Map with all subjects', () => {
    expect(SUBJECT_BY_ID).toBeInstanceOf(Map);
    expect(SUBJECT_BY_ID.size).toBe(SUBJECT_CONFIGS.length);
  });

  it('should allow O(1) lookup by ID', () => {
    const subject = SUBJECT_BY_ID.get('nature-landscape');
    expect(subject).toBeDefined();
    expect(subject?.name).toBe('Nature & Landscape');
  });
});

// ============================================================================
// Color Configs Tests
// ============================================================================

describe('COLOR_CONFIGS constant', () => {
  it('should have 14 color configurations', () => {
    expect(COLOR_CONFIGS.length).toBe(14);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(COLOR_CONFIGS)).toBe(true);
  });

  it('should have correct structure for each color', () => {
    COLOR_CONFIGS.forEach((color) => {
      expect(color).toHaveProperty('id');
      expect(color).toHaveProperty('name');
      expect(color).toHaveProperty('hex');
      expect(color).toHaveProperty('description');
    });
  });

  it('should have black color', () => {
    const black = COLOR_CONFIGS.find((c) => c.id === 'black');
    expect(black).toBeDefined();
    expect(black?.name).toBe('Black');
    expect(black?.hex).toBe('#000000');
  });

  it('should have white color', () => {
    const white = COLOR_CONFIGS.find((c) => c.id === 'white');
    expect(white).toBeDefined();
    expect(white?.name).toBe('White');
    expect(white?.hex).toBe('#FFFFFF');
  });

  it('should have neutral color', () => {
    const neutral = COLOR_CONFIGS.find((c) => c.id === 'neutral');
    expect(neutral).toBeDefined();
    expect(neutral?.name).toBe('Neutral');
  });

  it('should have black-white color', () => {
    const bw = COLOR_CONFIGS.find((c) => c.id === 'black-white');
    expect(bw).toBeDefined();
    expect(bw?.name).toBe('Black & White');
    expect(bw?.altHex).toBeDefined();
  });

  it('should have earth-tones color', () => {
    const earth = COLOR_CONFIGS.find((c) => c.id === 'earth-tones');
    expect(earth).toBeDefined();
    expect(earth?.name).toBe('Earth Tones');
    expect(earth?.altHex).toBeDefined();
  });

  it('should have valid hex codes', () => {
    COLOR_CONFIGS.forEach((color) => {
      expect(color.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('should have unique IDs', () => {
    const ids = COLOR_CONFIGS.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(COLOR_CONFIGS.length);
  });
});

// ============================================================================
// ALL_COLORS Tests
// ============================================================================

describe('ALL_COLORS array', () => {
  it('should be an array of color IDs', () => {
    expect(Array.isArray(ALL_COLORS)).toBe(true);
    expect(ALL_COLORS.length).toBe(COLOR_CONFIGS.length);
  });

  it('should contain expected color IDs', () => {
    expect(ALL_COLORS).toContain('black');
    expect(ALL_COLORS).toContain('white');
    expect(ALL_COLORS).toContain('blue');
    expect(ALL_COLORS).toContain('green');
    expect(ALL_COLORS).toContain('earth-tones');
  });
});

// ============================================================================
// COLOR_BY_ID Map Tests
// ============================================================================

describe('COLOR_BY_ID map', () => {
  it('should be a Map with all colors', () => {
    expect(COLOR_BY_ID).toBeInstanceOf(Map);
    expect(COLOR_BY_ID.size).toBe(COLOR_CONFIGS.length);
  });

  it('should allow O(1) lookup by ID', () => {
    const color = COLOR_BY_ID.get('black');
    expect(color).toBeDefined();
    expect(color?.name).toBe('Black');
  });
});

// ============================================================================
// Room Configs Tests
// ============================================================================

describe('ROOM_CONFIGS constant', () => {
  it('should have 7 room configurations', () => {
    expect(ROOM_CONFIGS.length).toBe(7);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(ROOM_CONFIGS)).toBe(true);
  });

  it('should have correct structure for each room', () => {
    ROOM_CONFIGS.forEach((room) => {
      expect(room).toHaveProperty('id');
      expect(room).toHaveProperty('name');
      expect(room).toHaveProperty('description');
      expect(room).toHaveProperty('recommendedStyles');
      expect(room).toHaveProperty('recommendedColors');
    });
  });

  it('should have living-room', () => {
    const living = ROOM_CONFIGS.find((r) => r.id === 'living-room');
    expect(living).toBeDefined();
    expect(living?.name).toBe('Living Room');
    expect(living?.recommendedStyles.length).toBeGreaterThan(0);
  });

  it('should have bedroom', () => {
    const bedroom = ROOM_CONFIGS.find((r) => r.id === 'bedroom');
    expect(bedroom).toBeDefined();
    expect(bedroom?.name).toBe('Bedroom');
  });

  it('should have office', () => {
    const office = ROOM_CONFIGS.find((r) => r.id === 'office');
    expect(office).toBeDefined();
    expect(office?.name).toBe('Office');
  });

  it('should have kitchen-dining', () => {
    const kitchen = ROOM_CONFIGS.find((r) => r.id === 'kitchen-dining');
    expect(kitchen).toBeDefined();
    expect(kitchen?.name).toBe('Kitchen & Dining');
  });

  it('should have kids-room', () => {
    const kids = ROOM_CONFIGS.find((r) => r.id === 'kids-room');
    expect(kids).toBeDefined();
    expect(kids?.name).toBe('Kids Room');
  });

  it('should have recommended styles for each room', () => {
    ROOM_CONFIGS.forEach((room) => {
      expect(Array.isArray(room.recommendedStyles)).toBe(true);
      expect(room.recommendedStyles.length).toBeGreaterThan(0);
    });
  });

  it('should have recommended colors for each room', () => {
    ROOM_CONFIGS.forEach((room) => {
      expect(Array.isArray(room.recommendedColors)).toBe(true);
      expect(room.recommendedColors.length).toBeGreaterThan(0);
    });
  });

  it('should have unique IDs', () => {
    const ids = ROOM_CONFIGS.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ROOM_CONFIGS.length);
  });
});

// ============================================================================
// ALL_ROOMS Tests
// ============================================================================

describe('ALL_ROOMS array', () => {
  it('should be an array of room IDs', () => {
    expect(Array.isArray(ALL_ROOMS)).toBe(true);
    expect(ALL_ROOMS.length).toBe(ROOM_CONFIGS.length);
  });

  it('should contain expected room IDs', () => {
    expect(ALL_ROOMS).toContain('living-room');
    expect(ALL_ROOMS).toContain('bedroom');
    expect(ALL_ROOMS).toContain('office');
    expect(ALL_ROOMS).toContain('kitchen-dining');
  });
});

// ============================================================================
// ROOM_BY_ID Map Tests
// ============================================================================

describe('ROOM_BY_ID map', () => {
  it('should be a Map with all rooms', () => {
    expect(ROOM_BY_ID).toBeInstanceOf(Map);
    expect(ROOM_BY_ID.size).toBe(ROOM_CONFIGS.length);
  });

  it('should allow O(1) lookup by ID', () => {
    const room = ROOM_BY_ID.get('living-room');
    expect(room).toBeDefined();
    expect(room?.name).toBe('Living Room');
  });
});

// ============================================================================
// Orientation Configs Tests
// ============================================================================

describe('ORIENTATION_CONFIGS constant', () => {
  it('should have 8 orientation configurations', () => {
    expect(ORIENTATION_CONFIGS.length).toBe(8);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(ORIENTATION_CONFIGS)).toBe(true);
  });

  it('should have correct structure for each orientation', () => {
    ORIENTATION_CONFIGS.forEach((orientation) => {
      expect(orientation).toHaveProperty('id');
      expect(orientation).toHaveProperty('name');
      expect(orientation).toHaveProperty('description');
    });
  });

  it('should have square orientation', () => {
    const square = ORIENTATION_CONFIGS.find((o) => o.id === 'square');
    expect(square).toBeDefined();
    expect(square?.name).toBe('Square');
  });

  it('should have portrait orientation', () => {
    const portrait = ORIENTATION_CONFIGS.find((o) => o.id === 'portrait');
    expect(portrait).toBeDefined();
    expect(portrait?.name).toBe('Portrait (Vertical)');
  });

  it('should have landscape orientation', () => {
    const landscape = ORIENTATION_CONFIGS.find((o) => o.id === 'landscape');
    expect(landscape).toBeDefined();
    expect(landscape?.name).toBe('Landscape (Horizontal)');
  });

  it('should have panoramic orientation', () => {
    const panoramic = ORIENTATION_CONFIGS.find((o) => o.id === 'panoramic');
    expect(panoramic).toBeDefined();
    expect(panoramic?.name).toBe('Panoramic');
  });

  it('should have triptych orientation', () => {
    const triptych = ORIENTATION_CONFIGS.find((o) => o.id === 'triptych');
    expect(triptych).toBeDefined();
    expect(triptych?.name).toBe('Triptych (Set of 3)');
  });

  it('should have unique IDs', () => {
    const ids = ORIENTATION_CONFIGS.map((o) => o.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ORIENTATION_CONFIGS.length);
  });
});

// ============================================================================
// ALL_ORIENTATIONS Tests
// ============================================================================

describe('ALL_ORIENTATIONS array', () => {
  it('should be an array of orientation IDs', () => {
    expect(Array.isArray(ALL_ORIENTATIONS)).toBe(true);
    expect(ALL_ORIENTATIONS.length).toBe(ORIENTATION_CONFIGS.length);
  });

  it('should contain expected orientation IDs', () => {
    expect(ALL_ORIENTATIONS).toContain('square');
    expect(ALL_ORIENTATIONS).toContain('portrait');
    expect(ALL_ORIENTATIONS).toContain('landscape');
    expect(ALL_ORIENTATIONS).toContain('panoramic');
    expect(ALL_ORIENTATIONS).toContain('triptych');
  });
});

// ============================================================================
// ORIENTATION_BY_ID Map Tests
// ============================================================================

describe('ORIENTATION_BY_ID map', () => {
  it('should be a Map with all orientations', () => {
    expect(ORIENTATION_BY_ID).toBeInstanceOf(Map);
    expect(ORIENTATION_BY_ID.size).toBe(ORIENTATION_CONFIGS.length);
  });

  it('should allow O(1) lookup by ID', () => {
    const orientation = ORIENTATION_BY_ID.get('square');
    expect(orientation).toBeDefined();
    expect(orientation?.name).toBe('Square');
  });
});

// ============================================================================
// Collection Type Configs Tests
// ============================================================================

describe('COLLECTION_TYPE_CONFIGS constant', () => {
  it('should have 6 collection type configurations', () => {
    expect(COLLECTION_TYPE_CONFIGS.length).toBe(6);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(COLLECTION_TYPE_CONFIGS)).toBe(true);
  });

  it('should have correct structure for each collection type', () => {
    COLLECTION_TYPE_CONFIGS.forEach((collectionType) => {
      expect(collectionType).toHaveProperty('id');
      expect(collectionType).toHaveProperty('name');
      expect(collectionType).toHaveProperty('description');
      expect(collectionType).toHaveProperty('isFeatured');
    });
  });

  it('should have new-arrivals collection type', () => {
    const newArrivals = COLLECTION_TYPE_CONFIGS.find((c) => c.id === 'new-arrivals');
    expect(newArrivals).toBeDefined();
    expect(newArrivals?.name).toBe('New Arrivals');
    expect(newArrivals?.isFeatured).toBe(true);
  });

  it('should have best-sellers collection type', () => {
    const bestSellers = COLLECTION_TYPE_CONFIGS.find((c) => c.id === 'best-sellers');
    expect(bestSellers).toBeDefined();
    expect(bestSellers?.name).toBe('Best Sellers');
  });

  it('should have seasonal collection type', () => {
    const seasonal = COLLECTION_TYPE_CONFIGS.find((c) => c.id === 'seasonal');
    expect(seasonal).toBeDefined();
    expect(seasonal?.name).toBe('Seasonal Collections');
  });

  it('should have staff-picks collection type', () => {
    const staffPicks = COLLECTION_TYPE_CONFIGS.find((c) => c.id === 'staff-picks');
    expect(staffPicks).toBeDefined();
    expect(staffPicks?.name).toBe('Staff Picks');
  });

  it('should have unique IDs', () => {
    const ids = COLLECTION_TYPE_CONFIGS.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(COLLECTION_TYPE_CONFIGS.length);
  });
});

// ============================================================================
// ALL_COLLECTION_TYPES Tests
// ============================================================================

describe('ALL_COLLECTION_TYPES array', () => {
  it('should be an array of collection type IDs', () => {
    expect(Array.isArray(ALL_COLLECTION_TYPES)).toBe(true);
    expect(ALL_COLLECTION_TYPES.length).toBe(COLLECTION_TYPE_CONFIGS.length);
  });

  it('should contain expected collection type IDs', () => {
    expect(ALL_COLLECTION_TYPES).toContain('new-arrivals');
    expect(ALL_COLLECTION_TYPES).toContain('best-sellers');
    expect(ALL_COLLECTION_TYPES).toContain('seasonal');
    expect(ALL_COLLECTION_TYPES).toContain('sale');
  });
});

// ============================================================================
// COLLECTION_TYPE_BY_ID Map Tests
// ============================================================================

describe('COLLECTION_TYPE_BY_ID map', () => {
  it('should be a Map with all collection types', () => {
    expect(COLLECTION_TYPE_BY_ID).toBeInstanceOf(Map);
    expect(COLLECTION_TYPE_BY_ID.size).toBe(COLLECTION_TYPE_CONFIGS.length);
  });

  it('should allow O(1) lookup by ID', () => {
    const collectionType = COLLECTION_TYPE_BY_ID.get('new-arrivals');
    expect(collectionType).toBeDefined();
    expect(collectionType?.name).toBe('New Arrivals');
  });
});

// ============================================================================
// AI Style Presets Tests
// ============================================================================

describe('AI_STYLE_PRESETS constant', () => {
  it('should have 10 AI style presets', () => {
    expect(AI_STYLE_PRESETS.length).toBe(10);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(AI_STYLE_PRESETS)).toBe(true);
  });

  it('should have correct structure for each AI style', () => {
    AI_STYLE_PRESETS.forEach((style) => {
      expect(style).toHaveProperty('id');
      expect(style).toHaveProperty('name');
      expect(style).toHaveProperty('description');
      expect(style).toHaveProperty('modelTuning');
      expect(style).toHaveProperty('posterStyle');
      expect(style).toHaveProperty('promptKeywords');
      expect(style).toHaveProperty('negativePrompts');
    });
  });

  it('should have ai-wabi-sabi AI preset', () => {
    const wabiSabi = AI_STYLE_PRESETS.find((s) => s.id === 'ai-wabi-sabi');
    expect(wabiSabi).toBeDefined();
    expect(wabiSabi?.name).toBe('Wabi-Sabi');
    expect(wabiSabi?.posterStyle).toBe('wabi-sabi');
  });

  it('should have ai-abstract-expression AI preset', () => {
    const abstract = AI_STYLE_PRESETS.find((s) => s.id === 'ai-abstract-expression');
    expect(abstract).toBeDefined();
    expect(abstract?.name).toBe('Abstract Expression');
  });

  it('should have prompt keywords for each AI style', () => {
    AI_STYLE_PRESETS.forEach((style) => {
      expect(Array.isArray(style.promptKeywords)).toBe(true);
      expect(style.promptKeywords.length).toBeGreaterThan(0);
    });
  });

  it('should have negative prompts for each AI style', () => {
    AI_STYLE_PRESETS.forEach((style) => {
      expect(Array.isArray(style.negativePrompts)).toBe(true);
      expect(style.negativePrompts.length).toBeGreaterThan(0);
    });
  });

  it('should have unique IDs', () => {
    const ids = AI_STYLE_PRESETS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(AI_STYLE_PRESETS.length);
  });
});

// ============================================================================
// AI_STYLE_BY_ID Map Tests
// ============================================================================

describe('AI_STYLE_BY_ID map', () => {
  it('should be a Map with all AI styles', () => {
    expect(AI_STYLE_BY_ID).toBeInstanceOf(Map);
    expect(AI_STYLE_BY_ID.size).toBe(AI_STYLE_PRESETS.length);
  });

  it('should allow O(1) lookup by ID', () => {
    const style = AI_STYLE_BY_ID.get('ai-wabi-sabi');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Wabi-Sabi');
  });

  it('should return undefined for invalid IDs', () => {
    expect(AI_STYLE_BY_ID.get('invalid-id')).toBeUndefined();
    expect(AI_STYLE_BY_ID.get('')).toBeUndefined();
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('getStyleById helper', () => {
  it('should return style config for valid ID', () => {
    const style = getStyleById('wabi-sabi');
    expect(style).toBeDefined();
    expect(style?.id).toBe('wabi-sabi');
    expect(style?.name).toBe('Wabi-Sabi');
  });

  it('should return style for minimalist', () => {
    const style = getStyleById('minimalist');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Minimalist');
  });

  it('should return undefined for invalid ID', () => {
    expect(getStyleById('invalid-style-id' as 'wabi-sabi')).toBeUndefined();
  });
});

describe('getSubjectById helper', () => {
  it('should return subject config for valid ID', () => {
    const subject = getSubjectById('nature-landscape');
    expect(subject).toBeDefined();
    expect(subject?.id).toBe('nature-landscape');
    expect(subject?.name).toBe('Nature & Landscape');
  });

  it('should return subject for ai-generated', () => {
    const subject = getSubjectById('ai-generated');
    expect(subject).toBeDefined();
    expect(subject?.name).toBe('AI Generated');
  });

  it('should return undefined for invalid ID', () => {
    expect(getSubjectById('invalid-subject-id' as 'nature-landscape')).toBeUndefined();
  });
});

describe('getColorById helper', () => {
  it('should return color config for valid ID', () => {
    const color = getColorById('black');
    expect(color).toBeDefined();
    expect(color?.id).toBe('black');
    expect(color?.name).toBe('Black');
  });

  it('should return color for earth-tones', () => {
    const color = getColorById('earth-tones');
    expect(color).toBeDefined();
    expect(color?.name).toBe('Earth Tones');
  });

  it('should return undefined for invalid ID', () => {
    expect(getColorById('invalid-color-id' as 'black')).toBeUndefined();
  });
});

describe('getRoomById helper', () => {
  it('should return room config for valid ID', () => {
    const room = getRoomById('living-room');
    expect(room).toBeDefined();
    expect(room?.id).toBe('living-room');
    expect(room?.name).toBe('Living Room');
  });

  it('should return room for bedroom', () => {
    const room = getRoomById('bedroom');
    expect(room).toBeDefined();
    expect(room?.name).toBe('Bedroom');
  });

  it('should return undefined for invalid ID', () => {
    expect(getRoomById('invalid-room-id' as 'living-room')).toBeUndefined();
  });
});

describe('getOrientationById helper', () => {
  it('should return orientation config for valid ID', () => {
    const orientation = getOrientationById('square');
    expect(orientation).toBeDefined();
    expect(orientation?.id).toBe('square');
    expect(orientation?.name).toBe('Square');
  });

  it('should return orientation for portrait', () => {
    const orientation = getOrientationById('portrait');
    expect(orientation).toBeDefined();
    expect(orientation?.name).toBe('Portrait (Vertical)');
  });

  it('should return undefined for invalid ID', () => {
    expect(getOrientationById('invalid-orientation-id' as 'square')).toBeUndefined();
  });
});

describe('getAIStyleById helper', () => {
  it('should return AI style config for valid ID', () => {
    const style = getAIStyleById('ai-wabi-sabi');
    expect(style).toBeDefined();
    expect(style?.id).toBe('ai-wabi-sabi');
    expect(style?.name).toBe('Wabi-Sabi');
  });

  it('should return AI style for ai-botanical', () => {
    const style = getAIStyleById('ai-botanical');
    expect(style).toBeDefined();
    expect(style?.name).toBe('Botanical');
  });

  it('should return undefined for invalid ID', () => {
    expect(getAIStyleById('invalid-ai-style-id')).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(getAIStyleById('')).toBeUndefined();
  });
});

// ============================================================================
// getStylesForRoom Helper Tests
// ============================================================================

describe('getStylesForRoom helper', () => {
  it('should return style IDs for living-room', () => {
    const styles = getStylesForRoom('living-room');
    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBeGreaterThan(0);
  });

  it('should return style IDs for bedroom', () => {
    const styles = getStylesForRoom('bedroom');
    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBeGreaterThan(0);
  });

  it('should return styles that are recommended for the room', () => {
    const room = getRoomById('living-room');
    const styles = getStylesForRoom('living-room');

    expect(room).toBeDefined();
    if (room) {
      expect(styles).toEqual(room.recommendedStyles);
    }
  });

  it('should return empty array for invalid room', () => {
    const styles = getStylesForRoom('invalid-room' as 'living-room');
    expect(styles).toEqual([]);
  });
});

// ============================================================================
// getColorsForRoom Helper Tests
// ============================================================================

describe('getColorsForRoom helper', () => {
  it('should return color IDs for living-room', () => {
    const colors = getColorsForRoom('living-room');
    expect(Array.isArray(colors)).toBe(true);
    expect(colors.length).toBeGreaterThan(0);
  });

  it('should return color IDs for bedroom', () => {
    const colors = getColorsForRoom('bedroom');
    expect(Array.isArray(colors)).toBe(true);
    expect(colors.length).toBeGreaterThan(0);
  });

  it('should return colors that are recommended for the room', () => {
    const room = getRoomById('living-room');
    const colors = getColorsForRoom('living-room');

    expect(room).toBeDefined();
    if (room) {
      expect(colors).toEqual(room.recommendedColors);
    }
  });

  it('should return empty array for invalid room', () => {
    const colors = getColorsForRoom('invalid-room' as 'living-room');
    expect(colors).toEqual([]);
  });
});

// ============================================================================
// getRelatedStyles Helper Tests
// ============================================================================

describe('getRelatedStyles helper', () => {
  it('should return related style IDs for wabi-sabi', () => {
    const related = getRelatedStyles('wabi-sabi');
    expect(Array.isArray(related)).toBe(true);
    expect(related.length).toBeGreaterThan(0);
  });

  it('should return related styles for minimalist', () => {
    const related = getRelatedStyles('minimalist');
    expect(Array.isArray(related)).toBe(true);
    expect(related.length).toBeGreaterThan(0);
  });

  it('should return styles that are marked as related', () => {
    const styleConfig = getStyleById('wabi-sabi');
    const related = getRelatedStyles('wabi-sabi');

    expect(styleConfig).toBeDefined();
    if (styleConfig) {
      expect(related).toEqual(styleConfig.relatedStyles);
    }
  });

  it('should return empty array for invalid style', () => {
    const related = getRelatedStyles('invalid-style' as 'wabi-sabi');
    expect(related).toEqual([]);
  });
});

// ============================================================================
// searchStylesByKeyword Helper Tests
// ============================================================================

describe('searchStylesByKeyword helper', () => {
  it('should find styles by keyword "minimal"', () => {
    const styles = searchStylesByKeyword('minimal');
    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBeGreaterThan(0);
  });

  it('should find styles by keyword "abstract"', () => {
    const styles = searchStylesByKeyword('abstract');
    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBeGreaterThan(0);
  });

  it('should return StyleConfig objects', () => {
    const styles = searchStylesByKeyword('modern');
    styles.forEach((style) => {
      expect(style).toHaveProperty('id');
      expect(style).toHaveProperty('name');
      expect(style).toHaveProperty('description');
    });
  });

  it('should return empty array for no matches', () => {
    const styles = searchStylesByKeyword('xyznonexistentkeyword');
    expect(styles).toEqual([]);
  });

  it('should be case-insensitive', () => {
    const stylesLower = searchStylesByKeyword('modern');
    const stylesUpper = searchStylesByKeyword('MODERN');
    const stylesMixed = searchStylesByKeyword('MoDeRn');

    expect(stylesLower.length).toBe(stylesUpper.length);
    expect(stylesLower.length).toBe(stylesMixed.length);
  });

  it('should search in name, description, and keywords', () => {
    // Search for "zen" which is in wabi-sabi keywords
    const styles = searchStylesByKeyword('zen');
    expect(styles.length).toBeGreaterThan(0);
    const wabiSabi = styles.find((s) => s.id === 'wabi-sabi');
    expect(wabiSabi).toBeDefined();
  });
});

// ============================================================================
// searchSubjectsByKeyword Helper Tests
// ============================================================================

describe('searchSubjectsByKeyword helper', () => {
  it('should find subjects by keyword "nature"', () => {
    const subjects = searchSubjectsByKeyword('nature');
    expect(Array.isArray(subjects)).toBe(true);
    expect(subjects.length).toBeGreaterThan(0);
  });

  it('should find subjects by keyword "botanical"', () => {
    const subjects = searchSubjectsByKeyword('botanical');
    expect(Array.isArray(subjects)).toBe(true);
    expect(subjects.length).toBeGreaterThan(0);
  });

  it('should find subjects by keyword "ai"', () => {
    const subjects = searchSubjectsByKeyword('ai');
    expect(Array.isArray(subjects)).toBe(true);
    expect(subjects.length).toBeGreaterThan(0);
  });

  it('should return SubjectConfig objects', () => {
    const subjects = searchSubjectsByKeyword('landscape');
    subjects.forEach((subject) => {
      expect(subject).toHaveProperty('id');
      expect(subject).toHaveProperty('name');
      expect(subject).toHaveProperty('description');
    });
  });

  it('should return empty array for no matches', () => {
    const subjects = searchSubjectsByKeyword('xyznonexistentkeyword');
    expect(subjects).toEqual([]);
  });

  it('should be case-insensitive', () => {
    const subjectsLower = searchSubjectsByKeyword('landscape');
    const subjectsUpper = searchSubjectsByKeyword('LANDSCAPE');

    expect(subjectsLower.length).toBe(subjectsUpper.length);
  });
});

// ============================================================================
// Type Structure Validation
// ============================================================================

describe('Type structure validation', () => {
  it('should have correct field types for STYLE_CONFIGS', () => {
    STYLE_CONFIGS.forEach((style) => {
      expect(typeof style.id).toBe('string');
      expect(typeof style.name).toBe('string');
      expect(typeof style.description).toBe('string');
      expect(Array.isArray(style.keywords)).toBe(true);
      expect(Array.isArray(style.relatedStyles)).toBe(true);
    });
  });

  it('should have correct field types for SUBJECT_CONFIGS', () => {
    SUBJECT_CONFIGS.forEach((subject) => {
      expect(typeof subject.id).toBe('string');
      expect(typeof subject.name).toBe('string');
      expect(typeof subject.description).toBe('string');
      expect(Array.isArray(subject.keywords)).toBe(true);
    });
  });

  it('should have correct field types for COLOR_CONFIGS', () => {
    COLOR_CONFIGS.forEach((color) => {
      expect(typeof color.id).toBe('string');
      expect(typeof color.name).toBe('string');
      expect(typeof color.hex).toBe('string');
      expect(typeof color.description).toBe('string');
    });
  });

  it('should have correct field types for ROOM_CONFIGS', () => {
    ROOM_CONFIGS.forEach((room) => {
      expect(typeof room.id).toBe('string');
      expect(typeof room.name).toBe('string');
      expect(typeof room.description).toBe('string');
      expect(Array.isArray(room.recommendedStyles)).toBe(true);
      expect(Array.isArray(room.recommendedColors)).toBe(true);
    });
  });

  it('should have correct field types for AI_STYLE_PRESETS', () => {
    AI_STYLE_PRESETS.forEach((style) => {
      expect(typeof style.id).toBe('string');
      expect(typeof style.name).toBe('string');
      expect(typeof style.description).toBe('string');
      expect(typeof style.modelTuning).toBe('string');
      expect(typeof style.posterStyle).toBe('string');
      expect(Array.isArray(style.promptKeywords)).toBe(true);
      expect(Array.isArray(style.negativePrompts)).toBe(true);
    });
  });
});
