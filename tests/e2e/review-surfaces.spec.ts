/**
 * Review surfaces — #486, #487, #488, #489.
 *
 * The unit suites already pin what each surface renders from a given payload.
 * What only a browser can answer is whether the four surfaces are wired into
 * the running app at all: the /reviews destination and its paging, the home
 * strip, the PDP media wall and its lightbox, and the floating toast —
 * including the route it must stay away from.
 *
 * Two things this file deliberately does NOT do:
 *
 *  - It never asserts an exact review count. The rule the surfaces encode is a
 *    threshold (ten approved reviews before an average is printable), so the
 *    threshold is what gets asserted. The seed carries twelve; a spec that
 *    pinned "12 reviews" would fail the next time anyone reviewed anything.
 *  - It never waits on a clock for something that is meant not to appear. The
 *    toast's opening delay is real, so the positive cases wait on the element;
 *    the negative cases assert on the request the suppressed toast never makes,
 *    which needs no window at all.
 */

import { test, expect, type Page } from '@playwright/test'

/** Every selector below is scoped to the desktop tree this viewport produces. */
const DESKTOP = { width: 1440, height: 900 }

/** Seeded with two customer photos and a clip. */
const PRODUCT_WITH_MEDIA = '/posters/wabi-sabi-study'

/** The toast is mounted once in `__root.tsx`, so this is never ambiguous. */
const toast = (page: Page) => page.getByTestId('review-toast')

/**
 * Record calls to the site-wide review feed, matched on the exact pathname.
 *
 * `/api/reviews/media` and `/api/reviews/stats` share the prefix and are
 * fetched by the media wall and by both score bands, so a substring match would
 * be true everywhere and prove nothing.
 */
function recordFeedRequests(page: Page): string[] {
  const calls: string[] = []
  page.on('request', (request) => {
    let pathname: string
    try {
      pathname = new URL(request.url()).pathname
    } catch {
      return
    }
    if (pathname === '/api/reviews') calls.push(request.url())
  })
  return calls
}

// ============================================================================
// /reviews
// ============================================================================

test.describe('the /reviews destination', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/reviews', { waitUntil: 'networkidle' })
  })

  test('is the chobii app, landed on page 1', async ({ page }) => {
    // Port 5173 in this environment serves a different application; a spec that
    // went green against it would have proved nothing. Identity first.
    await expect(page).toHaveTitle(/chobii\.art/)

    // `validateSearch` normalises the absent param to its `.catch(1)` default,
    // which surfaces as a redirect to ?page=1. That is the router doing its
    // job, not a bug — but it does mean the URL is never bare.
    await expect(page).toHaveURL(/\/reviews\?page=1$/)
    await expect(
      page.getByRole('heading', { name: 'Reviews & Ratings' })
    ).toBeVisible()
  })

  test('prints the catalogue aggregate above the feed', async ({ page }) => {
    // Present because the catalogue is over MIN_REVIEWS_FOR_AGGREGATE. Below it
    // the whole band is suppressed, which is the other half of the rule and is
    // covered at the unit level where the count can be dialled down.
    const aggregate = page.getByTestId('reviews-aggregate')
    await expect(aggregate).toBeVisible()
    await expect(aggregate).toContainText(/\d\.\d/)
    await expect(aggregate).toContainText(/reviews/)
  })

  test('every row carries the poster it is about', async ({ page }) => {
    const rows = page.getByTestId('review-feed-row')
    expect(await rows.count()).toBeGreaterThan(0)

    const link = rows.first().getByRole('link').first()
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/posters\/[a-z0-9-]+/)

    await link.click()

    expect(page.url()).toContain(href as string)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('page 2 renders the page rather than an error boundary', async ({
    page,
  }) => {
    await page.goto('/reviews?page=2', { waitUntil: 'networkidle' })

    // The route error-boundaries to a blank page if validateSearch throws on
    // the STRING '2' — router.tsx hands every search param over as a string.
    // A rendered header is the proof that it coerced instead.
    await expect(page).toHaveURL(/\/reviews\?page=2$/)
    await expect(
      page.getByRole('heading', { name: 'Reviews & Ratings' })
    ).toBeVisible()
    await expect(page.getByTestId('reviews-aggregate')).toBeVisible()

    // Whatever the catalogue's size, page 2 always has a page 1 behind it, so
    // the pager is there and it leads back to rows.
    await page
      .getByTestId('reviews-pagination')
      .getByRole('link', { name: /Previous/ })
      .click()

    await expect(page).toHaveURL(/\/reviews\?page=1$/)
    await expect(page.getByTestId('review-feed-row').first()).toBeVisible()
  })
})

// ============================================================================
// Home strip
// ============================================================================

test.describe('the home Customer Reviews strip', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/', { waitUntil: 'networkidle' })
  })

  test('renders the score band over a rail of reviews', async ({ page }) => {
    const strip = page.getByTestId('home-reviews')
    await expect(strip).toBeVisible()
    await expect(
      strip.getByRole('heading', { name: 'What Customers Say' })
    ).toBeVisible()

    // A score printed at all means the strip's own >= 10 gate is open. It is
    // the same threshold /reviews uses, restated there rather than imported.
    await expect(page.getByTestId('home-reviews-score')).toContainText(/\d\.\d/)
    expect(await page.getByTestId('home-review-card').count()).toBeGreaterThan(0)
  })

  test('View All leads to the reviews destination', async ({ page }) => {
    await page
      .getByTestId('home-reviews')
      .getByRole('link', { name: 'View All' })
      .click()

    await expect(page).toHaveURL(/\/reviews/)
    await expect(
      page.getByRole('heading', { name: 'Reviews & Ratings' })
    ).toBeVisible()
  })

  test('the desktop nav carries the same destination', async ({ page }) => {
    // Both nav trees hold a "Reviews" link and both are in the DOM; unscoped,
    // this resolves to two elements and the assertion means nothing. `pages-nav`
    // is the desktop row.
    await page
      .getByTestId('pages-nav')
      .getByRole('link', { name: 'Reviews', exact: true })
      .click()

    await expect(page).toHaveURL(/\/reviews/)
    await expect(
      page.getByRole('heading', { name: 'Reviews & Ratings' })
    ).toBeVisible()
  })
})

