import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isProviderAvailable,
  getAvailableProvider,
  generateImages,
  type AIGenerationInput,
} from "../../src/ai/generator";

describe("AI Generator - Gemini Provider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isProviderAvailable", () => {
    it("returns true for gemini when GOOGLE_AI_STUDIO_KEY is set", () => {
      process.env.GOOGLE_AI_STUDIO_KEY = "test-key";
      expect(isProviderAvailable("gemini")).toBe(true);
    });

    it("returns false for gemini when GOOGLE_AI_STUDIO_KEY is not set", () => {
      delete process.env.GOOGLE_AI_STUDIO_KEY;
      expect(isProviderAvailable("gemini")).toBe(false);
    });
  });

  describe("getAvailableProvider", () => {
    it("returns gemini when it is the only configured provider", () => {
      delete process.env.REPLICATE_API_TOKEN;
      delete process.env.OPENAI_API_KEY;
      delete process.env.FAL_API_KEY;
      process.env.GOOGLE_AI_STUDIO_KEY = "test-key";

      expect(getAvailableProvider()).toBe("gemini");
    });
  });

  describe("generateImages with Gemini", () => {
    beforeEach(() => {
      process.env.GOOGLE_AI_STUDIO_KEY = "test-key";
    });

    it("uses gemini provider and does not throw unsupported provider error", async () => {
      const input: AIGenerationInput = {
        prompt: "a sunset over mountains",
        stylePreset: "photography",
        aspectRatio: "landscape",
        provider: "gemini",
      };

      const result = await generateImages(input, 1);

      // Should use gemini provider and handle the request
      expect(result.provider).toBe("gemini");
      expect(result.enhancedPrompt).toContain("sunset");
      // The generation should not fail with "Unsupported provider" error
      // This verifies the gemini case is implemented in the switch statement
      // Note: The actual API call may fail with invalid API key, but that's expected in tests
      if (result.error) {
        expect(result.error).not.toContain("Unsupported provider");
      }
      // Model version should be set (confirms provider config worked)
      expect(result.modelVersion).toBe("gemini-2.0-flash-exp");
    });
  });
});
