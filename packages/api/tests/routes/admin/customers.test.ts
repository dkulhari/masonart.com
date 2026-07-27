/**
 * Tests for admin customers API endpoints
 *
 * - GET /api/admin/customers - List users (admin only)
 * - PUT /api/admin/customers/:id/role - Assign role, capped at content-manager
 *
 * Security invariants:
 * - Only 'customer' and 'content-manager' are assignable (Zod 400 otherwise)
 * - admin/super-admin targets cannot be modified (403)
 * - content-manager callers are rejected (requireAdmin gate)
 *
 * Mocks Better Auth's getSession for role selection; uses the real database
 * for target-user rows (seeded and cleaned per run).
 *
 * @see packages/api/src/routes/admin/customers.ts
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import '../../setup';

const mockGetSession = vi.fn();

vi.mock('../../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

const TARGET_CUSTOMER_ID = 'cust-role-test-target';
const TARGET_ADMIN_ID = 'admin-role-test-target';
const TARGET_SUPER_ADMIN_ID = 'superadmin-role-test-target';
const TARGET_TRADE_ID = 'trade-role-test-target';
const CALLER_ID = 'role-test-caller';

function sessionFor(role: string) {
  const now = new Date();
  return {
    user: {
      id: 'role-test-caller',
      name: 'Role Test Caller',
      email: 'role-test-caller@example.com',
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
      userId: 'role-test-caller',
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function buildApp(): Promise<Hono> {
  const { adminCustomersApp } = await import('../../../src/routes/admin/customers');
  const app = new Hono();
  app.route('/api/admin/customers', adminCustomersApp);
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    return c.json({ error: err.message }, 500);
  });
  return app;
}

async function seedTargets() {
  const { db } = await import('../../../src/database');
  const { users } = await import('../../../src/database/schema/users');
  await db
    .insert(users)
    .values([
      {
        id: TARGET_CUSTOMER_ID,
        name: 'Target Customer',
        email: 'target-customer-role-test@example.com',
        role: 'customer',
      },
      {
        id: TARGET_ADMIN_ID,
        name: 'Target Admin',
        email: 'target-admin-role-test@example.com',
        role: 'admin',
      },
      {
        id: TARGET_SUPER_ADMIN_ID,
        name: 'Target Super Admin',
        email: 'target-superadmin-role-test@example.com',
        role: 'super-admin',
      },
      {
        id: TARGET_TRADE_ID,
        name: 'Target Trade',
        email: 'target-trade-role-test@example.com',
        role: 'trade',
      },
      {
        // The caller must exist as a row for the self-change guard test
        id: CALLER_ID,
        name: 'Role Test Caller',
        email: 'role-test-caller@example.com',
        role: 'admin',
      },
    ])
    .onConflictDoNothing();
  // Reset in case a previous run left targets modified
  await db
    .update(users)
    .set({ role: 'customer' })
    .where(eq(users.id, TARGET_CUSTOMER_ID));
  await db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.id, TARGET_ADMIN_ID));
}

async function cleanupTargets() {
  const { db } = await import('../../../src/database');
  const { users } = await import('../../../src/database/schema/users');
  for (const id of [
    TARGET_CUSTOMER_ID,
    TARGET_ADMIN_ID,
    TARGET_SUPER_ADMIN_ID,
    TARGET_TRADE_ID,
    CALLER_ID,
  ]) {
    await db.delete(users).where(eq(users.id, id));
  }
}

beforeAll(seedTargets);
afterAll(cleanupTargets);

describe('GET /api/admin/customers', () => {
  beforeEach(() => mockGetSession.mockReset());

  it('admin gets user list with id/name/email/role', async () => {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await app.request('/api/admin/customers');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.customers)).toBe(true);
    expect(body.customers.length).toBeGreaterThan(0);
    const first = body.customers[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('email');
    expect(first).toHaveProperty('role');
  });

  it('customer gets 403', async () => {
    mockGetSession.mockResolvedValue(sessionFor('customer'));
    const app = await buildApp();

    const res = await app.request('/api/admin/customers');
    expect(res.status).toBe(403);
  });

  it('content-manager gets 403 (cannot manage roles)', async () => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'));
    const app = await buildApp();

    const res = await app.request('/api/admin/customers');
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/customers/:id/role', () => {
  beforeEach(() => mockGetSession.mockReset());

  function putRole(app: Hono, id: string, role: string) {
    return app.request(`/api/admin/customers/${id}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  }

  it('admin can promote customer to content-manager (and back)', async () => {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await putRole(app, TARGET_CUSTOMER_ID, 'content-manager');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, role: 'content-manager' });

    // Verify persisted
    const { db } = await import('../../../src/database');
    const { users } = await import('../../../src/database/schema/users');
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, TARGET_CUSTOMER_ID));
    expect(row.role).toBe('content-manager');

    // Demote back
    const res2 = await putRole(app, TARGET_CUSTOMER_ID, 'customer');
    expect(res2.status).toBe(200);
  });

  it('admin can promote customer to admin (and demote an admin)', async () => {
    // Contract widened 2026-07-27: admin is assignable; only super-admin,
    // self, and trade targets are protected.
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await putRole(app, TARGET_ADMIN_ID, 'customer');
    expect(res.status).toBe(200);

    const res2 = await putRole(app, TARGET_ADMIN_ID, 'admin');
    expect(res2.status).toBe(200);
  });

  it('rejects role=super-admin with 400 (zod)', async () => {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await putRole(app, TARGET_CUSTOMER_ID, 'super-admin');
    expect(res.status).toBe(400);
  });

  it('cannot change role of a super-admin user (403)', async () => {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await putRole(app, TARGET_SUPER_ADMIN_ID, 'customer');
    expect(res.status).toBe(403);
  });

  it('cannot change your own role (403)', async () => {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await putRole(app, CALLER_ID, 'customer');
    expect(res.status).toBe(403);
  });

  it('cannot change a trade account role (403)', async () => {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await putRole(app, TARGET_TRADE_ID, 'customer');
    expect(res.status).toBe(403);
  });

  it('content-manager caller gets 403', async () => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'));
    const app = await buildApp();

    const res = await putRole(app, TARGET_CUSTOMER_ID, 'content-manager');
    expect(res.status).toBe(403);
  });

  it('unknown user id returns 404', async () => {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();

    const res = await putRole(app, 'no-such-user-id', 'content-manager');
    expect(res.status).toBe(404);
  });
});
