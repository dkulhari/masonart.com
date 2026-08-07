/**
 * The home page's Shop By Orientation chip row (#535).
 *
 * What is worth pinning here is not that six pills render. It is:
 *
 *   1. THE LIST IS A PROJECTION OF THE VOCABULARY. Every id in
 *      `ORIENTATION_OPTIONS` gets a chip and nothing else does, and the file
 *      holds no literal list of its own. That is the drift #395 ended: a home
 *      page advertising an orientation the API's zod enum would 400 on.
 *
 *   2. WHERE THE CHIPS GO. `?orientation=<id>` on `/posters`, with the id the
 *      database stores — not the caption. `portrait` is shown as "Vertical";
 *      a link that sent `vertical` would land on an unfiltered grid the
 *      shopper believes is filtered.
 *
 *   3. THE TWO DELIBERATE DIVERGENCES from the vocabulary — their running
 *      order, and "Circular" for the label the sidebar calls "Circle". Both
 *      are surface decisions, so if either is ever "tidied away" this fails
 *      rather than quietly repainting the band.
 *
 * Links are stubbed as anchors with `search` folded into the href, the same
 * way the mega-panel test does it: where a chip goes is the whole assertion,
 * so a stub that dropped `search` would leave it untestable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: Record<string, unknown>) => {
    const entries = Object.entries((search ?? {}) as Record<string, unknown>)
    const qs = new URLSearchParams(
      entries.map(([k, v]) => [k, String(v)])
    ).toString()
    return (
      <a href={qs ? `${to}?${qs}` : String(to)} {...(props as object)}>
        {children as React.ReactNode}
      </a>
    )
  },
}))

import {
  ShopByOrientationSection,
  ORIENTATION_CHIPS,
} from '~/components/home/ShopByOrientationSection'
import { ORIENTATION_OPTIONS } from '@chobii/shared'

const src = readFileSync(
  join(process.cwd(), 'app/components/home/ShopByOrientationSection.tsx'),
  'utf8'
)

const chips = () => screen.getAllByTestId('orientation-chip')

beforeEach(() => {
  render(<ShopByOrientationSection />)
})

describe('the list', () => {
  it('carries every orientation the vocabulary defines, and only those', () => {
    expect(chips().map((chip) => chip.getAttribute('data-orientation'))).toEqual(
      expect.arrayContaining(ORIENTATION_OPTIONS.map((option) => option.id))
    )
    expect(chips()).toHaveLength(ORIENTATION_OPTIONS.length)
  })

  it('reads the vocabulary rather than spelling the labels out', () => {
    expect(src).toContain('ORIENTATION_OPTIONS')
    // The one caption this surface owns is the documented override; no other
    // orientation word may be a literal in the component.
    for (const option of ORIENTATION_OPTIONS) {
      if (option.id === 'round') continue
      expect(src).not.toContain(`'${option.label}'`)
    }
  })

  it('runs in their order — Vertical first, Square second', () => {
    expect(chips().map((chip) => chip.textContent)).toEqual([
      'Vertical',
      'Square',
      'Horizontal',
      'Panoramic',
      'Circular',
      'Set of 2/3',
    ])
  })

  it('keeps a value the order does not name rather than dropping it', () => {
    const ranked = ['portrait', 'square', 'landscape', 'panoramic', 'round']
    const unranked = ORIENTATION_CHIPS.filter(
      (chip) => !ranked.includes(chip.id)
    )
    expect(unranked.map((chip) => chip.id)).toContain('set-of-2-3')
  })
})

describe('where a chip goes', () => {
  it('links to the catalogue filtered on the stored id, not the caption', () => {
    for (const option of ORIENTATION_OPTIONS) {
      const chip = chips().find(
        (node) => node.getAttribute('data-orientation') === option.id
      )
      expect(chip).toHaveAttribute('href', `/posters?orientation=${option.id}`)
    }
  })

  it('sends the panel-count value the sidebar type still omits', () => {
    const chip = chips().find(
      (node) => node.getAttribute('data-orientation') === 'set-of-2-3'
    )
    expect(chip).toHaveAttribute('href', '/posters?orientation=set-of-2-3')
  })
})

describe('the caption their two surfaces disagree about', () => {
  it('says Circular here while the vocabulary keeps Circle', () => {
    const round = ORIENTATION_OPTIONS.find((option) => option.id === 'round')
    expect(round?.label).toBe('Circle')
    expect(screen.getByText('Circular')).toBeInTheDocument()
  })
})

describe('the band', () => {
  it('names itself after its heading', () => {
    const section = screen.getByTestId('shop-by-orientation')
    const heading = screen.getByRole('heading', { name: 'Shop By Orientation' })
    expect(section).toHaveAttribute('aria-labelledby', heading.id)
  })
})

describe('the band pocket', () => {
  /**
   * Measured on mesonart's own orientation band on 2026-08-07 (#540):
   *
   *   1440   band 182.4px — a 50.4px title block, a 16px gap, the 52px chip
   *          row, and 64px below. No padding above: the rail before it brings
   *          its own bottom pocket.
   *   390    band 300.8px — 32px above the heading, 32px to the chips, three
   *          rows of chips, then 64px below.
   *
   * Ours was 306 at 1440 against their 182: SectionBand's `lg:py-24` put 96px
   * above and below a 114px content row. At 390 ours was 264 against their
   * 300 — the same band too SHORT, because the 64px under their chips was
   * being read as 32.
   */
  it('drops the top pocket at lg and keeps 64px under the chips', () => {
    expect(src).toMatch(/lg:pt-0/)
    expect(src).toMatch(/lg:pb-16/)
    expect(src).not.toMatch(/lg:py-24/)
  })

  it('keeps 32px above the heading and 64px below the chips under lg', () => {
    expect(src).toMatch(/\bpt-8\b/)
    expect(src).toMatch(/\bpb-16\b/)
    expect(src).toMatch(/sm:pt-8/)
    expect(src).toMatch(/sm:pb-16/)
  })

  it('sets the heading-to-chips gap at the measured 16px on desktop', () => {
    // Their title block and chip row are 16px apart at 1440; ours was 20.
    expect(src).toMatch(/lg:mt-4\b/)
  })
})
