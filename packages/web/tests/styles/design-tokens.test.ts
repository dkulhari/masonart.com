/**
 * Design-token values, measured from mesonart.com.
 *
 * Sibling of mat-token.test.ts and the same idea: these are numbers copied off
 * another site's rendered CSS, so nothing in the type system notices when one
 * drifts back. The measurements live in
 * docs/design/mesonart/mesonart-parity-analysis.md, Appendix A.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'app/styles/globals.css'), 'utf8')
const tailwind = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8')

/** hsl(h, s%, l%) -> {r,g,b} in 0..255 */
function hslToRgb(h: number, s: number, l: number) {
  const sn = s / 100
  const ln = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  }
}

function token(name: string, source = css) {
  const m = source.match(
    new RegExp(`${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  )
  expect(m, `${name} not found`).not.toBeNull()
  return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]))
}

function near(
  got: { r: number; g: number; b: number },
  r: number,
  g: number,
  b: number,
  tol = 2
) {
  expect(Math.abs(got.r - r), `red: got ${got.r}, want ${r}`).toBeLessThanOrEqual(tol)
  expect(Math.abs(got.g - g), `green: got ${got.g}, want ${g}`).toBeLessThanOrEqual(tol)
  expect(Math.abs(got.b - b), `blue: got ${got.b}, want ${b}`).toBeLessThanOrEqual(tol)
}

describe('mesonart button palette', () => {
  it('primary is the measured near-black, not orange', () => {
    near(token('--primary'), 23, 23, 23)
  })

  it('primary-foreground is white so the pill reads', () => {
    const fg = token('--primary-foreground')
    expect(fg.r).toBeGreaterThan(240)
  })

  it('focus ring follows primary rather than the old orange', () => {
    near(token('--ring'), 23, 23, 23)
  })

  it('defines the sale accent (rose-600, reserved for sale price/tag)', () => {
    near(token('--sale'), 225, 29, 72, 3)
  })

  it('defines the beige section band', () => {
    near(token('--band'), 229, 226, 213, 3)
  })

  it('defines the warm-sand collections band', () => {
    near(token('--band-strong'), 219, 216, 194, 3)
  })

  it('defines the peach highlight', () => {
    near(token('--highlight'), 255, 221, 191, 3)
  })

  it('defines the pill radius and 2px button border', () => {
    expect(css).toMatch(/--radius-pill:\s*3\.75rem/)
    expect(css).toMatch(/--border-button:\s*2px/)
  })
})

describe('token registration', () => {
  it('exposes band / band-strong / highlight / sale to Tailwind', () => {
    for (const name of ['band', 'highlight', 'sale']) {
      expect(tailwind).toContain(`${name}:`)
      expect(tailwind).toContain(`--${name}`)
    }
    expect(tailwind).toContain('--band-strong')
  })

  it('registers a pill border-radius', () => {
    expect(tailwind).toContain('pill:')
    expect(tailwind).toContain('--radius-pill')
  })
})

describe('preserved tokens', () => {
  it('keeps the brand scale for /admin and the AI surface', () => {
    expect(css).toContain('--brand-500:')
    expect(tailwind).toContain('brand:')
  })

  it('leaves --mat untouched (sharp bakes it into pixels)', () => {
    expect(css).toMatch(/--mat:\s*0\s+0%\s+98%/)
  })

  // #449 removed dark mode: primary is declared once, near-black, and never inverted.
  it('declares primary exactly once, with no dark override', () => {
    expect(css).not.toContain('.dark')
    const matches = css.match(/--primary:\s*[\d.]+\s+[\d.]+%\s+[\d.]+%/g) ?? []
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatch(/--primary:\s*0\s+0%\s+9%/)
  })
})

describe('page width', () => {
  it('declares the measured 1600px page width', () => {
    expect(css).toMatch(/--page-width:\s*1600px/)
  })

  it('container-wide is 1600px, not max-w-7xl', () => {
    const m = css.match(/\.container-wide\s*\{[^}]*\}/)
    expect(m, '.container-wide rule not found').not.toBeNull()
    expect(m![0]).not.toContain('max-w-7xl')
    expect(m![0]).toContain('var(--page-width)')
  })

  it('uses the measured page gutter, not the old per-utility ramp', () => {
    expect(css).toMatch(/--page-padding:\s*20px/)
    const m = css.match(/\.container-wide\s*\{[^}]*\}/)
    expect(m![0]).toContain('var(--page-padding)')
    // The gutter ramps once, in the token — never in the utility.
    expect(m![0]).not.toContain('sm:px-6')
  })

  /**
   * #540. mesonart's gutter is 20px only below `lg`; an earlier pass copied
   * that base value as if it were flat, which left every desktop band ~28px
   * closer to the page edge than the bar. Measured 20.0 at 390 and 48.0 at
   * 1440 on their captured home page, and confirmed against their own
   * stylesheet (--sp-5 / --sp-9 / --sp-12 at :root / 1024 / 1280).
   */
  it('ramps the gutter to 36px at lg and 48px at xl', () => {
    expect(css).toMatch(
      /@media \(min-width: 1024px\)\s*\{\s*:root\s*\{\s*--page-padding:\s*36px/
    )
    expect(css).toMatch(
      /@media \(min-width: 1280px\)\s*\{\s*:root\s*\{\s*--page-padding:\s*48px/
    )
  })

  it('the tailwind container agrees with the page width and the gutter ramp', () => {
    expect(tailwind).toContain("'2xl': '1600px'")
    expect(tailwind).toContain("DEFAULT: '20px'")
    expect(tailwind).toContain("lg: '36px'")
    expect(tailwind).toContain("xl: '48px'")
  })
})
