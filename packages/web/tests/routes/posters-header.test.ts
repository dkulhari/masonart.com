/**
 * Collection header band.
 *
 * Source-level, like home-tokens.test.ts and for the same reason: the route
 * module calls createFileRoute and a server function at module scope, so it
 * cannot be imported into jsdom without a router. What is under test is which
 * components and classes the page reaches for.
 *
 * mesonart's collection header (analysis §1.3.1) is a beige band carrying
 * breadcrumbs, a display H1 with the per-word reveal, and an SEO description.
 * Ours was a flat muted band with a plain h1 and the result count — and the
 * count belongs in the toolbar, which is where mesonart puts it.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(
  join(process.cwd(), 'app/routes/posters/index.tsx'),
  'utf8'
)

describe('collection header band', () => {
  it('uses the beige SectionBand rather than the cool muted tint', () => {
    expect(src).toContain("from '~/components/ui/SectionBand'")
    expect(src).toContain('tone="beige"')
    expect(src).not.toContain('bg-muted/30 py-8')
  })

  it('uses DisplayHeading for the H1', () => {
    expect(src).toContain("from '~/components/ui/DisplayHeading'")
  })

  it('renders breadcrumbs as real navigation, not a decorative string', () => {
    expect(src).toContain('aria-label="Breadcrumb"')
    expect(src).toMatch(/<ol\b/)
  })

  it('carries BreadcrumbList structured data', () => {
    // #244 established JSON-LD on this page; breadcrumbs are the one Google
    // renders directly in the result.
    expect(src).toContain('BreadcrumbList')
  })

  it('carries an SEO description paragraph', () => {
    expect(src).toContain('COLLECTION_DESCRIPTION')
  })

  it('no longer shows the result count — the toolbar owns it', () => {
    expect(src).not.toContain('Showing {totalProducts}')
  })
})

describe('token compliance', () => {
  it('has no font-bold and no brand utilities', () => {
    expect(src).not.toContain('font-bold')
    expect(src).not.toMatch(/\b(bg|text|border|from|to)-brand-/)
  })
})
