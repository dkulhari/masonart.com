import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ProductFilters,
  type FilterState,
} from '~/components/product/ProductFilters'
import { FACET_GROUPS, AESTHETIC_OPTIONS } from '@chobii/shared'

const src = readFileSync(
  join(process.cwd(), 'app/components/product/ProductFilters.tsx'),
  'utf8'
)

const emptyFilters: FilterState = {
  styles: [],
  subjects: [],
  colors: [],
  rooms: [],
  vibe: [],
  aesthetic: [],
  medium: [],
}

describe('the vocabularies come from @chobii/shared', () => {
  it('imports them rather than redeclaring them', () => {
    expect(src).toContain('@chobii/shared')
  })

  it('declares no local option lists', () => {
    // Local literals here alongside the API's own idea of the vocabulary is
    // exactly the drift feature 3 exists to end. If this fails, someone has
    // started a fourth list.
    expect(src).not.toMatch(/const DEFAULT_(STYLE|SUBJECT|COLOR|ROOM)_OPTIONS/)
  })
})

describe('every facet group renders', () => {
  for (const group of FACET_GROUPS) {
    it(`renders the ${group.label} group`, () => {
      render(
        <ProductFilters filters={emptyFilters} onFiltersChange={() => {}} />
      )
      expect(screen.getByText(group.label)).toBeTruthy()
    })
  }
})

describe('orientation shows their labels over our stored ids', () => {
  it('renders Vertical, Horizontal and Circle', () => {
    render(<ProductFilters filters={emptyFilters} onFiltersChange={() => {}} />)
    for (const label of ['Vertical', 'Horizontal', 'Circle']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('does not show the raw stored ids', () => {
    render(<ProductFilters filters={emptyFilters} onFiltersChange={() => {}} />)
    expect(screen.queryByText('portrait')).toBeNull()
    expect(screen.queryByText('landscape')).toBeNull()
  })
})

describe('the new facets are wired end to end', () => {
  it('FilterState carries every multi facet', () => {
    for (const key of ['vibe', 'aesthetic', 'medium'] as const) {
      expect(emptyFilters[key]).toBeDefined()
    }
  })

  it('ticking an aesthetic reports it upward', () => {
    const onFiltersChange = vi.fn()
    render(
      <ProductFilters
        filters={emptyFilters}
        onFiltersChange={onFiltersChange}
      />
    )

    // Aesthetic is collapsed by default — ten groups open at once makes the
    // rail unusable — so open it first.
    fireEvent.click(screen.getByRole('button', { name: /Aesthetic/ }))

    const first = AESTHETIC_OPTIONS[0]!
    fireEvent.click(screen.getByLabelText(first.label))

    expect(onFiltersChange).toHaveBeenCalled()
    const next = onFiltersChange.mock.calls[0]?.[0] as FilterState
    expect(next.aesthetic).toContain(first.id)
  })

  it('clear-all clears the new facets too', () => {
    // A filter the clear-all handler forgets is a filter the shopper cannot
    // remove without editing the URL.
    for (const key of ['vibe', 'aesthetic', 'medium', 'uniqueness', 'availability']) {
      expect(src, `clear-all does not reset ${key}`).toMatch(
        new RegExp(`${key}:\\s*(\\[\\]|undefined)`)
      )
    }
  })
})

describe('token compliance', () => {
  it('has no font-bold and no brand utilities', () => {
    expect(src).not.toContain('font-bold')
    expect(src).not.toMatch(/\b(bg|text|border|from|to)-brand-/)
  })
})

/**
 * The measured mesonart rail (#415). Numbers came off their live collection
 * page at 1440px on 2026-08-04, read as computed styles rather than eyeballed:
 * a 300px column with no box, no radius and no inner scroll; group titles at
 * the body weight; counts inline in parentheses at 60% opacity; option rows
 * with no padding and no hover fill; a 5px checkbox.
 *
 * Their rail also renders in a serif (`AtacamaTrial VAR`) — a trial-licensed
 * face, and the only text on their site that is neither Poppins nor Urbanist.
 * We match their metrics on Poppins and leave the face alone.
 */
describe('the rail carries their chrome, not ours', () => {
  const routeSrc = readFileSync(
    join(process.cwd(), 'app/routes/posters/index.tsx'),
    'utf8'
  )

  const styleGroup = FACET_GROUPS.find((group) => group.key === 'styles')!
  const firstStyle = styleGroup.options[0]

  it('renders no header row on the desktop rail', () => {
    // Active filters are already removable as chips above the grid, so the
    // rail's own "Filters / Clear all" row is a second, redundant affordance.
    render(<ProductFilters filters={emptyFilters} onFiltersChange={() => {}} />)

    expect(screen.queryByRole('heading', { name: 'Filters' })).toBeNull()
    expect(screen.queryByText('Clear all')).toBeNull()
  })

  it('keeps the header in the mobile drawer', () => {
    // The drawer has no chips above it and no other way out.
    render(
      <ProductFilters
        filters={{ ...emptyFilters, styles: [firstStyle.id] }}
        onFiltersChange={() => {}}
        isMobile
      />
    )

    expect(screen.getByRole('heading', { name: 'Filters' })).toBeTruthy()
    expect(screen.getByText('Clear all')).toBeTruthy()
  })

  it('renders group titles at the body weight', () => {
    render(<ProductFilters filters={emptyFilters} onFiltersChange={() => {}} />)

    expect(screen.getByText(styleGroup.label).className).not.toContain(
      'font-medium'
    )
  })

  it('carries no per-group count badge', () => {
    render(
      <ProductFilters
        filters={{ ...emptyFilters, styles: [firstStyle.id] }}
        onFiltersChange={() => {}}
      />
    )

    const head = screen.getByText(styleGroup.label).closest('button')
    expect(head?.textContent?.trim()).toBe(styleGroup.label)
  })

  it('prints the option count inline in parentheses', () => {
    render(
      <ProductFilters
        filters={emptyFilters}
        onFiltersChange={() => {}}
        facetCounts={{ styles: new Map([[firstStyle.id, 9]]) }}
      />
    )

    expect(screen.getByText('(9)')).toBeTruthy()
  })

  it('gives option rows no padding and no hover fill', () => {
    render(<ProductFilters filters={emptyFilters} onFiltersChange={() => {}} />)

    const row = screen.getByText(firstStyle.label).closest('label')
    expect(row?.className).not.toContain('hover:bg-accent')
    expect(row?.className).not.toContain('px-2')
  })

  it('sets the checkbox to the measured 5px radius', () => {
    render(<ProductFilters filters={emptyFilters} onFiltersChange={() => {}} />)

    const box = screen
      .getByText(firstStyle.label)
      .closest('label')
      ?.querySelector('div')
    expect(box?.className).toContain('rounded-[5px]')
  })

  it('strips the box and the inner scroll off the desktop rail', () => {
    expect(routeSrc).not.toMatch(/rounded-lg border border-border/)
    expect(routeSrc).not.toContain('max-h-[calc(100vh-6rem)]')
    expect(routeSrc).toContain('w-[300px]')
  })
})
