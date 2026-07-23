/**
 * Phone Authentication Routes
 *
 * Provides SMS OTP-based authentication endpoints.
 * Integrates with 2Factor.in for OTP delivery and Better Auth for session management.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../database";
import { users, verifications, sessions } from "../database/schema";
import {
  sendOTP,
  verifyOTP,
  normalizePhoneNumber,
  isValidIndianMobile,
  isSmsServiceConfigured,
} from "../services/sms";

// ============================================================================
// Types
// ============================================================================

// Validation schemas
const sendOTPSchema = z.object({
  phone: z.string().min(10, "Phone number is required"),
});

const verifyOTPSchema = z.object({
  phone: z.string().min(10, "Phone number is required"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  sessionId: z.string().min(1, "Session ID is required"),
  // Optional fields for new user registration
  name: z.string().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export const phoneAuthApp = new Hono();

/**
 * POST /api/phone-auth/send-otp
 *
 * Send OTP to a phone number.
 * Creates a verification record to track the OTP session.
 */
phoneAuthApp.post("/send-otp", zValidator("json", sendOTPSchema), async (c) => {
  const { phone } = c.req.valid("json");

  // Validate phone number format
  if (!isValidIndianMobile(phone)) {
    return c.json(
      {
        success: false,
        error: "Invalid Indian mobile number. Must be 10 digits starting with 6, 7, 8, or 9.",
      },
      400
    );
  }

  // Check if SMS service is configured
  if (!isSmsServiceConfigured()) {
    return c.json(
      {
        success: false,
        error: "SMS service is not configured",
      },
      503
    );
  }

  try {
    const normalizedPhone = normalizePhoneNumber(phone);

    // Send OTP via 2Factor.in
    const result = await sendOTP(normalizedPhone);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error || "Failed to send OTP",
        },
        500
      );
    }

    // Store verification record for tracking
    // We use the verifications table to store the session ID
    const verificationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(verifications).values({
      id: verificationId,
      identifier: `phone:${normalizedPhone}`,
      value: result.sessionId!, // Store 2Factor session ID
      expiresAt,
    });

    // Check if user exists with this phone
    const existingUser = await db.query.users.findFirst({
      where: eq(users.phone, normalizedPhone),
    });

    return c.json({
      success: true,
      sessionId: result.sessionId,
      expiresIn: 600, // 10 minutes in seconds
      isExistingUser: !!existingUser,
      message: `OTP sent to ${normalizedPhone.slice(0, 2)}****${normalizedPhone.slice(-4)}`,
    });
  } catch (error) {
    console.error("[PhoneAuth] Error sending OTP:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send OTP",
      },
      500
    );
  }
});

/**
 * POST /api/phone-auth/verify-otp
 *
 * Verify OTP and create/login user.
 * Creates a session for the user upon successful verification.
 */
