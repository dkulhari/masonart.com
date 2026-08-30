/**
 * Notifications Database Schema Tests
 *
 * Tests for notifications and notification preferences database tables.
 * Validates schema structure, enum values, and relations.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', all tests are skipped (useful for CI without database).
 * Tests also gracefully skip when database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { resolveDatabaseUrl } from "../../src/config/database-url";
import {
  notifications,
  notificationPreferences,
  notificationTypeEnum,
  notificationChannelEnum,
  notificationStatusEnum,
  type Notification,
  type NotificationPreference,
  type NotificationType,
  type NotificationChannel,
  type NotificationStatus,
} from "../../src/database/schema/notifications";

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === "true";

// Track database availability
let isDatabaseAvailable = false;

let client: ReturnType<typeof postgres> | null = null;

beforeAll(async () => {
  if (SKIP_TESTS) {
    console.log("⏭️  Skipping database tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  try {
    // Use test database URL or fall back to development
    const databaseUrl = resolveDatabaseUrl();
    client = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });

    // Test connection
    await client`SELECT 1`;
    isDatabaseAvailable = true;

    console.log(
      "✅ Database connection established for notifications schema tests"
    );
  } catch (error) {
    console.log("⚠️  Database not available, runtime tests will be skipped");
    isDatabaseAvailable = false;
    if (client) {
      try {
        await client.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      client = null;
    }
  }
});

afterAll(async () => {
  if (!isDatabaseAvailable || !client) return;

  try {
    await client.end();
  } catch (error) {
    // Ignore cleanup errors
  }
});

// For tests that need DB, we'll use a wrapper that checks availability
const dbTest = (name: string, fn: () => Promise<void>) => {
  it(name, async () => {
    if (SKIP_TESTS) {
      console.log(`⏭️  Skipping: ${name} (SKIP_DB_RUNTIME_TESTS=true)`);
      return;
    }
    if (!isDatabaseAvailable) {
      console.log(`⏭️  Skipping: ${name} (database not available)`);
      return;
    }
    await fn();
  });
};

describe("Notifications Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have notifications table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notifications'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'notifications'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("order_id");
      expect(columnNames).toContain("type");
      expect(columnNames).toContain("channel");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("recipient_email");
      expect(columnNames).toContain("recipient_phone");
      expect(columnNames).toContain("sent_at");
      expect(columnNames).toContain("error_message");
      expect(columnNames).toContain("external_id");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    dbTest("should have id as primary key", async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'notifications' AND constraint_type = 'PRIMARY KEY'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have foreign key to orders", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'notifications'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'orders'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have ON DELETE CASCADE for order_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'notifications'
          AND kcu.column_name = 'order_id'
      `;
      expect(result.length).toBe(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });

    dbTest("should have status default to pending", async () => {
      const result = await client!`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'notifications' AND column_name = 'status'
      `;
      expect(result.length).toBe(1);
      expect(result[0].column_default).toContain("pending");
    });
  });

  describe("Notification Type Enum", () => {
    dbTest("should have notification_type enum with correct values", async () => {
      const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'notification_type'
        ORDER BY enumsortorder
      `;

      const enumValues = result.map((row: any) => row.enumlabel);
      expect(enumValues).toContain("order_confirmation");
      expect(enumValues).toContain("shipped");
      expect(enumValues).toContain("out_for_delivery");
      expect(enumValues).toContain("delivered");
      expect(enumValues).toHaveLength(4);
    });

    it("should export notificationTypeEnum with correct enumValues", () => {
      expect(notificationTypeEnum.enumValues).toContain("order_confirmation");
      expect(notificationTypeEnum.enumValues).toContain("shipped");
      expect(notificationTypeEnum.enumValues).toContain("out_for_delivery");
      expect(notificationTypeEnum.enumValues).toContain("delivered");
      expect(notificationTypeEnum.enumValues).toHaveLength(4);
    });

    it("should export NotificationType type with correct values", () => {
      const validTypes: NotificationType[] = [
        "order_confirmation",
        "shipped",
        "out_for_delivery",
        "delivered",
      ];
      expect(validTypes).toHaveLength(4);
    });
  });

  describe("Notification Channel Enum", () => {
    dbTest(
      "should have notification_channel enum with correct values",
      async () => {
        const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'notification_channel'
        ORDER BY enumsortorder
      `;

        const enumValues = result.map((row: any) => row.enumlabel);
        expect(enumValues).toContain("email");
        expect(enumValues).toContain("sms");
        expect(enumValues).toHaveLength(2);
      }
    );

    it("should export notificationChannelEnum with correct enumValues", () => {
      expect(notificationChannelEnum.enumValues).toContain("email");
      expect(notificationChannelEnum.enumValues).toContain("sms");
      expect(notificationChannelEnum.enumValues).toHaveLength(2);
    });

    it("should export NotificationChannel type with correct values", () => {
      const validChannels: NotificationChannel[] = ["email", "sms"];
      expect(validChannels).toHaveLength(2);
    });
  });

  describe("Notification Status Enum", () => {
    dbTest(
      "should have notification_status enum with correct values",
      async () => {
        const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'notification_status'
        ORDER BY enumsortorder
      `;

        const enumValues = result.map((row: any) => row.enumlabel);
        expect(enumValues).toContain("pending");
        expect(enumValues).toContain("sent");
        expect(enumValues).toContain("failed");
        expect(enumValues).toHaveLength(3);
      }
    );

    it("should export notificationStatusEnum with correct enumValues", () => {
      expect(notificationStatusEnum.enumValues).toContain("pending");
      expect(notificationStatusEnum.enumValues).toContain("sent");
      expect(notificationStatusEnum.enumValues).toContain("failed");
      expect(notificationStatusEnum.enumValues).toHaveLength(3);
    });

    it("should export NotificationStatus type with correct values", () => {
      const validStatuses: NotificationStatus[] = ["pending", "sent", "failed"];
      expect(validStatuses).toHaveLength(3);
    });
  });

  describe("Indexes", () => {
    dbTest("should have indexes defined for common queries", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'notifications'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("notifications_order_id_idx");
      expect(indexNames).toContain("notifications_status_idx");
      expect(indexNames).toContain("notifications_type_idx");
      expect(indexNames).toContain("notifications_channel_idx");
      expect(indexNames).toContain("notifications_created_at_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export notifications table schema", () => {
      expect(notifications).toBeDefined();
      const columns = Object.keys(notifications);
      expect(columns).toContain("id");
      expect(columns).toContain("orderId");
      expect(columns).toContain("type");
      expect(columns).toContain("channel");
      expect(columns).toContain("status");
      expect(columns).toContain("sentAt");
      expect(columns).toContain("errorMessage");
    });

    it("should have proper types", () => {
      const notification: Partial<Notification> = {
        type: "order_confirmation",
        channel: "email",
        status: "pending",
      };
      expect(notification.type).toBe("order_confirmation");
      expect(notification.channel).toBe("email");
      expect(notification.status).toBe("pending");
    });
  });
});

describe("Notification Preferences Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have notification_preferences table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notification_preferences'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'notification_preferences'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("user_id");
      expect(columnNames).toContain("email_order_confirmation");
      expect(columnNames).toContain("email_shipped");
      expect(columnNames).toContain("email_out_for_delivery");
      expect(columnNames).toContain("email_delivered");
      expect(columnNames).toContain("sms_order_confirmation");
      expect(columnNames).toContain("sms_shipped");
      expect(columnNames).toContain("sms_out_for_delivery");
      expect(columnNames).toContain("sms_delivered");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    dbTest("should have id as primary key", async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'notification_preferences' AND constraint_type = 'PRIMARY KEY'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have unique constraint on user_id", async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'notification_preferences' AND constraint_type = 'UNIQUE'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    dbTest("should have foreign key to user table", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'notification_preferences'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'user'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have ON DELETE CASCADE for user_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'notification_preferences'
          AND kcu.column_name = 'user_id'
      `;
      expect(result.length).toBe(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });

    dbTest("should have email preferences default to true", async () => {
      const emailColumns = [
        "email_order_confirmation",
        "email_shipped",
        "email_out_for_delivery",
        "email_delivered",
      ];

      for (const column of emailColumns) {
        const result = await client!`
          SELECT column_default
          FROM information_schema.columns
          WHERE table_name = 'notification_preferences' AND column_name = ${column}
        `;
        expect(result.length).toBe(1);
        expect(result[0].column_default).toBe("true");
      }
    });

    dbTest("should have SMS preferences default to false", async () => {
      const smsColumns = [
        "sms_order_confirmation",
        "sms_shipped",
        "sms_out_for_delivery",
        "sms_delivered",
      ];

      for (const column of smsColumns) {
        const result = await client!`
          SELECT column_default
          FROM information_schema.columns
          WHERE table_name = 'notification_preferences' AND column_name = ${column}
        `;
        expect(result.length).toBe(1);
        expect(result[0].column_default).toBe("false");
      }
    });
  });

  describe("Indexes", () => {
    dbTest("should have user_id index", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'notification_preferences'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("notification_preferences_user_id_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export notificationPreferences table schema", () => {
      expect(notificationPreferences).toBeDefined();
      const columns = Object.keys(notificationPreferences);
      expect(columns).toContain("id");
      expect(columns).toContain("userId");
      expect(columns).toContain("emailOrderConfirmation");
      expect(columns).toContain("emailShipped");
      expect(columns).toContain("emailOutForDelivery");
      expect(columns).toContain("emailDelivered");
      expect(columns).toContain("smsOrderConfirmation");
      expect(columns).toContain("smsShipped");
      expect(columns).toContain("smsOutForDelivery");
      expect(columns).toContain("smsDelivered");
    });

    it("should have proper types", () => {
      const preferences: Partial<NotificationPreference> = {
        emailOrderConfirmation: true,
        emailShipped: true,
        smsOrderConfirmation: false,
        smsShipped: false,
      };
      expect(preferences.emailOrderConfirmation).toBe(true);
      expect(preferences.smsOrderConfirmation).toBe(false);
    });
  });
});
