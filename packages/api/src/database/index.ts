import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Get database URL from environment variable
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL environment variable is not set. " +
      "Please set it in your .env file or environment. " +
      "Example: postgresql://poster_app:dev_password@localhost:5432/poster_app_dev"
  );
}

// Connection pool configuration (configurable via env vars)
const poolMax = parseInt(process.env.DB_POOL_MAX || "20", 10);
const poolIdleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT || "10", 10);
const poolConnectTimeout = parseInt(process.env.DB_POOL_CONNECT_TIMEOUT || "30", 10);

// Create postgres connection
// Using postgres.js which is the recommended driver for Bun
// https://orm.drizzle.team/docs/get-started-postgresql#postgresjs
const queryClient = postgres(databaseUrl, {
  max: poolMax,
  idle_timeout: poolIdleTimeout,
  connect_timeout: poolConnectTimeout,
  prepare: true,
});

// Import all schema tables and relations
import * as schema from "./schema";

// Create drizzle instance with schema for relational queries
export const db = drizzle(queryClient, { schema });

// Export the raw query client for advanced use cases
export { queryClient };

// Graceful shutdown helper
export async function closeDatabase(): Promise<void> {
  await queryClient.end();
}

// Database health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}
