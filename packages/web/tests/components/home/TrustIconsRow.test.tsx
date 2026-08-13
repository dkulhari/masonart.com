/**
 * The home page's trust row.
 *
 * Three things here are load-bearing and each has a test:
 *
 *   1. THE CLAIMS ARE OURS. mesonart's row promises "Free Shipping Globally"
 *      and "Eco Friendly". Both would be false here — we ship in India and
 *      shipping is free over ₹999 — and every line in this row is instead
 *      lifted from copy the app already ships. The test pins each detail line
 *      against its source so a later reword of one surface cannot silently
 *      leave this one behind, and so nobody re-adds the two claims we dropped.
 *
 *   2. THE TWO TEXT LINES ARE ONE PAIR. On the reference both the label and
 *      the sentence are pure black at the same size. `text-muted-foreground`
 *      on the second line is the obvious "improvement" and is exactly what the
 *      old bordered card grid did — it splits the pair and is a parity
 *      regression, so the class is banned outright.
 *
 *   3. NO CARDS. The whole point of the consolidation is that this row has no
 *      borders, no plates and no fills — that shape is what the
 *      "Why Choose chobii.art?" grid used and what this replaces.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FREE_SHIPPING_THRESHOLD_LABEL } from '@chobii/shared'
import { TrustIconsRow, trustClaimsFor } from '~/components/home/TrustIconsRow'

/**
 * The claims became a function of the free-shipping threshold in #570. With no
 * provider above it the row falls back to the bundled default, so the expected
 * claims are built from that same label rather than from a literal — the
 * coupling itself is pinned in tests/lib/free-shipping-copy.test.tsx.
 */
const TRUST_CLAIMS = trustClaimsFor(FREE_SHIPPING_THRESHOLD_LABEL)

afterEach(cleanup)

describe('TrustIconsRow', () => {
  it('renders exactly four columns', () => {
    render(<TrustIconsRow />)
    expect(screen.getAllByTestId('home-trust-item')).toHaveLength(4)
    expect(TRUST_CLAIMS).toHaveLength(4)
  })

  it('renders each label with its sentence underneath', () => {
    render(<TrustIconsRow />)

    for (const { label, detail } of TRUST_CLAIMS) {
      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getByText(detail)).toBeInTheDocument()
    }
  })

  it('makes only claims this app already makes elsewhere', () => {
    // Each pair below is checked against a real source, cited in
    // TrustIconsRow.tsx next to the claim. Changing a claim means changing a
    // policy page first.
    expect(TRUST_CLAIMS.map(({ label, detail }) => [label, detail])).toEqual([
      ['Archival Inks', 'Museum-grade pigment'],
      [`Free Over ${FREE_SHIPPING_THRESHOLD_LABEL}`, 'Free delivery across India'],
      ['30-Day Returns', 'Full refund, no questions asked'],
      ['Safe Payments', 'Secure checkout via Razorpay'],
    ])
  })

  it('does not repeat the reference claims we cannot substantiate', () => {
    render(<TrustIconsRow />)

    // Unconditional free shipping and the environmental claim. Footer.tsx
    // dropped both for the same reason; this row must not quietly restore
    // them.
    expect(screen.queryByText(/free shipping globally/i)).toBeNull()
    expect(screen.queryByText(/eco.?friendly/i)).toBeNull()

    // The shipping claim must always carry its threshold.
    const shipping = TRUST_CLAIMS.find(({ label }) => /free/i.test(label))
    expect(shipping?.label).toContain(FREE_SHIPPING_THRESHOLD_LABEL)
  })

  it('keeps the label and the sentence as one pair — same size, same colour', () => {
    const { container } = render(<TrustIconsRow />)

    const paragraphs = [...container.querySelectorAll('p')]
    expect(paragraphs).toHaveLength(8)

    for (const p of paragraphs) {
      expect(p.className).toContain('text-base')
      expect(p.className).toContain('text-foreground')
      // The regression this row exists to undo.
      expect(p.className).not.toContain('text-muted-foreground')
    }
  })

  it('renders no cards — no borders, no plates, no fills', () => {
    const { container } = render(<TrustIconsRow />)

    for (const el of container.querySelectorAll('*')) {
      const className =
        typeof el.className === 'string' ? el.className : el.className.baseVal
      expect(className).not.toMatch(/\bborder(-|\b)/)
      expect(className).not.toMatch(/\brounded-/)
      expect(className).not.toMatch(/\bbg-(?!background\b)/)
      expect(className).not.toMatch(/\bshadow-/)
    }
  })

  /**
   * #541 took SectionBand's phone padding from 64 to 32 for the whole page.
   * This band opts back out: it already measures 500px at 390 against the
   * bar's 501, so it is the one band on the page that was never loose, and
   * the default would have moved it away from the bar rather than towards it.
   */
  it('keeps its own 64px padding when the page default drops', () => {
    const { container } = render(<TrustIconsRow />)

    const band = container.querySelector('section')!
    expect(band.className).toContain('py-16')
    expect(band.className).toContain('sm:py-16')
    expect(band.className).not.toContain('py-8')
  })

  it('hides the decorative icons from assistive tech', () => {
    const { container } = render(<TrustIconsRow />)

    const icons = container.querySelectorAll('svg')
    expect(icons).toHaveLength(4)
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true')
    }
  })
})
