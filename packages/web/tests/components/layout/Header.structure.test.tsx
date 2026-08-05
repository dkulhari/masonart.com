/**
 * Header structure — mesonart's shape (analysis §1.1).
 *
 * Source-level: the header calls `useRouteContext({ from: '__root__' })`, so
 * rendering it needs a router. What is under test is structure and the
 * behaviours a restructure is liable to delete.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STYLE_OPTIONS } from '@chobii/shared'
import { SORT_OPTIONS } from '~/components/product/CollectionToolbar'

const src = readFileSync(
  join(process.cwd(), 'app/components/layout/Header.tsx'),
  'utf8'
)

describe('three-row structure', () => {
  it('centres the wordmark on desktop', () => {
    expect(src).toMatch(/justify-center|absolute left-1\/2/)
  })

  it('has a styles nav row fed from the shared vocabulary', () => {
    // Hardcoding twelve links here would restart exactly the drift #395
    // ended.
    expect(src).toContain('@chobii/shared')
    expect(src).toContain('STYLE_OPTIONS')
  })

  it('links each style at the validated filter param', () => {
    expect(src).toContain('/posters')
    expect(src).toMatch(/styles:/)
  })

  it('scrolls the styles row rather than wrapping it to three lines', () => {
    // Twelve links overflow a laptop.
    expect(src).toMatch(/overflow-x-auto|scrollbar-hide/)
  })
})

describe('behaviour a restructure must not delete', () => {
  it('keeps the mobile drawer scroll-lock and Escape (#348)', () => {
    expect(src).toContain("document.body.style.overflow = 'hidden'")
    expect(src).toContain("event.key === 'Escape'")
  })

  it('keeps the scrim as a SIBLING of header, not a child (#348)', () => {
    // The header sets backdrop-blur, which establishes a containing block —
    // a fixed scrim nested inside collapses to zero height.
    expect(src).toContain('data-testid="mobile-nav-scrim"')
    const headerClose = src.indexOf('</header>')
    const scrim = src.indexOf('data-testid="mobile-nav-scrim"')
    expect(scrim).toBeGreaterThan(headerClose)
  })

  it('keeps the cart item count in the aria-label (#248)', () => {
    expect(src).toContain('Shopping cart${')
  })

  it('opens the cart drawer rather than routing to /cart (#460)', () => {
    // Both the desktop cluster and the mobile bar trigger the drawer; /cart
    // stays routable, but nothing in the header links to it any more.
    expect(src).toContain('openCartDrawer')
    expect(src).not.toMatch(/to="\/cart"/)
  })

  it('keeps the role-aware staff entry (#362)', () => {
    expect(src).toContain('staffAreaLabel')
    expect(src).toContain('staffAreaHref')
  })

  it('points the heart at the wishlist page, not the account area (#422)', () => {
    // The heart pointed at /account while the destination was unbuilt. The
    // page is public, so this link works signed out too.
    expect(src).toMatch(/to="\/wishlist"/)
  })

  it('keeps both badges hydration-gated (#389 / #498)', () => {
    expect(src).toContain('displayCartCount')
    expect(src).toContain('displayWishlistCount')
    expect(src).toMatch(/isHydrated \? cartItemCount : 0/)
    expect(src).toMatch(/isHydrated \? wishlistCount : 0/)
  })
})

describe('the sticky offset contract', () => {
  it('declares the header height the collection toolbar offsets against', () => {
    // CollectionToolbar is `sticky top-16`. If the header grows past 4rem and
    // nothing moves, the toolbar hides behind it.
    expect(src).toContain('HEADER_HEIGHT_CLASS')
  })

  it('keeps the sticky box one row tall even while revealing (#421)', () => {
    // The reveal must not grow the sticky box: `h-16` is the number the
    // toolbar pins against, and #401 is what happens when the two drift.
    expect(src).toMatch(/HEADER_HEIGHT_CLASS = 'h-16'/)
  })
})

describe('scroll reveal (#421)', () => {
  it('drives the rows off scroll direction, not scroll position', () => {
    // Position alone ("show under 100px") strands the nav until the user
    // drags all the way back to the top.
    expect(src).toContain('useNavReveal')
    expect(src).toContain('isNavRevealed')
  })

  it('collapses and reveals both nav rows together', () => {
    // The compact bar is wordmark + actions; the pages row goes with the
    // styles row, not on its own schedule.
    expect(src).toContain('data-testid="pages-nav"')
    expect(src).toContain('data-testid="styles-nav"')
    expect(src.match(/data-revealed=\{isNavRevealed\}/g) ?? []).toHaveLength(2)
  })

  it('sticks the styles row under the compact bar so it can return mid-page', () => {
    // Left in normal flow it can only ever come back at the top of the page.
    expect(src).toMatch(/sticky top-16/)
  })

  it('takes the collapsed rows out of the tab order', () => {
    // A row translated out of sight is still focusable; `invisible` is what
    // removes it from the tab order without deleting the animation.
    expect(src).toContain('invisible')
  })

  it('respects prefers-reduced-motion', () => {
    expect(src).toContain('motion-reduce:transition-none')
  })

  it('publishes the measured chrome height for what sticks below it', () => {
    // Otherwise the revealed rows land on top of the collection toolbar and
    // take the Hide-filters button with them. Measured on the wrapper, so a
    // second nav row does not need a second number.
    expect(src).toContain('useChromeOffset')
    expect(src).toContain('navRowsRef')
  })

  it('keeps both nav rows OUTSIDE <header> (#401)', () => {
    // Inside the sticky box they stand the header ~140px tall and swallow the
    // collection toolbar — the exact regression #401 fixed.
    const headerClose = src.indexOf('</header>')
    expect(src.indexOf('data-testid="styles-nav"')).toBeGreaterThan(headerClose)
    expect(src.indexOf('data-testid="pages-nav"')).toBeGreaterThan(headerClose)
  })
})

describe('pages row sits below the wordmark line', () => {
  // It used to share the 64px bar with the wordmark and the cart, which
  // capped it at four links. Its own row is what makes room for the rest of
  // the §3.5 page inventory.
  it('renders the pages row after the compact bar closes', () => {
    const barClose = src.indexOf('</header>')
    expect(src.indexOf('data-testid="pages-nav"')).toBeGreaterThan(barClose)
  })

  it('puts pages above styles', () => {
    expect(src.indexOf('data-testid="pages-nav"')).toBeLessThan(
      src.indexOf('data-testid="styles-nav"')
    )
  })

  it('carries Best Sellers and New In as sorts, not as pages', () => {
    // Neither needs a route of its own — both are /posters under a sort the
    // toolbar already offers.
    expect(src).toContain('Best Sellers')
    expect(src).toContain('New In')
    expect(src).toContain('BEST_SELLERS_SEARCH')
    expect(src).toContain('NEW_IN_SEARCH')
  })

  it('spells those sorts the way SORT_OPTIONS does', () => {
    // The nav and the sort dropdown must not disagree about what "Best
    // selling" means. SORT_OPTIONS ids are `sortBy-sortOrder`.
    const ids = SORT_OPTIONS.map((option) => option.id)
    expect(ids).toContain('salesCount-desc')
    expect(ids).toContain('createdAt-desc')
    expect(src).toMatch(/BEST_SELLERS_SEARCH = \{ sortBy: 'salesCount', sortOrder: 'desc' \}/)
    expect(src).toMatch(/NEW_IN_SEARCH = \{ sortBy: 'createdAt', sortOrder: 'desc' \}/)
  })

  it('pushes the actions cluster right now that nothing else is in flow', () => {
    // The wordmark is absolutely centred at md, so `justify-between` alone
    // would strand the actions at the left edge.
    expect(src).toContain('md:justify-end')
  })
})

describe('vocabulary size', () => {
  it('has twelve styles to render', () => {
    expect(STYLE_OPTIONS).toHaveLength(12)
  })
})
