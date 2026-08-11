/**
 * Vitest Setup File
 *
 * This file runs before all tests and sets up the test environment.
 * It configures environment variables, test utilities, and global test setup.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';

// Configure test environment variables
process.env.PORT = '3000';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://poster_app:dev_password@localhost:5433/poster_app_dev';

/**
 * A disposable database, when one is configured, is used by EVERYTHING (#580).
 *
 * The live-database suites open their own connection to decide where fixtures
 * go, but the code under test connects through `src/database`, which reads
 * `DATABASE_URL`. Pointing only the suites at `TEST_DATABASE_URL` splits the
 * two: fixtures land in the throwaway database and the routes write to the dev
 * one, and every foreign key between them fails.
 *
 * Set here, before any application module is imported, so both halves agree.
 * Unset, everything behaves exactly as it did.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'test-secret-key-minimum-32-characters-long-for-testing';

// Global test setup
beforeAll(() => {
  console.log('🧪 Starting test suite...');
});

afterAll(() => {
  console.log('✅ Test suite completed');
});

// Per-test setup (optional)
beforeEach(() => {
  // Reset any global state before each test if needed
});

afterEach(() => {
  // Cleanup after each test if needed
});

// Export test utilities if needed
export const TEST_CONFIG = {
  port: 3000,
  baseUrl: 'http://localhost:3000',
  timeout: 5000,
};
