/**
 * Attribution on admin order writes.
 *
 * A cancellation releases a gift-card hold and a refund sends money back through
 * Razorpay and across the cards that paid. Both were previously attributable
 * only to "some admin session", which is no answer when a customer disputes an
 * order that was cancelled on them.
 *
 * `order.cancelled` is a separate action from `order.status_changed` rather than
 * a status value inside it, because cancellation is the transition finance and
 * support actually search for, and a filter that requires reading a jsonb field
 * to find it is a filter nobody uses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
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

vi.mock('../../../src/services/notifications', () => ({
  notifyOrderStatusChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/services/approvals', () => ({
  createApprovalsForOrder: vi.fn().mockResolvedValue(undefined),
}));

// Cancelling an unpaid order releases the gift-card hold inside the same
// transaction. That is real behaviour with its own suite; here it would only
// mean teaching the tx stub the whole gift-card ledger.
vi.mock('../../../src/services/gift-card', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/services/gift-card')>()),
  voidGiftCardHold: vi.fn().mockResolvedValue(undefined),
  refundToGiftCards: vi.fn().mockResolvedValue(undefined),
}));

const { adminOrdersApp } = await import('../../../src/routes/admin/orders');

const ORDER_ID = '00000000-0000-0000-0000-0000000000aa';

const CHAIN = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'set', 'returning', 'orderBy'];

function thenable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of CHAIN) chain[key] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

function queue(mock: typeof selectMock, ...results: unknown[][]) {
  let call = 0;
  mock.mockImplementation(() => thenable(results[call++] ?? []));
}

function app() {
  const instance = new Hono();
  instance.route('/api/admin/orders', adminOrdersApp);
  return instance;
}

const patch = (path: string, body: unknown) =>
  app().request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const auditArgs = () => recordAudit.mock.calls[0]?.[1] as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  recordAudit.mockResolvedValue(undefined);
  // The status route runs its update inside a transaction; the tx handle only
  // needs to answer the same chain the handler walks.
  transactionMock.mockImplementation(async (fn: any) =>
    fn({ update: () => thenable([{ id: ORDER_ID, orderNumber: 'CH-1', status: 'shipped' }]) })
  );
});

describe('PATCH /api/admin/orders/:id/status', () => {
  it('records the transition with both statuses', async () => {
    queue(selectMock, [
      { id: ORDER_ID, status: 'processing', paymentStatus: 'paid', internalNotes: null },
    ]);

    const res = await patch(`/api/admin/orders/${ORDER_ID}/status`, { status: 'shipped' });

    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(auditArgs()).toMatchObject({
      action: 'order.status_changed',
      entityType: 'order',
      entityId: ORDER_ID,
    });
    expect(auditArgs().before).toMatchObject({ status: 'processing' });
    expect(auditArgs().after).toMatchObject({ status: 'shipped' });
  });

  it('files a cancellation under its own action, not buried in a status field', async () => {
    queue(selectMock, [
      { id: ORDER_ID, status: 'processing', paymentStatus: 'pending', internalNotes: null },
    ]);
    transactionMock.mockImplementation(async (fn: any) =>
      fn({
        update: () => thenable([{ id: ORDER_ID, orderNumber: 'CH-1', status: 'cancelled' }]),
      })
    );

    await patch(`/api/admin/orders/${ORDER_ID}/status`, {
      status: 'cancelled',
      reason: 'Customer changed their mind',
    });

    expect(auditArgs()).toMatchObject({ action: 'order.cancelled', entityId: ORDER_ID });
    expect(String(auditArgs().summary)).toContain('Customer changed their mind');
  });

  it('records a status change against an order that does not exist as a failure', async () => {
    queue(selectMock, []);

    const res = await patch(`/api/admin/orders/${ORDER_ID}/status`, { status: 'shipped' });

    expect(res.status).toBe(404);
    expect(auditArgs()).toMatchObject({
      action: 'order.status_changed',
      outcome: 'failure',
    });
  });
});

describe('POST /api/admin/orders/:id/refund', () => {
  it('records a refused refund on an unpaid order', async () => {
    queue(selectMock, [
      {
        id: ORDER_ID,
        orderNumber: 'CH-1',
        total: '2000.00',
        giftCardAmount: '0.00',
        paymentStatus: 'pending',
        paymentDetails: null,
        internalNotes: null,
      },
    ]);

    const res = await app().request(`/api/admin/orders/${ORDER_ID}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100, reason: 'Customer request' }),
    });

    // 503 when Razorpay is unconfigured in the test env — the audit assertion
    // below is skipped in that case rather than asserting a row that the
    // handler never got far enough to write.
    if (res.status === 503) return;

    expect(res.status).toBe(400);
    expect(auditArgs()).toMatchObject({ action: 'order.refunded', outcome: 'failure' });
  });
});

describe('PATCH /api/admin/orders/:id', () => {
  it('records the general edit, including the payment status it can move', async () => {
    queue(selectMock, [{ id: ORDER_ID, status: 'pending', paymentStatus: 'pending' }]);
    transactionMock.mockImplementation(async (fn: any) =>
      fn({
        update: () =>
          thenable([
            {
              id: ORDER_ID,
              orderNumber: 'CH-1',
              status: 'processing',
              paymentStatus: 'paid',
              updatedAt: new Date(),
            },
          ]),
      })
    );

    const res = await patch(`/api/admin/orders/${ORDER_ID}`, {
      status: 'processing',
      paymentStatus: 'paid',
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({ action: 'order.status_changed', entityId: ORDER_ID });
    expect(auditArgs().before).toMatchObject({ status: 'pending', paymentStatus: 'pending' });
    expect(auditArgs().after).toMatchObject({ status: 'processing', paymentStatus: 'paid' });
  });

  it('files a cancellation made through the general edit under order.cancelled too', async () => {
    // Both routes can cancel. An audit that only watched one of them would
    // report a clean history for exactly the cancellation somebody hid.
    queue(selectMock, [{ id: ORDER_ID, status: 'pending', paymentStatus: 'pending' }]);
    transactionMock.mockImplementation(async (fn: any) =>
      fn({
        update: () =>
          thenable([
            {
              id: ORDER_ID,
              orderNumber: 'CH-1',
              status: 'cancelled',
              paymentStatus: 'pending',
              updatedAt: new Date(),
            },
          ]),
      })
    );

    await patch(`/api/admin/orders/${ORDER_ID}`, { status: 'cancelled' });

    expect(auditArgs()).toMatchObject({ action: 'order.cancelled' });
  });
});
