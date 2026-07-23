/**
 * Role-based access tests for admin product routes
 *
 * Verifies the content-manager role can manage products but cannot
 * reach other admin areas (orders), and lower roles stay locked out.
 *
 * Mocks Better Auth's getSession so each test can choose the caller's role.
 *
 * @see packages/api/src/routes/admin/products.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import '../../setup';

const mockGetSession = vi.fn();

vi.mock('../../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

/**
 * Build a session object for a user with the given role
 */
function sessionFor(role: string) {
  const now = new Date();
  return {
    user: {
      id: 'role-test-user',
      name: 'Role Test User',
      email: 'role-test@example.com',
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role,
      status: 'active',
    },
    session: {
      id: 'role-test-session',
      token: 'role-test-token',
      userId: 'role-test-user',
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function buildApp(): Promise<Hono> {
  const { adminProductsApp } = await import('../../../src/routes/admin/products');
  const { adminOrdersApp } = await import('../../../src/routes/admin/orders');

  const app = new Hono();
  app.route('/api/admin/products', adminProductsApp);
  app.route('/api/admin/orders', adminOrdersApp);
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    return c.json({ error: err.message }, 500);
  });
  return app;
}

describe('Admin products role-based access', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it('allows content-manager to list admin products', async () => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'));
    const app = await buildApp();

    const res = await app.request('/api/admin/products');
    expect(res.status).toBe(200);
  });

  it('allows admin to list admin products (unchanged)', async () => {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await app.request('/api/admin/products');
    expect(res.status).toBe(200);
  });

  it('rejects customer with 403', async () => {
    mockGetSession.mockResolvedValue(sessionFor('customer'));
    const app = await buildApp();

    const res = await app.request('/api/admin/products');
    expect(res.status).toBe(403);
  });

  it('rejects trade with 403', async () => {
    mockGetSession.mockResolvedValue(sessionFor('trade'));
    const app = await buildApp();

    const res = await app.request('/api/admin/products');
    expect(res.status).toBe(403);
  });

  it('content-manager cannot access admin orders (403)', async () => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'));
    const app = await buildApp();

    const res = await app.request('/api/admin/orders');
    expect(res.status).toBe(403);
  });
});
