// packages/api/tests/schema/ai-generations.test.ts
import { describe, it, expect } from "vitest";
import { aiModerationStatusEnum } from "../../src/database/schema/ai-generations";

describe("AI Moderation Status Enum", () => {
  it("should have all required moderation statuses", () => {
    expect(aiModerationStatusEnum.enumValues).toContain("pending_review");
    expect(aiModerationStatusEnum.enumValues).toContain("approved");
    expect(aiModerationStatusEnum.enumValues).toContain("rejected");
    expect(aiModerationStatusEnum.enumValues).toContain("flagged");
    expect(aiModerationStatusEnum.enumValues).toHaveLength(4);
  });
});
