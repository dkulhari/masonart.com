import { test, expect } from '@playwright/test';

import { API_URL, seedGuestCart, waitForCartToLoad } from './helpers/cart';

/**
 * Smoke test for the guest cart seeding fixture (#359).
 *
 * `checkout.spec.ts` is 100+ tests that all fail the same way when seeding
 * breaks — an empty cart means `/checkout` renders "Your cart is empty" and
 * every assertion times out somewhere further down. That is a slow and noisy
 * way to learn that the fixture is broken.
 *
 * This file asserts only the fixture's contract, from a cold browser context:
 * an item goes into the guest cart, and `/checkout` renders the address form.
 * If it is red, do not read the rest of the checkout failures — fix this first.
 */
test.describe.configure({ timeout: 60_000 });

test.describe('Guest cart seeding', () => {
  test('puts a real catalogue item in the cart a cold context can see', async ({
    page,
  }) => {
    await page.goto('/');
    const seeded = await seedGuestCart(page);

    // The ids come from the live catalogue, not from the spec, so a seed that
    // "succeeded" against nothing would still be a failure.
    expect(seeded.productId).toBeTruthy();
    expect(seeded.variantId).toBeTruthy();
    expect(seeded.price).toBeGreaterThan(0);

    // Read back through the API the page itself uses, rather than trusting the
    // POST's own response.
    const cart = await page.evaluate(async (apiUrl) => {
      const response = await fetch(`${apiUrl}/api/cart`, {
        credentials: 'include',
      });
      return (await response.json()) as { items?: unknown[] };
    }, API_URL);

    expect(cart.items?.length).toBe(1);
  });

  test('renders the checkout address form after seeding', async ({ page }) => {
    await page.goto('/');
    await seedGuestCart(page);

    await page.goto('/checkout', { waitUntil: 'networkidle' });
    await waitForCartToLoad(page);

    await expect(page.locator('h1:has-text("Your cart is empty")')).toHaveCount(
      0,
    );
    await expect(page.locator('#fullName')).toBeVisible();
  });

  test('seeds under the free shipping threshold when asked', async ({
    page,
  }) => {
    await page.goto('/');
    // Which side of ₹999 the line lands on is the part the shipping specs
    // depend on, and the only part of `unitPrice` that is guaranteed — the
    // exact figure comes from the catalogue.
    const seeded = await seedGuestCart(page, { unitPrice: 500 });

    expect(seeded.price).toBeLessThan(999);
  });

  test('makes a second call a second line, not a bigger quantity', async ({
    page,
  }) => {
    await page.goto('/');
    const first = await seedGuestCart(page);
    const second = await seedGuestCart(page, { exclude: [first.variantId] });

    expect(second.variantId).not.toBe(first.variantId);

    const cart = await page.evaluate(async (apiUrl) => {
      const response = await fetch(`${apiUrl}/api/cart`, {
        credentials: 'include',
      });
      return (await response.json()) as { items?: unknown[] };
    }, API_URL);

    expect(cart.items?.length).toBe(2);
  });
});
