/**
 * A customer is never shown a dead AWB.
 *
 * Both tracking handlers picked a shipment with `orderBy createdAt desc` and no
 * predicate — newest wins. That was harmless only while voided labels did not
 * exist. They do now (#703), and `order_shipments` holds the voided label
 * beside its replacement, so newest can be the dead one.
 *
 * Both handlers are covered because they had the same read, the same payload
 * and therefore the same bug, copy-pasted. The fix collapses them to one
 * helper each, so a third handler cannot reintroduce it.
 *
 * The `shippingDetails: true` column in each order read goes with them:
 * nothing reads that jsonb after this phase, and loading customer-facing data
 * nothing consumes is how it ends up in a response by accident.
 *
 * @see packages/api/src/routes/tracking.ts
 * @see packages/api/src/routes/admin/orders.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const findFirstOrder = vi.hoisted(() => vi.fn());
const findFirstShipment = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/database', () => ({
  db: {
    query: {
      orders: { findFirst: (...a: unknown[]) => findFirstOrder(...a) },
      orderShipments: { findFirst: (...a: unknown[]) => findFirstShipment(...a) },
    },
    select: (...a: unknown[]) => selectMock(...a),
  },
}));

const { trackingApp } = await import('../../src/routes/tracking');

const ORDER_ID = '00000000-0000-0000-0000-0000000000aa';

const ORDER = {
  id: ORDER_ID,
  orderNumber: 'CH-1042',
  status: 'shipped',
  itemCount: 1,
  guestEmail: 'buyer@example.com',
  guestPhone: null,
  user: null,
  shippingAddress: { city: 'Pune', state: 'MH', postalCode: '411001' },
  createdAt: new Date('2026-08-20T00:00:00Z'),
  shippedAt: new Date('2026-08-22T00:00:00Z'),
  deliveredAt: null,
};

const LIVE_SHIPMENT = {
  id: 'ship-live',
  carrier: 'Shiprocket',
  courierName: 'Delhivery',
  awbNumber: 'AWB55512345',
  trackingNumber: 'AWB55512345',
  trackingUrl: 'https://track.example/AWB55512345',
  status: 'in_transit',
  shippedAt: new Date('2026-08-22T00:00:00Z'),
  estimatedDeliveryAt: new Date('2026-09-04T00:00:00Z'),
  deliveredAt: null,
  voidedAt: null,
};

function app() {
  const instance = new Hono();
  instance.route('/api/tracking', trackingApp);
  return instance;
}

/**
 * The two handlers that actually read a shipment.
 *
 * `GET /:orderNumber` is NOT one of them — it validates the contact and 302s to
 * `/lookup`, so it has no payload of its own to get wrong.
 *
 * `/token/:token` is the link in a confirmation email, which is how most
 * customers arrive. It carried its own copy of the read and the payload, which
 * is exactly why the fix collapses both onto one helper.
 */
const lookup = () =>
  app().request('/api/tracking/lookup?orderNumber=CH-1042&email=buyer%40example.com');

const TOKEN = 'a'.repeat(36);
const byToken = () => app().request(`/api/tracking/token/${TOKEN}`);

/**
 * Every column name reachable from the `where` the handler passed.
 *
 * Walked rather than stringified: a drizzle `where` holds column objects and a
 * column points back at its table, so `JSON.stringify` throws
 * "Converting circular structure to JSON". Bounded and cycle-safe for the same
 * reason any graph walk in a test has to be — a helper must not hang the suite
 * it is diagnosing.
 */
function whereColumns(): string[] {
  const arg = findFirstShipment.mock.calls[0]?.[0] as Record<string, any> | undefined;
  const found: string[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || !node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);

    const name = (node as { name?: unknown }).name;
    const isColumn = typeof name === 'string' && 'table' in (node as object);
    if (isColumn) found.push(name);

    for (const value of Object.values(node as Record<string, unknown>)) {
      walk(value, depth + 1);
    }
  };

  walk(arg?.where, 0);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirstOrder.mockResolvedValue(ORDER);
  findFirstShipment.mockResolvedValue(LIVE_SHIPMENT);
});

describe.each([
  ['GET /api/tracking/lookup', lookup],
  ['GET /api/tracking/token/:token', byToken],
])('%s shows the LIVE shipment', (_name, request) => {
  it('filters on voided_at, so a dead label can never be returned', async () => {
    await request();

    expect(findFirstShipment).toHaveBeenCalled();

    const columns = whereColumns();
    expect(columns, 'the read is not scoped to this order').toContain('order_id');
    expect(columns, 'the void marker is not consulted').toContain('voided_at');
  });

  it('stops loading orders.shipping_details — nothing reads that jsonb now', async () => {
    await request();

    const columns = findFirstOrder.mock.calls[0]?.[0]?.columns ?? {};
    expect(
      Object.keys(columns),
      'the handler still loads the jsonb nothing reads'
    ).not.toContain('shippingDetails');
  });

  it('returns the courier and AWB, which are what a customer recognises', async () => {
    // `carrier` is the aggregator we bought through. Nobody outside this
    // office recognises it.
    const body = (await (await request()).json()) as Record<string, any>;

    expect(body.tracking).toMatchObject({
      courierName: 'Delhivery',
      awbNumber: 'AWB55512345',
    });
  });

  it('answers null — not a fallback — when the order has no shipment', async () => {
    // Falling back to orders.shipping_details would put the second source of
    // truth back, which is the whole defect this phase removes.
    findFirstShipment.mockResolvedValue(undefined);

    const body = (await (await request()).json()) as Record<string, any>;

    expect(body.tracking).toBeNull();
  });

  it('keeps the order timeline, which is a fact about the ORDER', async () => {
    // `orders.shippedAt` is what a customer sees while no shipment row exists
    // yet, and it is returned separately from `tracking` for that reason.
    findFirstShipment.mockResolvedValue(undefined);

    const body = (await (await request()).json()) as Record<string, any>;

    expect(body.timeline).toMatchObject({ shippedAt: expect.anything() });
  });

  it('withholds the internal dispatch fields', async () => {
    findFirstShipment.mockResolvedValue({
      ...LIVE_SHIPMENT,
      costPaise: 8900,
      labelObjectToken: 'r7Kq2-_aZ9',
      shippedWeightGrams: 900,
      externalShipmentId: 'SR-1',
      pickupVendorId: 'vendor-1',
    });

    const serialised = JSON.stringify(await (await request()).json());

    for (const internal of [
      'costPaise',
      'labelObjectToken',
      'shippedWeightGrams',
      'externalShipmentId',
      'pickupVendorId',
    ]) {
      expect(serialised, `${internal} leaked to the customer`).not.toContain(internal);
    }
  });

});

describe('GET /api/tracking/lookup keeps its anti-enumeration property', () => {
  it('gives a wrong contact the same answer as a missing order', async () => {
    // Only the lookup checks a contact — `/token/:token` authenticates by the
    // token itself. Adding fields to the payload must not change this.
    findFirstOrder.mockResolvedValue({ ...ORDER, guestEmail: 'someone@else.com' });

    const res = await lookup();

    expect(res.status).toBe(404);
  });
});