// ============================================================================
// PDP media wall
// ============================================================================

test.describe('the PDP customer media wall', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(PRODUCT_WITH_MEDIA, { waitUntil: 'networkidle' })
  })

  test('renders a tile per upload, above the written reviews', async ({
    page,
  }) => {
    const wall = page.getByTestId('review-media-wall')
    await expect(wall).toBeVisible()

    const tiles = page.getByTestId('review-media-tile')
    const count = await tiles.count()
    expect(count).toBeGreaterThan(0)

    // The header states a count; it has to be the count of what is on screen.
    await expect(wall).toContainText(`${count} post`)

    // The pictures come first and the prose after — the mesonart ordering the
    // wall exists to reproduce.
    const wallBox = await wall.boundingBox()
    const proseBox = await page
      .getByRole('heading', { name: 'Customer Reviews' })
      .boundingBox()
    expect(wallBox).not.toBeNull()
    expect(proseBox).not.toBeNull()
    expect(wallBox!.y).toBeLessThan(proseBox!.y)
  })

  test('a tile opens the lightbox and Escape closes it', async ({ page }) => {
    const total = await page.getByTestId('review-media-tile').count()

    await page.getByTestId('review-media-tile').first().click()

    const lightbox = page.getByTestId('review-media-lightbox')
    await expect(lightbox).toBeVisible()
    await expect(lightbox).toHaveAttribute('aria-modal', 'true')
    await expect(lightbox).toContainText(`1 / ${total}`)

    await page.keyboard.press('Escape')
    await expect(lightbox).toBeHidden()
  })

  test('the arrow keys walk the wall without closing it', async ({ page }) => {
    const total = await page.getByTestId('review-media-tile').count()
    test.skip(total < 2, 'needs at least two uploads to step between')

    await page.getByTestId('review-media-tile').first().click()

    const lightbox = page.getByTestId('review-media-lightbox')
    await expect(lightbox).toContainText(`1 / ${total}`)

    await page.keyboard.press('ArrowRight')
    await expect(lightbox).toContainText(`2 / ${total}`)

    await page.keyboard.press('ArrowLeft')
    await expect(lightbox).toContainText(`1 / ${total}`)
  })
})

// ============================================================================
// The toast
// ============================================================================

test.describe('the floating review toast', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/', { waitUntil: 'networkidle' })
  })

  test('arrives in the bottom-left after its opening delay', async ({
    page,
  }) => {
    // REVIEW_TOAST_INITIAL_DELAY_MS is deliberate. Wait on the element, never
    // on a clock of our own.
    await expect(toast(page)).toBeVisible({ timeout: 20_000 })

    const box = await toast(page).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeLessThan(DESKTOP.width / 2)
    expect(box!.y).toBeGreaterThan(DESKTOP.height / 2)
    // A card, not a bar: it has to leave the page usable underneath it.
    expect(box!.width).toBeLessThan(DESKTOP.width / 2)
  })

  test('links through to the poster it is quoting', async ({ page }) => {
    await expect(toast(page)).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('review-toast-link').click()

    await expect(page).toHaveURL(/\/posters\/[a-z0-9-]+/)
  })

  test('dismissing it keeps it gone for the rest of the visit', async ({
    page,
  }) => {
    await expect(toast(page)).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('review-toast-dismiss').click()
    await expect(toast(page)).toBeHidden()

    // A whole new document in the same tab: the dismissal lives in
    // sessionStorage, so it has to survive that. /about rather than / because
    // nothing else on that page reads the site-wide feed, which turns "it
    // stayed away" into a network fact rather than a wait for an absence.
    const feedCalls = recordFeedRequests(page)
    await page.goto('/about', { waitUntil: 'networkidle' })

    expect(feedCalls).toEqual([])
    await expect(toast(page)).toBeHidden()
  })
})

test.describe('the toast on /checkout', () => {
  let feedCalls: string[] = []

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    feedCalls = recordFeedRequests(page)
    await page.goto('/checkout', { waitUntil: 'networkidle' })
  })

  test('is suppressed before it can even fetch', async ({ page }) => {
    // Confirm this is checkout and not a redirect somewhere else — otherwise
    // the suppression claim below is about the wrong page.
    await expect(page).toHaveURL(/\/checkout/)
    await expect(
      page.getByRole('heading', { name: /your cart is empty/i })
    ).toBeVisible()

    // The route gate sits above the data hook, so the request is never made.
    // Asserting its absence needs no window; asserting the toast's absence
    // would.
    expect(feedCalls).toEqual([])
    await expect(toast(page)).toBeHidden()

    // Control: the same browser session does show the toast off /checkout, so
    // the assertion above is about suppression and not about a dead feed.
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(toast(page)).toBeVisible({ timeout: 20_000 })
  })
})
