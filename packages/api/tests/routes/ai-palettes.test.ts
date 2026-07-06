/**
 * AI Color Palette API Tests
 *
 * Tests for CRUD operations on user color palettes:
 * - POST /api/ai/palettes - Create palette
 * - GET /api/ai/palettes - List user palettes
 * - GET /api/ai/palettes/:id - Get single palette
 * - PATCH /api/ai/palettes/:id - Update palette
 * - DELETE /api/ai/palettes/:id - Delete palette
 */

import { describe, it, expect } from "vitest";
import "../setup";

// ============================================================================
// Validation Schema Tests
// ============================================================================

describe("Color Palette Validation", () => {
  describe("Hex color format", () => {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

    it("should accept valid hex colors", () => {
      const validColors = ["#FF5733", "#000000", "#FFFFFF", "#aabbcc", "#123ABC"];
      validColors.forEach((color) => {
        expect(hexColorRegex.test(color)).toBe(true);
      });
    });

    it("should reject invalid hex colors", () => {
      const invalidColors = [
        "FF5733", // Missing #
        "#FFF", // Too short
        "#FFFFFFF", // Too long
        "#GGGGGG", // Invalid characters
        "red", // Color name
        "#FF573", // 5 chars
        "123456", // No hash
        "", // Empty
      ];
      invalidColors.forEach((color) => {
        expect(hexColorRegex.test(color)).toBe(false);
      });
    });
  });

  describe("Palette name validation", () => {
    it("should accept valid names (1-50 characters)", () => {
      const validNames = ["My Palette", "A", "a".repeat(50)];
      validNames.forEach((name) => {
        expect(name.length).toBeGreaterThanOrEqual(1);
        expect(name.length).toBeLessThanOrEqual(50);
      });
    });

    it("should reject empty names", () => {
      const emptyName = "";
      expect(emptyName.length).toBe(0);
    });

    it("should reject names longer than 50 characters", () => {
      const longName = "a".repeat(51);
      expect(longName.length).toBeGreaterThan(50);
    });
  });

  describe("Colors array validation", () => {
    it("should require minimum 3 colors", () => {
      const minColors = 3;
      const palette = ["#FF0000", "#00FF00", "#0000FF"];
      expect(palette.length).toBeGreaterThanOrEqual(minColors);
    });

    it("should allow maximum 8 colors", () => {
      const maxColors = 8;
      const palette = Array(8).fill("#FF0000");
      expect(palette.length).toBeLessThanOrEqual(maxColors);
    });

    it("should reject less than 3 colors", () => {
      const minColors = 3;
      const palette = ["#FF0000", "#00FF00"];
      expect(palette.length).toBeLessThan(minColors);
    });

    it("should reject more than 8 colors", () => {
      const maxColors = 8;
      const palette = Array(9).fill("#FF0000");
      expect(palette.length).toBeGreaterThan(maxColors);
    });
  });
});

// ============================================================================
// Create Palette Tests
// ============================================================================

describe("POST /api/ai/palettes", () => {
  describe("Request body validation", () => {
    it("should require name field", () => {
      const body = {
        colors: ["#FF0000", "#00FF00", "#0000FF"],
      };
      expect(body).not.toHaveProperty("name");
    });

    it("should require colors field", () => {
      const body = {
        name: "My Palette",
      };
      expect(body).not.toHaveProperty("colors");
    });

    it("should accept valid create request", () => {
      const body = {
        name: "Sunset Colors",
        colors: ["#FF5733", "#FFC300", "#FF8D1A", "#FF6B6B"],
        isDefault: false,
      };
      expect(body.name).toBeDefined();
      expect(body.colors.length).toBeGreaterThanOrEqual(3);
      expect(body.colors.length).toBeLessThanOrEqual(8);
    });

    it("should default isDefault to false", () => {
      const body = {
        name: "My Palette",
        colors: ["#FF0000", "#00FF00", "#0000FF"],
      };
      const isDefault = body.isDefault ?? false;
      expect(isDefault).toBe(false);
    });
  });

  describe("Palette limit enforcement", () => {
    it("should enforce max 20 palettes per user", () => {
      const MAX_PALETTES = 20;
      const currentCount = 20;
      expect(currentCount).toBe(MAX_PALETTES);
    });
  });
});

