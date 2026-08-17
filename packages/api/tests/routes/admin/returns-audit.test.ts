/**
 * Attribution on the returns money paths.
 *
 * These four handlers are where money leaves, and until now none of them
 * recorded who sent it: `process-refund` moved a refund to the customer's card,
 * or issued store credit, with the actor visible only in a web-server access log
 * that nobody keeps for a year. The first disputed refund had no answer.
 *
 * The middleware floor would catch these as `admin.request`, which answers "who"
 * but not "how much" or "from what state". These tests hold the upgrade: the
 * right action name, the entity, and the before/after that makes a dispute
 * settleable.
 *
 * Refusals count too. "An admin tried to approve an already-refunded return" is
 * exactly the kind of thing an investigation wants, so a 400 must land a row
 * with outcome failure rather than nothing at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

const recordAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../../src/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/audit')>()),
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

vi.mock('../../../src/middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/middleware/auth')>()),
  requireAuth: vi.fn((c: any, next: any) => {
    c.set('user', { id: 'admin-1', email: 'admin@chobii.art', role: 'admin' });
    return next();
  }),
  requireAdmin: vi.fn((_c: any, next: any) => next()),
}));

const { adminReturnsApp } = await import('../../../src/routes/admin/returns');

const RETURN_ID = '00000000-0000-0000-0000-000000000001';
const ORDER_ID = '00000000-0000-0000-0000-0000000000aa';

/** Chain links a returns query walks before it is awaited. */
const CHAIN = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'set', 'returning', 'orderBy'];

function thenable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of CHAIN) chain[key] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

/** Answer each db.select()/db.update() in call order. */
function queue(mock: typeof selectMock, ...results: unknown[][]) {
  let call = 0;
  mock.mockImplementation(() => thenable(results[call++] ?? []));
}

function app() {
  const instance = new Hono();
  instance.route('/api/admin/returns', adminReturnsApp);
  return instance;
}

const post = (path: string, body?: unknown) =>
  app().request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const auditArgs = () => recordAudit.mock.calls[0]?.[1] as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  recordAudit.mockResolvedValue(undefined);
});

describe('PATCH /api/admin/returns/:id', () => {
  it('records the status transition with both sides of it', async () => {
    queue(selectMock, [{ id: RETURN_ID, status: 'pending' }]);
    queue(updateMock, [{ id: RETURN_ID, status: 'approved' }]);

    const res = await app().request(`/api/admin/returns/${RETURN_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(auditArgs()).toMatchObject({
      action: 'return.status_changed',
      entityType: 'return',
      entityId: RETURN_ID,
    });
    expect(auditArgs().before).toMatchObject({ status: 'pending' });
    expect(auditArgs().after).toMatchObject({ status: 'approved' });
  });

  it('records the refund amount when the edit sets one', async () => {
    queue(selectMock, [{ id: RETURN_ID, status: 'approved' }]);
    queue(updateMock, [{ id: RETURN_ID, status: 'approved', refundAmount: '1240.00' }]);

    await app().request(`/api/admin/returns/${RETURN_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundAmount: 1240 }),
    });

    expect(auditArgs().after).toMatchObject({ refundAmount: '1240.00' });
  });
});

describe('POST /api/admin/returns/:id/approve', () => {
  it('records the approval against the return', async () => {
    queue(selectMock, [{ id: RETURN_ID, status: 'pending', orderId: ORDER_ID }]);
    queue(updateMock, [{ id: RETURN_ID, status: 'approved' }], []);

    const res = await post(`/api/admin/returns/${RETURN_ID}/approve`);

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'return.approved',
      entityType: 'return',
      entityId: RETURN_ID,
    });
    expect(auditArgs().after).toMatchObject({ status: 'approved' });
  });

  it('records a refused approval as a failure rather than losing the attempt', async () => {
    queue(selectMock, [{ id: RETURN_ID, status: 'refunded', orderId: ORDER_ID }]);

    const res = await post(`/api/admin/returns/${RETURN_ID}/approve`);

    expect(res.status).toBe(400);
    expect(auditArgs()).toMatchObject({
      action: 'return.approved',
      outcome: 'failure',
    });
  });
});

describe('POST /api/admin/returns/:id/reject', () => {
  it('records the rejection with the reason the customer will be told', async () => {
    queue(selectMock, [{ id: RETURN_ID, status: 'pending' }]);
    queue(updateMock, [{ id: RETURN_ID, status: 'rejected' }]);

    const res = await post(`/api/admin/returns/${RETURN_ID}/reject`, {
      reason: 'Outside the 30-day window',
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'return.rejected',
      entityType: 'return',
      entityId: RETURN_ID,
    });
    expect(auditArgs().after).toMatchObject({
      status: 'rejected',
      adminNotes: 'Outside the 30-day window',
    });
  });
});

describe('POST /api/admin/returns/:id/process-refund', () => {
  const refundable = () => [
    {
      id: RETURN_ID,
      status: 'approved',
      orderId: ORDER_ID,
      storeCreditAcceptedAt: null,
      storeCreditGiftCardId: null,
      customerEmail: 'customer@example.com',
      customerName: 'Customer',
      order: { id: ORDER_ID, total: '2000.00', orderNumber: 'CH-1' },
    },
  ];

  it('records the money that moved, and where it went', async () => {
    queue(selectMock, refundable());
    queue(updateMock, [{ id: RETURN_ID, status: 'refunded' }], []);

    const res = await post(`/api/admin/returns/${RETURN_ID}/process-refund`, {
      refundAmount: 1240,
      refundType: 'partial',
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'return.refund_processed',
      entityType: 'return',
      entityId: RETURN_ID,
    });
    expect(auditArgs().after).toMatchObject({
      status: 'refunded',
      refundAmount: '1240.00',
      refundType: 'partial',
    });
    // The summary is what the viewer's list column shows, so it has to name the
    // amount without anyone opening the diff.
    expect(String(auditArgs().summary)).toContain('1240');
  });

  it('records a refund that exceeds the order total as a refused attempt', async () => {
    queue(selectMock, refundable());

    const res = await post(`/api/admin/returns/${RETURN_ID}/process-refund`, {
      refundAmount: 9999,
      refundType: 'full',
    });

    expect(res.status).toBe(400);
    expect(auditArgs()).toMatchObject({
      action: 'return.refund_processed',
      outcome: 'failure',
    });
  });

  it('records store credit refused for want of consent — the chargeback path', async () => {
    queue(selectMock, refundable());

    const res = await post(`/api/admin/returns/${RETURN_ID}/process-refund`, {
      refundAmount: 1240,
      refundType: 'store_credit',
    });

    expect(res.status).toBe(400);
    expect(auditArgs()).toMatchObject({
      action: 'return.store_credit_issued',
      outcome: 'failure',
    });
  });
});
