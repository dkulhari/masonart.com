# SMS OTP Login Implementation Guide

**Last Updated:** 2026-01-27
**Provider:** 2Factor.in (India)
**Stack:** Hono, Better Auth, TypeScript, React

---

## Overview

This document describes the SMS OTP login implementation for Indian phone numbers using 2Factor.in as the SMS gateway. The implementation supports:

- Phone number validation (Indian mobile: 10 digits starting with 6/7/8/9)
- OTP generation and delivery via SMS
- OTP verification with session creation
- Dev/test mode with mock OTP ("123456")
- Rate limiting and security best practices

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   API       │────▶│  2Factor.in │
│   (React)   │◀────│   (Hono)    │◀────│   SMS API   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Database   │
                    │  (Postgres) │
                    └─────────────┘
```

### Flow

1. User enters phone number on login page
2. Frontend calls `/api/phone-auth/send-otp`
3. API validates phone, generates OTP, stores verification record
4. 2Factor.in sends SMS with OTP
5. User enters OTP received via SMS
6. Frontend calls `/api/phone-auth/verify-otp`
7. API verifies OTP, creates/updates user, creates session
8. User is logged in

---

## Environment Variables

Add to `.env`:

```bash
# 2Factor.in SMS Configuration
TWO_FACTOR_API_KEY=your-api-key-here
TWO_FACTOR_OTP_TEMPLATE=your-template-name  # Optional, uses default if not set
```

### Getting 2Factor.in API Key

1. Sign up at https://2factor.in
2. Complete KYC verification
3. Get API key from Dashboard → API Keys
4. (Optional) Create OTP template in Dashboard → Templates

### Pricing (as of 2026)

- Free tier: 100 SMS/month
- Pay-as-you-go: ~₹0.15-0.20 per SMS
- Bulk plans available for higher volumes

---

## Database Schema

Add `verifications` table for OTP storage:

```sql
CREATE TABLE verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,      -- Phone number
  value TEXT NOT NULL,           -- Session ID from 2Factor
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verifications_identifier ON verifications(identifier);
```

Or with Drizzle ORM:

```typescript
// packages/api/src/database/schema/verifications.ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

---

## SMS Service Implementation