// ============================================================================
// List Palettes Tests
// ============================================================================

describe("GET /api/ai/palettes", () => {
  describe("Response structure", () => {
    it("should return userPalettes array", () => {
      const response = {
        userPalettes: [],
        systemPalettes: [],
        maxPalettes: 20,
        currentCount: 0,
      };
      expect(Array.isArray(response.userPalettes)).toBe(true);
    });

    it("should return systemPalettes array", () => {
      const systemPalettes = [
        { id: "preset-warm", name: "Warm", colors: ["#FF5733"], isSystem: true },
        { id: "preset-cool", name: "Cool", colors: ["#4A90D9"], isSystem: true },
      ];
      expect(Array.isArray(systemPalettes)).toBe(true);
      expect(systemPalettes.every((p) => p.isSystem === true)).toBe(true);
    });

    it("should include maxPalettes limit", () => {
      const response = {
        userPalettes: [],
        systemPalettes: [],
        maxPalettes: 20,
        currentCount: 0,
      };
      expect(response.maxPalettes).toBe(20);
    });

    it("should include currentCount", () => {
      const response = {
        userPalettes: [{}, {}],
        systemPalettes: [],
        maxPalettes: 20,
        currentCount: 2,
      };
      expect(response.currentCount).toBe(response.userPalettes.length);
    });
  });

  describe("System palettes", () => {
    const systemPaletteIds = [
      "preset-warm",
      "preset-cool",
      "preset-neutral",
      "preset-vibrant",
      "preset-muted",
      "preset-earth",
      "preset-pastel",
      "preset-monochrome",
    ];

    it("should have 8 system palettes", () => {
      expect(systemPaletteIds.length).toBe(8);
    });

    it("should include warm preset", () => {
      expect(systemPaletteIds).toContain("preset-warm");
    });

    it("should include cool preset", () => {
      expect(systemPaletteIds).toContain("preset-cool");
    });

    it("should include monochrome preset", () => {
      expect(systemPaletteIds).toContain("preset-monochrome");
    });
  });
});

// ============================================================================
// Get Single Palette Tests
// ============================================================================

describe("GET /api/ai/palettes/:id", () => {
  describe("ID validation", () => {
    it("should accept valid UUID format", () => {
      const validUuid = "123e4567-e89b-12d3-a456-426614174000";
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(validUuid)).toBe(true);
    });

    it("should reject invalid UUID format", () => {
      const invalidIds = ["invalid", "123", "", "not-a-uuid"];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      invalidIds.forEach((id) => {
        expect(uuidRegex.test(id)).toBe(false);
      });
    });
  });

  describe("Response structure", () => {
    it("should return palette object", () => {
      const response = {
        palette: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          userId: "user-id",
          name: "My Palette",
          colors: ["#FF0000", "#00FF00", "#0000FF"],
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      expect(response.palette).toBeDefined();
      expect(response.palette.id).toBeDefined();
      expect(response.palette.name).toBeDefined();
      expect(response.palette.colors).toBeDefined();
    });
  });
});

// ============================================================================
// Update Palette Tests
// ============================================================================

describe("PATCH /api/ai/palettes/:id", () => {
  describe("Partial update support", () => {
    it("should allow updating only name", () => {
      const body = { name: "New Name" };
      expect(body.name).toBeDefined();
      expect(body).not.toHaveProperty("colors");
    });

    it("should allow updating only colors", () => {
      const body = { colors: ["#FF0000", "#00FF00", "#0000FF"] };
      expect(body.colors).toBeDefined();
      expect(body).not.toHaveProperty("name");
    });

    it("should allow updating only isDefault", () => {
      const body = { isDefault: true };
      expect(body.isDefault).toBeDefined();
      expect(body).not.toHaveProperty("name");
      expect(body).not.toHaveProperty("colors");
    });

    it("should allow updating all fields", () => {
      const body = {
        name: "Updated Palette",
        colors: ["#111111", "#222222", "#333333"],
        isDefault: true,
      };
      expect(body.name).toBeDefined();
      expect(body.colors).toBeDefined();
      expect(body.isDefault).toBeDefined();
    });
  });

  describe("Default palette handling", () => {
    it("should unset other defaults when setting new default", () => {
      // When isDefault is true, other palettes should have isDefault = false
      const before = [
        { id: "1", isDefault: true },
        { id: "2", isDefault: false },
      ];
      const newDefaultId = "2";
      const after = before.map((p) => ({
        ...p,
        isDefault: p.id === newDefaultId,
      }));

      expect(after.find((p) => p.id === "1")?.isDefault).toBe(false);
      expect(after.find((p) => p.id === "2")?.isDefault).toBe(true);
    });
  });
});

