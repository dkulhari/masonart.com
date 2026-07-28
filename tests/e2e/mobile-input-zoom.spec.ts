/**
 * Mobile input font-size tests (ticket #349).
 *
 * iOS Safari auto-zooms the viewport whenever a focused form control has a
 * computed font-size below 16px, and it does NOT zoom back out on blur. Every
 * field in the app was 14px, so tapping any input left the user pinch-zoomed
 * — worst on checkout, where they tab through ten fields in a row.
 *
 * These tests assert the floor at mobile widths and that desktop is untouched.
 */

import { test, expect, type Page } from '@playwright/test'

const IPHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

/**
 * Pages that carry user-facing form controls.
 *
 * /checkout is deliberately absent: it short-circuits to "Your cart is empty"
 * without a seeded cart, so an assertion here would pass against a page with
 * no form on it. Checkout's fields are covered by checkout-autofill.spec.ts,
 * which seeds the cart first.
 */
const FORM_PAGES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/create',
  '/track',
]

/**
 * Collect every visible form control whose computed font-size is under 16px.
 * Checkboxes and radios are excluded — they render no text, so iOS does not
 * zoom for them.
 */
async function auditControls(page: Page) {
  return page.evaluate(() => {
    const offenders: Array<{ tag: string; name: string; fontSize: string }> = []
    let visibleCount = 0
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      const input = el as HTMLInputElement
      if (input.type === 'checkbox' || input.type === 'radio') return
      if (input.offsetParent === null) return // not visible
      visibleCount++
      const fontSize = getComputedStyle(input).fontSize
      if (parseFloat(fontSize) < 16) {
        offenders.push({
          tag: input.tagName.toLowerCase(),
          name: input.name || input.id || input.placeholder || input.type,
          fontSize,
        })
      }
    })
    return { offenders, visibleCount }
  })
}

test.describe('mobile form controls', () => {
  for (const path of FORM_PAGES) {
    test(`no control under 16px on ${path}`, async ({ page }) => {
      await page.setViewportSize(IPHONE)
      await page.goto(path, { waitUntil: 'domcontentloaded' })

      const { offenders, visibleCount } = await auditControls(page)

      // Guard against a vacuous pass: a page that renders no controls at all
      // (redirect, empty state, dev-server mismatch) would otherwise report
      // zero offenders and look green.
      expect(visibleCount, `${path} rendered no form controls to audit`).toBeGreaterThan(0)

      expect(
        offenders,
        `iOS will auto-zoom on these ${path} controls: ${JSON.stringify(offenders)}`
      ).toEqual([])
    })
  }

  test('footer newsletter input is 16px on mobile', async ({ page }) => {
    await page.setViewportSize(IPHONE)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const fontSize = await page
      .locator('footer input[type="email"]')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize)

    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(16)
  })

  test('desktop keeps the smaller 14px field styling', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })

    const fontSize = await page
      .locator('input[type="email"]')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize)

    expect(parseFloat(fontSize)).toBeLessThan(16)
  })
})
