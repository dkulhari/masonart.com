/**
 * Home page — one type scale, one alignment, one button system (#540).
 *
 * The band tickets (#529-#539) each measured their own band against
 * mesonart and landed independently. This suite is the cross-band pass: it
 * reads every home band's source at once and fails when one of them invents
 * its own heading size, centres a heading the rest of the page left-aligns,
 * or reaches for a button scale that is not the measured pill.
 *
 * Source-level rather than rendered, for the reason home-tokens.test.ts
 * gives: `routes/index.tsx` calls `createFileRoute` and a server function at
 * module scope, so it cannot be imported into jsdom without a router. The
 * question here — which classes the page reaches for — is one the source
 * answers directly, and it answers it for all eleven bands in one pass
 * rather than eleven rendered suites.
 *
 * Measured contract, off mesonart's own home page in a real browser at 1440
 * and 390 (2026-08-07):
 *
 *   band heading   `text-section` — 42px at 1440, 24px at 390, weight 300
 *   alignment      left, at the page gutter, on every band
 *   button         outline pill, h-14, 26px of padding, label at body weight
 *
 * `text-section` and not `text-display`: their band headings are a step under
 * their page titles. Every band here used to carry the H1 token and rendered
 * 44px / 28px against their 42 / 24. See --font-section-size in globals.css.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HOME_DIR = join(process.cwd(), 'app/components/home')

const bandSources = new Map<string, string>([
  ['routes/index.tsx', readFileSync(join(process.cwd(), 'app/routes/index.tsx'), 'utf8')],
  ...readdirSync(HOME_DIR)
    .filter((f) => f.endsWith('.tsx'))
    .map(
      (f) => [`components/home/${f}`, readFileSync(join(HOME_DIR, f), 'utf8')] as const
    ),
])

/** Every `<DisplayHeading …>` open tag in a file, whitespace collapsed. */
function displayHeadings(src: string): string[] {
  return [...src.matchAll(/<DisplayHeading[\s\S]*?>/g)].map((m) =>
    m[0].replace(/\s+/g, ' ')
  )
}

/** Every `buttonVariants({ … })` call in a file, whitespace collapsed. */
function buttonCalls(src: string): string[] {
  return [...src.matchAll(/buttonVariants\(\{[\s\S]*?\}\)/g)].map((m) =>
    m[0].replace(/\s+/g, ' ')
  )
}

/**
 * Bands whose heading is deliberately off the page scale, with the reason.
 *
 * BrandStory is the reference's own exception: their brand panel sets its
 * heading at ~32px mobile / ~48px desktop, a step above every other band, and
 * matching the page scale there would be the deviation.
 */
const HEADING_SCALE_EXCEPTIONS = new Set(['components/home/BrandStorySection.tsx'])

/**
 * Buttons deliberately off the pill scale, with the reason.
 *
 * The hero CTA is measured at 230x45 desktop / h-10 mobile with a 1px border,
 * because it sits on a photograph rather than on the page — see the comment at
 * its call site. `size: 'icon'` is the carousel affordance, a different shape
 * on the reference too.
 */
const BUTTON_SCALE_EXCEPTIONS = new Set(['components/home/HomeHero.tsx'])

describe('home page — one type scale across the bands', () => {
  it('sets every band heading at text-section', () => {
    const offScale: string[] = []

    for (const [name, src] of bandSources) {
      if (HEADING_SCALE_EXCEPTIONS.has(name)) continue
      for (const tag of displayHeadings(src)) {
        if (!tag.includes('text-section')) offScale.push(`${name}: ${tag}`)
      }
    }

    expect(offScale).toEqual([])
  })

  it('leaves the H1 scale to page titles, not band headings', () => {
    const onDisplayScale: string[] = []

    for (const [name, src] of bandSources) {
      for (const tag of displayHeadings(src)) {
        if (tag.includes('text-display')) onDisplayScale.push(`${name}: ${tag}`)
      }
    }

    expect(onDisplayScale).toEqual([])
  })

  it('carries no ad-hoc text-* size on a band heading', () => {
    const sized: string[] = []

    for (const [name, src] of bandSources) {
      if (HEADING_SCALE_EXCEPTIONS.has(name)) continue
      for (const tag of displayHeadings(src)) {
        // `text-section` itself is the only text-* size allowed here.
        const sizes = [...tag.matchAll(/\btext-(xs|sm|base|lg|\d?xl)\b/g)].map(
          (m) => m[0]
        )
        if (sizes.length > 0) sized.push(`${name}: ${sizes.join(' ')}`)
      }
    }

    expect(sized).toEqual([])
  })

  it('declares the section scale as a measured token', () => {
    const css = readFileSync(join(process.cwd(), 'app/styles/globals.css'), 'utf8')
    const tw = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8')

    // 24px at 390 and 42px at 1440, both measured in a browser on their page.
    expect(css).toMatch(
      /--font-section-size:\s*clamp\(1\.5rem,\s*1\.082rem \+ 1\.714vw,\s*2\.8125rem\)/
    )
    expect(tw).toMatch(/section: 'var\(--font-section-size\)'/)
  })
})

describe('home page — headings are left-aligned', () => {
  it('centres no band heading', () => {
    const centred: string[] = []

    for (const [name, src] of bandSources) {
      for (const tag of displayHeadings(src)) {
        if (tag.includes('text-center')) centred.push(`${name}: ${tag}`)
      }
    }

    expect(centred).toEqual([])
  })

  it('wraps no band heading in a centring container', () => {
    // The newsletter band used to sit in `mx-auto max-w-2xl text-center`,
    // which centred the heading without the heading itself saying so.
    const src = bandSources.get('routes/index.tsx') ?? ''
    expect(src).not.toMatch(/mx-auto max-w-2xl text-center/)
  })
})

describe('home page — one button system', () => {
  it('gives every outline CTA the measured pill scale', () => {
    const offScale: string[] = []

    for (const [name, src] of bandSources) {
      if (BUTTON_SCALE_EXCEPTIONS.has(name)) continue
      for (const call of buttonCalls(src)) {
        if (!call.includes("variant: 'outline'")) continue
        if (!/size: '(pill|icon)'/.test(call)) offScale.push(`${name}: ${call}`)
      }
    }

    expect(offScale).toEqual([])
  })

  it('sets the newsletter submit at the pill scale too', () => {
    const src = bandSources.get('routes/index.tsx') ?? ''
    expect(src).toMatch(/<Button[^>]*size="pill"/)
  })

  it('matches the field height to the button it sits beside', () => {
    // A h-11 input against a h-14 button reads as two systems on one row.
    const src = bandSources.get('routes/index.tsx') ?? ''
    expect(src).not.toMatch(/type="email"[\s\S]*?\bh-11\b/)
    expect(src).toMatch(/type="email"[\s\S]*?\bh-14\b/)
  })
})
