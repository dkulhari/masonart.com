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
