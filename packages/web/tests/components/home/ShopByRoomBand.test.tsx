/**
 * The home page's Shop by Room split band (#532).
 *
 * What is worth pinning here is not that seven rows render. It is:
 *
 *   1. THE LABELS ARE A PROJECTION OF THE VOCABULARY. Every row's caption
 *      comes from `ROOM_OPTIONS` in `@chobii/shared` and the component holds
 *      no room word of its own. A band that typed its own labels could drift
 *      from the ids the API validates — the same drift #395 ended for
 *      orientation and #452 for the category tiles.
 *
 *   2. WHERE A ROW GOES. `?rooms=<id>` on `/posters`, with the id the database
 *      stores. A link carrying anything else lands on an unfiltered grid the
 *      shopper believes is filtered.
 *
 *   3. THE COUNTS ARE THE API'S OR THEY ARE ABSENT. The number printed is the
 *      facet count verbatim, a room the facets do not answer for gets no
 *      superscript, and a failed call costs the band its numbers rather than
 *      its existence. Nothing rounds, estimates or falls back to zero.
 *
 *   4. THE PLACEHOLDER PHOTOGRAPHY HAS EXACTLY ONE ADDRESS. Every
 *      `/dev-reference/` path lives in `ROOM_PHOTOS`, so replacing mesonart's
 *      pictures with ours (#544) is one object literal. A path that leaked
 *      into the JSX would survive that edit.
 *
 * Links are stubbed as anchors with `search` folded into the href, the same
 * way the orientation band's test does it: where a row goes is half the
 * assertion, and a stub that dropped `search` would leave it untestable.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  ShopByRoomBandView,
  resolveRoomCards,
  ROOM_BAND_ORDER,
  ROOM_PHOTOS,
  type RoomCounts,
} from '~/components/home/ShopByRoomBand'
import { ROOM_OPTIONS } from '@chobii/shared'

const src = readFileSync(
  join(process.cwd(), 'app/components/home/ShopByRoomBand.tsx'),
  'utf8'
)

/** What `/api/products/facets` answers with today, narrowed to rooms. */
const REAL_COUNTS: RoomCounts = new Map([
  ['living-room', 6],
  ['entryway', 9],
  ['executive-office', 6],
  ['bathroom', 6],
  ['reading-nook', 6],
  ['dining-room', 8],
  ['nursery-and-kids-room', 7],
])

const label = (id: string) =>
  ROOM_OPTIONS.find((option) => option.id === id)?.label ?? id

const renderBand = (counts?: RoomCounts) =>
  render(<ShopByRoomBandView rooms={resolveRoomCards(counts)} />)

const rows = () => screen.getAllByTestId('shop-by-room-link')

// ============================================================================

describe('the list', () => {
  it('captions every row from the shared vocabulary', () => {
    renderBand(REAL_COUNTS)
    expect(rows().map((row) => row.getAttribute('data-room'))).toEqual([
      ...ROOM_BAND_ORDER,
    ])
    // Not `getByText`: the active room's name is also laid over the
    // photograph, so every caption legitimately appears twice.
    for (const row of rows()) {
      const id = row.getAttribute('data-room')!
      expect(row.textContent).toContain(label(id))
    }
  })

  it('spells no room word of its own', () => {
    expect(src).toContain('ROOM_OPTIONS')
    for (const option of ROOM_OPTIONS) {
      expect(src).not.toContain(`'${option.label}'`)
    }
  })

  it('drops a room the vocabulary does not know rather than captioning it', () => {
    const stray = 'wine-cellar'
    expect(ROOM_OPTIONS.map((option) => option.id)).not.toContain(stray)
    expect(resolveRoomCards().map((card) => card.id)).not.toContain(stray)
  })
})

describe('where a row goes', () => {
  it('links to the catalogue filtered on the stored id', () => {
    renderBand(REAL_COUNTS)
    for (const row of rows()) {
      const id = row.getAttribute('data-room')
      expect(row).toHaveAttribute('href', `/posters?rooms=${id}`)
    }
  })

  it('sends the photograph half to the room it is showing', () => {
    renderBand(REAL_COUNTS)
    expect(screen.getByTestId('shop-by-room-photo-link')).toHaveAttribute(
      'href',
      `/posters?rooms=${ROOM_BAND_ORDER[0]}`
    )
  })
})

