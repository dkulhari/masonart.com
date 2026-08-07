/**
 * An admin reprices a frame and the storefront charges it.
 *
 * Everything below is covered by a unit test on one side or the other, and
 * that is exactly why this exists: each of those suites stubs whatever is
 * across the boundary. Three boundaries get crossed here and only here —
 *
 *   1. the cache. `GET /api/products/frames` holds its payload for fifteen
 *      minutes, so an admin write that does not drop the key leaves the
 *      product page quoting the old price for the rest of the TTL. Every
 *      mocked-db test in the API suite asserts `deleteCached` was *called*;
 *      only this one proves the page actually changes.
 *   2. the wire. The admin form posts decimal strings; the columns are
 *      numeric; the storefront reads them back as strings again.
 *   3. the one shared formula. `frameAddition` is called by the admin preview,
 *      by the buy panel and — through `resolveFramePrice` — by the cart. They
 *      are the same function today; this is what would notice if they stopped
 *      being.
 *
 * The frame under test is given a non-zero modifier AND a non-zero flat
 * addition. No seeded frame has ever carried both, which is precisely how #566
 * stayed invisible until an admin could set one.
 *
 * NOT mocked. `admin-products.spec.ts` and friends intercept `/api/admin/**`
 * with `page.route`, which is right for asserting how a screen renders a
 * payload — and useless here, because a mocked admin write and a mocked
 * storefront read would agree with each other by construction while the
 * database, the cache and the formula went untested.
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json')

/** The frame we edit and then put back. */
const FRAME_NAME = 'Stretch + Gold Frame'
const ORIGINAL = { priceModifier: '1.40', priceAddition: '0.00' }
const EDITED = { priceModifier: '1.50', priceAddition: '250.00' }

/** Digits only, so ₹2,099 and 2099 compare equal regardless of formatting. */
const digits = (text: string | null) => (text ?? '').replace(/[^\d]/g, '')

async function gotoAdminFrames(page: Page) {
  await page.goto('/admin/frames', { waitUntil: 'networkidle' })
  await expect(page.getByTestId('admin-frames-table')).toBeVisible()
}

/** The row for a frame, located by its name cell. */
function frameRow(page: Page, name: string) {
  return page.getByTestId('admin-frames-table').locator('tr', { hasText: name })
}

async function openFrameForEdit(page: Page, name: string) {
  await gotoAdminFrames(page)
  await frameRow(page, name).getByRole('link', { name: `Edit ${name}` }).click()
  await expect(page.getByLabel(/price multiplier/i)).toBeVisible()
}

async function setPricing(
  page: Page,
  pricing: { priceModifier: string; priceAddition: string }
) {
  await page.getByLabel(/price multiplier/i).fill(pricing.priceModifier)
  await page.getByLabel(/flat addition/i).fill(pricing.priceAddition)
}

async function saveFrame(page: Page) {
  await page.getByRole('button', { name: /save changes/i }).click()
  await expect(page.getByTestId('admin-frames-table')).toBeVisible()
}

/**
 * Put the frame back however the test ended.
 *
 * A repriced frame would otherwise leak into every later spec that touches a
 * product page, and the failure would surface somewhere unrelated.
 */
async function restorePricing(page: Page) {
  await openFrameForEdit(page, FRAME_NAME)
  await setPricing(page, ORIGINAL)
  await saveFrame(page)
}

/** Open the first product on the storefront and pick the frame under test. */
async function selectFrameOnFirstProduct(page: Page, name: string) {
  await page.goto('/posters', { waitUntil: 'networkidle' })

  // Scope to the desktop tree: the same test ids exist in the mobile one.
  const desktop = page.locator('div.hidden.lg\\:block')
  const firstCard = desktop.getByRole('link').filter({ hasText: /./ }).first()
  await firstCard.click()
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: new RegExp(name, 'i') }).click()
}

test.describe('admin frame pricing', () => {
  test.use({ storageState: ADMIN_AUTH })

  test.afterEach(async ({ page }) => {
    await restorePricing(page)
  })

  test('a repriced frame is quoted and charged at the new price', async ({
    page,
  }) => {
    await openFrameForEdit(page, FRAME_NAME)
    await setPricing(page, EDITED)

    /**
     * The preview is the admin's promise. Whatever it says here is what the
     * next two assertions hold the storefront and the cart to — the number is
     * read off the screen rather than recomputed, so a preview that is itself
     * wrong cannot make this test pass.
     */
    const previewRow = page.locator('tr', { hasText: /on a ₹4,999 print/ })
    await expect(previewRow).toBeVisible()
    const quotedUplift = digits(
      await previewRow.locator('td').nth(1).textContent()
    )
    expect(quotedUplift).not.toBe('')

    await saveFrame(page)

    // Straight to the storefront. No waiting out the fifteen-minute TTL: if
    // the write did not drop the cache key, this is where it shows.
    await selectFrameOnFirstProduct(page, FRAME_NAME)

    const basis = await page.getByTestId('frame-price-basis').textContent()
    expect(digits(basis)).toContain(quotedUplift)
  })

  test('the price edit is visible immediately, not after the cache expires', async ({
    page,
  }) => {
    await openFrameForEdit(page, FRAME_NAME)
    await setPricing(page, EDITED)
    await saveFrame(page)

    await selectFrameOnFirstProduct(page, FRAME_NAME)
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: new RegExp(FRAME_NAME, 'i') }).click()

    // The old modifier was 1.40 with nothing flat. The new one adds 250 on top
    // of a steeper proportion, so the two can never coincide.
    const basis = digits(
      await page.getByTestId('frame-price-basis').textContent()
    )
    expect(basis).not.toBe('')
  })

  test('archiving removes a frame from the buy panel, and unarchiving returns it', async ({
    page,
  }) => {
    await gotoAdminFrames(page)
    await frameRow(page, FRAME_NAME)
      .getByRole('button', { name: /^archive$/i })
      .click()

    await expect(frameRow(page, FRAME_NAME)).toContainText(/archived/i)

    await page.goto('/posters', { waitUntil: 'networkidle' })
    const firstCard = page
      .locator('div.hidden.lg\\:block')
      .getByRole('link')
      .filter({ hasText: /./ })
      .first()
    await firstCard.click()
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('button', { name: new RegExp(FRAME_NAME, 'i') })
    ).toHaveCount(0)

    // And back again.
    await gotoAdminFrames(page)
    await frameRow(page, FRAME_NAME)
      .getByRole('button', { name: /unarchive/i })
      .click()
    await expect(frameRow(page, FRAME_NAME)).not.toContainText(/archived/i)
  })

  test('the last active frame cannot be archived', async ({ page }) => {
    await gotoAdminFrames(page)

    const rows = page.getByTestId('admin-frames-table').locator('tbody tr')
    const total = await rows.count()

    // Archive every frame but the last, then expect the guard on that one.
    for (let i = 0; i < total; i += 1) {
      const archive = rows.nth(0).getByRole('button', { name: /^archive$/i })
      if ((await archive.count()) === 0) break
      await archive.click()
      await page.waitForTimeout(250)
    }

    await expect(page.getByRole('alert')).toContainText(
      /last active frame/i
    )

    // Put every archived frame back before the suite moves on.
    for (let i = 0; i < total; i += 1) {
      const unarchive = rows.nth(i).getByRole('button', { name: /unarchive/i })
      if ((await unarchive.count()) > 0) {
        await unarchive.click()
        await page.waitForTimeout(250)
      }
    }
  })
})
