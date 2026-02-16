// packages/api/tests/schema/ai-generation-reviews.test.ts
import { describe, it, expect } from "vitest";

describe("AI Generation Reviews Schema", () => {
  it("should export aiGenerationReviews table", async () => {
    const schema = await import(
      "../../src/database/schema/ai-generation-reviews"
    );
    expect(schema.aiGenerationReviews).toBeDefined();
  });

  it("should have required fields", async () => {
    const { aiGenerationReviews } = await import(
      "../../src/database/schema/ai-generation-reviews"
    );
    expect(aiGenerationReviews.id).toBeDefined();
    expect(aiGenerationReviews.generationId).toBeDefined();
    expect(aiGenerationReviews.reviewerId).toBeDefined();
    expect(aiGenerationReviews.action).toBeDefined();
    expect(aiGenerationReviews.reason).toBeDefined();
  });
});
