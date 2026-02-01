/**
 * Notification Orchestration Service
 *
 * Manages sending order-related notifications via email and SMS.
 * Respects user notification preferences and logs all notifications to the database.
 */

import { eq } from "drizzle-orm";
import { db } from "../database";
import {
  notifications,
  notificationPreferences,
  type NotificationType,
  type NotificationChannel,
  type NewNotification,
} from "../database/schema/notifications";
import { orders, type Order } from "../database/schema/orders";
import { sendEmail } from "./email";
import {
  getOrderConfirmationTemplate,
  getShippedTemplate,
  getOutForDeliveryTemplate,
  getDeliveredTemplate,
} from "./email-templates";

// ============================================================================
// Types
// ============================================================================

export interface SendNotificationOptions {
  orderId: string;
  type: NotificationType;
  /** Override user preferences (for critical notifications) */
  forceChannels?: NotificationChannel[];
}

export interface NotificationResult {
  success: boolean;
  channels: {
    email?: { sent: boolean; messageId?: string; error?: string };
    sms?: { sent: boolean; error?: string };
  };
  notificationIds: string[];
  errors: string[];
}

interface UserPreferences {
  emailOrderConfirmation: boolean;
  emailShipped: boolean;
  emailOutForDelivery: boolean;
  emailDelivered: boolean;
  smsOrderConfirmation: boolean;
  smsShipped: boolean;
  smsOutForDelivery: boolean;
  smsDelivered: boolean;
}

// Default preferences for users without saved preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  emailOrderConfirmation: true,
  emailShipped: true,
  emailOutForDelivery: true,
  emailDelivered: true,
  smsOrderConfirmation: false,
  smsShipped: false,
  smsOutForDelivery: false,
  smsDelivered: false,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get user notification preferences
 */
async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, userId),
  });

  if (!prefs) {
    return DEFAULT_PREFERENCES;
  }

  return {
    emailOrderConfirmation: prefs.emailOrderConfirmation,
    emailShipped: prefs.emailShipped,
    emailOutForDelivery: prefs.emailOutForDelivery,
    emailDelivered: prefs.emailDelivered,
    smsOrderConfirmation: prefs.smsOrderConfirmation,
    smsShipped: prefs.smsShipped,
    smsOutForDelivery: prefs.smsOutForDelivery,
    smsDelivered: prefs.smsDelivered,
  };
}

/**
 * Determine which channels should be used for a notification type
 */
function getEnabledChannels(
  type: NotificationType,
  prefs: UserPreferences
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];

  switch (type) {
    case "order_confirmation":
      if (prefs.emailOrderConfirmation) channels.push("email");
      if (prefs.smsOrderConfirmation) channels.push("sms");
      break;
    case "shipped":
      if (prefs.emailShipped) channels.push("email");
      if (prefs.smsShipped) channels.push("sms");
      break;
    case "out_for_delivery":
      if (prefs.emailOutForDelivery) channels.push("email");
      if (prefs.smsOutForDelivery) channels.push("sms");
      break;
    case "delivered":
      if (prefs.emailDelivered) channels.push("email");
      if (prefs.smsDelivered) channels.push("sms");
      break;
  }

  return channels;
}

/**
 * Get email template for notification type
 */
function getEmailTemplate(
  type: NotificationType,
  order: Order
): { subject: string; html: string } {
  switch (type) {
    case "order_confirmation":
      return getOrderConfirmationTemplate(order);
    case "shipped":
      return getShippedTemplate(order);
    case "out_for_delivery":
      return getOutForDeliveryTemplate(order);
    case "delivered":
      return getDeliveredTemplate(order);
  }
}

/**
 * Get SMS message for notification type
 */
function getSmsMessage(type: NotificationType, order: Order): string {
  const orderNumber = order.orderNumber;

  switch (type) {
    case "order_confirmation":
      return `MasonArt: Your order ${orderNumber} is confirmed! We'll notify you when it ships.`;
    case "shipped":
      return `MasonArt: Your order ${orderNumber} has shipped! Track: ${order.shippingDetails?.trackingUrl || "masonart.com/orders"}`;
    case "out_for_delivery":
      return `MasonArt: Your order ${orderNumber} is out for delivery today!`;
    case "delivered":
      return `MasonArt: Your order ${orderNumber} has been delivered. Enjoy your art!`;
  }
}

/**
 * Log notification to database
 */
async function logNotification(
  notification: NewNotification
): Promise<string | null> {
  try {
    const [inserted] = await db
      .insert(notifications)
      .values(notification)
      .returning({ id: notifications.id });
    return inserted?.id || null;
  } catch (error) {
    console.error("[Notifications] Failed to log notification:", error);
    return null;
  }
}

/**
 * Update notification status
 */
async function updateNotificationStatus(
  notificationId: string,
  status: "sent" | "failed",
  errorMessage?: string,
  externalId?: string
): Promise<void> {
  try {
    await db
      .update(notifications)
      .set({
        status,
        sentAt: status === "sent" ? new Date() : undefined,
        errorMessage,
        externalId,
      })
      .where(eq(notifications.id, notificationId));
  } catch (error) {
    console.error("[Notifications] Failed to update notification status:", error);
  }
}

