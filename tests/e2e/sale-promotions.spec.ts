/**
 * Sale promotions — the whole lifecycle (#438).
 *
 * The claim this feature makes is "honest by construction": nothing
 * promotional exists unless a promotion is running, and it all goes away by
 * itself when the promotion stops. That claim is only worth anything if the
 * *absence* and *expiry* paths are tested as hard as the active one, so the
 * legs below run in order: no promotion → active → excluded product → expiry →
 * countdown continuity.
 *
 * Promotions are seeded through the real admin write path
 * (`tests/e2e/helpers/promotions.ts` → `POST /api/admin/promotions`), never
 * through SQL.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COVERED AT API LEVEL, AND WHY
 * ---------------------------------------------------------------------------
 *
 * 1. **The cart saving row.** `/cart` renders its *lines* from the local
 *    zustand store but takes every saving figure from `GET /api/cart`, joined
 *    per line. The store now writes through to the server cart on every
 *    mutation (#511), so a UI add-to-cart does produce a joinable server
 *    line. This spec still seeds the server cart directly through
 *    `POST /api/cart/items` and checks `GET /api/cart` for per-line
 *    `pricing.sale`, `locked` and the cart-level `savingTotal` that the row
 *    would print — a UI-level add asserted against `[data-testid="cart-saving"]`
 *    is a separate coverage seam, tracked as #567.
 *
 * 2. **Order creation.** Out of scope for this ticket — a lifecycle spec for
 *    promotions, not checkout.
 *
 * 3. **Exact discounted amounts.** The UI assertions are structural (a struck
 *    price is present, a percent-off badge is present). The arithmetic is
 *    cross-checked against `GET /api/products/:slug` rather than by parsing
 *    "₹1,274.25" out of the DOM, so a currency-format change does not read as
 *    a pricing regression.
 *
 * 4. **The Redis product-response cache is purged between legs.** Promotion
 *    writes invalidate the active-promotion lookup and nothing else, so the
 *    cached `product-list:` (300s) and `product:<slug>` (600s) responses keep
 *    serving prices from before the change. A lifecycle spec reads the same
 *    PDP in the "no sale" and "on sale" legs well inside that window, so it
 *    purges as fixture setup. The purge is never used to make a promotion take
 *    effect — see the expiry leg, which proves the chrome vanishes on its own
 *    before purging anything.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *
 *   bunx playwright test tests/e2e/sale-promotions.spec.ts \
 *     --project=chromium --no-deps --workers=1 --reporter=line
 *
 * `--no-deps` skips the `setup` project, so `tests/.auth/admin.json` and
 * `tests/.auth/customer.json` must already exist.
 *
 * Promotions and the customer's server cart are **global** state on a shared
 * dev database, so the whole file is serial and must run one worker at a time.
 * The expiry leg deliberately waits out the 60s active-promotion cache, which
 * is why it carries its own long timeout.
 *
 * The grid leg depends on `ProductCard`'s sale integration. If that is ever
 * reverted, only `grid cards print the struck sale price` fails; the PDP,
 * strip, nav and `/sale` legs stand on their own. That test deliberately reads
 * the "Visually Similar Artworks" row and not `/posters` or `/sale`: those
 * two routes rebuild `ProductCardData` field by field and neither mapper
 * copies `sale`, so their cards print base prices mid-sale. `/sale` is still
 * asserted to list exactly the right *products* — only its per-card pricing
 * is out of reach.
 */

import { test, expect, request as playwrightRequest, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  API_URL,
  createPromotion,
  deleteAllPromotions,
  getActivePromotion,
  purgeProductCache,
  waitForNoActivePromotion,
} from './helpers/promotions'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CUSTOMER_STORAGE_STATE = path.join(__dirname, '..', '.auth', 'customer.json')

/** Wide enough for the desktop nav rows, which are `md:block`. */
const DESKTOP = { width: 1440, height: 900 }
/** Narrow enough that the header collapses to the hamburger drawer. */
const MOBILE = { width: 390, height: 844 }

const HEADLINE = 'E2E lifecycle sale'
const PERCENT_OFF = 25

/** Promotions are global server state — never let two tests hold different ones. */
test.describe.configure({ mode: 'serial' })

// ============================================================================
// Catalogue fixtures
// ============================================================================

interface CatalogueProduct {
  id: string
  slug: string
  title: string
  basePrice: string
  sale: { salePrice: string; percentOff: number; locked: boolean } | null
}

