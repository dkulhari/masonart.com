/**
 * Tests for Wallet Middleware
 *
 * This test suite validates the wallet middleware exports and basic functionality.
 *
 * @see packages/api/src/middleware/wallet.ts
 */

import { describe, it, expect } from 'vitest';
import '../setup';

// ============================================================================
// Tests
// ============================================================================

describe('Wallet Middleware', () => {
  describe('Middleware Exports', () => {
    it('should export requireSufficientFunds function', async () => {
      const walletMiddleware = await import('../../src/middleware/wallet');
      expect(typeof walletMiddleware.requireSufficientFunds).toBe('function');
    });

    it('should export WalletVariables type', async () => {
      // Type exports are checked at compile time
      // This test just verifies the module loads correctly
      const walletMiddleware = await import('../../src/middleware/wallet');
      expect(walletMiddleware).toBeDefined();
    });
  });

  describe('requireSufficientFunds', () => {
    it('should return a middleware function', async () => {
      const { requireSufficientFunds } = await import('../../src/middleware/wallet');

      const middleware = requireSufficientFunds(() => ({
        provider: 'fal',
        variationCount: 4,
      }));

      // Middleware should be a function
      expect(typeof middleware).toBe('function');
    });

    it('should accept a params getter function', async () => {
      const { requireSufficientFunds } = await import('../../src/middleware/wallet');

      // Should not throw when called with valid params getter
      expect(() => {
        requireSufficientFunds(() => ({
          provider: 'fal',
          variationCount: 4,
        }));
      }).not.toThrow();
    });

    it('should accept optional falModel parameter', async () => {
      const { requireSufficientFunds } = await import('../../src/middleware/wallet');

      expect(() => {
        requireSufficientFunds(() => ({
          provider: 'fal',
          variationCount: 4,
          falModel: 'flux-pro',
        }));
      }).not.toThrow();
    });
  });
});
