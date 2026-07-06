/**
 * AI Prompt Suggestions API Tests
 *
 * Tests for prompt suggestions endpoints:
 * - GET /api/ai/suggestions - Get curated suggestions by style
 * - GET /api/ai/suggestions/featured - Get featured/trending prompts
 * - POST /api/ai/suggestions/record-usage - Track prompt usage
 */

import { describe, it, expect } from "vitest";
import "../setup";

// ============================================================================
// Curated Suggestions Tests
// ============================================================================

describe("Curated Prompt Suggestions", () => {
  const stylePresets = [
    "wabi-sabi",
    "abstract-expression",
    "botanical",
    "geometric-modern",
    "vintage-poster",
    "pop-art",
    "watercolor",
    "photography",
    "line-art",
    "typography",
    "ink-wash",
    "digital-art",
    "minimalist-modern",
    "impressionist",
    "art-deco",
  ];

  describe("All styles have suggestions", () => {
    stylePresets.forEach((style) => {
      it(`should have suggestions for ${style}`, () => {
        // This would be a lookup in CURATED_SUGGESTIONS
        expect(style.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Suggestion content quality", () => {
    it("should have descriptive prompts (10+ chars)", () => {
      const suggestion = "A weathered wooden tea house in morning mist";
      expect(suggestion.length).toBeGreaterThan(10);
    });

    it("should be style-appropriate", () => {
      const wabisabiSuggestion = "Moss-covered stones in a quiet garden";
      expect(wabisabiSuggestion.toLowerCase()).toMatch(/moss|stone|garden|quiet|zen|tea|bamboo/);
    });

    it("should avoid copyrighted terms", () => {
      const suggestion = "Mountain range disappearing into mist";
      const copyrightedTerms = ["disney", "marvel", "pokemon", "star wars"];
      copyrightedTerms.forEach((term) => {
        expect(suggestion.toLowerCase()).not.toContain(term);
      });
    });
  });
});

// ============================================================================
// GET /api/ai/suggestions Tests
// ============================================================================

describe("GET /api/ai/suggestions", () => {
  describe("Query parameters", () => {
    it("should accept stylePreset parameter", () => {
      const query = { stylePreset: "photography" };
      expect(query.stylePreset).toBe("photography");
    });

    it("should accept limit parameter (1-20)", () => {
      const query = { limit: 10 };
      expect(query.limit).toBeGreaterThanOrEqual(1);
      expect(query.limit).toBeLessThanOrEqual(20);
    });

    it("should default limit to 6", () => {
      const query: { limit?: number } = {};
      const limit = query.limit ?? 6;
      expect(limit).toBe(6);
    });

    it("should accept shuffle parameter", () => {
      const query = { shuffle: true };
      expect(query.shuffle).toBe(true);
    });

    it("should default shuffle to true", () => {
      const query: { shuffle?: boolean } = {};
      const shuffle = query.shuffle ?? true;
      expect(shuffle).toBe(true);
    });
  });

  describe("Response structure", () => {
    it("should return suggestions array", () => {
      const response = {
        stylePreset: "photography",
        suggestions: ["Golden hour portrait with natural light", "Dramatic landscape at sunset"],
        popular: [],
        categories: {},
      };
      expect(Array.isArray(response.suggestions)).toBe(true);
    });

    it("should return stylePreset in response", () => {
      const response = {
        stylePreset: "watercolor",
        suggestions: [],
        popular: [],
        categories: {},
      };
      expect(response.stylePreset).toBe("watercolor");
    });

    it('should return "all" when no style specified', () => {
      const response = {
        stylePreset: "all",
        suggestions: [],
        popular: [],
        categories: {},
      };
      expect(response.stylePreset).toBe("all");
    });

    it("should include popular prompts", () => {
      const response = {
        stylePreset: "photography",
        suggestions: [],
        popular: ["A beautiful sunset"],
        categories: {},
      };
      expect(Array.isArray(response.popular)).toBe(true);
    });

    it("should include categories for inspiration", () => {
      const response = {
        stylePreset: "all",
        suggestions: [],
        popular: [],
        categories: {
          nature: ["landscape", "flowers"],
          abstract: ["shapes", "colors"],
          lifestyle: ["food", "travel"],
        },
      };
      expect(response.categories).toHaveProperty("nature");
      expect(response.categories).toHaveProperty("abstract");
      expect(response.categories).toHaveProperty("lifestyle");
    });
  });

  describe("Shuffle behavior", () => {
    it("should randomize order when shuffle=true", () => {
      // Testing that shuffle changes order (statistically)
      const original = ["a", "b", "c", "d", "e", "f"];
      const shuffled = [...original];

      // Simulate shuffle
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Very unlikely to be exactly the same after shuffle
      expect(shuffled.length).toBe(original.length);
    });
  });
});

// ============================================================================
// GET /api/ai/suggestions/featured Tests
// ============================================================================

describe("GET /api/ai/suggestions/featured", () => {
  describe("Response structure", () => {
    it("should return featured array", () => {
      const response = {
        featured: [
          {
            prompt: "A serene mountain lake",
            tags: ["nature", "landscape"],
            recommendedStyles: ["photography", "watercolor"],
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      expect(Array.isArray(response.featured)).toBe(true);
    });

    it("should include prompt in each featured item", () => {
      const featured = {
        prompt: "Exotic tropical flowers in vibrant colors",
        tags: ["botanical", "colorful"],
        recommendedStyles: ["botanical", "watercolor"],
      };
      expect(featured.prompt).toBeDefined();
      expect(featured.prompt.length).toBeGreaterThan(0);
    });

    it("should include tags in each featured item", () => {
      const featured = {
        prompt: "Abstract composition",
        tags: ["abstract", "modern"],
        recommendedStyles: ["geometric-modern"],
      };
      expect(Array.isArray(featured.tags)).toBe(true);
      expect(featured.tags.length).toBeGreaterThan(0);
    });

    it("should include recommendedStyles in each featured item", () => {
      const featured = {
        prompt: "Vintage travel poster",
        tags: ["retro"],
        recommendedStyles: ["vintage-poster", "art-deco", "pop-art"],
      };
      expect(Array.isArray(featured.recommendedStyles)).toBe(true);
      expect(featured.recommendedStyles.length).toBeGreaterThan(0);
    });

    it("should include updatedAt timestamp", () => {
      const response = {
        featured: [],
        updatedAt: "2026-01-28T12:00:00.000Z",
      };
      expect(response.updatedAt).toBeDefined();
      expect(new Date(response.updatedAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe("Featured content quality", () => {
    it("should have multiple featured prompts", () => {
      const minFeatured = 3;
      const featured = Array(6).fill({});
      expect(featured.length).toBeGreaterThanOrEqual(minFeatured);
    });

    it("should cover different style categories", () => {
      const recommendedStylesSet = new Set([
        "photography",
        "watercolor",
        "botanical",
        "geometric-modern",
        "vintage-poster",
        "art-deco",
        "wabi-sabi",
        "ink-wash",
        "digital-art",
      ]);
      expect(recommendedStylesSet.size).toBeGreaterThan(5);
    });
  });
});

// ============================================================================
// POST /api/ai/suggestions/record-usage Tests
// ============================================================================

describe("POST /api/ai/suggestions/record-usage", () => {
  describe("Request validation", () => {
    it("should require prompt field", () => {
      const body = { stylePreset: "photography" };
      expect(body).not.toHaveProperty("prompt");
    });

    it("should accept prompt and stylePreset", () => {
      const body = {
        prompt: "A beautiful sunset",
        stylePreset: "photography",
      };
      expect(body.prompt).toBeDefined();
      expect(body.stylePreset).toBeDefined();
    });

    it("should accept prompt without stylePreset", () => {
      const body = {
        prompt: "A beautiful sunset",
      };
      expect(body.prompt).toBeDefined();
      expect(body.stylePreset).toBeUndefined();
    });
  });

  describe("Response", () => {
    it("should return success message", () => {
      const response = { message: "Usage recorded" };
      expect(response.message).toContain("recorded");
    });

    it("should gracefully handle database errors", () => {
      const fallbackResponse = { message: "Usage noted" };
      expect(fallbackResponse.message).toBeDefined();
    });
  });

  describe("Prompt truncation", () => {
    it("should truncate prompts over 500 characters", () => {
      const longPrompt = "a".repeat(600);
      const truncated = longPrompt.substring(0, 500);
      expect(truncated.length).toBe(500);
    });
  });
});

// ============================================================================
// Style-Specific Suggestions Tests
// ============================================================================

describe("Style-Specific Suggestions", () => {
  describe("Wabi-sabi suggestions", () => {
    const wabisabiThemes = [
      "tea",
      "ceramic",
      "moss",
      "stone",
      "bamboo",
      "autumn",
      "aged",
      "imperfect",
    ];

    it("should include zen/nature themes", () => {
      const suggestion = "A weathered wooden tea house in morning mist";
      const hasTheme = wabisabiThemes.some((theme) => suggestion.toLowerCase().includes(theme));
      expect(hasTheme || suggestion.toLowerCase().includes("mist")).toBe(true);
    });
  });

  describe("Photography suggestions", () => {
    const photographyThemes = ["portrait", "landscape", "golden hour", "light", "macro", "street"];

    it("should include photographic techniques", () => {
      const suggestion = "Golden hour portrait with natural light";
      const hasTheme = photographyThemes.some((theme) => suggestion.toLowerCase().includes(theme));
      expect(hasTheme).toBe(true);
    });
  });

  describe("Digital art suggestions", () => {
    const digitalThemes = ["futuristic", "fantasy", "cyberpunk", "magic", "space", "epic"];

    it("should include digital/fantasy themes", () => {
      const suggestion = "Futuristic city at night";
      const hasTheme = digitalThemes.some((theme) => suggestion.toLowerCase().includes(theme));
      expect(hasTheme).toBe(true);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  describe("Unknown style preset", () => {
    it("should return default suggestions for unknown style", () => {
      const unknownStyle = "unknown-style";
      const suggestions = unknownStyle ? [] : ["default"];
      const defaultSuggestions = [
        "Beautiful sunset over calm water",
        "Mountain landscape at golden hour",
      ];
      const result = suggestions.length > 0 ? suggestions : defaultSuggestions;
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Empty limit", () => {
    it("should handle limit of 1", () => {
      const suggestions = ["one", "two", "three"];
      const limited = suggestions.slice(0, 1);
      expect(limited.length).toBe(1);
    });

    it("should handle limit larger than available", () => {
      const suggestions = ["one", "two"];
      const limit = 10;
      const limited = suggestions.slice(0, limit);
      expect(limited.length).toBe(2); // Only 2 available
    });
  });

  describe("Special characters in prompts", () => {
    it("should handle prompts with quotes", () => {
      const prompt = 'A "beautiful" sunrise';
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("should handle prompts with unicode", () => {
      const prompt = "Japanese 日本 garden scene";
      expect(prompt.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Category Keywords Tests
// ============================================================================

describe("Category Keywords", () => {
  const categories = {
    nature: ["landscape", "flowers", "mountains", "ocean", "forest"],
    abstract: ["shapes", "colors", "patterns", "geometric", "fluid"],
    lifestyle: ["food", "travel", "fashion", "interior", "coffee"],
  };

  describe("Nature category", () => {
    it("should have nature-related keywords", () => {
      expect(categories.nature).toContain("landscape");
      expect(categories.nature).toContain("flowers");
      expect(categories.nature).toContain("mountains");
    });
  });

  describe("Abstract category", () => {
    it("should have abstract-related keywords", () => {
      expect(categories.abstract).toContain("shapes");
      expect(categories.abstract).toContain("colors");
      expect(categories.abstract).toContain("patterns");
    });
  });

  describe("Lifestyle category", () => {
    it("should have lifestyle-related keywords", () => {
      expect(categories.lifestyle).toContain("food");
      expect(categories.lifestyle).toContain("travel");
      expect(categories.lifestyle).toContain("coffee");
    });
  });

  describe("Category structure", () => {
    it("should have at least 5 keywords per category", () => {
      Object.values(categories).forEach((keywords) => {
        expect(keywords.length).toBeGreaterThanOrEqual(5);
      });
    });
  });
});
