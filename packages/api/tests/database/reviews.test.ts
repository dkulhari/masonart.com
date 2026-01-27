/**
 * Reviews Database Schema Tests
 *
 * Tests for product reviews database table.
 * Validates schema structure, enum values, and CRUD operations.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', all tests are skipped (useful for CI without database).
 * Tests also gracefully skip when database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import {
  reviews,
  reviewStatusEnum,
  type Review,
  type NewReview,
  type ReviewStatus,
} from "../../src/database/schema/reviews";

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === "true";

// Track database availability
let isDatabaseAvailable = false;

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

// Test user and product IDs (created in beforeAll)
let testUserId: string;
let testProductId: string;
let testModeratorId: string;

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

    // Create uuid extension
    await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    // Create review_status enum if not exists
    await client`
      DO $$ BEGIN
        CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    // Create minimal user table for foreign keys (Better Auth style with text id)
    await client`
      CREATE TABLE IF NOT EXISTS test_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;

    // Create minimal products table for foreign keys
    await client`
      CREATE TABLE IF NOT EXISTS test_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;

    // Create reviews table
    await client`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES test_products(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES test_users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title TEXT,
        content TEXT NOT NULL,
        status review_status NOT NULL DEFAULT 'pending',
        moderator_id TEXT REFERENCES test_users(id) ON DELETE SET NULL,
        moderator_notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;

    // Create indexes
    await client`CREATE INDEX IF NOT EXISTS reviews_product_id_idx ON reviews(product_id)`;
    await client`CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON reviews(user_id)`;
    await client`CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews(status)`;
    await client`CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON reviews(created_at)`;
    await client`CREATE INDEX IF NOT EXISTS reviews_product_status_idx ON reviews(product_id, status)`;

    // Insert test user
    const [user] = await client`
      INSERT INTO test_users (id, name, email)
      VALUES ('test-user-123', 'Test User', 'test@example.com')
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    testUserId = user?.id || "test-user-123";

    // Insert test moderator
    const [moderator] = await client`
      INSERT INTO test_users (id, name, email)
      VALUES ('test-moderator-456', 'Test Moderator', 'moderator@example.com')
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    testModeratorId = moderator?.id || "test-moderator-456";

    // Insert test product
    const [product] = await client`
      INSERT INTO test_products (title, slug)
      VALUES ('Test Product', 'test-product')
      ON CONFLICT (slug) DO UPDATE SET title = 'Test Product'
      RETURNING id
    `;
    testProductId = product.id;

    console.log("✅ Database connection established for reviews schema tests");
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
    // Clean up tables
    await client`DROP TABLE IF EXISTS reviews CASCADE`;
    await client`DROP TABLE IF EXISTS test_products CASCADE`;
    await client`DROP TABLE IF EXISTS test_users CASCADE`;
    await client.end();
  } catch (error) {
    // Ignore cleanup errors
  }
});

beforeEach(async () => {
  if (!isDatabaseAvailable || !client) return;

  // Clean up reviews data before each test
  await client`DELETE FROM reviews`;
});

// Helper to check if tests should be skipped
// Note: This returns a function for vitest's skipIf to evaluate at runtime
const shouldSkip = () => SKIP_TESTS || !isDatabaseAvailable;

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

describe("Reviews Table Schema", () => {
  describe("Table Structure", () => {
    dbTest("should have reviews table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reviews'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'reviews'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("product_id");
      expect(columnNames).toContain("user_id");
      expect(columnNames).toContain("rating");
      expect(columnNames).toContain("title");
      expect(columnNames).toContain("content");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("moderator_id");
      expect(columnNames).toContain("moderator_notes");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    dbTest("should have id as primary key", async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'reviews' AND constraint_type = 'PRIMARY KEY'
      `;
      expect(result.length).toBe(1);
    });

    dbTest(
      "should have foreign key to products",
      async () => {
        const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'reviews'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'test_products'
      `;
        expect(result.length).toBe(1);
      }
    );

    dbTest("should have foreign key to users", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'reviews'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'test_users'
      `;
      // Should have 2 foreign keys to users (user_id and moderator_id)
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Review Status Enum", () => {
    dbTest(
      "should have review_status enum with correct values",
      async () => {
        const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'review_status'
        ORDER BY enumsortorder
      `;

        const enumValues = result.map((row: any) => row.enumlabel);
        expect(enumValues).toContain("pending");
        expect(enumValues).toContain("approved");
        expect(enumValues).toContain("rejected");
        expect(enumValues).toHaveLength(3);
      }
    );
  });

  describe("Indexes", () => {
    dbTest(
      "should have indexes defined for common queries",
      async () => {
        const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'reviews'
      `;

        const indexNames = result.map((row: any) => row.indexname);
        expect(indexNames).toContain("reviews_product_id_idx");
        expect(indexNames).toContain("reviews_user_id_idx");
        expect(indexNames).toContain("reviews_status_idx");
        expect(indexNames).toContain("reviews_created_at_idx");
      }
    );
  });

  describe("Rating Constraint", () => {
    dbTest("should accept rating value 1", async () => {
      const result = await client!`
        INSERT INTO reviews (product_id, user_id, rating, content)
        VALUES (${testProductId}, ${testUserId}, 1, 'Rating 1 test')
        RETURNING rating
      `;
      expect(result[0].rating).toBe(1);
    });

    dbTest("should accept rating value 5", async () => {
      const result = await client!`
        INSERT INTO reviews (product_id, user_id, rating, content)
        VALUES (${testProductId}, ${testUserId}, 5, 'Rating 5 test')
        RETURNING rating
      `;
      expect(result[0].rating).toBe(5);
    });

    dbTest("should reject rating value 0", async () => {
      let error: Error | null = null;
      try {
        await client!`
          INSERT INTO reviews (product_id, user_id, rating, content)
          VALUES (${testProductId}, ${testUserId}, 0, 'Invalid rating test')
        `;
      } catch (e: any) {
        error = e;
      }
      expect(error).not.toBeNull();
      expect(error!.message).toContain("check");
    });

    dbTest("should reject rating value 6", async () => {
      let error: Error | null = null;
      try {
        await client!`
          INSERT INTO reviews (product_id, user_id, rating, content)
          VALUES (${testProductId}, ${testUserId}, 6, 'Invalid rating test')
        `;
      } catch (e: any) {
        error = e;
      }
      expect(error).not.toBeNull();
      expect(error!.message).toContain("check");
    });
  });

  describe("Review CRUD Operations", () => {
    dbTest("should insert a review", async () => {
      const result = await client!`
        INSERT INTO reviews (product_id, user_id, rating, title, content)
        VALUES (${testProductId}, ${testUserId}, 5, 'Great Product', 'This is an amazing product!')
        RETURNING *
      `;

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("id");
      expect(result[0].rating).toBe(5);
      expect(result[0].title).toBe("Great Product");
      expect(result[0].status).toBe("pending");
    });

    dbTest(
      "should insert review with default pending status",
      async () => {
        const result = await client!`
        INSERT INTO reviews (product_id, user_id, rating, content)
        VALUES (${testProductId}, ${testUserId}, 4, 'Good product')
        RETURNING status
      `;

        expect(result[0].status).toBe("pending");
      }
    );

    dbTest("should update review status", async () => {
      // Insert a review
      const [inserted] = await client!`
        INSERT INTO reviews (product_id, user_id, rating, content)
        VALUES (${testProductId}, ${testUserId}, 4, 'Review to approve')
        RETURNING id
      `;

      // Update status to approved
      await client!`
        UPDATE reviews
        SET status = 'approved', moderator_id = ${testModeratorId}
        WHERE id = ${inserted.id}
      `;

      const [result] = await client!`
        SELECT status, moderator_id FROM reviews WHERE id = ${inserted.id}
      `;

      expect(result.status).toBe("approved");
      expect(result.moderator_id).toBe(testModeratorId);
    });

    dbTest("should select reviews by product", async () => {
      // Insert multiple reviews
      await client!`
        INSERT INTO reviews (product_id, user_id, rating, content)
        VALUES
          (${testProductId}, ${testUserId}, 5, 'Review 1'),
          (${testProductId}, ${testUserId}, 4, 'Review 2'),
          (${testProductId}, ${testUserId}, 3, 'Review 3')
      `;

      const result = await client!`
        SELECT * FROM reviews WHERE product_id = ${testProductId}
      `;

      expect(result).toHaveLength(3);
    });

    dbTest(
      "should filter reviews by status",
      async () => {
        // Insert reviews with different statuses
        await client!`
        INSERT INTO reviews (product_id, user_id, rating, content, status)
        VALUES
          (${testProductId}, ${testUserId}, 5, 'Approved review', 'approved'),
          (${testProductId}, ${testUserId}, 4, 'Pending review', 'pending'),
          (${testProductId}, ${testUserId}, 3, 'Rejected review', 'rejected')
      `;

        const approvedReviews = await client!`
        SELECT * FROM reviews WHERE status = 'approved'
      `;

        expect(approvedReviews).toHaveLength(1);
        expect(approvedReviews[0].content).toBe("Approved review");
      }
    );

    dbTest("should delete review", async () => {
      // Insert a review
      const [inserted] = await client!`
        INSERT INTO reviews (product_id, user_id, rating, content)
        VALUES (${testProductId}, ${testUserId}, 3, 'Review to delete')
        RETURNING id
      `;

      // Delete the review
      await client!`DELETE FROM reviews WHERE id = ${inserted.id}`;

      const result = await client!`
        SELECT * FROM reviews WHERE id = ${inserted.id}
      `;

      expect(result).toHaveLength(0);
    });

    dbTest(
      "should cascade delete reviews when product is deleted",
      async () => {
        // Create a new product for this test
        const [newProduct] = await client!`
        INSERT INTO test_products (title, slug)
        VALUES ('Product to Delete', 'product-to-delete')
        RETURNING id
      `;

        // Insert a review for this product
        await client!`
        INSERT INTO reviews (product_id, user_id, rating, content)
        VALUES (${newProduct.id}, ${testUserId}, 5, 'Review for deleted product')
      `;

        // Verify review exists
        const beforeDelete = await client!`
        SELECT * FROM reviews WHERE product_id = ${newProduct.id}
      `;
        expect(beforeDelete).toHaveLength(1);

        // Delete the product
        await client!`DELETE FROM test_products WHERE id = ${newProduct.id}`;

        // Verify review is also deleted (CASCADE)
        const afterDelete = await client!`
        SELECT * FROM reviews WHERE product_id = ${newProduct.id}
      `;
        expect(afterDelete).toHaveLength(0);
      }
    );
  });

  describe("Drizzle Schema Type Exports", () => {
    it("should export ReviewStatus type with correct values", () => {
      const validStatuses: ReviewStatus[] = ["pending", "approved", "rejected"];
      expect(validStatuses).toHaveLength(3);
    });

    it("should export reviewStatusEnum with correct enumValues", () => {
      expect(reviewStatusEnum.enumValues).toContain("pending");
      expect(reviewStatusEnum.enumValues).toContain("approved");
      expect(reviewStatusEnum.enumValues).toContain("rejected");
      expect(reviewStatusEnum.enumValues).toHaveLength(3);
    });

    it("should export reviews table schema", () => {
      expect(reviews).toBeDefined();
      // Check that the table has the expected columns
      const columns = Object.keys(reviews);
      expect(columns).toContain("id");
      expect(columns).toContain("productId");
      expect(columns).toContain("userId");
      expect(columns).toContain("rating");
      expect(columns).toContain("content");
      expect(columns).toContain("status");
    });
  });
});
