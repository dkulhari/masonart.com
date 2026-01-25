/**
 * Tests for Wallet API Routes
 *
 * This test suite validates the wallet API routes are properly exported
 * and can be mounted on a Hono app.
 *
 * Note: Full integration tests require database connectivity.
 * These tests verify route configuration and exports.
 *
 * @see packages/api/src/routes/wallet.ts
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Tests
// ============================================================================

describe('Wallet Routes', () => {
  describe('Route Exports', () => {
    it('should export walletApp Hono router', async () => {
      const { walletApp } = await import('../../src/routes/wallet');
      expect(walletApp).toBeDefined();
      expect(walletApp).toBeInstanceOf(Hono);
    });

    it('should be mountable on a Hono app', async () => {
      const { walletApp } = await import('../../src/routes/wallet');

      const app = new Hono();

      // Should not throw when mounting
      expect(() => {
        app.route('/api/wallet', walletApp);
      }).not.toThrow();
    });
  });

  describe('Route Configuration', () => {
    it('should have routes configured', async () => {
      const { walletApp } = await import('../../src/routes/wallet');

      // Hono apps have routes property
      expect(walletApp.routes).toBeDefined();
      expect(walletApp.routes.length).toBeGreaterThan(0);
    });

    it('should have GET routes for balance and transactions', async () => {
      const { walletApp } = await import('../../src/routes/wallet');

      const getRoutes = walletApp.routes.filter(
        (r: { method: string }) => r.method === 'GET'
      );

      // Should have multiple GET routes
      expect(getRoutes.length).toBeGreaterThanOrEqual(2);
    });

    it('should have POST routes for top-up', async () => {
      const { walletApp } = await import('../../src/routes/wallet');

      const postRoutes = walletApp.routes.filter(
        (r: { method: string }) => r.method === 'POST'
      );

      // Should have POST routes for topup and verify
      expect(postRoutes.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Wallet Webhook Routes', () => {
  describe('Route Exports', () => {
    it('should export walletWebhookApp Hono router', async () => {
      const { walletWebhookApp } = await import('../../src/routes/webhooks/wallet');
      expect(walletWebhookApp).toBeDefined();
      expect(walletWebhookApp).toBeInstanceOf(Hono);
    });

    it('should be mountable on a Hono app', async () => {
      const { walletWebhookApp } = await import('../../src/routes/webhooks/wallet');

      const app = new Hono();

      expect(() => {
        app.route('/api/webhooks/wallet', walletWebhookApp);
      }).not.toThrow();
    });
  });
});

describe('Admin Wallet Config Routes', () => {
  describe('Route Exports', () => {
    it('should export adminWalletConfigApp Hono router', async () => {
      const { adminWalletConfigApp } = await import('../../src/routes/admin/wallet-config');
      expect(adminWalletConfigApp).toBeDefined();
      expect(adminWalletConfigApp).toBeInstanceOf(Hono);
    });

    it('should be mountable on a Hono app', async () => {
      const { adminWalletConfigApp } = await import('../../src/routes/admin/wallet-config');

      const app = new Hono();

      expect(() => {
        app.route('/api/admin/wallet-config', adminWalletConfigApp);
      }).not.toThrow();
    });
  });
});
