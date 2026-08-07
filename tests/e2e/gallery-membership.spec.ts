/**
 * Gallery membership — locked to unlocked, and the banner/rail handover (#447).
 *
 * A members-only promotion makes two promises. The first is that the price is
 * *teased* rather than given: a non-member sees what the sale would cost and is
 * charged base until they join. The second is that the offer to join is made
 * once and then gets out of the way — banner, then rail, then silence for a
 * week. This spec walks both, plus the handover between them.
 *
 * Promotions are seeded through the real admin write path
 * (`tests/e2e/helpers/promotions.ts`, #438), never through SQL.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COVERED AT API LEVEL, AND WHY
 * ---------------------------------------------------------------------------
 *
 * **The locked cart saving.** The store now writes through to the server cart
 * on every mutation (#511), so a UI add-to-cart does produce a joinable
 * server line — but this spec still seeds the server cart directly through
 * `POST /api/cart/items` and reads `GET /api/cart` for per-line
 * `pricing.sale` / `pricing.locked` and the cart-level `savingTotal` (see the
 * header of `sale-promotions.spec.ts`); a UI-level add is a separate coverage
 * seam, tracked as #567.
 *
 * That leg is worth more than a structural UI check anyway, because the
 * interesting claim is arithmetic: a locked line contributes **zero** to
 * `savingTotal` (`lineSaving()` returns 0 while `pricing.locked` is true) even
 * though `pricing.sale` is populated and lower than `pricing.base`. "Teased,
 * not given" is exactly that pair of facts, and the same request proves both.
 * The join is then performed against the same account and the same cart, so the
 * before/after is one line item changing its mind rather than two fixtures.
 * (`GET /api/cart` caches per `cartCacheKey(cartId, isMember)`, so the join
 * flips the key and the second read is a genuine recompute, not a cache miss
 * dressed up as one.)
 *
 * Order creation is out of scope for this ticket and unreachable for the same
 * reason — `POST /api/orders` builds from the same empty basket.
 *
 * Grid cards are deliberately not asserted on. `/posters`, `/sale` and
 * `/collections/$slug` rebuild `ProductCardData` field by field and none of
 * those mappers copy `sale`, so their cards print base prices mid-sale (#524).
 * Every price assertion here reads the PDP buy panel, which is fed the raw API
 * product.
 *
 * ---------------------------------------------------------------------------
 * FIXTURES: WHY FRESH ACCOUNTS
 * ---------------------------------------------------------------------------
 *
 * There is no "leave the gallery" endpoint — `joinGallery` is idempotent in one
 * direction only. The shared `tests/.auth/customer.json` account is therefore a
 * one-way fixture: the first run of the join leg would make it a member and
 * every later run would assert "locked" against someone who is not locked, and
 * pass vacuously forever. Each leg that needs a non-member registers its own
 * account through `POST /api/auth/sign-up/email` (which auto-signs-in and
 * returns `galleryMember: false`), and the member leg registers one and joins
 * it. `registerAccount` backs off on the auth rate limiter (5/60s) so a quick
 * re-run does not read as a product failure.
 *
 * ---------------------------------------------------------------------------
 * THE SESSION COOKIE CACHE, AND WHY EVERY FIXTURE DROPS IT
 * ---------------------------------------------------------------------------
 *
 * better-auth is configured with `session.cookieCache` enabled at a 5-minute
 * maxAge (`packages/api/src/auth/index.ts`), which serves the whole user object
 * — `galleryMember` included — out of the signed `chobii.session_data` cookie
 * rather than the database. `joinGallery` writes the column and does not
 * refresh or clear that cookie, so **for up to five minutes after joining,
 * every API route that reads `user.galleryMember` still sees `false`**: cart
 * pricing, product pricing and order pricing alike. Verified directly — a join
 * returns `{"galleryMember":true}` while `GET /api/auth/get-session` on the
 * same jar still answers `false`, and answers `true` the moment that one cookie
 * is dropped.
 *
 * That is a real gap and worth filing; it is also why the web app flips
 * membership optimistically on the client (`useGalleryMembership`'s
 * `joinedIdentity`) instead of waiting for the session to agree. The UI leg
 * below rides that optimistic signal, which is the behaviour being specified.
 *
 * For the API legs the cookie cache is just staleness in front of the thing
 * under test, so `registerAccount` strips `chobii.session_data` from the
 * storage state it hands out and every API call builds a fresh context from it.
 * This is the session-cache counterpart of #438's `purgeProductCache()`:
 * fixture hygiene standing in for a TTL, never a step used to make the join
 * itself succeed — the join is asserted on its own 200 response and re-read
 * from the database independently.
 *
 * ---------------------------------------------------------------------------
 * FREQUENCY STATE: WHERE IT LIVES
 * ---------------------------------------------------------------------------
 *
 * Two keys, both suffixed with the promotion id (`SaleBanner.tsx`):
 *
 *   sessionStorage  chobii:sale-banner-seen:<id>        shown-once-per-session
 *   localStorage    chobii:sale-banner-dismissed:<id>   7-day cooldown
 *
 * Both hold a bare ms-epoch string. Playwright gives every test a fresh
 * context, so both start empty — but *within* a test they persist across
 * reloads, and the two rules would otherwise mask each other. The legs below
 * keep them apart deliberately:
 *
 *   - the once-per-session leg never dismisses, so no cooldown key exists and
 *     only the session flag can be doing the suppressing;
 *   - the cooldown legs seed `localStorage` into a brand-new context, so
 *     `sessionStorage` is empty and only the cooldown can be doing it.
 *
 * The cooldown pair is a control, not one assertion: a timestamp from just now
 * must suppress the banner AND a timestamp from eight days ago must not. Only
 * the first would also pass against a component that suppressed on the mere
 * presence of the key.
 *
 * ---------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------
 *
 *   bunx playwright test tests/e2e/gallery-membership.spec.ts \
 *     --project=chromium --no-deps --reporter=line --workers=1
 *
 * `--no-deps` skips the `setup` project, so `tests/.auth/admin.json` must
 * already exist — the promotion helpers seed through the admin API with it.
 *
 * Promotions are global state on a shared dev database, so the file is serial
 * and must run one worker at a time.
 */

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import {
  API_URL,
  createPromotion,
  deleteAllPromotions,
  getActivePromotion,
  purgeProductCache,
} from './helpers/promotions'

