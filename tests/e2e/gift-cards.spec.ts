import { test, expect, type Page } from '@playwright/test'

import {
  seedGiftCard,
  disableGiftCard,
  giftCardBalancePaise,
  ensureShippingOption,
} from './helpers/gift-cards'

/**
 * Gift cards E2E (#563)
 *
 * The assertion that carries the feature: applying a card changes the amount
 * due and does NOT change any item price. A gift card is tender — it reduces
 * what is charged, never what things cost. If a poster's price moves when a
 * card is applied, the card has been built as a discount and the tax and
 * revenue reporting behind it are wrong.
 *
 * WHAT THIS SPEC DOES NOT COVER, deliberately:
 *
 * Completing a real Razorpay payment. No spec in this suite does — the
 * gateway modal is a cross-origin iframe. So the purchase half stops at "the
 * order exists and the payment step is reachable", and the mint-and-email
 * step that follows a real payment is covered by the API suites instead
 * (`tests/services/gift-card-delivery.test.ts`).
 *
 * Redemption is therefore seeded through the admin issue endpoint, which is
 * the one place a plaintext code is ever returned.
 */

/**
 * Serial: outstanding liability is a global sum, so a test that disables a
 * card while another is measuring the delta makes the arithmetic lie. Running
 * this file in order costs a few seconds and removes the race.
 */
test.describe.configure({ mode: 'serial' })

const giftCardInput = (page: Page) =>
  page.getByLabel(/^gift card$/i)

const amountDue = (page: Page) =>
  page.getByText('Amount due').locator('..')

/** Exact, because 'Total' is also a substring of 'Subtotal'. */
const orderTotal = (page: Page) =>
  page.getByText('Total', { exact: true }).locator('..')

/**
 * Walks the address and delivery steps so the payment button renders.
 *
 * Written defensively rather than as a fixed script: a customer with a saved
 * address skips the form entirely, and a spec that insists on filling one
 * would fail for a reason that has nothing to do with gift cards.
 */
async function advanceToPaymentStep(page: Page) {
  const fullName = page.locator('#fullName')
  if (await fullName.isVisible().catch(() => false)) {
    await fullName.fill('Gift Card Payer')
    await page.fill('#email', 'gift-card-payer@example.com')
    await page.fill('#phone', '9876543210')
    await page.fill('#addressLine1', '12 Test Street')
    await page.fill('#city', 'Mumbai')
    await page.selectOption('#state', 'Maharashtra')
    await page.fill('#postalCode', '400001')
  }

  const toDelivery = page.getByRole('button', { name: /continue to delivery/i })
  if (await toDelivery.isVisible().catch(() => false)) await toDelivery.click()

  // A delivery option has to be picked before the step will advance; the
  // options are `aria-pressed` buttons loaded from the shipping API.
  const deliveryOption = page.locator('button[aria-pressed]').first()
  await expect(deliveryOption).toBeVisible()
  await deliveryOption.click()

  const toPayment = page.getByRole('button', { name: /continue to payment/i })
  await expect(toPayment).toBeEnabled()
  await toPayment.click()
}

/**
 * Checkout with something in it.
 *
 * An empty cart renders no order summary at all, so a spec that walks
 * straight to /checkout finds no gift card control and times out looking for
 * one — which says nothing about gift cards.
 */
/**
 * A poster in the cart, then checkout — waiting for the write, not for luck.
 *
 * The click used to be followed straight by `goto('/checkout')`. That raced:
 * the POST that adds the line was still in flight, the checkout page loaded
 * against a cart that did not yet contain it, and the run failed later at the
 * pay step with nothing in the trace to explain why. Invisible on an idle
 * machine and reproducible under load, which is exactly the shape this repo
 * has hit before (#661).
 *
 * So: wait for the response, and confirm the cart actually reads back with a
 * line in it. A 201 alone proves a row was written somewhere, not that this
 * page's cart holds it.
 */