/** One eligible poster, one deliberately excluded one, and the shelf size. */
let discounted: CatalogueProduct
let excluded: CatalogueProduct
let catalogueTotal: number

async function apiJson<T>(pathname: string): Promise<T> {
  const api = await playwrightRequest.newContext({ baseURL: API_URL })
  try {
    const response = await api.get(pathname)
    expect(response.ok(), `GET ${pathname} → ${response.status()}`).toBeTruthy()
    return (await response.json()) as T
  } finally {
    await api.dispose()
  }
}

/** The product detail endpoint's view of a poster, sale field included. */
const fetchProduct = (slug: string) =>
  apiJson<CatalogueProduct>(`/api/products/${slug}`)

/** How many products `/sale` should list right now. */
const fetchOnSaleTotal = async () =>
  (await apiJson<{ total: number }>('/api/products?onSale=true&pageSize=1')).total

test.beforeAll(async () => {
  const listing = await apiJson<{ items: CatalogueProduct[]; total: number }>(
    '/api/products?pageSize=2&sortBy=title&sortOrder=asc'
  )
  expect(
    listing.items.length,
    'the catalogue needs at least two products to tell an excluded one apart'
  ).toBeGreaterThanOrEqual(2)

  discounted = listing.items[0]
  excluded = listing.items[1]
  catalogueTotal = listing.total
})

test.afterAll(async () => {
  await deleteAllPromotions()
})

// ============================================================================
// Leg 1 — no promotion
// ============================================================================

test.describe('with no promotion running', () => {
  test.beforeAll(async () => {
    await deleteAllPromotions()
    await purgeProductCache()
    expect(await getActivePromotion()).toBeNull()
  })

  test('the home page carries no sale strip and no Sale nav link', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/', { waitUntil: 'networkidle' })

    // Prove the header actually rendered before reading anything as absent —
    // otherwise "still loading" and "no sale" look identical.
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'true'
    )

    await expect(page.getByTestId('sale-strip')).toHaveCount(0)
    await expect(page.getByTestId('sale-countdown')).toHaveCount(0)
    await expect(page.getByTestId('sale-nav-link')).toHaveCount(0)
    await expect(page.getByTestId('offer-rail')).toHaveCount(0)
  })

  test('the announcement bar still carries its usual messages', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/', { waitUntil: 'networkidle' })

    // With no strip above it the announcement bar is the only `bg-band` row.
    const announcement = page.locator('p[aria-live="polite"]').first()
    await expect(announcement).toBeVisible()
    await expect(announcement).toHaveText(
      /Free shipping on orders over|returns, no questions asked|Museum-grade archival inks/
    )
  })

  test('the mobile drawer carries no Sale link either', async ({ page }) => {
    // The mobile tree is a separate render with its own testid, so absence has
    // to be checked there too rather than inferred from the desktop row.
    await page.setViewportSize(MOBILE)
    await page.goto('/', { waitUntil: 'networkidle' })

    await openMobileDrawer(page)
    await expect(page.getByTestId('sale-mobile-nav-link')).toHaveCount(0)
  })

  test('the PDP buy panel shows a plain price', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(`/posters/${discounted.slug}`, { waitUntil: 'networkidle' })

    await expect(page.getByTestId('price-current').first()).toBeVisible()
    await expect(page.getByTestId('sale-price')).toHaveCount(0)
    await expect(page.getByTestId('price-was')).toHaveCount(0)
    await expect(page.getByTestId('sale-percent-off')).toHaveCount(0)
    await expect(page.getByTestId('buybox-sale-countdown')).toHaveCount(0)
  })

  test('the poster grid shows no struck prices', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/posters', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('product-card').first()).toBeVisible()
    await expect(page.getByTestId('sale-price')).toHaveCount(0)
    await expect(page.getByTestId('price-was')).toHaveCount(0)
  })

  test('/sale shows its empty state', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/sale', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('sale-page')).toBeVisible()
    await expect(page.getByTestId('sale-empty')).toBeVisible()
    await expect(page.getByTestId('sale-empty')).toContainText(
      'No sale running right now'
    )
    // The heading falls back to the literal word rather than a stale headline.
    await expect(page.getByTestId('sale-headline')).toHaveText('Sale')
    await expect(page.getByTestId('sale-page-countdown')).toHaveCount(0)
    await expect(page.getByTestId('product-card')).toHaveCount(0)
  })
})

