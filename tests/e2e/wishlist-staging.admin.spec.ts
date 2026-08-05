/**
 * Staging a curated collection from the wishlist — staff.
 *
 * Runs under `chromium-admin`, which carries the stored staff session.
 *
 * The round trip is the test: heart products in a deliberate order, create a
 * collection from them, and find that order on the storefront. Anything less
 * proves a form saved to a table nobody reads.
 *
 * `page.$$eval` below is Playwright's DOM-query helper — it serialises the
 * callback into the page and is unrelated to JavaScript's `eval()`.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * SERIAL, and not by preference.
 *
 * Every test here signs in as the same staff account, and a wishlist belongs to
 * an account — so in parallel they mutate one another's list. A reorder in one
 * test then hits the endpoint's permutation guard (#500), gets a 409, and
 * reloads, wiping the arrangement the test was about to assert on.
 *
 * That is the single-staging-slot property surfacing in the suite rather than a
 * harness quirk: the same thing happens if two admins share a login.
 */
test.describe.configure({ mode: 'serial' });

/** Unique per run, so a re-run cannot collide on the unique slug. */
const stamp = () => `wl-${Date.now().toString(36)}`;

async function wishlistOrder(page: Page): Promise<string[]> {
  return page.$$eval(
    '[data-testid="wishlist-item"] [aria-label$=" later"]',
    (els) =>
      els.map((el) =>
        (el.getAttribute('aria-label') ?? '')
          .replace(/^Move /, '')
          .replace(/ later$/, '')
      )
  );
}

/**
 * Ensure the staff wishlist holds at least three items.
 *
 * The admin storage state is shared across this whole spec and the list is
 * server-backed, so it ARRIVES with whatever earlier tests saved. Hearts are a
 * toggle — clicking one that is already saved removes it — so this adds only
 * what is missing rather than blindly clicking three.
 */