async function checkoutWithAnItem(page: Page) {
  await page.goto('/posters', { waitUntil: 'networkidle' })

  /**
   * Start from an empty cart, every time.
   *
   * These tests share one signed-in customer, so they share one server-side
   * cart, and it survives the browser context that Playwright throws away
   * between them. A gift card line left behind by "buying a gift card
   * alongside a poster" was still in the cart when this spec's checkout tests
   * ran again, and the order they built was a poster PLUS that card.
   *
   * That is what made the pay step fail one run in two or three: gift card
   * tender is capped to exclude gift card lines (#579), so a card could not
   * cover an order that contained one. The remainder was real, the server
   * asked for a gateway, none is configured in dev, and the 503 rolled the
   * whole payment back — leaving the browser on /checkout with an emptied
   * cart and no request in the trace that looked wrong (#661).
   *
   * Deleting through the page's own origin, not the absolute API URL: the
   * browser reaches the API through the Vite proxy, so a same-origin request
   * carries the session cookie and needs no CORS allowance.
   */
  await page.evaluate(async () => {
    await fetch('/api/cart', { method: 'DELETE', credentials: 'include' })
  })

  await page.locator('main a[href^="/posters/"]').first().click()

  const [added] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/cart/items') &&
        response.request().method() === 'POST',
      { timeout: 15_000 }
    ),
    page.getByRole('button', { name: /add to cart/i }).first().click(),
  ])
  expect(added.ok(), `add to cart failed: ${added.status()}`).toBe(true)

  await expect
    .poll(
      async () => {
        const cart = await page.evaluate(async () => {
          const res = await fetch('/api/cart', { credentials: 'include' })
          if (!res.ok) return 0
          const body = (await res.json()) as { items?: unknown[]; cart?: { items?: unknown[] } }
          return (body.items ?? body.cart?.items ?? []).length
        })
        return cart
      },
      {
        timeout: 15_000,
        message:
          'the cart did not hold exactly the one item this test added — a leftover line from an earlier test changes what the order costs, and silently',
      }
    )
    .toBe(1)

  await page.goto('/checkout', { waitUntil: 'networkidle' })
  await expect(giftCardInput(page)).toBeVisible()
}

test.describe('buying a gift card', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gift-cards', { waitUntil: 'networkidle' })
  })

  test('the card previews what is being bought as it is filled in', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '₹2,500' }).click()
    await page.getByLabel(/recipient.s name/i).fill('Asha')
    await page.getByLabel(/your name/i).fill('Dhruv')
    await page.getByLabel(/message/i).fill('For the empty wall')

    const preview = page.getByTestId('gift-card-preview')
    await expect(preview).toContainText('₹2,500')
    await expect(preview).toContainText('Asha')
    await expect(preview).toContainText('For the empty wall')
  })

  test('an amount outside the allowed range is refused before submitting', async ({
    page,
  }) => {
    await page.getByLabel(/custom amount/i).fill('100')
    await page.getByLabel(/recipient.s email/i).fill('friend@example.com')
    await page.getByLabel(/recipient.s name/i).fill('Friend')
    await page.getByLabel(/your name/i).fill('Dhruv')
    await page.getByRole('button', { name: /continue to payment/i }).click()

    await expect(page.getByRole('alert')).toContainText(/between ₹500 and ₹50,000/i)
  })

  test('the page states the two things a buyer would not guess', async ({
    page,
  }) => {
    // Both change whether someone buys now or waits.
    await expect(page.getByText(/never expires/i)).toBeVisible()
    await expect(page.getByText(/cannot resend it/i)).toBeVisible()
  })
})

