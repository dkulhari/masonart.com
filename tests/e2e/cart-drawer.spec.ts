import { test, expect } from '@playwright/test';

/**
 * Cart Drawer E2E Tests (#460)
 *
 * The cart is a left slide-out drawer, matching mesonart.com. The header
 * control opens it in place; `/cart` stays routable for deep links, and
 * tests/e2e/cart.spec.ts still covers that page.
 *
 * Cart contents are seeded through localStorage (`chobii-cart-storage`, the
 * zustand persist key) so these tests need no seeded catalogue. Auto-open on
 * add-to-cart is covered at the store level in
 * packages/web/tests/stores/cart-drawer.test.ts.
 */

const CART_STORAGE_KEY = 'chobii-cart-storage';

const seededItem = {
  id: 'cart_e2e_1',
  productId: 'p-e2e',
  variantId: 'v-e2e',
  frameId: null,
  quantity: 2,
  productTitle: 'Drawer Test Poster',
  productSlug: 'drawer-test-poster',
  thumbnailUrl: '/placeholder.jpg',
  sizeLabel: '18x24',
  widthInches: 18,
  heightInches: 24,
  framePrice: 0,
  unitPrice: 1999,
  isAiGenerated: false,
  addedAt: '2026-08-05T00:00:00.000Z',
};

const cartButton = (page: import('@playwright/test').Page) =>
  page.locator('header button[aria-label^="Shopping cart"]').first();

const drawer = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: /your cart/i });

async function seedCart(page: import('@playwright/test').Page) {
  await page.addInitScript(
    ([key, item]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({ state: { items: [item] }, version: 0 })
      );
    },
    [CART_STORAGE_KEY, seededItem] as const
  );
}

test.describe('Cart Drawer - opening', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('opens from the header without leaving the page', async ({ page }) => {
    await expect(drawer(page)).toBeHidden();

    await cartButton(page).click();

    await expect(drawer(page)).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('slides in from the LEFT edge', async ({ page }) => {
    await cartButton(page).click();
    await expect(drawer(page)).toBeVisible();

    // The whole point of #460: the panel is flush against x=0, not against the
    // right edge the way the old CartSheet was.
    const box = await drawer(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThanOrEqual(1);
    expect(box!.x + box!.width).toBeLessThan(viewport!.width);
  });

  test('closes on Escape', async ({ page }) => {
    await cartButton(page).click();
    await expect(drawer(page)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(drawer(page)).toBeHidden();
  });

  test('closes on backdrop click', async ({ page }) => {
    await cartButton(page).click();
    await expect(drawer(page)).toBeVisible();

    // The backdrop is inset-0, so it sits UNDER the panel too — the position is
    // element-relative, and anything inside the first 448px (max-w-md) hits the
    // drawer instead. Click well clear of it, on the right.
    const viewport = page.viewportSize();
    await page.getByTestId('cart-drawer-backdrop').click({
      position: { x: viewport!.width - 100, y: 300 },
    });

    await expect(drawer(page)).toBeHidden();
  });

  test('closes from the close button', async ({ page }) => {
    await cartButton(page).click();
    await drawer(page).getByRole('button', { name: /close cart/i }).click();

    await expect(drawer(page)).toBeHidden();
  });
});

test.describe('Cart Drawer - contents', () => {
  test.beforeEach(async ({ page }) => {
    await seedCart(page);
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('shows the seeded item and its count', async ({ page }) => {
    await cartButton(page).click();

    await expect(drawer(page).getByText('Drawer Test Poster')).toBeVisible();
    await expect(drawer(page).getByText(/2 items/i)).toBeVisible();
  });

  test('still offers the full cart page', async ({ page }) => {
    await cartButton(page).click();

    await drawer(page).getByRole('link', { name: /view cart/i }).click();

    await expect(page).toHaveURL('/cart');
  });

  test('leads on to checkout', async ({ page }) => {
    await cartButton(page).click();

    await expect(
      drawer(page).getByRole('link', { name: /checkout/i })
    ).toHaveAttribute('href', '/checkout');
  });
});

test.describe('Cart Drawer - empty state', () => {
  test('offers a way back into the catalogue', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await cartButton(page).click();

    await expect(drawer(page).getByText(/your cart is empty/i)).toBeVisible();
    await expect(
      drawer(page).getByRole('link', { name: /browse posters/i })
    ).toHaveAttribute('href', '/posters');
  });
});
