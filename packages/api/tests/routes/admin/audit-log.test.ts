/**
 * Reading the audit log.
 *
 * A write-only trail answers a subpoena and nothing else. This is the endpoint
 * behind the question people actually ask — "who refunded order CH-1042" — so
 * the tests are about the filters and about who may read them.
 *
 * The access rule is deliberately narrower than the rest of the admin API:
 * content-managers can edit the catalogue but must NOT read this, because rows
 * carry customer emails and admin actions across every domain. "They are staff
 * already" is not an argument for handing everyone the audit log.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { readJson } from '../../helpers/json';

const selectMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/database', () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
}));

vi.mock('../../../src/middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/middleware/auth')>()),
  requireAuth: vi.fn((c: any, next: any) => {
    const header = c.req.header('X-Test-User');
    if (!header) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', JSON.parse(header));
    return next();
  }),
}));

const { adminAuditLogApp } = await import('../../../src/routes/admin/audit-log');

const dialect = new PgDialect();
const recorded: Array<{ method: string; args: unknown[] }> = [];

function thenable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of ['from', 'where', 'orderBy', 'limit', 'offset', 'leftJoin']) {
    chain[key] = (...args: unknown[]) => {
      recorded.push({ method: key, args });
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: '4f6c4a4e-1b3f-4b1a-9a2e-3a1f6f2c6a11',
  createdAt: new Date('2026-08-17T07:00:00.000Z'),
  actorUserId: 'admin-1',
  actorEmail: 'admin@chobii.art',
  actorRole: 'admin',
  action: 'return.refund_processed',
  category: 'money',
  outcome: 'success',
  summary: 'Refunded 1240 on return r1',
  entityType: 'return',
  entityId: 'r1',
  before: { status: 'approved' },
  after: { status: 'refunded' },
  metadata: { method: 'POST' },
  requestId: 'req_1',
  ipAddress: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  ...overrides,
});

function app() {
  const instance = new Hono();
  instance.route('/api/admin/audit-log', adminAuditLogApp);
  return instance;
}

const asRole = (role: string) => JSON.stringify({ id: 'u1', email: 'a@b.c', role });

const get = (path: string, role = 'admin') =>
  app().request(path, { headers: { 'X-Test-User': asRole(role) } });

/** Every WHERE the handler built, rendered to SQL text. */
const whereSql = () =>
  recorded
    .filter((op) => op.method === 'where')
    .map((op) => dialect.sqlToQuery(op.args[0] as SQL))
    .map((q) => ({ sql: q.sql, params: q.params as unknown[] }));

beforeEach(() => {
  vi.clearAllMocks();
  recorded.length = 0;
  selectMock.mockImplementation(() => thenable([row()]));
});

describe('GET /api/admin/audit-log', () => {
  it('returns entries newest first', async () => {
    const res = await get('/api/admin/audit-log');

    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { entries: unknown[]; nextCursor: string | null };
    expect(body.entries).toHaveLength(1);

    const ordering = recorded.find((op) => op.method === 'orderBy');
    expect(ordering).toBeDefined();
  });

  it('refuses a content-manager: entries carry customer emails', async () => {
    const res = await get('/api/admin/audit-log', 'content-manager');

    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    const res = await app().request('/api/admin/audit-log');

    expect(res.status).toBe(401);
  });

  it('lets a super-admin read it', async () => {
    const res = await get('/api/admin/audit-log', 'super-admin');

    expect(res.status).toBe(200);
  });

  it('filters by category, split out of the comma-joined string a router sends', async () => {
    await get('/api/admin/audit-log?category=money,privilege');

    const params = whereSql().flatMap((w) => w.params);
    expect(params).toContain('money');
    expect(params).toContain('privilege');
  });

  it('filters by entity, which is how you ask about one order', async () => {
    await get('/api/admin/audit-log?entityType=order&entityId=CH-1042');

    const params = whereSql().flatMap((w) => w.params);
    expect(params).toContain('order');
    expect(params).toContain('CH-1042');
  });

  it('filters by actor and by request id', async () => {
    await get('/api/admin/audit-log?actor=admin-1&requestId=req_1');

    const params = whereSql().flatMap((w) => w.params);
    expect(params).toContain('admin-1');
    expect(params).toContain('req_1');
  });

  it('binds a free-text search rather than interpolating it', async () => {
    await get('/api/admin/audit-log?q=refund');

    const [where] = whereSql();
    expect(where?.sql).not.toContain('refund');
    expect(where?.params.some((p) => String(p).includes('refund'))).toBe(true);
  });

  it('rejects an unknown action instead of silently returning everything', async () => {
    const res = await get('/api/admin/audit-log?action=nope.happened');

    expect(res.status).toBe(400);
  });

  it('caps the page size, so one request cannot pull the whole table', async () => {
    const res = await get('/api/admin/audit-log?limit=5000');

    expect(res.status).toBe(400);
  });

  it('returns a cursor only when the page was full', async () => {
    selectMock.mockImplementation(() => thenable([row()]));

    const res = await get('/api/admin/audit-log?limit=50');
    const body = (await readJson(res)) as { nextCursor: string | null };

    // One row against a limit of 50: there is nothing after it, and a cursor
    // here would give the viewer an endless "load more".
    expect(body.nextCursor).toBeNull();
  });
});

describe('GET /api/admin/audit-log/entity/:type/:id', () => {
  it('returns one entity timeline', async () => {
    const res = await get('/api/admin/audit-log/entity/order/CH-1042');

    expect(res.status).toBe(200);
    const params = whereSql().flatMap((w) => w.params);
    expect(params).toContain('order');
    expect(params).toContain('CH-1042');
  });

  it('is admin-only too', async () => {
    const res = await get('/api/admin/audit-log/entity/order/CH-1042', 'content-manager');

    expect(res.status).toBe(403);
  });
});
