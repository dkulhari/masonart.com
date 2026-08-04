/**
 * Footer — USP strip, contact column, beige band (analysis §1.1 / §3.1).
 *
 * Note: the analysis said we had a "3-col footer". It was already four. What
 * was actually missing is the USP strip above the columns and a contact
 * column.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SUPPORT_EMAIL } from '@chobii/shared'

const src = readFileSync(
  join(process.cwd(), 'app/components/layout/Footer.tsx'),
  'utf8'
)

describe('USP strip', () => {
  it('exists as its own data list rather than inline markup', () => {
    expect(src).toContain('USP_ITEMS')
  })

  it('carries four items, as theirs does', () => {
    const block = src.match(/const USP_ITEMS[\s\S]*?\n\]/)
    expect(block).not.toBeNull()
    expect(block![0].match(/label:/g) ?? []).toHaveLength(4)
  })

  it('qualifies the shipping claim rather than implying it is unconditional', () => {
    // Theirs says "Free Shipping" flat. Ours is free over ₹999 — saying
    // otherwise is a claim we cannot honour.
    expect(src).toMatch(/Free Shipping Over ₹999|Free Over ₹999|over ₹999/i)
  })

  it('makes no environmental claim we cannot substantiate', () => {
    // Theirs advertises "Eco Friendly". We have nothing behind that, so we do
    // not say it.
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
