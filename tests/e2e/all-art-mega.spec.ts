/**
 * The All Art mega panel — #476.
 *
 * The unit suite pins what the panel contains and where each option points.
 * What only a browser can answer is whether the panel actually opens on a real
 * hover, whether it stays out of the tab order while closed, and — the hazard
 * this ticket inherited from #401 and #421 — whether opening it drags the
 * sticky collection toolbar down with it.
 */

import { test, expect, type Page } from '@playwright/test';

const DESKTOP = { width: 1440, height: 900 };

const mega = (page: Page) => page.getByTestId('all-art-mega');

/** Hover the trigger and let the 500ms open settle. */
async function openPanel(page: Page) {
  await page.getByTestId('all-art-mega-trigger').hover();
  await expect(mega(page)).toHaveAttribute('data-open', 'true');
  await page.waitForTimeout(600);
}

test.describe('All Art mega panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/posters', { waitUntil: 'networkidle' });
  });

  test('starts closed, with its links out of the tab order', async ({
    page,
  }) => {
    await expect(mega(page)).toHaveAttribute('data-open', 'false');
    await expect(page.getByTestId('all-art-mega-panel')).toBeHidden();
  });

  test('hover opens all five filter columns', async ({ page }) => {
    await openPanel(page);

    await expect(page.getByTestId('all-art-mega-panel')).toBeVisible();
    await expect(
      page.getByTestId('all-art-column-heading')
    ).toHaveText(['All Artwork', 'Style', 'Subject', 'Orientation', 'Color']);
  });

  test('an option carries its filter through to the grid', async ({ page }) => {
    await openPanel(page);

    await page
      .getByTestId('all-art-column-style')
      .getByRole('link', { name: 'Minimalist Art' })
      .click();

    await expect(page).toHaveURL(/\/posters\?.*styles=minimalist-art/);
    await expect(page.getByTestId('collection-toolbar')).toBeVisible();
  });

  test('the trigger itself still navigates to the unfiltered collection', async ({
    page,
  }) => {
    await page.goto('/posters?styles=minimalist-art', {
      waitUntil: 'networkidle',
    });
    await page.getByTestId('all-art-mega-trigger').click();

    // `search` passed wholesale clears whatever facets were active.
    await expect(page).not.toHaveURL(/styles=/);
  });

  test('Escape closes it', async ({ page }) => {
    await openPanel(page);
    await page.keyboard.press('Escape');
    await expect(mega(page)).toHaveAttribute('data-open', 'false');
  });

  test('opening it does not move the collection toolbar (#401 / #421)', async ({
    page,
  }) => {
    const toolbar = page.getByTestId('collection-toolbar');
    const before = await toolbar.boundingBox();

    await openPanel(page);

    const after = await toolbar.boundingBox();
    expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);
  });
});
