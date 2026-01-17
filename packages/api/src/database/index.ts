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

// Create postgres connection
// Using postgres.js which is the recommended driver for Bun
// https://orm.drizzle.team/docs/get-started-postgresql#postgresjs
const queryClient = postgres(databaseUrl, {
  // Maximum number of connections in the pool
  max: 10,
  // Idle connection timeout in seconds
  idle_timeout: 20,
  // Connection timeout in seconds
  connect_timeout: 10,
  // Prepare statements for better performance
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
