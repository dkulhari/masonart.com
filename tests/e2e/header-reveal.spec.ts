/**
 * Header nav reveal — #421.
 *
 * Scroll down leaves the compact bar (wordmark + actions); scroll up brings
 * both nav rows back at whatever scroll position the user happens to be at.
 *
 * The bounding-box assertion is the one that matters: #401 was the toolbar
 * sitting 37px behind a header that had grown a row, and any reveal is a
 * chance to reintroduce it.
 */

import { test, expect, type Page } from '@playwright/test';

const DESKTOP = { width: 1440, height: 900 };

/** Scroll and let the direction handler and its transition settle. */
async function scrollBy(page: Page, delta: number) {
  await page.evaluate((by) => window.scrollBy(0, by), delta);
  await page.waitForTimeout(400);
}

test.describe('header nav reveal', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  test('starts with both nav rows revealed', async ({ page }) => {
    await expect(page.getByTestId('pages-nav')).toHaveAttribute(
      'data-revealed',
      'true'
    );
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'true'
    );
  });

  test('collapses to the compact bar on scroll down', async ({ page }) => {
    await scrollBy(page, 1200);

    await expect(page.getByTestId('pages-nav')).toHaveAttribute(
      'data-revealed',
      'false'
    );
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'false'
    );

    // The compact bar keeps the wordmark and the actions.
    await expect(page.locator('header a[href="/"]').first()).toBeVisible();
    await expect(page.locator('header a[href="/cart"]').first()).toBeVisible();

    // Collapsed rows are out of the tab order, not merely faded.
    await expect(page.getByTestId('styles-nav')).toBeHidden();
  });

  test('reveals both rows on scroll up, mid-page', async ({ page }) => {
    await scrollBy(page, 1600);
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'false'
    );

    await scrollBy(page, -300);

    // Still well down the page — this is the behaviour the ticket is about.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
    await expect(page.getByTestId('pages-nav')).toHaveAttribute(
      'data-revealed',
      'true'
    );
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'true'
    );
    await expect(page.getByTestId('styles-nav')).toBeVisible();
  });

  test('never lets the collection toolbar sit behind the header (#401)', async ({
    page,
  }) => {
    const header = page.locator('header');
    const toolbar = page.getByTestId('collection-toolbar');

    for (const step of [1200, -300, 800]) {
      await scrollBy(page, step);

      const headerBox = await header.boundingBox();
      const toolbarBox = await toolbar.boundingBox();
      expect(headerBox).not.toBeNull();
      expect(toolbarBox).not.toBeNull();

      // The toolbar starts at or below the header's bottom edge, in both the
      // revealed and the collapsed state.
      expect(toolbarBox!.y).toBeGreaterThanOrEqual(
        headerBox!.y + headerBox!.height - 1
      );
      // And the header never grows a second row.
      expect(headerBox!.height).toBeLessThanOrEqual(65);
    }
  });
});

test.describe('header nav reveal, reduced motion', () => {
  test('reveals without animating', async ({ page }) => {
    // `test.use({ reducedMotion })` did not reach the page in this setup;
    // emulateMedia does, and it is the media query the CSS actually reads.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(DESKTOP);
    await page.goto('/posters', { waitUntil: 'networkidle' });

    const transitionProperty = await page
      .getByTestId('styles-nav')
      .evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(transitionProperty).toBe('none');

    // The reveal itself still works, it just arrives instantly.
    await scrollBy(page, 1200);
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'false'
    );
    await scrollBy(page, -300);
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'true'
    );
  });
});
