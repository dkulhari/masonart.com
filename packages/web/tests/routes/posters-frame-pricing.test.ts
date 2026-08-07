/**
 * The product page and the quickview must quote the same frame price (#420).
 *
 * Frames used to charge a flat `priceAddition`. They now charge a proportion
 * of the piece — `priceModifier`, 1.40 meaning "the piece plus 40%" — because
 * a moulding for a 12x16 and one for a 60x80 are not the same amount of
 * timber. Measured on mesonart across three sizes of one piece, the framed
 * option ran +85%, +76% and +91% of the rolled price rather than a fixed sum.
 *
 * The seed sets `priceAddition` to "0.00" on every row as part of that move,
 * which makes this a silent-zero coupling rather than a stylistic one: a
 * surface still reading the flat field quotes every frame at nothing, and
 * nothing about that fails to compile.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const detailRoute = read('app/routes/posters/$slug.tsx')
const quickview = read('app/components/product/ChooseOptions.tsx')
const frameSelector = read('app/components/product/FrameSelector.tsx')
const productDetail = read('app/components/product/ProductDetail.tsx')

/**
 * The product page used to convert `priceModifier` into a percentage on the
 * way in and hand `FrameSelector` that number alone — no channel for the flat
 * `priceAddition` column at all (#566). That conversion was the whole defect:
 * a frame carrying both columns was quoted low on the buy panel and charged
 * correctly by the server. So the guard is on the transform, not on the field
 * names — the route hands the row's columns through and prices nothing itself.
 */
describe('the product page hands frame pricing to the shared formula', () => {
  it('passes the row s pricing columns through untransformed', () => {
    expect(detailRoute).toContain('priceModifier: f.priceModifier')
    expect(detailRoute).toContain('priceAddition: f.priceAddition')
  })

  it('carries no frame arithmetic of its own', () => {
    expect(detailRoute).not.toContain('priceModifierValue')
    expect(detailRoute).not.toMatch(/parseFloat\(f\.price(Modifier|Addition)/)
  })

  it('prices the swatches and the buy panel through @chobii/shared', () => {
    for (const source of [frameSelector, productDetail]) {
      expect(source).toContain("from '@chobii/shared'")
      expect(source).toContain('frameAddition(')
      // No second formula to drift from the server's.
      expect(source).not.toMatch(/Math\.round\(\s*basePrice\s*\*/)
    }
  })
})

/**
 * The quickview no longer carries a formula of its own (#511 final review,
 * finding 1).
 *
 * It used to compute `Math.round(unitPrice * frame.priceRate) + priceAddition`
 * inline, which was correct — and was the THIRD place that arithmetic lived,
 * beside the product page's own `calculateFramePrice` (since deleted, #566)
 * and, wrongly, the cart route.
 * The cart route read the zeroed flat column alone, stored every framed line at
 * a frame price of nothing, and `POST /api/orders` charged that. So the guard
 * here is now the stronger one: there is one formula, in `@chobii/shared`, and
 * the surfaces call it rather than reproducing it.
 */
describe('the quickview prices them the same way', () => {
  it('delegates to the one shared formula rather than carrying its own', () => {
    expect(quickview).toContain("from '@chobii/shared'")
    expect(quickview).toContain('frameAddition(')
    // No local arithmetic to drift from the server's.
    expect(quickview).not.toMatch(/Math\.round\(unitPrice\s*\*/)
  })

  it('multiplies the chosen variant, not the product base', () => {
    // `unitPrice` is the selected variant's price. Applying the rate to
    // `product.basePrice` would charge the smallest size's frame on every size.
    expect(quickview).toContain('frameAddition(unitPrice,')
  })

  it('hands the frame row s pricing columns through untransformed', () => {
    // Pre-parsing `priceModifier` into a rate here is how the quickview came to
    // own arithmetic in the first place; the helper reads the columns itself.
    expect(quickview).toContain('priceModifier: f.priceModifier')
    expect(quickview).toContain('priceAddition: f.priceAddition')
  })
})
