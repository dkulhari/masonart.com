/**
 * SMS Service - 2Factor.in Integration
 *
 * Provides SMS OTP functionality using 2Factor.in API.
 * 2Factor.in offers:
 * - Fast OTP delivery (2-6 seconds)
 * - SLA guarantee: OTP in 15 seconds or refund
 * - Auto-retry via backup carriers
 * - DLT compliant for India
 *
 * @see https://2factor.in/v3/documentation
 */

import { withRetry } from "../lib/retry";
import { logger } from "../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface SendOTPResponse {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  error?: string;
}

interface TwoFactorSendResponse {
  Status: "Success" | "Error";
  Details: string;
}

interface TwoFactorVerifyResponse {
  Status: "Success" | "Error";
  Details: string;
}

// ============================================================================
// Configuration
// ============================================================================

const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY || "";
const TWO_FACTOR_BASE_URL = "https://2factor.in/API/V1";

// OTP template name registered with 2Factor.in (DLT compliant)
// You'll need to register this template in your 2Factor.in dashboard
const OTP_TEMPLATE_NAME = process.env.TWO_FACTOR_OTP_TEMPLATE || "MasonArt";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize phone number to 10-digit format for India
 * Removes +91, 91 prefix and any spaces/dashes
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, "");

  // Remove country code if present (91 for India)
  if (normalized.startsWith("91") && normalized.length === 12) {
    normalized = normalized.slice(2);
  }

  // Validate it's a 10-digit number
  if (normalized.length !== 10) {
    throw new Error("Invalid phone number. Must be 10 digits.");
  }

  // Validate it starts with valid Indian mobile prefixes (6, 7, 8, 9)
  const firstDigit = normalized.charAt(0);
  if (!["6", "7", "8", "9"].includes(firstDigit)) {
    throw new Error("Invalid Indian mobile number");
  }

  return normalized;
}

/**
 * Validate phone number format
 */
