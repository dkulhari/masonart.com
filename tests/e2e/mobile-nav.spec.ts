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

/**
 * Wide enough that the 576px drawer does not cover the whole screen (#598).
 * On a phone it does — mesonart's panel is `width:100%; max-width:576px`, so
 * below 576 there is no scrim left showing to tap.
 */
const NARROW_TABLET = { width: 740, height: 900 }

async function openMenu(page: Page, viewport = IPHONE) {
  await page.setViewportSize(viewport)
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

  // The panel takes 600ms to arrive (#598). Measuring anything mid-slide
  // reads a transient x — settle on the left edge first.
  await expect
    .poll(async () => (await panel(page).boundingBox())?.x)
    .toBeGreaterThanOrEqual(0)
}

/** The drawer panel — the element that must be opaque. */
function panel(page: Page) {
  return page.locator('[role="dialog"][aria-label*="menu" i]')
}

/**
 * The first level of the drawer. Scoped rather than searching the whole
 * panel: the All Art panel below it carries the same twelve styles, so an
 * unscoped `getByRole('link', {name: 'Pop Art'})` matches twice (#599).
 */
function list(page: Page) {
  return page.locator('[data-testid="mobile-nav-list"]')
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
    // At phone width the panel covers the scrim entirely, so this is a
    // tablet-width behaviour — the drawer caps at 576px and everything to the
    // right of it is scrim.
    await openMenu(page, NARROW_TABLET)
    await expect(panel(page)).toBeVisible()

    await page
      .locator('[data-testid="mobile-nav-scrim"]')
      .click({ position: { x: 700, y: 400 } })

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
    //
    // "Posters" is deliberately not in this list any more (#599): All Art
    // took that slot, the way mesonart's drawer has it, and the unfiltered
    // catalogue lives one level down inside its panel.
    for (const label of ['Gallery', 'Reviews', 'About']) {
      await expect(
        list(page).getByRole('link', { name: label, exact: true })
      ).toBeVisible()
    }
  })

  test('the twelve styles are reachable from the drawer (#599)', async ({
    page,
  }) => {
    await openMenu(page)

    // None of them were on a phone before — the styles row is desktop-only.
    const popArt = list(page).getByRole('link', {
      name: 'Pop Art',
      exact: true,
    })
    await expect(popArt).toBeVisible()
    await expect(popArt).toHaveAttribute('href', /styles=pop-art/)

    // 24px/300, measured on theirs.
    const size = await popArt.evaluate((el) => {
      const style = getComputedStyle(el)
      return { fontSize: style.fontSize, weight: style.fontWeight }
    })
    expect(size).toEqual({ fontSize: '24px', weight: '300' })
  })

  test('All Art opens a second panel over the list (#599)', async ({
    page,
  }) => {
    await openMenu(page)

    const allArtPanel = page.locator(
      '[data-testid="mobile-nav-all-art-panel"]'
    )
    await expect(allArtPanel).toBeHidden()

    await page.locator('[data-testid="mobile-nav-all-art"]').click()
    await expect(allArtPanel).toBeVisible()

    // The whole facet vocabulary, not just the styles that are already on
    // the level above.
    await expect(
      allArtPanel.getByRole('link', { name: 'Orientation', exact: true })
    ).toHaveCount(0)
    await expect(allArtPanel.getByText('Orientation')).toBeVisible()
    await expect(
      allArtPanel.getByRole('link', { name: 'Subject', exact: true })
    ).toHaveCount(0)

    // Back returns to the list rather than closing the drawer.
    await allArtPanel.getByRole('button', { name: /back to menu/i }).click()
    await expect(allArtPanel).toBeHidden()
    await expect(panel(page)).toBeVisible()
  })

  test('the footer stays pinned while the list scrolls (#600)', async ({
    page,
  }) => {
    await openMenu(page)

    const footer = page.locator('[data-testid="mobile-nav-footer"]')
    await expect(footer).toBeVisible()
    const before = await footer.boundingBox()

    // Twenty-odd rows: the list has somewhere to go.
    await list(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect
      .poll(async () => list(page).evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)

    expect(await footer.boundingBox()).toEqual(before)
  })

  test('the footer offers login with the round trip pre-filled (#600)', async ({
    page,
  }) => {
    // This project runs signed out, which is the branch with the redirect.
    await openMenu(page)

    const footer = page.locator('[data-testid="mobile-nav-footer"]')
    const login = footer.getByRole('link', { name: /log in/i })
    await expect(login).toBeVisible()
    await expect(login).toHaveAttribute('href', /\/auth\/login\?redirect=/)

    // The same accounts as the page footer, named for a screen reader.
    for (const label of ['Instagram', 'Facebook', 'Twitter']) {
      await expect(footer.getByRole('link', { name: label })).toBeVisible()
    }
  })

  test('Escape unwinds All Art before the drawer (#599)', async ({ page }) => {
    await openMenu(page)
    await page.locator('[data-testid="mobile-nav-all-art"]').click()

    const allArtPanel = page.locator(
      '[data-testid="mobile-nav-all-art-panel"]'
    )
    await expect(allArtPanel).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(allArtPanel).toBeHidden()
    await expect(panel(page)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
  })
})
