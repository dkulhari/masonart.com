/**
 * Returns Database Schema Tests
 *
 * Tests for return policies and return requests database tables.
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
  returnPolicies,
  returnRequests,
  returnReasonEnum,
  returnStatusEnum,
  refundTypeEnum,
  type ReturnReason,
  type ReturnStatus,
  type RefundType,
  type ReturnPolicy,
  type ReturnRequest,
} from "../../src/database/schema/returns";

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

    console.log("✅ Database connection established for returns schema tests");
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

describe("Return Policies Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have return_policies table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'return_policies'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'return_policies'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("description");
      expect(columnNames).toContain("days_allowed");
      expect(columnNames).toContain("condition_required");
      expect(columnNames).toContain("refund_type");
      expect(columnNames).toContain("refund_percentage");
      expect(columnNames).toContain("is_active");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    dbTest("should have id as primary key", async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'return_policies' AND constraint_type = 'PRIMARY KEY'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have is_active default to true", async () => {
      const result = await client!`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'return_policies' AND column_name = 'is_active'
      `;
      expect(result.length).toBe(1);
      expect(result[0].column_default).toBe("true");
    });

    dbTest("should have refund_percentage default to 100", async () => {
      const result = await client!`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'return_policies' AND column_name = 'refund_percentage'
      `;
      expect(result.length).toBe(1);
      expect(result[0].column_default).toBe("100");
    });
  });

  describe("Refund Type Enum", () => {
    dbTest("should have refund_type enum with correct values", async () => {
      const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'refund_type'
        ORDER BY enumsortorder
      `;

      const enumValues = result.map((row: any) => row.enumlabel);
      expect(enumValues).toContain("full");
      expect(enumValues).toContain("partial");
      expect(enumValues).toContain("store_credit");
      expect(enumValues).toHaveLength(3);
    });

    it("should export refundTypeEnum with correct enumValues", () => {
      expect(refundTypeEnum.enumValues).toContain("full");
      expect(refundTypeEnum.enumValues).toContain("partial");
      expect(refundTypeEnum.enumValues).toContain("store_credit");
      expect(refundTypeEnum.enumValues).toHaveLength(3);
    });

    it("should export RefundType type with correct values", () => {
      const validTypes: RefundType[] = ["full", "partial", "store_credit"];
      expect(validTypes).toHaveLength(3);
    });
  });

  describe("Indexes", () => {
    dbTest("should have indexes defined", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'return_policies'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("return_policies_is_active_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export returnPolicies table schema", () => {
      expect(returnPolicies).toBeDefined();
      const columns = Object.keys(returnPolicies);
      expect(columns).toContain("id");
      expect(columns).toContain("name");
      expect(columns).toContain("daysAllowed");
      expect(columns).toContain("refundType");
      expect(columns).toContain("refundPercentage");
      expect(columns).toContain("isActive");
    });

    it("should have proper types", () => {
      const policy: Partial<ReturnPolicy> = {
        name: "Standard",
        daysAllowed: 30,
        refundType: "full",
      };
      expect(policy.name).toBe("Standard");
    });
  });
});

describe("Return Requests Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have return_requests table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'return_requests'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'return_requests'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("order_id");
      expect(columnNames).toContain("user_id");
      expect(columnNames).toContain("reason");
      expect(columnNames).toContain("reason_details");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("requested_at");
      expect(columnNames).toContain("approved_at");
      expect(columnNames).toContain("processed_at");
      expect(columnNames).toContain("refund_amount");
      expect(columnNames).toContain("admin_notes");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    dbTest("should have foreign key to orders", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'return_requests'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'orders'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have foreign key to users", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'return_requests'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'user'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have ON DELETE CASCADE for order_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'return_requests'
          AND kcu.column_name = 'order_id'
      `;
      expect(result.length).toBe(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });

    dbTest("should have ON DELETE CASCADE for user_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'return_requests'
          AND kcu.column_name = 'user_id'
      `;
      expect(result.length).toBe(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });
  });

  describe("Return Reason Enum", () => {
    dbTest("should have return_reason enum with correct values", async () => {
      const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'return_reason'
        ORDER BY enumsortorder
      `;

      const enumValues = result.map((row: any) => row.enumlabel);
      expect(enumValues).toContain("defective");
      expect(enumValues).toContain("wrong_item");
      expect(enumValues).toContain("not_as_described");
      expect(enumValues).toContain("changed_mind");
      expect(enumValues).toContain("other");
      expect(enumValues).toHaveLength(5);
    });

    it("should export returnReasonEnum with correct enumValues", () => {
      expect(returnReasonEnum.enumValues).toContain("defective");
      expect(returnReasonEnum.enumValues).toContain("wrong_item");
      expect(returnReasonEnum.enumValues).toContain("not_as_described");
      expect(returnReasonEnum.enumValues).toContain("changed_mind");
      expect(returnReasonEnum.enumValues).toContain("other");
      expect(returnReasonEnum.enumValues).toHaveLength(5);
    });

    it("should export ReturnReason type with correct values", () => {
      const validReasons: ReturnReason[] = [
        "defective",
        "wrong_item",
        "not_as_described",
        "changed_mind",
        "other",
      ];
      expect(validReasons).toHaveLength(5);
    });
  });

  describe("Return Status Enum", () => {
    dbTest("should have return_status enum with correct values", async () => {
      const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'return_status'
        ORDER BY enumsortorder
      `;

      const enumValues = result.map((row: any) => row.enumlabel);
      expect(enumValues).toContain("pending");
      expect(enumValues).toContain("approved");
      expect(enumValues).toContain("rejected");
      expect(enumValues).toContain("shipped_back");
      expect(enumValues).toContain("received");
      expect(enumValues).toContain("refunded");
      expect(enumValues).toContain("closed");
      expect(enumValues).toHaveLength(7);
    });

    it("should export returnStatusEnum with correct enumValues", () => {
      expect(returnStatusEnum.enumValues).toContain("pending");
      expect(returnStatusEnum.enumValues).toContain("approved");
      expect(returnStatusEnum.enumValues).toContain("rejected");
      expect(returnStatusEnum.enumValues).toContain("shipped_back");
      expect(returnStatusEnum.enumValues).toContain("received");
      expect(returnStatusEnum.enumValues).toContain("refunded");
      expect(returnStatusEnum.enumValues).toContain("closed");
      expect(returnStatusEnum.enumValues).toHaveLength(7);
    });

    it("should export ReturnStatus type with correct values", () => {
      const validStatuses: ReturnStatus[] = [
        "pending",
        "approved",
        "rejected",
        "shipped_back",
        "received",
        "refunded",
        "closed",
      ];
      expect(validStatuses).toHaveLength(7);
    });
  });

  describe("Indexes", () => {
    dbTest("should have indexes defined for common queries", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'return_requests'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("return_requests_order_id_idx");
      expect(indexNames).toContain("return_requests_user_id_idx");
      expect(indexNames).toContain("return_requests_status_idx");
      expect(indexNames).toContain("return_requests_requested_at_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export returnRequests table schema", () => {
      expect(returnRequests).toBeDefined();
      const columns = Object.keys(returnRequests);
      expect(columns).toContain("id");
      expect(columns).toContain("orderId");
      expect(columns).toContain("userId");
      expect(columns).toContain("reason");
      expect(columns).toContain("reasonDetails");
      expect(columns).toContain("status");
      expect(columns).toContain("refundAmount");
    });

    it("should have proper types", () => {
      const request: Partial<ReturnRequest> = {
        reason: "defective",
        status: "pending",
      };
      expect(request.reason).toBe("defective");
    });
  });
});
