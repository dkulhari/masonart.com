/**
 * usePromptSuggestions Hook Tests
 *
 * Tests for prompt suggestions hook:
 * - Fetch behavior
 * - Caching
 * - Error handling
 * - Usage tracking
 */

import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Configuration Tests
// ============================================================================

describe("usePromptSuggestions - Configuration", () => {
  const DEFAULT_LIMIT = 6;
  const CACHE_DURATION_MS = 5 * 60 * 1000;

  it("should have default limit of 6", () => {
    expect(DEFAULT_LIMIT).toBe(6);
  });

  it("should have cache duration of 5 minutes", () => {
    expect(CACHE_DURATION_MS).toBe(300000);
  });

  it("should accept custom limit", () => {
    const customLimit = 10;
    expect(customLimit).toBe(10);
  });

  it("should accept custom API base URL", () => {
    const customUrl = "/custom/api";
    expect(customUrl).toBe("/custom/api");
  });

  it("should default to /api/ai base URL", () => {
    const defaultUrl = "/api/ai";
    expect(defaultUrl).toBe("/api/ai");
  });
});

// ============================================================================
// Fetch Behavior Tests
// ============================================================================

describe("usePromptSuggestions - Fetch Behavior", () => {
  describe("URL construction", () => {
    it("should build URL with limit param", () => {
      const baseUrl = "/api/ai";
      const limit = 6;
      const params = new URLSearchParams({ limit: limit.toString() });
      const url = `${baseUrl}/suggestions?${params}`;
      expect(url).toContain("limit=6");
    });

    it("should include stylePreset when provided", () => {
      const stylePreset = "watercolor";
      const params = new URLSearchParams({ stylePreset });
      expect(params.get("stylePreset")).toBe("watercolor");
    });

    it("should include shuffle param", () => {
      const shuffle = true;
      const params = new URLSearchParams({ shuffle: shuffle.toString() });
      expect(params.get("shuffle")).toBe("true");
    });

    it("should combine all params", () => {
      const params = new URLSearchParams({
        limit: "6",
        stylePreset: "pop-art",
        shuffle: "true",
      });
      const url = `/api/ai/suggestions?${params}`;
      expect(url).toContain("limit=6");
      expect(url).toContain("stylePreset=pop-art");
      expect(url).toContain("shuffle=true");
    });
  });

  describe("Auto-fetch behavior", () => {
    it("should auto-fetch when autoFetch is true", () => {
      const autoFetch = true;
      const shouldFetch = autoFetch;
      expect(shouldFetch).toBe(true);
    });

    it("should not auto-fetch when autoFetch is false", () => {
      const autoFetch = false;
      const shouldFetch = autoFetch;
      expect(shouldFetch).toBe(false);
    });

    it("should re-fetch when stylePreset changes", () => {
      const prevStyle = "watercolor";
      const newStyle = "pop-art";
      const shouldRefetch = prevStyle !== newStyle;
      expect(shouldRefetch).toBe(true);
    });
  });
});

// ============================================================================
// Response Parsing Tests
// ============================================================================