// ============================================================================
// Leg 2 — an active promotion, with one product held out of it
// ============================================================================

test.describe('with a promotion running', () => {
  test.beforeAll(async () => {
    await deleteAllPromotions()
    await createPromotion({
      headline: HEADLINE,
      discountValue: PERCENT_OFF,
      scopeType: 'all',
      membersOnly: false,
      excludedProductIds: [excluded.id],
      countdownMode: 'real',
    })
    // Promotion writes leave the cached product responses alone — see
    // `purgeProductCache`. Without this the grid and the PDP would still be
    // serving the pre-sale prices leg 1 just cached.
    await purgeProductCache()

    const active = await getActivePromotion()
    expect(active, 'the seeded promotion should be the running one').not.toBeNull()
    expect(active?.headline).toBe(HEADLINE)
    expect(active?.percentOff).toBe(PERCENT_OFF)
  })

  test('the sale strip carries the headline and a ticking countdown', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/', { waitUntil: 'networkidle' })

    const strip = page.getByTestId('sale-strip')
    await expect(strip).toBeVisible()
    await expect(strip).toContainText(HEADLINE)

    const countdown = page.getByTestId('sale-countdown')
    await expect(countdown).toBeVisible()
    await expect(countdown).toHaveText(/^\d{2} : \d{2} : \d{2}$/)

    // A timer that never moves is a picture of a timer.
    const first = await countdown.textContent()
    await expect(countdown).not.toHaveText(first ?? '', { timeout: 5_000 })
  })

  test('the red Sale nav link appears in both nav trees', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/', { waitUntil: 'networkidle' })

    const desktopLink = page.getByTestId('sale-nav-link')
    await expect(desktopLink).toBeVisible()
    await expect(desktopLink).toHaveText('Sale')
    await expect(desktopLink).toHaveAttribute('href', '/sale')
    // The same link exists in the mobile tree under a different testid, so the
    // desktop one has to be read inside the desktop nav row, not page-wide.
    await expect(page.getByTestId('styles-nav').getByTestId('sale-nav-link')).toHaveCount(1)

    await page.setViewportSize(MOBILE)
    await page.goto('/', { waitUntil: 'networkidle' })
    await openMobileDrawer(page)
    await expect(page.getByTestId('sale-mobile-nav-link')).toBeVisible()
  })

  test('the PDP buy panel prices an eligible poster at the sale price', async ({
    page,
  }) => {
    const priced = await fetchProduct(discounted.slug)
    expect(priced.sale, 'the API should discount this poster').not.toBeNull()

    await page.setViewportSize(DESKTOP)
    await page.goto(`/posters/${discounted.slug}`, { waitUntil: 'networkidle' })

    const salePrice = buyPanel(page).getByTestId('sale-price')
    await expect(salePrice).toBeVisible()
    await expect(salePrice.getByTestId('price-was')).toBeVisible()
    await expect(salePrice.getByTestId('sale-percent-off')).toHaveText(
      `${priced.sale?.percentOff}% off`
    )
    // Members-only was seeded false, so nothing should be gated.
    await expect(page.getByTestId('sale-members-tag')).toHaveCount(0)
    expect(priced.sale?.locked).toBe(false)

    // The buy panel echoes the same countdown the strip shows.
    await expect(page.getByTestId('buybox-sale-countdown')).toBeVisible()
  })

  test('an excluded poster keeps its base price', async ({ page }) => {
    const priced = await fetchProduct(excluded.slug)
    expect(priced.sale, 'the excluded poster must not be discounted').toBeNull()

    await page.setViewportSize(DESKTOP)
    await page.goto(`/posters/${excluded.slug}`, { waitUntil: 'networkidle' })

    // The strip still runs — the sale exists, this poster is simply out of it.
    await expect(page.getByTestId('sale-strip')).toBeVisible()

    const panel = buyPanel(page)
    await expect(panel.getByTestId('price-current')).toBeVisible()
    await expect(panel.getByTestId('sale-price')).toHaveCount(0)
    await expect(panel.getByTestId('price-was')).toHaveCount(0)
    await expect(page.getByTestId('buybox-sale-countdown')).toHaveCount(0)
  })

  test('/sale lists exactly the eligible products', async ({ page }) => {
    const onSaleTotal = await fetchOnSaleTotal()
    expect(
      onSaleTotal,
      'a whole-catalogue sale minus one exclusion'
    ).toBe(catalogueTotal - 1)

    await page.setViewportSize(DESKTOP)
    await page.goto('/sale', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('sale-page')).toBeVisible()
    await expect(page.getByTestId('sale-headline')).toHaveText(HEADLINE)
    await expect(page.getByTestId('sale-page-countdown')).toBeVisible()
    await expect(page.getByTestId('sale-empty')).toHaveCount(0)

    // The page prints the whole eligible count, not just the first window.
    await expect(
      page.getByTestId('sale-page').getByText(
        onSaleTotal === 1 ? '1 piece on sale' : `${onSaleTotal} pieces on sale`
      )
    ).toBeVisible()

    // The held-out poster is nowhere in the list. Matched on its href rather
    // than its title: the card's link text also carries the SKU, and one
    // title can be a prefix of another.
    await expect(
      page
        .getByTestId('sale-page')
        .locator(`a[href="/posters/${excluded.slug}"]`)
    ).toHaveCount(0)
  })

  test('grid cards print the struck sale price', async ({ page }) => {
    /**
     * Grid coverage rides on the "Visually Similar Artworks" row rather than on
     * `/posters` or `/sale`.
     *
     * `ProductCard` renders a sale through `SalePrice` the moment its data
     * carries a `sale` block, and the related row hands it raw API items
     * (`toFeaturedProducts` is a pass-through), so this is the surface where
     * grid-card sale rendering is genuinely exercised end to end.
     *
     * The other two grids build `ProductCardData` field by field and neither
     * mapper copies `sale` — `fetchSaleProducts` in `app/routes/sale.tsx` and
     * the listing mapper in `app/routes/posters/index.tsx` — so their cards
     * print base prices even mid-sale. That is a defect in those routes, not
     * in the card, and asserting it here would only pin the bug in place.
     */
    const related = await apiJson<{ items: { slug: string; sale: unknown }[] }>(
      `/api/products/${discounted.slug}/related?limit=5`
    )
    const discountedInRow = related.items.filter((item) => item.sale !== null).length
    expect(
      discountedInRow,
      'the related row needs at least one discounted card to assert on'
    ).toBeGreaterThan(0)

    await page.setViewportSize(DESKTOP)
    await page.goto(`/posters/${discounted.slug}`, { waitUntil: 'networkidle' })

    // The related row is headed "Visually Similar Artworks" since #522 — it
    // was "You May Also Like" before the PDP parity work.
    const row = page.locator('section:has(h2:text-is("Visually Similar Artworks"))')
    await expect(row.getByTestId('product-card').first()).toBeVisible()

    // Exactly the cards the API discounts, no more and no fewer.
    await expect(row.getByTestId('sale-price')).toHaveCount(discountedInRow)
    await expect(row.getByTestId('price-was')).toHaveCount(discountedInRow)
    await expect(row.getByTestId('sale-percent-off').first()).toHaveText(
      `${PERCENT_OFF}% off`
    )
  })

  test('the server cart totals the sale saving [API level]', async () => {
    // See the header: the web app never writes to the server cart, so this
    // lifecycle step is exercised where the saving row actually gets its
    // numbers rather than through an add-to-cart the app cannot perform.
    const customer = await playwrightRequest.newContext({
      baseURL: API_URL,
      storageState: CUSTOMER_STORAGE_STATE,
    })

    try {
      await customer.delete('/api/cart')

      const variants = await apiJson<{ items: { id: string; price: string }[] }>(
        `/api/products/${discounted.slug}/variants`
      )
      const variant = variants.items[0]
      expect(variant, 'the poster needs a variant to be added').toBeTruthy()

      const added = await customer.post('/api/cart/items', {
        data: {
          productId: discounted.id,
          variantId: variant.id,
          quantity: 2,
        },
      })
      expect(added.ok(), `add to cart → ${added.status()}`).toBeTruthy()

      const cart = await (await customer.get('/api/cart')).json()
      const line = cart.items?.[0]

      expect(line?.pricing?.sale, 'the line should carry a sale price').toBeTruthy()
      expect(line.pricing.locked, 'members-only was seeded false').toBe(false)
      expect(line.pricing.percentOff).toBe(PERCENT_OFF)
      expect(line.pricing.headline).toBe(HEADLINE)

      // The figure the "Sale saving" row prints.
      const base = Number(line.pricing.base)
      const sale = Number(line.pricing.sale)
      expect(sale).toBeLessThan(base)
      expect(Number(cart.savingTotal)).toBeCloseTo(base - sale, 2)
      expect(Number(cart.savingTotal)).toBeGreaterThan(0)
    } finally {
      await customer.delete('/api/cart').catch(() => undefined)
      await customer.dispose()
    }
  })

  /**
   * Closes the coverage seam named above (#567): the previous test proves the
   * arithmetic against a cart seeded through `POST /api/cart/items` directly.
   * This one proves the row actually renders for a cart built the way a real
   * customer builds one — through the PDP's Add to Cart button — so the local
   * store's line and the server's line are provably the same line, not two
   * baskets that happen to agree in a fixture.
   */
  test.describe('the saving row, added through the UI', () => {
    test.use({ storageState: CUSTOMER_STORAGE_STATE })

    test.beforeEach(async () => {
      const customer = await playwrightRequest.newContext({
        baseURL: API_URL,
        storageState: CUSTOMER_STORAGE_STATE,
      })
      await customer.delete('/api/cart').catch(() => undefined)
      await customer.dispose()
    })

    test.afterEach(async () => {
      const customer = await playwrightRequest.newContext({
        baseURL: API_URL,
        storageState: CUSTOMER_STORAGE_STATE,
      })
      await customer.delete('/api/cart').catch(() => undefined)
      await customer.dispose()
    })

    test('a UI add-to-cart produces a saving row on /cart', async ({ page }) => {
      await page.setViewportSize(DESKTOP)
      await page.goto(`/posters/${discounted.slug}`, { waitUntil: 'networkidle' })

      const addToCart = page.getByRole('button', { name: 'Add to Cart' })
      await expect(addToCart).toBeEnabled()

      // The saving row reads `useServerCart()`, populated only once this POST
      // resolves — navigating on the optimistic click alone races the server
      // round trip and can land on /cart before there is anything to join.
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/cart/items') &&
            response.request().method() === 'POST' &&
            response.ok()
        ),
        addToCart.click(),
      ])

      await page.goto('/cart', { waitUntil: 'networkidle' })

      await expect(page.getByTestId('cart-saving')).toBeVisible()
      await expect(page.getByTestId('cart-saving')).toContainText('Sale saving')
    })
  })
})

