// packages/api/tests/schema/ai-generations.test.ts
import { describe, it, expect } from "vitest";
import { aiModerationStatusEnum, aiGenerations } from "../../src/database/schema/ai-generations";

describe("AI Moderation Status Enum", () => {
  it("should have all required moderation statuses", () => {
    expect(aiModerationStatusEnum.enumValues).toContain("pending_review");
    expect(aiModerationStatusEnum.enumValues).toContain("approved");
    expect(aiModerationStatusEnum.enumValues).toContain("rejected");
    expect(aiModerationStatusEnum.enumValues).toContain("flagged");
    expect(aiModerationStatusEnum.enumValues).toHaveLength(4);
  });
});

describe("AI Generations Table Moderation Fields", () => {
  it("should have moderationStatus field", () => {
    expect(aiGenerations.moderationStatus).toBeDefined();
  });

  it("should have moderatedAt field", () => {
    expect(aiGenerations.moderatedAt).toBeDefined();
  });

  it("should have moderatedBy field", () => {
    expect(aiGenerations.moderatedBy).toBeDefined();
  });

  it("should have rejectionReason field", () => {
    expect(aiGenerations.rejectionReason).toBeDefined();
  });
});
