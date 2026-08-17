/**
 * The audit floor.
 *
 * `recordAudit` is precise but opt-in, and opt-in is exactly how the current gap
 * happened: refunds, order cancellation and role assignment each shipped without
 * anyone remembering to record the actor. This middleware is the answer — every
 * mutating request under /api/admin or /api/vendor lands a row whether or not
 * its handler cooperated.
 *
 * The interesting cases are the negatives: reads must not be recorded (the table
 * would be 99% noise), and a handler that already wrote a precise row must not
 * also get a coarse one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const insertValues = vi.fn().mockResolvedValue(undefined);
const insert = vi.fn(() => ({ values: insertValues }));

vi.mock('../../src/database', () => ({
  db: { insert: (...args: unknown[]) => insert(...args) },
}));

vi.mock('../../src/lib/alerts', () => ({ alertCritical: vi.fn() }));
vi.mock('../../src/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() },
  createChildLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  REDACTED_LOG_PATHS: [],
}));

const { auditRequests } = await import('../../src/middleware/audit');
const { recordAudit } = await import('../../src/lib/audit');

const row = () => insertValues.mock.calls[0]?.[0] as Record<string, unknown>;

function adminApp() {
  const app = new Hono();

  // Stand-in for requireAuth: the floor must record who acted.
  app.use('/api/admin/*', async (c, next) => {
    c.set('user' as never, { id: 'u1', email: 'admin@chobii.art', role: 'admin' } as never);
    await next();
  });
  app.use('/api/admin/*', auditRequests());
  app.use('/api/vendor/*', auditRequests());

  app.get('/api/admin/orders', (c) => c.json({ orders: [] }));
  app.post('/api/admin/orders/:id/refund', (c) => c.json({ ok: true }));
  app.delete('/api/admin/products/:id', (c) => c.json({ ok: true }));
  app.put('/api/admin/customers/:id/role', (c) => c.json({ error: 'Forbidden' }, 403));
  app.post('/api/admin/blow-up', () => {
    throw new Error('kaboom');
  });
  app.post('/api/vendor/jobs/:id/accept', (c) => c.json({ ok: true }));

  // A cooperating handler: writes its own precise row.
  app.post('/api/admin/returns/:id/approve', async (c) => {
    await recordAudit(c, {
      action: 'return.approved',
      entityType: 'return',
      entityId: c.req.param('id'),
    });
    return c.json({ ok: true });
  });

  app.onError((_err, c) => c.json({ error: 'Internal' }, 500));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  insertValues.mockResolvedValue(undefined);
});

describe('auditRequests', () => {
  it('records a mutating admin request nobody instrumented', async () => {
    await adminApp().request('/api/admin/orders/o1/refund', { method: 'POST' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(row()).toMatchObject({
      action: 'admin.request',
      outcome: 'success',
      actorUserId: 'u1',
      actorEmail: 'admin@chobii.art',
    });
    expect(row().metadata).toMatchObject({
      method: 'POST',
      path: '/api/admin/orders/o1/refund',
      status: 200,
    });
  });

  it('does not record reads — the table would be almost entirely GETs', async () => {
    await adminApp().request('/api/admin/orders');

    expect(insert).not.toHaveBeenCalled();
  });

  it('records a DELETE, which is the case most worth having', async () => {
    await adminApp().request('/api/admin/products/p1', { method: 'DELETE' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(row().metadata).toMatchObject({ method: 'DELETE' });
  });

  it('records a refused request as outcome failure', async () => {
    const res = await adminApp().request('/api/admin/customers/u2/role', { method: 'PUT' });

    expect(res.status).toBe(403);
    expect(row()).toMatchObject({ outcome: 'failure' });
    expect(row().metadata).toMatchObject({ status: 403 });
  });

  it('records a request whose handler threw, rather than losing the attempt', async () => {
    const res = await adminApp().request('/api/admin/blow-up', { method: 'POST' });

    expect(res.status).toBe(500);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(row()).toMatchObject({ outcome: 'failure' });
  });

  it('files a vendor mutation under vendor.request', async () => {
    await adminApp().request('/api/vendor/jobs/j1/accept', { method: 'POST' });

    expect(row()).toMatchObject({ action: 'vendor.request' });
  });

  it('writes exactly one row when the handler already recorded a precise one', async () => {
    await adminApp().request('/api/admin/returns/r1/approve', { method: 'POST' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(row()).toMatchObject({ action: 'return.approved', entityType: 'return' });
  });

  it('never fails the request when the audit insert dies', async () => {
    insertValues.mockRejectedValue(new Error('disk full'));

    const res = await adminApp().request('/api/admin/products/p1', { method: 'DELETE' });

    expect(res.status).toBe(200);
  });
});
