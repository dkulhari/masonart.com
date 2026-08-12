/**
 * Seeding a guest cart for E2E specs (#359).
 *
 * `/checkout` renders nothing but "Your cart is empty" unless the cart has an
 * item, so every checkout spec has to put one there first. They used to do it
 * by writing the zustand store's `localStorage` key directly, which worked
 * while the local store was authoritative — and stopped working at #511, when
 * the SERVER cart became what checkout reads. `CartSync` now fetches it on
 * mount and calls `replaceFromServer`, which sets `items` unconditionally:
 *
 *     replaceFromServer: (cart) => { set({ items: toCartItems(cart), ... }) }
 *
 * So a localStorage-seeded item is wiped by the empty server cart a moment
 * after the page loads. Not immediately — which is why the old approach failed
 * *intermittently*, depending on whether an assertion ran before or after that
 * fetch resolved, and why `checkout.spec.ts` could report 86 failures in one
 * run and pass the same tests on a rerun.
 *
 * The fix is to seed the side of the wire that is actually authoritative.
 *
 * ## Why the POST happens inside the page
 *
 * A guest cart is identified by the httpOnly `cart_session` cookie. Issuing
 * the request from Node would put that cookie on a Playwright request context
 * the browser knows nothing about, and the page would still load an empty
 * cart. Running it through `page.evaluate` with `credentials: 'include'` means
 * the browser sends and stores the cookie itself, so the cart the page reads
 * is the cart that was seeded.
 *
 * The ticket expected to have to inject that cookie by hand. It does not: the
 * cookie survives the dev origin split (web on Vite's port, API on :3000)
 * because both are `localhost` and therefore same-site. That part of #359 —
 * CORS credentials, `SameSite`, the removed Vite proxy — no longer reproduces.
 *
 * ## Real catalogue rows, not invented ones
 *
 * `POST /api/cart/items` validates that the product is active and the variant
 * is in stock, so the ids have to be real. They are discovered once per worker
 * from the public API rather than hardcoded, so this does not rot the next
 * time the seed data changes.
 */

import { request as playwrightRequest, type Page } from '@playwright/test'

/** Where the API lives. Matches the origin the web app talks to in dev. */
export const API_URL = process.env.E2E_API_URL || 'http://localhost:3000'

/** Free shipping kicks in at ₹999, so specs need variants either side of it. */
export const FREE_SHIPPING_THRESHOLD = 999

export interface CatalogueVariant {
  productId: string
  /** The product's real title, for specs that assert what is on screen. */
  productTitle: string
  variantId: string
  /** Rupees. */
  price: number
  /** A frame this product can be bought with, when one is offered. */
  frame: { id: string; name: string } | null
}

export interface SeedCartOptions {
  /**
   * Roughly what the line should cost, in rupees.
   *
   * The nearest real variant is used, because prices come from the catalogue
   * and cannot be invented. What callers actually depend on is which side of
   * the free shipping threshold they land on, and that is preserved exactly:
   * ask for less than ₹999 and you get a variant under it.
   */
  unitPrice?: number
  quantity?: number
  /** Variant ids already used by this test, so a second line is a second row. */
  exclude?: string[]
  /** Buy it framed. Only variants whose product offers a frame are chosen. */
  withFrame?: boolean
}

/** Built once per worker — the catalogue does not change mid-run. */
let cataloguePromise: Promise<CatalogueVariant[]> | null = null

