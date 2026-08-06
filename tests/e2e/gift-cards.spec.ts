import { test, expect, type Page } from '@playwright/test'

import {
  seedGiftCard,
  disableGiftCard,
  giftCardBalancePaise,
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
 * Checkout with something in it.
 *
 * An empty cart renders no order summary at all, so a spec that walks
 * straight to /checkout finds no gift card control and times out looking for
 * one — which says nothing about gift cards.
 */
async function checkoutWithAnItem(page: Page) {
  await page.goto('/posters', { waitUntil: 'networkidle' })
  await page.locator('main a[href^="/posters/"]').first().click()
  await page.getByRole('button', { name: /add to cart/i }).first().click()
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
