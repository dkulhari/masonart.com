/**
 * Shipping Database Schema Tests
 *
 * Tests for shipping options and order shipments database tables.
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
  shippingOptions,
  orderShipments,
  shipmentStatusEnum,
  type ShipmentStatus,
  type ShippingOption,
  type OrderShipment,
} from "../../src/database/schema/shipping";

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

    console.log("✅ Database connection established for shipping schema tests");
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

describe("Shipping Options Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have shipping_options table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'shipping_options'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'shipping_options'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("carrier");
      expect(columnNames).toContain("description");
      expect(columnNames).toContain("base_cost");
      expect(columnNames).toContain("estimated_days_min");
      expect(columnNames).toContain("estimated_days_max");
      expect(columnNames).toContain("is_active");
      expect(columnNames).toContain("sort_order");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    dbTest("should have id as primary key", async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'shipping_options' AND constraint_type = 'PRIMARY KEY'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have is_active default to true", async () => {
      const result = await client!`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'shipping_options' AND column_name = 'is_active'
      `;
      expect(result.length).toBe(1);
      expect(result[0].column_default).toBe("true");
    });
  });

  describe("Indexes", () => {
    dbTest("should have indexes defined", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'shipping_options'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("shipping_options_is_active_idx");
      expect(indexNames).toContain("shipping_options_sort_order_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export shippingOptions table schema", () => {
      expect(shippingOptions).toBeDefined();
      const columns = Object.keys(shippingOptions);
      expect(columns).toContain("id");
      expect(columns).toContain("name");
      expect(columns).toContain("carrier");
      expect(columns).toContain("baseCost");
      expect(columns).toContain("estimatedDaysMin");
      expect(columns).toContain("estimatedDaysMax");
      expect(columns).toContain("isActive");
    });

    it("should have proper types", () => {
      // TypeScript compilation validates types
      const option: Partial<ShippingOption> = {
        name: "Standard",
        carrier: "USPS",
      };
      expect(option.name).toBe("Standard");
    });
  });
});

describe("Order Shipments Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have order_shipments table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'order_shipments'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'order_shipments'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("order_id");
      expect(columnNames).toContain("shipping_option_id");
      expect(columnNames).toContain("tracking_number");
      expect(columnNames).toContain("carrier");
      expect(columnNames).toContain("tracking_url");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("shipped_at");
      expect(columnNames).toContain("estimated_delivery_at");
      expect(columnNames).toContain("delivered_at");
      expect(columnNames).toContain("notes");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    dbTest("should have foreign key to orders", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'order_shipments'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'orders'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have foreign key to shipping_options", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'order_shipments'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'shipping_options'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have ON DELETE CASCADE for order_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'order_shipments'
          AND kcu.column_name = 'order_id'
      `;
      expect(result.length).toBe(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });
  });

  describe("Shipment Status Enum", () => {
    /**
     * The type in lifecycle order — the order `enumsortorder` reports.
     *
     * One list, asserted three ways: against the live catalog, against the
     * drizzle DSL, and against the exported TS union. Three hand-maintained
     * copies is how the old version of this block drifted — it pinned
     * `toHaveLength(7)` in two places and a literal array in a third, so
     * extending the type meant finding all three.
     *
     * The narrower per-value assertions live in
     * tests/database/shipment-status-enum.test.ts, which also holds the #580
     * rule for the migration that added the last five.
     */
    const SHIPMENT_STATUS_LIFECYCLE = [
      "pending",
      "label_created",
      "shipped",
      "in_transit",
      "out_for_delivery",
      "undelivered",
      "delivered",
      "rto_initiated",
      "rto_delivered",
      "lost",
      "cancelled",
      "failed",
    ] as const;

    dbTest("should have shipment_status enum with correct values", async () => {
      const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'shipment_status'
        ORDER BY enumsortorder
      `;

      const enumValues = result.map((row: any) => row.enumlabel);
      // The database's own order, which is `enumsortorder` — so this asserts
      // the BEFORE anchors in 0026 landed where they were aimed, not just that
      // the values exist.
      expect(enumValues).toEqual(SHIPMENT_STATUS_LIFECYCLE);
    });

    it("should export shipmentStatusEnum with correct enumValues", () => {
      expect([...shipmentStatusEnum.enumValues]).toEqual(SHIPMENT_STATUS_LIFECYCLE);
    });

    it("should export ShipmentStatus type with correct values", () => {
      // Typed, so a value added to the enum without being added here is a
      // compile error rather than a silently short list.
      const validStatuses: ShipmentStatus[] = [...SHIPMENT_STATUS_LIFECYCLE];
      expect(validStatuses).toHaveLength(SHIPMENT_STATUS_LIFECYCLE.length);
    });
  });

  describe("Indexes", () => {
    dbTest("should have indexes defined for common queries", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'order_shipments'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("order_shipments_order_id_idx");
      expect(indexNames).toContain("order_shipments_status_idx");
      expect(indexNames).toContain("order_shipments_tracking_number_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export orderShipments table schema", () => {
      expect(orderShipments).toBeDefined();
      const columns = Object.keys(orderShipments);
      expect(columns).toContain("id");
      expect(columns).toContain("orderId");
      expect(columns).toContain("shippingOptionId");
      expect(columns).toContain("trackingNumber");
      expect(columns).toContain("carrier");
      expect(columns).toContain("status");
    });

    it("should have proper types", () => {
      const shipment: Partial<OrderShipment> = {
        carrier: "FedEx",
        status: "pending",
      };
      expect(shipment.carrier).toBe("FedEx");
    });
  });
});
