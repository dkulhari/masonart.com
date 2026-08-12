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

  it('wraps the styles row rather than scrolling it off-screen', () => {
    // Twelve links overflow a laptop. Scrolled sideways they hide their own
    // tail — with scrollbar-hide there was not even a scrollbar to hint that
    // more existed. Wrapped, every style stays reachable at every width.
    //
    // Scoped to this row: the pages row above it still scrolls, which is a
    // separate call about a six-link list.
    const start = src.indexOf('data-testid="styles-nav"')
    const stylesRow = src.slice(start, src.indexOf('</nav>', start))

    expect(stylesRow).toMatch(/flex-wrap/)
    expect(stylesRow).not.toMatch(/overflow-x-auto|scrollbar-hide/)
  })

  it('centres the wrapped lines and sets them in full-strength ink', () => {
    const start = src.indexOf('data-testid="styles-nav"')
    const stylesRow = src.slice(start, src.indexOf('</nav>', start))

    // A part-full second line hanging off the left edge reads as a mistake.
    expect(stylesRow).toMatch(/justify-center/)
    // rgb(23,23,23) on theirs. This row has no active state, so full
    // foreground costs no signal — unlike the pages row above it.
    expect(stylesRow).toMatch(/text-foreground/)
    expect(stylesRow).not.toMatch(/text-muted-foreground/)
  })
})

describe('mobile top bar parity (#596)', () => {
  // Measured live on mesonart at mobile width: a 56px bar, [hamburger][search]
  // left, wordmark absolutely centred, [wishlist][cart] right. Ours was a 64px
  // bar with a LEFT wordmark and cart + hamburger only — no search, no
  // wishlist, which is the first thing that reads as a different site.
  const leftStart = src.indexOf('data-testid="mobile-bar-left"')
  const rightStart = src.indexOf('data-testid="mobile-bar-right"')
  const headerClose = src.indexOf('</header>')
  // Each cluster to its OWN closing tag. Slicing from one testid to the next
  // spans the desktop block that sits between them, which is where the
  // Account link this file asserts against still lives.
  const leftCluster = src.slice(leftStart, src.indexOf('</div>', leftStart))
  const rightCluster = src.slice(rightStart, src.indexOf('</div>', rightStart))

  it('stands 56px tall on a phone and 64 from md up', () => {
    // md keeps h-16 because HEADER_HEIGHT_CLASS is the number the collection
    // toolbar pins against — and nothing sticky sits under the bar below md,
    // so the mobile row is free to shrink on its own.
    expect(src).toMatch(/className="relative flex h-14 [^"]*md:h-16/)
  })

  it('centres the wordmark at every width, not only from md', () => {
    expect(src).toMatch(/className="absolute left-1\/2 [^"]*-translate-x-1\/2/)
    expect(src).not.toContain('md:absolute md:left-1/2')
  })

  it('has both mobile clusters, left before right', () => {
    expect(leftStart).toBeGreaterThan(-1)
    expect(rightStart).toBeGreaterThan(leftStart)
    expect(headerClose).toBeGreaterThan(rightStart)
  })

  it('puts the hamburger and search on the left', () => {
    expect(leftCluster).toContain('toggleMobileMenu')
    expect(leftCluster).toContain('setIsSearchOpen(true)')
  })

  it('puts the wishlist and the cart on the right', () => {
    expect(rightCluster).toMatch(/to="\/wishlist"/)
    expect(rightCluster).toContain('displayWishlistCount')
    expect(rightCluster).toContain('openCartDrawer')
    expect(rightCluster).toContain('displayCartCount')
  })

  it('keeps Account out of the bar — it lives in the dock and the drawer', () => {
    // Six icons in a 56px bar is theirs minus one; mesonart has no account
    // icon up here either. MobileTabBar carries it.
    expect(leftCluster).not.toMatch(/to="\/account"/)
    expect(rightCluster).not.toMatch(/to="\/account"/)
  })

  // The "drop the drawer at 56px rather than 64" assertion that used to live
  // here is superseded by #598: the drawer is no longer a panel hanging off
  // the bottom of the bar at all, it is a full-height panel sliding in from
  // the left edge. See the drawer container block below.
})

describe('mobile drawer container (#598)', () => {
  // Measured on mesonart: `drawer__inner` is width:100%, max-width:576px,
  // full viewport height, entering from x = -576 under
  // `transform .6s cubic-bezier(0.7, 0, 0.2, 1)`. Ours dropped from under the
  // header at full width instead — a top dropdown, not a drawer.
  const start = src.indexOf('data-testid="mobile-nav-drawer"')
  const drawer = src.slice(start, src.indexOf('</nav>', start))

  it('renders the drawer panel', () => {
    expect(start).toBeGreaterThan(-1)
  })

  it('pins the panel to the left edge for the full viewport height', () => {
    expect(drawer).toContain('fixed inset-y-0 left-0')
    // A panel hanging off the bar is the shape being replaced.
    expect(drawer).not.toMatch(/top-14|top-16/)
    expect(drawer).not.toContain('max-h-[calc(100vh-3.5rem)]')
  })

  it('is full width up to mesonart’s 576px cap', () => {
    expect(drawer).toMatch(/w-full/)
    expect(drawer).toContain('max-w-[576px]')
  })

  it('slides in from off the left edge rather than mounting in place', () => {
    // Mounted only while open there is nothing to transition from, so the
    // panel has to stay mounted and move.
    expect(drawer).toContain('-translate-x-full')
    expect(drawer).toContain('translate-x-0')
    expect(drawer).toContain('transition-transform')
  })

  it('takes the closed panel out of the tab order', () => {
    // Translated off-screen it is still focusable; `invisible` is what
    // removes it without deleting the animation (same call as the nav rows).
    expect(drawer).toContain('invisible')
  })

  it('carries mesonart’s 600ms easing', () => {
    expect(drawer).toContain('cubic-bezier(0.7, 0, 0.2, 1)')
    expect(drawer).toMatch(/duration-\[600ms\]/)
    expect(drawer).toContain('motion-reduce:transition-none')
  })

  it('has a close control of its own', () => {
    // The bar’s hamburger is under the panel once it is open, so the panel
    // needs its own way out. Named distinctly from the dock toggle’s
    // "Close menu" so neither test nor screen reader has two of the same.
    expect(drawer).toContain('Close site menu')
  })

  it('scrolls the link list inside the panel, not the panel itself', () => {
    // The footer stays pinned on theirs; a panel that scrolls whole would
    // take it with it.
    expect(drawer).toContain('overflow-y-auto')
    expect(drawer).toMatch(/flex-1/)
  })

  it('covers the whole viewport with the scrim, not just below the bar', () => {
    const scrimStart = src.indexOf('data-testid="mobile-nav-scrim"')
    const scrim = src.slice(scrimStart, src.indexOf('/>', scrimStart))
    expect(scrim).toContain('fixed inset-0')
    expect(scrim).not.toContain('top-14')
  })

  it('keeps the panel above the header, which is z-50 and sticky', () => {
    expect(drawer).toContain('z-50')
    const headerClose = src.indexOf('</header>')
    expect(start).toBeGreaterThan(headerClose)
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