/**
 * The rail is `hidden lg:flex`, so every viewport here has to clear Tailwind's
 * `lg` breakpoint (1024px) or "no rail" means "too narrow for a rail".
 */
const DESKTOP = { width: 1440, height: 900 }

/** The web origin, which is NOT `API_URL`. Storage is seeded against this. */
const WEB_URL = process.env.E2E_BASE_URL || 'http://localhost:3001'

const HEADLINE = 'E2E members-only sale'
const PERCENT_OFF = 25
const PASSWORD = 'TestPassword123!'

/** `SALE_BANNER_COOLDOWN_MS` in `SaleBanner.tsx`. Restated, not imported: the
 *  spec should fail if the product quietly shortens the week. */
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

/** Promotions are global server state — never let two tests hold different ones. */
test.describe.configure({ mode: 'serial' })

// ============================================================================
// Fixtures
// ============================================================================

interface CatalogueProduct {
  id: string
  slug: string
  title: string
  basePrice: string
  sale: { salePrice: string; percentOff: number; locked: boolean } | null
}

type StorageState = Awaited<ReturnType<APIRequestContext['storageState']>>

/** better-auth's cached copy of the user object. See the header. */
const SESSION_CACHE_COOKIE = 'chobii.session_data'

/**
 * A registered account plus the cookies that authenticate it.
 *
 * `storageState` deliberately carries the session *token* and not the cached
 * session blob, so anything built from it resolves membership from the database.
 */
interface Account {
  email: string
  storageState: StorageState
}

/**
 * Drop the cached session blob, keep the session token.
 *
 * The token alone authenticates; without the cache cookie better-auth reloads
 * the user row, which is the only way a mid-run join is visible to the API
 * inside its five-minute window.
 */
