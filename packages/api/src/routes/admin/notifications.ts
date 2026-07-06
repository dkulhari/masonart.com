/**
 * Admin Notifications API Routes
 *
 * Provides admin API endpoints for notification management:
 * - POST /api/admin/orders/:orderId/notify - Trigger notification for an order
 * - GET /api/admin/orders/:orderId/notifications - Get notification history
 * - POST /api/admin/notifications/:id/retry - Retry a failed notification
 *
 * All endpoints require admin authentication.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "../../database";
import { orders } from "../../database/schema/orders";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  sendOrderNotification,
  getOrderNotifications,
  retryNotification,
} from "../../services/notifications";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for triggering a notification
 */
const triggerNotificationSchema = z.object({
  type: z.enum(["order_confirmation", "shipped", "out_for_delivery", "delivered"]),
  forceChannels: z.array(z.enum(["email", "sms"])).optional(),
});

// ============================================================================
// Router
// ============================================================================

const adminNotificationsApp = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminNotificationsApp.use("*", requireAuth);
adminNotificationsApp.use("*", requireAdmin);

/**
 * POST /api/admin/orders/:orderId/notify
 * Trigger a notification for an order
 *
 * Body:
 * - type: Notification type (order_confirmation, shipped, etc.)
 * - forceChannels: Optional array of channels to force (overrides preferences)
 */
adminNotificationsApp.post(
  "/orders/:orderId/notify",
  zValidator("json", triggerNotificationSchema),
  async (c) => {
    const { orderId } = c.req.param();
    const { type, forceChannels } = c.req.valid("json");

    try {
      // Verify order exists
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        columns: { id: true, orderNumber: true },
      });

      if (!order) {
        return c.json(
          { error: "Order not found", code: "ORDER_NOT_FOUND" },
          404
        );
      }

      // Send notification
      const result = await sendOrderNotification({
        orderId,
        type,
        forceChannels,
      });

      return c.json({
        success: result.success,
        orderNumber: order.orderNumber,
        notificationType: type,
        channels: result.channels,
        notificationIds: result.notificationIds,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error) {
      console.error("[AdminNotifications] Error triggering notification:", error);
      return c.json(
        { error: "Failed to trigger notification", code: "TRIGGER_ERROR" },
        500
      );
    }
  }
);

/**
 * GET /api/admin/orders/:orderId/notifications
 * Get notification history for an order
 */
adminNotificationsApp.get("/orders/:orderId/notifications", async (c) => {
  const { orderId } = c.req.param();

  try {
    // Verify order exists
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { id: true, orderNumber: true },
    });

    if (!order) {
      return c.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        404
      );
    }

    const notificationHistory = await getOrderNotifications(orderId);

    return c.json({
      orderNumber: order.orderNumber,
      notifications: notificationHistory.map((n) => ({
        id: n.id,
        type: n.type,
        channel: n.channel,
        status: n.status,
        recipientEmail: n.recipientEmail,
        recipientPhone: n.recipientPhone,
        sentAt: n.sentAt,
        errorMessage: n.errorMessage,
        createdAt: n.createdAt,
      })),
    });
  } catch (error) {
    console.error("[AdminNotifications] Error fetching notifications:", error);
    return c.json(
      { error: "Failed to fetch notifications", code: "FETCH_ERROR" },
      500
    );
  }
});

/**
 * POST /api/admin/notifications/:id/retry
 * Retry a failed notification
 */
adminNotificationsApp.post("/notifications/:id/retry", async (c) => {
  const { id } = c.req.param();

  try {
    const result = await retryNotification(id);

    if (!result.success && result.errors.includes("Notification not found")) {
      return c.json(
        { error: "Notification not found", code: "NOT_FOUND" },
        404
      );
    }

    return c.json({
      success: result.success,
      channels: result.channels,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[AdminNotifications] Error retrying notification:", error);
    return c.json(
      { error: "Failed to retry notification", code: "RETRY_ERROR" },
      500
    );
  }
});

export { adminNotificationsApp };
