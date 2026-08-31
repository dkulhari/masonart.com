/**
 * "Does this order carry a label?" — asked of the store that has the answer.
 *
 * Two guards asked it of `orders.shipping_details`, a jsonb column that #707
 * stopped writing. Left alone, both would answer `false` for every order
 * forever and the `dispatched` edge would become untakeable — a pipeline with
 * no way to despatch, which is the failure `lib/production-transitions.ts`
 * names as "an edge nothing in the codebase can take".
 *
 * That makes this ticket load-bearing rather than cleanup: it moves in the same
 * pass as #707 or production breaks.
 *
 * The two guards answer the same question at different boundaries, and the
 * difference is deliberate:
 *
 *   - `lib/vendor-scope.ts` — VENDOR-facing, so a BOOLEAN. The AWB is a
 *     courier's handle on a customer's parcel and R1 says no vendor projection
 *     names it. The vendor needs the answer, never the value.
 *   - `routes/admin/production-jobs.ts` — ADMIN-side, and its `detail` is an
 *     AUDIT payload. Naming the handle there is what lets a dispute say which
 *     label an edge was taken on.
 *
 * Asserted against the source, not by fixture: both are SQL fragments whose
 * whole content is the question, and a mocked db would report whatever it was
 * queued rather than what was asked.
 *
 * @see packages/api/src/lib/vendor-scope.ts
 * @see packages/api/src/routes/admin/production-jobs.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_SRC = resolve(__dirname, '../../src');

const read = (relative: string) => readFileSync(resolve(API_SRC, relative), 'utf8');

/** The ORDER_HAS_LABEL fragment, isolated from the rest of the module. */
function orderHasLabelFragment(): string {
  const src = read('lib/vendor-scope.ts');
  const start = src.indexOf('const ORDER_HAS_LABEL');

  expect(start, 'ORDER_HAS_LABEL is gone — did the guard move?').toBeGreaterThan(-1);
  return src.slice(start, start + 1200);
}

describe('the vendor-facing guard', () => {
  it('reads order_shipments, not the jsonb #707 stopped writing', () => {
    const fragment = orderHasLabelFragment();

    expect(fragment, 'still reading orders.shipping_details').not.toContain('shippingDetails');
    expect(fragment).toMatch(/orderShipments|order_shipments/);
  });

  it('stays a BOOLEAN — R1 says no vendor projection names the AWB', () => {
    // The vendor needs to know a label exists. Handing them the number would
    // put a customer's parcel handle on the supplier boundary.
    expect(orderHasLabelFragment()).toContain('sql<boolean>');
  });

  it('does not count a VOIDED label as evidence the goods left', () => {
    // A dead label is evidence a label was bought and then killed, not that
    // anything was handed to a courier.
    expect(orderHasLabelFragment().toLowerCase()).toMatch(/voided_at|voidedat/);
  });

  it('accepts any of the three handles a real label carries', () => {
    // The token means we bought one; the AWB and tracking number mean a
    // courier acknowledged it. Any one of them is a label.
    const fragment = orderHasLabelFragment();

    for (const handle of ['labelObjectToken', 'awbNumber', 'trackingNumber']) {
      expect(fragment, `${handle} is not accepted as a label handle`).toContain(handle);
    }
  });
});

describe('the admin despatch guard', () => {
  const src = () => read('routes/admin/production-jobs.ts');

  it('reads order_shipments rather than the jsonb', () => {
    const source = src();

    expect(source, 'still reading orders.shippingDetails').not.toContain(
      'orders.shippingDetails'
    );
    expect(source).toContain('orderShipments');
  });

  it('drops the OrderShippingDetails helper it no longer needs', () => {
    // `orderShippingLabel(details)` took the jsonb shape. Leaving it would be a
    // function that compiles, reads a column nothing writes, and always
    // returns null.
    const source = src();

    expect(source).not.toContain('orderShippingLabel');
    expect(source, 'the jsonb type import is now unused').not.toContain(
      'type OrderShippingDetails'
    );
  });

  it('requires the shipment to be live', () => {
    const source = src();
    const start = source.indexOf('despatchEvidence');

    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, start + 2500).toLowerCase()).toMatch(/voidedat|voided_at/);
  });
});

describe('the production seam is untouched by any of this', () => {
  it('still imports nothing named shiprocket under lib/production-*', () => {
    // Both guards read a TABLE. If a fix here ever reached for a carrier
    // client, tests/lib/production-seam.test.ts would say so — asserted here
    // too, beside the change that could cause it.
    for (const file of ['lib/production-readiness.ts', 'lib/production-transitions.ts']) {
      expect(read(file).toLowerCase(), `${file} reached for the courier`).not.toMatch(
        /from ['"][^'"]*shiprocket/
      );
    }
  });
});