async function loadCatalogue(): Promise<CatalogueVariant[]> {
  const context = await playwrightRequest.newContext({ baseURL: API_URL })

  try {
    // Enough products to be sure of variants on both sides of the threshold
    // without fetching the whole catalogue.
    const listResponse = await context.get('/api/products?pageSize=12')
    if (!listResponse.ok()) {
      throw new Error(
        `Could not list products to seed a cart: ${listResponse.status()}`,
      )
    }

    // The list endpoint answers with `items`; the detail endpoint answers with
    // the product unwrapped. Both shapes are easy to guess wrong.
    const list = (await listResponse.json()) as {
      items?: Array<{ slug: string }>
    }
    const slugs = (list.items ?? []).map((product) => product.slug)

    const variants: CatalogueVariant[] = []

    for (const slug of slugs) {
      const detailResponse = await context.get(`/api/products/${slug}`)
      if (!detailResponse.ok()) continue

      const product = (await detailResponse.json()) as {
        id: string
        title: string
        variants?: Array<{
          id: string
          price: string
          isActive?: boolean
          isInStock?: boolean
        }>
        frames?: Array<{ id: string; name: string }>
      }

      // The detail endpoint carries the frames a product can be bought with,
      // so a framed line needs no extra request and no hardcoded frame id.
      const frame = product.frames?.[0] ?? null

      for (const variant of product.variants ?? []) {
        if (variant.isActive === false || variant.isInStock === false) continue
        variants.push({
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          price: Number(variant.price),
          frame: frame ? { id: frame.id, name: frame.name } : null,
        })
      }
    }

    if (variants.length === 0) {
      throw new Error(
        'No active, in-stock variants found, so no checkout spec can seed a cart. Is the database seeded?',
      )
    }

    return variants
  } finally {
    await context.dispose()
  }
}

function catalogue(): Promise<CatalogueVariant[]> {
  cataloguePromise ??= loadCatalogue()
  return cataloguePromise
}

/**
 * The variant closest to what the caller asked for, on the correct side of the
 * free shipping threshold.
 *
 * Staying on the right side matters more than matching the number: a spec that
 * asks for ₹500 is asking for "below the threshold", and handing it a ₹1699
 * poster would quietly invert what it is testing.
 */
async function pickVariant(
  options: SeedCartOptions,
): Promise<CatalogueVariant> {
  const all = await catalogue()
  const wanted = options.unitPrice ?? 2999
  const quantity = options.quantity ?? 1
  const excluded = new Set(options.exclude ?? [])

  const available = all.filter((v) => !excluded.has(v.variantId))
  const pool = available.length > 0 ? available : all

  const wantsBelowThreshold = wanted * quantity < FREE_SHIPPING_THRESHOLD
  const onCorrectSide = pool.filter((v) =>
    wantsBelowThreshold
      ? v.price * quantity < FREE_SHIPPING_THRESHOLD
      : v.price * quantity >= FREE_SHIPPING_THRESHOLD,
  )

  const framed = options.withFrame
    ? onCorrectSide.filter((v) => v.frame !== null)
    : onCorrectSide
  const withFrame = framed.length > 0 ? framed : onCorrectSide

  const candidates = withFrame.length > 0 ? withFrame : pool

  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.price - wanted) < Math.abs(best.price - wanted)
      ? candidate
      : best,
  )
}

export interface SeededCartLine extends CatalogueVariant {
  quantity: number
}

/**
 * Puts a real product in the guest cart the page is holding.
 *
 * The page must already be on an origin (call `page.goto` first) — `evaluate`
 * needs a document, and the cookie belongs to that browsing context.
 */
export async function seedGuestCart(
  page: Page,
  options: SeedCartOptions = {},
): Promise<SeededCartLine> {
  const variant = await pickVariant(options)
  const quantity = options.quantity ?? 1

  // Let the page's own `GET /api/cart` finish first.
  //
  // A guest with no cookie yet gets a brand new cart — and a brand new
  // `Set-Cookie` — from whichever cart request the server sees. The app fires
  // one on mount, so seeding into a page that is still loading means two carts
  // racing: ours takes the item, theirs lands afterwards and replaces the
  // cookie, and `/checkout` then reads the empty one. That is what made a
  // third of the checkout suite fail with "Your cart is empty" under load,
  // while the same tests passed on an unloaded machine.
  await page.waitForLoadState('networkidle').catch(() => {
    // A busy dev server may never go quiet. The seed is verified below either
    // way, so a missed idle window costs a retry rather than a failure.
  })

  const payload = {
    apiUrl: API_URL,
    productId: variant.productId,
    variantId: variant.variantId,
    qty: quantity,
    frameId: options.withFrame ? (variant.frame?.id ?? null) : null,
  }

  // Post, then read the cart back. Both happen in one `evaluate` so nothing
  // the page does can slip between them, and the read is what decides success:
  // a 201 only says the request was accepted by *some* cart, not that it is
  // the cart this browsing context still holds the cookie for.
  let result = await postAndReadBack(page, payload)

  if (!result.seeded) {
    // One retry, for the case above. The cookie is settled by now, so the
    // second attempt lands in the cart the page will read.
    result = await postAndReadBack(page, payload)
  }

  if (result.status !== 201 && result.status !== 200) {
    throw new Error(
      `Could not seed the guest cart (${result.status}): ${result.body}`,
    )
  }

  if (!result.seeded) {
    throw new Error(
      `Seeded variant ${variant.variantId} into the guest cart, but reading the cart back returned ${result.itemCount} item(s) without it. The cart cookie is being replaced under the seed.`,
    )
  }

  return { ...variant, quantity }
}