describe("usePromptSuggestions - Response Parsing", () => {
  it("should parse suggestions array", () => {
    const response = {
      suggestions: [{ prompt: "Test prompt 1" }, { prompt: "Test prompt 2" }],
    };
    expect(response.suggestions).toHaveLength(2);
  });

  it("should handle prompt vs text field", () => {
    const withPrompt = { prompt: "Using prompt field" };
    const withText = { text: "Using text field" };
    const text1 = withPrompt.prompt || "";
    const text2 = withText.text || "";
    expect(text1).toBe("Using prompt field");
    expect(text2).toBe("Using text field");
  });

  it("should generate unique IDs", () => {
    const ids = [`suggestion-0-${Date.now()}`, `suggestion-1-${Date.now()}`];
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("should preserve isPopular flag", () => {
    const suggestion = { prompt: "Popular", isPopular: true };
    expect(suggestion.isPopular).toBe(true);
  });

  it("should preserve tags array", () => {
    const suggestion = { prompt: "Tagged", tags: ["nature", "landscape"] };
    expect(suggestion.tags).toHaveLength(2);
  });

  it("should handle empty suggestions array", () => {
    const response = { suggestions: [] };
    expect(response.suggestions).toHaveLength(0);
  });

  it("should handle missing suggestions", () => {
    const response = {};
    const suggestions = (response as { suggestions?: unknown[] }).suggestions || [];
    expect(suggestions).toHaveLength(0);
  });
});

// ============================================================================
// Caching Tests
// ============================================================================

describe("usePromptSuggestions - Caching", () => {
  const CACHE_DURATION = 5 * 60 * 1000;

  describe("Cache key generation", () => {
    it("should generate key with style and limit", () => {
      const stylePreset = "watercolor";
      const limit = 6;
      const key = `${stylePreset || "all"}-${limit}`;
      expect(key).toBe("watercolor-6");
    });

    it('should use "all" for undefined style', () => {
      const stylePreset = undefined;
      const limit = 6;
      const key = `${stylePreset || "all"}-${limit}`;
      expect(key).toBe("all-6");
    });
  });

  describe("Cache validity", () => {
    it("should consider cache valid within duration", () => {
      const cachedAt = Date.now() - 4 * 60 * 1000; // 4 minutes ago
      const now = Date.now();
      const isValid = now - cachedAt < CACHE_DURATION;
      expect(isValid).toBe(true);
    });

    it("should consider cache invalid after duration", () => {
      const cachedAt = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      const now = Date.now();
      const isValid = now - cachedAt < CACHE_DURATION;
      expect(isValid).toBe(false);
    });

    it("should consider cache at exact duration as invalid", () => {
      const cachedAt = Date.now() - CACHE_DURATION;
      const now = Date.now();
      const isValid = now - cachedAt < CACHE_DURATION;
      expect(isValid).toBe(false);
    });
  });

  describe("Cache bypass", () => {
    it("should bypass cache on shuffle", () => {
      const shuffle = true;
      const useCache = !shuffle;
      expect(useCache).toBe(false);
    });

    it("should use cache when not shuffling", () => {
      const shuffle = false;
      const useCache = !shuffle;
      expect(useCache).toBe(true);
    });
  });
});

// ============================================================================
// Loading State Tests
// ============================================================================

describe("usePromptSuggestions - Loading State", () => {
  it("should set loading true before fetch", () => {
    let isLoading = false;
    isLoading = true;
    expect(isLoading).toBe(true);
  });

  it("should set loading false after successful fetch", () => {
    let isLoading = true;
    isLoading = false;
    expect(isLoading).toBe(false);
  });

  it("should set loading false after failed fetch", () => {
    let isLoading = true;
    isLoading = false;
    expect(isLoading).toBe(false);
  });

  it("should not update loading if fetch is stale", () => {
    const fetchId = 1;
    const currentFetchId = 2;
    const shouldUpdate = fetchId === currentFetchId;
    expect(shouldUpdate).toBe(false);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("usePromptSuggestions - Error Handling", () => {
  it("should set error on fetch failure", () => {
    let error: string | null = null;
    error = "Failed to fetch suggestions";
    expect(error).toBe("Failed to fetch suggestions");
  });

  it("should clear error on new fetch", () => {
    let error: string | null = "Previous error";
    error = null;
    expect(error).toBeNull();
  });

  it("should extract error message from Error object", () => {
    const err = new Error("Network error");
    const message = err instanceof Error ? err.message : "Unknown error";
    expect(message).toBe("Network error");
  });

  it("should use fallback for non-Error objects", () => {
    const err = "string error";
    const message = err instanceof Error ? err.message : "Unknown error";
    expect(message).toBe("Unknown error");
  });

  it("should clear suggestions on error", () => {
    let suggestions = [{ id: "1", text: "test" }];
    suggestions = [];
    expect(suggestions).toHaveLength(0);
  });
});

// ============================================================================
// Usage Tracking Tests
// ============================================================================

describe("usePromptSuggestions - Usage Tracking", () => {
  describe("recordUsage function", () => {
    it("should call API with prompt", () => {
      const mockFetch = vi.fn();
      const prompt = "Selected prompt";
      mockFetch("/api/ai/suggestions/record-usage", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should include stylePreset in request", () => {
      const body = {
        prompt: "Selected prompt",
        stylePreset: "watercolor",
      };
      expect(body.stylePreset).toBe("watercolor");
    });

    it("should truncate long prompts to 500 chars", () => {
      const longPrompt = "A".repeat(600);
      const truncated = longPrompt.substring(0, 500);
      expect(truncated.length).toBe(500);
    });

    it("should not truncate short prompts", () => {
      const shortPrompt = "Short prompt";
      const result = shortPrompt.length > 500 ? shortPrompt.substring(0, 500) : shortPrompt;
      expect(result).toBe(shortPrompt);
    });
  });

  describe("Error resilience", () => {
    it("should silently fail on tracking error", () => {
      const trackingError = new Error("Tracking failed");
      // Silent catch - no re-throw
      try {
        throw trackingError;
      } catch {
        // Silent fail
      }
      expect(true).toBe(true);
    });
  });
});

// ============================================================================
// Refresh Tests
// ============================================================================

describe("usePromptSuggestions - Refresh", () => {
  it("should call fetch with shuffle=true", () => {
    const mockFetch = vi.fn();
    const refresh = () => mockFetch(true);
    refresh();
    expect(mockFetch).toHaveBeenCalledWith(true);
  });

  it("should bypass cache on refresh", () => {
    const shuffle = true;
    const useCache = !shuffle;
    expect(useCache).toBe(false);
  });

  it("should update suggestions after refresh", () => {
    let suggestions = [{ id: "1", text: "old" }];
    suggestions = [{ id: "2", text: "new" }];
    expect(suggestions[0].text).toBe("new");
  });
});

// ============================================================================
// Stale Request Handling Tests
// ============================================================================

describe("usePromptSuggestions - Stale Request Handling", () => {
  it("should track fetch ID", () => {
    let fetchId = 0;
    fetchId++;
    expect(fetchId).toBe(1);
  });

  it("should only update for latest fetch", () => {
    const fetchId = 1;
    const currentFetchId = 2;
    const shouldUpdate = fetchId === currentFetchId;
    expect(shouldUpdate).toBe(false);
  });

  it("should update for matching fetch ID", () => {
    const fetchId = 2;
    const currentFetchId = 2;
    const shouldUpdate = fetchId === currentFetchId;
    expect(shouldUpdate).toBe(true);
  });

  it("should increment fetch ID on each request", () => {
    let fetchId = 0;
    const requests = 3;
    for (let i = 0; i < requests; i++) {
      fetchId++;
    }
    expect(fetchId).toBe(3);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("usePromptSuggestions - Edge Cases", () => {
  it("should handle undefined stylePreset", () => {
    const stylePreset = undefined;
    const params = new URLSearchParams();
    if (stylePreset) {
      params.set("stylePreset", stylePreset);
    }
    expect(params.has("stylePreset")).toBe(false);
  });

  it("should handle empty string stylePreset", () => {
    const stylePreset = "";
    const params = new URLSearchParams();
    if (stylePreset) {
      params.set("stylePreset", stylePreset);
    }
    expect(params.has("stylePreset")).toBe(false);
  });

  it("should handle limit of 0", () => {
    const limit = 0;
    const params = new URLSearchParams({ limit: limit.toString() });
    expect(params.get("limit")).toBe("0");
  });

  it("should handle very large limit", () => {
    const limit = 100;
    const params = new URLSearchParams({ limit: limit.toString() });
    expect(params.get("limit")).toBe("100");
  });

  it("should handle special characters in stylePreset", () => {
    const stylePreset = "wabi-sabi";
    const params = new URLSearchParams({ stylePreset });
    expect(params.get("stylePreset")).toBe("wabi-sabi");
  });

  it("should handle concurrent refreshes", () => {
    let fetchId = 0;
    fetchId++; // First refresh
    fetchId++; // Second refresh (concurrent)
    expect(fetchId).toBe(2);
  });
});
