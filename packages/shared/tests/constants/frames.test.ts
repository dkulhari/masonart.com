/**
 * Frame Constants Tests
 *
 * Comprehensive tests for frame options including:
 * - Frame options (poster-only, stretched canvas, various frames)
 * - Mat options (no mat, white, black, double mat)
 * - Glass options (standard, non-glare, acrylic, museum)
 * - Lookup maps and helper functions
 * - Default values and gift wrap configuration
 */

import { describe, it, expect } from "vitest";
import {
  // Individual frame options
  POSTER_ONLY_FRAME,
  STRETCHED_CANVAS_FRAME,
  BLACK_FRAME,
  WHITE_FRAME,
  NATURAL_WOOD_FRAME,
  DARK_WOOD_FRAME,
  GOLD_FRAME,
  SILVER_FRAME,
  FLOATING_FRAME,
  // Frame arrays
  ALL_FRAME_OPTIONS,
  ACTUAL_FRAME_OPTIONS,
  // Mat options
  NO_MAT,
  WHITE_MAT,
  OFF_WHITE_MAT,
  BLACK_MAT,
  DOUBLE_MAT,
  ALL_MAT_OPTIONS,
  ACTUAL_MAT_OPTIONS,
  // Glass options
  STANDARD_GLASS,
  NON_GLARE_GLASS,
  ACRYLIC_GLASS,
  MUSEUM_GLASS,
  ALL_GLASS_OPTIONS,
  // Lookup maps
  FRAME_BY_ID,
  FRAME_BY_TYPE,
  MAT_BY_ID,
  MAT_BY_TYPE,
  GLASS_BY_ID,
  GLASS_BY_TYPE,
  // Helper functions
  getFrameById,
  getFrameByType,
  getMatById,
  getMatByType,
  getGlassById,
  getGlassByType,
  frameRequiresGlass,
  frameCanHaveMat,
  getGlassOptionsForFrame,
  getMatOptionsForFrame,
  // Default values
  DEFAULT_FRAME,
  DEFAULT_MAT,
  DEFAULT_GLASS,
  // Gift wrap
  GIFT_WRAP_PRICE_INR,
  GIFT_WRAP_CONFIG,
} from "../../src/constants/frames.js";

// ============================================================================
// Frame Options Tests
// ============================================================================

