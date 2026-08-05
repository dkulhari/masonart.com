/**
 * Reordering the wishlist — shopper.
 *
 * The property everything rests on is that **order out equals order in**, and
 * that it survives a reload. Everything else here is scaffolding.
 *
 * Both signed-out and signed-in are covered because they persist through
 * completely different mechanisms — localStorage versus a PUT — and only one
 * of them can be broken at a time.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * The move buttons carry the product name, which makes them the cheapest order
 * probe.
 *
 * `page.$$eval` is Playwright's DOM-query helper — it serialises the callback
 * and runs it in the page, and is unrelated to JavaScript's `eval()`. No
 * caller-supplied code reaches it.
 */
async function order(page: Page): Promise<string[]> {
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

/** Save the first `count` products from the collection page. */
async function saveProducts(page: Page, count: number) {
  await page.goto('/posters', { waitUntil: 'networkidle' });

  const hearts = page.getByRole('button', { name: /save|wishlist/i });
  for (let i = 0; i < count; i++) {
    await hearts.nth(i).click();
    await page.waitForTimeout(150);
  }
}

test.describe('signed out', () => {
  test('reorders and survives a reload, with no account at all', async ({
    page,
  }) => {
    // A guest's list lives in localStorage. Nothing is sent, so this is the
    // half that a broken endpoint could never reveal.
    await saveProducts(page, 3);
    await page.goto('/wishlist', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="wishlist-item"]');

    const before = await order(page);
    expect(before.length).toBeGreaterThanOrEqual(2);

    await page.getByRole('button', { name: `Move ${before[1]} earlier` }).click();
    await page.waitForTimeout(400);

    const moved = await order(page);
    expect(moved[0]).toBe(before[1]);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="wishlist-item"]');

    expect(await order(page)).toEqual(moved);
  });
});

test.describe('the controls', () => {
  test.beforeEach(async ({ page }) => {
    await saveProducts(page, 3);
    await page.goto('/wishlist', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="wishlist-item"]');
  });

  test('cannot move the first item earlier or the last item later', async ({
    page,
  }) => {
    const current = await order(page);

    await expect(
      page.getByRole('button', { name: `Move ${current[0]} earlier` })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', {
        name: `Move ${current[current.length - 1]} later`,
      })
    ).toBeDisabled();
  });

  test('moves an item later as well as earlier', async ({ page }) => {
    const before = await order(page);

    await page.getByRole('button', { name: `Move ${before[0]} later` }).click();
    await page.waitForTimeout(400);

    const after = await order(page);
    expect(after[1]).toBe(before[0]);
  });

  test('reorders by dragging, not only by the buttons', async ({ page }) => {
    // The buttons are the accessible path; drag is the one most people use,
    // and it goes through a different code path entirely (HTML5 dragstart /
    // dragover / drop rather than onClick).
    const before = await order(page);
    const cards = page.locator('[data-testid="wishlist-item"]');

    await cards.nth(0).dragTo(cards.nth(2));
    await page.waitForTimeout(500);

    const after = await order(page);
    expect(after).not.toEqual(before);
    expect(after).toContain(before[0]);
    expect(after).toHaveLength(before.length);
  });
});
