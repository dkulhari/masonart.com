import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isProviderAvailable,
  getAvailableProvider,
  generateImages,
  type AIGenerationInput,
} from "../../src/ai/generator";

/**
 * `GEMINI_MODELS.flash` is a module-level constant read from GEMINI_IMAGE_MODEL
 * at import time, so it cannot be pinned from inside a test body. Clear the
 * override here — `vi.hoisted` runs before the import above — so the suite
 * asserts the shipped default instead of whatever the developer's shell
 * happens to export (#659).
 */
vi.hoisted(() => {
  delete process.env.GEMINI_IMAGE_MODEL;
});

/** The default in `src/ai/generator.ts` when GEMINI_IMAGE_MODEL is unset. */
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

// Never call the real Gemini endpoint from a unit test: it made the suite
// depend on network reachability and on the key in the ambient environment.
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(_apiKey: string) {}
    getGenerativeModel({ model }: { model: string }) {
      return {
        generateContent: (prompt: string) => generateContentMock(model, prompt),
      };
    }
  },
}));

describe("AI Generator - Gemini Provider", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: Buffer.from("fake-png-bytes").toString("base64"),
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isProviderAvailable", () => {
    it("returns true for gemini when GOOGLE_AI_STUDIO_KEY is set", () => {
      vi.stubEnv("GOOGLE_AI_STUDIO_KEY", "test-key");
      expect(isProviderAvailable("gemini")).toBe(true);
    });

    it("returns false for gemini when GOOGLE_AI_STUDIO_KEY is not set", () => {
      vi.stubEnv("GOOGLE_AI_STUDIO_KEY", undefined);
      expect(isProviderAvailable("gemini")).toBe(false);
    });
  });

  describe("getAvailableProvider", () => {
    it("returns gemini when it is the only configured provider", () => {
      vi.stubEnv("REPLICATE_API_TOKEN", undefined);
      vi.stubEnv("OPENAI_API_KEY", undefined);
      vi.stubEnv("FAL_API_KEY", undefined);
      vi.stubEnv("GOOGLE_AI_STUDIO_KEY", "test-key");

      expect(getAvailableProvider()).toBe("gemini");
    });
  });

  describe("generateImages with Gemini", () => {
    const input: AIGenerationInput = {
      prompt: "a sunset over mountains",
      stylePreset: "photography",
      aspectRatio: "landscape",
      provider: "gemini",
    };

    beforeEach(() => {
      vi.stubEnv("GOOGLE_AI_STUDIO_KEY", "test-key");
    });

    it("uses gemini provider and does not throw unsupported provider error", async () => {
      const result = await generateImages(input, 1);

      // Should use gemini provider and handle the request
      expect(result.provider).toBe("gemini");
      expect(result.enhancedPrompt).toContain("sunset");
      // The generation should not fail with "Unsupported provider" error —
      // this verifies the gemini case is implemented in the switch statement
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(result.images).toHaveLength(1);
      // Model version confirms the gemini provider config was resolved
      expect(result.modelVersion).toBe(DEFAULT_GEMINI_IMAGE_MODEL);
      // ...and that it is the id actually sent to the SDK
      expect(generateContentMock).toHaveBeenCalledWith(
        DEFAULT_GEMINI_IMAGE_MODEL,
        expect.stringContaining("sunset")
      );
    });

    it("uses the GEMINI_IMAGE_MODEL override when one is configured", async () => {
      vi.stubEnv("GEMINI_IMAGE_MODEL", "gemini-override-test-model");
      vi.resetModules();
      const { generateImages: generateWithOverride } = await import(
        "../../src/ai/generator"
      );

      const result = await generateWithOverride(input, 1);

      expect(result.provider).toBe("gemini");
      expect(result.modelVersion).toBe("gemini-override-test-model");
      expect(generateContentMock).toHaveBeenCalledWith(
        "gemini-override-test-model",
        expect.any(String)
      );
    });
  });
});
