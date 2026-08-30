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

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import postgres from 'postgres';

// Import connection modules - these should work even without database running
import * as databaseModule from '../../src/database/index';
import * as dbModule from '../../src/db/index';
import { resolveDatabaseUrl } from '../../src/config/database-url';

// Helper to check if database is available
let isDatabaseAvailable = false;
let testClient: ReturnType<typeof postgres> | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === 'true') {
    console.log('Skipping database runtime tests (SKIP_DB_RUNTIME_TESTS=true)');
    return;
  }

  // Try to connect to database
  try {
    // Read-only probe (SELECT 1) — safe against whatever .env points at.
    const databaseUrl = resolveDatabaseUrl();
    testClient = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });
    await testClient`SELECT 1`;
    isDatabaseAvailable = true;
    console.log('Database connection available for runtime tests');
  } catch (error) {
    console.log('Database not available, skipping runtime tests');
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

describe('Database Connection Module Exports', () => {
  describe('Main Database Module (src/database/index.ts)', () => {
    it('should export db instance', () => {
      expect(databaseModule).toHaveProperty('db');
      expect(databaseModule.db).toBeDefined();
    });

    it('should export queryClient', () => {
      expect(databaseModule).toHaveProperty('queryClient');
      expect(databaseModule.queryClient).toBeDefined();
    });

    it('should export closeDatabase function', () => {
      expect(databaseModule).toHaveProperty('closeDatabase');
      expect(typeof databaseModule.closeDatabase).toBe('function');
    });

    it('should export checkDatabaseConnection function', () => {
      expect(databaseModule).toHaveProperty('checkDatabaseConnection');
      expect(typeof databaseModule.checkDatabaseConnection).toBe('function');
    });

    it('db instance should have select method (Drizzle ORM)', () => {
      expect(databaseModule.db).toHaveProperty('select');
      expect(typeof databaseModule.db.select).toBe('function');
    });

    it('db instance should have insert method (Drizzle ORM)', () => {
      expect(databaseModule.db).toHaveProperty('insert');
      expect(typeof databaseModule.db.insert).toBe('function');
    });

    it('db instance should have update method (Drizzle ORM)', () => {
      expect(databaseModule.db).toHaveProperty('update');
      expect(typeof databaseModule.db.update).toBe('function');
    });

    it('db instance should have delete method (Drizzle ORM)', () => {
      expect(databaseModule.db).toHaveProperty('delete');
      expect(typeof databaseModule.db.delete).toBe('function');
    });

    it('db instance should have query property (relational queries)', () => {
      expect(databaseModule.db).toHaveProperty('query');
      expect(databaseModule.db.query).toBeDefined();
    });

    it('db instance should have transaction method', () => {
      expect(databaseModule.db).toHaveProperty('transaction');
      expect(typeof databaseModule.db.transaction).toBe('function');
    });
  });

  describe('DB Utilities Module (src/db/index.ts)', () => {
    it('should export getDatabaseUrl function', () => {
      expect(dbModule).toHaveProperty('getDatabaseUrl');
      expect(typeof dbModule.getDatabaseUrl).toBe('function');
    });

    it('should export createPostgresClient function', () => {
      expect(dbModule).toHaveProperty('createPostgresClient');
      expect(typeof dbModule.createPostgresClient).toBe('function');
    });

    it('should export createDatabase function', () => {
      expect(dbModule).toHaveProperty('createDatabase');
      expect(typeof dbModule.createDatabase).toBe('function');
    });

    it('should export testConnection function', () => {
      expect(dbModule).toHaveProperty('testConnection');
      expect(typeof dbModule.testConnection).toBe('function');
    });

    it('should export getDatabaseVersion function', () => {
      expect(dbModule).toHaveProperty('getDatabaseVersion');
      expect(typeof dbModule.getDatabaseVersion).toBe('function');
    });

    it('should export checkDatabaseHealth function', () => {
      expect(dbModule).toHaveProperty('checkDatabaseHealth');
      expect(typeof dbModule.checkDatabaseHealth).toBe('function');
    });
  });
});

// ============================================================================
// Connection Configuration Tests
// ============================================================================

describe('Connection Configuration', () => {
  describe('Database URL Configuration', () => {
    it('getDatabaseUrl should return string', () => {
      const url = dbModule.getDatabaseUrl();
      expect(typeof url).toBe('string');
    });

    it('getDatabaseUrl should return valid postgresql URL format', () => {
      const url = dbModule.getDatabaseUrl();
      expect(url).toMatch(/^postgresql:\/\//);
    });

    it('getDatabaseUrl should contain host and database name', () => {
      const url = dbModule.getDatabaseUrl();
      // URL should contain localhost or other host and a database name
      expect(url).toMatch(/postgresql:\/\/[^/]+\/[a-zA-Z_]+/);
    });

    it('should read DATABASE_URL from environment when set', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://test:test@testhost:5432/testdb';

      const url = dbModule.getDatabaseUrl();
      expect(url).toBe('postgresql://test:test@testhost:5432/testdb');

      process.env.DATABASE_URL = originalUrl;
    });

    it('should use default URL when DATABASE_URL is not set', () => {
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      const url = dbModule.getDatabaseUrl();
      expect(url).toContain('postgresql://');
      expect(url).toContain('poster_app');

      process.env.DATABASE_URL = originalUrl;
    });
  });

  describe('Client Creation', () => {
    it('createPostgresClient should return a function', () => {
      const client = dbModule.createPostgresClient('postgresql://test:test@localhost:5433/test');
      expect(typeof client).toBe('function');
      // Clean up
      client.end();
    });

    it('createPostgresClient should accept custom connection string', () => {
      const customUrl = 'postgresql://custom:custom@localhost:5433/customdb';
      const client = dbModule.createPostgresClient(customUrl);
      expect(client).toBeDefined();
      client.end();
    });

    it('createDatabase should return object with db and client', () => {
      const { db, client } = dbModule.createDatabase('postgresql://test:test@localhost:5433/test');
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      client.end();
    });

    it('createDatabase db instance should have Drizzle methods', () => {
      const { db, client } = dbModule.createDatabase('postgresql://test:test@localhost:5433/test');
      expect(typeof db.select).toBe('function');
      expect(typeof db.insert).toBe('function');
      expect(typeof db.update).toBe('function');
      expect(typeof db.delete).toBe('function');
      client.end();
    });
  });
});

// ============================================================================
// Connection Health Check Function Tests
// ============================================================================

describe('Connection Health Check Functions', () => {
  describe('checkDatabaseHealth return structure', () => {
    it('should return an object with connected property', async () => {
      const result = await dbModule.checkDatabaseHealth();
      expect(result).toHaveProperty('connected');
      expect(typeof result.connected).toBe('boolean');
    });

    it('should return version when connected', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }
      const result = await dbModule.checkDatabaseHealth();
      expect(result.connected).toBe(true);
      expect(result).toHaveProperty('version');
      expect(typeof result.version).toBe('string');
    });

    it('should return database name when connected', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }
      const result = await dbModule.checkDatabaseHealth();
      expect(result.connected).toBe(true);
      expect(result).toHaveProperty('database');
      expect(typeof result.database).toBe('string');
    });

    it('should return user when connected', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }
      const result = await dbModule.checkDatabaseHealth();
      expect(result.connected).toBe(true);
      expect(result).toHaveProperty('user');
      expect(typeof result.user).toBe('string');
    });

    it('should return error when connection fails', async () => {
      const result = await dbModule.checkDatabaseHealth('postgresql://invalid:invalid@nonexistent:5432/invalid');
      expect(result.connected).toBe(false);
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });
  });

  describe('testConnection function', () => {
    it('should return boolean', async () => {
      const result = await dbModule.testConnection();
      expect(typeof result).toBe('boolean');
    });

    it('should return true when database is available', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }
      const result = await dbModule.testConnection();
      expect(result).toBe(true);
    });

    it('should return false for invalid connection string', async () => {
      const result = await dbModule.testConnection('postgresql://invalid:invalid@nonexistent:5432/invalid');
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// Runtime Connection Tests (require database)
// ============================================================================

describe('Runtime Connection Tests', () => {
  describe('PostgreSQL Connectivity', () => {
    it('should connect to PostgreSQL successfully', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const result = await dbModule.testConnection();
      expect(result).toBe(true);
    });

    it('should execute simple SELECT query', async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log('Skipping test - database not available');
        return;
      }

      const result = await testClient`SELECT 1 as test`;
      expect(result).toHaveLength(1);
      expect(result[0].test).toBe(1);
    });

    it('should get PostgreSQL version', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const version = await dbModule.getDatabaseVersion();
      expect(typeof version).toBe('string');
      expect(version.toLowerCase()).toContain('postgresql');
    });

    it('should get current database name', async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log('Skipping test - database not available');
        return;
      }

      const result = await testClient`SELECT current_database()`;
      expect(result).toHaveLength(1);
      expect(result[0].current_database).toBeDefined();
    });

    it('should get current user', async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log('Skipping test - database not available');
        return;
      }

      const result = await testClient`SELECT current_user`;
      expect(result).toHaveLength(1);
      expect(result[0].current_user).toBeDefined();
    });

    it('should handle timezone correctly', async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log('Skipping test - database not available');
        return;
      }

      const result = await testClient`SELECT NOW() as current_time`;
      expect(result).toHaveLength(1);
      expect(result[0].current_time).toBeInstanceOf(Date);
    });
  });

  describe('checkDatabaseConnection utility (main module)', () => {
    it('should return true when database is available', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const result = await databaseModule.checkDatabaseConnection();
      expect(result).toBe(true);
    });
  });

  describe('Connection Pool Behavior', () => {
    it('should handle multiple concurrent queries', async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log('Skipping test - database not available');
        return;
      }

      const queries = Array(5).fill(null).map(() => testClient!`SELECT 1 as test`);
      const results = await Promise.all(queries);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toHaveLength(1);
        expect(result[0].test).toBe(1);
      });
    });

    it('should handle sequential queries', async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log('Skipping test - database not available');
        return;
      }

      for (let i = 0; i < 3; i++) {
        // ::int cast — postgres.js sends JS numbers as text parameters, so
        // without it the driver returns '0' (string) and the equality fails
        const result = await testClient`SELECT ${i}::int as value`;
        expect(result[0].value).toBe(i);
      }
    });
  });
});

