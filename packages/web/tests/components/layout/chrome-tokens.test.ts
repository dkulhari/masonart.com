/**
 * Global chrome — monochrome system compliance.
 *
 * Restyle only. The Phase B restructure mesonart implies (centered wordmark,
 * two-row nav, announcement bar, sale strip) is deliberately out of scope, so
 * these assertions are about colour, weight and type scale — not layout.
 *
 * The mobile-drawer assertions at the bottom are the point of the file: the
 * drawer's scroll-lock, Escape handling and sibling-of-header placement were
 * all bug fixes (#348), and they are the kind of thing a restyle sweep deletes
 * by accident while "cleaning up classes".
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const FILES = {
  Header: 'app/components/layout/Header.tsx',
  Footer: 'app/components/layout/Footer.tsx',
  InfoPage: 'app/components/layout/InfoPage.tsx',
  root: 'app/routes/__root.tsx',
}

describe('global chrome — monochrome system', () => {
  for (const [name, path] of Object.entries(FILES)) {
    it(`${name} uses no orange brand utilities`, () => {
      expect(read(path)).not.toMatch(/\b(bg|text|border|from|to)-brand-/)
    })

    it(`${name} has no font-bold`, () => {
      expect(read(path)).not.toContain('font-bold')
    })
  }

  it('the wordmark uses the heading face in both header and footer', () => {
    expect(read(FILES.Header)).toContain('font-heading')
    expect(read(FILES.Footer)).toContain('font-heading')
  })

  it('nav links use the fluid nav scale', () => {
    expect(read(FILES.Header)).toContain('text-nav')
  })

  it('the skip link is a primary pill, not orange', () => {
    const src = read(FILES.root)
    expect(src).toContain('focus:bg-primary')
    expect(src).not.toContain('focus:bg-brand-500')
  })

  it('the 404 and error CTAs go through buttonVariants', () => {
    expect(read(FILES.root)).toContain('buttonVariants')
  })
})

describe('behaviour that must survive the restyle', () => {
  it('keeps the mobile drawer scroll-lock and Escape wiring (#348)', () => {
    const src = read(FILES.Header)
    expect(src).toContain("document.body.style.overflow = 'hidden'")
    expect(src).toContain("event.key === 'Escape'")
    expect(src).toContain('data-testid="mobile-nav-scrim"')
  })

  it('keeps the cart aria-label item count (#248)', () => {
    expect(read(FILES.Header)).toContain('Shopping cart${')
  })

  it('keeps the role-aware staff area entry (#362)', () => {
    const src = read(FILES.Header)
    expect(src).toContain('staffAreaLabel')
    expect(src).toContain('staffAreaHref')
  })
})
