// Notifications database schema for Order Tracking & Notifications feature
// Following the patterns defined in the existing schema files

import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { orders } from "./orders";
import { users } from "./users";

// ============================================================================
// Enums
// ============================================================================

/**
 * Notification type enum for different notification events
 */
export const notificationTypeEnum = pgEnum("notification_type", [
  "order_confirmation", // Order placed/confirmed
  "shipped", // Order has been shipped
  "out_for_delivery", // Order is out for delivery
  "delivered", // Order has been delivered
]);

/**
 * Notification channel enum for delivery method
 */
export const notificationChannelEnum = pgEnum("notification_channel", [
  "email", // Email notification
  "sms", // SMS notification
]);

/**
 * Notification status enum for tracking delivery status
 */
export const notificationStatusEnum = pgEnum("notification_status", [
  "pending", // Notification queued, not yet sent
  "sent", // Notification successfully delivered
  "failed", // Notification delivery failed
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Notifications table - logs all order-related notifications
 * Tracks notification type, channel, status, and delivery details
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),

    // Notification details
    type: notificationTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    status: notificationStatusEnum("status").default("pending").notNull(),

    // Recipient info (snapshot at time of notification)
    recipientEmail: text("recipient_email"),
    recipientPhone: text("recipient_phone"),

    // Delivery tracking
    sentAt: timestamp("sent_at"),
    errorMessage: text("error_message"),

    // External service reference
    externalId: text("external_id"), // ID from email/SMS provider

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orderIdIdx: index("notifications_order_id_idx").on(table.orderId),
    statusIdx: index("notifications_status_idx").on(table.status),
    typeIdx: index("notifications_type_idx").on(table.type),
    channelIdx: index("notifications_channel_idx").on(table.channel),
    createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
  })
);

/**
 * Notification preferences table - user-specific notification settings
 * Controls which order tracking notifications a user receives
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    // Email notification preferences (default: true)
    emailOrderConfirmation: boolean("email_order_confirmation")
      .default(true)
      .notNull(),
    emailShipped: boolean("email_shipped").default(true).notNull(),
    emailOutForDelivery: boolean("email_out_for_delivery")
      .default(true)
      .notNull(),
    emailDelivered: boolean("email_delivered").default(true).notNull(),

    // SMS notification preferences (default: false)
    smsOrderConfirmation: boolean("sms_order_confirmation")
      .default(false)
      .notNull(),
    smsShipped: boolean("sms_shipped").default(false).notNull(),
    smsOutForDelivery: boolean("sms_out_for_delivery").default(false).notNull(),
    smsDelivered: boolean("sms_delivered").default(false).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    userIdUnique: unique("notification_preferences_user_id_unique").on(
      table.userId
    ),
    userIdIdx: index("notification_preferences_user_id_idx").on(table.userId),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Notifications relations
 */
export const notificationsRelations = relations(notifications, ({ one }) => ({
  order: one(orders, {
    fields: [notifications.orderId],
    references: [orders.id],
  }),
}));

/**
 * Notification preferences relations
 */
export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.userId],
      references: [users.id],
    }),
  })
);

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreferences.$inferInsert;

export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
export type NotificationChannel =
  (typeof notificationChannelEnum.enumValues)[number];
export type NotificationStatus =
  (typeof notificationStatusEnum.enumValues)[number];