describe("Individual frame options", () => {
  describe("POSTER_ONLY_FRAME", () => {
    it("should have correct structure", () => {
      expect(POSTER_ONLY_FRAME.id).toBe("frame-poster-only");
      expect(POSTER_ONLY_FRAME.type).toBe("poster-only");
      expect(POSTER_ONLY_FRAME.name).toBe("Poster Only (Rolled)");
      expect(POSTER_ONLY_FRAME.isAvailable).toBe(true);
    });

    it("should have zero price modifier (base modifier)", () => {
      expect(POSTER_ONLY_FRAME.priceModifier.type).toBe("percentage");
      expect(POSTER_ONLY_FRAME.priceModifier.value).toBe(0);
    });

    it("should have description and material", () => {
      expect(POSTER_ONLY_FRAME.description).toBeTruthy();
      expect(POSTER_ONLY_FRAME.material).toBeTruthy();
    });
  });

  describe("STRETCHED_CANVAS_FRAME", () => {
    it("should have correct structure", () => {
      expect(STRETCHED_CANVAS_FRAME.id).toBe("frame-stretched-canvas");
      expect(STRETCHED_CANVAS_FRAME.type).toBe("stretched-canvas");
      expect(STRETCHED_CANVAS_FRAME.name).toBe("Stretched Canvas");
      expect(STRETCHED_CANVAS_FRAME.isAvailable).toBe(true);
    });

    it("should have 30% price modifier", () => {
      expect(STRETCHED_CANVAS_FRAME.priceModifier.type).toBe("percentage");
      expect(STRETCHED_CANVAS_FRAME.priceModifier.value).toBe(30);
    });
  });

  describe("BLACK_FRAME", () => {
    it("should have correct structure", () => {
      expect(BLACK_FRAME.id).toBe("frame-black");
      expect(BLACK_FRAME.type).toBe("black-frame");
      expect(BLACK_FRAME.name).toBe("Black Frame");
      expect(BLACK_FRAME.isAvailable).toBe(true);
    });

    it("should have 40% price modifier", () => {
      expect(BLACK_FRAME.priceModifier.type).toBe("percentage");
      expect(BLACK_FRAME.priceModifier.value).toBe(40);
    });

    it("should have available colors", () => {
      expect(BLACK_FRAME.availableColors).toContain("matte-black");
    });
  });

  describe("WHITE_FRAME", () => {
    it("should have correct structure", () => {
      expect(WHITE_FRAME.id).toBe("frame-white");
      expect(WHITE_FRAME.type).toBe("white-frame");
      expect(WHITE_FRAME.name).toBe("White Frame");
    });

    it("should have 40% price modifier", () => {
      expect(WHITE_FRAME.priceModifier.type).toBe("percentage");
      expect(WHITE_FRAME.priceModifier.value).toBe(40);
    });

    it("should have color options", () => {
      expect(WHITE_FRAME.availableColors).toContain("pure-white");
      expect(WHITE_FRAME.availableColors).toContain("off-white");
    });
  });

  describe("NATURAL_WOOD_FRAME", () => {
    it("should have correct structure", () => {
      expect(NATURAL_WOOD_FRAME.id).toBe("frame-natural-wood");
      expect(NATURAL_WOOD_FRAME.type).toBe("natural-wood-frame");
      expect(NATURAL_WOOD_FRAME.name).toBe("Natural Wood Frame");
    });

    it("should have 45% price modifier", () => {
      expect(NATURAL_WOOD_FRAME.priceModifier.value).toBe(45);
    });

    it("should have oak color options", () => {
      expect(NATURAL_WOOD_FRAME.availableColors).toContain("light-oak");
      expect(NATURAL_WOOD_FRAME.availableColors).toContain("honey-oak");
    });
  });

  describe("DARK_WOOD_FRAME", () => {
    it("should have correct structure", () => {
      expect(DARK_WOOD_FRAME.id).toBe("frame-dark-wood");
      expect(DARK_WOOD_FRAME.type).toBe("dark-wood-frame");
      expect(DARK_WOOD_FRAME.name).toBe("Dark Wood Frame");
    });

    it("should have 45% price modifier", () => {
      expect(DARK_WOOD_FRAME.priceModifier.value).toBe(45);
    });

    it("should have dark wood color options", () => {
      expect(DARK_WOOD_FRAME.availableColors).toContain("walnut");
      expect(DARK_WOOD_FRAME.availableColors).toContain("espresso");
      expect(DARK_WOOD_FRAME.availableColors).toContain("mahogany");
    });
  });

  describe("GOLD_FRAME", () => {
    it("should have correct structure", () => {
      expect(GOLD_FRAME.id).toBe("frame-gold");
      expect(GOLD_FRAME.type).toBe("gold-frame");
      expect(GOLD_FRAME.name).toBe("Gold Frame");
    });

    it("should have 50% price modifier (premium)", () => {
      expect(GOLD_FRAME.priceModifier.value).toBe(50);
    });

    it("should have gold color options", () => {
      expect(GOLD_FRAME.availableColors).toContain("brushed-gold");
      expect(GOLD_FRAME.availableColors).toContain("antique-gold");
    });
  });

  describe("SILVER_FRAME", () => {
    it("should have correct structure", () => {
      expect(SILVER_FRAME.id).toBe("frame-silver");
      expect(SILVER_FRAME.type).toBe("silver-frame");
      expect(SILVER_FRAME.name).toBe("Silver Frame");
    });

    it("should have 50% price modifier (premium)", () => {
      expect(SILVER_FRAME.priceModifier.value).toBe(50);
    });

    it("should have silver color options", () => {
      expect(SILVER_FRAME.availableColors).toContain("brushed-silver");
      expect(SILVER_FRAME.availableColors).toContain("chrome");
    });
  });

  describe("FLOATING_FRAME", () => {
    it("should have correct structure", () => {
      expect(FLOATING_FRAME.id).toBe("frame-floating");
      expect(FLOATING_FRAME.type).toBe("floating-frame");
      expect(FLOATING_FRAME.name).toBe("Floating Frame");
    });

    it("should have 55% price modifier (highest)", () => {
      expect(FLOATING_FRAME.priceModifier.value).toBe(55);
    });

    it("should have multiple color options", () => {
      expect(FLOATING_FRAME.availableColors).toContain("black");
      expect(FLOATING_FRAME.availableColors).toContain("white");
      expect(FLOATING_FRAME.availableColors).toContain("natural-wood");
    });
  });
});

// ============================================================================
// ALL_FRAME_OPTIONS Tests
// ============================================================================

