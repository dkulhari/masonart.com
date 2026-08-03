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
  it('keeps the square media ratio and the baked mat colour', () => {
    expect(card).toContain('MEDIA_RATIO')
    expect(card).toContain('bg-mat')
    expect(card).toContain('rounded-[var(--card-radius)]')
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