test.describe('spending a gift card', () => {
  test('a card pays part of an order without changing what anything costs', async ({
    page,
  }) => {
    const card = await seedGiftCard(50_000)

    await checkoutWithAnItem(page)

    // What the order costs before any card is applied.
    const totalBefore = await orderTotal(page).innerText()

    await giftCardInput(page).fill(card.code)
    await page.getByRole('button', { name: /^apply$/i }).click()

    await expect(page.getByText(`•••• ${card.code.slice(-4)}`).first()).toBeVisible()
    await expect(amountDue(page)).toBeVisible()

    // The total is untouched. This is the whole point: tender, not a discount.
    const totalAfter = await orderTotal(page).innerText()
    expect(totalAfter).toBe(totalBefore)

    // And nothing was debited by merely quoting it.
    expect(await giftCardBalancePaise(card.id)).toBe(50_000)
  })

  test('a disabled code is refused, and says nothing about why', async ({
    page,
  }) => {
    const card = await seedGiftCard(50_000)
    await disableGiftCard(card.id)

    await checkoutWithAnItem(page)
    await giftCardInput(page).fill(card.code)
    await page.getByRole('button', { name: /^apply$/i }).click()

    const message = page.getByText(/cannot be used/i)
    await expect(message).toBeVisible()

    // A different message for a code that never existed would let someone
    // enumerate which codes are live.
    await giftCardInput(page).fill('ZZZZZZZZZZZZZZZZ')
    await page.getByRole('button', { name: /^apply$/i }).click()
    await expect(page.getByText(/cannot be used/i)).toBeVisible()
  })
})

/**
 * The journey that needs no gateway (#578).
 *
 * When cards cover the total, the server debits them and marks the order paid
 * in one transaction — no Razorpay order is created at all. So this is the one
 * paid journey completable in a browser today, and the one most likely to
 * break unnoticed, because it is the only path that marks an order paid
 * without a payment.
 *
 * It did break: the client never checked `fullyCoveredByGiftCard` and walked
 * on to open the gateway with `order_id: undefined`, after the cards were
 * already spent. Fixed alongside this spec.
 */
test.describe('paying entirely with a gift card', () => {
  test.use({ storageState: 'tests/.auth/customer.json' })

  test('completes without the gateway, and spends exactly the total', async ({
    page,
  }) => {
    // The ceiling on a single card is Rs 50,000, comfortably above a poster.
    const card = await seedGiftCard(5_000_000)
    await ensureShippingOption()

    await checkoutWithAnItem(page)

    const totalText = await orderTotal(page).innerText()
    const totalRupees = Number(totalText.replace(/[^0-9.]/g, ''))
    expect(totalRupees).toBeGreaterThan(0)

    await giftCardInput(page).fill(card.code)
    await page.getByRole('button', { name: /^apply$/i }).click()
    await expect(page.getByText(`•••• ${card.code.slice(-4)}`).first()).toBeVisible()

    // Nothing is owed once the card covers the lot.
    await expect(amountDue(page)).toContainText(/₹\s*0(\.00)?\b/)

    await advanceToPaymentStep(page)

    /**
     * Wait for the order POST itself, not just for the URL to change.
     *
     * The assertion below used to be the only thing watching this step, with a
     * 30-second budget. On a saturated machine order creation plus the
     * gift-card debit plus the redirect can exceed that, and the failure then
     * reads as "the gateway was reached" — the one thing this test is meant to
     * detect — when nothing of the sort happened. Waiting on the response makes
     * a slow machine slow instead of wrong, and a genuine failure loud.
     */
    const [orderResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          /\/api\/orders(\?|$)/.test(response.url()) &&
          response.request().method() === 'POST',
        { timeout: 60_000 }
      ),
      page.getByRole('button', { name: /^pay\b/i }).first().click(),
    ])
    expect(
      orderResponse.ok(),
      `order creation failed: ${orderResponse.status()}`
    ).toBe(true)

    // The order lands paid without a payment. If the gateway is reached at
    // all, its iframe appears instead and this times out — which is the
    // failure this spec exists to catch.
    /**
     * The confirmation PAGE, not merely a URL that changed.
     *
     * This assertion used to accept anything matching `/orders/`, and the app
     * redirected to `/orders/<number>?success=true` — a route that does not
     * exist. The pattern matched, the test passed, and every real customer
     * landed on "not found" immediately after paying (#661). Asserting the
     * order number is rendered is what makes this test able to see that.
     */
    await expect
      .poll(() => page.url(), {
        timeout: 60_000,
        message:
          'the order was paid but the browser never reached the confirmation page',
      })
      .toMatch(/\/checkout\/success/)

    await expect(page.getByText(/thank you|order confirmed|order placed/i).first()).toBeVisible({
      timeout: 30_000,
    })
    /**
     * Not SHOWN, rather than not present.
     *
     * The confirmation is reached by client-side navigation now, so the
     * document survives the transition and the Razorpay SDK's own hidden
     * iframe — injected when the script loads, whether or not a modal ever
     * opens — is still in the DOM. Counting elements therefore fails on a
     * checkout that correctly skipped the gateway. What the assertion means,
     * and now says, is that the customer was never shown a payment modal.
     */
    await expect(
      page.frameLocator('iframe.razorpay-checkout-frame').owner()
    ).toBeHidden()

    // Spent exactly what was owed — not the whole card, not zero.
    const spentPaise = 5_000_000 - (await giftCardBalancePaise(card.id))
    expect(spentPaise).toBe(Math.round(totalRupees * 100))
  })
})

