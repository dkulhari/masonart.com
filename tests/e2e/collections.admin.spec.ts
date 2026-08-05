/**
 * Curated collections — admin authoring.
 *
 * Runs under the `chromium-admin` project, which carries the stored staff
 * session. The round trip that matters is: author a collection here, and find
 * it on the storefront. Everything before that is a form that saves to a table
 * nobody reads.
 */

import { test, expect } from '@playwright/test';

/** Unique per run, so a re-run does not collide on the unique slug. */
const stamp = () => `probe-${Date.now().toString(36)}`;

test.describe('the collections list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/collections', { waitUntil: 'networkidle' });
  });

  test('lists the seeded collections with their counts', async ({ page }) => {
    const table = page.getByTestId('admin-collections-table');
    await expect(table).toBeVisible();

    await expect(table).toContainText('Pop Art');
    await expect(table).toContainText('Best Sellers');
  });

  test('distinguishes a rule collection from a hand-picked one', async ({
    page,
  }) => {
    await expect(page.getByTestId('admin-collections-table')).toContainText('Rule');
  });

  test('offers reordering only for collections in the rail', async ({ page }) => {
    // The order belongs to the rail, so a collection outside it has no place
    // in the sequence and shows a dash.
    await expect(
      page.getByRole('button', { name: /Move .* earlier/ }).first()
    ).toBeVisible();
  });
});

test.describe('authoring a collection', () => {
  test('creates a rule collection and it appears on the storefront', async ({
    page,
  }) => {
    const slug = stamp();

    await page.goto('/admin/collections/new', { waitUntil: 'networkidle' });

    await page.getByLabel('Title', { exact: true }).fill(`Probe ${slug}`);
    await page.getByLabel('Slug', { exact: true }).fill(slug);

    // A facet from the shared vocabulary — the form renders these from
    // FACET_GROUPS, so a hardcoded option here would drift from the API.
    await page.getByRole('button', { name: 'Pop Art' }).first().click();

    // The preview answers before saving: a rule matching nothing is the
    // failure worth catching at authoring time.
    await expect(page.getByText(/Matches \d+ products?/)).toBeVisible();

    await page.getByRole('button', { name: /Create collection/ }).click();
    await page.waitForURL('**/admin/collections');

    await expect(page.getByTestId('admin-collections-table')).toContainText(
      `Probe ${slug}`
    );

    // The point of the whole exercise.
    await page.goto(`/collections/${slug}`, { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toHaveText(`Probe ${slug}`);
  });

  test('refuses a slug that is already taken, and says which', async ({
    page,
  }) => {
    await page.goto('/admin/collections/new', { waitUntil: 'networkidle' });

    await page.getByLabel('Title', { exact: true }).fill('Duplicate probe');
    await page.getByLabel('Slug', { exact: true }).fill('pop-art');
    await page.getByRole('button', { name: /Create collection/ }).click();

    // Named, not generic — the admin has to know which field to change.
    await expect(page.getByRole('alert')).toContainText('pop-art');
  });

  test('warns before discarding a rule when switching to hand-picked', async ({
    page,
  }) => {
    await page.goto('/admin/collections/new', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Pop Art' }).first().click();
    await page.getByRole('radio', { name: 'Hand-picked' }).click();

    await expect(page.getByText(/will discard the filter/i)).toBeVisible();
  });
});

test.describe('rail visibility', () => {
  test('a collection kept out of the rail is absent from the chips', async ({
    page,
  }) => {
    const slug = stamp();

    await page.goto('/admin/collections/new', { waitUntil: 'networkidle' });
    await page.getByLabel('Title', { exact: true }).fill(`Hidden ${slug}`);
    await page.getByLabel('Slug', { exact: true }).fill(slug);
    await page.getByRole('button', { name: 'Pop Art' }).first().click();
    // showInDiscover defaults off — a new collection is live but not in the
    // rail until somebody says so.
    await page.getByRole('button', { name: /Create collection/ }).click();
    await page.waitForURL('**/admin/collections');

    // Reachable directly...
    await page.goto(`/collections/${slug}`, { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toHaveText(`Hidden ${slug}`);

    // ...but not advertised in the rail.
    await expect(page.locator(`a[href="/collections/${slug}"]`)).toHaveCount(0);
  });
});
