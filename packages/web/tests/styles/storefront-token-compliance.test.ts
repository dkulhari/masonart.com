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

/**
 * Trees that keep their own look: internal tools and the one differentiator
 * surface. They are exempt from the PALETTE and IDIOM rules — not from all of
 * them, see `scope` below.
 */
const EXEMPT = [
  // Internal tool, not customer-facing. Deliberately keeps its own look, and
  // is where the --brand-* scale still lives.
  `components${sep}admin${sep}`,
  `routes${sep}admin`,
  // The vendor portal (#621), same category and for the same reason: a
  // supplier-facing operations tool, built to follow the admin screens, that
  // no customer ever sees.
  `routes${sep}vendor`,
  // Our differentiator surface. The analysis calls for keeping it and
  // restyling rather than folding it into the monochrome system.
  `components${sep}ai-generator${sep}`,
]

/**
 * `storefront` rules are about taste, and the exempt trees are allowed their
 * own. `everywhere` rules are about the document being wrong — no surface gets
 * to opt out of those.
 *
 * The distinction is #631, and it exists because one flat exemption list let a
 * real rendering defect hide in the internal tools for months: the exemptions
 * were right about the palette and wrong about the weights, and nobody could
 * see the difference because the guard could not express it.
 */
type Scope = 'storefront' | 'everywhere'

const FORBIDDEN: Array<{ pattern: RegExp; why: string; scope: Scope }> = [
  {
    pattern: /\bfont-(bold|extrabold|black)\b/,
    /*
     * Not a preference. __root.tsx loads Poppins 300/400/500 and Urbanist
     * 300/500 — nothing above 500 exists in the document, so 700/800/900 are
     * drawn by the browser's synthetic-bold algorithm: the real glyphs smeared
     * wider and heavier than either face draws. An admin screen renders that
     * artefact exactly as badly as a product page does.
     */
    scope: 'everywhere',
    why: 'weight 700+ is never loaded (see the font link in __root.tsx), so this renders as synthesised faux-bold. Use font-medium, or nothing at all inside a heading — the base layer supplies Urbanist 300.',
  },
  {
    pattern: /\b(fill|text)-yellow-400\b/,
    scope: 'storefront',
    why: 'use the --rating token: fill-rating / text-rating. It holds the identical measured amber-500.',
  },
  {
    pattern: /\b(bg|from|to|ring|border)-brand-/,
    scope: 'storefront',
    why: 'the --brand-* scale is admin- and AI-generator-only now. Use primary / accent / ring.',
  },
  {
    pattern: /\bblur-3xl\b/,
    scope: 'storefront',
    why: 'the marketing blur-blob idiom, stripped for the monochrome system.',
  },
  {
    pattern: /\bbg-gradient-to-\w+ from-brand/,
    scope: 'storefront',
    why: 'brand gradients are retired. Use a SectionBand tone.',
  },
]

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const allFiles = walk(APP).map((f) => relative(APP, f))
const isExempt = (file: string) => EXEMPT.some((e) => file.includes(e))
const files = allFiles.filter((f) => !isExempt(f))

const scopeOf = (scope: Scope) => (scope === 'everywhere' ? allFiles : files)

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

  it('still exempts the internal tools from the storefront rules', () => {
    // The other half of the split: `everywhere` must not have quietly become
    // "everything", or the admin palette starts failing for no stated reason.
    expect(files).not.toContain(join('routes', 'admin', 'index.tsx'))
    expect(allFiles).toContain(join('routes', 'admin', 'index.tsx'))
  })

  for (const { pattern, why, scope } of FORBIDDEN) {
    it(`no ${pattern.source} (${scope})`, () => {
      const offenders = scopeOf(scope).filter((f) =>
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
