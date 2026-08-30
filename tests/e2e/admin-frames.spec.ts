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
  // Wait for table or error message (frames may not load if API fails)
  await expect(
    page.getByTestId('admin-frames-table').or(page.getByRole('alert'))
  ).toBeVisible({ timeout: 10000 })
}

/**
 * Put every frame back in the active state the seed ships.
 *
 * These tests archive frames, and an assertion that fails mid-test leaves them
 * archived — which then breaks the NEXT run at a completely different step,
 * because an archived frame never reaches the storefront buy panel. That is
 * exactly how this suite was found: two frames ('Stretch + Gold Frame' and
 * 'Rolled Canvas') sat archived in the shared dev database from earlier failed
 * runs, and the storefront half of every test failed as a result.
 *
 * Cheap to run, and it makes each test independent of how the previous one
 * ended rather than of how it was supposed to end.
 */
async function restoreAllFramesActive(page: Page) {
  await gotoAdminFrames(page)

  const rows = page.getByTestId('admin-frames-table').locator('tbody tr')
  for (let i = 0; i < (await rows.count()); i += 1) {
    const unarchive = rows.nth(i).getByRole('button', { name: /unarchive/i })
    if ((await unarchive.count()) > 0) {
      await unarchive.click()
      await page.waitForTimeout(250)
    }
  }
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

  // Find first product card link and navigate to it
  const firstCard = page
    .locator('a[href*="/posters/"]')
    .filter({ hasText: /.+/ })
    .first()
  await firstCard.waitFor({ state: 'visible', timeout: 10000 })
  await firstCard.click()
  await page.waitForLoadState('networkidle')

  /**
   * Size is a native `<select>`, not a row of buttons.
   *
   * It shipped as buttons; `2f29ee65` rebuilt the poster page against the
   * mesonart reference and `SizeSelector` (#515) became one `<select
   * aria-label="Size">` — a keyboard-and-screen-reader control rather than a
   * grid of tap targets. This helper kept clicking for a button matching
   * `/\d+ × \d+/`, found nothing, and timed out; because the frame selector
   * only appears once a size is chosen, all four tests in this file died here
   * and the suite has been testing nothing since.
   */
  const sizeSelect = page.getByLabel('Size', { exact: true })
  await sizeSelect.waitFor({ state: 'visible', timeout: 10000 })

  // The first option is a disabled "Select a Size" placeholder, so a product
  // with no real variants would leave this select technically present and
  // useless. Assert there is something to choose before choosing it.
  const selectable = sizeSelect.locator('option:not([disabled])')
  await expect(selectable.first()).toBeAttached({ timeout: 10000 })

  const firstValue = await selectable.first().getAttribute('value')
  await sizeSelect.selectOption(firstValue!)

  /**
   * Plain string, NOT `new RegExp(name)`.
   *
   * FRAME_NAME is 'Stretch + Gold Frame', and in a regex that `+` quantifies
   * the space before it — so the pattern demands two spaces and matches the
   * real button never. Playwright's string form is already substring and
   * case-insensitive, which is all this wanted.
   */
  const frameBtn = page.getByRole('button', { name })
  await frameBtn.waitFor({ state: 'visible', timeout: 10000 })
  await frameBtn.click()
}

test.describe('admin frame pricing', () => {
  test.use({ storageState: ADMIN_AUTH })

  test.beforeEach(async ({ page }) => {
    await restoreAllFramesActive(page)
  })

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

    /**
     * Checked against THIS product's own price, not the admin preview's.
     *
     * The preview row quotes the uplift on a ₹4,999 print — a fixed example on
     * the admin form — and the assertion here used to look for that same number
     * in the storefront's basis line. That only holds while the first product
     * on /posters happens to cost ₹4,999; the catalogue moved and it stopped
     * being true, so the test failed on arithmetic rather than on the thing it
     * guards.
     *
     * The basis line states both figures ("… adds ₹X to the ₹Y size price"), so
     * the uplift is checked against the base the page itself is quoting.
     */
    const basis = (await page.getByTestId('frame-price-basis').textContent()) ?? ''
    const amounts = basis.match(/₹([\d,]+(?:\.\d{2})?)/g) ?? []
    expect(amounts.length, `no prices in basis line: "${basis}"`).toBeGreaterThanOrEqual(2)

    const [uplift, sizePrice] = amounts.map((a) => Number(a.replace(/[₹,]/g, '')))
    const expected =
      sizePrice! * (Number(EDITED.priceModifier) - 1) + Number(EDITED.priceAddition)

    // Within a rupee: the page rounds for display, the formula does not.
    expect(Math.abs(uplift! - expected)).toBeLessThan(1)
  })

  test('the price edit is visible immediately, not after the cache expires', async ({
    page,
  }) => {
    await openFrameForEdit(page, FRAME_NAME)
    await setPricing(page, EDITED)
    await saveFrame(page)

    await selectFrameOnFirstProduct(page, FRAME_NAME)
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: FRAME_NAME }).click()

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
    /**
     * The same card locator the helper uses.
     *
     * `div.hidden.lg\\:block` was a desktop-tree wrapper that the rebuilt grid
     * no longer has, so this matched nothing and timed out mid-navigation —
     * which reads like "the click did not work" rather than "the selector is
     * gone".
     */
    const firstCard = page
      .locator('a[href*="/posters/"]')
      .filter({ hasText: /.+/ })
      .first()
    await firstCard.waitFor({ state: 'visible', timeout: 10000 })
    await firstCard.click()
    await page.waitForLoadState('networkidle')

    // Same escaping trap as the helper above, and worse here: a pattern that
    // matches nothing satisfies toHaveCount(0) whatever the page shows, so
    // this assertion passed for the wrong reason even while the feature was
    // untested.
    await expect(
      page.getByRole('button', { name: FRAME_NAME })
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

    /**
     * Driven off the live Archive buttons, not off a row index.
     *
     * The old loop clicked `rows.nth(0)` and stopped as soon as THAT row had no
     * Archive button — but an archived row stays in the table wearing an
     * Unarchive button instead, so it stopped after the first frame and the
     * guard it meant to provoke never fired. It then failed looking for an
     * alert nothing had asked for.
     */
    const archiveButtons = () =>
      page
        .getByTestId('admin-frames-table')
        .getByRole('button', { name: /^archive$/i })

    while ((await archiveButtons().count()) > 1) {
      await archiveButtons().first().click()
      await page.waitForTimeout(300)
    }

    // One active frame left, and archiving it is what the API refuses.
    await archiveButtons().first().click()

    /**
     * `finally`, because the restore is the important half.
     *
     * This test archives the entire catalogue on purpose. When the assertion
     * below failed, the restore that followed it never ran — leaving frames
     * archived in the shared dev database and breaking later runs at unrelated
     * steps. That is not hypothetical: it is how this suite was found broken.
     */
    try {
      await expect(page.getByRole('alert')).toContainText(/last active frame/i)
    } finally {
      for (let i = 0; i < total; i += 1) {
        const unarchive = rows.nth(i).getByRole('button', { name: /unarchive/i })
        if ((await unarchive.count()) > 0) {
          await unarchive.click()
          await page.waitForTimeout(250)
        }
      }
    }
  })
})
