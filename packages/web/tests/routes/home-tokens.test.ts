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
    expect(src).not.toContain('fill-yellow-400')
    expect(src).toContain('fill-rating')
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

  it('uses buttonVariants for its anchor CTAs rather than inline pills', () => {
    expect(src).toContain('buttonVariants')
    expect(src).not.toContain('rounded-lg bg-primary')
  })
})

describe('home page — deliberate survivals', () => {
  it('keeps the category legibility scrims, which are not brand colour', () => {
    // The per-category washes and the flat black scrim exist so white caption
    // text stays legible over light photography (#357). Removing them as
    // "gradients" would reintroduce that bug.
    expect(src).toContain('bg-black/25')
    expect(src).toContain('from-slate-700/80')
  })

  it('keeps the AI generator section — our differentiator, restyled not cut', () => {
    expect(src).toContain('AIGeneratorSection')
    expect(src).toContain('tone="ink"')
  })
})
