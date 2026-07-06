/**
 * Approvals Database Schema Tests
 *
 * Tests for production approvals, approval photos, and approval comments tables.
 * Validates schema structure, enum values, and relations.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', all tests are skipped (useful for CI without database).
 * Tests also gracefully skip when database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  productionApprovals,
  approvalPhotos,
  approvalComments,
  approvalStatusEnum,
  approvalAuthorTypeEnum,
  type ProductionApproval,
  type ApprovalPhoto,
  type ApprovalComment,
  type ApprovalStatus,
  type ApprovalAuthorType,
} from "../../src/database/schema/approvals";

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === "true";

// Track database availability
let isDatabaseAvailable = false;

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

beforeAll(async () => {
  if (SKIP_TESTS) {
    console.log("⏭️  Skipping database tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  try {
    // Use test database URL or fall back to development
    const databaseUrl =
      process.env.DATABASE_URL ||
      "postgresql://poster_app:dev_password@localhost:5433/poster_app_dev";
    client = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });

    // Test connection
    await client`SELECT 1`;
    isDatabaseAvailable = true;
    db = drizzle(client);

    console.log("✅ Database connection established for approvals schema tests");
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

describe("Production Approvals Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have production_approvals table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'production_approvals'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'production_approvals'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("order_id");
      expect(columnNames).toContain("order_item_id");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("approval_token");
      expect(columnNames).toContain("token_expires_at");
      expect(columnNames).toContain("approved_at");
      expect(columnNames).toContain("approved_by");
      expect(columnNames).toContain("deadline_at");
      expect(columnNames).toContain("reminder_sent_at");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    dbTest("should have id as primary key", async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'production_approvals' AND constraint_type = 'PRIMARY KEY'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have unique constraint on approval_token", async () => {
      const result = await client!`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'production_approvals'
          AND tc.constraint_type = 'UNIQUE'
          AND kcu.column_name = 'approval_token'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have foreign key to orders", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'production_approvals'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'orders'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have foreign key to order_items", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'production_approvals'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'order_items'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have ON DELETE CASCADE for order_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'production_approvals'
          AND kcu.column_name = 'order_id'
      `;
      expect(result.length).toBe(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });

    dbTest("should have status default to pending_upload", async () => {
      const result = await client!`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'production_approvals' AND column_name = 'status'
      `;
      expect(result.length).toBe(1);
      expect(result[0].column_default).toContain("pending_upload");
    });
  });

  describe("Approval Status Enum", () => {
    dbTest("should have approval_status enum with correct values", async () => {
      const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'approval_status'
        ORDER BY enumsortorder
      `;

      const enumValues = result.map((row: any) => row.enumlabel);
      expect(enumValues).toContain("pending_upload");
      expect(enumValues).toContain("pending_approval");
      expect(enumValues).toContain("changes_requested");
      expect(enumValues).toContain("approved");
      expect(enumValues).toContain("expired");
      expect(enumValues).toHaveLength(5);
    });

    it("should export approvalStatusEnum with correct enumValues", () => {
      expect(approvalStatusEnum.enumValues).toContain("pending_upload");
      expect(approvalStatusEnum.enumValues).toContain("pending_approval");
      expect(approvalStatusEnum.enumValues).toContain("changes_requested");
      expect(approvalStatusEnum.enumValues).toContain("approved");
      expect(approvalStatusEnum.enumValues).toContain("expired");
      expect(approvalStatusEnum.enumValues).toHaveLength(5);
    });

    it("should export ApprovalStatus type with correct values", () => {
      const validStatuses: ApprovalStatus[] = [
        "pending_upload",
        "pending_approval",
        "changes_requested",
        "approved",
        "expired",
      ];
      expect(validStatuses).toHaveLength(5);
    });
  });

  describe("Indexes", () => {
    dbTest("should have indexes defined for common queries", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'production_approvals'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("production_approvals_order_id_idx");
      expect(indexNames).toContain("production_approvals_order_item_id_idx");
      expect(indexNames).toContain("production_approvals_status_idx");
      expect(indexNames).toContain("production_approvals_token_idx");
      expect(indexNames).toContain("production_approvals_deadline_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export productionApprovals table schema", () => {
      expect(productionApprovals).toBeDefined();
      const columns = Object.keys(productionApprovals);
      expect(columns).toContain("id");
      expect(columns).toContain("orderId");
      expect(columns).toContain("orderItemId");
      expect(columns).toContain("status");
      expect(columns).toContain("approvalToken");
      expect(columns).toContain("deadlineAt");
      expect(columns).toContain("approvedAt");
    });

    it("should have proper types", () => {
      const approval: Partial<ProductionApproval> = {
        status: "pending_approval",
        approvalToken: "test-token-123",
      };
      expect(approval.status).toBe("pending_approval");
      expect(approval.approvalToken).toBe("test-token-123");
    });
  });
});

describe("Approval Photos Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have approval_photos table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'approval_photos'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'approval_photos'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("approval_id");
      expect(columnNames).toContain("url");
      expect(columnNames).toContain("thumbnail_url");
      expect(columnNames).toContain("sort_order");
      expect(columnNames).toContain("uploaded_at");
      expect(columnNames).toContain("uploaded_by");
    });

    dbTest("should have foreign key to production_approvals", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'approval_photos'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'production_approvals'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have ON DELETE CASCADE for approval_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'approval_photos'
          AND kcu.column_name = 'approval_id'
      `;
      expect(result.length).toBe(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });

    dbTest("should have sort_order default to 0", async () => {
      const result = await client!`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'approval_photos' AND column_name = 'sort_order'
      `;
      expect(result.length).toBe(1);
      expect(result[0].column_default).toBe("0");
    });
  });

  describe("Indexes", () => {
    dbTest("should have indexes for approval queries", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'approval_photos'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("approval_photos_approval_id_idx");
      expect(indexNames).toContain("approval_photos_sort_order_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export approvalPhotos table schema", () => {
      expect(approvalPhotos).toBeDefined();
      const columns = Object.keys(approvalPhotos);
      expect(columns).toContain("id");
      expect(columns).toContain("approvalId");
      expect(columns).toContain("url");
      expect(columns).toContain("thumbnailUrl");
      expect(columns).toContain("sortOrder");
      expect(columns).toContain("uploadedBy");
    });

    it("should have proper types", () => {
      const photo: Partial<ApprovalPhoto> = {
        url: "https://example.com/photo.jpg",
        thumbnailUrl: "https://example.com/photo-thumb.jpg",
        sortOrder: 1,
      };
      expect(photo.url).toBe("https://example.com/photo.jpg");
      expect(photo.sortOrder).toBe(1);
    });
  });
});

describe("Approval Comments Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have approval_comments table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'approval_comments'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'approval_comments'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("approval_id");
      expect(columnNames).toContain("author_type");
      expect(columnNames).toContain("author_id");
      expect(columnNames).toContain("comment");
      expect(columnNames).toContain("created_at");
    });

    dbTest("should have foreign key to production_approvals", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'approval_comments'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'production_approvals'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have ON DELETE CASCADE for approval_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'approval_comments'
          AND kcu.column_name = 'approval_id'
      `;
      expect(result.length).toBe(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });
  });

  describe("Approval Author Type Enum", () => {
    dbTest("should have approval_author_type enum with correct values", async () => {
      const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'approval_author_type'
        ORDER BY enumsortorder
      `;

      const enumValues = result.map((row: any) => row.enumlabel);
      expect(enumValues).toContain("admin");
      expect(enumValues).toContain("customer");
      expect(enumValues).toHaveLength(2);
    });

    it("should export approvalAuthorTypeEnum with correct enumValues", () => {
      expect(approvalAuthorTypeEnum.enumValues).toContain("admin");
      expect(approvalAuthorTypeEnum.enumValues).toContain("customer");
      expect(approvalAuthorTypeEnum.enumValues).toHaveLength(2);
    });

    it("should export ApprovalAuthorType type with correct values", () => {
      const validTypes: ApprovalAuthorType[] = ["admin", "customer"];
      expect(validTypes).toHaveLength(2);
    });
  });

  describe("Indexes", () => {
    dbTest("should have indexes for comment queries", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'approval_comments'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("approval_comments_approval_id_idx");
      expect(indexNames).toContain("approval_comments_created_at_idx");
    });
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export approvalComments table schema", () => {
      expect(approvalComments).toBeDefined();
      const columns = Object.keys(approvalComments);
      expect(columns).toContain("id");
      expect(columns).toContain("approvalId");
      expect(columns).toContain("authorType");
      expect(columns).toContain("authorId");
      expect(columns).toContain("comment");
      expect(columns).toContain("createdAt");
    });

    it("should have proper types", () => {
      const comment: Partial<ApprovalComment> = {
        authorType: "customer",
        comment: "The colors look different from what I expected",
      };
      expect(comment.authorType).toBe("customer");
      expect(comment.comment).toContain("colors");
    });
  });
});