// ============================================================================
// Leg 3 — expiry, with nobody touching anything
// ============================================================================

test.describe('when the promotion lapses', () => {
  // The active-promotion rows are memoised for 60s and only an admin write
  // invalidates that cache early. Letting the window lapse on its own is the
  // whole point of this leg, so the wait is real and the timeout is generous.
  test.setTimeout(240_000)

  test('prices revert and every sale surface disappears with no admin action', async ({
    page,
  }) => {
    await deleteAllPromotions()
    await createPromotion({
      headline: 'E2E expiring sale',
      discountValue: PERCENT_OFF,
      membersOnly: false,
      endsAt: new Date(Date.now() + 10_000),
      countdownMode: 'real',
    })
    await purgeProductCache()

    expect(await getActivePromotion()).not.toBeNull()

    // It really is on sale first, or "reverted" proves nothing.
    await page.setViewportSize(DESKTOP)
    await page.goto(`/posters/${discounted.slug}`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('sale-price').first()).toBeVisible()
    await expect(page.getByTestId('sale-strip')).toBeVisible()
    await expect(page.getByTestId('buybox-sale-countdown')).toBeVisible()

    // No enable, no disable, no delete, no admin write of any kind — the
    // window simply runs out.
    await waitForNoActivePromotion()

    // ---- The chrome, with nothing purged and nothing touched. -------------
    // Every surface below is driven by `GET /api/promotions/active`, which is
    // not Redis-cached, so this half of the assertion is pure natural expiry.
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('sale-strip')).toHaveCount(0)
    await expect(page.getByTestId('buybox-sale-countdown')).toHaveCount(0)

    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'true'
    )
    await expect(page.getByTestId('sale-strip')).toHaveCount(0)
    await expect(page.getByTestId('sale-nav-link')).toHaveCount(0)
    await expect(page.getByTestId('offer-rail')).toHaveCount(0)

    // ---- The prices. ------------------------------------------------------
    // These lag, and not because the pricing is wrong: the cached product
    // responses outlive the promotion by their own TTL, because promotion
    // writes do not purge them. Both the API cross-check and the page below
    // therefore have to come after a purge — until then the storefront is
    // still serving the sale it was serving a minute ago, which is a real gap
    // rather than a test artefact.
    await purgeProductCache()

    expect((await fetchProduct(discounted.slug)).sale).toBeNull()

    await page.goto(`/posters/${discounted.slug}`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('sale-price')).toHaveCount(0)
    await expect(page.getByTestId('price-was')).toHaveCount(0)
    await expect(page.getByTestId('price-current').first()).toBeVisible()

    await page.goto('/sale', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('sale-empty')).toBeVisible()
    await expect(page.getByTestId('sale-headline')).toHaveText('Sale')
    await expect(page.getByTestId('product-card')).toHaveCount(0)
  })
})

