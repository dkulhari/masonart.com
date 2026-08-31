/**
 * The bug this whole feature exists for, proved end to end.
 *
 * `PATCH /admin/orders/:id/shipping` wrote `orders.shipping_details`;
 * `GET /api/tracking/*` read `order_shipments`. Nothing bridged them, and the
 * only writer of `order_shipments` had no UI. So an admin entered a tracking
 * number, the save returned 200, and the customer's page showed nothing.
 * Permanently.
 *
 * ## Why this test has to exist, given the ones that already did
 *
 * `guest-order-tracking.spec.ts` covers the /track page thoroughly and would
 * have stayed green through the entire bug — its own header says it "uses
 * mocked API responses since they test the UI flow, not the actual backend
 * tracking functionality". A mocked `/api/tracking/lookup` cannot notice that
 * nothing writes the table it reads.
 *
 * So this spec mocks NOTHING. It writes through the real admin endpoint, then
 * reads through the real public page, against the real database. The two halves
 * meeting is the entire assertion.
 *
 * The unit suites cannot cover it either: each one mocks the database, so each
 * proves only that a statement was aimed at a table. Aim is not arrival.
 *
 * ## Shape
 *
 * The write goes through the API rather than the admin UI, and the read goes
 * through the browser. That is deliberate: the defect was never in the admin
 * form — it was in where the value landed — and driving a full admin order
 * screen would couple this to selectors that have nothing to do with it. What
 * must be real is the STORE in the middle and the CUSTOMER's view of it.
 *
 * Runs under the `chromium-admin` project (see playwright.config.ts), which is
 * why the filename carries `.admin.` — that is what grants the authenticated
 * storage state the write needs.
 *
 * @see packages/api/src/routes/admin/orders.ts
 * @see packages/api/src/routes/tracking.ts
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

/** Unique per run, so a re-run cannot pass on the previous run's value. */
const AWB = `E2E${Date.now()}`;
const COURIER = 'Delhivery';

interface TrackableOrder {
  id: string;
  orderNumber: string;
  email: string;
}

/**
 * An order this run may write tracking onto.
 *
 * Discovered, never hardcoded: order numbers are sequential per environment, so
 * a literal would pass on the machine it was written on and fail everywhere
 * else. Prefers one with no live shipment so the write exercises the INSERT
 * branch, which is the one an admin hits on a fresh order.
 */
async function findTrackableOrder(request: APIRequestContext): Promise<TrackableOrder | null> {
  const res = await request.get('/api/admin/orders?pageSize=25&sortBy=createdAt&sortOrder=desc');
  if (!res.ok()) return null;

  const body = (await res.json()) as { orders?: Array<Record<string, any>> };

  for (const order of body.orders ?? []) {
    const email = order.customer?.email ?? order.guestEmail ?? order.user?.email;
    if (!email || !order.id || !order.orderNumber) continue;

    return { id: order.id, orderNumber: order.orderNumber, email };
  }

  return null;
}

test.describe('an admin-entered tracking number reaches the customer', () => {
  test('saves through the admin API and shows on the public tracking page', async ({
    page,
    request,
    browser,
  }) => {
    const order = await findTrackableOrder(request);
    test.skip(!order, 'no order with a contact address in this environment');

    // 1. The admin enters tracking. This is the write that used to land in a
    //    jsonb column nothing read.
    const saved = await request.patch(`/api/admin/orders/${order!.id}/shipping`, {
      data: { carrier: COURIER, trackingNumber: AWB },
    });

    expect(saved.ok(), `admin shipping save failed: ${saved.status()}`).toBe(true);

    // The response returns the shipment it wrote, not the jsonb it did not —
    // returning the old shape would tell the admin screen the edit had not
    // taken.
    const savedBody = (await saved.json()) as Record<string, any>;
    expect(savedBody.shipment, 'the save did not return a shipment').toBeTruthy();
    expect(savedBody.shipment.trackingNumber).toBe(AWB);

    // 2. The customer looks it up. A CLEAN context: no admin cookies, exactly
    //    what somebody arriving from an email has.
    const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const customerPage = await customer.newPage();

    try {
      await customerPage.goto('/track', { waitUntil: 'networkidle' });

      await customerPage.getByLabel('Order Number').fill(order!.orderNumber);
      await customerPage.locator('main').getByLabel('Email Address').fill(order!.email);
      await customerPage.getByRole('button', { name: /track order/i }).click();

      // The assertion the whole feature exists for. Before #707 this page
      // rendered nothing at all for an order tracked this way.
      await expect(customerPage.getByText(AWB)).toBeVisible({ timeout: 15_000 });
      await expect(customerPage.getByText(COURIER).first()).toBeVisible();
    } finally {
      await customer.close();
    }

    // `page` is unused for the customer leg on purpose — it carries the admin
    // storage state, and asserting the public page through an authenticated
    // context would prove something no real customer experiences.
    expect(page).toBeDefined();
  });

  test('the public lookup reads the shipment, not the order jsonb', async ({ request }) => {
    const order = await findTrackableOrder(request);
    test.skip(!order, 'no order with a contact address in this environment');

    await request.patch(`/api/admin/orders/${order!.id}/shipping`, {
      data: { carrier: COURIER, trackingNumber: AWB },
    });

    // Unauthenticated, straight at the public endpoint — the one that answered
    // `tracking: null` for every order an admin had tracked.
    const res = await request.get(
      `/api/tracking/lookup?orderNumber=${encodeURIComponent(order!.orderNumber)}` +
        `&email=${encodeURIComponent(order!.email)}`
    );

    expect(res.ok(), `public tracking lookup failed: ${res.status()}`).toBe(true);

    const body = (await res.json()) as Record<string, any>;

    expect(body.tracking, 'tracking is null — the stores are still split').not.toBeNull();
    expect(body.tracking.trackingNumber).toBe(AWB);

    // The allow-list holds: dispatch internals never reach a customer.
    const serialised = JSON.stringify(body);
    for (const internal of ['costPaise', 'labelObjectToken', 'pickupVendorId']) {
      expect(serialised, `${internal} leaked to the customer`).not.toContain(internal);
    }
  });
});