describe("ALL_FRAME_OPTIONS array", () => {
  it("should have 9 frame options", () => {
    expect(ALL_FRAME_OPTIONS.length).toBe(9);
  });

  it("should have unique IDs for all frames", () => {
    const ids = ALL_FRAME_OPTIONS.map((frame) => frame.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ALL_FRAME_OPTIONS.length);
  });

  it("should have unique types for all frames", () => {
    const types = ALL_FRAME_OPTIONS.map((frame) => frame.type);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBe(ALL_FRAME_OPTIONS.length);
  });

  it("should include all individual frame options", () => {
    expect(ALL_FRAME_OPTIONS).toContain(POSTER_ONLY_FRAME);
    expect(ALL_FRAME_OPTIONS).toContain(STRETCHED_CANVAS_FRAME);
    expect(ALL_FRAME_OPTIONS).toContain(BLACK_FRAME);
    expect(ALL_FRAME_OPTIONS).toContain(WHITE_FRAME);
    expect(ALL_FRAME_OPTIONS).toContain(NATURAL_WOOD_FRAME);
    expect(ALL_FRAME_OPTIONS).toContain(DARK_WOOD_FRAME);
    expect(ALL_FRAME_OPTIONS).toContain(GOLD_FRAME);
    expect(ALL_FRAME_OPTIONS).toContain(SILVER_FRAME);
    expect(ALL_FRAME_OPTIONS).toContain(FLOATING_FRAME);
  });

  it("should have all frames available", () => {
    ALL_FRAME_OPTIONS.forEach((frame) => {
      expect(frame.isAvailable).toBe(true);
    });
  });

  it("should have descriptions for all frames", () => {
    ALL_FRAME_OPTIONS.forEach((frame) => {
      expect(frame.description).toBeTruthy();
      expect(frame.description.length).toBeGreaterThan(10);
    });
  });

  it("should have materials for all frames", () => {
    ALL_FRAME_OPTIONS.forEach((frame) => {
      expect(frame.material).toBeTruthy();
    });
  });
});

// ============================================================================
// ACTUAL_FRAME_OPTIONS Tests
// ============================================================================

describe("ACTUAL_FRAME_OPTIONS array", () => {
  it("should have 7 actual frame options (excluding poster-only and canvas)", () => {
    expect(ACTUAL_FRAME_OPTIONS.length).toBe(7);
  });

  it("should not include poster-only", () => {
    expect(ACTUAL_FRAME_OPTIONS).not.toContain(POSTER_ONLY_FRAME);
    expect(ACTUAL_FRAME_OPTIONS.some((f) => f.type === "poster-only")).toBe(false);
  });

  it("should not include stretched canvas", () => {
    expect(ACTUAL_FRAME_OPTIONS).not.toContain(STRETCHED_CANVAS_FRAME);
    expect(ACTUAL_FRAME_OPTIONS.some((f) => f.type === "stretched-canvas")).toBe(false);
  });

  it("should include all actual frames", () => {
    expect(ACTUAL_FRAME_OPTIONS).toContain(BLACK_FRAME);
    expect(ACTUAL_FRAME_OPTIONS).toContain(WHITE_FRAME);
    expect(ACTUAL_FRAME_OPTIONS).toContain(NATURAL_WOOD_FRAME);
    expect(ACTUAL_FRAME_OPTIONS).toContain(DARK_WOOD_FRAME);
    expect(ACTUAL_FRAME_OPTIONS).toContain(GOLD_FRAME);
    expect(ACTUAL_FRAME_OPTIONS).toContain(SILVER_FRAME);
    expect(ACTUAL_FRAME_OPTIONS).toContain(FLOATING_FRAME);
  });
});

// ============================================================================
// Mat Options Tests
// ============================================================================

describe("Mat options", () => {
  describe("NO_MAT", () => {
    it("should have correct structure", () => {
      expect(NO_MAT.id).toBe("mat-none");
      expect(NO_MAT.type).toBe("no-mat");
      expect(NO_MAT.name).toBe("No Mat");
      expect(NO_MAT.borderWidth).toBe(0);
      expect(NO_MAT.isAvailable).toBe(true);
    });

    it("should have zero price modifier", () => {
      expect(NO_MAT.priceModifier.type).toBe("percentage");
      expect(NO_MAT.priceModifier.value).toBe(0);
    });
  });

  describe("WHITE_MAT", () => {
    it("should have correct structure", () => {
      expect(WHITE_MAT.id).toBe("mat-white");
      expect(WHITE_MAT.type).toBe("white-mat");
      expect(WHITE_MAT.name).toBe("White Mat");
      expect(WHITE_MAT.borderWidth).toBe(2);
    });

    it("should have fixed price modifier of 500 INR (50000 paise)", () => {
      expect(WHITE_MAT.priceModifier.type).toBe("fixed");
      expect(WHITE_MAT.priceModifier.value).toBe(50000);
      expect(WHITE_MAT.priceModifier.currency).toBe("INR");
    });
  });

  describe("OFF_WHITE_MAT", () => {
    it("should have correct structure", () => {
      expect(OFF_WHITE_MAT.id).toBe("mat-off-white");
      expect(OFF_WHITE_MAT.type).toBe("off-white-mat");
      expect(OFF_WHITE_MAT.name).toBe("Off-White Mat");
      expect(OFF_WHITE_MAT.borderWidth).toBe(2);
    });

    it("should have same price as white mat", () => {
      expect(OFF_WHITE_MAT.priceModifier.value).toBe(WHITE_MAT.priceModifier.value);
    });
  });

  describe("BLACK_MAT", () => {
    it("should have correct structure", () => {
      expect(BLACK_MAT.id).toBe("mat-black");
      expect(BLACK_MAT.type).toBe("black-mat");
      expect(BLACK_MAT.name).toBe("Black Mat");
      expect(BLACK_MAT.borderWidth).toBe(2);
    });

    it("should have same price as other colored mats", () => {
      expect(BLACK_MAT.priceModifier.value).toBe(WHITE_MAT.priceModifier.value);
    });
  });

  describe("DOUBLE_MAT", () => {
    it("should have correct structure", () => {
      expect(DOUBLE_MAT.id).toBe("mat-double");
      expect(DOUBLE_MAT.type).toBe("double-mat");
      expect(DOUBLE_MAT.name).toBe("Double Mat");
      expect(DOUBLE_MAT.borderWidth).toBe(2.5);
    });

    it("should have higher price modifier (800 INR = 80000 paise)", () => {
      expect(DOUBLE_MAT.priceModifier.type).toBe("fixed");
      expect(DOUBLE_MAT.priceModifier.value).toBe(80000);
    });
  });
});

