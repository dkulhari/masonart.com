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

  it('keeps the role-aware staff entry (#362)', () => {
    expect(src).toContain('staffAreaLabel')
    expect(src).toContain('staffAreaHref')
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
})

describe('vocabulary size', () => {
  it('has twelve styles to render', () => {
    expect(STYLE_OPTIONS).toHaveLength(12)
  })
})
