/**
 * Mat token coupling guard
 *
 * This is the feature's one cross-boundary coupling, and the thing most likely
 * to rot: the mat colour exists BOTH as MAT_COLOR baked into pixels by sharp on
 * the server, and as the --mat CSS token shown while the image loads.
 *
 * If they drift, every product card flashes one colour then settles to another.
 * No type system catches that, so it is caught here.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAT_COLOR } from '@chobii/shared'

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

describe('--mat token', () => {
  it('is defined in globals.css', () => {
    expect(css).toMatch(/--mat:\s*[\d.]+\s+[\d.]+%\s+[\d.]+%/)
  })

  it('resolves to the same RGB as the baked MAT_COLOR', () => {
    const m = css.match(/--mat:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
    expect(m).not.toBeNull()
    const rgb = hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]))
    // 1/255 tolerance for HSL <-> RGB rounding
    expect(Math.abs(rgb.r - MAT_COLOR.r)).toBeLessThanOrEqual(1)
    expect(Math.abs(rgb.g - MAT_COLOR.g)).toBeLessThanOrEqual(1)
    expect(Math.abs(rgb.b - MAT_COLOR.b)).toBeLessThanOrEqual(1)
  })

  it('is exposed to Tailwind so bg-mat resolves', () => {
    expect(tailwind).toContain('mat:')
    expect(tailwind).toContain('--mat')
  })
})

describe('measured mesonart tokens', () => {
  it('defines the fluid card radius (10px -> 20px)', () => {
    expect(css).toMatch(/--card-radius:\s*clamp\(0?\.625rem,\s*1\.053vw,\s*1\.25rem\)/)
  })

  it('defines the primary easing', () => {
    expect(css).toMatch(/--ease-primary:\s*cubic-bezier\(\.?0?\.?3,\s*1,\s*\.?0?\.?3,\s*1\)/)
  })

  it('defines the fast easing', () => {
    expect(css).toMatch(/--ease-fast:\s*cubic-bezier\(/)
  })

  it('sets foreground to neutral-900 (measured 23 23 23)', () => {
    const m = css.match(/--foreground:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
    expect(m).not.toBeNull()
    const rgb = hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]))
    expect(Math.abs(rgb.r - 23)).toBeLessThanOrEqual(2)
    expect(Math.abs(rgb.g - 23)).toBeLessThanOrEqual(2)
    expect(Math.abs(rgb.b - 23)).toBeLessThanOrEqual(2)
  })

  it('defines a rating colour (measured amber-500)', () => {
    expect(css).toContain('--rating:')
  })

  it('registers Poppins and Urbanist', () => {
    expect(css).toContain('Poppins')
    expect(css).toContain('Urbanist')
  })
})
