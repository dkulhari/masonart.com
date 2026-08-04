import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  it('offers the six sort options', () => {
    expect(SORT_OPTIONS).toHaveLength(6)
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
})