// ============================================================================
// ALL_MAT_OPTIONS Tests
// ============================================================================

describe("ALL_MAT_OPTIONS array", () => {
  it("should have 5 mat options", () => {
    expect(ALL_MAT_OPTIONS.length).toBe(5);
  });

  it("should have unique IDs", () => {
    const ids = ALL_MAT_OPTIONS.map((mat) => mat.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ALL_MAT_OPTIONS.length);
  });

  it("should have unique types", () => {
    const types = ALL_MAT_OPTIONS.map((mat) => mat.type);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBe(ALL_MAT_OPTIONS.length);
  });

  it("should include all mat options", () => {
    expect(ALL_MAT_OPTIONS).toContain(NO_MAT);
    expect(ALL_MAT_OPTIONS).toContain(WHITE_MAT);
    expect(ALL_MAT_OPTIONS).toContain(OFF_WHITE_MAT);
    expect(ALL_MAT_OPTIONS).toContain(BLACK_MAT);
    expect(ALL_MAT_OPTIONS).toContain(DOUBLE_MAT);
  });

  it("should have descriptions for all mats", () => {
    ALL_MAT_OPTIONS.forEach((mat) => {
      expect(mat.description).toBeTruthy();
    });
  });
});

// ============================================================================
// ACTUAL_MAT_OPTIONS Tests
// ============================================================================

describe("ACTUAL_MAT_OPTIONS array", () => {
  it("should have 4 actual mat options (excluding no-mat)", () => {
    expect(ACTUAL_MAT_OPTIONS.length).toBe(4);
  });

  it("should not include no-mat", () => {
    expect(ACTUAL_MAT_OPTIONS).not.toContain(NO_MAT);
    expect(ACTUAL_MAT_OPTIONS.some((m) => m.type === "no-mat")).toBe(false);
  });

  it("should include all actual mats", () => {
    expect(ACTUAL_MAT_OPTIONS).toContain(WHITE_MAT);
    expect(ACTUAL_MAT_OPTIONS).toContain(OFF_WHITE_MAT);
    expect(ACTUAL_MAT_OPTIONS).toContain(BLACK_MAT);
    expect(ACTUAL_MAT_OPTIONS).toContain(DOUBLE_MAT);
  });
});

// ============================================================================
// Glass Options Tests
// ============================================================================