function withoutSessionCache(state: StorageState): StorageState {
  return {
    ...state,
    cookies: state.cookies.filter(
      (cookie) => cookie.name !== SESSION_CACHE_COOKIE
    ),
  }
}

/**
 * A short-lived API context authenticated as `account`.
 *
 * Built per call rather than held open: reading a session re-issues the cache
 * cookie, so a long-lived context would quietly re-acquire the staleness
 * `withoutSessionCache` just removed and the post-join read would answer with
 * the pre-join user.
 */
async function apiAs<T>(
  account: Account,
  fn: (api: APIRequestContext) => Promise<T>
): Promise<T> {
  const api = await playwrightRequest.newContext({
    baseURL: API_URL,
    storageState: account.storageState,
  })
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

let poster: CatalogueProduct
let promotionId: string

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

const fetchProduct = (slug: string) =>
  apiJson<CatalogueProduct>(`/api/products/${slug}`)

/**
 * Register a brand-new signed-in, non-member account.
 *
 * better-auth's sign-up auto-creates the session, so the returned storage state
 * is already authenticated. The session cookie is scoped to `localhost` with no
 * port, so the same state authenticates against both the API (3000) and the web
 * app (3001).
 *
 * The auth routes are rate limited to 5 requests per 60s. Two runs of this file
 * inside a minute would otherwise trip it and surface as "registration failed",
 * which reads like a product bug and is not one.
 */
async function registerAccount(label: string): Promise<Account> {
  const api = await playwrightRequest.newContext({ baseURL: API_URL })

  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const email = `e2e-gallery-${label}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`

      const response = await api.post('/api/auth/sign-up/email', {
        data: { email, password: PASSWORD, name: `E2E ${label}` },
      })

      if (response.status() === 429) {
        await new Promise((resolve) => setTimeout(resolve, 12_000))
        continue
      }

      expect(
        response.ok(),
        `sign-up for ${label} → ${response.status()} ${await response.text()}`
      ).toBeTruthy()

      const body = (await response.json()) as {
        user: { galleryMember: boolean }
      }
      expect(
        body.user.galleryMember,
        'a freshly registered account must not already be in the gallery'
      ).toBe(false)

      return {
        email,
        storageState: withoutSessionCache(await api.storageState()),
      }
    }

    throw new Error(
      `registerAccount(${label}): still rate limited after 6 attempts`
    )
  } finally {
    await api.dispose()
  }
}

/** Join the gallery straight through the API, for fixtures rather than flows. */
async function joinViaApi(account: Account, source: string): Promise<void> {
  await apiAs(account, async (api) => {
    const response = await api.post('/api/gallery/join', { data: { source } })
    expect(
      response.ok(),
      `join for ${account.email} → ${response.status()} ${await response.text()}`
    ).toBeTruthy()
    expect(((await response.json()) as { galleryMember: boolean }).galleryMember).toBe(
      true
    )
  })
}

/** What the database says this account's membership is, read past the cache. */
async function isMemberPerApi(account: Account): Promise<boolean> {
  return apiAs(account, async (api) => {
    const body = (await (await api.get('/api/auth/get-session')).json()) as {
      user?: { galleryMember?: boolean }
    }
    return Boolean(body?.user?.galleryMember)
  })
}

test.beforeAll(async () => {
  const listing = await apiJson<{ items: CatalogueProduct[] }>(
    '/api/products?pageSize=1&sortBy=title&sortOrder=asc'
  )
  expect(listing.items.length, 'the catalogue needs a product').toBeGreaterThan(0)
  poster = listing.items[0]

  await deleteAllPromotions()
  await createPromotion({
    headline: HEADLINE,
    discountValue: PERCENT_OFF,
    scopeType: 'all',
    membersOnly: true,
    countdownMode: 'real',
  })
  // Promotion writes invalidate the active-promotion lookup and nothing else;
  // the cached product responses carry the resolved `sale` block and would keep
  // serving the pre-promotion prices for their own TTL.
  await purgeProductCache()

  const active = await getActivePromotion()
  expect(active, 'the seeded promotion should be the running one').not.toBeNull()
  expect(active?.membersOnly, 'this whole file is about a gated sale').toBe(true)
  expect(active?.percentOff).toBe(PERCENT_OFF)
  promotionId = active!.promotionId
})

