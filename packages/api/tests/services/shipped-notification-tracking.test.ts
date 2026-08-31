/**
 * The shipped notification links to the parcel, not to a generic page.
 *
 * `getSmsMessage` read `order.shippingDetails?.trackingUrl` and fell back to
 * `chobii.art/orders` with a `||`. The email templates did the same for the
 * URL, the carrier ("our carrier partner"), the tracking number and the
 * estimated delivery date.
 *
 * Because the admin screen wrote that jsonb and nothing else did, the value was
 * sometimes present — which is why the fallback was never noticed. #707 stopped
 * writing it, so after this phase the fallback would be the ONLY branch left:
 * every shipped SMS pointing at a generic page and every shipped email naming
 * no carrier, silently and forever.
 *
 * The shipment is PASSED IN rather than queried. `email-templates.ts` has no
 * database import today and giving it one would make every template test need a
 * mock — and four callers each choosing which shipment is live is the exact
 * defect this phase removes.
 *
 * @see packages/api/src/services/notifications.ts
 * @see packages/api/src/services/email-templates.ts
 */

import { describe, it, expect } from 'vitest';

import {
  getShippedTemplate,
  getOutForDeliveryTemplate,
  getDeliveredTemplate,
} from '../../src/services/email-templates';
import { getSmsMessage } from '../../src/services/notifications';

const ORDER = {
  orderNumber: 'CH-1042',
  customerName: 'Asha',
  items: [],
  total: '4200.00',
} as unknown as Parameters<typeof getShippedTemplate>[0];

const SHIPMENT = {
  carrier: 'Shiprocket',
  courierName: 'Delhivery',
  awbNumber: 'AWB55512345',
  trackingNumber: 'AWB55512345',
  trackingUrl: 'https://track.example/AWB55512345',
  estimatedDeliveryAt: new Date('2026-09-04T00:00:00Z'),
};

describe('the shipped SMS', () => {
  it('links to the parcel when a shipment exists', () => {
    const text = getSmsMessage('shipped', ORDER, SHIPMENT);

    expect(text).toContain(SHIPMENT.trackingUrl);
    expect(text).not.toContain('chobii.art/orders');
  });

  it('falls back to the orders page only when there is genuinely no shipment', () => {
    // "No shipment yet" is a real state a notification can be sent in. The
    // fallback is fine for that — what was wrong was reaching it because the
    // code read a column nothing writes.
    const text = getSmsMessage('shipped', ORDER, null);

    expect(text).toContain('chobii.art/orders');
  });

  it('never reads order.shippingDetails', () => {
    // The jsonb is not written after this phase, so a read of it is a silent
    // permanent empty rather than a fallback.
    const withStale = {
      ...ORDER,
      shippingDetails: { trackingUrl: 'https://stale.example/OLD' },
    } as typeof ORDER;

    const text = getSmsMessage('shipped', withStale, SHIPMENT);

    expect(text).not.toContain('stale.example');
    expect(text).toContain(SHIPMENT.trackingUrl);
  });
});

describe('the shipped email', () => {
  it('names the COURIER, which is what the customer recognises', () => {
    // `carrier` is the aggregator we bought through and means nothing to them.
    const html = getShippedTemplate(ORDER, SHIPMENT).html;

    expect(html).toContain('Delhivery');
  });

  it('carries the tracking number and the link', () => {
    const html = getShippedTemplate(ORDER, SHIPMENT).html;

    expect(html).toContain(SHIPMENT.trackingNumber);
    expect(html).toContain(SHIPMENT.trackingUrl);
  });

  it("says 'our carrier partner' only when there is no shipment at all", () => {
    expect(getShippedTemplate(ORDER, null).html).toContain('our carrier partner');
    expect(getShippedTemplate(ORDER, SHIPMENT).html).not.toContain('our carrier partner');
  });

  it('never reads order.shippingDetails', () => {
    const withStale = {
      ...ORDER,
      shippingDetails: { trackingUrl: 'https://stale.example/OLD', carrier: 'StaleCo' },
    } as typeof ORDER;

    const html = getShippedTemplate(withStale, SHIPMENT).html;

    expect(html).not.toContain('stale.example');
    expect(html).not.toContain('StaleCo');
  });
});

describe('the out-for-delivery and delivered emails', () => {
  it('link to the parcel too', () => {
    // `getOutForDeliveryTemplate` read the same jsonb for its URL.
    const html = getOutForDeliveryTemplate(ORDER, SHIPMENT).html;

    expect(html).toContain(SHIPMENT.trackingUrl);
  });

  it('still render with no shipment', () => {
    // Out-for-delivery mail can legitimately go out on an order whose shipment
    // row was never created — it must not throw.
    expect(() => getOutForDeliveryTemplate(ORDER, null)).not.toThrow();
  });

  it('leaves the delivered template alone — it never read the jsonb', () => {
    // Worth pinning: it takes no shipment because it needs none, and adding an
    // unused parameter for symmetry would be a lie about what it depends on.
    expect(getDeliveredTemplate.length).toBe(1);
    expect(() => getDeliveredTemplate(ORDER)).not.toThrow();
  });
});
