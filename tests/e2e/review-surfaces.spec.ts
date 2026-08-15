/**
 * Review surfaces — #486, #487, #488, #489, reswept for the grid in #499.
 *
 * The unit suites already pin what each surface renders from a given payload.
 * What only a browser can answer is whether the surfaces are wired into the
 * running app at all: the /reviews destination and its paging, the home strip,
 * the product page's review section and its lightbox, and the floating toast —
 * including the route it must stay away from.
 *
 * ## What changed under this file (#497, #498)
 *
 * The reviews UI was rebuilt against mesonart's actual Loox layout
 * (docs/design/mesonart/mesonart-reviews-page-loox.png and
 * mesonart-pdp-reviews-loox.png). Three things this file used to assert are
 * gone, and each one is ported rather than dropped:
 *
 *  - The beige aggregate band became the compact header row — a star row, a
 *    "<N> Reviews" chevron that discloses the average on request, and a "Write
 *    a review" pill. `reviews-aggregate` → `reviews-header`.
 *  - Numbered page-2 paging became "Show more reviews", which APPENDS. The
 *    `?page=2` deep link still has to resolve, though: `validateSearch` still
 *    coerces the param, and a link shared while the pager existed must land on
 *    a working page rather than on a blank error boundary. Both halves are
 *    below.
 *  - The PDP's media-only wall above a written list became one grid. A review
 *    without a photo is the same card with its media slot omitted, in the same
 *    masonry as the ones with photos — so the spec that proved the wall came
 *    first now proves the two kinds of review share one grid.
 *
 * ## Two things this file deliberately does NOT do
 *
 *  - It never asserts an exact review count. The rules the surfaces encode are
 *    thresholds, so thresholds are what get asserted. The seed carries twelve
 *    approved reviews; a spec that pinned "12" would fail the next time anyone
 *    reviewed anything.
 *  - It never waits on a clock for something that is meant not to appear. The
 *    toast's opening delay is real, so the positive cases wait on the element;
 *    the negative cases assert on the request the suppressed toast never makes,
 *    which needs no window at all.
 */

import { test, expect, type Locator, type Page } from '@playwright/test'

/** Every selector below is scoped to the desktop tree this viewport produces. */
const DESKTOP = { width: 1440, height: 900 }

/** Seeded with a review carrying two photos and a clip, and one carrying none. */
const PRODUCT_WITH_MEDIA = '/posters/wabi-sabi-study'

/** The toast is mounted once in `__root.tsx`, so this is never ambiguous. */
const toast = (page: Page) => page.getByTestId('review-toast')

/**
 * Record calls to the site-wide review feed, matched on the exact pathname.
 *
 * `/api/reviews/media` and `/api/reviews/stats` share the prefix and are
 * fetched by the header row and by the home strip, so a substring match would
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

/**
 * Shrink the feed's page size on its way to the API.
 *
 * "Show more reviews" only exists while the response says `hasNextPage`, and
 * the wall asks for 24 rows against a seed of twelve — so on real data the
 * button never appears and appending could not be exercised at all. Rewriting
 * the query is the smallest possible shim: the API still answers, with real
 * rows in the real order, and the ONLY thing the browser sees differently is
 * how many arrive at a time. Nothing is stubbed and no payload is fabricated.
 */
async function shrinkFeedPages(page: Page, pageSize: number) {
  await page.route('**/api/reviews?**', async (route) => {
    const url = new URL(route.request().url())
    // `/api/reviews/media` and `/api/reviews/stats` share the prefix; only the
    // feed itself is paged.
    if (url.pathname !== '/api/reviews') {
      await route.fallback()
      return
    }
    url.searchParams.set('pageSize', String(pageSize))
    await route.continue({ url: url.toString() })
  })
}

/** The review ids currently on the wall, in the order they are rendered. */
async function cardIds(scope: Locator | Page): Promise<string[]> {
  return scope.locator('[data-testid="review-grid-item"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-review-id') ?? '')
  )
}