test.afterAll(async () => {
  await deleteAllPromotions()
})

// ============================================================================
// Leg 1 — the gate, from the outside
// ============================================================================

test.describe('a visitor who is not a member', () => {
  test('sees the sale price on the PDP behind a Members tag', async ({ page }) => {
    // The server is the one that decides this is locked; the UI only ever
    // unlocks. Cross-checking here keeps a UI regression apart from a pricing
    // regression instead of blaming the first for the second.
    const priced = await fetchProduct(poster.slug)
    expect(priced.sale, 'the members-only sale should still price the poster').not.toBeNull()
    expect(priced.sale?.locked, 'a guest is not a member').toBe(true)

    await page.setViewportSize(DESKTOP)
    await page.goto(`/posters/${poster.slug}`, { waitUntil: 'networkidle' })

    // Scoped to the buy panel: the "Visually Similar Artworks" row below carries
    // the very same testids, so a page-wide read would pass on a neighbour's
    // price.
    const panel = page.getByTestId('buy-panel')
    const salePrice = panel.getByTestId('sale-price')

    await expect(salePrice).toBeVisible()
    // The teased figure is shown, struck base and all — this is the shape of
    // the offer, not a hidden price.
    await expect(salePrice.getByTestId('price-was')).toBeVisible()
    await expect(salePrice.getByTestId('sale-percent-off')).toHaveText(
      `${PERCENT_OFF}% off`
    )
    // And the tag that says it is not theirs yet.
    await expect(salePrice.getByTestId('sale-members-tag')).toBeVisible()
    await expect(salePrice.getByTestId('sale-members-tag')).toHaveText('Members')
  })

  test('is teased the cart saving but credited none of it, until they join [API level]', async () => {
    // See the header: the web app cannot write to the server cart, so this is
    // asserted where the saving is computed rather than through an add-to-cart
    // the app is incapable of performing.
    const account = await registerAccount('cart')

    try {
      await apiAs(account, (api) => api.delete('/api/cart'))

      const variants = await apiJson<{ items: { id: string }[] }>(
        `/api/products/${poster.slug}/variants`
      )
      const variant = variants.items[0]
      expect(variant, 'the poster needs a variant to be added').toBeTruthy()

      const added = await apiAs(account, (api) =>
        api.post('/api/cart/items', {
          data: { productId: poster.id, variantId: variant.id, quantity: 2 },
        })
      )
      expect(added.ok(), `add to cart → ${added.status()}`).toBeTruthy()

      // ---- Locked: the price is quoted, the saving is not credited. --------
      const locked = await apiAs(account, async (api) =>
        (await api.get('/api/cart')).json()
      )
      const lockedLine = locked.items?.[0]

      expect(lockedLine?.pricing?.sale, 'the sale price should be quoted').toBeTruthy()
      expect(lockedLine.pricing.locked, 'a non-member is behind the gate').toBe(true)
      expect(lockedLine.pricing.percentOff).toBe(PERCENT_OFF)
      expect(lockedLine.pricing.headline).toBe(HEADLINE)

      const base = Number(lockedLine.pricing.base)
      const sale = Number(lockedLine.pricing.sale)
      expect(sale, 'a tease is only a tease if it is cheaper').toBeLessThan(base)

      // The whole point of "locked": a real saving is on the table and none of
      // it counts yet.
      expect(
        Number(locked.savingTotal),
        'a locked line must contribute nothing to the saving total'
      ).toBe(0)

      // ---- Joining, and the same cart re-read. -----------------------------
      // `GET /api/cart` caches per `cartCacheKey(cartId, isMember)`, so the
      // join moves the read to a different key: this is a recompute, not a
      // stale entry that happens to be right.
      await joinViaApi(account, 'cart')

      const unlocked = await apiAs(account, async (api) =>
        (await api.get('/api/cart')).json()
      )
      const unlockedLine = unlocked.items?.[0]

      expect(unlockedLine.pricing.locked, 'membership opens the gate').toBe(false)
      // Same line, same price — only its status changed.
      expect(Number(unlockedLine.pricing.sale)).toBeCloseTo(sale, 2)
      expect(Number(unlocked.savingTotal)).toBeCloseTo(base - sale, 2)
      expect(Number(unlocked.savingTotal)).toBeGreaterThan(0)
    } finally {
      await apiAs(account, (api) => api.delete('/api/cart')).catch(
        () => undefined
      )
    }
  })
})

