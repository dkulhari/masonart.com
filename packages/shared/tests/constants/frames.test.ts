/**
 * Frame Constants Tests
 *
 * Comprehensive tests for frame constants including:
 * - Frame materials
 * - Frame types
 * - Frame finishes
 * - Helper functions
 * - Price calculations
 */

import { describe, it, expect } from 'vitest';
import {
  FRAME_MATERIALS,
  FRAME_TYPES,
  FRAME_FINISHES,
  FRAME_CONSTRAINTS,
  getFrameMaterialById,
  getFrameTypeById,
  getFrameFinishById,
  getPopularFrameMaterials,
  getActiveFrameTypes,
  getMaterialsForFrameType,
  calculateFramePrice,
  type FrameMaterial,
  type FrameType,
  type FrameFinish,
} from '../../src/constants/frames.js';

describe('FRAME_MATERIALS constant', () => {
  it('should have at least 5 frame materials defined', () => {
    expect(FRAME_MATERIALS.length).toBeGreaterThanOrEqual(5);
  });

  it('should have unique IDs for all materials', () => {
    const ids = FRAME_MATERIALS.map((material) => material.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(FRAME_MATERIALS.length);
  });

  it('should have unique names for all materials', () => {
    const names = FRAME_MATERIALS.map((material) => material.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(FRAME_MATERIALS.length);
  });

  it('should have valid price modifiers for all materials', () => {
    FRAME_MATERIALS.forEach((material) => {
      expect(material.priceModifier).toBeGreaterThanOrEqual(1.0);
      expect(material.priceModifier).toBeLessThanOrEqual(3.0);
    });
  });

  it('should have descriptions for all materials', () => {
    FRAME_MATERIALS.forEach((material) => {
      expect(material.description).toBeTruthy();
      expect(material.description.length).toBeGreaterThan(10);
    });
  });

  it('should have consistent display order (no duplicates)', () => {
    const orders = FRAME_MATERIALS.map((material) => material.displayOrder);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(FRAME_MATERIALS.length);
  });

  it('should have at least one popular material', () => {
    const popularMaterials = FRAME_MATERIALS.filter((material) => material.isPopular);
    expect(popularMaterials.length).toBeGreaterThan(0);
  });
});

describe('Frame material categories', () => {
  it('should have wood materials', () => {
    const woodMaterials = FRAME_MATERIALS.filter((m) => m.id.startsWith('wood-'));
    expect(woodMaterials.length).toBeGreaterThan(0);

    woodMaterials.forEach((material) => {
      expect(material.name).toMatch(/wood|Oak|Walnut|Maple|Bamboo/i);
    });
  });

  it('should have metal materials', () => {
    const metalMaterials = FRAME_MATERIALS.filter((m) => m.id.startsWith('metal-'));
    expect(metalMaterials.length).toBeGreaterThan(0);

    metalMaterials.forEach((material) => {
      expect(material.name).toMatch(/Aluminum|Brass|Steel/i);
    });
  });

  it('should have composite or alternative materials', () => {
    const compositeMaterials = FRAME_MATERIALS.filter(
      (m) => m.id.startsWith('composite-') || m.id.startsWith('acrylic-')
    );
    expect(compositeMaterials.length).toBeGreaterThan(0);
  });
});

describe('Popular materials', () => {
  it('should have Oak Wood as a popular material', () => {
    const material = FRAME_MATERIALS.find((m) => m.id === 'wood-oak');
    expect(material?.isPopular).toBe(true);
  });

  it('should have Walnut Wood as a popular material', () => {
    const material = FRAME_MATERIALS.find((m) => m.id === 'wood-walnut');
    expect(material?.isPopular).toBe(true);
  });

  it('should have at least 3 popular materials', () => {
    const popularMaterials = FRAME_MATERIALS.filter((m) => m.isPopular);
    expect(popularMaterials.length).toBeGreaterThanOrEqual(3);
  });
});

describe('FRAME_TYPES constant', () => {
  it('should have at least 5 frame types defined', () => {
    expect(FRAME_TYPES.length).toBeGreaterThanOrEqual(5);
  });

  it('should have unique IDs for all frame types', () => {
    const ids = FRAME_TYPES.map((frame) => frame.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(FRAME_TYPES.length);
  });

  it('should have unique types (kebab-case identifiers)', () => {
    const types = FRAME_TYPES.map((frame) => frame.type);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBe(FRAME_TYPES.length);
  });

  it('should have valid type format (kebab-case)', () => {
    FRAME_TYPES.forEach((frame) => {
      expect(frame.type).toMatch(/^[a-z0-9-]+$/);
    });
  });

  it('should have descriptions for all frame types', () => {
    FRAME_TYPES.forEach((frame) => {
      expect(frame.description).toBeTruthy();
      expect(frame.description.length).toBeGreaterThan(10);
    });
  });

  it('should have valid image URLs for all frame types', () => {
    FRAME_TYPES.forEach((frame) => {
      expect(frame.imageUrl).toMatch(/^https?:\/\/.+/);
    });
  });

  it('should have at least one material for each frame type', () => {
    FRAME_TYPES.forEach((frame) => {
      expect(frame.materials.length).toBeGreaterThan(0);
    });
  });

  it('should have valid material IDs in frame types', () => {
    const validMaterialIds = FRAME_MATERIALS.map((m) => m.id);

    FRAME_TYPES.forEach((frame) => {
      frame.materials.forEach((materialId) => {
        expect(validMaterialIds).toContain(materialId);
      });
    });
  });

  it('should have consistent display order (no duplicates)', () => {
    const orders = FRAME_TYPES.map((frame) => frame.displayOrder);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(FRAME_TYPES.length);
  });

  it('should have at least one active frame type', () => {
    const activeFrames = FRAME_TYPES.filter((frame) => frame.isActive);
    expect(activeFrames.length).toBeGreaterThan(0);
  });
});

describe('Frame type varieties', () => {
  it('should have classic frame type', () => {
    const frame = FRAME_TYPES.find((f) => f.type === 'classic');
    expect(frame).toBeDefined();
    expect(frame?.name).toBe('Classic Frame');
  });

  it('should have modern frame type', () => {
    const frame = FRAME_TYPES.find((f) => f.type === 'modern');
    expect(frame).toBeDefined();
    expect(frame?.name).toBe('Modern Frame');
  });

  it('should have floating frame type', () => {
    const frame = FRAME_TYPES.find((f) => f.type === 'floating');
    expect(frame).toBeDefined();
  });

  it('should have gallery frame type', () => {
    const frame = FRAME_TYPES.find((f) => f.type === 'gallery');
    expect(frame).toBeDefined();
  });
});

describe('FRAME_FINISHES constant', () => {
  it('should have at least 4 frame finishes defined', () => {
    expect(FRAME_FINISHES.length).toBeGreaterThanOrEqual(4);
  });

  it('should have unique IDs for all finishes', () => {
    const ids = FRAME_FINISHES.map((finish) => finish.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(FRAME_FINISHES.length);
  });

  it('should have descriptions for all finishes', () => {
    FRAME_FINISHES.forEach((finish) => {
      expect(finish.description).toBeTruthy();
      expect(finish.description.length).toBeGreaterThan(10);
    });
  });

  it('should have valid additional costs for all finishes', () => {
    FRAME_FINISHES.forEach((finish) => {
      expect(finish.additionalCost).toBeGreaterThanOrEqual(0);
      expect(finish.additionalCost).toBeLessThanOrEqual(100);
    });
  });

  it('should have natural finish with zero cost', () => {
    const natural = FRAME_FINISHES.find((f) => f.id === 'finish-natural');
    expect(natural).toBeDefined();
    expect(natural?.additionalCost).toBe(0);
  });

  it('should have painted finishes', () => {
    const paintedFinishes = FRAME_FINISHES.filter((f) => f.id.includes('painted'));
    expect(paintedFinishes.length).toBeGreaterThan(0);
  });
});

describe('getFrameMaterialById helper', () => {
  it('should return material for valid ID', () => {
    const material = getFrameMaterialById('wood-oak');
    expect(material).toBeDefined();
    expect(material?.id).toBe('wood-oak');
    expect(material?.name).toBe('Oak Wood');
  });

  it('should return material for metal-aluminum', () => {
    const material = getFrameMaterialById('metal-aluminum');
    expect(material).toBeDefined();
    expect(material?.name).toBe('Aluminum');
  });

  it('should return undefined for invalid ID', () => {
    const material = getFrameMaterialById('invalid-material-id');
    expect(material).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    const material = getFrameMaterialById('');
    expect(material).toBeUndefined();
  });
});

describe('getFrameTypeById helper', () => {
  it('should return frame type for valid ID', () => {
    const frame = getFrameTypeById('frame-classic');
    expect(frame).toBeDefined();
    expect(frame?.id).toBe('frame-classic');
    expect(frame?.type).toBe('classic');
  });

  it('should return frame type for frame-modern', () => {
    const frame = getFrameTypeById('frame-modern');
    expect(frame).toBeDefined();
    expect(frame?.type).toBe('modern');
  });

  it('should return undefined for invalid ID', () => {
    const frame = getFrameTypeById('invalid-frame-id');
    expect(frame).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    const frame = getFrameTypeById('');
    expect(frame).toBeUndefined();
  });
});

describe('getFrameFinishById helper', () => {
  it('should return finish for valid ID', () => {
    const finish = getFrameFinishById('finish-natural');
    expect(finish).toBeDefined();
    expect(finish?.id).toBe('finish-natural');
    expect(finish?.name).toBe('Natural');
  });

  it('should return finish for finish-painted-white', () => {
    const finish = getFrameFinishById('finish-painted-white');
    expect(finish).toBeDefined();
    expect(finish?.name).toBe('Painted White');
  });

  it('should return undefined for invalid ID', () => {
    const finish = getFrameFinishById('invalid-finish-id');
    expect(finish).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    const finish = getFrameFinishById('');
    expect(finish).toBeUndefined();
  });
});

describe('getPopularFrameMaterials helper', () => {
  it('should return only popular materials', () => {
    const popularMaterials = getPopularFrameMaterials();
    expect(popularMaterials.length).toBeGreaterThan(0);

    popularMaterials.forEach((material) => {
      expect(material.isPopular).toBe(true);
    });
  });

  it('should include oak and walnut in popular materials', () => {
    const popularMaterials = getPopularFrameMaterials();
    const popularIds = popularMaterials.map((m) => m.id);

    expect(popularIds).toContain('wood-oak');
    expect(popularIds).toContain('wood-walnut');
  });

  it('should return at least 3 popular materials', () => {
    const popularMaterials = getPopularFrameMaterials();
    expect(popularMaterials.length).toBeGreaterThanOrEqual(3);
  });
});

describe('getActiveFrameTypes helper', () => {
  it('should return only active frame types', () => {
    const activeFrames = getActiveFrameTypes();
    expect(activeFrames.length).toBeGreaterThan(0);

    activeFrames.forEach((frame) => {
      expect(frame.isActive).toBe(true);
    });
  });

  it('should include classic and modern in active frames', () => {
    const activeFrames = getActiveFrameTypes();
    const activeTypes = activeFrames.map((f) => f.type);

    expect(activeTypes).toContain('classic');
    expect(activeTypes).toContain('modern');
  });
});

describe('getMaterialsForFrameType helper', () => {
  it('should return materials for classic frame', () => {
    const materials = getMaterialsForFrameType('frame-classic');
    expect(materials.length).toBeGreaterThan(0);

    const materialIds = materials.map((m) => m.id);
    expect(materialIds).toContain('wood-oak');
  });

  it('should return materials for modern frame', () => {
    const materials = getMaterialsForFrameType('frame-modern');
    expect(materials.length).toBeGreaterThan(0);

    const materialIds = materials.map((m) => m.id);
    expect(materialIds).toContain('metal-aluminum');
  });

  it('should return empty array for invalid frame ID', () => {
    const materials = getMaterialsForFrameType('invalid-frame-id');
    expect(materials).toEqual([]);
  });

  it('should return only materials that exist', () => {
    const materials = getMaterialsForFrameType('frame-classic');
    const validMaterialIds = FRAME_MATERIALS.map((m) => m.id);

    materials.forEach((material) => {
      expect(validMaterialIds).toContain(material.id);
    });
  });

  it('should return materials in correct order', () => {
    const materials = getMaterialsForFrameType('frame-classic');

    for (let i = 1; i < materials.length; i++) {
      expect(materials[i].displayOrder).toBeGreaterThan(materials[i - 1].displayOrder);
    }
  });
});

describe('calculateFramePrice helper', () => {
  it('should apply material price modifier', () => {
    const basePrice = 100;
    const price = calculateFramePrice(basePrice, 'wood-oak');

    expect(price).toBe(140); // 100 * 1.4 = 140
  });

  it('should apply material modifier for walnut', () => {
    const basePrice = 100;
    const price = calculateFramePrice(basePrice, 'wood-walnut');

    expect(price).toBe(160); // 100 * 1.6 = 160
  });

  it('should add finish cost when provided', () => {
    const basePrice = 100;
    const price = calculateFramePrice(basePrice, 'wood-oak', 'finish-painted-white');

    expect(price).toBe(150); // (100 * 1.4) + 10 = 150
  });

  it('should handle natural finish (zero cost)', () => {
    const basePrice = 100;
    const price = calculateFramePrice(basePrice, 'wood-oak', 'finish-natural');

    expect(price).toBe(140); // (100 * 1.4) + 0 = 140
  });

  it('should return base price for invalid material', () => {
    const basePrice = 100;
    const price = calculateFramePrice(basePrice, 'invalid-material');

    expect(price).toBe(100);
  });

  it('should ignore invalid finish', () => {
    const basePrice = 100;
    const price = calculateFramePrice(basePrice, 'wood-oak', 'invalid-finish');

    expect(price).toBe(140); // Just material modifier
  });

  it('should round to 2 decimal places', () => {
    const basePrice = 99.99;
    const price = calculateFramePrice(basePrice, 'wood-oak');

    expect(price).toBe(139.99);
    expect(price.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
  });

  it('should handle complex calculation correctly', () => {
    const basePrice = 89.99;
    const price = calculateFramePrice(basePrice, 'wood-walnut', 'finish-distressed');

    // (89.99 * 1.6) + 20 = 143.984 + 20 = 163.984 -> 163.98
    expect(price).toBe(163.98);
  });

  it('should handle zero base price', () => {
    const basePrice = 0;
    const price = calculateFramePrice(basePrice, 'wood-oak', 'finish-painted-white');

    expect(price).toBe(10); // (0 * 1.4) + 10 = 10
  });
});

describe('FRAME_CONSTRAINTS constant', () => {
  it('should have minimum price modifier', () => {
    expect(FRAME_CONSTRAINTS.MIN_PRICE_MODIFIER).toBe(1.0);
  });

  it('should have maximum price modifier', () => {
    expect(FRAME_CONSTRAINTS.MAX_PRICE_MODIFIER).toBe(3.0);
  });

  it('should have minimum additional cost', () => {
    expect(FRAME_CONSTRAINTS.MIN_ADDITIONAL_COST).toBe(0);
  });

  it('should have maximum additional cost', () => {
    expect(FRAME_CONSTRAINTS.MAX_ADDITIONAL_COST).toBe(100);
  });

  it('should have logical constraints (min < max)', () => {
    expect(FRAME_CONSTRAINTS.MIN_PRICE_MODIFIER).toBeLessThan(
      FRAME_CONSTRAINTS.MAX_PRICE_MODIFIER
    );
    expect(FRAME_CONSTRAINTS.MIN_ADDITIONAL_COST).toBeLessThan(
      FRAME_CONSTRAINTS.MAX_ADDITIONAL_COST
    );
  });

  it('should have all materials within price modifier constraints', () => {
    FRAME_MATERIALS.forEach((material) => {
      expect(material.priceModifier).toBeGreaterThanOrEqual(
        FRAME_CONSTRAINTS.MIN_PRICE_MODIFIER
      );
      expect(material.priceModifier).toBeLessThanOrEqual(
        FRAME_CONSTRAINTS.MAX_PRICE_MODIFIER
      );
    });
  });

  it('should have all finishes within additional cost constraints', () => {
    FRAME_FINISHES.forEach((finish) => {
      expect(finish.additionalCost).toBeGreaterThanOrEqual(
        FRAME_CONSTRAINTS.MIN_ADDITIONAL_COST
      );
      expect(finish.additionalCost).toBeLessThanOrEqual(
        FRAME_CONSTRAINTS.MAX_ADDITIONAL_COST
      );
    });
  });
});

describe('Type structure validation', () => {
  it('should have all required fields in FrameMaterial', () => {
    FRAME_MATERIALS.forEach((material) => {
      expect(material).toHaveProperty('id');
      expect(material).toHaveProperty('name');
      expect(material).toHaveProperty('description');
      expect(material).toHaveProperty('priceModifier');
      expect(material).toHaveProperty('isPopular');
      expect(material).toHaveProperty('displayOrder');
    });
  });

  it('should have all required fields in FrameType', () => {
    FRAME_TYPES.forEach((frame) => {
      expect(frame).toHaveProperty('id');
      expect(frame).toHaveProperty('name');
      expect(frame).toHaveProperty('type');
      expect(frame).toHaveProperty('description');
      expect(frame).toHaveProperty('materials');
      expect(frame).toHaveProperty('imageUrl');
      expect(frame).toHaveProperty('isActive');
      expect(frame).toHaveProperty('displayOrder');
    });
  });

  it('should have all required fields in FrameFinish', () => {
    FRAME_FINISHES.forEach((finish) => {
      expect(finish).toHaveProperty('id');
      expect(finish).toHaveProperty('name');
      expect(finish).toHaveProperty('description');
      expect(finish).toHaveProperty('additionalCost');
    });
  });
});