/**
 * A gift card and a poster in one order (#579).
 *
 * This used to be impossible: `cart_items.productId` and `variantId` were NOT
 * NULL and the cart derived every line total from the product and variant
 * rows, so a gift card — no product, no variant, price the customer typed —
 * had to be an order of its own. Two purchases, two payments, two receipts.
 */
test.describe('buying a gift card alongside a poster', () => {
  test.use({ storageState: 'tests/.auth/customer.json' })

  test('puts both in one cart, and prices the card at what was typed', async ({
    page,
  }) => {
    await ensureShippingOption()

    // A poster first, so the cart is genuinely mixed.
    await page.goto('/posters', { waitUntil: 'networkidle' })
    await page.locator('main a[href^="/posters/"]').first().click()
    await page.getByRole('button', { name: /add to cart/i }).first().click()

    await page.goto('/gift-cards', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '₹2,500' }).click()
    await page.getByLabel(/recipient.s email/i).fill('friend@example.com')
    await page.getByLabel(/recipient.s name/i).fill('Asha')
    await page.getByLabel(/your name/i).fill('Dhruv')

    await page.getByRole('button', { name: /^add to cart$/i }).click()
    await expect(page.getByText(/added to your cart/i)).toBeVisible()

    await page.goto('/cart', { waitUntil: 'networkidle' })

    // The card describes itself: there is no product row to take a title from.
    const cardLine = page.getByText(/gift card — ₹2,500/i).first()
    await expect(cardLine).toBeVisible()
    await expect(page.getByText(/for asha/i).first()).toBeVisible()

    // And it is not a link to /posters/undefined.
    await expect(page.locator('a[href="/posters/undefined"]')).toHaveCount(0)
  })
})

test.describe('admin gift cards', () => {
  test.use({ storageState: 'tests/.auth/admin.json' })

  test('the outstanding liability rises by what was just issued', async ({
    page,
  }) => {
    await page.goto('/admin/gift-cards', { waitUntil: 'networkidle' })

    const readLiability = async () => {
      const text = await page.getByTestId('gift-card-liability').innerText()
      return Number(text.replace(/[^0-9.]/g, ''))
    }

    const before = await readLiability()
    await seedGiftCard(100_000)

    await page.reload({ waitUntil: 'networkidle' })
    const after = await readLiability()

    expect(after - before).toBeCloseTo(1000, 1)
  })

  test('a card can be found by its last four, and no code is shown', async ({
    page,
  }) => {
    const card = await seedGiftCard(50_000)

    await page.goto('/admin/gift-cards', { waitUntil: 'networkidle' })
    await page.getByLabel(/search gift cards/i).fill(card.code.slice(-4))
    await page.getByRole('button', { name: /^search$/i }).click()

    await expect(page.getByText(`•••• ${card.code.slice(-4)}`).first()).toBeVisible()

    // Search takes a code in; it must never hand one back out.
    await expect(page.locator('body')).not.toContainText(card.code)
  })
})
