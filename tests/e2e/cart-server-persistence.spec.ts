import { test, expect } from '@playwright/test'

/**
 * The cart survives a reload, because it lives on the server (#511).
 *
 * The bug this pins: every cart write went to localStorage
 * (`packages/web/app/stores/cart.ts`, pre-#511, had a synchronous
 * `addItem: (input) => void` with no `fetch` in the file at all) while
 * `POST /api/orders` built the order from the database cart — so checkout
 * failed with "No active cart found". Nothing caught it: `tests/e2e/
 * payment.spec.ts` fulfils `POST /api/orders` from a `page.route` stub, and
 * every `packages/api/tests/routes/` suite mocks `db`.
 *
 * So: no route stubs in this file. It talks to the real API server
 * (`http://localhost:3000` by default — override with `E2E_API_URL`) and the
 * real database behind it. If `useCartActions.addItem` (packages/web/app/
 * hooks/useCartActions.ts) ever regresses to a local-only write, the
 * `waitForResponse` below times out and this test fails.
 */

const API_URL = process.env.E2E_API_URL || 'http://localhost:3000'

test.describe('cart persistence', () => {
  test('an added item is on the server, not just in localStorage', async ({
    page,
  }) => {
    // Fresh context per test (no storageState on the `chromium` project), so
    // this is a guest with an empty cart and no `cart_session` cookie yet.
    await page.goto('/posters', { waitUntil: 'networkidle' })

    // Same navigation pattern as tests/e2e/product-detail.spec.ts: the card's
    // own testid isn't a link, the title inside it is.
    const productLinks = page.locator('a[href^="/posters/"]')
    await expect(productLinks.first()).toBeVisible()
    await productLinks.first().click()
    await page.waitForLoadState('networkidle')

    // Scoped to the buy panel: the "Visually Similar Artworks" carousel at
    // the foot of the same page renders more ProductCards, and a bare
    // `button:has-text("Add to Cart")` would be a strict-mode violation the
    // moment one of those cards' Quickview happens to be open. Selector
    // confirmed against tests/e2e/product-detail.spec.ts.
    const buyPanel = page.getByTestId('buy-panel')
    const addToCartButton = buyPanel.locator('button:has-text("Add to Cart")')
    await expect(addToCartButton).toBeEnabled()

    // Registered before the click so there is no race between the request
    // firing and this listener being armed.
    const addRequest = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/api/cart/items` &&
        response.request().method() === 'POST'
    )

    await addToCartButton.click()

    // Proof #1: the add is a real network round trip to the real API, not a
    // local store mutation — and the server accepted it.
    const response = await addRequest
    expect(response.status()).toBe(201)
    const added = await response.json()
    const addedQuantity: number = added.item?.quantity
    expect(addedQuantity).toBeGreaterThan(0)

    // Proof #2: the item is still there after a full reload — which
    // localStorage alone could also produce, so the assertion below is on
    // the server's own answer (`GET /api/cart`), never on rendered UI.
    await page.reload({ waitUntil: 'networkidle' })

    const cart = await page.request.get(`${API_URL}/api/cart`)
    expect(cart.ok()).toBeTruthy()
    const cartBody = await cart.json()

    expect(cartBody.itemCount).toBeGreaterThan(0)
    expect(cartBody.items.length).toBeGreaterThan(0)

    // Proof #3: it's the *same* cart, not just a non-empty one — the count
    // the server reports after reload matches what was actually added.
    expect(cartBody.itemCount).toBe(addedQuantity)
  })
})
