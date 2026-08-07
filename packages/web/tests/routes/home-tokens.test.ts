/**
 * Home page — monochrome system compliance.
 *
 * Source-level rather than rendered: the route module calls createFileRoute and
 * a TanStack server function at module scope, so it cannot be imported into a
 * jsdom test without a router. What is under test here is which classes the
 * file reaches for, and the source answers that directly.
 *
 * The home page carried the loudest surviving piece of the retired orange
 * identity — a brand gradient, two blur blobs, a gradient-text H1 and an amber
 * badge — which is why it gets its own guard on top of the repo-wide one.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(process.cwd(), 'app/routes/index.tsx'), 'utf8')

describe('home page — monochrome system', () => {
  it('has no gradient background on any section', () => {
    expect(src).not.toContain('bg-gradient-to-br from-brand')
    expect(src).not.toContain('gradient-text')
  })

  it('has no blur blobs', () => {
    expect(src).not.toContain('blur-3xl')
  })

  it('reaches for no orange brand utilities', () => {
    expect(src).not.toMatch(/\b(bg|text|border|from|to)-brand-/)
  })

  it('uses the rating token rather than a hardcoded yellow', () => {
    // The route no longer draws stars of its own — the hero's invented
    // "4.9/5 from 2,000+ reviews" strip went with HeroSection (#529) and real
    // ratings now come from ProductCard inside the rails. What survives is the
    // guard: if a star ever comes back into this file it uses the token.
    expect(src).not.toContain('fill-yellow-400')
  })

  it('has no font-bold (weight 700 is never loaded)', () => {
    expect(src).not.toContain('font-bold')
  })
})

describe('home page — shared primitives', () => {
  it('uses SectionBand for its sections', () => {
    expect(src).toContain("from '~/components/ui/SectionBand'")
  })

  it('uses DisplayHeading for its display headings', () => {
    expect(src).toContain("from '~/components/ui/DisplayHeading'")
  })

  it('uses the shared Button rather than an inline pill', () => {
    // Every anchor CTA left this file with the bands that owned them; the
    // newsletter submit is the one control the route still renders itself.
    expect(src).toContain("from '~/components/ui/Button'")
    expect(src).not.toContain('rounded-lg bg-primary')
  })
})

describe('home page — the route is an order, not a layout', () => {
  /**
   * The home-page-parity integration moved every band out of this file and
   * into `~/components/home/`. The route's remaining job is the running order
   * plus the two SSR rail fetches, so what is worth pinning here is that the
   * bands are mounted and that none of the superseded inline sections came
   * back.
   */
  const BANDS = [
    'HomeHero',
    'BestSellersRail',
    'PopularCategoriesSection',
    'ShopByRoomBand',
    'PromoTilesSection',
    'NewInRail',
    'ShopByOrientationSection',
    'CustomerReviewsSection',
    'BrandStorySection',
    'TrustIconsRow',
  ]

  it.each(BANDS)('mounts %s', (band) => {
    expect(src).toContain(`<${band} `)
  })

  it('mounts them in the reference order', () => {
    const positions = BANDS.map((band) => src.indexOf(`<${band} `))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('closes with the trust row, immediately before the footer', () => {
    // TrustIconsRow (#539) replaced both the "Why Choose chobii.art?" card row
    // that used to live here and the duplicate USP strip inside Footer.tsx.
    // It is the last band on the page; nothing may be appended after it.
    expect(src.lastIndexOf('<TrustIconsRow ')).toBeGreaterThan(
      src.lastIndexOf('<NewsletterSection ')
    )
  })

  it('defines none of the superseded sections inline any more', () => {
    for (const gone of [
      'function HeroSection',
      'function FeaturedProductsSection',
      'function CategoriesSection',
      'function AIGeneratorSection',
      'function ValuePropsSection',
    ]) {
      expect(src).not.toContain(gone)
    }
  })

  it('has no inverted band — nothing on the reference is', () => {
    // The black AI-generator band retired into the Custom Art promo tile
    // (#538/#533). A full-width near-black section would be the loudest object
    // on the page and would break the white/beige alternation.
    expect(src).not.toContain('tone="ink"')
  })
})
