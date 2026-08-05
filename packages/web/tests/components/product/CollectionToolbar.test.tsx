import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  CollectionToolbar,
  SORT_OPTIONS,
} from '~/components/product/CollectionToolbar'

const noop = () => {}

const defaults = {
  totalProducts: 3878,
  sortId: 'createdAt-desc',
  onSortChange: noop,
  filtersHidden: false,
  onToggleFilters: noop,
}

describe('result count', () => {
  it('shows the total, which the header band no longer carries', () => {
    render(<CollectionToolbar {...defaults} />)
    expect(screen.getByText(/3,?878 products/)).toBeTruthy()
  })

  it('singularises one product', () => {
    render(<CollectionToolbar {...defaults} totalProducts={1} />)
    expect(screen.getByText(/1 product$/)).toBeTruthy()
  })

  it('says none rather than "0 products"', () => {
    render(<CollectionToolbar {...defaults} totalProducts={0} />)
    expect(screen.getByText(/No products/i)).toBeTruthy()
  })
})

describe('sort', () => {
  it('offers eight sort options', () => {
    // mesonart has nine (§1.3.5). The one we do not carry is "Most
    // relevant": on a collection page with no search query there is nothing
    // for relevance to mean, and a composite editorial score would be our
    // heuristic dressed as a measurement.
    expect(SORT_OPTIONS).toHaveLength(8)
  })

  it('offers Featured and Best selling', () => {
    const ids = SORT_OPTIONS.map((option) => option.id)
    expect(ids).toContain('featuredOrder-asc')
    expect(ids).toContain('salesCount-desc')
  })

  it('leads with Featured, the way a merchandised grid opens', () => {
    expect(SORT_OPTIONS[0]?.id).toBe('featuredOrder-asc')
  })

  it('keeps the sortBy-sortOrder id contract the route splits on', () => {
    // routes/posters/index.tsx does `sortId.split('-')`. An id with any
    // other shape silently produces an undefined sortOrder.
    for (const option of SORT_OPTIONS) {
      const parts = option.id.split('-')
      expect(parts).toHaveLength(2)
      expect(['asc', 'desc']).toContain(parts[1])
    }
  })

  it('reports Best selling by its sortBy value', () => {
    const onSortChange = vi.fn()
    render(<CollectionToolbar {...defaults} onSortChange={onSortChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Sort by/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Best selling' }))

    expect(onSortChange).toHaveBeenCalledWith('salesCount-desc')
  })

  it('names the current sort on the trigger', () => {
    render(<CollectionToolbar {...defaults} sortId="basePrice-asc" />)
    expect(screen.getByRole('button', { name: /Price: Low to High/ })).toBeTruthy()
  })

  it('opens and reports a chosen option', () => {
    const onSortChange = vi.fn()
    render(<CollectionToolbar {...defaults} onSortChange={onSortChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Sort by/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Price: High to Low' }))

    expect(onSortChange).toHaveBeenCalledWith('basePrice-desc')
  })

  it('is a pill, not a rounded rectangle', () => {
    render(<CollectionToolbar {...defaults} />)
    expect(
      screen.getByRole('button', { name: /Sort by/ }).className
    ).toContain('rounded-pill')
  })
})

describe('hide filters', () => {
  it('reports the toggle', () => {
    const onToggleFilters = vi.fn()
    render(<CollectionToolbar {...defaults} onToggleFilters={onToggleFilters} />)

    fireEvent.click(screen.getByRole('button', { name: /Hide filters/i }))
    expect(onToggleFilters).toHaveBeenCalled()
  })

  it('flips its label when filters are hidden', () => {
    render(<CollectionToolbar {...defaults} filtersHidden />)
    expect(screen.getByRole('button', { name: /Show filters/i })).toBeTruthy()
  })

  it('exposes state via aria-expanded on the sidebar it controls', () => {
    render(<CollectionToolbar {...defaults} />)
    const toggle = screen.getByRole('button', { name: /Hide filters/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-controls')).toBeTruthy()
  })
})

describe('placement', () => {
  it('is sticky and clears the sticky header rather than sitting under it', () => {
    const { container } = render(<CollectionToolbar {...defaults} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('sticky')
    // The site header is `sticky top-0` at h-16; a toolbar at top-0 would be
    // hidden behind it.
    expect(root.className).toMatch(/top-1[0-9]|top-\[/)
  })

  it('follows the revealed chrome rather than a fixed offset (#421)', () => {
    // The header's nav rows reveal on scroll up. Pinned to the collapsed
    // height, the revealed styles row lands on top of the Hide-filters button.
    const { container } = render(<CollectionToolbar {...defaults} />)
    const root = container.firstElementChild as HTMLElement

    expect(root.className).toContain('top-[var(--chrome-offset)]')
    // Moves with the reveal instead of jumping under it.
    expect(root.className).toContain('transition-[top]')
    expect(root.className).toContain('motion-reduce:transition-none')
  })
})

/**
 * The measured mesonart toolbar (#416), read as computed styles off their live
 * collection page on 2026-08-04.
 *
 * Both controls are 56px pills at the body weight, not our 36px `size="sm"` at
 * 500. The count sits beside the Hide-filters pill rather than floating to the
 * centre of a `justify-between` row. And the sort menu is not a popover: the
 * pill itself grows from 180x56 to 320x469 and its radius relaxes from 60px to
 * 32px, over a black surface with white content.
 */
describe('the measured pill scale', () => {
  it('renders both controls at the 56px pill height', () => {
    render(<CollectionToolbar {...defaults} />)

    for (const name of [/Hide filters/i, /Sort by/]) {
      expect(screen.getByRole('button', { name }).className).toContain('h-14')
    }
  })

  it('sets button labels at the body weight, not medium', () => {
    render(<CollectionToolbar {...defaults} />)
    expect(
      screen.getByRole('button', { name: /Sort by/ }).className
    ).toContain('font-normal')
  })

  it('marks the sort trigger with a dot, not a chevron', () => {
    render(<CollectionToolbar {...defaults} />)
    const trigger = screen.getByRole('button', { name: /Sort by/ })

    expect(trigger.textContent).toContain('•')
    expect(trigger.querySelector('svg')).toBeNull()
  })

  it('keeps the count beside the toggle rather than centred', () => {
    const { container } = render(<CollectionToolbar {...defaults} />)
    const root = container.firstElementChild as HTMLElement

    // `justify-between` pushes a three-child row to both edges and drops the
    // count in the middle of the page. Theirs grows off the left group.
    expect(root.className).not.toContain('justify-between')
    expect(screen.getByText(/3,?878 products/).className).toContain('grow')
  })

  it('carries no bottom rule', () => {
    const { container } = render(<CollectionToolbar {...defaults} />)
    expect((container.firstElementChild as HTMLElement).className).not.toContain(
      'border-b'
    )
  })
})

describe('the sort menu is the pill, not a popover', () => {
  const openSort = () => {
    render(<CollectionToolbar {...defaults} />)
    fireEvent.click(screen.getByRole('button', { name: /Sort by/ }))
    return screen.getByRole('listbox')
  }

  it('renders a black surface with no shadow', () => {
    const panel = openSort()

    expect(panel.className).toContain('bg-primary')
    expect(panel.className).not.toContain('shadow')
  })

  it('relaxes the pill radius as it grows', async () => {
    const panel = openSort()

    // Mounts at the pill's own radius so there is something to interpolate
    // from — the morph is the point, and a panel that appears at its final
    // shape is just a popover with different corners.
    expect(panel.className).toContain('rounded-pill')
    await waitFor(() => expect(panel.className).toContain('rounded-[32px]'))
  })

  it('heads the panel with a tracked caps label', () => {
    openSort()
    const label = screen.getByText('Sort by', { selector: 'span' })

    expect(label.className).toContain('uppercase')
    expect(label.className).toContain('tracking-')
  })

  it('offers a close button', () => {
    openSort()
    fireEvent.click(screen.getByRole('button', { name: /close sort/i }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('dims the current option rather than ticking it', () => {
    openSort()
    const current = screen.getByRole('option', { name: 'Newest First' })

    expect(current.getAttribute('aria-selected')).toBe('true')
    expect(current.className).toMatch(/\/50\b/)
    expect(current.querySelector('svg')).toBeNull()
  })

  it('does not open on hover — the wipe is the only hover effect', () => {
    render(<CollectionToolbar {...defaults} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Sort by/ }))

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('still closes on Escape', () => {
    openSort()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
