/**
 * The All Art mega panel (#476).
 *
 * mesonart's own All Art entry is not a link to a collection, it is the door
 * to the whole filter vocabulary. What this file pins is that the door opens,
 * that every option behind it goes to the parameter `/posters` actually
 * accepts, and that the vocabulary comes from `@chobii/shared` rather than a
 * literal list here — the drift #395 ended.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The panel is made of TanStack Links, which need a router this test has no
// use for. Stub them as anchors, but fold `search` into the href — where a
// link GOES is the whole point of the panel, so a stub that dropped it would
// leave the interesting assertion untestable.
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

import { AllArtMegaMenu } from '~/components/layout/AllArtMegaMenu'
import { CATEGORY_TILES } from '~/lib/homeCategories'
import {
  STYLE_OPTIONS,
  SUBJECT_OPTIONS,
  ORIENTATION_OPTIONS,
  COLOR_OPTIONS,
} from '@chobii/shared'

const src = readFileSync(
  join(process.cwd(), 'app/components/layout/AllArtMegaMenu.tsx'),
  'utf8'
)

const root = () => screen.getByTestId('all-art-mega')
const panel = () => screen.getByTestId('all-art-mega-panel')

beforeEach(() => {
  render(<AllArtMegaMenu />)
})

describe('the trigger', () => {
  it('stays a real link to the unfiltered collection', () => {
    const trigger = screen.getByTestId('all-art-mega-trigger')
    expect(trigger).toHaveAttribute('href', '/posters')
  })

  it('starts closed', () => {
    expect(root()).toHaveAttribute('data-open', 'false')
  })

  it('opens on hover, the way theirs does', () => {
    fireEvent.mouseEnter(root())
    expect(root()).toHaveAttribute('data-open', 'true')
  })

  it('says whether it is expanded', () => {
    const trigger = screen.getByTestId('all-art-mega-trigger')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.mouseEnter(root())
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('closing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fireEvent.mouseEnter(root())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Run the grace window out. */
  const waitOutGrace = () => act(() => void vi.advanceTimersByTime(400))

  it('closes when the pointer leaves', () => {
    fireEvent.mouseLeave(root())
    waitOutGrace()
    expect(root()).toHaveAttribute('data-open', 'false')
  })

  it('does not close the instant the pointer leaves', () => {
    // The trigger is in the nav row and the panel hangs below it; the strip
    // between them belongs to neither, and closing on `mouseleave` alone made
    // the panel vanish the moment you set off towards it.
    fireEvent.mouseLeave(root())
    act(() => void vi.advanceTimersByTime(50))
    expect(root()).toHaveAttribute('data-open', 'true')
  })

  it('cancels the close if the pointer comes back', () => {
    fireEvent.mouseLeave(root())
    act(() => void vi.advanceTimersByTime(50))
    fireEvent.mouseEnter(root())
    waitOutGrace()
    expect(root()).toHaveAttribute('data-open', 'true')
  })

  it('closes on Escape', () => {
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(root()).toHaveAttribute('data-open', 'false')
  })

  it('closes when something outside it is pressed', () => {
    fireEvent.pointerDown(document.body)
    expect(root()).toHaveAttribute('data-open', 'false')
  })

  it('keeps the panel out of the tab order while closed', () => {
    fireEvent.mouseLeave(root())
    waitOutGrace()
    // `invisible` is what drops the nav rows' links out of the tab order
    // (#421); the panel earns its keyboard behaviour the same way.
    expect(panel().className).toContain('invisible')
  })
})

