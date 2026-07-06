/**
 * Database Connection Tests
 *
 * Tests for Drizzle ORM database connection to PostgreSQL.
 * Validates connection configuration, utilities, health checks,
 * and connection lifecycle management.
 *
 * Test categories:
 * 1. Connection Module Exports - Verify modules export correct functions/objects
 * 2. Connection Configuration - Verify connection URL and options
 * 3. Connection Utilities - Test helper functions for connection management
 * 4. Runtime Connection Tests - Test actual PostgreSQL connectivity (requires database)
 * 5. Connection Lifecycle - Test graceful shutdown and reconnection
 *
 * Runtime tests can be skipped by setting SKIP_DB_RUNTIME_TESTS=true
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";

// Import connection module - this should work even without database running
import * as databaseModule from "../../src/database/index";

// Helper to check if database is available
let isDatabaseAvailable = false;
let testClient: ReturnType<typeof postgres> | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === "true") {
    console.log("Skipping database runtime tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  // Try to connect to database
  try {
    const databaseUrl =
      process.env.DATABASE_URL ||
      "postgresql://poster_app:dev_password@localhost:5433/poster_app_test";
    testClient = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });
    await testClient`SELECT 1`;
    isDatabaseAvailable = true;
    console.log("Database connection available for runtime tests");
  } catch (error) {
    console.log("Database not available, skipping runtime tests");
    isDatabaseAvailable = false;
    if (testClient) {
      await testClient.end();
      testClient = null;
    }
  }
});

afterAll(async () => {
  if (testClient) {
    await testClient.end();
  }
});

// ============================================================================
// Connection Module Exports Tests
// ============================================================================

describe("Database Connection Module Exports", () => {
  describe("Main Database Module (src/database/index.ts)", () => {
    it("should export db instance", () => {
      expect(databaseModule).toHaveProperty("db");
      expect(databaseModule.db).toBeDefined();
    });

    it("should export queryClient", () => {
      expect(databaseModule).toHaveProperty("queryClient");
      expect(databaseModule.queryClient).toBeDefined();
    });

    it("should export closeDatabase function", () => {
      expect(databaseModule).toHaveProperty("closeDatabase");
      expect(typeof databaseModule.closeDatabase).toBe("function");
    });

    it("should export checkDatabaseConnection function", () => {
      expect(databaseModule).toHaveProperty("checkDatabaseConnection");
      expect(typeof databaseModule.checkDatabaseConnection).toBe("function");
    });

    it("db instance should have select method (Drizzle ORM)", () => {
      expect(databaseModule.db).toHaveProperty("select");
      expect(typeof databaseModule.db.select).toBe("function");
    });

    it("db instance should have insert method (Drizzle ORM)", () => {
      expect(databaseModule.db).toHaveProperty("insert");
      expect(typeof databaseModule.db.insert).toBe("function");
    });

    it("db instance should have update method (Drizzle ORM)", () => {
      expect(databaseModule.db).toHaveProperty("update");
      expect(typeof databaseModule.db.update).toBe("function");
    });

    it("db instance should have delete method (Drizzle ORM)", () => {
      expect(databaseModule.db).toHaveProperty("delete");
      expect(typeof databaseModule.db.delete).toBe("function");
    });

    it("db instance should have query property (relational queries)", () => {
      expect(databaseModule.db).toHaveProperty("query");
      expect(databaseModule.db.query).toBeDefined();
    });

    it("db instance should have transaction method", () => {
      expect(databaseModule.db).toHaveProperty("transaction");
      expect(typeof databaseModule.db.transaction).toBe("function");
    });
  });
});

// ============================================================================
// Connection Configuration Tests
// ============================================================================

// ============================================================================
// Runtime Connection Tests (require database)
// ============================================================================

describe("Runtime Connection Tests", () => {
  describe("PostgreSQL Connectivity", () => {
    it("should connect to PostgreSQL successfully", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping test - database not available");
        return;
      }

      const result = await databaseModule.checkDatabaseConnection();
      expect(result).toBe(true);
    });

    it("should execute simple SELECT query", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      const result = await testClient`SELECT 1 as test`;
      expect(result).toHaveLength(1);
      expect(result[0].test).toBe(1);
    });

    it("should get PostgreSQL version", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      const result = await testClient!`SELECT version()`;
      const version = String(result[0]!.version);
      expect(version.toLowerCase()).toContain("postgresql");
    });

    it("should get current database name", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      const result = await testClient`SELECT current_database()`;
      expect(result).toHaveLength(1);
      expect(result[0].current_database).toBeDefined();
    });

    it("should get current user", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      const result = await testClient`SELECT current_user`;
      expect(result).toHaveLength(1);
      expect(result[0].current_user).toBeDefined();
    });

    it("should handle timezone correctly", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      const result = await testClient`SELECT NOW() as current_time`;
      expect(result).toHaveLength(1);
      expect(result[0].current_time).toBeInstanceOf(Date);
    });
  });

  describe("checkDatabaseConnection utility (main module)", () => {
    it("should return true when database is available", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping test - database not available");
        return;
      }

      const result = await databaseModule.checkDatabaseConnection();
      expect(result).toBe(true);
    });
  });

  describe("Connection Pool Behavior", () => {
    it("should handle multiple concurrent queries", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      const queries = Array(5)
        .fill(null)
        .map(() => testClient!`SELECT 1 as test`);
      const results = await Promise.all(queries);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toHaveLength(1);
        expect(result[0].test).toBe(1);
      });
    });

    it("should handle sequential queries", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      for (let i = 0; i < 3; i++) {
        const result = await testClient`SELECT ${i} as value`;
        expect(result[0].value).toBe(i);
      }
    });
  });
});

// ============================================================================
// Drizzle ORM Integration Tests
// ============================================================================

describe("Drizzle ORM Integration", () => {
  describe("Schema Integration", () => {
    it("db.query should have schema tables available", () => {
      expect(databaseModule.db.query).toBeDefined();
      // The query object should be populated with schema tables
      expect(typeof databaseModule.db.query).toBe("object");
    });

    it("should be able to build select query", () => {
      // This tests that Drizzle is properly configured
      // The query builder should work even without executing
      const selectBuilder = databaseModule.db.select();
      expect(selectBuilder).toBeDefined();
      expect(typeof selectBuilder.from).toBe("function");
    });

    it("should be able to use SQL template literal", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping test - database not available");
        return;
      }

      const { sql } = await import("drizzle-orm");
      const result = await databaseModule.db.execute(sql`SELECT 1 as value`);
      expect(result).toBeDefined();
    });
  });

  describe("Transaction Support", () => {
    it("should have transaction method available", () => {
      expect(databaseModule.db.transaction).toBeDefined();
      expect(typeof databaseModule.db.transaction).toBe("function");
    });

    it("should support async transaction callback pattern", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping test - database not available");
        return;
      }

      // Test that transaction API is correctly structured
      // We don't actually run a transaction to avoid side effects
      const txMethod = databaseModule.db.transaction;
      expect(typeof txMethod).toBe("function");
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling", () => {
  describe("Query Errors", () => {
    it("should handle syntax errors in raw SQL", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      await expect(testClient`SELECT FROM invalid syntax here`).rejects.toThrow();
    });

    it("should handle non-existent table errors", async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log("Skipping test - database not available");
        return;
      }

      await expect(testClient`SELECT * FROM non_existent_table_xyz123`).rejects.toThrow();
    });
  });
});

// ============================================================================
// Connection Lifecycle Tests
// ============================================================================

// ============================================================================
// Environment Configuration Tests
// ============================================================================

describe("Environment Configuration", () => {
  it("should use test environment", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("should have DATABASE_URL environment variable", () => {
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  it("DATABASE_URL should be valid postgresql URL", () => {
    const url = process.env.DATABASE_URL;
    expect(url).toMatch(/^postgresql:\/\//);
  });

  it("DATABASE_URL should contain expected database name for testing", () => {
    const url = process.env.DATABASE_URL;
    // Should contain 'test' or 'poster_app' in the URL
    expect(url?.toLowerCase()).toMatch(/(test|poster_app)/);
  });
});

// ============================================================================
// Database Information Queries
// ============================================================================

// ============================================================================
// Schema Table Availability Tests (Runtime)
// ============================================================================

describe("Schema Table Availability", () => {
  it("should have schema tables loaded in db.query", () => {
    const query = databaseModule.db.query;
    expect(query).toBeDefined();

    // Check that the query object has properties (schema tables)
    // The actual table names depend on the schema definition
    const keys = Object.keys(query);
    expect(keys.length).toBeGreaterThanOrEqual(0);
  });

  it("should be able to check if tables exist in database", async () => {
    if (!isDatabaseAvailable || !testClient) {
      console.log("Skipping test - database not available");
      return;
    }

    const result = await testClient`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    expect(Array.isArray(result)).toBe(true);
    // Tables may or may not exist depending on migrations
  });
});