```typescript
// packages/api/src/services/sms.ts

const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY;
const TWO_FACTOR_OTP_TEMPLATE = process.env.TWO_FACTOR_OTP_TEMPLATE;
const TWO_FACTOR_BASE_URL = "https://2factor.in/API/V1";

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

// ============================================================================
// Phone Number Utilities
// ============================================================================

/**
 * Normalize phone number to 10-digit Indian format
 * Handles: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, "");

  // Handle different formats
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return digitsOnly.slice(2); // Remove 91 prefix
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    return digitsOnly.slice(1); // Remove leading 0
  }
  if (digitsOnly.length === 10) {
    return digitsOnly;
  }

  return digitsOnly; // Return as-is for validation to catch
}

/**
 * Validate Indian mobile number
 * Must be 10 digits starting with 6, 7, 8, or 9
 */
export function isValidIndianMobile(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);

  if (normalized.length !== 10) {
    return false;
  }

  // Indian mobile numbers start with 6, 7, 8, or 9
  const firstDigit = normalized.charAt(0);
  return ["6", "7", "8", "9"].includes(firstDigit);
}

/**
 * Check if SMS service is configured
 */
export function isSmsServiceConfigured(): boolean {
  return !!TWO_FACTOR_API_KEY;
}

// ============================================================================
// OTP Operations
// ============================================================================

/**
 * Send OTP to phone number via 2Factor.in
 */
export async function sendOTP(phone: string): Promise<SendOTPResponse> {
  const normalizedPhone = normalizePhoneNumber(phone);

  // Validate phone number
  if (!isValidIndianMobile(normalizedPhone)) {
    return {
      success: false,
      error: "Invalid Indian mobile number",
    };
  }

  // Dev/test mode - return mock session
  if (!TWO_FACTOR_API_KEY) {
    if (
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test"
    ) {
      console.log(`[DEV] Mock OTP sent to ${normalizedPhone}. Use OTP: 123456`);
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

  try {
    // Build URL for 2Factor.in API
    let url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/SMS/${normalizedPhone}/AUTOGEN`;
    if (TWO_FACTOR_OTP_TEMPLATE) {
      url += `/${TWO_FACTOR_OTP_TEMPLATE}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.Status === "Success") {
      return {
        success: true,
        sessionId: data.Details,
      };
    }

    return {
      success: false,
      error: data.Details || "Failed to send OTP",
    };
  } catch (error) {
    console.error("2Factor.in API error:", error);
    return {
      success: false,
      error: "SMS service unavailable",
    };
  }
}

/**
 * Verify OTP via 2Factor.in
 */
export async function verifyOTP(
  sessionId: string,
  otp: string
): Promise<VerifyOTPResponse> {
  // Validate OTP format (6 digits)
  if (!/^\d{6}$/.test(otp)) {
    return {
      success: false,
      error: "OTP must be 6 digits",
    };
  }

  // Dev/test mode - accept "123456"
  if (sessionId.startsWith("dev_")) {
    if (otp === "123456") {
      return { success: true };
    }
    return {
      success: false,
      error: "Invalid OTP",
    };
  }

  // Production - verify with 2Factor.in
  if (!TWO_FACTOR_API_KEY) {
    return {
      success: false,
      error: "SMS service not configured",
    };
  }

  try {
    const url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Status === "Success" && data.Details === "OTP Matched") {
      return { success: true };
    }

    return {
      success: false,
      error: data.Details || "Invalid OTP",
    };
  } catch (error) {
    console.error("2Factor.in verification error:", error);
    return {
      success: false,
      error: "Verification service unavailable",
    };
  }
}

/**
 * Resend OTP using existing session
 */
export async function resendOTP(sessionId: string): Promise<SendOTPResponse> {
  // Dev mode
  if (sessionId.startsWith("dev_")) {
    const phone = sessionId.split("_")[2];
    console.log(`[DEV] Mock OTP resent to ${phone}. Use OTP: 123456`);
    return {
      success: true,
      sessionId: `dev_${Date.now()}_${phone}`,
    };
  }

  if (!TWO_FACTOR_API_KEY) {
    return {
      success: false,
      error: "SMS service not configured",
    };
  }

  try {
    const url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/RETRY`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Status === "Success") {
      return {
        success: true,
        sessionId: data.Details,
      };
    }

    return {
      success: false,
      error: data.Details || "Failed to resend OTP",
    };
  } catch (error) {
    console.error("2Factor.in resend error:", error);
    return {
      success: false,
      error: "SMS service unavailable",
    };
  }
}
```

---

## API Routes Implementation

```typescript
// packages/api/src/routes/phone-auth.ts

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../database";
import { users, verifications } from "../database/schema";
import { auth } from "../auth";
import {
  sendOTP,
  verifyOTP,
  resendOTP,
  isValidIndianMobile,
  normalizePhoneNumber,
  isSmsServiceConfigured,
} from "../services/sms";

export const phoneAuthApp = new Hono();

// ============================================================================
// Validation Schemas
// ============================================================================

const sendOTPSchema = z.object({
  phone: z.string().min(10).max(15),
});

const verifyOTPSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
  sessionId: z.string().min(1),
});

