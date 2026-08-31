/**
 * The split brain, closed.
 *
 * `PATCH /api/admin/orders/:id/shipping` merged carrier and tracking into
 * `orders.shipping_details`, a jsonb column. `GET /api/tracking/*` reads
 * `order_shipments`. The only writer of `order_shipments` was
 * `routes/admin/shipments.ts`, which has no UI.
 *
 * So the admin screen that exists wrote to a store the customer page does not
 * read: an admin typed a tracking number, the save succeeded, and the tracking
 * page showed nothing. Permanently. The completed `order-tracking-notifications`
 * feature was starved by the same gap.
 *
 * These assert the WRITE TARGET rather than a round trip. The mocked db cannot
 * tell us what Postgres would do with the row, and the round trip is the E2E's
 * job (#713); what matters here is that the statement goes to the right table
 * and that nothing writes the jsonb any more.
 *
 * @see packages/api/src/routes/admin/orders.ts
 * @see packages/api/src/routes/tracking.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
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

const { adminOrdersApp } = await import('../../../src/routes/admin/orders');

const ORDER_ID = '00000000-0000-0000-0000-0000000000aa';
const SHIPMENT_ID = '00000000-0000-0000-0000-0000000000bb';

const CHAIN = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'set', 'values', 'returning', 'orderBy'];

/** What the handler walks before awaiting. Records which table it was given. */
function thenable(rows: unknown[], log?: { tables: string[] }, table?: string) {
  const chain: Record<string, unknown> = {};
  for (const key of CHAIN) {
    chain[key] = (arg?: unknown) => {
      if (key === 'from' || key === 'values') {
        const name = tableNameOf(arg) ?? table;
        if (name && log) log.tables.push(name);
      }
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

/** Drizzle keeps the SQL name on a symbol; read it without importing internals. */
function tableNameOf(arg: unknown): string | undefined {
  if (!arg || typeof arg !== 'object') return undefined;
  for (const sym of Object.getOwnPropertySymbols(arg)) {
    if (String(sym).includes('Name')) {
      const value = (arg as Record<symbol, unknown>)[sym];
      if (typeof value === 'string') return value;
    }
  }
  return undefined;
}

function queue(mock: typeof selectMock, log: { tables: string[] }, ...results: unknown[][]) {
  let call = 0;
  mock.mockImplementation(() => thenable(results[call++] ?? [], log));
}

function app() {
  const instance = new Hono();
  instance.route('/api/admin/orders', adminOrdersApp);
  return instance;
}

const patchShipping = (body: unknown) =>
  app().request(`/api/admin/orders/${ORDER_ID}/shipping`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

let log: { tables: string[] };

beforeEach(() => {
  vi.clearAllMocks();
  recordAudit.mockResolvedValue(undefined);
  log = { tables: [] };

  // The order read, then the live-shipment read.
  queue(selectMock, log, [{ id: ORDER_ID, orderNumber: 'CH-1' }], [
    { id: SHIPMENT_ID, carrier: 'Delhivery', trackingNumber: null, status: 'pending' },
  ]);

  updateMock.mockImplementation(() =>
    thenable(
      [{ id: SHIPMENT_ID, carrier: 'Delhivery', trackingNumber: 'AWB55512345', status: 'pending' }],
      log
    )
  );
  insertMock.mockImplementation(() =>
    thenable(
      [{ id: SHIPMENT_ID, carrier: 'Delhivery', trackingNumber: 'AWB55512345', status: 'pending' }],
      log
    )
  );
  transactionMock.mockImplementation(async (fn: any) =>
    fn({
      select: (...args: unknown[]) => selectMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      insert: (...args: unknown[]) => insertMock(...args),
    })
  );
});

describe('PATCH /admin/orders/:id/shipping writes the store the customer reads', () => {
  it('touches order_shipments', async () => {
    const res = await patchShipping({ carrier: 'Delhivery', trackingNumber: 'AWB55512345' });

    expect(res.status).toBe(200);
    expect(log.tables, 'no statement reached order_shipments').toContain('order_shipments');
  });

  it('does NOT write orders.shipping_details any more', async () => {
    // The jsonb column stays in the schema — the backfill (#708) reads it and
    // nothing loses history — but a second WRITER is a second source of truth,
    // which is the entire defect.
    await patchShipping({ carrier: 'Delhivery', trackingNumber: 'AWB55512345' });

    // The table handed to update()/insert() is the write target. Reading the
    // name off it beats stringifying the call args — a drizzle table is
    // circular (column.table points back at the table) and JSON.stringify
    // throws on it.
    const written = [...updateMock.mock.calls, ...insertMock.mock.calls]
      .map(([table]) => tableNameOf(table))
      .filter(Boolean);

    expect(written.length, 'nothing was written at all').toBeGreaterThan(0);
    expect(written, 'orders is still being written by this handler').not.toContain('orders');
    expect(written).toContain('order_shipments');
  });

  it('returns the shipment it wrote, not the jsonb it did not', async () => {
    // Returning the old shape after writing elsewhere would tell the admin
    // screen its edit did not take.
    const res = await patchShipping({ carrier: 'Delhivery', trackingNumber: 'AWB55512345' });
    const body = (await res.json()) as Record<string, any>;

    expect(body).toHaveProperty('shipment');
    expect(body.shipment).toMatchObject({ trackingNumber: 'AWB55512345' });
    expect(JSON.stringify(body)).not.toContain('shippingDetails');
  });

  it('records that a customer-visible tracking number changed', async () => {
    await patchShipping({ carrier: 'Delhivery', trackingNumber: 'AWB55512345' });

    expect(recordAudit).toHaveBeenCalled();
    expect(recordAudit.mock.calls[0]?.[1]).toMatchObject({
      action: 'shipment.tracking_updated',
      entityType: 'order_shipment',
    });
  });

  it('opens a shipment when the order has none yet', async () => {
    queue(selectMock, log, [{ id: ORDER_ID, orderNumber: 'CH-1' }], []);

    const res = await patchShipping({ carrier: 'Delhivery', trackingNumber: 'AWB55512345' });

    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalled();
  });

  it('refuses to open one with no carrier rather than inventing a placeholder', async () => {
    // `carrier` is NOT NULL. Defaulting it would put a word the CUSTOMER reads
    // on a tracking page because an admin form was incomplete.
    queue(selectMock, log, [{ id: ORDER_ID, orderNumber: 'CH-1' }], []);

    const res = await patchShipping({ trackingNumber: 'AWB55512345' });

    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('still 404s an unknown order', async () => {
    queue(selectMock, log, []);

    const res = await patchShipping({ carrier: 'Delhivery' });

    expect(res.status).toBe(404);
  });
});
