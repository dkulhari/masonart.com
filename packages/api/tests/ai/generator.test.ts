import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isProviderAvailable,
  getAvailableProvider,
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
});
