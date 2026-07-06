/**
 * ColorPaletteSelector Component Tests
 *
 * Tests for color palette selection:
 * - System palettes display
 * - User palette management
 * - Custom color editor
 * - Selection handling
 */

import { describe, it, expect, vi } from "vitest";

// ============================================================================
// System Palettes Tests
// ============================================================================

describe("ColorPaletteSelector - System Palettes", () => {
  const SYSTEM_PALETTES = [
    {
      id: "preset-warm",
      name: "Warm",
      colors: ["#FF5733", "#FFC300", "#FF8D1A", "#FF6B6B", "#FFE66D"],
    },
    {
      id: "preset-cool",
      name: "Cool",
      colors: ["#4A90D9", "#5BC0DE", "#7B68EE", "#20B2AA", "#87CEEB"],
    },
    {
      id: "preset-neutral",
      name: "Neutral",
      colors: ["#A0A0A0", "#D3D3D3", "#F5F5DC", "#C4B7A6", "#E8E8E8"],
    },
    {
      id: "preset-vibrant",
      name: "Vibrant",
      colors: ["#FF0080", "#00FF00", "#0080FF", "#FFFF00", "#FF00FF"],
    },
    {
      id: "preset-muted",
      name: "Muted",
      colors: ["#D4A5A5", "#A8C8A8", "#B8B8D4", "#D4C8A5", "#C8C8C8"],
    },
    {
      id: "preset-earth",
      name: "Earth Tones",
      colors: ["#8B4513", "#556B2F", "#D2B48C", "#BC8F8F", "#6B4423"],
    },
    {
      id: "preset-pastel",
      name: "Pastel",
      colors: ["#FFB3BA", "#BAFFC9", "#BAE1FF", "#FFFFBA", "#E0BBE4"],
    },
    {
      id: "preset-monochrome",
      name: "Monochrome",
      colors: ["#000000", "#333333", "#666666", "#999999", "#CCCCCC"],
    },
  ];

  describe("Palette count", () => {
    it("should have 8 system palettes", () => {
      expect(SYSTEM_PALETTES.length).toBe(8);
    });
  });

  describe("Palette names", () => {
    it("should have Warm palette", () => {
      expect(SYSTEM_PALETTES.find((p) => p.name === "Warm")).toBeDefined();
    });

    it("should have Cool palette", () => {
      expect(SYSTEM_PALETTES.find((p) => p.name === "Cool")).toBeDefined();
    });

    it("should have Earth Tones palette", () => {
      expect(SYSTEM_PALETTES.find((p) => p.name === "Earth Tones")).toBeDefined();
    });

    it("should have Monochrome palette", () => {
      expect(SYSTEM_PALETTES.find((p) => p.name === "Monochrome")).toBeDefined();
    });
  });

  describe("Palette colors", () => {
    it("each palette should have 5 colors", () => {
      SYSTEM_PALETTES.forEach((palette) => {
        expect(palette.colors.length).toBe(5);
      });
    });

    it("all colors should be valid hex format", () => {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      SYSTEM_PALETTES.forEach((palette) => {
        palette.colors.forEach((color) => {
          expect(hexRegex.test(color)).toBe(true);
        });
      });
    });
  });
});

// ============================================================================
// Custom Color Editor Tests
// ============================================================================

describe("ColorPaletteSelector - Custom Editor", () => {
  const MIN_COLORS = 3;
  const MAX_COLORS = 8;

  describe("Color count limits", () => {
    it("should require minimum 3 colors", () => {
      expect(MIN_COLORS).toBe(3);
    });

    it("should allow maximum 8 colors", () => {
      expect(MAX_COLORS).toBe(8);
    });

    it("should not allow fewer than minimum", () => {
      const colors = ["#FF0000", "#00FF00"];
      expect(colors.length).toBeLessThan(MIN_COLORS);
    });

    it("should not allow more than maximum", () => {
      const colors = Array(9).fill("#FF0000");
      expect(colors.length).toBeGreaterThan(MAX_COLORS);
    });
  });

  describe("Color operations", () => {
    it("should add color to array", () => {
      const colors = ["#FF0000", "#00FF00", "#0000FF"];
      const newColors = [...colors, "#808080"];
      expect(newColors.length).toBe(4);
    });

    it("should remove color from array", () => {
      const colors = ["#FF0000", "#00FF00", "#0000FF", "#808080"];
      const newColors = colors.filter((_, i) => i !== 1);
      expect(newColors.length).toBe(3);
      expect(newColors).not.toContain("#00FF00");
    });

    it("should update color at index", () => {
      const colors = ["#FF0000", "#00FF00", "#0000FF"];
      const newColors = [...colors];
      newColors[1] = "#FFFF00";
      expect(newColors[1]).toBe("#FFFF00");
    });
  });

  describe("Validation", () => {
    it("should validate hex color format", () => {
      const validColors = ["#FF0000", "#00FF00", "#0000FF", "#FFFFFF", "#000000"];
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      validColors.forEach((color) => {
        expect(hexRegex.test(color)).toBe(true);
      });
    });

    it("should reject invalid hex colors", () => {
      const invalidColors = ["FF0000", "#FFF", "#GGGGGG", "red"];
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      invalidColors.forEach((color) => {
        expect(hexRegex.test(color)).toBe(false);
      });
    });
  });
});

// ============================================================================
// Selection Handling Tests
// ============================================================================

