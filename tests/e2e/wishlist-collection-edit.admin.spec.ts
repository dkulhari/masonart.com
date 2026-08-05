/**
 * Editing a collection's order through the wishlist — the full loop.
 *
 * Create a collection, load its members back into the wishlist, rearrange
 * them, and save over the same collection. The assertion that matters is step
 * six: the NEW order, read off the storefront.
 *
 * Read from the storefront rather than the admin form on purpose. The form can
 * hold the right order and fail to persist it — that is exactly how #503's
 * membership-wiping bug looked from the inside, and it passed its own tests
 * while doing it.
 *
 * `page.$$eval` here is Playwright's DOM-query helper: it serialises the
 * callback into the page and is unrelated to JavaScript's `eval()`.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * SERIAL, for the reason wishlist-staging.admin.spec.ts is.
 *
 * Every test signs in as the same staff account, and a wishlist belongs to an
 * account — in parallel they overwrite one another's list and trip the reorder
 * endpoint's permutation guard.
 */
test.describe.configure({ mode: 'serial' });

/**
 * Stamped TITLE as well as slug.
 *
 * A partially-failed run left two collections both called "Loop Probe", and the
 * next run's `aria-label="Edit Loop Probe"` hit a strict-mode violation. The
 * slug being unique is not enough when the locator reads the title.
 */
const stamp = () => `edit-${Date.now().toString(36)}`;

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

async function storefrontOrder(page: Page): Promise<string[]> {
  /**
   * ProductCard renders the title inside a <Link>, not a heading, and appends
   * the SKU after a `#`. Both facts have bitten this suite before.
   */
  return page.$$eval(
    '[data-testid="product-card"] a[href^="/posters/"]',
    (els) =>
      els
        .map((el) => (el.textContent ?? '').split('#')[0].trim())
        .filter(Boolean)
  );
}

/** Ensure the staff wishlist holds at least three items. Hearts TOGGLE. */
async function ensureThreeSaved(page: Page) {
  await page.goto('/wishlist', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  let have = await page.locator('[data-testid="wishlist-item"]').count();

  if (have < 3) {
    await page.goto('/posters', { waitUntil: 'networkidle' });
    const hearts = page.getByRole('button', { name: /save|wishlist/i });
    for (let i = 0; have < 3 && i < 12; i++) {
      const heart = hearts.nth(i);
      if ((await heart.getAttribute('aria-pressed')) === 'true') continue;
      await heart.click();
      await page.waitForTimeout(200);
      have += 1;
    }
    await page.goto('/wishlist', { waitUntil: 'networkidle' });
  }

  await page.waitForSelector('[data-testid="wishlist-item"]');
}

/** Create a published manual collection from the current wishlist. Returns its edit URL. */
async function createFromWishlist(page: Page, name: string) {
  await page.getByRole('button', { name: /Save as collection/i }).click();
  await page.getByRole('button', { name: /New collection/i }).click();
  await page.waitForURL('**/admin/collections/**', { timeout: 20000 });

  const editUrl = page.url();

  await page.getByLabel('Title', { exact: true }).fill(name);
  await page.getByLabel('Slug', { exact: true }).fill(name);
  await page.getByLabel('Published').check();
  await page
    .getByRole('button', { name: /Save changes|Create collection/i })
    .click();
  await page.waitForURL('**/admin/collections', { timeout: 20000 });

  return editUrl;
}

test.describe('loading a collection back in', () => {
  test('brings its members in, in the collection order', async ({ page }) => {
    const name = stamp();

    await ensureThreeSaved(page);
    const staged = await wishlistOrder(page);
    const editUrl = await createFromWishlist(page, name);

    await page.goto(editUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Load into wishlist/i }).click();

    // The wishlist is not empty, so it must warn before replacing.
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/replaces your wishlist/i);

    await page.getByRole('button', { name: /Replace my wishlist/i }).click();
    await page.waitForURL('**/wishlist', { timeout: 20000 });
    await page.waitForSelector('[data-testid="wishlist-item"]');

    await expect
      .poll(async () => (await wishlistOrder(page)).join('|'), { timeout: 10000 })
      .toBe(staged.join('|'));
  });

  test('is not offered for a rule collection', async ({ page }) => {
    // A rule IS the membership — there is no list to load or reorder.
    await page.goto('/admin/collections', { waitUntil: 'networkidle' });
    await page.getByLabel(/^Edit Pop Art$/).click();
    await page.waitForURL('**/admin/collections/**', { timeout: 20000 });

    await expect(
      page.getByRole('button', { name: /Load into wishlist/i })
    ).toHaveCount(0);
  });
});

test.describe('the round trip', () => {
  test('a reorder made in the wishlist reaches the storefront', async ({
    page,
  }) => {
    const name = stamp();

    await ensureThreeSaved(page);
    const editUrl = await createFromWishlist(page, name);

    // Load it back.
    await page.goto(editUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Load into wishlist/i }).click();
    if (await page.getByRole('alertdialog').isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /Replace my wishlist/i }).click();
    }
    await page.waitForURL('**/wishlist', { timeout: 20000 });
    await page.waitForSelector('[data-testid="wishlist-item"]');

    // Rearrange.
    const loaded = await wishlistOrder(page);
    await page
      .getByRole('button', { name: `Move ${loaded[1]} earlier` })
      .click();

    /**
     * Polled: the move applies optimistically while the store's load() may
     * still be settling from the page mount, and when it lands it replaces the
     * ids wholesale (#505).
     */
    await expect
      .poll(async () => (await wishlistOrder(page))[0], { timeout: 10000 })
      .toBe(loaded[1]);
    const rearranged = await wishlistOrder(page);

    // Save back over the SAME collection.
    await page.getByRole('button', { name: /Save as collection/i }).click();
    await page.getByRole('button', { name: /Overwrite an existing/i }).click();
    await page.waitForSelector('select');

    const value = await page
      .locator('select option')
      .filter({ hasText: name })
      .first()
      .getAttribute('value');
    await page.locator('select').selectOption(value!);

    await page.getByRole('button', { name: /^Overwrite$/ }).click();

    // The confirm must name the target before anything is replaced.
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText(name);
    await page.getByRole('button', { name: /Replace its products/i }).click();
    await page.waitForURL('**/admin/collections/**', { timeout: 20000 });

    // The assertion that matters, read off the storefront.
    await page.goto(`/collections/${name}`, { waitUntil: 'networkidle' });
    expect(await storefrontOrder(page)).toEqual(rearranged);
  });
});
