/**
 * Product and review surfaces — monochrome system compliance.
 *
 * These are the components that sit directly next to artwork, which is where a
 * stray brand colour reads worst: an orange "Featured" chip and a purple "AI"
 * chip over a muted print (parity analysis 3.3).
 *
 * The "untouchable" block at the bottom guards the product-grid-alignment
 * contract (#360-#375). The square-media contract, the mat colour and the
 * `grow`-based row alignment are load-bearing and covered by E2E; a restyle
 * must not disturb them.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const card = read('app/components/product/ProductCard.tsx')

describe('ProductCard — monochrome badges', () => {
  it('the Featured badge is no longer brand orange', () => {
    expect(card).not.toContain('bg-brand-500')
    expect(card).toContain('bg-foreground')
  })

  it('the AI badge is no longer purple', () => {
    expect(card).not.toContain('bg-purple-500')
  })

  it('title hover is monochrome', () => {
    expect(card).not.toContain('hover:text-brand-600')
  })

  it('the product title uses the measured fluid clamp, not a fixed 16px', () => {
    expect(card).toContain('text-product')
    expect(card).not.toContain('text-base font-medium leading-tight')
  })
})

describe('rating token adoption', () => {
  const FILES = [
    'app/components/product/ProductReviews.tsx',
    'app/components/reviews/ReviewSummary.tsx',
    'app/components/product/ProductDetail.tsx',
  ]

  for (const path of FILES) {
    it(`${path} uses the rating token, not a hardcoded yellow`, () => {
      const src = read(path)
      expect(src).not.toContain('fill-yellow-400')
      expect(src).not.toContain('text-yellow-400')
    })

    it(`${path} has no font-bold`, () => {
      expect(read(path)).not.toContain('font-bold')
    })

    it(`${path} reaches for no orange brand utilities`, () => {
      expect(read(path)).not.toMatch(/\b(bg|from|to)-brand-/)
    })
  }

  it('OrderSummary has no font-bold', () => {
    expect(read('app/components/checkout/OrderSummary.tsx')).not.toContain(
      'font-bold'
    )
  })
})

describe('the product-grid-alignment contract is untouched', () => {
  it('keeps the square media ratio and the card plate', () => {
    expect(card).toContain('MEDIA_RATIO')
    expect(card).toContain('rounded-[var(--card-radius)]')
    /**
     * PLATE_BG, not `bg-mat`, since #530.
     *
     * They were the same colour while the card drew the master square edge to
     * edge. They are not the same THING: --mat is what sharp bakes into the
     * pixels, --plate is the surface the card draws under them, and only the
     * first has images depending on its value. Splitting them is what let the
     * plate move to the reference's rgb(239 239 239) without reprocessing a
     * single asset. --mat is still asserted against MAT_COLOR by
     * tests/styles/mat-token.test.ts, which is where that pairing belongs.
     */
    expect(card).toContain('PLATE_BG')
    expect(card).not.toContain('bg-mat')
  })

  it('keeps `grow` — the entire row-alignment mechanism on the card side', () => {
    expect(card).toContain('grow')
  })

  it('still has no min-height and no line-clamp', () => {
    // Both are explicitly ruled out by the card's own design note: rows need
    // to align, individual cards do not, and either one would fight `grow`.
    // A restyle reaching for `line-clamp-2` on the title is the likely
    // regression, hence checking the class rather than the comment.
    expect(card).not.toMatch(/className=[^>]*\bline-clamp-/)
    expect(card).not.toMatch(/className=[^>]*\bmin-h-/)
  })
})

/**
 * #530, second blind A/B — the card's meta row.
 *
 * Three separate findings, all in the strip under the plate:
 *
 *   "the five star glyphs sit ~0.5px apart at 14.5px tall and merge into a
 *    single amber bar rather than reading as five marks"
 *   "the rating count and wishlist heart at slate #64748B are the only cool hue
 *    in a band of warm greys and amber stars"
 *   "the meta stack runs three different gaps — 20px tile->stars, 23px
 *    stars->title, 15px title->price — and that 15px is tighter than the
 *    title's own 20px leading, so the price reads as a third title line"
 *
 * Measured after: 3px between star glyphs, rgb(112 107 102) on both marks, and
 * 20 / 20 / 20 of ink-to-ink air at 390.
 */
describe('the card meta row', () => {
  const rating = read('app/components/product/ProductRating.tsx')
  const wishlist = read('app/components/product/WishlistButton.tsx')
  const globals = read('app/styles/globals.css')

  it('separates the five stars so they do not merge into one bar', () => {
    // Flush 14px lucide stars leave ~0.5px between their points. The reference
    // sets 16px glyphs on a 19px pitch — 3px of air.
    expect(rating).toMatch(/flex gap-\[3px\]/)
  })

  it('sets the review count in the warm meta token, not the cool slate', () => {
    expect(rating).toContain('text-[hsl(var(--card-meta))]')
    expect(rating).not.toContain('text-muted-foreground')
  })

  it('sets the card heart in the same warm token', () => {
    expect(wishlist).toContain('text-[hsl(var(--card-meta))]')
    expect(wishlist).not.toContain('text-muted-foreground')
  })

  it('defines --card-meta as a WARM neutral', () => {
    const match = globals.match(/--card-meta:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
    expect(match).not.toBeNull()
    const [, hue, , lightness] = match!.map(Number) as [number, number, number, number]
    // Warm: the amber/orange half of the wheel, alongside --rating's 38.
    expect(hue).toBeGreaterThanOrEqual(15)
    expect(hue).toBeLessThanOrEqual(60)
    // …and no lighter than the slate it replaces, which measured L 46.9%. The
    // reference's heart is rgb(219 216 194) — 1.3:1 and invisible — and this
    // card being readable is a thing two reviews named as ours to win on.
    expect(lightness).toBeLessThanOrEqual(46.9)
  })

  it('gives the price its own air until the price moves beside the title', () => {
    // 4px of ink between the title's last line and the price is under the
    // title's own 20px leading, so the price joins the title block. gap-6
    // until `lg`, where the direction becomes row and gap-2 is horizontal.
    expect(card).toContain('gap-6 text-left lg:flex-row lg:gap-2')
  })
})
