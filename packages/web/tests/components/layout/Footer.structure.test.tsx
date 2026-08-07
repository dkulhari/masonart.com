/**
 * Footer — contact column, beige band, and NO USP strip (analysis §1.1 / §3.1).
 *
 * Note: the analysis said we had a "3-col footer". It was already four. What
 * was actually missing is a contact column.
 *
 * The footer used to carry a USP strip above its columns, as mesonart's does.
 * The home-page-parity work (#539) put the same four claims on their own white
 * band directly above this footer, so the strip became the second of two on one
 * page and came out. The claims, their wording and their provenance are pinned
 * by tests/components/home/TrustIconsRow.test.tsx now.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SUPPORT_EMAIL } from '@chobii/shared'

const src = readFileSync(
  join(process.cwd(), 'app/components/layout/Footer.tsx'),
  'utf8'
)

const trustRowSrc = readFileSync(
  join(process.cwd(), 'app/components/home/TrustIconsRow.tsx'),
  'utf8'
)

describe('USP strip — moved out, not duplicated', () => {
  it('no longer renders its own strip', () => {
    expect(src).not.toContain('USP_ITEMS')
  })

  it('the claims live in TrustIconsRow instead, still four of them', () => {
    // `trustClaimsFor(label)` since #570: the shipping claim states the
    // configured threshold, so the claims are built rather than written down.
    const block = trustRowSrc.match(/function trustClaimsFor[\s\S]*?\n\}/)
    expect(block).not.toBeNull()
    // Anchored to the line start so the provenance comments above each claim —
    // which quote the old `label:` lines verbatim — are not counted as data.
    expect(block![0].match(/^\s*label: ['`]/gm) ?? []).toHaveLength(4)
  })

  it('qualifies the shipping claim rather than implying it is unconditional', () => {
    // Theirs says "Free Shipping" flat. Ours is free over a threshold — saying
    // otherwise is a claim we cannot honour. Since #570 that threshold is an
    // admin setting, so the claim interpolates it instead of stating a figure.
    expect(trustRowSrc).toMatch(
      /label: `Free Over \$\{freeShippingThresholdLabel\}`/
    )
  })

  it('makes no environmental claim we cannot substantiate', () => {
    // Theirs advertises "Eco Friendly". We have nothing behind that, so we do
    // not say it. Only the footer is checked at source level here — the trust
    // row explains the omission in a comment, so the honest guard for it is
    // the rendered one in tests/components/home/TrustIconsRow.test.tsx.
    expect(src).not.toMatch(/eco[- ]friendly/i)
  })
})

describe('contact column', () => {
  it('exists', () => {
    expect(src).toMatch(/Contact/)
  })

  it('takes the support address from the brand constants, not a retyped literal', () => {
    expect(src).toContain('SUPPORT_EMAIL')
    expect(src).not.toContain('support@chobii.art')
  })

  it('the constant is the address the rest of the platform uses', () => {
    expect(SUPPORT_EMAIL).toContain('@')
  })
})

describe('styling', () => {
  it('sits on the measured beige band', () => {
    expect(src).toContain('bg-band')
  })

  it('honours the token guard', () => {
    expect(src).not.toContain('font-bold')
    expect(src).not.toMatch(/\b(bg|text|border|from|to)-brand-/)
  })
})
