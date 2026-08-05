/**
 * Vitest Setup File for Web Package
 *
 * This file runs before all tests in the web package.
 * Used to set up the test environment, configure mocks, etc.
 */

import '@testing-library/jest-dom';

/**
 * Node 25 exposes its own `localStorage` global whose methods are inert, and it
 * shadows jsdom's. Any store using zustand's `persist` throws
 * "storage.setItem is not a function" on import — persist captures the storage
 * object at module init, which is before any beforeEach could swap it.
 *
 * Installing a working one here covers every suite that imports a persisted
 * store (cart, wishlist) without each of them repeating a vi.hoisted block.
 */
const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) =>
      void memoryStorage.set(key, String(value)),
    removeItem: (key: string) => void memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
    key: (index: number) => [...memoryStorage.keys()][index] ?? null,
    get length() {
      return memoryStorage.size;
    },
  },
});

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock environment variables
process.env.VITE_API_URL = 'http://localhost:3000';

// Global test configuration
export const TEST_CONFIG = {
  apiUrl: 'http://localhost:3000',
  timeout: 30000,
};