phoneAuthApp.post(
  "/verify-otp",
  zValidator("json", verifyOTPSchema),
  async (c) => {
    const { phone, otp, sessionId, name } = c.req.valid("json");

    try {
      const normalizedPhone = normalizePhoneNumber(phone);

      // Verify OTP with 2Factor.in
      const result = await verifyOTP(sessionId, otp);

      if (!result.success) {
        return c.json(
          {
            success: false,
            error: result.error || "Invalid OTP",
          },
          400
        );
      }

      // OTP verified! Now handle user login/registration

      // Check if user exists with this phone
      let user = await db.query.users.findFirst({
        where: eq(users.phone, normalizedPhone),
      });

      if (!user) {
        // Create new user with phone
        const userId = crypto.randomUUID();
        const userName = name || `User${normalizedPhone.slice(-4)}`;

        const newUsers = await db
          .insert(users)
          .values({
            id: userId,
            name: userName,
            email: `${normalizedPhone}@phone.chobii.art`, // Placeholder email
            emailVerified: false,
            phone: normalizedPhone,
            phoneVerified: true,
            role: "customer",
            status: "active",
          })
          .returning();

        user = newUsers[0];

        if (!user) {
          return c.json(
            {
              success: false,
              error: "Failed to create user account",
            },
            500
          );
        }

        console.log(`[PhoneAuth] Created new user via phone: ${userId}`);
      } else {
        // Update existing user's phone verification status
        if (!user.phoneVerified) {
          await db
            .update(users)
            .set({ phoneVerified: true, updatedAt: new Date() })
            .where(eq(users.id, user.id));
        }

        console.log(`[PhoneAuth] User logged in via phone: ${user.id}`);
      }

      // Create session using Better Auth's internal session creation
      // We'll create a session token manually since Better Auth doesn't have phone OTP built-in
      const sessionToken = crypto.randomUUID();
      const sessionId2 = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Insert session directly
      await db.insert(sessions).values({
        id: sessionId2,
        token: sessionToken,
        userId: user.id,
        expiresAt,
        ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
        userAgent: c.req.header("user-agent") || null,
      });

      // Update last login
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));

      // Clean up verification record
      await db
        .delete(verifications)
        .where(eq(verifications.identifier, `phone:${normalizedPhone}`));

      // Set session cookie
      const cookieName = "chobii.session_token";
      const isProduction = process.env.NODE_ENV === "production";

      c.header(
        "Set-Cookie",
        `${cookieName}=${sessionToken}; Path=/; HttpOnly; ${isProduction ? "Secure; " : ""}SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
      );

      return c.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          phoneVerified: true,
          role: user.role,
        },
        isNewUser: !user.phoneVerified,
      });
    } catch (error) {
      console.error("[PhoneAuth] Error verifying OTP:", error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Verification failed",
        },
        500
      );
    }
  }
);

/**
 * POST /api/phone-auth/resend-otp
 *
 * Resend OTP to the same phone number.
 * Rate limited to prevent abuse.
 */
phoneAuthApp.post(
  "/resend-otp",
  zValidator("json", sendOTPSchema),
  async (c) => {
    const { phone } = c.req.valid("json");

    if (!isValidIndianMobile(phone)) {
      return c.json(
        {
          success: false,
          error: "Invalid phone number",
        },
        400
      );
    }

    try {
      const normalizedPhone = normalizePhoneNumber(phone);

      // Check for existing recent verification (rate limiting)
      const existingVerification = await db.query.verifications.findFirst({
        where: eq(verifications.identifier, `phone:${normalizedPhone}`),
      });

      if (existingVerification) {
        const timeSinceCreated =
          Date.now() - existingVerification.createdAt.getTime();
        const minWaitTime = 30 * 1000; // 30 seconds

        if (timeSinceCreated < minWaitTime) {
          const waitSeconds = Math.ceil((minWaitTime - timeSinceCreated) / 1000);
          return c.json(
            {
              success: false,
              error: `Please wait ${waitSeconds} seconds before requesting a new OTP`,
              retryAfter: waitSeconds,
            },
            429
          );
        }

        // Delete old verification
        await db
          .delete(verifications)
          .where(eq(verifications.id, existingVerification.id));
      }

      // Send new OTP
      const result = await sendOTP(normalizedPhone);

      if (!result.success) {
        return c.json(
          {
            success: false,
            error: result.error || "Failed to send OTP",
          },
          500
        );
      }

      // Store new verification record
      const verificationId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(verifications).values({
        id: verificationId,
        identifier: `phone:${normalizedPhone}`,
        value: result.sessionId!,
        expiresAt,
      });

      return c.json({
        success: true,
        sessionId: result.sessionId,
        expiresIn: 600,
        message: "OTP resent successfully",
      });
    } catch (error) {
      console.error("[PhoneAuth] Error resending OTP:", error);
      return c.json(
        {
          success: false,
          error: "Failed to resend OTP",
        },
        500
      );
    }
  }
);

/**
 * GET /api/phone-auth/status
 *
 * Check SMS service configuration status.
 */
phoneAuthApp.get("/status", (c) => {
  return c.json({
    enabled: isSmsServiceConfigured(),
    provider: "2factor.in",
  });
});
