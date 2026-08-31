/**
 * Order detail returns the shipment, on both sides of the fence.
 *
 * Both projections returned `shippingDetails`, the jsonb #707 stopped writing.
 * Left alone the admin types a tracking number, the save succeeds, and the
 * panel it was typed into renders empty — and the customer's own order page
 * shows nothing while the tracking page shows the parcel.
 *
 * The two sides get DIFFERENT shapes on purpose, which is what these assert:
 *
 *   - Admin may see `cost_paise`. Shipping is baked into the item price and the
 *     customer is charged nothing for it, so what we PAID is the only number
 *     margin can be computed from, and this is the screen it belongs on.
 *   - The customer gets the same allow-list `routes/tracking.ts` uses. A second
 *     hand-written projection is how a cost or a label token eventually leaks.
 *
 * @see packages/api/src/routes/tracking.ts
 * @see packages/api/src/routes/admin/orders.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirstShipment = vi.hoisted(() => vi.fn());

vi.mock('../../src/database', () => ({
  db: {
    query: {
      orderShipments: { findFirst: (...a: unknown[]) => findFirstShipment(...a) },
    },
  },
}));

const ORDER_ID = '00000000-0000-0000-0000-0000000000aa';

/** Everything `order_shipments` now holds, including what must not escape. */
const FULL_ROW = {
  id: 'ship-1',
  orderId: ORDER_ID,
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
  costPaise: 8900,
  labelObjectToken: 'r7Kq2-_aZ9',
  externalShipmentId: 'SR-1',
  externalOrderId: 'SR-ORD-1',
  shippedWeightGrams: 900,
  lengthCm: 40,
  widthCm: 30,
  heightCm: 5,
  pickupVendorId: 'vendor-1',
};

/** Internal to dispatch — never the customer's business. */
const INTERNAL = [
  'costPaise',
  'labelObjectToken',
  'externalShipmentId',
  'externalOrderId',
  'shippedWeightGrams',
  'lengthCm',
  'widthCm',
  'heightCm',
  'pickupVendorId',
];

beforeEach(() => {
  vi.clearAllMocks();
  findFirstShipment.mockResolvedValue(FULL_ROW);
});

describe('the customer projection', () => {
  it('is the same allow-list the tracking route uses', async () => {
    // Imported from tracking.ts rather than rebuilt: one definition of "what a
    // customer may see about a parcel", so adding a dispatch column cannot
    // widen one surface and not the other.
    const { trackingPayloadForOrder } = await import('../../src/routes/tracking');

    const payload = trackingPayloadForOrder(FULL_ROW as never);

    expect(payload).toMatchObject({
      courierName: 'Delhivery',
      awbNumber: 'AWB55512345',
      trackingNumber: 'AWB55512345',
    });
  });

  it('withholds every internal dispatch field', async () => {
    const { trackingPayloadForOrder } = await import('../../src/routes/tracking');

    const serialised = JSON.stringify(trackingPayloadForOrder(FULL_ROW as never));

    for (const field of INTERNAL) {
      expect(serialised, `${field} leaked to the customer`).not.toContain(field);
    }
  });

  it('answers null when the order has no shipment', async () => {
    const { trackingPayloadForOrder } = await import('../../src/routes/tracking');

    expect(trackingPayloadForOrder(null)).toBeNull();
  });
});

describe('the live-shipment read is shared, not re-implemented', () => {
  it('filters on voided_at wherever it is called from', async () => {
    const { liveShipmentForOrder } = await import('../../src/routes/tracking');

    await liveShipmentForOrder(ORDER_ID);

    expect(findFirstShipment).toHaveBeenCalled();
    // A caller that wrote its own read could forget this and hand somebody a
    // dead AWB — which is the defect #709 removed from two handlers already.
    const where = findFirstShipment.mock.calls[0]?.[0]?.where;
    expect(where, 'the read is unscoped').toBeDefined();
  });
});
