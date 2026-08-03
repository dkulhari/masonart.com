/**
 * Storefront design-token compliance.
 *
 * Sibling in spirit to mat-token.test.ts: a coupling that nothing in the type
 * system can see. The mesonart palette lives in tokens, and the whole point of
 * the parity work was that components stopped ignoring them — but a `font-bold`
 * added next month compiles, renders, and quietly reintroduces the faux-bold
 * heading this feature removed from 47 files.
 *
 * Each forbidden pattern below carries the reason it is forbidden, so a failure
 * tells the next person what to write instead rather than just that they lost.
 * Each exemption carries the reason it is exempt, so widening the list requires
 * making the case in writing.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const APP = join(process.cwd(), 'app')

const EXEMPT = [
  // Internal tool, not customer-facing. Deliberately keeps its own look, and
  // is where the --brand-* scale still lives.
  `components${sep}admin${sep}`,
  `routes${sep}admin`,
  // Our differentiator surface. The analysis calls for keeping it and
  // restyling rather than folding it into the monochrome system.
  `components${sep}ai-generator${sep}`,
]

const FORBIDDEN: Array<[RegExp, string]> = [
  [
    /\bfont-(bold|extrabold|black)\b/,
    'weight 700+ is never loaded (see the font link in __root.tsx), so this renders as synthesised faux-bold. Use font-medium, or nothing at all inside a heading — the base layer supplies Urbanist 300.',
  ],
  [
    /\b(fill|text)-yellow-400\b/,
    'use the --rating token: fill-rating / text-rating. It holds the identical measured amber-500.',
  ],
  [
    /\b(bg|from|to|ring|border)-brand-/,
    'the --brand-* scale is admin- and AI-generator-only now. Use primary / accent / ring.',
  ],
  [
    /\bblur-3xl\b/,
    'the marketing blur-blob idiom, stripped for the monochrome system.',
  ],
  [
    /\bbg-gradient-to-\w+ from-brand/,
    'brand gradients are retired. Use a SectionBand tone.',
  ],
]

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const files = walk(APP)
  .map((f) => relative(APP, f))
  .filter((f) => !EXEMPT.some((e) => f.includes(e)))

describe('storefront token compliance', () => {
  it('finds storefront files to check', () => {
    // Guards the guard: a broken walk or an over-broad exemption would make
    // every assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(20)
  })

  it('does not accidentally exempt the storefront', () => {
    expect(files).toContain(join('routes', 'index.tsx'))
    expect(files).toContain(join('components', 'product', 'ProductCard.tsx'))
  })

  for (const [pattern, why] of FORBIDDEN) {
    it(`no ${pattern.source}`, () => {
      const offenders = files.filter((f) =>
        pattern.test(readFileSync(join(APP, f), 'utf8'))
      )
      expect(
        offenders,
        `${why}\n\nOffending files:\n  ${offenders.join('\n  ')}`
      ).toEqual([])
    })
  }
})

describe('the primitives are actually reachable', () => {
  const ui = (name: string) =>
    readFileSync(join(APP, 'components', 'ui', `${name}.tsx`), 'utf8')

  it('Button, SectionBand and DisplayHeading all exist', () => {
    expect(ui('Button')).toContain('export const buttonVariants')
    expect(ui('SectionBand')).toContain('export function SectionBand')
    expect(ui('DisplayHeading')).toContain('export function DisplayHeading')
  })

  it('the storefront consumes them rather than re-rolling pills by hand', () => {
    const consumers = files.filter((f) =>
      /from '~\/components\/ui\/(Button|SectionBand|DisplayHeading)'/.test(
        readFileSync(join(APP, f), 'utf8')
      )
    )
    expect(consumers.length).toBeGreaterThan(2)
  })
})
