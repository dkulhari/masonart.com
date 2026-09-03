/**
 * Attribution on marking a shipment delivered.
 *
 * `order.shipment_marked_delivered` is declared in the shared `AUDIT_ACTIONS`
 * registry and filed under the `money` category, but nothing emitted it — so
 * the audit viewer offered the filter and the filter returned nothing, forever.
 * An empty filter reads as "this never happened" rather than "this was never
 * recorded", which is the worst way for an audit trail to be wrong.
 *
 * Delivery is what starts the return window, so a disputed return date turns on
 * who marked it delivered and when. The floor row (`admin.request`, category
 * `config`) records that a POST happened; it cannot say which status the
 * shipment moved from, which is the fact a dispute actually needs.
 *
 * Kept out of `shipments.test.ts` because that suite runs the real app against
 * a real database to smoke-test route availability. Mocking `src/database` at
 * module scope there would hollow out those tests. Same split as
 * `orders.test.ts` / `orders-audit.test.ts` and `returns.test.ts` /
 * `returns-audit.test.ts`.
 *
 * @see packages/api/src/routes/admin/shipments.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

/**
 * The handler runs inside `db.transaction`, and the stub hands the callback a
 * `tx` that is the SAME pair of mocks.
 *
 * Deliberately not a second pair. Every assertion below is about what the
 * handler read and wrote, and splitting the recording in two would make each
 * of them depend on which handle the handler happened to use — which is the
 * `shares the transaction it describes` property's business, asserted directly
 * from the third argument of `recordAudit` rather than inferred from a mock.
 *
 * It commits by returning and rolls back by rethrowing, which is all this
 * suite needs: the rollback-visibility work lives in
 * `tests/helpers/query-recorder.ts`, and the suites that assert survivors use
 * that instead.
 */
const tx = {
  select: (...args: unknown[]) => selectMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
};

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    transaction: async (fn: (handle: unknown) => Promise<unknown>) => fn(tx),
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

const { adminShipmentsApp } = await import('../../../src/routes/admin/shipments');

const SHIPMENT_ID = '00000000-0000-0000-0000-0000000000cc';
const ORDER_ID = '00000000-0000-0000-0000-0000000000aa';

// `for` is the FOR UPDATE link the handler takes on its deciding read. A chain
// missing it throws `.for is not a function` and every test in this file turns
// into a 500, which reads as a routing bug rather than a stub gap.
const CHAIN = [
  'from',
  'where',
  'limit',
  'innerJoin',
  'leftJoin',
  'set',
  'returning',
  'orderBy',
  'for',
];

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
  instance.route('/api/admin/shipments', adminShipmentsApp);
  return instance;
}

const markDelivered = (id = SHIPMENT_ID) =>
  app().request(`/api/admin/shipments/${id}/mark-delivered`, { method: 'POST' });

/** The entry argument of the first `recordAudit` call. */
const auditArgs = () => recordAudit.mock.calls[0]?.[1] as Record<string, any>;

/**
 * The shipment row every test queues, joined to its order.
 *
 * `orderStatus` on it is not decoration. The handler joins `orders` for that
 * one column and moves the order only when it is still one a courier fact may
 * move (`ORDER_FOLLOWS_ITS_SHIPMENT`). A row without it takes the fail-closed
 * branch, so these tests would still pass — while silently exercising the path
 * where the order is left alone, which is not the path they are about.
 *
 * This doc block used to sit immediately above `thenable`, where it read as
 * that function's comment and explained nothing about it.
 */
function existingRow(over: Record<string, unknown> = {}) {
  return {
    id: SHIPMENT_ID,
    orderId: ORDER_ID,
    status: 'in_transit',
    orderStatus: 'shipped',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  recordAudit.mockResolvedValue(undefined);
  queue(
    updateMock,
    [{ id: SHIPMENT_ID, orderId: ORDER_ID, status: 'delivered' }],
    [{ id: ORDER_ID }]
  );
});

describe('POST /api/admin/shipments/:id/mark-delivered', () => {
  it('records the delivery under its declared money action', async () => {
    queue(selectMock, [existingRow()]);

    const res = await markDelivered();

    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(auditArgs()).toMatchObject({
      action: 'order.shipment_marked_delivered',
      entityType: 'order_shipment',
      entityId: SHIPMENT_ID,
    });
  });

  it('records the status it moved FROM, which is the fact a disputed return date turns on', async () => {
    queue(selectMock, [existingRow()]);

    await markDelivered();

    // Without `before`, the row says a shipment became delivered but not what
    // it was before — so it cannot distinguish a normal delivery from one
    // back-dated over a shipment that was still sitting at `pending`.
    expect(auditArgs().before).toMatchObject({ status: 'in_transit' });
    expect(auditArgs().after).toMatchObject({ status: 'delivered' });
    expect(auditArgs().after.deliveredAt).toBeDefined();
  });

  it('carries the order the shipment belongs to, so the row is reachable from the dispute', async () => {
    queue(selectMock, [existingRow({ status: 'shipped' })]);

    await markDelivered();

    expect(auditArgs().metadata).toMatchObject({ orderId: ORDER_ID });
  });

  it('shares the transaction the delivery it describes was written in', async () => {
    queue(selectMock, [existingRow({ status: 'shipped' })]);

    await markDelivered();

    // The rule `lib/audit.ts` states, and the round-4 change to this file: share
    // the transaction when the audit row would be a LIE if the business write
    // rolled back. This row asserts a delivery. It used to be written outside,
    // correctly, because the two updates had already committed on their own —
    // that reasoning went away with the transaction, and an audit row surviving
    // a rolled-back delivery is the audit trail lying about the one fact a
    // disputed return date turns on.
    //
    // The other half of the same rule holds too and is asserted by the two
    // refusal tests below: no refusal writes a row at all, so nothing here is a
    // failure row written inside the transaction it says was rolled back.
    expect(recordAudit.mock.calls[0]?.[2], 'the audit row was written outside the transaction').toBe(
      tx
    );
  });

  it('writes no delivery row when the shipment was already delivered', async () => {
    queue(selectMock, [existingRow({ status: 'delivered' })]);

    const res = await markDelivered();

    // A no-op double click must not leave a second "marked delivered" row with
    // a fresh timestamp; that would move the apparent start of the return
    // window. The floor `admin.request` row still records the attempt.
    expect(res.status).toBe(400);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('writes no delivery row for a shipment that does not exist', async () => {
    queue(selectMock, []);

    const res = await markDelivered();

    expect(res.status).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
