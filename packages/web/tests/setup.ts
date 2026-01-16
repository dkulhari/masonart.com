/**
 * Vitest Setup File for Web Package
 *
 * This file runs before all tests in the web package.
 * Used to set up the test environment, configure mocks, etc.
 */

import '@testing-library/jest-dom';

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock environment variables
process.env.VITE_API_URL = 'http://localhost:3000';

// Global test configuration
export const TEST_CONFIG = {
  apiUrl: 'http://localhost:3000',
  timeout: 30000,
};