describe('the counts', () => {
  it('prints the facet count verbatim', () => {
    renderBand(REAL_COUNTS)
    const printed = screen
      .getAllByTestId('shop-by-room-count')
      .map((node) => node.textContent?.replace(' posters', ''))
    expect(printed).toEqual(
      ROOM_BAND_ORDER.map((id) => String(REAL_COUNTS.get(id)))
    )
  })

  it('says nothing at all for a room the facets do not answer for', () => {
    renderBand(new Map([['living-room', 6]]))
    const counts = screen.getAllByTestId('shop-by-room-count')
    expect(counts).toHaveLength(1)
    expect(counts[0]?.textContent).toContain('6')
  })

  it('keeps the band when the facets call fails, and loses only the numbers', () => {
    renderBand(undefined)
    expect(rows()).toHaveLength(ROOM_BAND_ORDER.length)
    expect(screen.queryAllByTestId('shop-by-room-count')).toHaveLength(0)
  })

  it('never invents a zero', () => {
    expect(src).not.toContain('?? 0')
    expect(src).not.toContain('|| 0')
  })
})

describe('the photograph', () => {
  it('has one address, and it is the constant', () => {
    for (const id of ROOM_BAND_ORDER) {
      expect(ROOM_PHOTOS[id]).toBeDefined()
    }
    // Every dev-reference path in the file is a value of ROOM_PHOTOS; none has
    // escaped into the JSX, so #544's swap is one object literal.
    const paths = src.match(/'\/dev-reference\/[^']+'/g) ?? []
    expect(paths).toHaveLength(Object.keys(ROOM_PHOTOS).length)
  })

  it('drops a room with no photograph rather than rendering a broken tile', () => {
    const orphan = ROOM_BAND_ORDER.find((id) => !ROOM_PHOTOS[id])
    expect(orphan).toBeUndefined()
    expect(resolveRoomCards().every((card) => card.photo)).toBe(true)
  })

  it('starts on the first room and swaps to whichever row is hovered', () => {
    renderBand(REAL_COUNTS)
    const photo = screen.getByTestId('shop-by-room-photo')
    expect(photo).toHaveAttribute('data-room', ROOM_BAND_ORDER[0])

    const bathroom = rows().find(
      (row) => row.getAttribute('data-room') === 'bathroom'
    )!
    fireEvent.mouseEnter(bathroom)

    expect(screen.getByTestId('shop-by-room-photo')).toHaveAttribute(
      'data-room',
      'bathroom'
    )
    expect(bathroom).toHaveAttribute('data-active', 'true')
  })

  it('swaps on keyboard focus too, not only on a cursor', () => {
    renderBand(REAL_COUNTS)
    const entryway = rows().find(
      (row) => row.getAttribute('data-room') === 'entryway'
    )!
    fireEvent.focus(entryway)
    expect(screen.getByTestId('shop-by-room-photo')).toHaveAttribute(
      'data-room',
      'entryway'
    )
  })

  it('keeps a photograph mounted once it has been looked at', () => {
    renderBand(REAL_COUNTS)
    const photo = () => screen.getByTestId('shop-by-room-photo')
    expect(photo().querySelectorAll('img')).toHaveLength(1)

    fireEvent.mouseEnter(
      rows().find((row) => row.getAttribute('data-room') === 'dining-room')!
    )
    fireEvent.mouseEnter(
      rows().find((row) => row.getAttribute('data-room') === 'bathroom')!
    )

    // First room, dining room, bathroom — the first is pinned because it is
    // the one in normal flow that gives the band its height.
    expect(photo().querySelectorAll('img')).toHaveLength(3)
  })
})

describe('the band', () => {
  it('names itself after its heading', () => {
    renderBand(REAL_COUNTS)
    const section = screen.getByTestId('shop-by-room')
    const heading = screen.getByRole('heading', { name: 'Shop by Room' })
    expect(section).toHaveAttribute('aria-labelledby', heading.id)
  })

  it('renders nothing rather than a list with no photograph beside it', () => {
    const { container } = render(<ShopByRoomBandView rooms={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
