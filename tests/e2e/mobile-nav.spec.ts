/**
 * Mobile navigation drawer tests (ticket #348).
 *
 * The mobile menu was a bare <nav> rendered inside the sticky header, so it
 * inherited the header's translucent `bg-background/60` + backdrop-blur. That
 * reads fine across a 64px header strip, but the expanded menu is ~360px tall
 * and sat over vivid page content — on the home page the saturated "Shop by
 * Style" cards showed straight through and the nav labels were barely legible.
 *
 * It also had none of the things a drawer needs: no scrim, no scroll lock, no
 * Escape handling, no dialog semantics.
 *
 * The /posters filter drawer already implements all of this correctly; these
 * tests hold the header to the same bar.
 */

import { test, expect, type Page } from '@playwright/test'

const IPHONE = { width: 390, height: 844 }

async function openMenu(page: Page) {
  await page.setViewportSize(IPHONE)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  // The toggle is server-rendered, so it is clickable before React has
  // hydrated — an early click lands on inert markup and the menu never
  // opens. Retry until the button reports it actually expanded.
  await expect(async () => {
    await page.getByRole('button', { name: /open menu/i }).click()
    await expect(
      page.getByRole('button', { name: /close menu/i })
    ).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 })
  }).toPass({ timeout: 15000 })
}

/** The drawer panel — the element that must be opaque. */
function panel(page: Page) {
  return page.locator('[role="dialog"][aria-label*="menu" i]')
}

test.describe('mobile nav drawer', () => {
  test('panel is fully opaque so page content cannot bleed through', async ({
    page,
  }) => {
    await openMenu(page)

    const alpha = await panel(page).evaluate((el) => {
      const bg = getComputedStyle(el).backgroundColor
      const match = bg.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(',').map((p) => parseFloat(p))
      return parts.length === 4 ? parts[3] : 1
    })

    expect(alpha, 'drawer background must be fully opaque').toBe(1)
  })

  test('a scrim covers the page behind the drawer', async ({ page }) => {
    await openMenu(page)

    const scrim = page.locator('[data-testid="mobile-nav-scrim"]')
    await expect(scrim).toBeVisible()
  })

  test('tapping the scrim closes the drawer', async ({ page }) => {
    await openMenu(page)
    await expect(panel(page)).toBeVisible()

    await page.locator('[data-testid="mobile-nav-scrim"]').click()

    await expect(panel(page)).toBeHidden()
  })

  test('Escape closes the drawer', async ({ page }) => {
    await openMenu(page)
    await expect(panel(page)).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(panel(page)).toBeHidden()
  })

  test('body scroll is locked while the drawer is open', async ({ page }) => {
    await openMenu(page)

    const overflow = await page.evaluate(
      () => getComputedStyle(document.body).overflow
    )
    expect(overflow).toBe('hidden')
  })

  test('body scroll is restored after closing', async ({ page }) => {
    await openMenu(page)
    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()

    const overflow = await page.evaluate(
      () => getComputedStyle(document.body).overflow
    )
    expect(overflow).not.toBe('hidden')
  })

  test('drawer exposes dialog semantics', async ({ page }) => {
    await openMenu(page)

    await expect(panel(page)).toHaveAttribute('aria-modal', 'true')
  })

  test('navigation links are reachable inside the drawer', async ({ page }) => {
    await openMenu(page)

    // Guard against a vacuous suite: if the drawer ever renders empty, the
    // opacity and semantics assertions above would still pass.
    for (const label of ['Posters', 'Gallery', 'About']) {
      await expect(
        panel(page).getByRole('link', { name: label, exact: true })
      ).toBeVisible()
    }
  })
})