export function isValidIndianMobile(phone: string): boolean {
  try {
    normalizePhoneNumber(phone);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// SMS Service
// ============================================================================

/**
 * Send OTP to a phone number using 2Factor.in
 *
 * @param phone - Phone number (with or without country code)
 * @returns Session ID for verification
 */
export async function sendOTP(phone: string): Promise<SendOTPResponse> {
  try {
    const normalizedPhone = normalizePhoneNumber(phone);

    // Check if API key is configured
    if (!TWO_FACTOR_API_KEY) {
      // In development or test mode, log and return mock session
      if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
        console.log(`[SMS] Dev mode: OTP would be sent to ${normalizedPhone}`);
        console.log(`[SMS] Dev mode: Use OTP "123456" for testing`);
        return {
          success: true,
          sessionId: `dev_${Date.now()}_${normalizedPhone}`,
        };
      }
      return {
        success: false,
        error: "SMS service not configured",
      };
    }

    // Send OTP via 2Factor.in API with retry for transient failures
    const url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/SMS/${normalizedPhone}/AUTOGEN/${OTP_TEMPLATE_NAME}`;

    const result = await withRetry(
      async () => {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        const data = (await response.json()) as TwoFactorSendResponse;

        if (data.Status !== "Success") {
          throw new Error(data.Details || "Failed to send OTP");
        }

        return data;
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        operationName: "sms-otp-send",
      }
    );

    if (!result.success) {
      logger.error(
        { err: result.error, phone: normalizedPhone, attempts: result.attempts },
        "OTP delivery failed after retries"
      );
      return {
        success: false,
        error: result.error instanceof Error ? result.error.message : "Failed to send OTP",
      };
    }

    return {
      success: true,
      sessionId: result.data!.Details,
    };
  } catch (error) {
    logger.error({ err: error, phone }, "OTP send error");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send OTP",
    };
  }
}

/**
 * Verify OTP using 2Factor.in
 *
 * @param sessionId - Session ID returned from sendOTP
 * @param otp - OTP entered by user
 */
export async function verifyOTP(
  sessionId: string,
  otp: string
): Promise<VerifyOTPResponse> {
  try {
    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return {
        success: false,
        error: "Invalid OTP format. Must be 6 digits.",
      };
    }

    // Development mode - accept "123456" as valid OTP
    if (sessionId.startsWith("dev_")) {
      if (otp === "123456") {
        console.log(`[SMS] Dev mode: OTP verified for session ${sessionId}`);
        return { success: true };
      }
      return {
        success: false,
        error: "Invalid OTP",
      };
    }

    // Check if API key is configured
    if (!TWO_FACTOR_API_KEY) {
      return {
        success: false,
        error: "SMS service not configured",
      };
    }

    // Verify OTP via 2Factor.in API
    // API: https://2factor.in/API/V1/{api_key}/SMS/VERIFY/{session_id}/{otp}
    const url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = (await response.json()) as TwoFactorVerifyResponse;

    if (data.Status === "Success") {
      return { success: true };
    }

    // Handle specific error cases
    if (data.Details === "OTP Mismatch") {
      return {
        success: false,
        error: "Invalid OTP. Please try again.",
      };
    }

    if (data.Details === "OTP Expired") {
      return {
        success: false,
        error: "OTP has expired. Please request a new one.",
      };
    }

    return {
      success: false,
      error: data.Details || "OTP verification failed",
    };
  } catch (error) {
    console.error("[SMS] Error verifying OTP:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "OTP verification failed",
    };
  }
}

/**
 * Check if SMS service is properly configured
 */
export function isSmsServiceConfigured(): boolean {
  return (
    !!TWO_FACTOR_API_KEY ||
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  );
}

// ============================================================================
// Transactional SMS Service
// ============================================================================

export interface SendTransactionalSMSResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type TransactionalSMSType =
  | "order_confirmation"
  | "shipped"
  | "out_for_delivery"
  | "delivered";

// Transactional SMS template names registered with 2Factor.in (DLT compliant)
// These need to be registered in your 2Factor.in dashboard
const TRANSACTIONAL_TEMPLATES: Record<TransactionalSMSType, string> = {
  order_confirmation:
    process.env.TWO_FACTOR_ORDER_CONFIRMED_TEMPLATE || "MasonArtOrderConfirmed",
  shipped: process.env.TWO_FACTOR_SHIPPED_TEMPLATE || "MasonArtShipped",
  out_for_delivery:
    process.env.TWO_FACTOR_OUT_FOR_DELIVERY_TEMPLATE || "MasonArtOutForDelivery",
  delivered: process.env.TWO_FACTOR_DELIVERED_TEMPLATE || "MasonArtDelivered",
};

/**
 * Send transactional SMS using 2Factor.in
 *
 * @param phone - Phone number (with or without country code)
 * @param type - Type of transactional message
 * @param variables - Template variables to substitute
 * @returns Result with success status
 *
 * Note: This uses 2Factor.in's transactional SMS API.
 * Templates must be pre-registered and DLT approved.
 *
 * @see https://2factor.in/v3/documentation
 */
export async function sendTransactionalSMS(
  phone: string,
  type: TransactionalSMSType,
  variables: Record<string, string>
): Promise<SendTransactionalSMSResponse> {
  try {
    const normalizedPhone = normalizePhoneNumber(phone);
    const templateName = TRANSACTIONAL_TEMPLATES[type];

    // Check if API key is configured
    if (!TWO_FACTOR_API_KEY) {
      // In development or test mode, log and return success
      if (
        process.env.NODE_ENV === "development" ||
        process.env.NODE_ENV === "test"
      ) {
        console.log(`[SMS] Dev mode: Transactional SMS would be sent`);
        console.log(`[SMS] To: ${normalizedPhone}`);
        console.log(`[SMS] Type: ${type}`);
        console.log(`[SMS] Template: ${templateName}`);
        console.log(`[SMS] Variables:`, variables);
        return {
          success: true,
          messageId: `dev_txn_${Date.now()}`,
        };
      }
      return {
        success: false,
        error: "SMS service not configured",
      };
    }

    // 2Factor.in Transactional SMS API
    // API: https://2factor.in/API/V1/{api_key}/ADDON_SERVICES/SEND/TSMS
    // Method: POST with JSON body
    const url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/ADDON_SERVICES/SEND/TSMS`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        From: "MSMART", // Sender ID (must be registered with 2Factor)
        To: normalizedPhone,
        TemplateName: templateName,
        VAR1: variables.var1 || variables.orderNumber || "",
        VAR2: variables.var2 || variables.trackingUrl || "",
        VAR3: variables.var3 || "",
      }),
    });

    const data = (await response.json()) as TwoFactorSendResponse;

    if (data.Status === "Success") {
      return {
        success: true,
        messageId: data.Details,
      };
    }

    return {
      success: false,
      error: data.Details || "Failed to send transactional SMS",
    };
  } catch (error) {
    console.error("[SMS] Error sending transactional SMS:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to send transactional SMS",
    };
  }
}

/**
 * Get SMS message content for notification type
 * Used for logging in dev mode and as fallback content
 */
export function getTransactionalSMSContent(
  type: TransactionalSMSType,
  orderNumber: string,
  trackingUrl?: string
): string {
  switch (type) {
    case "order_confirmation":
      return `MasonArt: Your order ${orderNumber} is confirmed! We'll notify you when it ships. Track: masonart.com/orders`;
    case "shipped":
      return `MasonArt: Your order ${orderNumber} has shipped! Track your order: ${trackingUrl || "masonart.com/orders"}`;
    case "out_for_delivery":
      return `MasonArt: Your order ${orderNumber} is out for delivery today! Track: ${trackingUrl || "masonart.com/orders"}`;
    case "delivered":
      return `MasonArt: Your order ${orderNumber} has been delivered. Enjoy your art! Rate us: masonart.com/reviews`;
  }
}