/** `1 / 3` → 3. The lightbox walks every attachment on the wall, not one card's. */
async function lightboxTotal(lightbox: Locator): Promise<number> {
  const text = (await lightbox.innerText()).replace(/\s+/g, ' ')
  const match = text.match(/(\d+) \/ (\d+)/)
  expect(match, 'the viewer prints its position as "<n> / <total>"').not.toBeNull()
  return Number(match![2])
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

    // The reference page carries no visible title — the wall is the page — so
    // the h1 is present for the crawler and the screen reader and clipped to a
    // point for everyone else. Attached, and NOT laid out as a page title.
    const heading = page.getByRole('heading', {
      level: 1,
      name: 'Reviews & Ratings',
    })
    await expect(heading).toBeAttached()
    const headingBox = await heading.boundingBox()
    expect(headingBox).not.toBeNull()
    expect(headingBox!.height).toBeLessThan(4)
  })

  test('opens on the Loox header row, above the wall', async ({ page }) => {
    const header = page.getByTestId('reviews-header')
    await expect(header).toBeVisible()

    // A star row and a count, which is what the reference prints. The stars
    // carry the figure; the average itself is disclosed rather than displayed.
    await expect(
      header.getByRole('img', { name: /Rating: \d\.\d out of 5 stars/ })
    ).toBeVisible()

    const toggle = header.getByTestId('reviews-count-toggle')
    await expect(toggle).toContainText(/[\d,]+ Reviews/)

    // No beige score band on this page: nothing prints an average until the
    // chevron is pressed.
    await expect(page.getByTestId('reviews-average')).toHaveCount(0)
    await toggle.click()
    await expect(page.getByTestId('reviews-average')).toContainText(
      /\d\.\d out of 5 across the catalogue/
    )

    // The row carries the only way in on this page — a review needs a purchase
    // behind it, so the pill points at the orders list rather than at a form.
    await expect(header.getByTestId('reviews-write')).toHaveAttribute(
      'href',
      '/account/orders'
    )

    // And it sits above the wall, which is the ordering the reference has.
    const headerBox = await header.boundingBox()
    const gridBox = await page.getByTestId('review-grid').boundingBox()
    expect(headerBox).not.toBeNull()
    expect(gridBox).not.toBeNull()
    expect(headerBox!.y).toBeLessThan(gridBox!.y)
  })

  test('every card carries the poster it is about', async ({ page }) => {
    const cards = page.getByTestId('review-grid-card')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)

    // The product chip is what makes a catalogue-wide wall readable: every card
    // on it is about a different poster.
    const chips = page.getByTestId('review-card-product')
    expect(await chips.count()).toBe(count)

    const href = await chips.first().getAttribute('href')
    expect(href).toMatch(/^\/posters\/[a-z0-9-]+/)

    await chips.first().click()

    expect(page.url()).toContain(href as string)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('Show more reviews appends to the wall rather than replacing it', async ({
    page,
  }) => {
    // Six at a time, so the seed spans more than one page. See shrinkFeedPages.
    await shrinkFeedPages(page, 6)
    await page.goto('/reviews', { waitUntil: 'networkidle' })

    const cards = page.getByTestId('review-grid-card')
    const before = await cards.count()
    expect(before).toBeGreaterThan(0)

    const firstIds = await cardIds(page)

    const more = page.getByTestId('review-grid-more')
    await expect(more).toBeVisible()
    await more.click()

    // Appending, not paging: the wall grows.
    await expect.poll(() => cards.count()).toBeGreaterThan(before)

    const afterIds = await cardIds(page)

    // The first page is still there, still in front, still in order — a pager
    // would have replaced it.
    expect(afterIds.slice(0, firstIds.length)).toEqual(firstIds)

    // And nothing arrived twice. The grid keys by review id precisely because a
    // review written between two fetches shifts every later row down by one.
    expect(new Set(afterIds).size).toBe(afterIds.length)
  })

  test('a ?page=2 deep link still resolves rather than error-boundarying', async ({
    page,
  }) => {
    // The wall appends now and nothing reads `page` any more, but the param
    // survives in links shared while the numbered pager existed. The route
    // error-boundaries to a blank page if validateSearch throws on the STRING
    // '2' — router.tsx hands every search param over as a string — so a
    // rendered header row and a populated wall are the proof that it coerced.
    await page.goto('/reviews?page=2', { waitUntil: 'networkidle' })

    await expect(page).toHaveURL(/\/reviews\?page=2$/)
    await expect(page.getByTestId('reviews-header')).toBeVisible()
    expect(await page.getByTestId('review-grid-card').count()).toBeGreaterThan(0)
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
      strip.getByRole('heading', { name: 'Customer Reviews' })
    ).toBeVisible()

    // A score printed at all means the strip's own >= 10 gate is open. This is
    // the one surface that still prints an average unasked; /reviews discloses
    // it behind the chevron instead.
    await expect(page.getByTestId('home-reviews-score')).toContainText(/\d\.\d/)
    expect(await page.getByTestId('home-review-card').count()).toBeGreaterThan(0)
  })

  test('the photograph advances with the quote, every step', async ({
    page,
  }) => {
    // The band shipped with two tracks of different lengths — every review
    // quoted, only the photographed ones tiled — so the strip paired quotes
    // with strangers' pictures and froze once it ran out of them. Both tracks
    // now hold the same reviews, so the tile at the index is the quoted one.
    const band = page.getByTestId('home-reviews')
    await expect(band).toBeVisible()

    const next = band.getByRole('button', { name: 'Next review' })
    const track = page.getByTestId('home-reviews-media-track')

    for (let step = 1; step <= 3; step++) {
      await next.click()

      const offset = await track.evaluate(
        (node) =>
          Number(/\* -1 \* (\d+)/.exec((node as HTMLElement).style.transform)?.[1])
      )
      expect(offset).toBe(step)

      // The quoted name and the name on the leading tile are the same person.
      const author = await page
        .getByTestId('home-review-card')
        .nth(step)
        .getByTestId('home-review-author')
        .innerText()
      const label = await page
        .getByTestId('home-review-media')
        .nth(step)
        .getAttribute('aria-label')

      expect(label).toContain(author.trim())
    }
  })

  test('View All leads to the reviews destination', async ({ page }) => {
    await page
      .getByTestId('home-reviews')
      .getByRole('link', { name: 'View All' })
      .click()

    await expect(page).toHaveURL(/\/reviews/)
    await expect(page.getByTestId('reviews-header')).toBeVisible()
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
    await expect(page.getByTestId('reviews-header')).toBeVisible()
  })
})

