import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono, Context } from 'hono';
import {
  requireAuth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireEmailVerified,
  authHandler,
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
 * - requireEmailVerified middleware (email verification required)
 * - authHandler (Better Auth route handler)
 * - Integration with Hono context
 * - Error handling and edge cases
 * - Session attachment to context
 *
 * @see https://www.better-auth.com/docs
 * @see https://hono.dev/docs/guides/middleware
 */

describe('Auth Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  describe('requireAuth Middleware', () => {
    it('should be defined', () => {
      expect(requireAuth).toBeDefined();
      expect(typeof requireAuth).toBe('function');
    });

    it('should return 401 for unauthenticated requests', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected');
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body).toHaveProperty('error', 'Unauthorized');
      expect(body).toHaveProperty('message');
    });

    it('should have correct error message for unauthenticated requests', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected');
      const body = await res.json();
      expect(body.message).toContain('Authentication required');
    });

    it('should return JSON response for auth failure', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should not call next handler if unauthenticated', async () => {
      const nextHandler = vi.fn();

      app.get('/protected', requireAuth, (c) => {
        nextHandler();
        return c.json({ message: 'success' });
      });

      await app.request('/protected');
      expect(nextHandler).not.toHaveBeenCalled();
    });

    it('should handle multiple protected routes', async () => {
      app.get('/protected1', requireAuth, (c) => c.json({ route: 1 }));
      app.get('/protected2', requireAuth, (c) => c.json({ route: 2 }));

      const res1 = await app.request('/protected1');
      const res2 = await app.request('/protected2');

      expect(res1.status).toBe(401);
      expect(res2.status).toBe(401);
    });

    it('should be usable on POST routes', async () => {
      app.post('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('should be usable on PUT routes', async () => {
      app.put('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected', { method: 'PUT' });
      expect(res.status).toBe(401);
    });

    it('should be usable on DELETE routes', async () => {
      app.delete('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected', { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it('should be usable on PATCH routes', async () => {
      app.patch('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected', { method: 'PATCH' });
      expect(res.status).toBe(401);
    });

    it('should handle requests with invalid session cookies', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected', {
        headers: {
          Cookie: 'masonart.session=invalid-token',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should handle requests with malformed cookies', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected', {
        headers: {
          Cookie: 'malformed cookie data',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should handle requests with expired sessions', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected', {
        headers: {
          Cookie: 'masonart.session=expired-token',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('optionalAuth Middleware', () => {
    it('should be defined', () => {
      expect(optionalAuth).toBeDefined();
      expect(typeof optionalAuth).toBe('function');
    });

    it('should allow unauthenticated requests', async () => {
      app.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/optional');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('message', 'success');
    });

    it('should call next handler for unauthenticated requests', async () => {
      const nextHandler = vi.fn((c: Context) => {
        return c.json({ message: 'success' });
      });

      app.get('/optional', optionalAuth, nextHandler);

      await app.request('/optional');
      expect(nextHandler).toHaveBeenCalled();
    });

    it('should set auth to null for unauthenticated requests', async () => {
      app.get('/optional', optionalAuth, (c) => {
        const auth = c.get('auth');
        return c.json({ auth });
      });

      const res = await app.request('/optional');
      const body = await res.json();
      expect(body.auth).toBeNull();
    });

    it('should not block requests without cookies', async () => {
      app.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/optional');
      expect(res.status).toBe(200);
    });

    it('should handle invalid cookies gracefully', async () => {
      app.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/optional', {
        headers: {
          Cookie: 'invalid cookie',
        },
      });

      expect(res.status).toBe(200);
    });

    it('should handle expired sessions gracefully', async () => {
      app.get('/optional', optionalAuth, (c) => {
        const auth = c.get('auth');
        return c.json({ hasAuth: !!auth });
      });

      const res = await app.request('/optional', {
        headers: {
          Cookie: 'masonart.session=expired',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasAuth).toBe(false);
    });

    it('should be usable on all HTTP methods', async () => {
      app.get('/optional', optionalAuth, (c) => c.json({ method: 'GET' }));
      app.post('/optional', optionalAuth, (c) => c.json({ method: 'POST' }));

      const getRes = await app.request('/optional', { method: 'GET' });
      const postRes = await app.request('/optional', { method: 'POST' });

      expect(getRes.status).toBe(200);
      expect(postRes.status).toBe(200);
    });

    it('should not throw errors for malformed requests', async () => {
      app.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      // Should not throw
      const res = await app.request('/optional', {
        headers: {
          Cookie: 'masonart.session=malformed;;;',
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('requireRole Middleware', () => {
    it('should be defined', () => {
      expect(requireRole).toBeDefined();
      expect(typeof requireRole).toBe('function');
    });

    it('should be a factory function', () => {
      const middleware = requireRole('admin');
      expect(typeof middleware).toBe('function');
    });

    it('should return 401 for unauthenticated requests', async () => {
      app.get('/admin-only', requireRole('admin'), (c) => {
        return c.json({ message: 'admin area' });
      });

      const res = await app.request('/admin-only');
      expect(res.status).toBe(401);
    });

    it('should return 403 for wrong role', async () => {
      app.get('/admin-only', (c, next) => {
        // Mock auth context with customer role
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            role: 'customer',
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        return next();
      }, requireRole('admin'), (c) => {
        return c.json({ message: 'admin area' });
      });

      const res = await app.request('/admin-only');
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body).toHaveProperty('error', 'Forbidden');
    });

    it('should include required role in error message', async () => {
      app.get('/moderator-only', (c, next) => {
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            role: 'customer',
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireRole('moderator'), (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/moderator-only');
      const body = await res.json();
      expect(body.message).toContain('moderator');
    });

    it('should allow requests with correct role', async () => {
      app.get('/admin-only', (c, next) => {
        c.set('auth', {
          user: {
            id: 'admin-1',
            email: 'admin@example.com',
            role: 'admin',
          },
          session: {
            id: 'session-1',
            userId: 'admin-1',
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        return next();
      }, requireRole('admin'), (c) => {
        return c.json({ message: 'admin area' });
      });

      const res = await app.request('/admin-only');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('message', 'admin area');
    });

    it('should support custom roles', async () => {
      app.get('/custom-role', (c, next) => {
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            role: 'premium_member',
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireRole('premium_member'), (c) => {
        return c.json({ message: 'premium content' });
      });

      const res = await app.request('/custom-role');
      expect(res.status).toBe(200);
    });

    it('should treat missing role as customer', async () => {
      app.get('/customer-only', (c, next) => {
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            // role not set
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireRole('customer'), (c) => {
        return c.json({ message: 'customer area' });
      });

      const res = await app.request('/customer-only');
      expect(res.status).toBe(200);
    });

    it('should handle null auth context', async () => {
      app.get('/protected', (c, next) => {
        c.set('auth', null);
        return next();
      }, requireRole('admin'), (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected');
      expect(res.status).toBe(401);
    });

    it('should handle auth context without user', async () => {
      app.get('/protected', (c, next) => {
        c.set('auth', {
          user: null,
          session: { id: 'session-1', userId: 'user-1', expiresAt: new Date() },
        });
        return next();
      }, requireRole('admin'), (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected');
      expect(res.status).toBe(401);
    });
  });

  describe('requireAdmin Middleware', () => {
    it('should be defined', () => {
      expect(requireAdmin).toBeDefined();
      expect(typeof requireAdmin).toBe('function');
    });

    it('should return 401 for unauthenticated requests', async () => {
      app.get('/admin', requireAdmin, (c) => {
        return c.json({ message: 'admin area' });
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      app.get('/admin', (c, next) => {
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            role: 'customer',
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireAdmin, (c) => {
        return c.json({ message: 'admin area' });
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.message).toContain('Admin access required');
    });

    it('should allow admin users', async () => {
      app.get('/admin', (c, next) => {
        c.set('auth', {
          user: {
            id: 'admin-1',
            email: 'admin@example.com',
            role: 'admin',
          },
          session: {
            id: 'session-1',
            userId: 'admin-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireAdmin, (c) => {
        return c.json({ message: 'admin dashboard' });
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('message', 'admin dashboard');
    });

    it('should work with multiple admin routes', async () => {
      app.get('/admin/users', (c, next) => {
        c.set('auth', {
          user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
          session: { id: 'session-1', userId: 'admin-1', expiresAt: new Date() },
        });
        return next();
      }, requireAdmin, (c) => c.json({ route: 'users' }));

      app.get('/admin/orders', (c, next) => {
        c.set('auth', {
          user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
          session: { id: 'session-1', userId: 'admin-1', expiresAt: new Date() },
        });
        return next();
      }, requireAdmin, (c) => c.json({ route: 'orders' }));

      const res1 = await app.request('/admin/users');
      const res2 = await app.request('/admin/orders');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('should handle missing role as non-admin', async () => {
      app.get('/admin', (c, next) => {
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            // role not set, should default to customer
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireAdmin, (c) => {
        return c.json({ message: 'admin area' });
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(403);
    });

    it('should return JSON error response', async () => {
      app.get('/admin', requireAdmin, (c) => {
        return c.json({ message: 'admin area' });
      });

      const res = await app.request('/admin');
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });
  });

  describe('requireEmailVerified Middleware', () => {
    it('should be defined', () => {
      expect(requireEmailVerified).toBeDefined();
      expect(typeof requireEmailVerified).toBe('function');
    });

    it('should return 401 for unauthenticated requests', async () => {
      app.get('/verified-only', requireEmailVerified, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/verified-only');
      expect(res.status).toBe(401);
    });

    it('should return 403 for unverified emails', async () => {
      app.get('/verified-only', (c, next) => {
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            emailVerified: false,
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireEmailVerified, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/verified-only');
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.message).toContain('Email verification required');
    });

    it('should allow verified emails', async () => {
      app.get('/verified-only', (c, next) => {
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            emailVerified: true,
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireEmailVerified, (c) => {
        return c.json({ message: 'verified user content' });
      });

      const res = await app.request('/verified-only');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('message', 'verified user content');
    });

    it('should treat undefined emailVerified as unverified', async () => {
      app.get('/verified-only', (c, next) => {
        c.set('auth', {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            // emailVerified not set
          },
          session: {
            id: 'session-1',
            userId: 'user-1',
            expiresAt: new Date(),
          },
        });
        return next();
      }, requireEmailVerified, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/verified-only');
      expect(res.status).toBe(403);
    });

    it('should return JSON error response', async () => {
      app.get('/verified-only', requireEmailVerified, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/verified-only');
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('authHandler', () => {
    it('should be defined', () => {
      expect(authHandler).toBeDefined();
      expect(typeof authHandler).toBe('function');
    });

    it('should handle auth requests', async () => {
      app.all('/api/auth/*', authHandler);

      const res = await app.request('/api/auth/session');
      expect(res).toBeDefined();
      expect(res).toBeInstanceOf(Response);
    });

    it('should return Response objects', async () => {
      app.all('/api/auth/*', authHandler);

      const res = await app.request('/api/auth/session');
      expect(res.status).toBeDefined();
      expect(typeof res.status).toBe('number');
    });

    it('should handle GET requests', async () => {
      app.get('/api/auth/session', authHandler);

      const res = await app.request('/api/auth/session');
      expect(res).toBeDefined();
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });

    it('should handle POST requests', async () => {
      app.post('/api/auth/sign-in', authHandler);

      const res = await app.request('/api/auth/sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'testpassword',
        }),
      });

      expect(res).toBeDefined();
      expect(res.status).toBeGreaterThanOrEqual(200);
    });

    it('should integrate with Better Auth', async () => {
      app.all('/api/auth/*', authHandler);

      const res = await app.request('/api/auth/session');
      // Should use Better Auth handler internally
      expect(res).toBeInstanceOf(Response);
    });
  });

  describe('Middleware Composition', () => {
    it('should combine requireAuth with requireAdmin', async () => {
      app.get('/super-admin', requireAuth, requireAdmin, (c) => {
        return c.json({ message: 'super admin area' });
      });

      const res = await app.request('/super-admin');
      expect(res.status).toBe(401); // Fails at requireAuth
    });

    it('should combine optionalAuth with requireRole', async () => {
      app.get('/premium', optionalAuth, requireRole('premium'), (c) => {
        return c.json({ message: 'premium content' });
      });

      const res = await app.request('/premium');
      expect(res.status).toBe(401);
    });

    it('should use multiple middleware in sequence', async () => {
      app.get(
        '/protected',
        optionalAuth,
        (c, next) => {
          // Mock auth
          c.set('auth', {
            user: { id: 'user-1', email: 'user@example.com', emailVerified: true, role: 'admin' },
            session: { id: 'session-1', userId: 'user-1', expiresAt: new Date() },
          });
          return next();
        },
        requireEmailVerified,
        requireAdmin,
        (c) => {
          return c.json({ message: 'super protected' });
        }
      );

      const res = await app.request('/protected');
      expect(res.status).toBe(200);
    });

    it('should short-circuit on first failure', async () => {
      const handler3 = vi.fn((c: Context) => c.json({ message: 'success' }));

      app.get(
        '/protected',
        requireAuth, // Fails here
        requireAdmin,
        handler3
      );

      await app.request('/protected');
      expect(handler3).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully in requireAuth', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected', {
        headers: {
          Cookie: 'masonart.session=malformed;;;data',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });

    it('should handle errors gracefully in optionalAuth', async () => {
      app.get('/optional', optionalAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/optional', {
        headers: {
          Cookie: 'masonart.session=malformed',
        },
      });

      // Should not fail, just set auth to null
      expect(res.status).toBe(200);
    });

    it('should return proper error structure', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/protected');
      const body = await res.json();

      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(typeof body.error).toBe('string');
      expect(typeof body.message).toBe('string');
    });

    it('should handle missing auth context', async () => {
      app.get('/role-check', requireRole('admin'), (c) => {
        return c.json({ message: 'success' });
      });

      const res = await app.request('/role-check');
      expect(res.status).toBe(401);
    });
  });

  describe('Integration Tests', () => {
    it('should work with real Hono app routes', async () => {
      const api = new Hono();

      api.get('/public', (c) => c.json({ public: true }));
      api.get('/protected', requireAuth, (c) => c.json({ protected: true }));

      app.route('/api', api);

      const publicRes = await app.request('/api/public');
      const protectedRes = await app.request('/api/protected');

      expect(publicRes.status).toBe(200);
      expect(protectedRes.status).toBe(401);
    });

    it('should maintain context across middleware', async () => {
      app.get(
        '/test',
        optionalAuth,
        (c, next) => {
          c.set('custom', 'value');
          return next();
        },
        (c) => {
          const auth = c.get('auth');
          const custom = c.get('custom');
          return c.json({ auth, custom });
        }
      );

      const res = await app.request('/test');
      const body = await res.json();

      expect(body).toHaveProperty('auth');
      expect(body).toHaveProperty('custom', 'value');
    });

    it('should support route groups with middleware', async () => {
      const adminRoutes = new Hono();

      adminRoutes.use('*', (c, next) => {
        c.set('auth', {
          user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
          session: { id: 'session-1', userId: 'admin-1', expiresAt: new Date() },
        });
        return next();
      });

      adminRoutes.use('*', requireAdmin);

      adminRoutes.get('/dashboard', (c) => c.json({ page: 'dashboard' }));
      adminRoutes.get('/users', (c) => c.json({ page: 'users' }));

      app.route('/admin', adminRoutes);

      const dashRes = await app.request('/admin/dashboard');
      const usersRes = await app.request('/admin/users');

      expect(dashRes.status).toBe(200);
      expect(usersRes.status).toBe(200);
    });
  });

  describe('Performance', () => {
    it('should handle middleware quickly', async () => {
      app.get('/protected', requireAuth, (c) => {
        return c.json({ message: 'success' });
      });

      const start = Date.now();
      await app.request('/protected');
      const duration = Date.now() - start;

      // Should respond quickly even with middleware
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple middleware efficiently', async () => {
      app.get(
        '/protected',
        optionalAuth,
        requireAuth,
        requireAdmin,
        requireEmailVerified,
        (c) => {
          return c.json({ message: 'success' });
        }
      );

      const start = Date.now();
      await app.request('/protected');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(150);
    });
  });
});