describe("Glass options", () => {
  describe("STANDARD_GLASS", () => {
    it("should have correct structure", () => {
      expect(STANDARD_GLASS.id).toBe("glass-standard");
      expect(STANDARD_GLASS.type).toBe("standard-glass");
      expect(STANDARD_GLASS.name).toBe("Standard Glass");
      expect(STANDARD_GLASS.hasUVProtection).toBe(false);
      expect(STANDARD_GLASS.isAntiReflective).toBe(false);
      expect(STANDARD_GLASS.isAvailable).toBe(true);
    });

    it("should have zero price modifier (base option)", () => {
      expect(STANDARD_GLASS.priceModifier.type).toBe("percentage");
      expect(STANDARD_GLASS.priceModifier.value).toBe(0);
    });
  });

  describe("NON_GLARE_GLASS", () => {
    it("should have correct structure", () => {
      expect(NON_GLARE_GLASS.id).toBe("glass-non-glare");
      expect(NON_GLARE_GLASS.type).toBe("non-glare-glass");
      expect(NON_GLARE_GLASS.name).toBe("Non-Glare Glass");
      expect(NON_GLARE_GLASS.hasUVProtection).toBe(false);
      expect(NON_GLARE_GLASS.isAntiReflective).toBe(true);
    });

    it("should have fixed price modifier of 400 INR (40000 paise)", () => {
      expect(NON_GLARE_GLASS.priceModifier.type).toBe("fixed");
      expect(NON_GLARE_GLASS.priceModifier.value).toBe(40000);
    });
  });

  describe("ACRYLIC_GLASS", () => {
    it("should have correct structure", () => {
      expect(ACRYLIC_GLASS.id).toBe("glass-acrylic");
      expect(ACRYLIC_GLASS.type).toBe("acrylic");
      expect(ACRYLIC_GLASS.name).toBe("Acrylic/Plexiglass");
      expect(ACRYLIC_GLASS.hasUVProtection).toBe(true);
      expect(ACRYLIC_GLASS.isAntiReflective).toBe(false);
    });

    it("should have fixed price modifier of 600 INR (60000 paise)", () => {
      expect(ACRYLIC_GLASS.priceModifier.type).toBe("fixed");
      expect(ACRYLIC_GLASS.priceModifier.value).toBe(60000);
    });
  });

  describe("MUSEUM_GLASS", () => {
    it("should have correct structure", () => {
      expect(MUSEUM_GLASS.id).toBe("glass-museum");
      expect(MUSEUM_GLASS.type).toBe("museum-glass");
      expect(MUSEUM_GLASS.name).toBe("Museum Glass");
      expect(MUSEUM_GLASS.hasUVProtection).toBe(true);
      expect(MUSEUM_GLASS.isAntiReflective).toBe(true);
    });

    it("should have highest fixed price modifier of 1200 INR (120000 paise)", () => {
      expect(MUSEUM_GLASS.priceModifier.type).toBe("fixed");
      expect(MUSEUM_GLASS.priceModifier.value).toBe(120000);
    });
  });
});

// ============================================================================
// ALL_GLASS_OPTIONS Tests
// ============================================================================

describe("ALL_GLASS_OPTIONS array", () => {
  it("should have 4 glass options", () => {
    expect(ALL_GLASS_OPTIONS.length).toBe(4);
  });

  it("should have unique IDs", () => {
    const ids = ALL_GLASS_OPTIONS.map((glass) => glass.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ALL_GLASS_OPTIONS.length);
  });

  it("should have unique types", () => {
    const types = ALL_GLASS_OPTIONS.map((glass) => glass.type);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBe(ALL_GLASS_OPTIONS.length);
  });

  it("should include all glass options", () => {
    expect(ALL_GLASS_OPTIONS).toContain(STANDARD_GLASS);
    expect(ALL_GLASS_OPTIONS).toContain(NON_GLARE_GLASS);
    expect(ALL_GLASS_OPTIONS).toContain(ACRYLIC_GLASS);
    expect(ALL_GLASS_OPTIONS).toContain(MUSEUM_GLASS);
  });

  it("should have descriptions for all glass options", () => {
    ALL_GLASS_OPTIONS.forEach((glass) => {
      expect(glass.description).toBeTruthy();
    });
  });
});

// ============================================================================
// Frame Lookup Maps Tests
// ============================================================================

describe("FRAME_BY_ID map", () => {
  it("should be a Map with all frame options", () => {
    expect(FRAME_BY_ID).toBeInstanceOf(Map);
    expect(FRAME_BY_ID.size).toBe(ALL_FRAME_OPTIONS.length);
  });

  it("should allow O(1) lookup by ID", () => {
    const frame = FRAME_BY_ID.get("frame-black");
    expect(frame).toBeDefined();
    expect(frame?.name).toBe("Black Frame");
  });

  it("should return undefined for invalid IDs", () => {
    expect(FRAME_BY_ID.get("invalid-id")).toBeUndefined();
    expect(FRAME_BY_ID.get("")).toBeUndefined();
  });
});

describe("FRAME_BY_TYPE map", () => {
  it("should be a Map with all frame types", () => {
    expect(FRAME_BY_TYPE).toBeInstanceOf(Map);
    expect(FRAME_BY_TYPE.size).toBe(ALL_FRAME_OPTIONS.length);
  });

  it("should allow lookup by type", () => {
    const frame = FRAME_BY_TYPE.get("black-frame");
    expect(frame).toBeDefined();
    expect(frame?.id).toBe("frame-black");
  });

  it("should return undefined for invalid types", () => {
    expect(FRAME_BY_TYPE.get("invalid-type" as "black-frame")).toBeUndefined();
  });
});

// ============================================================================
// Mat Lookup Maps Tests
// ============================================================================

