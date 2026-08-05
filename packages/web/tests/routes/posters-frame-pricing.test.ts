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

describe('the product page prices frames off the multiplier', () => {
  it('maps them as a percentage, not a fixed amount', () => {
    expect(detailRoute).toContain("priceModifierType: 'percentage'")
    expect(detailRoute).not.toContain("priceModifierType: 'fixed'")
  })

  it('reads priceModifier rather than the zeroed flat field', () => {
    expect(detailRoute).toContain("parseFloat(f.priceModifier || '1')")
    expect(detailRoute).not.toMatch(/priceModifierValue:\s*parseFloat\(f\.priceAddition/)
  })
})

describe('the quickview prices them the same way', () => {
  it('derives its rate from priceModifier', () => {
    expect(quickview).toContain("parseFloat(f.priceModifier || '1')")
  })

  it('multiplies the chosen variant, not the product base', () => {
    // `unitPrice` is the selected variant's price. Applying the rate to
    // `product.basePrice` would charge the smallest size's frame on every size.
    expect(quickview).toContain('Math.round(unitPrice * frame.priceRate)')
  })
})