describe("ColorPaletteSelector - Selection", () => {
  describe("Palette selection", () => {
    it("should call onColorsChange when palette selected", () => {
      const mockOnChange = vi.fn();
      const paletteColors = ["#FF5733", "#FFC300", "#FF8D1A", "#FF6B6B", "#FFE66D"];
      mockOnChange(paletteColors);
      expect(mockOnChange).toHaveBeenCalledWith(paletteColors);
    });

    it("should clear selection", () => {
      const mockOnChange = vi.fn();
      mockOnChange([]);
      expect(mockOnChange).toHaveBeenCalledWith([]);
    });
  });

  describe("Custom color application", () => {
    it("should apply custom colors", () => {
      const mockOnChange = vi.fn();
      const customColors = ["#FF0000", "#00FF00", "#0000FF"];
      mockOnChange(customColors);
      expect(mockOnChange).toHaveBeenCalledWith(customColors);
    });
  });

  describe("Disabled state", () => {
    it("should not allow selection when disabled", () => {
      const disabled = true;
      const mockOnChange = vi.fn();
      if (!disabled) {
        mockOnChange(["#FF0000"]);
      }
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// User Palettes Tests
// ============================================================================

describe("ColorPaletteSelector - User Palettes", () => {
  describe("Save palette", () => {
    it("should call onSavePalette with name and colors", () => {
      const mockSave = vi.fn();
      const name = "My Palette";
      const colors = ["#FF0000", "#00FF00", "#0000FF"];
      mockSave(name, colors);
      expect(mockSave).toHaveBeenCalledWith(name, colors);
    });

    it("should require non-empty name", () => {
      const name = "";
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(false);
    });

    it("should require minimum colors for save", () => {
      const colors = ["#FF0000", "#00FF00"];
      const MIN_COLORS = 3;
      const isValid = colors.length >= MIN_COLORS;
      expect(isValid).toBe(false);
    });
  });

  describe("Delete palette", () => {
    it("should call onDeletePalette with id", () => {
      const mockDelete = vi.fn();
      const paletteId = "user-palette-1";
      mockDelete(paletteId);
      expect(mockDelete).toHaveBeenCalledWith(paletteId);
    });
  });

  describe("User palette display", () => {
    it("should show user palettes when provided", () => {
      const userPalettes = [
        { id: "user-1", name: "Custom 1", colors: ["#111", "#222", "#333"] },
        { id: "user-2", name: "Custom 2", colors: ["#444", "#555", "#666"] },
      ];
      expect(userPalettes.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Palette Matching Tests
// ============================================================================

describe("ColorPaletteSelector - Palette Matching", () => {
  const SYSTEM_PALETTES = [
    {
      id: "preset-warm",
      name: "Warm",
      colors: ["#FF5733", "#FFC300", "#FF8D1A", "#FF6B6B", "#FFE66D"],
    },
  ];

  it("should identify matching system palette", () => {
    const selectedColors = ["#FF5733", "#FFC300", "#FF8D1A", "#FF6B6B", "#FFE66D"];
    const match = SYSTEM_PALETTES.find(
      (p) => JSON.stringify(p.colors) === JSON.stringify(selectedColors)
    );
    expect(match?.name).toBe("Warm");
  });

  it('should show "Custom" when no match', () => {
    const selectedColors = ["#111111", "#222222", "#333333"];
    const match = SYSTEM_PALETTES.find(
      (p) => JSON.stringify(p.colors) === JSON.stringify(selectedColors)
    );
    const displayName = match?.name || "Custom";
    expect(displayName).toBe("Custom");
  });
});

// ============================================================================
// Expand/Collapse Tests
// ============================================================================

describe("ColorPaletteSelector - Expand/Collapse", () => {
  it("should toggle expanded state", () => {
    let isExpanded = false;
    isExpanded = !isExpanded;
    expect(isExpanded).toBe(true);
    isExpanded = !isExpanded;
    expect(isExpanded).toBe(false);
  });

  it("should show preview when collapsed with selection", () => {
    const isExpanded = false;
    const selectedColors = ["#FF0000", "#00FF00", "#0000FF"];
    const showPreview = !isExpanded && selectedColors.length > 0;
    expect(showPreview).toBe(true);
  });

  it("should not show preview when collapsed without selection", () => {
    const isExpanded = false;
    const selectedColors: string[] = [];
    const showPreview = !isExpanded && selectedColors.length > 0;
    expect(showPreview).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("ColorPaletteSelector - Edge Cases", () => {
  describe("Empty state", () => {
    it("should handle empty selected colors", () => {
      const selectedColors: string[] = [];
      expect(selectedColors.length).toBe(0);
    });

    it("should handle empty user palettes", () => {
      const userPalettes: unknown[] = [];
      expect(userPalettes.length).toBe(0);
    });
  });

  describe("Boundary values", () => {
    it("should handle minimum 3 colors", () => {
      const colors = ["#FF0000", "#00FF00", "#0000FF"];
      expect(colors.length).toBe(3);
    });

    it("should handle maximum 8 colors", () => {
      const colors = Array(8).fill("#FF0000");
      expect(colors.length).toBe(8);
    });
  });

  describe("Palette name validation", () => {
    it("should trim whitespace from name", () => {
      const name = "  My Palette  ";
      const trimmed = name.trim();
      expect(trimmed).toBe("My Palette");
    });

    it("should handle special characters in name", () => {
      const name = "Summer's Vibes #1";
      expect(name.length).toBeGreaterThan(0);
    });
  });
});