// ============================================================================
// Main Service Functions
// ============================================================================

/**
 * Send order notification via appropriate channels
 *
 * @param options - Notification options including order ID and type
 * @returns Result with success status and channel details
 */
export async function sendOrderNotification(
  options: SendNotificationOptions
): Promise<NotificationResult> {
  const { orderId, type, forceChannels } = options;
  const result: NotificationResult = {
    success: false,
    channels: {},
    notificationIds: [],
    errors: [],
  };

  try {
    // Fetch order with user info
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        user: true,
      },
    });

    if (!order) {
      result.errors.push(`Order not found: ${orderId}`);
      return result;
    }

    // Determine recipient info
    const recipientEmail = order.user?.email || order.guestEmail;
    const recipientPhone = order.user?.phone || order.guestPhone;

    if (!recipientEmail && !recipientPhone) {
      result.errors.push("No contact information available for order");
      return result;
    }

    // Get user preferences (use defaults for guests)
    const preferences = order.userId
      ? await getUserPreferences(order.userId)
      : DEFAULT_PREFERENCES;

    // Determine which channels to use
    const channels = forceChannels || getEnabledChannels(type, preferences);

    if (channels.length === 0) {
      result.success = true; // No channels enabled is not an error
      return result;
    }

    // Send via each enabled channel
    for (const channel of channels) {
      // Create notification log entry
      const notificationId = await logNotification({
        orderId,
        type,
        channel,
        status: "pending",
        recipientEmail: channel === "email" ? recipientEmail : undefined,
        recipientPhone: channel === "sms" ? recipientPhone : undefined,
      });

      if (notificationId) {
        result.notificationIds.push(notificationId);
      }

      if (channel === "email" && recipientEmail) {
        const template = getEmailTemplate(type, order);
        const emailResult = await sendEmail({
          to: recipientEmail,
          subject: template.subject,
          html: template.html,
          tags: [
            { name: "order_id", value: orderId },
            { name: "notification_type", value: type },
          ],
        });

        result.channels.email = {
          sent: emailResult.success,
          messageId: emailResult.messageId,
          error: emailResult.error,
        };

        if (notificationId) {
          await updateNotificationStatus(
            notificationId,
            emailResult.success ? "sent" : "failed",
            emailResult.error,
            emailResult.messageId
          );
        }

        if (!emailResult.success) {
          result.errors.push(`Email failed: ${emailResult.error}`);
        }
      }

      if (channel === "sms" && recipientPhone) {
        // Note: We're using the SMS service which is designed for OTP
        // For transactional SMS, we'd need a different endpoint or service
        // For now, log the message in dev mode
        if (
          process.env.NODE_ENV === "development" ||
          process.env.NODE_ENV === "test"
        ) {
          const message = getSmsMessage(type, order);
          console.log(`[SMS] Dev mode: Would send to ${recipientPhone}`);
          console.log(`[SMS] Message: ${message}`);
          result.channels.sms = { sent: true };

          if (notificationId) {
            await updateNotificationStatus(notificationId, "sent");
          }
        } else {
          // In production, you would integrate with a transactional SMS service
          // For now, mark as not available
          result.channels.sms = {
            sent: false,
            error: "Transactional SMS not yet configured",
          };
          result.errors.push("SMS: Transactional SMS not yet configured");

          if (notificationId) {
            await updateNotificationStatus(
              notificationId,
              "failed",
              "Transactional SMS not yet configured"
            );
          }
        }
      }
    }

    // Overall success if at least one channel succeeded
    result.success =
      result.channels.email?.sent === true ||
      result.channels.sms?.sent === true;

    return result;
  } catch (error) {
    console.error("[Notifications] Error sending notification:", error);
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error"
    );
    return result;
  }
}

/**
 * Send notification for order status change
 * Maps order status to notification type
 */
export async function notifyOrderStatusChange(
  orderId: string,
  newStatus: string
): Promise<NotificationResult | null> {
  // Map order status to notification type
  const statusToNotification: Record<string, NotificationType> = {
    confirmed: "order_confirmation",
    shipped: "shipped",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
  };

  const notificationType = statusToNotification[newStatus];

  if (!notificationType) {
    // Not a status that triggers a notification
    return null;
  }

  return sendOrderNotification({
    orderId,
    type: notificationType,
  });
}

/**
 * Get notification history for an order
 */
export async function getOrderNotifications(orderId: string) {
  return db.query.notifications.findMany({
    where: eq(notifications.orderId, orderId),
    orderBy: (notifications, { desc }) => [desc(notifications.createdAt)],
  });
}

/**
 * Retry a failed notification
 */
export async function retryNotification(
  notificationId: string
): Promise<NotificationResult> {
  const notification = await db.query.notifications.findFirst({
    where: eq(notifications.id, notificationId),
  });

  if (!notification) {
    return {
      success: false,
      channels: {},
      notificationIds: [],
      errors: ["Notification not found"],
    };
  }

  if (notification.status !== "failed") {
    return {
      success: false,
      channels: {},
      notificationIds: [],
      errors: ["Notification is not in failed status"],
    };
  }

  return sendOrderNotification({
    orderId: notification.orderId,
    type: notification.type,
    forceChannels: [notification.channel],
  });
}
