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
      // In development, log and return mock session
      if (process.env.NODE_ENV === "development") {
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

    // Send OTP via 2Factor.in API
    // API: https://2factor.in/API/V1/{api_key}/SMS/{phone_number}/AUTOGEN/{template_name}
    const url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/SMS/${normalizedPhone}/AUTOGEN/${OTP_TEMPLATE_NAME}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = (await response.json()) as TwoFactorSendResponse;

    if (data.Status === "Success") {
      return {
        success: true,
        sessionId: data.Details, // 2Factor returns session ID in Details
      };
    }

    return {
      success: false,
      error: data.Details || "Failed to send OTP",
    };
  } catch (error) {
    console.error("[SMS] Error sending OTP:", error);
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
    !!TWO_FACTOR_API_KEY || process.env.NODE_ENV === "development"
  );
}