// ============================================================================
// The PDP review section
// ============================================================================

test.describe('the PDP review section', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(PRODUCT_WITH_MEDIA, { waitUntil: 'networkidle' })
  })

  test('fuses photos and prose into one grid under the header row', async ({
    page,
  }) => {
    const section = page.getByTestId('product-reviews')
    await expect(section).toBeVisible()

    // The anchor the section is linked and located by. It stays on the
    // <section>, with the grid inside it, so a jump lands on the wall.
    await expect(section).toHaveAttribute('id', 'reviews')

    // The media-only wall of square tiles that used to sit above a written list
    // is retired, not hidden. Its absence is asserted rather than assumed.
    await expect(page.getByTestId('review-media-wall')).toHaveCount(0)
    await expect(page.getByTestId('review-media-tile')).toHaveCount(0)

    // Same header row as /reviews, scoped to this poster.
    const header = section.getByTestId('reviews-header')
    await expect(header).toBeVisible()
    await header.getByTestId('reviews-count-toggle').click()
    await expect(section.getByTestId('reviews-average')).toContainText(
      /\d\.\d out of 5 for this poster/
    )

    const cards = section.getByTestId('review-grid-card')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)

    // The claim the rebuild rests on: one grid, both kinds of review. The
    // seeded poster carries a review with attachments and a review without, and
    // they are cards in the same masonry.
    const withMedia = section.locator(
      '[data-testid="review-grid-card"][data-has-media="true"]'
    )
    const withoutMedia = section.locator(
      '[data-testid="review-grid-card"][data-has-media="false"]'
    )
    expect(await withMedia.count()).toBeGreaterThan(0)
    expect(await withoutMedia.count()).toBeGreaterThan(0)
    expect((await withMedia.count()) + (await withoutMedia.count())).toBe(count)

    // Every card, media or not, carries the words that were written.
    expect(await section.getByTestId('review-card-body').count()).toBe(count)

    // And the wall is filtered to THIS poster. `productId` is the only thing
    // separating this deployment of the grid from the catalogue-wide one, so a
    // chip pointing anywhere else means the filter was dropped.
    const chips = section.getByTestId('review-card-product')
    expect(await chips.count()).toBe(count)
    const hrefs = await chips.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href'))
    )
    for (const href of hrefs) {
      expect(href).toBe(PRODUCT_WITH_MEDIA)
    }
  })

  test("a card's photo opens the shared lightbox and Escape closes it", async ({
    page,
  }) => {
    const section = page.getByTestId('product-reviews')
    const triggers = section.getByTestId('review-card-media-trigger')
    expect(await triggers.count()).toBeGreaterThan(0)

    await triggers.first().click()

    const lightbox = page.getByTestId('review-media-lightbox')
    await expect(lightbox).toBeVisible()
    await expect(lightbox).toHaveAttribute('aria-modal', 'true')
    await expect(lightbox).toContainText(/1 \/ \d+/)

    await page.keyboard.press('Escape')
    await expect(lightbox).toBeHidden()
  })

  test('the arrow keys walk every attachment on the wall', async ({ page }) => {
    const section = page.getByTestId('product-reviews')
    const triggers = section.getByTestId('review-card-media-trigger')
    expect(await triggers.count()).toBeGreaterThan(0)

    await triggers.first().click()

    const lightbox = page.getByTestId('review-media-lightbox')
    await expect(lightbox).toBeVisible()

    // The viewer walks a FLAT list of every attachment in the grid, so a review
    // carrying more than one photo is reachable past its cover — a lightbox per
    // card would trap prev/next inside one review. The seeded poster's review
    // carries three attachments, which is what makes the arrows testable here.
    const total = await lightboxTotal(lightbox)
    expect(
      total,
      'the seeded poster must carry more than one attachment or the arrows have nothing to walk'
    ).toBeGreaterThan(1)

    await expect(lightbox).toContainText(`1 / ${total}`)

    await page.keyboard.press('ArrowRight')
    await expect(lightbox).toContainText(`2 / ${total}`)

    await page.keyboard.press('ArrowLeft')
    await expect(lightbox).toContainText(`1 / ${total}`)
  })

  test('the clip opens with a poster frame, no autoplay and no preload', async ({
    page,
  }) => {
    const section = page.getByTestId('product-reviews')
    await section.getByTestId('review-card-media-trigger').first().click()

    const lightbox = page.getByTestId('review-media-lightbox')
    await expect(lightbox).toBeVisible()

    // The seeded clip is the review's third attachment, so it is reached
    // through the wall's flat list rather than off a card cover.
    const total = await lightboxTotal(lightbox)
    const video = lightbox.getByTestId('review-media-video')
    let position = 1
    while (position < total && (await video.count()) === 0) {
      await page.keyboard.press('ArrowRight')
      position += 1
      await expect(lightbox).toContainText(`${position} / ${total}`)
    }
    expect(
      await video.count(),
      'the seeded poster must carry a clip for this rule to be testable'
    ).toBe(1)

    // Opening the viewer is not the same as pressing play. A wall of clips that
    // fetch themselves on sight is tens of megabytes before anyone asks for
    // one, so the poster frame is the whole of what loads.
    await expect(video).toHaveAttribute('preload', 'none')
    await expect(video).toHaveAttribute('poster', /^https?:\/\//)
    expect(await video.getAttribute('autoplay')).toBeNull()
  })

  test('the buy-box star row jumps down to the review section', async ({
    page,
  }) => {
    // mesonart's buy box hangs its review count off the section below it. The
    // #reviews anchor existed with nothing pointing at it until #499.
    const link = page.getByTestId('buybox-reviews-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '#reviews')
    await expect(link).toContainText(/\d+ reviews/)

    // The star row is above the fold and the wall is not, so this is a real
    // jump rather than a no-op.
    await expect(page.getByTestId('review-grid')).not.toBeInViewport()

    await link.click()

    await expect(page).toHaveURL(/#reviews$/)
    // Landing on the wall, not above an empty container — and clear of the
    // sticky header, which is what the section's scroll margin buys.
    await expect(page.getByTestId('reviews-header')).toBeInViewport()
    await expect(page.getByTestId('review-grid')).toBeInViewport()
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
