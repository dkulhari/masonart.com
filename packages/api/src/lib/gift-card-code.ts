/**
 * Gift card codes.
 *
 * A code is a bearer instrument (design G2): whoever holds it holds the
 * money. Only its hash and last four are ever stored (G5), so the plaintext
 * exists exactly once — in the delivery email — and cannot be recovered.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §4 "The code"
 */

import { randomBytes, createHash } from "node:crypto";

/**
 * Crockford base32 without I, L, O and U.
 *
 * I/L/1 and O/0 are misread off a phone screen, and dropping U means no
 * generated code spells anything unfortunate.
 */
export const GIFT_CARD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const GIFT_CARD_CODE_LENGTH = 16;

/**
 * ~2^80 of entropy from the OS CSPRNG. Never Math.random: it is seeded
 * predictably and is not a security primitive, and a predictable gift card
 * code is free money.
 *
 * Rejection sampling, not modulo. `byte % 32` over 0..255 is uniform only
 * because 256 divides evenly by 32 — that happens to hold here, but the
 * alphabet length is a constant someone will edit one day, and a biased
 * generator fails silently. Rejecting out-of-range bytes stays correct for
 * any alphabet.
 */
export function generateGiftCardCode(): string {
  const limit =
    Math.floor(256 / GIFT_CARD_ALPHABET.length) * GIFT_CARD_ALPHABET.length;
  let out = "";
  while (out.length < GIFT_CARD_CODE_LENGTH) {
    for (const byte of randomBytes(GIFT_CARD_CODE_LENGTH)) {
      if (byte >= limit) continue; // discard, or the low letters get favoured
      out += GIFT_CARD_ALPHABET[byte % GIFT_CARD_ALPHABET.length];
      if (out.length === GIFT_CARD_CODE_LENGTH) break;
    }
  }
  return out;
}

/**
 * Grouping and case are cosmetic; strip everything outside the alphabet, so
 * `7qf3-a8k2…` and `7QF3A8K2…` resolve to the same card.
 */
export function normalizeGiftCardCode(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((ch) => GIFT_CARD_ALPHABET.includes(ch))
    .join("");
}

function pepper(): string {
  const value = process.env.GIFT_CARD_CODE_PEPPER;
  if (!value) {
    // Failing loudly beats hashing every card with an empty pepper and only
    // discovering it when the database leaks.
    if (process.env.NODE_ENV === "production") {
      throw new Error("GIFT_CARD_CODE_PEPPER is required in production");
    }
    return "development-pepper";
  }
  return value;
}

/**
 * Lookup key for a card. The plaintext code is never stored, so this is the
 * only way to find one. The pepper lives outside the database, so a dump
 * cannot be attacked offline with a table of precomputed codes.
 */
export function hashGiftCardCode(input: string): string {
  return createHash("sha256")
    .update(`${normalizeGiftCardCode(input)}:${pepper()}`)
    .digest("hex");
}

/** The only part of a code that may be displayed after issuance. */
export function lastFour(code: string): string {
  return normalizeGiftCardCode(code).slice(-4);
}

/** Display only — grouped so it can be read aloud over the phone. */
export function formatGiftCardCode(code: string): string {
  return (normalizeGiftCardCode(code).match(/.{1,4}/g) ?? []).join("-");
}
