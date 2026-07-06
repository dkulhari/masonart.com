/**
 * Tests for Exchange Rate Service
 *
 * This test suite validates the exchange rate service:
 * - getExchangeRate() - Fetches live USD/INR exchange rate
 * - convertUsdCentsToInrPaise() - Converts USD cents to INR paise
 * - Caching behavior
 * - Fallback handling when API fails
 *
 * Note: These tests use the actual service without complex mocking
 * to verify the exported functions work correctly.
 *
 * @see packages/api/src/services/exchange-rate.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import "../setup";

// ============================================================================
// Test Constants
// ============================================================================

const FALLBACK_RATE = 83.0;
const MIN_REASONABLE_RATE = 70.0;
const MAX_REASONABLE_RATE = 100.0;

// ============================================================================
// Tests
// ============================================================================

describe("Exchange Rate Service", () => {
  describe("getExchangeRate", () => {
    it("should return a valid exchange rate", async () => {
      // Import the actual service - it will use fallback if Redis/API unavailable
      const { getExchangeRate } = await import("../../src/services/exchange-rate");
      const rate = await getExchangeRate();

      // Should return a valid number
      expect(typeof rate).toBe("number");
      expect(rate).toBeGreaterThan(0);
    });

    it("should return a rate within reasonable USD/INR range", async () => {
      const { getExchangeRate } = await import("../../src/services/exchange-rate");
      const rate = await getExchangeRate();

      // USD/INR rate should be between 70 and 100 (reasonable historical range)
      expect(rate).toBeGreaterThanOrEqual(MIN_REASONABLE_RATE);
      expect(rate).toBeLessThanOrEqual(MAX_REASONABLE_RATE);
    });

    it("should return consistent results on multiple calls", async () => {
      const { getExchangeRate } = await import("../../src/services/exchange-rate");

      const rate1 = await getExchangeRate();
      const rate2 = await getExchangeRate();

      // Should return the same rate (cached) within same test run
      expect(rate1).toBe(rate2);
    });
  });

  describe("convertUsdCentsToInrPaise", () => {
    it("should convert USD cents to INR paise correctly", async () => {
      const { convertUsdCentsToInrPaise } = await import("../../src/services/exchange-rate");

      // 100 USD cents = $1.00
      const result = await convertUsdCentsToInrPaise(100);

      // Should return valid paise amount
      expect(result.paise).toBeGreaterThan(0);
      expect(result.exchangeRate).toBeGreaterThan(0);

      // $1 at ~83 INR should be around 8300 paise
      expect(result.paise).toBeGreaterThan(7000);
      expect(result.paise).toBeLessThan(10000);
    });

    it("should return exchange rate used in conversion", async () => {
      const { convertUsdCentsToInrPaise } = await import("../../src/services/exchange-rate");
      const result = await convertUsdCentsToInrPaise(100);

      expect(result).toHaveProperty("paise");
      expect(result).toHaveProperty("exchangeRate");
      expect(typeof result.paise).toBe("number");
      expect(typeof result.exchangeRate).toBe("number");
    });

    it("should handle zero cents", async () => {
      const { convertUsdCentsToInrPaise } = await import("../../src/services/exchange-rate");
      const result = await convertUsdCentsToInrPaise(0);

      expect(result.paise).toBe(0);
      expect(result.exchangeRate).toBeGreaterThan(0);
    });

    it("should handle large amounts", async () => {
      const { convertUsdCentsToInrPaise } = await import("../../src/services/exchange-rate");

      // 10000 cents = $100
      const result = await convertUsdCentsToInrPaise(10000);

      // $100 at ~83 INR should be around 830000 paise (₹8300)
      expect(result.paise).toBeGreaterThan(700000);
      expect(result.paise).toBeLessThan(1000000);
    });

    it("should scale linearly with input", async () => {
      const { convertUsdCentsToInrPaise } = await import("../../src/services/exchange-rate");

      const result100 = await convertUsdCentsToInrPaise(100);
      const result200 = await convertUsdCentsToInrPaise(200);

      // 200 cents should be exactly double 100 cents
      expect(result200.paise).toBe(result100.paise * 2);
    });

    it("should maintain consistent exchange rate across calls", async () => {
      const { convertUsdCentsToInrPaise } = await import("../../src/services/exchange-rate");

      const result1 = await convertUsdCentsToInrPaise(100);
      const result2 = await convertUsdCentsToInrPaise(500);

      // Both should use the same exchange rate
      expect(result1.exchangeRate).toBe(result2.exchangeRate);
    });
  });

  describe("Conversion Formula", () => {
    it("should correctly apply the conversion formula", async () => {
      const { convertUsdCentsToInrPaise, getExchangeRate } =
        await import("../../src/services/exchange-rate");

      const rate = await getExchangeRate();
      const result = await convertUsdCentsToInrPaise(100);

      // Formula: paise = (cents / 100) * rate * 100
      // For 100 cents: paise = 1 * rate * 100 = rate * 100
      const expectedPaise = Math.round(rate * 100);

      expect(result.paise).toBe(expectedPaise);
    });
  });
});
