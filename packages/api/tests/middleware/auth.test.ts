import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono, Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  requireAuth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireTrade,
  requireVerified,
  requireAICredits,
  getUserRateLimitKey,
  hasRole,
  hasAnyRole,
  isAdmin,
  canAccess,
  type AuthUser,
  type AuthSession,
  type AuthVariables,
  type OptionalAuthVariables,
} from '../../src/middleware/auth';
import '../setup'; // Import test setup

/**
 * Tests to verify auth middleware works correctly
 *
 * This test suite validates:
 * - requireAuth middleware (authentication required)
 * - optionalAuth middleware (authentication optional)
 * - requireRole middleware (role-based access control)
 * - requireAdmin middleware (admin access control)
 * - requireTrade middleware (trade program access)
 * - requireVerified middleware (email verification required)
 * - requireAICredits middleware (AI credits check)
 * - Helper functions (hasRole, hasAnyRole, isAdmin, canAccess)
 * - getUserRateLimitKey rate limiting helper
 * - Integration with Hono context
 * - Error handling and edge cases
 * - Session attachment to context
 *
 * @see https://www.better-auth.com/docs
 * @see https://hono.dev/docs/guides/middleware
 */

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a mock authenticated user
 */
function createMockUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    role: 'customer',
    firstName: 'Test',
    lastName: 'User',
    phone: null,
    phoneVerified: false,
    status: 'active',
    tradeStatus: 'none',
    aiCreditsRemaining: 5,
    aiSubscriptionTier: 'free',
    ...overrides,
  };
}

/**
 * Create a mock session
 */
function createMockSession(userId: string = 'user-123'): AuthSession {
  return {
    id: 'session-123',
    token: 'mock-token-123',
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  };
}