interface SeedPayload {
  apiUrl: string
  productId: string
  variantId: string
  qty: number
  frameId: string | null
}

async function postAndReadBack(page: Page, payload: SeedPayload) {
  return page.evaluate(
    async ({ apiUrl, productId, variantId, qty, frameId }) => {
      const response = await fetch(`${apiUrl}/api/cart/items`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          variantId,
          quantity: qty,
          ...(frameId ? { frameId } : {}),
        }),
      })
      const body = (await response.text()).slice(0, 200)

      const readBack = await fetch(`${apiUrl}/api/cart`, {
        credentials: 'include',
      })
      const cart = (await readBack.json().catch(() => ({}))) as {
        items?: Array<{ variantId?: string; variant?: { id?: string } }>
      }
      const items = cart.items ?? []

      return {
        status: response.status,
        body,
        itemCount: items.length,
        // The line carries the column; the joined variant is checked too so a
        // change to what the endpoint projects cannot turn this into a silent
        // "never seeded" that retries forever.
        seeded: items.some(
          (item) => item.variantId === variantId || item.variant?.id === variantId,
        ),
      }
    },
    payload,
  )
}

/**
 * Empties the guest cart the page is holding.
 *
 * Every test gets a fresh browser context and therefore a fresh cart cookie,
 * so this is belt and braces — but a spec that seeds twice by accident is
 * harder to debug than one extra request.
 */
export async function clearGuestCart(page: Page): Promise<void> {
  await page.evaluate(async (apiUrl) => {
    await fetch(`${apiUrl}/api/cart`, {
      method: 'DELETE',
      credentials: 'include',
    })
    // The local projection is rebuilt from the server on the next load; this
    // only stops a stale one being rendered for a frame before that happens.
    localStorage.removeItem('chobii-cart-storage')
  }, API_URL)
}

/**
 * Waits for the page to be showing the seeded cart rather than an empty one.
 *
 * The server cart is authoritative but arrives asynchronously: `CartSync`
 * fetches it after mount, so for the first frames after a load the page still
 * renders "Your cart is empty" and every assertion below races that fetch.
 * The old localStorage seeding hid this — the persisted store rendered
 * immediately (and was then overwritten). Seeding the real cart makes the wait
 * explicit instead of accidental.
 *
 * Without it the suite passes with one worker and fails intermittently with
 * two, which is the worst way for a test to be wrong.
 */
export async function waitForCartToLoad(page: Page): Promise<void> {
  // A POSITIVE signal, deliberately. Waiting for "Your cart is empty" to be
  // absent looks equivalent and is not: that text is also absent during the
  // hydration skeleton, so the wait resolves instantly and the empty state
  // appears immediately afterwards. Everything downstream then fails in a
  // rotating, irreproducible set — which is what it did.
  //
  // The order summary is rendered only once the cart has items, so its
  // heading is the first moment the page is actually showing the seeded cart.
  await page
    .locator('h2:has-text("Order Summary")')
    .first()
    // Generous, because this waits on a dev server that several agent
    // sessions may be hammering at once — a slow load is not a failure. Under
    // a parallel vitest run next door, 30s was not enough and a third of the
    // checkout suite timed out here.
    //
    // Deliberately below the specs' own 60s test timeout, so a failure reports
    // as "waiting for Order Summary" rather than as an anonymous test timeout.
    .waitFor({ state: 'visible', timeout: 45_000 })
}
