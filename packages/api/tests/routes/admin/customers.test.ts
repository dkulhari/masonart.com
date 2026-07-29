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

/**
 * Filter fixtures. `createdAt` values sit in a synthetic 2029 window so the
 * joined-date-range assertions cannot collide with real rows in the dev
 * database. START/END sit exactly on the range bounds — they prove the range
 * is inclusive on both ends.
 */
const FILTER_RANGE_START_ID = 'filter-test-range-start';
const FILTER_RANGE_END_ID = 'filter-test-range-end';
const FILTER_OUT_OF_RANGE_ID = 'filter-test-out-of-range';
const FILTER_FROM = '2029-03-01';
const FILTER_TO = '2029-03-31';
const FILTER_RANGE_START_AT = new Date('2029-03-01T00:00:00.000Z');
const FILTER_RANGE_END_AT = new Date('2029-03-31T23:59:59.000Z');
const FILTER_OUT_OF_RANGE_AT = new Date('2029-04-15T12:00:00.000Z');

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
      {
        id: FILTER_RANGE_START_ID,
        name: 'Filter Fixture Range Start',
        email: 'filter-fixture-range-start@example.com',
        role: 'customer',
        status: 'active',
        createdAt: FILTER_RANGE_START_AT,
      },
      {
        id: FILTER_RANGE_END_ID,
        name: 'Filter Fixture Range End',
        email: 'filter-fixture-range-end@example.com',
        role: 'customer',
        status: 'suspended',
        createdAt: FILTER_RANGE_END_AT,
      },
      {
        id: FILTER_OUT_OF_RANGE_ID,
        name: 'Filter Fixture Out Of Range',
        email: 'filter-fixture-out-of-range@example.com',
        role: 'customer',
        status: 'active',
        createdAt: FILTER_OUT_OF_RANGE_AT,
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
    FILTER_RANGE_START_ID,
    FILTER_RANGE_END_ID,
    FILTER_OUT_OF_RANGE_ID,
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
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    const first = body.data[0];
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

describe('GET /api/admin/customers - filtering, sorting, pagination', () => {
  beforeEach(() => mockGetSession.mockReset());

  async function listAs(query: string) {
    mockGetSession.mockResolvedValue(sessionFor('admin'));
    const app = await buildApp();
    return app.request(`/api/admin/customers${query}`);
  }

  async function listOk(query: string) {
    const res = await listAs(query);
    expect(res.status).toBe(200);
    return res.json();
  }

  const idsOf = (body: { data: Array<{ id: string }> }) =>
    body.data.map((u) => u.id);

  it('returns a pagination envelope and honours pageSize', async () => {
    const body = await listOk('?page=1&pageSize=2');

    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 2 });
    expect(typeof body.pagination.total).toBe('number');
    expect(typeof body.pagination.totalPages).toBe('number');
    // total counts every match, not just the returned page
    expect(body.pagination.total).toBeGreaterThanOrEqual(body.data.length);
  });

  it('filters by role', async () => {
    const body = await listOk('?role=trade&pageSize=100');

    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((u: { role: string }) => u.role === 'trade')).toBe(
      true
    );
    expect(idsOf(body)).toContain(TARGET_TRADE_ID);
  });

  it('filters by several roles at once (repeated param)', async () => {
    const body = await listOk('?role=trade&role=super-admin&pageSize=100');

    expect(
      body.data.every((u: { role: string }) =>
        ['trade', 'super-admin'].includes(u.role)
      )
    ).toBe(true);
    expect(idsOf(body)).toEqual(
      expect.arrayContaining([TARGET_TRADE_ID, TARGET_SUPER_ADMIN_ID])
    );
  });

  it('filters by status', async () => {
    const body = await listOk('?status=suspended&pageSize=100');

    expect(
      body.data.every((u: { status: string }) => u.status === 'suspended')
    ).toBe(true);
    expect(idsOf(body)).toContain(FILTER_RANGE_END_ID);
  });

  it('searches name and email server-side', async () => {
    const byEmail = await listOk('?search=filter-fixture-range-start');
    expect(idsOf(byEmail)).toContain(FILTER_RANGE_START_ID);

    const byName = await listOk('?search=Fixture%20Out%20Of%20Range');
    expect(idsOf(byName)).toContain(FILTER_OUT_OF_RANGE_ID);
    expect(idsOf(byName)).not.toContain(FILTER_RANGE_START_ID);
  });

  it('filters by joined date range, inclusive on both ends', async () => {
    const body = await listOk(
      `?joinedFrom=${FILTER_FROM}&joinedTo=${FILTER_TO}&pageSize=100`
    );

    const ids = idsOf(body);
    // Both fixtures sit exactly on a bound — inclusive means both are returned
    expect(ids).toEqual(
      expect.arrayContaining([FILTER_RANGE_START_ID, FILTER_RANGE_END_ID])
    );
    expect(ids).not.toContain(FILTER_OUT_OF_RANGE_ID);

    for (const u of body.data as Array<{ createdAt: string }>) {
      expect(new Date(u.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(`${FILTER_FROM}T00:00:00.000Z`).getTime()
      );
      expect(new Date(u.createdAt).getTime()).toBeLessThanOrEqual(
        new Date(`${FILTER_TO}T23:59:59.999Z`).getTime()
      );
    }
  });

  it('accepts an open-ended joined range (from only)', async () => {
    const body = await listOk(`?joinedFrom=${FILTER_FROM}&pageSize=100`);

    expect(idsOf(body)).toEqual(
      expect.arrayContaining([FILTER_RANGE_START_ID, FILTER_OUT_OF_RANGE_ID])
    );
  });

  it('rejects an inverted date range with 400', async () => {
    const res = await listAs('?joinedFrom=2029-04-01&joinedTo=2029-03-01');
    expect(res.status).toBe(400);
  });

  it('rejects unknown filter values with 400', async () => {
    expect((await listAs('?role=wizard')).status).toBe(400);
    expect((await listAs('?status=nonsense')).status).toBe(400);
    expect((await listAs('?joinedFrom=01-03-2029')).status).toBe(400);
    expect((await listAs('?pageSize=500')).status).toBe(400);
  });

  it('sorts by the requested column and direction', async () => {
    const range = `joinedFrom=${FILTER_FROM}&joinedTo=${FILTER_TO}&pageSize=100`;

    const asc = await listOk(`?${range}&sortBy=createdAt&sortOrder=asc`);
    expect(idsOf(asc)).toEqual([FILTER_RANGE_START_ID, FILTER_RANGE_END_ID]);

    const desc = await listOk(`?${range}&sortBy=createdAt&sortOrder=desc`);
    expect(idsOf(desc)).toEqual([FILTER_RANGE_END_ID, FILTER_RANGE_START_ID]);
  });

  it('combines filters conjunctively', async () => {
    const body = await listOk(
      `?joinedFrom=${FILTER_FROM}&joinedTo=${FILTER_TO}&status=active&pageSize=100`
    );

    expect(idsOf(body)).toEqual([FILTER_RANGE_START_ID]);
    expect(body.pagination.total).toBe(1);
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
