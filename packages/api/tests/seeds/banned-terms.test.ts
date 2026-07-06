// packages/api/tests/seeds/banned-terms.test.ts
import { describe, it, expect } from "vitest";

describe("Banned Terms Seed", () => {
  it("should export DEFAULT_BANNED_TERMS array", async () => {
    const { DEFAULT_BANNED_TERMS } = await import("../../src/database/seeds/banned-terms");
    expect(Array.isArray(DEFAULT_BANNED_TERMS)).toBe(true);
    expect(DEFAULT_BANNED_TERMS.length).toBeGreaterThan(0);
  });

  it("should have required fields for each term", async () => {
    const { DEFAULT_BANNED_TERMS } = await import("../../src/database/seeds/banned-terms");
    for (const term of DEFAULT_BANNED_TERMS) {
      expect(term.pattern).toBeDefined();
      expect(term.category).toBeDefined();
      expect(term.severity).toBeDefined();
      expect(term.reason).toBeDefined();
    }
  });

  it("should cover all major categories", async () => {
    const { DEFAULT_BANNED_TERMS } = await import("../../src/database/seeds/banned-terms");
    const categories = [...new Set(DEFAULT_BANNED_TERMS.map((t) => t.category))];
    expect(categories).toContain("nsfw");
    expect(categories).toContain("violence");
    expect(categories).toContain("hate_speech");
  });
});
