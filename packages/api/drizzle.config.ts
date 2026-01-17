import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Schema location - where Drizzle will look for table definitions
  schema: "./src/database/schema/index.ts",

  // Output directory for migrations
  out: "./src/database/migrations",

  // Database dialect
  dialect: "postgresql",

  // Database connection
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },

  // Enable verbose logging for debugging
  verbose: true,

  // Enable strict mode for better type safety
  strict: true,

  // Use camelCase for TypeScript, snake_case for database
  casing: "snake_case",
});