describe("MAT_BY_ID map", () => {
  it("should be a Map with all mat options", () => {
    expect(MAT_BY_ID).toBeInstanceOf(Map);
    expect(MAT_BY_ID.size).toBe(ALL_MAT_OPTIONS.length);
  });

  it("should allow O(1) lookup by ID", () => {
    const mat = MAT_BY_ID.get("mat-white");
    expect(mat).toBeDefined();
    expect(mat?.name).toBe("White Mat");
  });
});

describe("MAT_BY_TYPE map", () => {
  it("should be a Map with all mat types", () => {
    expect(MAT_BY_TYPE).toBeInstanceOf(Map);
    expect(MAT_BY_TYPE.size).toBe(ALL_MAT_OPTIONS.length);
  });

  it("should allow lookup by type", () => {
    const mat = MAT_BY_TYPE.get("white-mat");
    expect(mat).toBeDefined();
    expect(mat?.id).toBe("mat-white");
  });
});

// ============================================================================
// Glass Lookup Maps Tests
// ============================================================================

describe("GLASS_BY_ID map", () => {
  it("should be a Map with all glass options", () => {
    expect(GLASS_BY_ID).toBeInstanceOf(Map);
    expect(GLASS_BY_ID.size).toBe(ALL_GLASS_OPTIONS.length);
  });

  it("should allow O(1) lookup by ID", () => {
    const glass = GLASS_BY_ID.get("glass-museum");
    expect(glass).toBeDefined();
    expect(glass?.name).toBe("Museum Glass");
  });
});

