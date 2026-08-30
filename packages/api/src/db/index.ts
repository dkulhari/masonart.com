/**
 * Database Connection Module
 *
 * This module sets up the Drizzle ORM connection to PostgreSQL.
 * It uses the postgres driver for connection pooling and query execution.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { resolveDatabaseUrl } from '../config/database-url';

/**
 * Get database connection URL.
 *
 * Resolves from DATABASE_URL, then the root .env, then throws — there is no
 * port fallback on purpose. See src/config/database-url.ts.
 */
export function getDatabaseUrl(): string {
  return resolveDatabaseUrl();
}

/**
 * Create a postgres client connection
 * This is the underlying database driver
 */
export function createPostgresClient(connectionString?: string) {
  const url = connectionString || getDatabaseUrl();

  // Create postgres client with connection pooling
  const client = postgres(url, {
    max: 10, // Maximum number of connections in the pool
    idle_timeout: 20, // Close idle connections after 20 seconds
    connect_timeout: 10, // Fail if connection takes longer than 10 seconds
  });

  return client;
}

/**
 * Create a Drizzle ORM database instance
 * This is the main interface for database operations
 */
export function createDatabase(connectionString?: string) {
  const client = createPostgresClient(connectionString);
  const db = drizzle(client);

  return { db, client };
}

/**
 * Test database connection
 * Returns true if connection is successful, false otherwise
 */
export async function testConnection(connectionString?: string): Promise<boolean> {
  const client = createPostgresClient(connectionString);

  try {
    // Execute a simple query to test connection
    await client`SELECT 1 as test`;
    await client.end();
    return true;
  } catch (error) {
    await client.end();
    return false;
  }
}

/**
 * Get database version information
 * Useful for debugging and connection verification
 */
export async function getDatabaseVersion(connectionString?: string): Promise<string> {
  const client = createPostgresClient(connectionString);

  try {
    const result = await client`SELECT version()`;
    await client.end();
    return result[0]?.version || 'Unknown';
  } catch (error) {
    await client.end();
    throw new Error(`Failed to get database version: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if database exists and is accessible
 * Returns detailed connection information
 */
export async function checkDatabaseHealth(connectionString?: string): Promise<{
  connected: boolean;
  version?: string;
  database?: string;
  user?: string;
  error?: string;
}> {
  const client = createPostgresClient(connectionString);

  try {
    // Get database info
    const versionResult = await client`SELECT version()`;
    const dbInfoResult = await client`SELECT current_database(), current_user`;

    await client.end();

    return {
      connected: true,
      version: versionResult[0]?.version,
      database: dbInfoResult[0]?.current_database,
      user: dbInfoResult[0]?.current_user,
    };
  } catch (error) {
    await client.end();
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
