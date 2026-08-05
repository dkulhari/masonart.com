/**
 * Curated collections — storefront.
 *
 * The feature exists because mesonart's Discover chips are not a projection of
 * any facet vocabulary: measured 2026-08-05, their rail spans style, subject,
 * orientation, and two entries — Latest Work and Bestseller — that are a date
 * window and a sort. Ours generated chips from STYLE_OPTIONS and toggled a
 * filter, so it could never carry those.
 *
 * These tests exist to catch the two ways that regresses:
 *
 * 1. Chips going back to being filter toggles rather than links.
 * 2. A shopper's facets REPLACING the collection's rule instead of
 *    intersecting with it — which shows work the collection does not contain,
 *    under the collection's own heading.
 */

import { test, expect } from '@playwright/test';

test.describe('the Discover rail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  test('renders chips as links to collection pages', async ({ page }) => {
    const chips = page.locator('a[href^="/collections/"]');
    await expect(chips.first()).toBeVisible();
    expect(await chips.count()).toBeGreaterThan(0);
  });

  test('marks nothing current on /posters — it is not a collection', async ({
    page,
  }) => {
    await expect(
      page.locator('a[href^="/collections/"][aria-current="page"]')
    ).toHaveCount(0);
  });

  test('a chip navigates to its collection', async ({ page }) => {
    const chip = page.locator('a[href^="/collections/"]').first();
    const href = await chip.getAttribute('href');

    await chip.click();
    await page.waitForURL(`**${href}`);

    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('a collection page', () => {
  test('shows the collection its own heading and copy', async ({ page }) => {
    await page.goto('/collections/pop-art', { waitUntil: 'networkidle' });

    await expect(page.locator('h1')).toHaveText('Pop Art');
    await expect(page).toHaveTitle(/Pop Art/);
  });

  test('marks its own chip current in the rail', async ({ page }) => {
    await page.goto('/collections/pop-art', { waitUntil: 'networkidle' });

    await expect(
      page.locator('a[href="/collections/pop-art"][aria-current="page"]')
    ).toHaveCount(1);
  });

  test('404s an unknown slug rather than showing an empty grid', async ({
    page,
  }) => {
    // An empty grid would say the collection exists and happens to be bare.
    const response = await page.goto('/collections/definitely-not-a-collection');
    expect(response?.status()).toBe(404);
  });
});

test.describe('the two collections no facet can express', () => {
  test('Best Sellers reaches a populated grid, sorted by sales', async ({
    page,
  }) => {
    await page.goto('/collections/best-selling', { waitUntil: 'networkidle' });

    await expect(page.locator('h1')).toHaveText('Best Sellers');
    await expect(page.getByTestId('product-card').first()).toBeVisible();

    // The collection IS a sort, and the toolbar has to say so — it announced
    // "Newest First" over a sales-ordered list until the API started returning
    // the sort it applied.
    await expect(page.getByTestId('collection-toolbar')).toContainText(
      'Best selling'
    );
  });

  test('Latest Work reaches a populated grid', async ({ page }) => {
    await page.goto('/collections/new', { waitUntil: 'networkidle' });

    await expect(page.locator('h1')).toHaveText('Latest Work');
    await expect(page.getByTestId('product-card').first()).toBeVisible();
  });
});

test.describe('filters intersect with the collection', () => {
  test('a facet inside the collection narrows it', async ({ page }) => {
    await page.goto('/collections/pop-art?styles=pop-art', {
      waitUntil: 'networkidle',
    });

    await expect(page.getByTestId('product-card').first()).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Pop Art');
  });

  test('a facet OUTSIDE the collection empties it, never widens it', async ({
    page,
  }) => {
    // The assertion the whole resolver exists for. Union semantics here would
    // show ukiyo-e work under the Pop Art heading.
    await page.goto('/collections/pop-art?styles=ukiyo-e-art', {
      waitUntil: 'networkidle',
    });

    await expect(page.getByTestId('product-card')).toHaveCount(0);
    await expect(page.locator('h1')).toHaveText('Pop Art');
  });

  test('scopes the sidebar counts to the collection', async ({ page }) => {
    await page.goto('/collections/pop-art', { waitUntil: 'networkidle' });

    // The desktop rail carries FILTER_SIDEBAR_ID; the mobile sheet does not,
    // which is what keeps this off the duplicate tree.
    const sidebar = page.locator('#collection-filters');
    await expect(sidebar).toBeVisible();

    const toolbarText = await page
      .getByTestId('collection-toolbar')
      .textContent();
    const total = Number(/(\d+)\s+products?/.exec(toolbarText ?? '')?.[1] ?? '0');

    // A collection of six cannot honestly offer a facet claiming more than six.
    const counts = await sidebar.locator('text=/\\(\\d+\\)/').allTextContents();
    for (const label of counts) {
      const value = Number(/\((\d+)\)/.exec(label)?.[1] ?? '0');
      expect(value).toBeLessThanOrEqual(total);
    }
  });
});

test.describe('SEO', () => {
  test('carries a canonical and a per-collection title', async ({ page }) => {
    await page.goto('/collections/best-selling', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Best Sellers/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/collections\/best-selling$/
    );
  });
});