describe('the five columns', () => {
  beforeEach(() => {
    fireEvent.mouseEnter(root())
  })

  it('names all five headings, in mesonart’s order', () => {
    const headings = screen
      .getAllByTestId('all-art-column-heading')
      .map((el) => el.textContent?.trim())
    expect(headings).toEqual([
      'All Artwork',
      'Style',
      'Subject',
      'Orientation',
      'Color',
    ])
  })

  it('carries every style, as a link to ?styles=', () => {
    const column = screen.getByTestId('all-art-column-style')
    for (const style of STYLE_OPTIONS) {
      expect(
        within(column).getByRole('link', { name: style.label })
      ).toHaveAttribute('href', `/posters?styles=${style.id}`)
    }
  })

  it('carries every subject, as a link to ?subjects=', () => {
    const column = screen.getByTestId('all-art-column-subject')
    for (const subject of SUBJECT_OPTIONS) {
      expect(
        within(column).getByRole('link', { name: subject.label })
      ).toHaveAttribute('href', `/posters?subjects=${subject.id}`)
    }
  })

  it('sends orientation to the single-valued parameter, not a list', () => {
    const column = screen.getByTestId('all-art-column-orientation')
    for (const orientation of ORIENTATION_OPTIONS) {
      expect(
        within(column).getByRole('link', { name: orientation.label })
      ).toHaveAttribute('href', `/posters?orientation=${orientation.id}`)
    }
  })

  it('carries every colour, as a link to ?colors=', () => {
    const column = screen.getByTestId('all-art-column-color')
    for (const color of COLOR_OPTIONS) {
      expect(
        within(column).getByRole('link', { name: color.label })
      ).toHaveAttribute('href', `/posters?colors=${color.id}`)
    }
  })

  it('offers the collection entry points where theirs lists monthly drops', () => {
    const column = screen.getByTestId('all-art-column-all-artwork')
    // A bare /posters, so arriving from a filtered view clears the facets.
    expect(
      within(column).getByRole('link', { name: 'All Art' })
    ).toHaveAttribute('href', '/posters')
    expect(
      within(column).getByRole('link', { name: 'New In' })
    ).toHaveAttribute('href', '/posters?sortBy=createdAt&sortOrder=desc')
    expect(
      within(column).getByRole('link', { name: 'Best Sellers' })
    ).toHaveAttribute('href', '/posters?sortBy=salesCount&sortOrder=desc')
  })

  it('reads the vocabulary from the shared module, never a literal here', () => {
    for (const name of [
      'STYLE_OPTIONS',
      'SUBJECT_OPTIONS',
      'ORIENTATION_OPTIONS',
      'COLOR_OPTIONS',
    ]) {
      expect(src).toContain(name)
    }
    expect(src).not.toContain(STYLE_OPTIONS[1].label)
    expect(src).not.toContain(COLOR_OPTIONS[0].label)
  })
})

describe('the promo column', () => {
  beforeEach(() => {
    fireEvent.mouseEnter(root())
  })

  it('shows two cards, fed from the curated tiles', () => {
    const cards = screen.getAllByTestId('all-art-promo-card')
    expect(cards).toHaveLength(2)

    const [first, second] = CATEGORY_TILES
    expect(cards[0]).toHaveAttribute(
      'href',
      `/posters?${first.group}=${first.id}`
    )
    expect(cards[1]).toHaveAttribute(
      'href',
      `/posters?${second.group}=${second.id}`
    )
    expect(within(cards[0]).getByRole('img')).toHaveAttribute(
      'src',
      first.image
    )
  })

  it('promises nothing the catalogue cannot keep', () => {
    // The sale strip stayed out of this feature because no promotion entity
    // exists. A promo card is not a licence to invent one.
    expect(src).not.toMatch(/% ?off|sale ends|hurry|limited time/i)
  })
})

describe('the measured surface', () => {
  it('opens on their curve, over their duration', () => {
    expect(src).toContain('cubic-bezier(0.6, 0, 0.4, 1)')
    expect(src).toMatch(/duration-500/)
  })

  it('wipes the underline in on hover, on their second curve', () => {
    expect(src).toContain('cubic-bezier(0.3,1,0.3,1)')
  })

  it('lays the link block and the promo column out 4fr to 1fr', () => {
    expect(src).toContain('grid-cols-[4fr_1fr]')
  })

  it('respects reduced motion', () => {
    expect(src).toContain('motion-reduce:transition-none')
  })
})