describe("GLASS_BY_TYPE map", () => {
  it("should be a Map with all glass types", () => {
    expect(GLASS_BY_TYPE).toBeInstanceOf(Map);
    expect(GLASS_BY_TYPE.size).toBe(ALL_GLASS_OPTIONS.length);
  });

  it("should allow lookup by type", () => {
    const glass = GLASS_BY_TYPE.get("museum-glass");
    expect(glass).toBeDefined();
    expect(glass?.id).toBe("glass-museum");
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("getFrameById helper", () => {
  it("should return frame for valid ID", () => {
    const frame = getFrameById("frame-black");
    expect(frame).toBeDefined();
    expect(frame?.id).toBe("frame-black");
    expect(frame?.name).toBe("Black Frame");
  });

  it("should return frame for all valid IDs", () => {
    ALL_FRAME_OPTIONS.forEach((frame) => {
      expect(getFrameById(frame.id)).toBe(frame);
    });
  });

  it("should return undefined for invalid ID", () => {
    expect(getFrameById("invalid-frame-id")).toBeUndefined();
  });

  it("should return undefined for empty string", () => {
    expect(getFrameById("")).toBeUndefined();
  });
});

describe("getFrameByType helper", () => {
  it("should return frame for valid type", () => {
    const frame = getFrameByType("black-frame");
    expect(frame).toBeDefined();
    expect(frame?.type).toBe("black-frame");
  });

  it("should return undefined for invalid type", () => {
    expect(getFrameByType("invalid-type" as "black-frame")).toBeUndefined();
  });
});

describe("getMatById helper", () => {
  it("should return mat for valid ID", () => {
    const mat = getMatById("mat-white");
    expect(mat).toBeDefined();
    expect(mat?.id).toBe("mat-white");
    expect(mat?.name).toBe("White Mat");
  });

  it("should return mat for all valid IDs", () => {
    ALL_MAT_OPTIONS.forEach((mat) => {
      expect(getMatById(mat.id)).toBe(mat);
    });
  });

  it("should return undefined for invalid ID", () => {
    expect(getMatById("invalid-mat-id")).toBeUndefined();
  });
});

describe("getMatByType helper", () => {
  it("should return mat for valid type", () => {
    const mat = getMatByType("white-mat");
    expect(mat).toBeDefined();
    expect(mat?.type).toBe("white-mat");
  });

  it("should return undefined for invalid type", () => {
    expect(getMatByType("invalid-type" as "white-mat")).toBeUndefined();
  });
});

describe("getGlassById helper", () => {
  it("should return glass for valid ID", () => {
    const glass = getGlassById("glass-museum");
    expect(glass).toBeDefined();
    expect(glass?.id).toBe("glass-museum");
    expect(glass?.name).toBe("Museum Glass");
  });

  it("should return glass for all valid IDs", () => {
    ALL_GLASS_OPTIONS.forEach((glass) => {
      expect(getGlassById(glass.id)).toBe(glass);
    });
  });

  it("should return undefined for invalid ID", () => {
    expect(getGlassById("invalid-glass-id")).toBeUndefined();
  });
});

describe("getGlassByType helper", () => {
  it("should return glass for valid type", () => {
    const glass = getGlassByType("museum-glass");
    expect(glass).toBeDefined();
    expect(glass?.type).toBe("museum-glass");
  });

  it("should return undefined for invalid type", () => {
    expect(getGlassByType("invalid-type" as "museum-glass")).toBeUndefined();
  });
});

// ============================================================================
// frameRequiresGlass Helper Tests
// ============================================================================

describe("frameRequiresGlass helper", () => {
  it("should return false for poster-only", () => {
    expect(frameRequiresGlass(POSTER_ONLY_FRAME)).toBe(false);
  });

  it("should return false for stretched canvas", () => {
    expect(frameRequiresGlass(STRETCHED_CANVAS_FRAME)).toBe(false);
  });

  it("should return true for actual frames", () => {
    ACTUAL_FRAME_OPTIONS.forEach((frame) => {
      expect(frameRequiresGlass(frame)).toBe(true);
    });
  });

  it("should return true for black frame", () => {
    expect(frameRequiresGlass(BLACK_FRAME)).toBe(true);
  });

  it("should return true for floating frame", () => {
    expect(frameRequiresGlass(FLOATING_FRAME)).toBe(true);
  });
});

// ============================================================================
// frameCanHaveMat Helper Tests
// ============================================================================

describe("frameCanHaveMat helper", () => {
  it("should return false for poster-only", () => {
    expect(frameCanHaveMat(POSTER_ONLY_FRAME)).toBe(false);
  });

  it("should return false for stretched canvas", () => {
    expect(frameCanHaveMat(STRETCHED_CANVAS_FRAME)).toBe(false);
  });

  it("should return true for actual frames", () => {
    ACTUAL_FRAME_OPTIONS.forEach((frame) => {
      expect(frameCanHaveMat(frame)).toBe(true);
    });
  });
});

// ============================================================================
// getGlassOptionsForFrame Helper Tests
// ============================================================================

describe("getGlassOptionsForFrame helper", () => {
  it("should return empty array for poster-only", () => {
    const options = getGlassOptionsForFrame(POSTER_ONLY_FRAME);
    expect(options).toEqual([]);
  });

  it("should return empty array for stretched canvas", () => {
    const options = getGlassOptionsForFrame(STRETCHED_CANVAS_FRAME);
    expect(options).toEqual([]);
  });

  it("should return all glass options for actual frames", () => {
    ACTUAL_FRAME_OPTIONS.forEach((frame) => {
      const options = getGlassOptionsForFrame(frame);
      expect(options).toBe(ALL_GLASS_OPTIONS);
      expect(options.length).toBe(4);
    });
  });
});

// ============================================================================
// getMatOptionsForFrame Helper Tests
// ============================================================================

describe("getMatOptionsForFrame helper", () => {
  it("should return empty array for poster-only", () => {
    const options = getMatOptionsForFrame(POSTER_ONLY_FRAME);
    expect(options).toEqual([]);
  });

  it("should return empty array for stretched canvas", () => {
    const options = getMatOptionsForFrame(STRETCHED_CANVAS_FRAME);
    expect(options).toEqual([]);
  });

  it("should return all mat options for actual frames", () => {
    ACTUAL_FRAME_OPTIONS.forEach((frame) => {
      const options = getMatOptionsForFrame(frame);
      expect(options).toBe(ALL_MAT_OPTIONS);
      expect(options.length).toBe(5);
    });
  });
});

// ============================================================================
// Default Values Tests
// ============================================================================

describe("DEFAULT_FRAME constant", () => {
  it("should be POSTER_ONLY_FRAME", () => {
    expect(DEFAULT_FRAME).toBe(POSTER_ONLY_FRAME);
  });

  it("should be the base option", () => {
    expect(DEFAULT_FRAME.priceModifier.value).toBe(0);
  });
});

describe("DEFAULT_MAT constant", () => {
  it("should be NO_MAT", () => {
    expect(DEFAULT_MAT).toBe(NO_MAT);
  });

  it("should be the base option", () => {
    expect(DEFAULT_MAT.priceModifier.value).toBe(0);
  });
});

describe("DEFAULT_GLASS constant", () => {
  it("should be STANDARD_GLASS", () => {
    expect(DEFAULT_GLASS).toBe(STANDARD_GLASS);
  });

  it("should be the base option", () => {
    expect(DEFAULT_GLASS.priceModifier.value).toBe(0);
  });
});

// ============================================================================
// Gift Wrap Tests
// ============================================================================

describe("GIFT_WRAP_PRICE_INR constant", () => {
  it("should be 25000 paise (250 rupees)", () => {
    expect(GIFT_WRAP_PRICE_INR).toBe(25000);
  });
});

describe("GIFT_WRAP_CONFIG constant", () => {
  it("should have correct structure", () => {
    expect(GIFT_WRAP_CONFIG.id).toBe("gift-wrap");
    expect(GIFT_WRAP_CONFIG.name).toBe("Gift Wrapping");
    expect(GIFT_WRAP_CONFIG.description).toBeTruthy();
    expect(GIFT_WRAP_CONFIG.price).toBe(GIFT_WRAP_PRICE_INR);
    expect(GIFT_WRAP_CONFIG.currency).toBe("INR");
    expect(GIFT_WRAP_CONFIG.isAvailable).toBe(true);
  });
});

// ============================================================================
// Price Modifier Structure Tests
// ============================================================================

describe("Price modifier structures", () => {
  it("should have valid percentage modifiers", () => {
    const percentageFrames = [
      POSTER_ONLY_FRAME,
      STRETCHED_CANVAS_FRAME,
      BLACK_FRAME,
      WHITE_FRAME,
      NATURAL_WOOD_FRAME,
      DARK_WOOD_FRAME,
      GOLD_FRAME,
      SILVER_FRAME,
      FLOATING_FRAME,
    ];

    percentageFrames.forEach((frame) => {
      expect(frame.priceModifier.type).toBe("percentage");
      expect(frame.priceModifier.value).toBeGreaterThanOrEqual(0);
      expect(frame.priceModifier.value).toBeLessThanOrEqual(100);
    });
  });

  it("should have valid fixed modifiers for mats", () => {
    const fixedMats = [WHITE_MAT, OFF_WHITE_MAT, BLACK_MAT, DOUBLE_MAT];

    fixedMats.forEach((mat) => {
      expect(mat.priceModifier.type).toBe("fixed");
      expect(mat.priceModifier.value).toBeGreaterThan(0);
      expect(mat.priceModifier.currency).toBe("INR");
    });
  });

  it("should have valid fixed modifiers for premium glass", () => {
    const fixedGlass = [NON_GLARE_GLASS, ACRYLIC_GLASS, MUSEUM_GLASS];

    fixedGlass.forEach((glass) => {
      expect(glass.priceModifier.type).toBe("fixed");
      expect(glass.priceModifier.value).toBeGreaterThan(0);
      expect(glass.priceModifier.currency).toBe("INR");
    });
  });

  it("should have ascending prices for glass options", () => {
    expect(STANDARD_GLASS.priceModifier.value).toBe(0);
    expect(NON_GLARE_GLASS.priceModifier.value).toBeLessThan(ACRYLIC_GLASS.priceModifier.value);
    expect(ACRYLIC_GLASS.priceModifier.value).toBeLessThan(MUSEUM_GLASS.priceModifier.value);
  });
});

// ============================================================================
// Type Structure Validation
// ============================================================================

describe("FrameOption type structure", () => {
  it("should have all required fields", () => {
    ALL_FRAME_OPTIONS.forEach((frame) => {
      expect(frame).toHaveProperty("id");
      expect(frame).toHaveProperty("type");
      expect(frame).toHaveProperty("name");
      expect(frame).toHaveProperty("description");
      expect(frame).toHaveProperty("priceModifier");
      expect(frame).toHaveProperty("material");
      expect(frame).toHaveProperty("isAvailable");
    });
  });

  it("should have correct field types", () => {
    ALL_FRAME_OPTIONS.forEach((frame) => {
      expect(typeof frame.id).toBe("string");
      expect(typeof frame.type).toBe("string");
      expect(typeof frame.name).toBe("string");
      expect(typeof frame.description).toBe("string");
      expect(typeof frame.priceModifier).toBe("object");
      expect(typeof frame.material).toBe("string");
      expect(typeof frame.isAvailable).toBe("boolean");
    });
  });
});

describe("MatOptionConfig type structure", () => {
  it("should have all required fields", () => {
    ALL_MAT_OPTIONS.forEach((mat) => {
      expect(mat).toHaveProperty("id");
      expect(mat).toHaveProperty("type");
      expect(mat).toHaveProperty("name");
      expect(mat).toHaveProperty("description");
      expect(mat).toHaveProperty("borderWidth");
      expect(mat).toHaveProperty("priceModifier");
      expect(mat).toHaveProperty("isAvailable");
    });
  });
});

describe("GlassOptionConfig type structure", () => {
  it("should have all required fields", () => {
    ALL_GLASS_OPTIONS.forEach((glass) => {
      expect(glass).toHaveProperty("id");
      expect(glass).toHaveProperty("type");
      expect(glass).toHaveProperty("name");
      expect(glass).toHaveProperty("description");
      expect(glass).toHaveProperty("priceModifier");
      expect(glass).toHaveProperty("hasUVProtection");
      expect(glass).toHaveProperty("isAntiReflective");
      expect(glass).toHaveProperty("isAvailable");
    });
  });

  it("should have boolean UV and anti-reflective flags", () => {
    ALL_GLASS_OPTIONS.forEach((glass) => {
      expect(typeof glass.hasUVProtection).toBe("boolean");
      expect(typeof glass.isAntiReflective).toBe("boolean");
    });
  });
});