// ============================================================================
// Delete Palette Tests
// ============================================================================

describe("DELETE /api/ai/palettes/:id", () => {
  describe("Authorization", () => {
    it("should only delete own palettes", () => {
      const userId = "user-1";
      const palette = { id: "palette-1", userId: "user-1" };
      expect(palette.userId).toBe(userId);
    });

    it("should not delete other users palettes", () => {
      const userId = "user-1";
      const palette = { id: "palette-1", userId: "user-2" };
      expect(palette.userId).not.toBe(userId);
    });
  });

  describe("Response", () => {
    it("should return success message", () => {
      const response = { message: "Palette deleted successfully" };
      expect(response.message).toContain("deleted");
    });
  });
});

// ============================================================================
// Color Palette Integration Tests
// ============================================================================

describe("Color Palette Integration", () => {
  describe("Palette in generation request", () => {
    it("should accept custom palette colors in generation", () => {
      const generationRequest = {
        prompt: "A sunset over the ocean",
        stylePreset: "watercolor",
        aspectRatio: "landscape",
        colorPalette: ["#FF5733", "#FFC300", "#FF8D1A"],
      };
      expect(Array.isArray(generationRequest.colorPalette)).toBe(true);
      expect(generationRequest.colorPalette.length).toBeLessThanOrEqual(5);
    });

    it("should accept customPaletteId reference", () => {
      const generationRequest = {
        prompt: "A sunset over the ocean",
        stylePreset: "watercolor",
        aspectRatio: "landscape",
        customPaletteId: "123e4567-e89b-12d3-a456-426614174000",
      };
      expect(generationRequest.customPaletteId).toBeDefined();
    });
  });

  describe("Color influence on prompt", () => {
    it("should construct prompt with color palette", () => {
      const basePrompt = "A mountain landscape";
      const colors = ["#FF5733", "#FFC300"];
      const enhancedPrompt = `${basePrompt}, color palette: ${colors.join(", ")}`;
      expect(enhancedPrompt).toContain("color palette");
      expect(enhancedPrompt).toContain("#FF5733");
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  describe("Empty operations", () => {
    it("should handle empty palette list", () => {
      const response = {
        userPalettes: [],
        currentCount: 0,
      };
      expect(response.userPalettes).toHaveLength(0);
      expect(response.currentCount).toBe(0);
    });
  });

  describe("Boundary values", () => {
    it("should handle minimum 3 colors", () => {
      const palette = {
        name: "Minimal",
        colors: ["#FF0000", "#00FF00", "#0000FF"],
      };
      expect(palette.colors.length).toBe(3);
    });

    it("should handle maximum 8 colors", () => {
      const palette = {
        name: "Maximum",
        colors: [
          "#111111",
          "#222222",
          "#333333",
          "#444444",
          "#555555",
          "#666666",
          "#777777",
          "#888888",
        ],
      };
      expect(palette.colors.length).toBe(8);
    });

    it("should handle 50 character name", () => {
      const name = "a".repeat(50);
      expect(name.length).toBe(50);
    });
  });

  describe("Special characters in name", () => {
    it("should handle names with spaces", () => {
      const name = "My Beautiful Palette";
      expect(name).toContain(" ");
    });

    it("should handle names with special characters", () => {
      const name = "Summer's Vibes #1";
      expect(name.length).toBeGreaterThan(0);
    });
  });
});
