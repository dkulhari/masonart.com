import { test, expect } from '@playwright/test';

/**
 * Wishlist E2E (#387-#389, #417, #422, #477)
 *
 * Runs entirely SIGNED OUT, which is the feature's central claim: saving a
 * poster needs no account. The guest list lives in localStorage under the
 * zustand persist key and merges into the account at sign-in — the merge
 * itself is covered at the store and route level, since exercising it here
 * would mean registering a throwaway account per run.
 */

const WISHLIST_STORAGE_KEY = 'chobii-wishlist-storage';

const heartOnCard = (page: import('@playwright/test').Page) =>
  page.locator('main button[aria-label="Add to wishlist"]');

const savedHeart = (page: import('@playwright/test').Page) =>
  page.locator('main button[aria-label="Remove from wishlist"]');

/** Cards, counted by their media link rather than by a test id. */
const cards = (page: import('@playwright/test').Page) =>
  page.locator('main a[href^="/posters/"]');

test.describe('wishlist, signed out', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  test('a guest can save a poster without signing in', async ({ page }) => {
    await heartOnCard(page).first().click();

    await expect(savedHeart(page).first()).toBeVisible();
    // And it is on disk, which is what survives the reload below.
    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      WISHLIST_STORAGE_KEY
    );
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).state.ids).toHaveLength(1);
  });

  test('the header heart leads to the wishlist page', async ({ page }) => {
    await page.locator('header a[aria-label^="Wishlist"]').first().click();

    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(
      page.getByRole('heading', { name: 'Wishlist', level: 1 })
    ).toBeVisible();
  });

  test('the page invites browsing when nothing is saved', async ({ page }) => {
    await page.goto('/wishlist', { waitUntil: 'networkidle' });

    await expect(page.getByText(/nothing saved yet/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /browse posters/i })
    ).toBeVisible();
  });

  test('a saved poster shows on the page and survives a reload', async ({
    page,
  }) => {
    await heartOnCard(page).first().click();
    await expect(savedHeart(page).first()).toBeVisible();

    await page.goto('/wishlist', { waitUntil: 'networkidle' });
    await expect(cards(page).first()).toBeVisible();
    const before = await cards(page).count();
    expect(before).toBeGreaterThan(0);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(cards(page)).toHaveCount(before);
  });

  test('unsaving from the page drops the card', async ({ page }) => {
    await heartOnCard(page).first().click();
    await expect(savedHeart(page).first()).toBeVisible();

    await page.goto('/wishlist', { waitUntil: 'networkidle' });
    await expect(savedHeart(page).first()).toBeVisible();
    await savedHeart(page).first().click();

    await expect(page.getByText(/nothing saved yet/i)).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });

  test('a saved id the catalogue has lost is explained, not blank', async ({
    page,
  }) => {
    // Reported live (#494): the badge said 3 and the page rendered the
    // collection grid's "adjusting your filters" copy. A guest's ids outlive
    // the catalogue — reseeding the database changes every product id.
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, value),
      {
        key: WISHLIST_STORAGE_KEY,
        value: JSON.stringify({
          state: { ids: ['deadbeef-0000-4000-8000-000000000000'] },
          version: 0,
        }),
      }
    );

    await page.goto('/wishlist', { waitUntil: 'networkidle' });

    await expect(page.getByText(/no longer available/i)).toBeVisible();
    await expect(page.getByText(/adjusting your filters/i)).toHaveCount(0);
    // Cleared, so the badge stops counting what the page cannot show.
    await expect(
      page.locator('header a[aria-label="Wishlist"]')
    ).toBeVisible();
  });

  test('a guest page load spends no wishlist requests', async ({ page }) => {
    // The store used to fetch the auth-gated endpoint before it knew the
    // session — one 401 per mounted heart (#417).
    const calls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/wishlist')) calls.push(request.url());
    });

    await page.goto('/posters', { waitUntil: 'networkidle' });
    await page.goto('/wishlist', { waitUntil: 'networkidle' });

    expect(calls).toEqual([]);
  });
});
