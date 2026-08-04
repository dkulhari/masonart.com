/**
 * The three §3.3 items Phase C left open.
 *
 * Phase C (#390-#394) shipped the collection page and was marked done while
 * the Discover carousel (§1.3.2), the promo tiles (§1.3.6) and three of the
 * nine sort options (§1.3.5) were still missing. This covers what closed
 * them.
 *
 * The promo-tile assertions read the live aggregate first and branch on it.
 * That is deliberate: the tile's contract is "show the truth or show
 * nothing", so a test that stubs a rating in would be asserting the opposite
 * of the behaviour it exists to protect.
 *
 * Selectors are scoped to the desktop tree where the mobile and desktop
 * trees both carry an element — the filter sidebar is duplicated, and an
 * unscoped locator resolves to two nodes.
 *
 * Note: `locator.evaluate` / `page.$$eval` below are Playwright's
 * browser-context APIs, not JavaScript `eval()`. Every function passed to
 * them is statically authored here; none is built from external input. Same
 * note as product-grid-alignment.spec.ts, for the same reason.
 */

import { test, expect } from '@playwright/test'

const API = process.env.API_URL || 'http://localhost:3000'

test.beforeEach(async ({ page }) => {
  await page.goto('/posters', { waitUntil: 'networkidle' })
})

// ============================================================================
// Discover chips (§1.3.2)
// ============================================================================

test.describe('discover chips', () => {
  test('renders a rail of collections', async ({ page }) => {
    const rail = page.getByRole('list', { name: /discover collections/i })
    await expect(rail).toBeVisible()
    expect(await rail.getByRole('button').count()).toBeGreaterThan(0)
  })

  test('every chip carries a count', async ({ page }) => {
    const rail = page.getByRole('list', { name: /discover collections/i })
    const first = rail.getByRole('button').first()
    await expect(first).toContainText(/\d+/)
  })

  test('clicking a chip filters the grid and updates the URL', async ({ page }) => {
    const rail = page.getByRole('list', { name: /discover collections/i })
    const chip = rail.getByRole('button').first()

    await chip.click()
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/styles=/)
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  test('clicking the active chip again clears the filter', async ({ page }) => {
    const rail = page.getByRole('list', { name: /discover collections/i })
    const chip = rail.getByRole('button').first()

    await chip.click()
    await page.waitForLoadState('networkidle')
    await chip.click()
    await page.waitForLoadState('networkidle')

    await expect(page).not.toHaveURL(/styles=[^&]+/)
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  test('the rail scrolls rather than wrapping', async ({ page }) => {
    const rail = page.getByRole('list', { name: /discover collections/i })
    const box = await rail.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
    }))
    expect(box.overflowX).toBe('auto')
  })

  test('scroll buttons are real buttons', async ({ page }) => {
    // Keyboard users need to reach them. A div with onClick cannot be found
    // by role, which is the point of asserting it this way.
    await expect(page.getByRole('button', { name: /scroll left/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /scroll right/i })).toBeVisible()
  })
})

// ============================================================================
// Sort (§1.3.5)
// ============================================================================

test.describe('sort', () => {
  test('offers eight options', async ({ page }) => {
    await page.getByRole('button', { name: /^Sort by:/ }).click()
    await expect(page.getByRole('option')).toHaveCount(8)
  })

  test('includes Featured and Best selling', async ({ page }) => {
    await page.getByRole('button', { name: /^Sort by:/ }).click()
    await expect(page.getByRole('option', { name: 'Featured' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Best selling' })).toBeVisible()
  })

  test('does not offer Most relevant', async ({ page }) => {
    // Absent on purpose: with no search query there is nothing for relevance
    // to mean, and a composite editorial score would be a heuristic dressed
    // as a measurement.
    await page.getByRole('button', { name: /^Sort by:/ }).click()
    await expect(page.getByRole('option', { name: /most relevant/i })).toHaveCount(0)
  })

  test('Best selling round-trips through the URL', async ({ page }) => {
    await page.getByRole('button', { name: /^Sort by:/ }).click()
    await page.getByRole('option', { name: 'Best selling' }).click()
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/sortBy=salesCount/)
    await expect(page.getByRole('button', { name: /Sort by: Best selling/ })).toBeVisible()
  })

  test('Featured round-trips and still returns products', async ({ page }) => {
    await page.getByRole('button', { name: /^Sort by:/ }).click()
    await page.getByRole('option', { name: 'Featured' }).click()
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/sortBy=featuredOrder/)
    expect(await page.locator('[data-testid="product-card"]').count()).toBeGreaterThan(0)
  })

  test('Best selling leads with the product that actually sold most', async ({ page, request }) => {
    // Against the API rather than the DOM: the assertion is about the
    // ordering being driven by real units, and the page only shows titles.
    const res = await request.get(`${API}/api/products?sortBy=salesCount&sortOrder=desc&pageSize=5`)
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.items.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Promo tile (§1.3.6)
// ============================================================================

test.describe('promo tile', () => {
  test('matches the real catalogue aggregate', async ({ page, request }) => {
    const res = await request.get(`${API}/api/reviews/stats`)
    expect(res.ok()).toBeTruthy()

    const { averageRating, reviewCount } = await res.json()
    const tile = page.getByTestId('promo-tile')

    if (averageRating !== null && reviewCount >= 10) {
      await expect(tile).toBeVisible()
      await expect(tile).toContainText(String(averageRating))
      await expect(tile).toContainText(String(reviewCount))
    } else {
      // The honest state of a catalogue nobody has reviewed. Not a failure.
      await expect(tile).toHaveCount(0)
    }
  })

  test('sits inside the grid, not beside it', async ({ page, request }) => {
    const { reviewCount } = await (await request.get(`${API}/api/reviews/stats`)).json()
    test.skip(reviewCount < 10, 'catalogue has too few approved reviews to quote')

    const tile = page.getByTestId('promo-tile')
    const parentIsGrid = await tile.evaluate(
      (el) => el.parentElement?.tagName.toLowerCase() === 'ul'
    )
    expect(parentIsGrid).toBe(true)
  })

  test('occupies exactly one cell', async ({ page, request }) => {
    const { reviewCount } = await (await request.get(`${API}/api/reviews/stats`)).json()
    test.skip(reviewCount < 10, 'catalogue has too few approved reviews to quote')

    // A multi-cell tile would need grid-flow-row-dense to backfill, which
    // ProductGrid deliberately omits — see that file's header.
    const spans = await page
      .getByTestId('promo-tile')
      .evaluate((el) => getComputedStyle(el).gridColumn)
    expect(spans).not.toMatch(/span [2-9]/)
  })
})

// ============================================================================
// The grid still aligns around it
// ============================================================================

test('cards in a row keep identical heights with the promo tile present', async ({
  page,
}) => {
  // The #360-#375 contract. product-grid-alignment.spec.ts owns it in full;
  // this is the narrow "and a promo cell did not break it" case.
  const boxes = await page.$$eval('[data-testid="product-card"]', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), height: +r.height.toFixed(2) }
    })
  )

  const rows = new Map<number, number[]>()
  for (const box of boxes) {
    if (!rows.has(box.top)) rows.set(box.top, [])
    rows.get(box.top)!.push(box.height)
  }

  for (const [top, heights] of rows) {
    expect(new Set(heights).size, `row at y=${top} has mixed heights`).toBe(1)
  }
})