// ============================================================================
// Leg 2 — joining, with nothing reloaded
// ============================================================================

test.describe('joining through the modal', () => {
  test('unlocks the PDP price in place, with no reload', async ({ browser }) => {
    const account = await registerAccount('join')
    const context = await browser.newContext({
      viewport: DESKTOP,
      storageState: account.storageState,
    })

    try {
      const page = await context.newPage()
      await page.goto(`/posters/${poster.slug}`, { waitUntil: 'networkidle' })

      const panel = page.getByTestId('buy-panel')
      // Locked first, or "unlocked" proves nothing.
      await expect(panel.getByTestId('sale-members-tag')).toBeVisible()

      // The banner is the modal — there is no separate strip of chrome — and it
      // opens by itself on a first visit. It carries no testid of its own, so
      // it is addressed by role, the way the unit suite does.
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText(HEADLINE)

      // Signed in, so the address is already theirs; the visitor only confirms.
      await expect(modal.getByLabel('Email address')).toHaveValue(account.email)
      await modal.getByRole('button', { name: 'Join the gallery' }).click()

      // Nothing below reloads, navigates or re-fetches the route. The optimistic
      // membership signal is what has to carry this.
      await expect(modal).toBeHidden()
      await expect(panel.getByTestId('sale-members-tag')).toHaveCount(0)

      // The price itself stays — it was always shown, it is simply theirs now.
      await expect(panel.getByTestId('sale-price')).toBeVisible()
      await expect(panel.getByTestId('sale-price').getByTestId('price-was')).toBeVisible()

      // A member is offered nothing, so the rail must not appear in the
      // dismissal's place.
      await expect(page.getByTestId('offer-rail')).toHaveCount(0)

      // And it was a real write, not just a hopeful client.
      expect(await isMemberPerApi(account)).toBe(true)
    } finally {
      await context.close()
    }
  })
})

// ============================================================================
// Leg 3 — a member is left alone
// ============================================================================