describe('Auth Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  // ==========================================================================
  // Module Exports Tests
  // ==========================================================================

  describe('Module Exports', () => {
    it('should export requireAuth middleware', () => {
      expect(requireAuth).toBeDefined();
      expect(typeof requireAuth).toBe('function');
    });

    it('should export optionalAuth middleware', () => {
      expect(optionalAuth).toBeDefined();
      expect(typeof optionalAuth).toBe('function');
    });

    it('should export requireRole middleware factory', () => {
      expect(requireRole).toBeDefined();
      expect(typeof requireRole).toBe('function');
    });

    it('should export requireAdmin middleware', () => {
      expect(requireAdmin).toBeDefined();
      expect(typeof requireAdmin).toBe('function');
    });

    it('should export requireTrade middleware', () => {
      expect(requireTrade).toBeDefined();
      expect(typeof requireTrade).toBe('function');
    });

    it('should export requireVerified middleware', () => {
      expect(requireVerified).toBeDefined();
      expect(typeof requireVerified).toBe('function');
    });

    it('should export requireAICredits middleware factory', () => {
      expect(requireAICredits).toBeDefined();
      expect(typeof requireAICredits).toBe('function');
    });

    it('should export getUserRateLimitKey helper', () => {
      expect(getUserRateLimitKey).toBeDefined();
      expect(typeof getUserRateLimitKey).toBe('function');
    });

    it('should export hasRole helper', () => {
      expect(hasRole).toBeDefined();
      expect(typeof hasRole).toBe('function');
    });

    it('should export hasAnyRole helper', () => {
      expect(hasAnyRole).toBeDefined();
      expect(typeof hasAnyRole).toBe('function');
    });

    it('should export isAdmin helper', () => {
      expect(isAdmin).toBeDefined();
      expect(typeof isAdmin).toBe('function');
    });

    it('should export canAccess helper', () => {
      expect(canAccess).toBeDefined();
      expect(typeof canAccess).toBe('function');
    });
  });

  // ==========================================================================
  // Helper Function Tests (Pure functions, no mocking needed)
  // ==========================================================================

  describe('Helper Functions', () => {
    describe('hasRole', () => {
      it('should return true when user has the specified role', () => {
        const user = createMockUser({ role: 'admin' });
        expect(hasRole(user, 'admin')).toBe(true);
      });

      it('should return false when user has different role', () => {
        const user = createMockUser({ role: 'customer' });
        expect(hasRole(user, 'admin')).toBe(false);
      });

      it('should return false for null user', () => {
        expect(hasRole(null, 'admin')).toBe(false);
      });

      it('should handle all role types', () => {
        const roles = ['customer', 'trade', 'admin', 'super-admin'] as const;
        for (const role of roles) {
          const user = createMockUser({ role });
          expect(hasRole(user, role)).toBe(true);
        }
      });
    });

    describe('hasAnyRole', () => {
      it('should return true when user has one of the specified roles', () => {
        const user = createMockUser({ role: 'admin' });
        expect(hasAnyRole(user, ['admin', 'super-admin'])).toBe(true);
      });

      it('should return true for first matching role', () => {
        const user = createMockUser({ role: 'customer' });
        expect(hasAnyRole(user, ['customer', 'trade'])).toBe(true);
      });

      it('should return false when user has none of the specified roles', () => {
        const user = createMockUser({ role: 'customer' });
        expect(hasAnyRole(user, ['admin', 'super-admin'])).toBe(false);
      });

      it('should return false for null user', () => {
        expect(hasAnyRole(null, ['admin', 'customer'])).toBe(false);
      });

      it('should return false for empty roles array', () => {
        const user = createMockUser({ role: 'admin' });
        expect(hasAnyRole(user, [])).toBe(false);
      });

      it('should handle single role array', () => {
        const user = createMockUser({ role: 'trade' });
        expect(hasAnyRole(user, ['trade'])).toBe(true);
      });
    });

    describe('isAdmin', () => {
      it('should return true for admin role', () => {
        const user = createMockUser({ role: 'admin' });
        expect(isAdmin(user)).toBe(true);
      });

      it('should return true for super-admin role', () => {
        const user = createMockUser({ role: 'super-admin' });
        expect(isAdmin(user)).toBe(true);
      });

      it('should return false for customer role', () => {
        const user = createMockUser({ role: 'customer' });
        expect(isAdmin(user)).toBe(false);
      });

      it('should return false for trade role', () => {
        const user = createMockUser({ role: 'trade' });
        expect(isAdmin(user)).toBe(false);
      });

      it('should return false for null user', () => {
        expect(isAdmin(null)).toBe(false);
      });
    });

    describe('canAccess', () => {
      it('should return true when user owns the resource', () => {
        const user = createMockUser({ id: 'user-123' });
        expect(canAccess(user, 'user-123')).toBe(true);
      });

      it('should return false when user does not own the resource', () => {
        const user = createMockUser({ id: 'user-123' });
        expect(canAccess(user, 'user-456')).toBe(false);
      });

      it('should return true for admin accessing any resource', () => {
        const admin = createMockUser({ id: 'admin-1', role: 'admin' });
        expect(canAccess(admin, 'user-456')).toBe(true);
      });

      it('should return true for super-admin accessing any resource', () => {
        const superAdmin = createMockUser({ id: 'admin-1', role: 'super-admin' });
        expect(canAccess(superAdmin, 'user-456')).toBe(true);
      });

      it('should return false for null user', () => {
        expect(canAccess(null, 'user-123')).toBe(false);
      });

      it('should handle trade role without admin access', () => {
        const trade = createMockUser({ id: 'trade-1', role: 'trade' });
        expect(canAccess(trade, 'user-456')).toBe(false);
        expect(canAccess(trade, 'trade-1')).toBe(true);
      });
    });

    describe('getUserRateLimitKey', () => {
      it('should return user-based key for authenticated user', () => {
        const mockContext = {
          get: (key: 'user') => createMockUser({ id: 'user-123' }),
          req: { header: () => undefined },
        };
        expect(getUserRateLimitKey(mockContext)).toBe('user:user-123');
      });

      it('should return IP-based key for unauthenticated user', () => {
        const mockContext = {
          get: () => null,
          req: { header: (name: string) => name === 'x-forwarded-for' ? '192.168.1.1' : undefined },
        };
        expect(getUserRateLimitKey(mockContext)).toBe('ip:192.168.1.1');
      });

      it('should use x-real-ip header as fallback', () => {
        const mockContext = {
          get: () => null,
          req: { header: (name: string) => name === 'x-real-ip' ? '10.0.0.1' : undefined },
        };
        expect(getUserRateLimitKey(mockContext)).toBe('ip:10.0.0.1');
      });

      it('should use first IP from x-forwarded-for', () => {
        const mockContext = {
          get: () => null,
          req: { header: (name: string) => name === 'x-forwarded-for' ? '192.168.1.1, 10.0.0.1, 172.16.0.1' : undefined },
        };
        expect(getUserRateLimitKey(mockContext)).toBe('ip:192.168.1.1');
      });

      it('should trim whitespace from IPs', () => {
        const mockContext = {
          get: () => null,
          req: { header: (name: string) => name === 'x-forwarded-for' ? '  192.168.1.1  ' : undefined },
        };
        expect(getUserRateLimitKey(mockContext)).toBe('ip:192.168.1.1');
      });

      it('should return unknown for missing IP', () => {
        const mockContext = {
          get: () => null,
          req: { header: () => undefined },
        };
        expect(getUserRateLimitKey(mockContext)).toBe('ip:unknown');
      });

      it('should prefer user ID over IP when both available', () => {
        const mockContext = {
          get: (key: 'user') => createMockUser({ id: 'user-456' }),
          req: { header: (name: string) => name === 'x-forwarded-for' ? '192.168.1.1' : undefined },
        };
        expect(getUserRateLimitKey(mockContext)).toBe('user:user-456');
      });
    });
  });

  // ==========================================================================
  // requireAuth Middleware Tests
  // ==========================================================================

  describe('requireAuth Middleware', () => {
    it('should be defined', () => {
      expect(requireAuth).toBeDefined();
      expect(typeof requireAuth).toBe('function');
    });

    it('should return 401 for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected');
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body).toHaveProperty('error', 'Unauthorized');
      expect(body).toHaveProperty('message');
    });

    it('should have correct error message for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected');
      const body = await res.json();
      expect(body.message).toContain('Authentication required');
    });

    it('should return JSON response for auth failure', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should not call next handler if unauthenticated', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      const nextHandler = vi.fn();

      testApp.get('/protected', requireAuth, (c) => {
        nextHandler();
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      await testApp.request('/protected');
      expect(nextHandler).not.toHaveBeenCalled();
    });

    it('should handle multiple protected routes', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected1', requireAuth, (c) => c.json({ route: 1 }));
      testApp.get('/protected2', requireAuth, (c) => c.json({ route: 2 }));
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res1 = await testApp.request('/protected1');
      const res2 = await testApp.request('/protected2');

      expect(res1.status).toBe(401);
      expect(res2.status).toBe(401);
    });

    it('should be usable on POST routes', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.post('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('should be usable on PUT routes', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.put('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected', { method: 'PUT' });
      expect(res.status).toBe(401);
    });

    it('should be usable on DELETE routes', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.delete('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected', { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it('should be usable on PATCH routes', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.patch('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected', { method: 'PATCH' });
      expect(res.status).toBe(401);
    });

    it('should handle requests with invalid session cookies', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected', {
        headers: {
          Cookie: 'chobii.session=invalid-token',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should handle requests with malformed cookies', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected', {
        headers: {
          Cookie: 'malformed cookie data',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should handle requests with expired sessions', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected', {
        headers: {
          Cookie: 'chobii.session=expired-token',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // optionalAuth Middleware Tests
  // ==========================================================================

  describe('optionalAuth Middleware', () => {
    it('should be defined', () => {
      expect(optionalAuth).toBeDefined();
      expect(typeof optionalAuth).toBe('function');
    });

    it('should allow unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      testApp.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await testApp.request('/optional');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('message', 'success');
    });

    it('should call next handler for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      const nextHandler = vi.fn((c: Context) => {
        return c.json({ message: 'success' });
      });

      testApp.get('/optional', optionalAuth, nextHandler);

      await testApp.request('/optional');
      expect(nextHandler).toHaveBeenCalled();
    });

    it('should set user to null for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      testApp.get('/optional', optionalAuth, (c) => {
        const user = c.get('user');
        return c.json({ user });
      });

      const res = await testApp.request('/optional');
      const body = await res.json();
      expect(body.user).toBeNull();
    });

    it('should not block requests without cookies', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      testApp.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await testApp.request('/optional');
      expect(res.status).toBe(200);
    });

    it('should handle invalid cookies gracefully', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      testApp.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await testApp.request('/optional', {
        headers: {
          Cookie: 'invalid cookie',
        },
      });

      expect(res.status).toBe(200);
    });

    it('should handle expired sessions gracefully', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      testApp.get('/optional', optionalAuth, (c) => {
        const user = c.get('user');
        return c.json({ hasUser: !!user });
      });

      const res = await testApp.request('/optional', {
        headers: {
          Cookie: 'chobii.session=expired',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasUser).toBe(false);
    });

    it('should be usable on all HTTP methods', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      testApp.get('/optional', optionalAuth, (c) => c.json({ method: 'GET' }));
      testApp.post('/optional', optionalAuth, (c) => c.json({ method: 'POST' }));

      const getRes = await testApp.request('/optional', { method: 'GET' });
      const postRes = await testApp.request('/optional', { method: 'POST' });

      expect(getRes.status).toBe(200);
      expect(postRes.status).toBe(200);
    });

    it('should not throw errors for malformed requests', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      testApp.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      // Should not throw
      const res = await testApp.request('/optional', {
        headers: {
          Cookie: 'chobii.session=malformed;;;',
        },
      });

      expect(res.status).toBe(200);
    });
  });

  // ==========================================================================
  // requireRole Middleware Tests
  // ==========================================================================

  describe('requireRole Middleware', () => {
    it('should be defined', () => {
      expect(requireRole).toBeDefined();
      expect(typeof requireRole).toBe('function');
    });

    it('should be a factory function', () => {
      const middleware = requireRole('admin');
      expect(typeof middleware).toBe('function');
    });

    it('should accept array of roles', () => {
      const middleware = requireRole(['admin', 'super-admin']);
      expect(middleware).toBeDefined();
    });

    it('should return 401 for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin-only', requireRole('admin'), (c) => {
        return c.json({ message: 'admin area' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/admin-only');
      expect(res.status).toBe(401);
    });

    it('should return 403 for wrong role', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin-only', (c, next) => {
        // Mock user context with customer role
        c.set('user', createMockUser({ role: 'customer' }));
        c.set('session', createMockSession());
        return next();
      }, requireRole('admin'), (c) => {
        return c.json({ message: 'admin area' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/admin-only');
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body).toHaveProperty('error', 'Forbidden');
    });

    it('should include required role in error message', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin-only', (c, next) => {
        c.set('user', createMockUser({ role: 'customer' }));
        c.set('session', createMockSession());
        return next();
      }, requireRole('admin'), (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/admin-only');
      const body = await res.json();
      expect(body.message).toContain('admin');
    });

    it('should allow requests with correct role', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin-only', (c, next) => {
        c.set('user', createMockUser({ role: 'admin' }));
        c.set('session', createMockSession());
        return next();
      }, requireRole('admin'), (c) => {
        return c.json({ message: 'admin area' });
      });

      const res = await testApp.request('/admin-only');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('message', 'admin area');
    });

    it('should allow access when user has one of multiple allowed roles', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin-area', (c, next) => {
        c.set('user', createMockUser({ role: 'super-admin' }));
        c.set('session', createMockSession());
        return next();
      }, requireRole(['admin', 'super-admin']), (c) => {
        return c.json({ message: 'success' });
      });

      const res = await testApp.request('/admin-area');
      expect(res.status).toBe(200);
    });

    it('should handle null user context', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireRole('admin'), (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // requireAdmin Middleware Tests
  // ==========================================================================

  describe('requireAdmin Middleware', () => {
    it('should be defined', () => {
      expect(requireAdmin).toBeDefined();
      expect(typeof requireAdmin).toBe('function');
    });

    it('should return 401 for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin', requireAdmin, (c) => {
        return c.json({ message: 'admin area' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/admin');
      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin', (c, next) => {
        c.set('user', createMockUser({ role: 'customer' }));
        c.set('session', createMockSession());
        return next();
      }, requireAdmin, (c) => {
        return c.json({ message: 'admin area' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/admin');
      expect(res.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin', (c, next) => {
        c.set('user', createMockUser({ role: 'admin' }));
        c.set('session', createMockSession());
        return next();
      }, requireAdmin, (c) => {
        return c.json({ message: 'admin dashboard' });
      });

      const res = await testApp.request('/admin');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('message', 'admin dashboard');
    });

    it('should allow super-admin users', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin', (c, next) => {
        c.set('user', createMockUser({ role: 'super-admin' }));
        c.set('session', createMockSession());
        return next();
      }, requireAdmin, (c) => {
        return c.json({ message: 'admin dashboard' });
      });

      const res = await testApp.request('/admin');
      expect(res.status).toBe(200);
    });

    it('should deny trade users', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin', (c, next) => {
        c.set('user', createMockUser({ role: 'trade' }));
        c.set('session', createMockSession());
        return next();
      }, requireAdmin, (c) => {
        return c.json({ message: 'admin area' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/admin');
      expect(res.status).toBe(403);
    });

    it('should return JSON error response', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/admin', requireAdmin, (c) => {
        return c.json({ message: 'admin area' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/admin');
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });
  });

  // ==========================================================================
  // requireVerified Middleware Tests
  // ==========================================================================

  describe('requireVerified Middleware', () => {
    it('should be defined', () => {
      expect(requireVerified).toBeDefined();
      expect(typeof requireVerified).toBe('function');
    });

    it('should return 401 for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/verified-only', requireVerified, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/verified-only');
      expect(res.status).toBe(401);
    });

    it('should return 403 for unverified emails', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/verified-only', (c, next) => {
        c.set('user', createMockUser({ emailVerified: false }));
        c.set('session', createMockSession());
        return next();
      }, requireVerified, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/verified-only');
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.message).toContain('Email verification required');
    });

    it('should allow verified emails', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/verified-only', (c, next) => {
        c.set('user', createMockUser({ emailVerified: true }));
        c.set('session', createMockSession());
        return next();
      }, requireVerified, (c) => {
        return c.json({ message: 'verified user content' });
      });

      const res = await testApp.request('/verified-only');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('message', 'verified user content');
    });

    it('should return JSON error response', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/verified-only', requireVerified, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/verified-only');
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  // ==========================================================================
  // requireTrade Middleware Tests
  // ==========================================================================

  describe('requireTrade Middleware', () => {
    it('should be defined', () => {
      expect(requireTrade).toBeDefined();
      expect(typeof requireTrade).toBe('function');
    });

    it('should return 401 for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/trade', requireTrade, (c) => {
        return c.json({ message: 'trade area' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/trade');
      expect(res.status).toBe(401);
    });

    it('should allow trade role', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/trade', (c, next) => {
        c.set('user', createMockUser({ role: 'trade' }));
        c.set('session', createMockSession());
        return next();
      }, requireTrade, (c) => {
        return c.json({ message: 'trade content' });
      });

      const res = await testApp.request('/trade');
      expect(res.status).toBe(200);
    });

    it('should allow admin role', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/trade', (c, next) => {
        c.set('user', createMockUser({ role: 'admin' }));
        c.set('session', createMockSession());
        return next();
      }, requireTrade, (c) => {
        return c.json({ message: 'trade content' });
      });

      const res = await testApp.request('/trade');
      expect(res.status).toBe(200);
    });

    it('should allow super-admin role', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/trade', (c, next) => {
        c.set('user', createMockUser({ role: 'super-admin' }));
        c.set('session', createMockSession());
        return next();
      }, requireTrade, (c) => {
        return c.json({ message: 'trade content' });
      });

      const res = await testApp.request('/trade');
      expect(res.status).toBe(200);
    });

    it('should allow customer with approved trade status', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/trade', (c, next) => {
        c.set('user', createMockUser({ role: 'customer', tradeStatus: 'approved' }));
        c.set('session', createMockSession());
        return next();
      }, requireTrade, (c) => {
        return c.json({ message: 'trade content' });
      });

      const res = await testApp.request('/trade');
      expect(res.status).toBe(200);
    });

    it('should deny customer without trade access', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/trade', (c, next) => {
        c.set('user', createMockUser({ role: 'customer', tradeStatus: 'none' }));
        c.set('session', createMockSession());
        return next();
      }, requireTrade, (c) => {
        return c.json({ message: 'trade content' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/trade');
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toBe('Trade program access required');
    });

    it('should deny customer with pending trade status', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/trade', (c, next) => {
        c.set('user', createMockUser({ role: 'customer', tradeStatus: 'pending' }));
        c.set('session', createMockSession());
        return next();
      }, requireTrade, (c) => {
        return c.json({ message: 'trade content' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/trade');
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // requireAICredits Middleware Tests
  // ==========================================================================

  describe('requireAICredits Middleware', () => {
    it('should be defined', () => {
      expect(requireAICredits).toBeDefined();
      expect(typeof requireAICredits).toBe('function');
    });

    it('should be a factory function', () => {
      const middleware = requireAICredits(1);
      expect(typeof middleware).toBe('function');
    });

    it('should use default of 1 credit when no argument provided', () => {
      const middleware = requireAICredits();
      expect(middleware).toBeDefined();
    });

    it('should return 401 for unauthenticated requests', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/ai', requireAICredits(1), (c) => {
        return c.json({ message: 'ai content' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/ai');
      expect(res.status).toBe(401);
    });

    it('should allow user with sufficient credits', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/ai', (c, next) => {
        c.set('user', createMockUser({ aiCreditsRemaining: 5 }));
        c.set('session', createMockSession());
        return next();
      }, requireAICredits(1), (c) => {
        return c.json({ message: 'ai content' });
      });

      const res = await testApp.request('/ai');
      expect(res.status).toBe(200);
    });

    it('should deny user with insufficient credits', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/ai', (c, next) => {
        c.set('user', createMockUser({ aiCreditsRemaining: 0 }));
        c.set('session', createMockSession());
        return next();
      }, requireAICredits(1), (c) => {
        return c.json({ message: 'ai content' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/ai');
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('Insufficient AI credits');
    });

    it('should deny user with fewer credits than required', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/ai', (c, next) => {
        c.set('user', createMockUser({ aiCreditsRemaining: 3 }));
        c.set('session', createMockSession());
        return next();
      }, requireAICredits(5), (c) => {
        return c.json({ message: 'ai content' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/ai');
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toBe('Insufficient AI credits. Required: 5, Available: 3');
    });

    it('should allow unlimited tier users regardless of credits', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/ai', (c, next) => {
        c.set('user', createMockUser({
          aiCreditsRemaining: 0,
          aiSubscriptionTier: 'unlimited',
        }));
        c.set('session', createMockSession());
        return next();
      }, requireAICredits(100), (c) => {
        return c.json({ message: 'ai content' });
      });

      const res = await testApp.request('/ai');
      expect(res.status).toBe(200);
    });

    it('should handle undefined credits as 0', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/ai', (c, next) => {
        c.set('user', createMockUser({ aiCreditsRemaining: undefined }));
        c.set('session', createMockSession());
        return next();
      }, requireAICredits(1), (c) => {
        return c.json({ message: 'ai content' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/ai');
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // Middleware Composition Tests
  // ==========================================================================

  describe('Middleware Composition', () => {
    it('should combine requireAuth with requireAdmin', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/super-admin', requireAuth, requireAdmin, (c) => {
        return c.json({ message: 'super admin area' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/super-admin');
      expect(res.status).toBe(401); // Fails at requireAuth
    });

    it('should combine optionalAuth with requireRole', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/premium', optionalAuth, requireRole('admin'), (c) => {
        return c.json({ message: 'premium content' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/premium');
      expect(res.status).toBe(401);
    });

    it('should use multiple middleware in sequence', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get(
        '/protected',
        optionalAuth,
        (c, next) => {
          // Mock user
          c.set('user', createMockUser({ emailVerified: true, role: 'admin' }));
          c.set('session', createMockSession());
          return next();
        },
        requireVerified,
        requireAdmin,
        (c) => {
          return c.json({ message: 'super protected' });
        }
      );

      const res = await testApp.request('/protected');
      expect(res.status).toBe(200);
    });

    it('should short-circuit on first failure', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      const handler3 = vi.fn((c: Context) => c.json({ message: 'success' }));

      testApp.get(
        '/protected',
        requireAuth, // Fails here
        requireAdmin,
        handler3
      );
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      await testApp.request('/protected');
      expect(handler3).not.toHaveBeenCalled();
    });

    it('should chain requireVerified with requireAICredits', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get(
        '/ai-generate',
        (c, next) => {
          c.set('user', createMockUser({
            emailVerified: true,
            aiCreditsRemaining: 10,
          }));
          c.set('session', createMockSession());
          return next();
        },
        requireVerified,
        requireAICredits(5),
        (c) => {
          return c.json({ message: 'ai generated' });
        }
      );

      const res = await testApp.request('/ai-generate');
      expect(res.status).toBe(200);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle errors gracefully in requireAuth', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected', {
        headers: {
          Cookie: 'chobii.session=malformed;;;data',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });

    it('should handle errors gracefully in optionalAuth', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables }>();
      testApp.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await testApp.request('/optional', {
        headers: {
          Cookie: 'chobii.session=malformed',
        },
      });

      // Should not fail, just set user to null
      expect(res.status).toBe(200);
    });

    it('should return proper error structure', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/protected');
      const body = await res.json();

      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('code');
      expect(typeof body.error).toBe('string');
      expect(typeof body.message).toBe('string');
    });

    it('should handle missing user context', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/role-check', requireRole('admin'), (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const res = await testApp.request('/role-check');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration Tests', () => {
    it('should work with real Hono app routes', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      const api = new Hono();

      api.get('/public', (c) => c.json({ public: true }));
      api.get('/protected', requireAuth, (c) => c.json({ protected: true }));

      testApp.route('/api', api);
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const publicRes = await testApp.request('/api/public');
      const protectedRes = await testApp.request('/api/protected');

      expect(publicRes.status).toBe(200);
      expect(protectedRes.status).toBe(401);
    });

    it('should maintain context across middleware', async () => {
      const testApp = new Hono<{ Variables: OptionalAuthVariables & { custom: string } }>();
      testApp.get(
        '/test',
        optionalAuth,
        (c, next) => {
          c.set('custom', 'value');
          return next();
        },
        (c) => {
          const user = c.get('user');
          const custom = c.get('custom');
          return c.json({ user, custom });
        }
      );

      const res = await testApp.request('/test');
      const body = await res.json();

      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('custom', 'value');
    });

    it('should support route groups with middleware', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      const adminRoutes = new Hono<{ Variables: AuthVariables }>();

      adminRoutes.use('*', (c, next) => {
        c.set('user', createMockUser({ role: 'admin' }));
        c.set('session', createMockSession());
        return next();
      });

      adminRoutes.use('*', requireAdmin);

      adminRoutes.get('/dashboard', (c) => c.json({ page: 'dashboard' }));
      adminRoutes.get('/users', (c) => c.json({ page: 'users' }));

      testApp.route('/admin', adminRoutes);

      const dashRes = await testApp.request('/admin/dashboard');
      const usersRes = await testApp.request('/admin/users');

      expect(dashRes.status).toBe(200);
      expect(usersRes.status).toBe(200);
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('Performance', () => {
    it('should handle middleware quickly', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const start = Date.now();
      await testApp.request('/protected');
      const duration = Date.now() - start;

      // Should respond quickly even with middleware
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple middleware efficiently', async () => {
      const testApp = new Hono<{ Variables: AuthVariables }>();
      testApp.get(
        '/protected',
        optionalAuth,
        requireAuth,
        requireAdmin,
        requireVerified,
        (c) => {
          return c.json({ message: 'success' });
        }
      );
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return err.getResponse();
        }
        return c.json({ error: err.message }, 500);
      });

      const start = Date.now();
      await testApp.request('/protected');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(150);
    });
  });

  // ==========================================================================
  // Type Definition Tests
  // ==========================================================================

  describe('Type Definitions', () => {
    it('should export AuthUser type with correct shape', () => {
      const user: AuthUser = createMockUser();
      expect(user.id).toBeDefined();
      expect(user.name).toBeDefined();
      expect(user.email).toBeDefined();
      expect(user.emailVerified).toBeDefined();
      expect(user.role).toBeDefined();
    });

    it('should export AuthSession type with correct shape', () => {
      const session: AuthSession = createMockSession();
      expect(session.id).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.userId).toBeDefined();
      expect(session.expiresAt).toBeDefined();
    });

    it('should export AuthVariables type', () => {
      const vars: AuthVariables = {
        user: createMockUser(),
        session: createMockSession(),
      };
      expect(vars.user).toBeDefined();
      expect(vars.session).toBeDefined();
    });

    it('should export OptionalAuthVariables type', () => {
      const vars: OptionalAuthVariables = {
        user: null,
        session: null,
      };
      expect(vars.user).toBeNull();
      expect(vars.session).toBeNull();
    });
  });
});