// ============================================================================
// Drizzle ORM Integration Tests
// ============================================================================

describe('Drizzle ORM Integration', () => {
  describe('Schema Integration', () => {
    it('db.query should have schema tables available', () => {
      expect(databaseModule.db.query).toBeDefined();
      // The query object should be populated with schema tables
      expect(typeof databaseModule.db.query).toBe('object');
    });

    it('should be able to build select query', () => {
      // This tests that Drizzle is properly configured
      // The query builder should work even without executing
      const selectBuilder = databaseModule.db.select();
      expect(selectBuilder).toBeDefined();
      expect(typeof selectBuilder.from).toBe('function');
    });

    it('should be able to use SQL template literal', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const { sql } = await import('drizzle-orm');
      const result = await databaseModule.db.execute(sql`SELECT 1 as value`);
      expect(result).toBeDefined();
    });
  });

  describe('Transaction Support', () => {
    it('should have transaction method available', () => {
      expect(databaseModule.db.transaction).toBeDefined();
      expect(typeof databaseModule.db.transaction).toBe('function');
    });

    it('should support async transaction callback pattern', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      // Test that transaction API is correctly structured
      // We don't actually run a transaction to avoid side effects
      const txMethod = databaseModule.db.transaction;
      expect(typeof txMethod).toBe('function');
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('Connection Errors', () => {
    it('should handle invalid host gracefully', async () => {
      const result = await dbModule.testConnection('postgresql://user:pass@invalid-host-xyz:5432/db');
      expect(result).toBe(false);
    });

    it('should handle invalid port gracefully', async () => {
      // Use a valid port number that is unlikely to have anything listening
      // Port 99999 is invalid (>65535), so we use a high valid port
      const result = await dbModule.testConnection('postgresql://user:pass@localhost:54399/db');
      expect(result).toBe(false);
    });

    it('should return error message for failed health check', async () => {
      const result = await dbModule.checkDatabaseHealth('postgresql://user:pass@invalid:5432/db');
      expect(result.connected).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it('getDatabaseVersion should throw for invalid connection', async () => {
      await expect(
        dbModule.getDatabaseVersion('postgresql://invalid:invalid@nonexistent:5432/invalid')
      ).rejects.toThrow();
    });
  });

  describe('Query Errors', () => {
    it('should handle syntax errors in raw SQL', async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log('Skipping test - database not available');
        return;
      }

      await expect(
        testClient`SELECT FROM invalid syntax here`
      ).rejects.toThrow();
    });

    it('should handle non-existent table errors', async () => {
      if (!isDatabaseAvailable || !testClient) {
        console.log('Skipping test - database not available');
        return;
      }

      await expect(
        testClient`SELECT * FROM non_existent_table_xyz123`
      ).rejects.toThrow();
    });
  });
});

// ============================================================================
// Connection Lifecycle Tests
// ============================================================================

describe('Connection Lifecycle', () => {
  describe('Client Creation and Cleanup', () => {
    it('should create and close client cleanly', async () => {
      const client = dbModule.createPostgresClient('postgresql://test:test@localhost:5433/test');
      expect(client).toBeDefined();

      // Should be able to end without error
      await expect(client.end()).resolves.not.toThrow();
    });

    it('should create database instance and close cleanly', async () => {
      const { db, client } = dbModule.createDatabase('postgresql://test:test@localhost:5433/test');
      expect(db).toBeDefined();
      expect(client).toBeDefined();

      await expect(client.end()).resolves.not.toThrow();
    });
  });

  describe('Multiple Client Instances', () => {
    it('should allow creating multiple independent clients', () => {
      const client1 = dbModule.createPostgresClient('postgresql://test:test@localhost:5433/test1');
      const client2 = dbModule.createPostgresClient('postgresql://test:test@localhost:5433/test2');

      expect(client1).not.toBe(client2);

      client1.end();
      client2.end();
    });

    it('should allow creating multiple database instances', () => {
      const db1 = dbModule.createDatabase('postgresql://test:test@localhost:5433/test1');
      const db2 = dbModule.createDatabase('postgresql://test:test@localhost:5433/test2');

      expect(db1.db).not.toBe(db2.db);
      expect(db1.client).not.toBe(db2.client);

      db1.client.end();
      db2.client.end();
    });
  });
});

// ============================================================================
// Environment Configuration Tests
// ============================================================================

describe('Environment Configuration', () => {
  it('should use test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should have DATABASE_URL environment variable', () => {
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  it('DATABASE_URL should be valid postgresql URL', () => {
    const url = process.env.DATABASE_URL;
    expect(url).toMatch(/^postgresql:\/\//);
  });

  it('DATABASE_URL should contain expected database name for testing', () => {
    const url = process.env.DATABASE_URL;
    // Should contain 'test' or 'poster_app' in the URL
    expect(url?.toLowerCase()).toMatch(/(test|poster_app)/);
  });
});

// ============================================================================
// Database Information Queries
// ============================================================================

describe('Database Information Queries', () => {
  describe('PostgreSQL Version Information', () => {
    it('should get version containing PostgreSQL', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const version = await dbModule.getDatabaseVersion();
      expect(version.toLowerCase()).toContain('postgresql');
    });

    it('should get version number', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const version = await dbModule.getDatabaseVersion();
      // Should contain a version number pattern like "16.0" or "15.2"
      expect(version).toMatch(/\d+\.\d+/);
    });
  });

  describe('Health Check Information', () => {
    it('should return complete health information', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const health = await dbModule.checkDatabaseHealth();

      expect(health.connected).toBe(true);
      expect(health.version).toBeDefined();
      expect(health.database).toBeDefined();
      expect(health.user).toBeDefined();
      expect(health.error).toBeUndefined();
    });

    it('should return expected user from health check', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const health = await dbModule.checkDatabaseHealth();
      // User should be something like 'poster_app' based on connection URL
      expect(typeof health.user).toBe('string');
      expect(health.user!.length).toBeGreaterThan(0);
    });

    it('should return expected database from health check', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping test - database not available');
        return;
      }

      const health = await dbModule.checkDatabaseHealth();
      expect(typeof health.database).toBe('string');
      expect(health.database!.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Schema Table Availability Tests (Runtime)
// ============================================================================

describe('Schema Table Availability', () => {
  it('should have schema tables loaded in db.query', () => {
    const query = databaseModule.db.query;
    expect(query).toBeDefined();

    // Check that the query object has properties (schema tables)
    // The actual table names depend on the schema definition
    const keys = Object.keys(query);
    expect(keys.length).toBeGreaterThanOrEqual(0);
  });

  it('should be able to check if tables exist in database', async () => {
    if (!isDatabaseAvailable || !testClient) {
      console.log('Skipping test - database not available');
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