test.describe('a member', () => {
  test('sees neither the banner nor the rail, and is asked nothing', async ({
    browser,
  }) => {
    const account = await registerAccount('member')
    await joinViaApi(account, 'registration')

    const context = await browser.newContext({
      viewport: DESKTOP,
      storageState: account.storageState,
    })

    try {
      const page = await context.newPage()
      await page.goto('/', { waitUntil: 'networkidle' })

      // Prove the page really rendered before reading anything as absent,
      // otherwise "still loading" and "not offered" look identical.
      await expect(page.getByTestId('styles-nav')).toHaveAttribute(
        'data-revealed',
        'true'
      )
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByTestId('offer-rail')).toHaveCount(0)

      // No frequency decision is taken on a member's behalf: the hook returns
      // before `ensureResolved()` runs, so neither key is ever written. Without
      // this, a member who later loses membership would find their one banner
      // already spent.
      const keys = await page.evaluate(
        ([session, local]) => ({
          seen: window.sessionStorage.getItem(session),
          dismissed: window.localStorage.getItem(local),
        }),
        [
          `chobii:sale-banner-seen:${promotionId}`,
          `chobii:sale-banner-dismissed:${promotionId}`,
        ]
      )
      expect(keys.seen, 'a member should never be marked as having seen it').toBeNull()
      expect(keys.dismissed, 'nor as having dismissed it').toBeNull()

      // The gate is open on the price, too — same sale, no Members tag.
      await page.goto(`/posters/${poster.slug}`, { waitUntil: 'networkidle' })
      const panel = page.getByTestId('buy-panel')
      await expect(panel.getByTestId('sale-price')).toBeVisible()
      await expect(panel.getByTestId('sale-members-tag')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

// ============================================================================
// Leg 4 — the banner/rail handover
// ============================================================================

test.describe('the banner and the rail', () => {
  test('are never on screen together, and the rail takes over on dismissal', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/', { waitUntil: 'networkidle' })

    const modal = page.getByRole('dialog')
    const rail = page.getByTestId('offer-rail')

    // Banner first, and the rail held back — one `SaleOfferStage`, not two
    // independent surfaces that happen to agree.
    await expect(modal).toBeVisible()
    await expect(modal).toContainText(HEADLINE)
    await expect(rail).toHaveCount(0)

    await modal.getByRole('button', { name: 'Close' }).click()

    // Dismissal is a handover, not a disappearance.
    await expect(modal).toHaveCount(0)
    await expect(rail).toBeVisible()
    await expect(rail).toHaveText(`Get ${PERCENT_OFF}% OFF`)

    // The refusal was written down.
    const dismissedAt = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      `chobii:sale-banner-dismissed:${promotionId}`
    )
    expect(dismissedAt, 'dismissal starts the cooldown').not.toBeNull()
    expect(Number(dismissedAt)).toBeGreaterThan(Date.now() - 120_000)

    // The rail is the way back in.
    await rail.click()
    await expect(modal).toBeVisible()
    await expect(rail).toHaveCount(0)
  })

  test('show the banner once per session even when it is never dismissed', async ({
    page,
  }) => {
    // Nothing is dismissed anywhere in this test, so no cooldown key exists and
    // the session flag is the only thing that can be doing the suppressing.
    await page.setViewportSize(DESKTOP)
    await page.goto('/', { waitUntil: 'networkidle' })

    await expect(page.getByRole('dialog')).toBeVisible()
    expect(
      await page.evaluate(
        (key) => window.localStorage.getItem(key),
        `chobii:sale-banner-dismissed:${promotionId}`
      ),
      'this leg must not be leaning on a cooldown'
    ).toBeNull()

    // A reload throws the module away — only storage survives it.
    await page.reload({ waitUntil: 'networkidle' })

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('offer-rail')).toBeVisible()
  })
})

// ============================================================================
// Leg 5 — the cooldown, across sessions
// ============================================================================

test.describe('the 7-day cooldown', () => {
  /**
   * A brand-new context — so `sessionStorage` is empty and the once-per-session
   * rule cannot be what suppresses the banner — carrying one dismissal
   * timestamp in `localStorage`.
   */
  async function contextDismissedAt(
    browser: Browser,
    dismissedAt: number
  ): Promise<BrowserContext> {
    return browser.newContext({
      viewport: DESKTOP,
      storageState: {
        cookies: [],
        origins: [
          {
            origin: WEB_URL,
            localStorage: [
              {
                name: `chobii:sale-banner-dismissed:${promotionId}`,
                value: String(dismissedAt),
              },
            ],
          },
        ],
      },
    })
  }

  /** Both legs ask the same question of the home page. */
  async function loadHome(context: BrowserContext): Promise<Page> {
    const page = await context.newPage()
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('styles-nav')).toHaveAttribute(
      'data-revealed',
      'true'
    )
    return page
  }

  test('keeps the banner away on a later visit inside the week', async ({
    browser,
  }) => {
    // Yesterday: well inside the cooldown, and far enough from the boundary
    // that a slow run cannot walk over it.
    const context = await contextDismissedAt(browser, Date.now() - 24 * 60 * 60 * 1000)

    try {
      const page = await loadHome(context)

      await expect(page.getByRole('dialog')).toHaveCount(0)
      // Suppressed, not silenced — the offer is still reachable.
      await expect(page.getByTestId('offer-rail')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('lets the banner return once the week is up', async ({ browser }) => {
    /**
     * The control for the leg above. Without it, "no banner" would also pass
     * against a component that suppressed on the mere presence of the key, and
     * the cooldown would be a constant rather than a duration.
     */
    const context = await contextDismissedAt(
      browser,
      Date.now() - COOLDOWN_MS - 24 * 60 * 60 * 1000
    )

    try {
      const page = await loadHome(context)

      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('dialog')).toContainText(HEADLINE)
      await expect(page.getByTestId('offer-rail')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
