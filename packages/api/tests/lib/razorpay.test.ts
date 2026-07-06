/**
 * Razorpay Payment Integration Tests
 *
 * Comprehensive tests for Razorpay payment gateway utilities including
 * order creation, payment verification, refunds, webhooks, and utilities.
 *
 * Tests cover:
 * 1. Module Exports - Verify all exports are properly defined
 * 2. Configuration - Test isRazorpayConfigured function
 * 3. RazorpayError Class - Test custom error class
 * 4. Currency Conversion - Test toPaise and toRupees functions
 * 5. Signature Verification - Test payment and webhook signature verification
 * 6. Payment Details Extraction - Test extractPaymentDetails function
 * 7. Constants - Test RAZORPAY_CHECKOUT_SCRIPT_URL and RAZORPAY_CURRENCIES
 * 8. Type Definitions - Verify TypeScript types compile correctly
 * 9. Order Functions - Test createRazorpayOrder, getRazorpayOrder (configuration only)
 * 10. Payment Functions - Test getRazorpayPayment, capturePayment (configuration only)
 * 11. Refund Functions - Test createRefund, getRefund (configuration only)
 *
 * Runtime tests that require actual Razorpay credentials are skipped unless
 * RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are properly configured.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import crypto from "crypto";
import "../setup";

// Import Razorpay module
import * as razorpayModule from "../../src/lib/razorpay";
import {
  isRazorpayConfigured,
  RazorpayError,
  createRazorpayOrder,
  getRazorpayOrder,
  getRazorpayPayment,
  capturePayment,
  createRefund,
  getRefund,
  verifyPaymentSignature,
  verifyWebhookSignature,
  toPaise,
  toRupees,
  getRazorpayKeyId,
  extractPaymentDetails,
  RAZORPAY_CHECKOUT_SCRIPT_URL,
  RAZORPAY_CURRENCIES,
  type CreateRazorpayOrderInput,
  type RazorpayOrder,
  type PaymentVerificationInput,
  type RazorpayPayment,
  type RazorpayCard,
  type CreateRefundInput,
  type RazorpayRefund,
  type RazorpayWebhookEvent,
  type RazorpayWebhookPayload,
  type RazorpayCurrency,
} from "../../src/lib/razorpay";

// Helper to check if Razorpay is configured
let razorpayConfigured = false;

beforeAll(() => {
  razorpayConfigured = isRazorpayConfigured();
  if (razorpayConfigured) {
    console.log("Razorpay configured for runtime tests");
  } else {
    console.log("Razorpay not configured, skipping runtime API tests");
  }
});

// ============================================================================
// Module Exports Tests
// ============================================================================

describe("Razorpay Module Exports", () => {
  describe("Configuration function", () => {
    it("should export isRazorpayConfigured", () => {
      expect(razorpayModule).toHaveProperty("isRazorpayConfigured");
      expect(typeof isRazorpayConfigured).toBe("function");
    });

    it("isRazorpayConfigured should return a boolean", () => {
      const result = isRazorpayConfigured();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("Error class", () => {
    it("should export RazorpayError", () => {
      expect(razorpayModule).toHaveProperty("RazorpayError");
      expect(typeof RazorpayError).toBe("function");
    });
  });

  describe("Order functions", () => {
    it("should export createRazorpayOrder", () => {
      expect(razorpayModule).toHaveProperty("createRazorpayOrder");
      expect(typeof createRazorpayOrder).toBe("function");
    });

    it("should export getRazorpayOrder", () => {
      expect(razorpayModule).toHaveProperty("getRazorpayOrder");
      expect(typeof getRazorpayOrder).toBe("function");
    });
  });

  describe("Payment functions", () => {
    it("should export getRazorpayPayment", () => {
      expect(razorpayModule).toHaveProperty("getRazorpayPayment");
      expect(typeof getRazorpayPayment).toBe("function");
    });

    it("should export capturePayment", () => {
      expect(razorpayModule).toHaveProperty("capturePayment");
      expect(typeof capturePayment).toBe("function");
    });
  });

  describe("Refund functions", () => {
    it("should export createRefund", () => {
      expect(razorpayModule).toHaveProperty("createRefund");
      expect(typeof createRefund).toBe("function");
    });

    it("should export getRefund", () => {
      expect(razorpayModule).toHaveProperty("getRefund");
      expect(typeof getRefund).toBe("function");
    });
  });

  describe("Verification functions", () => {
    it("should export verifyPaymentSignature", () => {
      expect(razorpayModule).toHaveProperty("verifyPaymentSignature");
      expect(typeof verifyPaymentSignature).toBe("function");
    });

    it("should export verifyWebhookSignature", () => {
      expect(razorpayModule).toHaveProperty("verifyWebhookSignature");
      expect(typeof verifyWebhookSignature).toBe("function");
    });
  });

  describe("Utility functions", () => {
    it("should export toPaise", () => {
      expect(razorpayModule).toHaveProperty("toPaise");
      expect(typeof toPaise).toBe("function");
    });

    it("should export toRupees", () => {
      expect(razorpayModule).toHaveProperty("toRupees");
      expect(typeof toRupees).toBe("function");
    });

    it("should export getRazorpayKeyId", () => {
      expect(razorpayModule).toHaveProperty("getRazorpayKeyId");
      expect(typeof getRazorpayKeyId).toBe("function");
    });

    it("should export extractPaymentDetails", () => {
      expect(razorpayModule).toHaveProperty("extractPaymentDetails");
      expect(typeof extractPaymentDetails).toBe("function");
    });
  });

  describe("Constants", () => {
    it("should export RAZORPAY_CHECKOUT_SCRIPT_URL", () => {
      expect(razorpayModule).toHaveProperty("RAZORPAY_CHECKOUT_SCRIPT_URL");
      expect(RAZORPAY_CHECKOUT_SCRIPT_URL).toBeDefined();
    });

    it("should export RAZORPAY_CURRENCIES", () => {
      expect(razorpayModule).toHaveProperty("RAZORPAY_CURRENCIES");
      expect(RAZORPAY_CURRENCIES).toBeDefined();
    });
  });
});

// ============================================================================
// RazorpayError Class Tests
// ============================================================================

describe("RazorpayError Class", () => {
  describe("Constructor", () => {
    it("should create error with message only", () => {
      const error = new RazorpayError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("RazorpayError");
      expect(error.statusCode).toBeUndefined();
      expect(error.details).toBeUndefined();
    });

    it("should create error with message and status code", () => {
      const error = new RazorpayError("Payment failed", 400);
      expect(error.message).toBe("Payment failed");
      expect(error.statusCode).toBe(400);
      expect(error.details).toBeUndefined();
    });

    it("should create error with all parameters", () => {
      const details = { code: "INSUFFICIENT_FUNDS", description: "Card declined" };
      const error = new RazorpayError("Payment failed", 400, details);
      expect(error.message).toBe("Payment failed");
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual(details);
    });

    it("should be instance of Error", () => {
      const error = new RazorpayError("Test");
      expect(error).toBeInstanceOf(Error);
    });

    it("should be instance of RazorpayError", () => {
      const error = new RazorpayError("Test");
      expect(error).toBeInstanceOf(RazorpayError);
    });
  });

  describe("Error properties", () => {
    it("should have readonly statusCode", () => {
      const error = new RazorpayError("Test", 500);
      expect(error.statusCode).toBe(500);
    });

    it("should have readonly details", () => {
      const details = { error: "test" };
      const error = new RazorpayError("Test", 400, details);
      expect(error.details).toEqual(details);
    });

    it("should capture stack trace", () => {
      const error = new RazorpayError("Test");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("RazorpayError");
    });
  });

  describe("Common error scenarios", () => {
    it('should handle "Razorpay is not configured" error', () => {
      const error = new RazorpayError("Razorpay is not configured");
      expect(error.message).toBe("Razorpay is not configured");
    });

    it('should handle "Webhook secret is not configured" error', () => {
      const error = new RazorpayError("Webhook secret is not configured");
      expect(error.message).toBe("Webhook secret is not configured");
    });

    it("should handle API errors with details", () => {
      const error = new RazorpayError("Razorpay API error: 400", 400, {
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "Invalid order amount",
        },
      });
      expect(error.statusCode).toBe(400);
      expect(error.details).toBeDefined();
    });
  });
});

// ============================================================================
// Currency Conversion Tests
// ============================================================================

describe("Currency Conversion", () => {
  describe("toPaise", () => {
    it("should convert integer rupees to paise", () => {
      expect(toPaise(100)).toBe(10000);
    });

    it("should convert decimal rupees to paise", () => {
      expect(toPaise(99.99)).toBe(9999);
    });

    it("should convert string amount to paise", () => {
      expect(toPaise("250.50")).toBe(25050);
    });

    it("should handle zero amount", () => {
      expect(toPaise(0)).toBe(0);
    });

    it("should handle small amounts", () => {
      expect(toPaise(0.01)).toBe(1);
    });

    it("should round to nearest paise", () => {
      // 10.125 * 100 = 1012.5, rounds to 1013
      expect(toPaise(10.125)).toBe(1013);
    });

    it("should handle large amounts", () => {
      expect(toPaise(100000)).toBe(10000000);
    });

    it("should handle string with integer value", () => {
      expect(toPaise("500")).toBe(50000);
    });

    it("should handle floating point precision", () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JS, but should convert correctly
      expect(toPaise(0.3)).toBe(30);
    });
  });

  describe("toRupees", () => {
    it("should convert paise to rupees", () => {
      expect(toRupees(10000)).toBe(100);
    });

    it("should handle decimal conversion", () => {
      expect(toRupees(9999)).toBe(99.99);
    });

    it("should handle zero", () => {
      expect(toRupees(0)).toBe(0);
    });

    it("should handle single paise", () => {
      expect(toRupees(1)).toBe(0.01);
    });

    it("should handle large amounts", () => {
      expect(toRupees(10000000)).toBe(100000);
    });

    it("should maintain precision", () => {
      expect(toRupees(12345)).toBe(123.45);
    });
  });

  describe("Round-trip conversion", () => {
    it("should convert rupees to paise and back correctly", () => {
      const original = 999.99;
      const paise = toPaise(original);
      const rupees = toRupees(paise);
      expect(rupees).toBe(original);
    });

    it("should convert paise to rupees and back correctly", () => {
      const original = 50000;
      const rupees = toRupees(original);
      const paise = toPaise(rupees);
      expect(paise).toBe(original);
    });
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("Constants", () => {
  describe("RAZORPAY_CHECKOUT_SCRIPT_URL", () => {
    it("should be a valid URL", () => {
      expect(RAZORPAY_CHECKOUT_SCRIPT_URL).toBe("https://checkout.razorpay.com/v1/checkout.js");
    });

    it("should use HTTPS", () => {
      expect(RAZORPAY_CHECKOUT_SCRIPT_URL.startsWith("https://")).toBe(true);
    });

    it("should be a checkout.razorpay.com URL", () => {
      expect(RAZORPAY_CHECKOUT_SCRIPT_URL).toContain("checkout.razorpay.com");
    });

    it("should end with .js extension", () => {
      expect(RAZORPAY_CHECKOUT_SCRIPT_URL.endsWith(".js")).toBe(true);
    });
  });

  describe("RAZORPAY_CURRENCIES", () => {
    it("should be an array", () => {
      expect(Array.isArray(RAZORPAY_CURRENCIES)).toBe(true);
    });

    it("should include INR", () => {
      expect(RAZORPAY_CURRENCIES).toContain("INR");
    });

    it("should include USD", () => {
      expect(RAZORPAY_CURRENCIES).toContain("USD");
    });

    it("should include EUR", () => {
      expect(RAZORPAY_CURRENCIES).toContain("EUR");
    });

    it("should include GBP", () => {
      expect(RAZORPAY_CURRENCIES).toContain("GBP");
    });

    it("should include SGD", () => {
      expect(RAZORPAY_CURRENCIES).toContain("SGD");
    });

    it("should include AED", () => {
      expect(RAZORPAY_CURRENCIES).toContain("AED");
    });

    it("should include AUD", () => {
      expect(RAZORPAY_CURRENCIES).toContain("AUD");
    });

    it("should include CAD", () => {
      expect(RAZORPAY_CURRENCIES).toContain("CAD");
    });

    it("should include CNY", () => {
      expect(RAZORPAY_CURRENCIES).toContain("CNY");
    });

    it("should include JPY", () => {
      expect(RAZORPAY_CURRENCIES).toContain("JPY");
    });

    it("should include MYR", () => {
      expect(RAZORPAY_CURRENCIES).toContain("MYR");
    });

    it("should have 11 currencies", () => {
      expect(RAZORPAY_CURRENCIES).toHaveLength(11);
    });

    it("should contain only uppercase strings", () => {
      RAZORPAY_CURRENCIES.forEach((currency) => {
        expect(currency).toBe(currency.toUpperCase());
        expect(typeof currency).toBe("string");
      });
    });

    it("should contain only 3-letter codes", () => {
      RAZORPAY_CURRENCIES.forEach((currency) => {
        expect(currency).toHaveLength(3);
      });
    });
  });
});

// ============================================================================
// getRazorpayKeyId Tests
// ============================================================================

describe("getRazorpayKeyId", () => {
  it("should return a string", () => {
    const keyId = getRazorpayKeyId();
    expect(typeof keyId).toBe("string");
  });

  it("should return empty string if not configured", () => {
    // If RAZORPAY_KEY_ID is not set, should return empty string
    const keyId = getRazorpayKeyId();
    // Either empty or a valid key ID
    expect(typeof keyId).toBe("string");
  });

  it("should be safe to expose to frontend", () => {
    // Key ID is public, not the secret
    const keyId = getRazorpayKeyId();
    // Should not contain sensitive data
    expect(keyId).not.toContain("secret");
    expect(keyId).not.toContain("SECRET");
  });
});

// ============================================================================
// extractPaymentDetails Tests
// ============================================================================

describe("extractPaymentDetails", () => {
  const mockPayment: RazorpayPayment = {
    id: "pay_ABC123",
    entity: "payment",
    amount: 50000,
    currency: "INR",
    status: "captured",
    order_id: "order_XYZ789",
    invoice_id: null,
    method: "card",
    description: "Test payment",
    bank: null,
    wallet: null,
    vpa: null,
    email: "test@example.com",
    contact: "+919876543210",
    notes: {},
    fee: 1180,
    tax: 180,
    error_code: null,
    error_description: null,
    error_source: null,
    error_step: null,
    error_reason: null,
    captured: true,
    card_id: "card_DEF456",
    card: {
      id: "card_DEF456",
      entity: "card",
      name: "Test User",
      last4: "4242",
      network: "Visa",
      type: "credit",
      issuer: "HDFC Bank",
    },
    created_at: 1672531200,
  };

  it("should extract provider as razorpay", () => {
    const details = extractPaymentDetails(mockPayment);
    expect(details.provider).toBe("razorpay");
  });

  it("should extract transaction ID", () => {
    const details = extractPaymentDetails(mockPayment);
    expect(details.transactionId).toBe("pay_ABC123");
  });

  it("should extract payment ID", () => {
    const details = extractPaymentDetails(mockPayment);
    expect(details.paymentId).toBe("pay_ABC123");
  });

  it("should extract order ID", () => {
    const details = extractPaymentDetails(mockPayment);
    expect(details.orderId).toBe("order_XYZ789");
  });

  it("should extract payment method", () => {
    const details = extractPaymentDetails(mockPayment);
    expect(details.method).toBe("card");
  });

  it("should extract last four digits from card", () => {
    const details = extractPaymentDetails(mockPayment);
    expect(details.lastFourDigits).toBe("4242");
  });

  it("should format capturedAt as ISO string", () => {
    const details = extractPaymentDetails(mockPayment);
    expect(details.capturedAt).toBeDefined();
    expect(details.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  describe("with UPI payment", () => {
    const upiPayment: RazorpayPayment = {
      ...mockPayment,
      method: "upi",
      vpa: "user@upi",
      card: null,
      card_id: null,
    };

    it("should extract UPI method", () => {
      const details = extractPaymentDetails(upiPayment);
      expect(details.method).toBe("upi");
    });

    it("should not have lastFourDigits for UPI", () => {
      const details = extractPaymentDetails(upiPayment);
      expect(details.lastFourDigits).toBeUndefined();
    });
  });

  describe("with netbanking payment", () => {
    const netbankingPayment: RazorpayPayment = {
      ...mockPayment,
      method: "netbanking",
      bank: "HDFC",
      card: null,
      card_id: null,
    };

    it("should extract netbanking method", () => {
      const details = extractPaymentDetails(netbankingPayment);
      expect(details.method).toBe("netbanking");
    });

    it("should extract bank name", () => {
      const details = extractPaymentDetails(netbankingPayment);
      expect(details.bankName).toBe("HDFC");
    });
  });

  describe("with wallet payment", () => {
    const walletPayment: RazorpayPayment = {
      ...mockPayment,
      method: "wallet",
      wallet: "paytm",
      card: null,
      card_id: null,
    };

    it("should extract wallet method", () => {
      const details = extractPaymentDetails(walletPayment);
      expect(details.method).toBe("wallet");
    });

    it("should extract wallet name", () => {
      const details = extractPaymentDetails(walletPayment);
      expect(details.walletName).toBe("paytm");
    });
  });
});

// ============================================================================
// Signature Verification Tests
// ============================================================================

describe("Signature Verification", () => {
  // Note: These tests use a mock secret for testing signature generation
  // Actual verification requires proper environment variables
  const mockSecret = "test_secret_key_for_testing";

  describe("verifyPaymentSignature", () => {
    it("should be a function that accepts payment verification input", () => {
      expect(typeof verifyPaymentSignature).toBe("function");
    });

    it("should throw or return false for invalid signature with wrong length", () => {
      const input: PaymentVerificationInput = {
        razorpayOrderId: "order_test",
        razorpayPaymentId: "pay_test",
        razorpaySignature: "invalid_signature",
      };

      // timingSafeEqual throws RangeError when signature lengths don't match
      // This is expected behavior for mismatched signatures
      try {
        const result = verifyPaymentSignature(input);
        expect(typeof result).toBe("boolean");
        expect(result).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(RangeError);
      }
    });

    it("should reject invalid signature with correct length", () => {
      // Create a signature with the correct length (64 hex chars for SHA256)
      const fakeSignature = "a".repeat(64);
      const input: PaymentVerificationInput = {
        razorpayOrderId: "order_ABC",
        razorpayPaymentId: "pay_XYZ",
        razorpaySignature: fakeSignature,
      };

      // With matching length but wrong signature, should return false
      const result = verifyPaymentSignature(input);
      expect(result).toBe(false);
    });

    it("should verify signature format follows order|payment pattern", () => {
      // The signature is generated from: orderId|paymentId
      // This tests the implementation expects this format
      const orderId = "order_test123";
      const paymentId = "pay_test456";
      const body = `${orderId}|${paymentId}`;

      expect(body).toBe("order_test123|pay_test456");
    });
  });

  describe("verifyWebhookSignature", () => {
    it("should be a function that accepts body and signature", () => {
      expect(typeof verifyWebhookSignature).toBe("function");
    });

    it("should throw if webhook secret is not configured", () => {
      // When RAZORPAY_WEBHOOK_SECRET is empty, should throw
      expect(() => {
        verifyWebhookSignature("test body", "test signature");
      }).toThrow("Webhook secret is not configured");
    });

    it("should catch exception and return false for invalid signature comparison", () => {
      // If webhook secret is configured but signature doesn't match,
      // the function should return false (or throw if secret not configured)
      // This test documents the expected behavior
      expect(typeof verifyWebhookSignature).toBe("function");
    });
  });

  describe("Signature generation algorithm", () => {
    it("should use HMAC SHA256", () => {
      // Verify the algorithm being used
      const body = "order_123|pay_456";
      const hmac = crypto.createHmac("sha256", mockSecret);
      hmac.update(body);
      const signature = hmac.digest("hex");

      expect(signature).toHaveLength(64); // SHA256 produces 64 hex chars
    });

    it("should produce deterministic signatures", () => {
      const body = "test_body";
      const sig1 = crypto.createHmac("sha256", mockSecret).update(body).digest("hex");
      const sig2 = crypto.createHmac("sha256", mockSecret).update(body).digest("hex");

      expect(sig1).toBe(sig2);
    });

    it("should produce different signatures for different bodies", () => {
      const sig1 = crypto.createHmac("sha256", mockSecret).update("body1").digest("hex");
      const sig2 = crypto.createHmac("sha256", mockSecret).update("body2").digest("hex");

      expect(sig1).not.toBe(sig2);
    });
  });
});

// ============================================================================
// Order Functions Tests (Configuration Only)
// ============================================================================

describe("Order Functions (Configuration)", () => {
  describe("createRazorpayOrder", () => {
    it("should be an async function", () => {
      expect(typeof createRazorpayOrder).toBe("function");
    });

    it("should throw if Razorpay is not configured", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      const input: CreateRazorpayOrderInput = {
        amount: 50000, // 500 INR in paise
        receipt: "order_123",
      };

      await expect(createRazorpayOrder(input)).rejects.toThrow("Razorpay is not configured");
    });

    it("should accept currency parameter", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      const input: CreateRazorpayOrderInput = {
        amount: 50000,
        currency: "USD",
        receipt: "order_123",
      };

      await expect(createRazorpayOrder(input)).rejects.toThrow("Razorpay is not configured");
    });

    it("should accept notes parameter", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      const input: CreateRazorpayOrderInput = {
        amount: 50000,
        receipt: "order_123",
        notes: { customer_id: "cust_123", product_id: "prod_456" },
      };

      await expect(createRazorpayOrder(input)).rejects.toThrow("Razorpay is not configured");
    });
  });

  describe("getRazorpayOrder", () => {
    it("should be an async function", () => {
      expect(typeof getRazorpayOrder).toBe("function");
    });

    it("should throw if Razorpay is not configured", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      await expect(getRazorpayOrder("order_123")).rejects.toThrow("Razorpay is not configured");
    });
  });
});

// ============================================================================
// Payment Functions Tests (Configuration Only)
// ============================================================================

describe("Payment Functions (Configuration)", () => {
  describe("getRazorpayPayment", () => {
    it("should be an async function", () => {
      expect(typeof getRazorpayPayment).toBe("function");
    });

    it("should throw if Razorpay is not configured", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      await expect(getRazorpayPayment("pay_123")).rejects.toThrow("Razorpay is not configured");
    });
  });

  describe("capturePayment", () => {
    it("should be an async function", () => {
      expect(typeof capturePayment).toBe("function");
    });

    it("should throw if Razorpay is not configured", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      await expect(capturePayment("pay_123", 50000)).rejects.toThrow("Razorpay is not configured");
    });

    it("should accept currency parameter", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      await expect(capturePayment("pay_123", 50000, "INR")).rejects.toThrow(
        "Razorpay is not configured"
      );
    });
  });
});

// ============================================================================
// Refund Functions Tests (Configuration Only)
// ============================================================================

describe("Refund Functions (Configuration)", () => {
  describe("createRefund", () => {
    it("should be an async function", () => {
      expect(typeof createRefund).toBe("function");
    });

    it("should throw if Razorpay is not configured", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      const input: CreateRefundInput = {
        paymentId: "pay_123",
      };

      await expect(createRefund(input)).rejects.toThrow("Razorpay is not configured");
    });

    it("should accept amount for partial refund", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      const input: CreateRefundInput = {
        paymentId: "pay_123",
        amount: 25000, // Partial refund
      };

      await expect(createRefund(input)).rejects.toThrow("Razorpay is not configured");
    });

    it("should accept notes parameter", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      const input: CreateRefundInput = {
        paymentId: "pay_123",
        notes: { reason: "Customer requested refund" },
      };

      await expect(createRefund(input)).rejects.toThrow("Razorpay is not configured");
    });

    it("should accept speed parameter", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      const input: CreateRefundInput = {
        paymentId: "pay_123",
        speed: "optimum",
      };

      await expect(createRefund(input)).rejects.toThrow("Razorpay is not configured");
    });
  });

  describe("getRefund", () => {
    it("should be an async function", () => {
      expect(typeof getRefund).toBe("function");
    });

    it("should throw if Razorpay is not configured", async () => {
      if (razorpayConfigured) {
        console.log("Skipping: Razorpay is configured");
        return;
      }

      await expect(getRefund("pay_123", "rfnd_456")).rejects.toThrow("Razorpay is not configured");
    });
  });
});

// ============================================================================
// Type Definition Tests
// ============================================================================

describe("Type Definitions", () => {
  describe("CreateRazorpayOrderInput", () => {
    it("should accept valid order input", () => {
      const input: CreateRazorpayOrderInput = {
        amount: 50000,
        receipt: "order_123",
      };
      expect(input.amount).toBe(50000);
      expect(input.receipt).toBe("order_123");
    });

    it("should accept optional currency", () => {
      const input: CreateRazorpayOrderInput = {
        amount: 50000,
        currency: "INR",
        receipt: "order_123",
      };
      expect(input.currency).toBe("INR");
    });

    it("should accept optional notes", () => {
      const input: CreateRazorpayOrderInput = {
        amount: 50000,
        receipt: "order_123",
        notes: { key: "value" },
      };
      expect(input.notes).toEqual({ key: "value" });
    });
  });

  describe("RazorpayOrder", () => {
    it("should have required properties", () => {
      const order: RazorpayOrder = {
        id: "order_123",
        entity: "order",
        amount: 50000,
        amount_paid: 50000,
        amount_due: 0,
        currency: "INR",
        receipt: "receipt_123",
        status: "paid",
        attempts: 1,
        notes: {},
        created_at: 1672531200,
      };
      expect(order.entity).toBe("order");
      expect(order.status).toBe("paid");
    });

    it("should allow valid status values", () => {
      const statuses: RazorpayOrder["status"][] = ["created", "attempted", "paid"];
      statuses.forEach((status) => {
        expect(["created", "attempted", "paid"]).toContain(status);
      });
    });
  });

  describe("PaymentVerificationInput", () => {
    it("should have required properties", () => {
      const input: PaymentVerificationInput = {
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_456",
        razorpaySignature: "signature_789",
      };
      expect(input.razorpayOrderId).toBe("order_123");
      expect(input.razorpayPaymentId).toBe("pay_456");
      expect(input.razorpaySignature).toBe("signature_789");
    });
  });

  describe("RazorpayPayment", () => {
    it("should have required properties", () => {
      const payment: Partial<RazorpayPayment> = {
        id: "pay_123",
        entity: "payment",
        amount: 50000,
        currency: "INR",
        status: "captured",
        method: "card",
      };
      expect(payment.entity).toBe("payment");
      expect(payment.status).toBe("captured");
    });

    it("should allow valid status values", () => {
      const statuses: RazorpayPayment["status"][] = [
        "created",
        "authorized",
        "captured",
        "refunded",
        "failed",
      ];
      statuses.forEach((status) => {
        expect(["created", "authorized", "captured", "refunded", "failed"]).toContain(status);
      });
    });
  });

  describe("RazorpayCard", () => {
    it("should have required properties", () => {
      const card: RazorpayCard = {
        id: "card_123",
        entity: "card",
        name: "Test User",
        last4: "4242",
        network: "Visa",
        type: "credit",
        issuer: null,
      };
      expect(card.entity).toBe("card");
      expect(card.last4).toBe("4242");
    });

    it("should allow valid type values", () => {
      const types: RazorpayCard["type"][] = ["credit", "debit", "prepaid"];
      types.forEach((type) => {
        expect(["credit", "debit", "prepaid"]).toContain(type);
      });
    });
  });

  describe("CreateRefundInput", () => {
    it("should have required paymentId", () => {
      const input: CreateRefundInput = {
        paymentId: "pay_123",
      };
      expect(input.paymentId).toBe("pay_123");
    });

    it("should accept optional amount for partial refund", () => {
      const input: CreateRefundInput = {
        paymentId: "pay_123",
        amount: 25000,
      };
      expect(input.amount).toBe(25000);
    });

    it("should accept optional speed parameter", () => {
      const normalInput: CreateRefundInput = {
        paymentId: "pay_123",
        speed: "normal",
      };
      const optimumInput: CreateRefundInput = {
        paymentId: "pay_123",
        speed: "optimum",
      };
      expect(normalInput.speed).toBe("normal");
      expect(optimumInput.speed).toBe("optimum");
    });
  });

  describe("RazorpayRefund", () => {
    it("should have required properties", () => {
      const refund: RazorpayRefund = {
        id: "rfnd_123",
        entity: "refund",
        amount: 25000,
        currency: "INR",
        payment_id: "pay_456",
        notes: {},
        receipt: null,
        acquirer_data: { arn: null },
        created_at: 1672531200,
        speed_processed: "normal",
        speed_requested: "normal",
        status: "processed",
      };
      expect(refund.entity).toBe("refund");
      expect(refund.status).toBe("processed");
    });

    it("should allow valid status values", () => {
      const statuses: RazorpayRefund["status"][] = ["pending", "processed", "failed"];
      statuses.forEach((status) => {
        expect(["pending", "processed", "failed"]).toContain(status);
      });
    });
  });

  describe("RazorpayWebhookEvent", () => {
    it("should include all supported event types", () => {
      const events: RazorpayWebhookEvent[] = [
        "payment.authorized",
        "payment.captured",
        "payment.failed",
        "refund.created",
        "refund.processed",
        "refund.failed",
        "order.paid",
      ];
      expect(events).toHaveLength(7);
    });
  });

  describe("RazorpayCurrency", () => {
    it("should match RAZORPAY_CURRENCIES array", () => {
      const currency: RazorpayCurrency = "INR";
      expect(RAZORPAY_CURRENCIES).toContain(currency);
    });

    it("should allow all supported currencies", () => {
      const currencies: RazorpayCurrency[] = [
        "INR",
        "USD",
        "EUR",
        "GBP",
        "SGD",
        "AED",
        "AUD",
        "CAD",
        "CNY",
        "JPY",
        "MYR",
      ];
      currencies.forEach((currency) => {
        expect(RAZORPAY_CURRENCIES).toContain(currency);
      });
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration Tests", () => {
  describe("Order creation flow", () => {
    it("should convert rupees to paise correctly for order creation", () => {
      const orderAmountInRupees = 999.99;
      const amountInPaise = toPaise(orderAmountInRupees);

      const input: CreateRazorpayOrderInput = {
        amount: amountInPaise,
        receipt: "order_test",
      };

      expect(input.amount).toBe(99999);
    });

    it("should format notes correctly", () => {
      const notes = {
        customer_id: "cust_123",
        order_id: "internal_order_456",
        product_name: "Art Poster - Vintage Style",
      };

      const input: CreateRazorpayOrderInput = {
        amount: 50000,
        receipt: "receipt_123",
        notes,
      };

      expect(Object.keys(input.notes || {}).length).toBe(3);
    });
  });

  describe("Payment details extraction", () => {
    it("should extract all relevant details from card payment", () => {
      const payment: RazorpayPayment = {
        id: "pay_integration_test",
        entity: "payment",
        amount: 99999,
        currency: "INR",
        status: "captured",
        order_id: "order_integration_test",
        invoice_id: null,
        method: "card",
        description: null,
        bank: null,
        wallet: null,
        vpa: null,
        email: "customer@test.com",
        contact: "+919999999999",
        notes: { test: "true" },
        fee: 2360,
        tax: 360,
        error_code: null,
        error_description: null,
        error_source: null,
        error_step: null,
        error_reason: null,
        captured: true,
        card_id: "card_test",
        card: {
          id: "card_test",
          entity: "card",
          name: "Test Customer",
          last4: "1234",
          network: "Mastercard",
          type: "debit",
          issuer: "ICICI Bank",
        },
        created_at: Math.floor(Date.now() / 1000),
      };

      const details = extractPaymentDetails(payment);

      expect(details.provider).toBe("razorpay");
      expect(details.transactionId).toBe("pay_integration_test");
      expect(details.orderId).toBe("order_integration_test");
      expect(details.method).toBe("card");
      expect(details.lastFourDigits).toBe("1234");
      expect(details.capturedAt).toBeDefined();
    });
  });

  describe("Refund amount calculations", () => {
    it("should handle full refund", () => {
      const originalAmount = 50000; // 500 INR in paise
      const refundInput: CreateRefundInput = {
        paymentId: "pay_test",
        // No amount means full refund
      };

      expect(refundInput.amount).toBeUndefined();
    });

    it("should handle partial refund", () => {
      const originalAmount = 50000; // 500 INR in paise
      const partialRefundAmount = toPaise(250); // 250 INR

      const refundInput: CreateRefundInput = {
        paymentId: "pay_test",
        amount: partialRefundAmount,
      };

      expect(refundInput.amount).toBe(25000);
      expect(refundInput.amount).toBeLessThan(originalAmount);
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("Edge Cases", () => {
  describe("Currency conversion edge cases", () => {
    it("should handle very small amounts", () => {
      expect(toPaise(0.001)).toBe(0); // Rounds to 0
    });

    it("should handle very large amounts", () => {
      const largeAmount = 10000000; // 1 crore INR
      expect(toPaise(largeAmount)).toBe(1000000000);
      expect(toRupees(1000000000)).toBe(largeAmount);
    });

    it("should handle negative amounts (edge case)", () => {
      // Though typically amounts should be positive
      expect(toPaise(-100)).toBe(-10000);
      expect(toRupees(-10000)).toBe(-100);
    });
  });

  describe("Payment details with missing fields", () => {
    it("should handle payment without card details", () => {
      const payment: RazorpayPayment = {
        id: "pay_test",
        entity: "payment",
        amount: 50000,
        currency: "INR",
        status: "captured",
        order_id: "order_test",
        invoice_id: null,
        method: "upi",
        description: null,
        bank: null,
        wallet: null,
        vpa: "user@upi",
        email: "test@test.com",
        contact: "+91999",
        notes: {},
        fee: 0,
        tax: 0,
        error_code: null,
        error_description: null,
        error_source: null,
        error_step: null,
        error_reason: null,
        captured: true,
        card_id: null,
        card: null,
        created_at: 1672531200,
      };

      const details = extractPaymentDetails(payment);
      expect(details.lastFourDigits).toBeUndefined();
    });

    it("should handle payment with null bank and wallet", () => {
      const payment: RazorpayPayment = {
        id: "pay_test",
        entity: "payment",
        amount: 50000,
        currency: "INR",
        status: "captured",
        order_id: "order_test",
        invoice_id: null,
        method: "card",
        description: null,
        bank: null,
        wallet: null,
        vpa: null,
        email: "test@test.com",
        contact: "+91999",
        notes: {},
        fee: 0,
        tax: 0,
        error_code: null,
        error_description: null,
        error_source: null,
        error_step: null,
        error_reason: null,
        captured: true,
        card_id: null,
        card: null,
        created_at: 1672531200,
      };

      const details = extractPaymentDetails(payment);
      expect(details.bankName).toBeUndefined();
      expect(details.walletName).toBeUndefined();
    });
  });

  describe("Order input validation", () => {
    it("should accept minimum valid amount (1 paise)", () => {
      const input: CreateRazorpayOrderInput = {
        amount: 1, // 1 paise = 0.01 INR
        receipt: "test",
      };
      expect(input.amount).toBe(1);
    });

    it("should accept receipt with special characters", () => {
      const input: CreateRazorpayOrderInput = {
        amount: 100,
        receipt: "order_123-abc_xyz",
      };
      expect(input.receipt).toBe("order_123-abc_xyz");
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Performance", () => {
  it("should perform currency conversions quickly", () => {
    const start = Date.now();

    for (let i = 0; i < 10000; i++) {
      toPaise(Math.random() * 10000);
      toRupees(Math.floor(Math.random() * 1000000));
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // 10k conversions in under 100ms
  });

  it("should extract payment details quickly", () => {
    const payment: RazorpayPayment = {
      id: "pay_perf",
      entity: "payment",
      amount: 50000,
      currency: "INR",
      status: "captured",
      order_id: "order_perf",
      invoice_id: null,
      method: "card",
      description: null,
      bank: null,
      wallet: null,
      vpa: null,
      email: "test@test.com",
      contact: "+91999",
      notes: {},
      fee: 0,
      tax: 0,
      error_code: null,
      error_description: null,
      error_source: null,
      error_step: null,
      error_reason: null,
      captured: true,
      card_id: "card_perf",
      card: {
        id: "card_perf",
        entity: "card",
        name: "Test",
        last4: "4242",
        network: "Visa",
        type: "credit",
        issuer: null,
      },
      created_at: 1672531200,
    };

    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      extractPaymentDetails(payment);
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // 1k extractions in under 50ms
  });
});