async function stageThree(page: Page) {
  await page.goto('/wishlist', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  let have = await page.locator('[data-testid="wishlist-item"]').count();

  if (have < 3) {
    await page.goto('/posters', { waitUntil: 'networkidle' });
    const hearts = page.getByRole('button', { name: /save|wishlist/i });
    for (let i = 0; have < 3 && i < 12; i++) {
      const heart = hearts.nth(i);
      // Already saved shows as pressed; clicking it would unsave.
      if ((await heart.getAttribute('aria-pressed')) === 'true') continue;
      await heart.click();
      await page.waitForTimeout(200);
      have += 1;
    }
    await page.goto('/wishlist', { waitUntil: 'networkidle' });
  }

  await page.waitForSelector('[data-testid="wishlist-item"]');
}

test.describe('the staging bar', () => {
  test('is visible to staff and says how many are staged', async ({ page }) => {
    await stageThree(page);

    const bar = page.getByTestId('wishlist-staging-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(/items/);
    // The single-slot caveat is stated, not left to be discovered.
    await expect(bar).toContainText(/your own wishlist/i);
  });
});

test.describe('the round trip', () => {
  test('a staged order reaches the storefront intact', async ({ page }) => {
    const slug = stamp();

    await stageThree(page);

    // Rearrange deliberately, so the storefront order cannot pass by matching
    // the order things happened to be saved in.
    const initial = await wishlistOrder(page);

    /**
     * ONE move, not a chain of them.
     *
     * Each click fires its own PUT, and chaining several raced them — a later
     * click landing before the previous write settled produced an order that
     * matched neither. One move is enough to prove the storefront order is the
     * curated one rather than the order things happened to be saved in.
     */
    await page
      .getByRole('button', { name: `Move ${initial[1]} earlier` })
      .click();

    /**
     * Polled, not read once.
     *
     * The move applies optimistically and then persists, and the store's own
     * load() can still be in flight from the page mount — when it lands it
     * replaces `ids` wholesale. A single read right after the click can
     * therefore catch the pre-move order. Poll until it settles.
     */
    await expect
      .poll(async () => (await wishlistOrder(page))[0], { timeout: 10000 })
      .toBe(initial[1]);

    const staged = await wishlistOrder(page);
    expect(staged).not.toEqual(initial);

    await page
      .getByRole('button', { name: /Create collection from these/i })
      .click();
    await page.waitForURL('**/admin/collections/**', { timeout: 20000 });

    await page.getByLabel('Title', { exact: true }).fill(`Staged ${slug}`);
    await page.getByLabel('Slug', { exact: true }).fill(slug);
    // Created unpublished on purpose — a half-built collection should not be
    // reachable. Publishing is the admin's deliberate act.
    await page.getByLabel('Published').check();
    await page
      .getByRole('button', { name: /Save changes|Create collection/i })
      .click();
    await page.waitForURL('**/admin/collections', { timeout: 20000 });

    await page.goto(`/collections/${slug}`, { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toHaveText(`Staged ${slug}`);

    /**
     * ProductCard renders the title inside a <Link>, NOT a heading — so
     * `h2, h3` matches nothing and silently yields an empty list. Read the
     * product link instead, and strip the SKU the card appends.
     */
    const rendered = await page.$$eval(
      '[data-testid="product-card"] a[href^="/posters/"]',
      (els) =>
        els
          .map((el) => (el.textContent ?? '').split('#')[0].trim())
          .filter(Boolean)
    );

    expect(rendered.slice(0, staged.length)).toEqual(staged);
  });

  test('the collection is unpublished until the admin says otherwise', async ({
    page,
  }) => {
    const slug = stamp();

    await stageThree(page);
    await page
      .getByRole('button', { name: /Create collection from these/i })
      .click();
    await page.waitForURL('**/admin/collections/**', { timeout: 20000 });

    await page.getByLabel('Title', { exact: true }).fill(`Draft ${slug}`);
    await page.getByLabel('Slug', { exact: true }).fill(slug);
    await page
      .getByRole('button', { name: /Save changes|Create collection/i })
      .click();
    await page.waitForURL('**/admin/collections', { timeout: 20000 });

    // Not published, so not reachable.
    const response = await page.goto(`/collections/${slug}`);
    expect(response?.status()).toBe(404);
  });
});

test.describe('editing does not destroy curation', () => {
  test('saving a manual collection keeps its members', async ({ page }) => {
    /**
     * The regression #503 found: the edit form REPLACES the member list on
     * save, and it used to load with an empty one — so renaming a curated
     * collection silently deleted every product in it.
     */
    const slug = stamp();

    await stageThree(page);
    const staged = await wishlistOrder(page);

    await page
      .getByRole('button', { name: /Create collection from these/i })
      .click();
    await page.waitForURL('**/admin/collections/**', { timeout: 20000 });
    const editUrl = page.url();

    await page.getByLabel('Title', { exact: true }).fill(`Keep ${slug}`);
    await page.getByLabel('Slug', { exact: true }).fill(slug);
    await page.getByLabel('Published').check();
    await page
      .getByRole('button', { name: /Save changes|Create collection/i })
      .click();
    await page.waitForURL('**/admin/collections', { timeout: 20000 });

    // Open it again and save WITHOUT touching the product list.
    await page.goto(editUrl, { waitUntil: 'networkidle' });
    await page.getByLabel('Title', { exact: true }).fill(`Keep ${slug} edited`);
    await page
      .getByRole('button', { name: /Save changes|Create collection/i })
      .click();
    await page.waitForURL('**/admin/collections', { timeout: 20000 });

    await page.goto(`/collections/${slug}`, { waitUntil: 'networkidle' });
    const rendered = await page.$$eval(
      '[data-testid="product-card"] a[href^="/posters/"]',
      (els) =>
        els
          .map((el) => (el.textContent ?? '').split('#')[0].trim())
          .filter(Boolean)
    );

    expect(rendered).toHaveLength(staged.length);
  });
});