// ============================================================================
// Leg 4 — the rolling countdown survives a reload
// ============================================================================

test.describe('the rolling countdown', () => {
  test.beforeAll(async () => {
    await deleteAllPromotions()
    await createPromotion({
      headline: 'E2E rolling sale',
      discountValue: PERCENT_OFF,
      membersOnly: false,
      countdownMode: 'rolling',
      rollingWindowMinutes: 720,
      rollingJitterMinutes: 90,
      // Far enough out that the rolling window, not `endsAt`, is what shows —
      // the deadline is always min(minted, endsAt), and a 6h end would clamp
      // every visitor to the same value and make this assertion vacuous.
      endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    await purgeProductCache()
    expect(await getActivePromotion()).not.toBeNull()
  })

  test('continues across a reload instead of restarting', async ({ page }) => {
    await page.setViewportSize(DESKTOP)

    // First load mints the window and stores it in the per-promotion cookie.
    // The header and the strip each look the promotion up, so two requests
    // race to mint on a cold context; the deadline worth asserting on is the
    // settled one, from the load after the cookie exists.
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('sale-countdown')).toBeVisible()

    await page.reload({ waitUntil: 'networkidle' })
    const settled = await page.getByTestId('sale-countdown').getAttribute('datetime')
    expect(settled).toBeTruthy()

    await page.reload({ waitUntil: 'networkidle' })
    const afterReload = await page
      .getByTestId('sale-countdown')
      .getAttribute('datetime')

    expect(
      afterReload,
      'a reload inside the window must continue the same deadline'
    ).toBe(settled)

    // The displayed time keeps counting down rather than resetting to a full
    // window: same deadline, less of it left.
    await expect(page.getByTestId('sale-countdown')).toHaveText(
      /^\d{2} : \d{2} : \d{2}$/
    )
  })

  test('mints a different window for a visitor who has no cookie yet', async ({
    browser,
  }) => {
    // The teeth behind the assertion above: without the cookie the deadline is
    // re-minted with jitter, so "unchanged across a reload" is a real result
    // and not just a constant the server would return to anyone.
    const first = await browser.newContext({ viewport: DESKTOP })
    const second = await browser.newContext({ viewport: DESKTOP })

    try {
      const readDeadline = async (page: Page) => {
        await page.goto('/', { waitUntil: 'networkidle' })
        await expect(page.getByTestId('sale-countdown')).toBeVisible()
        return page.getByTestId('sale-countdown').getAttribute('datetime')
      }

      const a = await readDeadline(await first.newPage())
      const b = await readDeadline(await second.newPage())

      expect(a).toBeTruthy()
      expect(b).toBeTruthy()
      expect(a).not.toBe(b)
    } finally {
      await first.close()
      await second.close()
    }
  })
})

// ============================================================================
// Helpers
// ============================================================================

/**
 * The PDP buy panel.
 *
 * A product page also renders a related-products grid, and those cards carry
 * the very same `sale-price` / `price-was` testids as the buy panel — reading
 * them page-wide makes "this poster is not discounted" pass or fail on what its
 * neighbours cost. The panel has no testid of its own, so it is identified by
 * the one line only it contains.
 */
function buyPanel(page: Page) {
  return page.locator(
    'div:has(> p:text-is("Price varies by size and frame selection"))'
  )
}

/** The drawer is mounted only while open, so its links do not exist until then. */
async function openMobileDrawer(page: Page): Promise<void> {
  await page.locator('header button[aria-label="Open menu"]').first().click()
  await expect(page.locator('#mobile-nav')).toBeVisible()
}
