// packages/api/tests/services/ai-moderation.test.ts
import { describe, it, expect } from "vitest";

describe("AI Moderation Service", () => {
  describe("checkPromptSafety", () => {
    it("should export checkPromptSafety function", async () => {
      const { checkPromptSafety } = await import(
        "../../src/services/ai-moderation"
      );
      expect(typeof checkPromptSafety).toBe("function");
    });

    it("should block prompts with banned terms", async () => {
      const { checkPromptSafety } = await import(
        "../../src/services/ai-moderation"
      );
      const result = await checkPromptSafety("A nude woman in a garden");
      expect(result.isSafe).toBe(false);
      expect(result.blockedTerms.length).toBeGreaterThan(0);
    });

    it("should allow safe prompts", async () => {
      const { checkPromptSafety } = await import(
        "../../src/services/ai-moderation"
      );
      const result = await checkPromptSafety(
        "A beautiful sunset over mountains"
      );
      expect(result.isSafe).toBe(true);
      expect(result.blockedTerms.length).toBe(0);
    });
  });

  describe("reviewGeneration", () => {
    it("should export reviewGeneration function", async () => {
      const { reviewGeneration } = await import(
        "../../src/services/ai-moderation"
      );
      expect(typeof reviewGeneration).toBe("function");
    });
  });
});