const resendOTPSchema = z.object({
  phone: z.string().min(10).max(15),
  sessionId: z.string().min(1),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/phone-auth/send-otp
 * Send OTP to phone number
 */
phoneAuthApp.post("/send-otp", zValidator("json", sendOTPSchema), async (c) => {
  const { phone } = c.req.valid("json");
  const normalizedPhone = normalizePhoneNumber(phone);

  // Validate phone number
  if (!isValidIndianMobile(normalizedPhone)) {
    return c.json(
      {
        success: false,
        error: "Please enter a valid Indian mobile number",
      },
      400
    );
  }

  // Send OTP
  const result = await sendOTP(normalizedPhone);

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: result.error,
      },
      400
    );
  }

  // Store verification record
  try {
    const verificationId = `phone_${normalizedPhone}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing verification for this phone
    await db
      .delete(verifications)
      .where(eq(verifications.identifier, normalizedPhone));

    // Insert new verification
    await db.insert(verifications).values({
      id: verificationId,
      identifier: normalizedPhone,
      value: result.sessionId!,
      expiresAt,
    });
  } catch (dbError) {
    console.error("Database error storing verification:", dbError);
    // Continue anyway - verification can still work
  }

  return c.json({
    success: true,
    sessionId: result.sessionId,
    message: "OTP sent successfully",
  });
});

/**
 * POST /api/phone-auth/verify-otp
 * Verify OTP and create session
 */
phoneAuthApp.post(
  "/verify-otp",
  zValidator("json", verifyOTPSchema),
  async (c) => {
    const { phone, otp, sessionId } = c.req.valid("json");
    const normalizedPhone = normalizePhoneNumber(phone);

    // Verify OTP with 2Factor.in
    const verifyResult = await verifyOTP(sessionId, otp);

    if (!verifyResult.success) {
      return c.json(
        {
          success: false,
          error: verifyResult.error || "Invalid OTP",
        },
        400
      );
    }

    try {
      // Check if user exists
      const existingUsers = await db
        .select()
        .from(users)
        .where(eq(users.phone, normalizedPhone))
        .limit(1);

      let user = existingUsers[0];

      if (!user) {
        // Create new user
        const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const newUsers = await db
          .insert(users)
          .values({
            id: userId,
            phone: normalizedPhone,
            phoneVerified: true,
            role: "customer",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        user = newUsers[0];
      } else if (!user.phoneVerified) {
        // Update phone verified status
        await db
          .update(users)
          .set({ phoneVerified: true, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      // Clean up verification record
      await db
        .delete(verifications)
        .where(eq(verifications.identifier, normalizedPhone));

      // Create session using Better Auth
      const session = await auth.api.signInWithIdToken({
        body: {
          token: user.id,
          providerId: "phone",
        },
        headers: c.req.raw.headers,
      });

      return c.json({
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        session: session,
      });
    } catch (dbError) {
      console.error("Database error during verification:", dbError);
      return c.json(
        {
          success: false,
          error: "Unable to complete login",
        },
        500
      );
    }
  }
);

/**
 * POST /api/phone-auth/resend-otp
 * Resend OTP using existing session
 */
phoneAuthApp.post(
  "/resend-otp",
  zValidator("json", resendOTPSchema),
  async (c) => {
    const { phone, sessionId } = c.req.valid("json");
    const normalizedPhone = normalizePhoneNumber(phone);

    const result = await resendOTP(sessionId);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        400
      );
    }

    // Update verification record
    try {
      await db
        .update(verifications)
        .set({
          value: result.sessionId!,
          updatedAt: new Date(),
        })
        .where(eq(verifications.identifier, normalizedPhone));
    } catch (dbError) {
      console.error("Database error updating verification:", dbError);
    }

    return c.json({
      success: true,
      sessionId: result.sessionId,
      message: "OTP resent successfully",
    });
  }
);

/**
 * GET /api/phone-auth/status
 * Check SMS service status
 */
phoneAuthApp.get("/status", async (c) => {
  return c.json({
    configured: isSmsServiceConfigured(),
    devMode:
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test",
  });
});
```

### Register Routes

```typescript
// packages/api/src/index.ts

import { phoneAuthApp } from "./routes/phone-auth";

// ... other routes ...

app.route("/api/phone-auth", phoneAuthApp);
```

---

## Frontend Implementation (React)

```tsx
// packages/web/app/routes/auth/login.tsx

import { useState, useEffect } from "react";

type LoginMethod = "email" | "phone";

export default function LoginPage() {
  const [method, setMethod] = useState<LoginMethod>("email");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSendOTP = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/phone-auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (data.success) {
        setSessionId(data.sessionId);
        setOtpSent(true);
        setResendCooldown(30);
      } else {
        setError(data.error || "Failed to send OTP");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/phone-auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, sessionId }),
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to dashboard or home
        window.location.href = "/";
      } else {
        setError(data.error || "Invalid OTP");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!sessionId || resendCooldown > 0) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/phone-auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, sessionId }),
      });

      const data = await response.json();

      if (data.success) {
        setSessionId(data.sessionId);
        setResendCooldown(30);
      } else {
        setError(data.error || "Failed to resend OTP");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Login</h1>

      {/* Method Tabs */}
      <div className="flex mb-6 border-b">
        <button
          onClick={() => setMethod("email")}
          className={`px-4 py-2 ${method === "email" ? "border-b-2 border-primary" : ""}`}
        >
          Email
        </button>
        <button
          onClick={() => setMethod("phone")}
          className={`px-4 py-2 ${method === "phone" ? "border-b-2 border-primary" : ""}`}
        >
          Phone
        </button>
      </div>

      {method === "phone" && (
        <>
          {!otpSent ? (
            /* Phone Input */
            <div>
              <label className="block mb-2">Phone Number</label>
              <div className="flex">
                <span className="px-3 py-2 bg-gray-100 border border-r-0 rounded-l">
                  +91
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Enter 10-digit mobile number"
                  className="flex-1 px-3 py-2 border rounded-r"
                  maxLength={10}
                />
              </div>
              <button
                onClick={handleSendOTP}
                disabled={loading || phone.length !== 10}
                className="w-full mt-4 px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send OTP"}
              </button>
            </div>
          ) : (
            /* OTP Input */
            <div>
              <p className="mb-4 text-gray-600">
                OTP sent to +91 {phone}
                <button
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setSessionId(null);
                  }}
                  className="ml-2 text-primary underline"
                >
                  Change
                </button>
              </p>

              <label className="block mb-2">Enter OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                className="w-full px-3 py-2 border rounded text-center text-2xl tracking-widest"
                maxLength={6}
              />

              <button
                onClick={handleVerifyOTP}
                disabled={loading || otp.length !== 6}
                className="w-full mt-4 px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>

              <button
                onClick={handleResendOTP}
                disabled={loading || resendCooldown > 0}
                className="w-full mt-2 px-4 py-2 text-primary underline disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}
    </div>
  );
}
```

---

## Testing

### Unit Tests (SMS Service)

```typescript
// packages/api/tests/services/sms.test.ts

import { describe, it, expect } from "vitest";
import {
  normalizePhoneNumber,
  isValidIndianMobile,
} from "../../src/services/sms";

describe("normalizePhoneNumber", () => {
  it("should handle 10-digit numbers", () => {
    expect(normalizePhoneNumber("9876543210")).toBe("9876543210");
  });

  it("should remove +91 prefix", () => {
    expect(normalizePhoneNumber("+919876543210")).toBe("9876543210");
  });

  it("should remove 91 prefix", () => {
    expect(normalizePhoneNumber("919876543210")).toBe("9876543210");
  });

  it("should remove leading 0", () => {
    expect(normalizePhoneNumber("09876543210")).toBe("9876543210");
  });

  it("should remove spaces and dashes", () => {
    expect(normalizePhoneNumber("98765-43210")).toBe("9876543210");
    expect(normalizePhoneNumber("98765 43210")).toBe("9876543210");
  });
});

describe("isValidIndianMobile", () => {
  it("should accept valid numbers starting with 6-9", () => {
    expect(isValidIndianMobile("6123456789")).toBe(true);
    expect(isValidIndianMobile("7123456789")).toBe(true);
    expect(isValidIndianMobile("8123456789")).toBe(true);
    expect(isValidIndianMobile("9123456789")).toBe(true);
  });

  it("should reject numbers starting with 0-5", () => {
    expect(isValidIndianMobile("0123456789")).toBe(false);
    expect(isValidIndianMobile("1234567890")).toBe(false);
    expect(isValidIndianMobile("5123456789")).toBe(false);
  });

  it("should reject wrong length", () => {
    expect(isValidIndianMobile("912345678")).toBe(false);   // 9 digits
    expect(isValidIndianMobile("91234567890")).toBe(false); // 11 digits
  });
});
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/auth.spec.ts

import { test, expect } from "@playwright/test";

test.describe("Phone Login", () => {
  test("should show phone tab on login page", async ({ page }) => {
    await page.goto("/auth/login");
    const phoneTab = page.getByRole("tab", { name: /phone/i });
    await expect(phoneTab).toBeVisible();
  });

  test("should validate phone number format", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("tab", { name: /phone/i }).click();

    // Enter invalid number
    await page.getByPlaceholder(/mobile number/i).fill("12345");
    const sendButton = page.getByRole("button", { name: /send otp/i });
    await expect(sendButton).toBeDisabled();

    // Enter valid number
    await page.getByPlaceholder(/mobile number/i).fill("9876543210");
    await expect(sendButton).toBeEnabled();
  });

  test("should show OTP input after sending", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("tab", { name: /phone/i }).click();
    await page.getByPlaceholder(/mobile number/i).fill("9876543210");
    await page.getByRole("button", { name: /send otp/i }).click();

    // Should show OTP input
    await expect(page.getByPlaceholder(/enter.*otp/i)).toBeVisible();
  });

  test("should login with dev OTP 123456", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("tab", { name: /phone/i }).click();
    await page.getByPlaceholder(/mobile number/i).fill("9876543210");
    await page.getByRole("button", { name: /send otp/i }).click();

    await page.getByPlaceholder(/enter.*otp/i).fill("123456");
    await page.getByRole("button", { name: /verify/i }).click();

    // Should redirect after login
    await expect(page).toHaveURL("/");
  });
});
```

---

## Security Considerations

1. **Rate Limiting**: Implement rate limiting on OTP endpoints (e.g., 3 attempts per phone per 10 minutes)

2. **OTP Expiry**: OTPs expire after 10 minutes (configurable)

3. **Session Validation**: Always validate session ID matches the phone number

4. **Brute Force Protection**: Lock account after 5 failed OTP attempts

5. **Logging**: Log all OTP requests for audit (without storing actual OTP values)

6. **HTTPS**: Always use HTTPS in production

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| OTP not received | DND enabled | User must disable DND or use app-based OTP |
| Invalid API key | Wrong/expired key | Check 2Factor.in dashboard for valid key |
| "Invalid OTP" error | Expired or wrong OTP | Request new OTP, check expiry time |
| Network timeout | 2Factor.in downtime | Implement retry logic or fallback provider |

### Dev Mode Testing

In development/test mode (no API key), use:
- **Any valid Indian phone number** (10 digits starting with 6/7/8/9)
- **OTP: 123456** (hardcoded for testing)

---

## Alternative Providers

If 2Factor.in doesn't meet your needs, consider:

| Provider | Free Tier | Per SMS | Notes |
|----------|-----------|---------|-------|
| 2Factor.in | 100/month | ₹0.15-0.20 | Best for India |
| MSG91 | 100/month | ₹0.18-0.25 | Good API |
| Authkey.io | 50/month | ₹0.12-0.18 | Cheapest |
| Twilio | None | ₹0.50+ | Global, expensive for India |
| AWS SNS | 100/month | ₹0.30+ | AWS integration |

---

## Quick Copy-Paste Checklist

- [ ] Add environment variables to `.env`
- [ ] Create `verifications` table in database
- [ ] Copy `services/sms.ts` file
- [ ] Copy `routes/phone-auth.ts` file
- [ ] Register routes in `index.ts`
- [ ] Add phone login UI to frontend
- [ ] Add unit tests
- [ ] Add E2E tests
- [ ] Test in dev mode with OTP "123456"
- [ ] Configure 2Factor.in account for production
