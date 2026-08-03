/**
 * Base typography.
 *
 * The parity analysis' core finding: `--font-heading` was declared in
 * globals.css and consumed nowhere, and every heading used `font-bold` even
 * though weight 700 is not among the loaded webfont weights -- so headings
 * rendered as faux-bold Poppins rather than Urbanist 300.
 *
 * These assertions are about the BASE layer specifically. Fixing it there is
 * what lets the per-component sweep be a deletion rather than a rewrite.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'app/styles/globals.css'), 'utf8')
const tailwind = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8')
const root = readFileSync(join(process.cwd(), 'app/routes/__root.tsx'), 'utf8')

describe('base typography', () => {
  it('body is Poppins 300 at line-height 1.2', () => {
    const body = css.match(/\n  body\s*\{[\s\S]*?\n  \}/)
    expect(body, 'no base body rule').not.toBeNull()
    expect(body![0]).toMatch(/font-weight:\s*300/)
    expect(body![0]).toMatch(/line-height:\s*1\.2/)
  })

  it('headings consume --font-heading at weight 300', () => {
    const heads = css.match(/h1,\s*\n?\s*h2,[\s\S]*?\{[\s\S]*?\}/)
    expect(heads, 'no h1..h6 base rule').not.toBeNull()
    expect(heads![0]).toContain('var(--font-heading)')
    expect(heads![0]).toMatch(/font-weight:\s*300/)
    expect(heads![0]).toMatch(/line-height:\s*1;/)
  })

  it('--font-heading is consumed somewhere other than its own declaration', () => {
    const uses = css.match(/var\(--font-heading\)/g) ?? []
    expect(uses.length).toBeGreaterThan(0)
  })
})

describe('fluid type scales', () => {
  it('declares the measured nav / button / product clamps', () => {
    expect(css).toMatch(/--font-nav-size:\s*clamp\(/)
    expect(css).toMatch(/--font-button-size:\s*clamp\(/)
    expect(css).toMatch(/--font-product-size:\s*clamp\(/)
    expect(css).toMatch(/--font-display-size:\s*clamp\(/)
  })

  it('exposes them to Tailwind as fontSize utilities', () => {
    expect(tailwind).toContain('fontSize:')
    for (const n of ['nav', 'button', 'product', 'display']) {
      expect(tailwind).toContain(`--font-${n}-size`)
    }
  })

  it('h1 renders at the display scale', () => {
    expect(css).toMatch(/h1\s*\{[^}]*var\(--font-display-size\)/)
  })
})

describe('webfont loading', () => {
  it('still loads only the weights actually used, and never 700', () => {
    expect(root).toContain('Poppins:wght@300;400;500')
    expect(root).toContain('Urbanist:wght@300;500')
    expect(root).not.toMatch(/wght@[\d;]*700/)
  })
})
