/**
 * Notification Preferences API Routes
 *
 * Provides API endpoints for managing user notification preferences:
 * - GET /api/notification-preferences - Get current user's notification preferences
 * - PATCH /api/notification-preferences - Update notification preferences
 *
 * Requires authentication for all endpoints.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "../database";
import {
  notificationPreferences,
  type NotificationPreference,
} from "../database/schema/notifications";
import { requireAuth, type AuthVariables } from "../middleware/auth";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for updating notification preferences
 * All fields are optional - only provided fields will be updated
 */
const updatePreferencesSchema = z.object({
  // Email preferences
  emailOrderConfirmation: z.boolean().optional(),
  emailShipped: z.boolean().optional(),
  emailOutForDelivery: z.boolean().optional(),
  emailDelivered: z.boolean().optional(),

  // SMS preferences
  smsOrderConfirmation: z.boolean().optional(),
  smsShipped: z.boolean().optional(),
  smsOutForDelivery: z.boolean().optional(),
  smsDelivered: z.boolean().optional(),
});

type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

// ============================================================================
// Router
// ============================================================================

const notificationPreferencesApp = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
notificationPreferencesApp.use("*", requireAuth);

/**
 * GET /api/notification-preferences
 * Get current user's notification preferences
 *
 * Returns existing preferences or creates default preferences if none exist.
 */
notificationPreferencesApp.get("/", async (c) => {
  const user = c.get("user");

  try {
    // Try to find existing preferences
    let preferences = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, user.id),
    });

    // If no preferences exist, create defaults
    if (!preferences) {
      const [created] = await db
        .insert(notificationPreferences)
        .values({
          userId: user.id,
          // Default preferences: email enabled, SMS disabled
          emailOrderConfirmation: true,
          emailShipped: true,
          emailOutForDelivery: true,
          emailDelivered: true,
          smsOrderConfirmation: false,
          smsShipped: false,
          smsOutForDelivery: false,
          smsDelivered: false,
        })
        .returning();

      preferences = created;
    }

    return c.json({
      preferences: formatPreferences(preferences),
    });
  } catch (error) {
    console.error("[NotificationPreferences] Error getting preferences:", error);
    return c.json(
      { error: "Failed to get notification preferences", code: "GET_ERROR" },
      500
    );
  }
});

/**
 * PATCH /api/notification-preferences
 * Update notification preferences
 *
 * Only provided fields will be updated. Returns the updated preferences.
 */
notificationPreferencesApp.patch(
  "/",
  zValidator("json", updatePreferencesSchema),
  async (c) => {
    const user = c.get("user");
    const updates = c.req.valid("json");

    // Check if there's anything to update
    if (Object.keys(updates).length === 0) {
      return c.json(
        { error: "No preferences to update", code: "NO_UPDATES" },
        400
      );
    }

    try {
      // Check if preferences exist
      const existing = await db.query.notificationPreferences.findFirst({
        where: eq(notificationPreferences.userId, user.id),
      });

      let preferences: NotificationPreference;

      if (!existing) {
        // Create new preferences with updates
        const [created] = await db
          .insert(notificationPreferences)
          .values({
            userId: user.id,
            // Defaults
            emailOrderConfirmation: true,
            emailShipped: true,
            emailOutForDelivery: true,
            emailDelivered: true,
            smsOrderConfirmation: false,
            smsShipped: false,
            smsOutForDelivery: false,
            smsDelivered: false,
            // Apply updates
            ...updates,
          })
          .returning();

        preferences = created;
      } else {
        // Update existing preferences
        const [updated] = await db
          .update(notificationPreferences)
          .set(updates)
          .where(eq(notificationPreferences.userId, user.id))
          .returning();

        preferences = updated;
      }

      return c.json({
        preferences: formatPreferences(preferences),
        message: "Notification preferences updated",
      });
    } catch (error) {
      console.error("[NotificationPreferences] Error updating preferences:", error);
      return c.json(
        { error: "Failed to update notification preferences", code: "UPDATE_ERROR" },
        500
      );
    }
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format preferences for API response
 */
function formatPreferences(prefs: NotificationPreference) {
  return {
    email: {
      orderConfirmation: prefs.emailOrderConfirmation,
      shipped: prefs.emailShipped,
      outForDelivery: prefs.emailOutForDelivery,
      delivered: prefs.emailDelivered,
    },
    sms: {
      orderConfirmation: prefs.smsOrderConfirmation,
      shipped: prefs.smsShipped,
      outForDelivery: prefs.smsOutForDelivery,
      delivered: prefs.smsDelivered,
    },
    updatedAt: prefs.updatedAt,
  };
}

export { notificationPreferencesApp };
