/**
 * What the admin sees a frame cost while they type its price.
 *
 * The coupling case below is the reason this component exists in this shape.
 * #566 was a mispricing that survived because the PDP re-derived a formula the
 * server already owned, and every seeded frame happened to make the two agree
 * — priceAddition was 0.00 everywhere, so dropping it changed nothing until an
 * admin could set it. Which is exactly what this feature enables.
 *
 * So the preview does not compute anything. It calls frameAddition, and this
 * asserts it against frameAddition's own output for a frame carrying BOTH a
 * non-zero modifier and a non-zero addition — the case that had no coverage.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { frameAddition, FRAME_PREVIEW_REFERENCE_PRICES } from '@chobii/shared'
import {
  FramePricePreview,
  framePreviewRows,
} from '~/routes/admin/frames/FramePricePreview'

afterEach(cleanup)

const BOTH_NON_ZERO = { priceModifier: '1.40', priceAddition: '250.00' }

describe('framePreviewRows', () => {
  it('is the shared formula, not a copy of it — including the flat column', () => {
    const rows = framePreviewRows(BOTH_NON_ZERO)

    expect(rows).toHaveLength(FRAME_PREVIEW_REFERENCE_PRICES.length)
    rows.forEach((row, i) => {
      const price = FRAME_PREVIEW_REFERENCE_PRICES[i]
      expect(row.basePrice).toBe(price)
      expect(row.addition).toBe(frameAddition(price, BOTH_NON_ZERO))
      expect(row.total).toBe(price + frameAddition(price, BOTH_NON_ZERO))
    })
  })

  it('does not drop the flat addition — the #566 failure, from the admin side', () => {
    const withFlat = framePreviewRows(BOTH_NON_ZERO)
    const withoutFlat = framePreviewRows({
      priceModifier: '1.40',
      priceAddition: '0.00',
    })

    withFlat.forEach((row, i) => {
      expect(row.addition - withoutFlat[i].addition).toBe(250)
    })
  })

  it('quotes zero uplift for a frame that adds nothing', () => {
    const rows = framePreviewRows({
      priceModifier: '1.00',
      priceAddition: '0.00',
    })
    rows.forEach((row) => expect(row.addition).toBe(0))
  })

  it('honours the clamp — a below-one modifier does not discount the piece', () => {
    const rows = framePreviewRows({
      priceModifier: '0.80',
      priceAddition: '0.00',
    })
    rows.forEach((row) => expect(row.addition).toBe(0))
  })

  it('scales with the piece, which is why there is more than one row', () => {
    const rows = framePreviewRows({
      priceModifier: '1.40',
      priceAddition: '0.00',
    })
    const additions = rows.map((r) => r.addition)

    expect(additions[1]).toBeGreaterThan(additions[0])
    expect(additions[2]).toBeGreaterThan(additions[1])
  })

  it('quotes whole rupees, because that is where the formula rounds', () => {
    /**
     * `frameAddition` rounds to the rupee deliberately and at calculation
     * time, so the number the CTA quotes is the number that reaches the cart
     * (the server's `resolveFramePrice` is a `.toFixed(2)` wrapper over the
     * same call). A preview that re-rounded at display time — or showed paise
     * — would drift from what is charged in exactly the way #566 did.
     */
    const rows = framePreviewRows({
      priceModifier: '1.333',
      priceAddition: '0.50',
    })
    rows.forEach((row) => {
      expect(Number.isInteger(row.addition - 0.5)).toBe(true)
    })
  })

  it('a flat-only frame adds the same at every size', () => {
    // The complement of the case above: proof the two columns behave
    // differently, so a preview showing one could not stand in for both.
    const rows = framePreviewRows({
      priceModifier: '1.00',
      priceAddition: '500.00',
    })
    rows.forEach((row) => expect(row.addition).toBe(500))
  })
})

describe('FramePricePreview', () => {
  it('renders a row per reference price', () => {
    render(<FramePricePreview pricing={BOTH_NON_ZERO} />)

    // The ₹ prefix matters: a bare /4,999/ also matches ₹14,999, so the
    // largest reference price would silently satisfy the assertion for the
    // middle one.
    const body = document.body.textContent ?? ''
    for (const price of FRAME_PREVIEW_REFERENCE_PRICES) {
      expect(body).toContain(`on a ₹${price.toLocaleString('en-IN')} print`)
    }

    expect(document.querySelectorAll('tbody tr')).toHaveLength(
      FRAME_PREVIEW_REFERENCE_PRICES.length
    )
  })

  it('renders nothing rather than NaN while the field is mid-edit', () => {
    render(
      <FramePricePreview pricing={{ priceModifier: '', priceAddition: '' }} />
    )
    expect(screen.queryByText(/NaN/)).toBeNull()
  })

  it('survives a half-typed decimal without quoting a wrong number', () => {
    render(
      <FramePricePreview pricing={{ priceModifier: '1.', priceAddition: '' }} />
    )
    expect(screen.queryByText(/NaN/)).toBeNull()
  })

  it('shows the uplift and the resulting total, not just one of them', () => {
    render(<FramePricePreview pricing={BOTH_NON_ZERO} />)

    const rows = framePreviewRows(BOTH_NON_ZERO)
    const body = document.body.textContent ?? ''

    expect(body).toContain(rows[0].addition.toLocaleString('en-IN'))
    expect(body).toContain(rows[0].total.toLocaleString('en-IN'))
  })
})

describe('the form', () => {
  it('actually renders the preview, rather than leaving the slot empty', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(process.cwd(), 'app/routes/admin/frames/FrameForm.tsx'),
      'utf8'
    )

    expect(src).toContain('FramePricePreview')
    expect(src).toContain('priceModifier: values.priceModifier')
  })
})
