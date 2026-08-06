/**
 * Gift card codes.
 *
 * A gift card code is a bearer instrument: whoever holds it holds the money.
 * So these tests are about entropy quality, not formatting convenience.
 *
 * The distribution test is the load-bearing one. `randomBytes(n)[i] % 32`
 * happens to be unbiased today only because 256 divides evenly by 32 — change
 * the alphabet length by one character and the low letters become measurably
 * more likely, silently, with no error anywhere. Rejection sampling stays
 * correct for any alphabet, and this test is what notices if someone
 * "simplifies" it back to a modulo.
 */

import { describe, it, expect } from "vitest";
import {
  generateGiftCardCode,
  normalizeGiftCardCode,
  hashGiftCardCode,
  formatGiftCardCode,
  lastFour,
  GIFT_CARD_ALPHABET,
  GIFT_CARD_CODE_LENGTH,
} from "../../src/lib/gift-card-code";

describe("generation", () => {
  it("produces 16 characters from the Crockford alphabet", () => {
    const code = generateGiftCardCode();
    expect(code).toHaveLength(GIFT_CARD_CODE_LENGTH);
    expect(code).toHaveLength(16);
    for (const ch of code) expect(GIFT_CARD_ALPHABET).toContain(ch);
  });

  it("excludes the characters that get misread", () => {
    // I/L/1 and O/0 are misread off a phone screen; dropping U means no
    // generated code spells anything unfortunate.
    for (const ch of ["I", "L", "O", "U"]) {
      expect(GIFT_CARD_ALPHABET).not.toContain(ch);
    }
  });

  it("does not repeat across a large sample", () => {
    const seen = new Set(Array.from({ length: 5000 }, () => generateGiftCardCode()));
    expect(seen.size).toBe(5000);
  });

  it("distributes across the alphabet without modulo bias", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      for (const ch of generateGiftCardCode()) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
    }
    const expected = (4000 * 16) / GIFT_CARD_ALPHABET.length;
    for (const ch of GIFT_CARD_ALPHABET) {
      // A modulo over a 256-value byte would leave the first 24 letters
      // roughly 14% heavier than the rest; 20% tolerance catches that.
      expect(counts.get(ch) ?? 0).toBeGreaterThan(expected * 0.8);
      expect(counts.get(ch) ?? 0).toBeLessThan(expected * 1.2);
    }
  });
});

describe("normalization", () => {
  it("treats grouping and case as cosmetic", () => {
    expect(normalizeGiftCardCode("7qf3-a8k2-m4np-xr59")).toBe("7QF3A8K2M4NPXR59");
    expect(normalizeGiftCardCode("  7QF3 A8K2 M4NP XR59 ")).toBe("7QF3A8K2M4NPXR59");
  });

  it("drops characters outside the alphabet rather than keeping them", () => {
    // A typed I or O is not a real character in this alphabet; keeping it
    // would produce a hash that can never match a card.
    expect(normalizeGiftCardCode("7QF3_A8K2.M4NP/XR59")).toBe("7QF3A8K2M4NPXR59");
  });

  it("hashes the same regardless of how it was typed", () => {
    const a = hashGiftCardCode("7qf3-a8k2-m4np-xr59");
    const b = hashGiftCardCode("7QF3A8K2M4NPXR59");
    expect(a).toBe(b);
  });

  it("produces a different hash for a different code", () => {
    expect(hashGiftCardCode("7QF3A8K2M4NPXR59")).not.toBe(
      hashGiftCardCode("7QF3A8K2M4NPXR58"),
    );
  });

  it("returns a sha256 hex digest, not the code", () => {
    const hash = hashGiftCardCode("7QF3A8K2M4NPXR59");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("7QF3");
  });

  it("mixes in the pepper, so a leaked dump cannot be attacked offline", () => {
    const original = process.env.GIFT_CARD_CODE_PEPPER;
    try {
      process.env.GIFT_CARD_CODE_PEPPER = "pepper-one";
      const a = hashGiftCardCode("7QF3A8K2M4NPXR59");
      process.env.GIFT_CARD_CODE_PEPPER = "pepper-two";
      const b = hashGiftCardCode("7QF3A8K2M4NPXR59");
      expect(a).not.toBe(b);
    } finally {
      if (original === undefined) delete process.env.GIFT_CARD_CODE_PEPPER;
      else process.env.GIFT_CARD_CODE_PEPPER = original;
    }
  });

  it("refuses to hash with an empty pepper in production", () => {
    // Failing loudly beats hashing every card with an empty pepper and only
    // discovering it when the database leaks.
    const originalPepper = process.env.GIFT_CARD_CODE_PEPPER;
    const originalEnv = process.env.NODE_ENV;
    try {
      delete process.env.GIFT_CARD_CODE_PEPPER;
      process.env.NODE_ENV = "production";
      expect(() => hashGiftCardCode("7QF3A8K2M4NPXR59")).toThrow(
        /GIFT_CARD_CODE_PEPPER/,
      );
    } finally {
      if (originalPepper !== undefined) process.env.GIFT_CARD_CODE_PEPPER = originalPepper;
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe("display", () => {
  it("groups in fours for reading aloud", () => {
    expect(formatGiftCardCode("7QF3A8K2M4NPXR59")).toBe("7QF3-A8K2-M4NP-XR59");
  });

  it("regroups a code however it arrived", () => {
    expect(formatGiftCardCode("7qf3 a8k2 m4np xr59")).toBe("7QF3-A8K2-M4NP-XR59");
  });

  it("takes the last four for the masked display", () => {
    expect(lastFour("7QF3-A8K2-M4NP-XR59")).toBe("XR59");
    expect(lastFour("7qf3a8k2m4npxr59")).toBe("XR59");
  });

  it("a generated code round-trips through format and normalize", () => {
    const code = generateGiftCardCode();
    expect(normalizeGiftCardCode(formatGiftCardCode(code))).toBe(code);
    expect(hashGiftCardCode(formatGiftCardCode(code))).toBe(hashGiftCardCode(code));
  });
});
