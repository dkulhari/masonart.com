/**
 * The mobile facet sheet (#602).
 *
 * Measured on mesonart's `FacetDrawerSticky` at 390px on 2026-08-13, read as
 * computed styles rather than eyeballed: the panel is anchored to the bottom
 * edge, capped at `calc(100% - 60px)`, rounded `20px 20px 0 0`, moving on
 * `transform .6s cubic-bezier(.7,0,.2,1)`; the overlay is rgba(23,23,23,0.7);
 * the trigger is a fixed 56px near-black pill 20px off the bottom of the
 * viewport; sort leads the panel and a pinned footer closes it with the result
 * count on the button.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FilterSortButton,
  FilterSortDrawer,
} from '~/components/product/FilterSortDrawer'
import { SORT_OPTIONS } from '~/components/product/CollectionToolbar'
import type { FilterState } from '~/components/product/ProductFilters'

const src = readFileSync(
  join(process.cwd(), 'app/components/product/FilterSortDrawer.tsx'),
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

function renderDrawer(overrides: Record<string, unknown> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    filters: emptyFilters,
    onFiltersChange: vi.fn(),
    sortId: 'createdAt-desc',
    onSortChange: vi.fn(),
    totalProducts: 3991,
    onRemoveFilter: vi.fn(),
    ...overrides,
  }
  render(<FilterSortDrawer {...(props as never)} />)
  return props
}

describe('the sheet rises from the bottom edge', () => {
  it('anchors to the bottom, full width, capped 60px short of the top', () => {
    expect(src).toContain('fixed inset-x-0 bottom-0')
    expect(src).toContain('max-h-[calc(100%-60px)]')
  })

  it('takes the sheet radius, not the side drawers’ 34px', () => {
    expect(src).toContain('rounded-t-[var(--drawer-radius-sheet)]')
    expect(src).not.toContain('var(--drawer-radius)]')
  })

  it('enters on the shared drawer curve', () => {
    // Same 600ms `--ease-drawer` as the cart and menu drawers — one gesture,
    // one curve.
    expect(src).toContain('animate-drawer-in-bottom')
    expect(src).toContain('animate-drawer-backdrop-in')
  })

  it('runs at exactly the cart drawer’s speed', () => {
    // Not "about the same": the two animations are declared side by side and
    // must differ in direction only. A sheet on a different duration reads as
    // a different component even though it is the same gesture.
    const tailwind = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8')
    const timing = (name: string) =>
      tailwind
        .match(new RegExp(`'${name}':\\s*'([^']+)'`))?.[1]
        ?.replace(/slide-in-from-\w+/, '')
        .trim()

    expect(timing('drawer-in-bottom')).toBe(timing('drawer-in-right'))
    expect(timing('drawer-in-bottom')).toBe('0.6s var(--ease-drawer) both')
  })

  it('dims the page with the drawer scrim, not a second one', () => {
    expect(src).toContain('bg-foreground/70')
    expect(src).not.toContain('bg-black/50')
  })

  it('is a phone control only — the rail is the desktop answer', () => {
    expect(src).toContain('lg:hidden')
  })

  it('never scrolls itself, whatever the browser tries to reveal', () => {
    // `overflow-hidden` (there for the corners) still makes a scroll
    // container. Ticking a facet deep in the list focuses its sr-only
    // checkbox, the browser scrolls every scrollable ancestor to reveal it,
    // and this panel obliged: scrollTop 2,881, every child dragged above the
    // panel, nothing on screen but white.
    const panel = src.slice(src.indexOf('id={FILTER_SORT_DRAWER_ID}'))
    expect(panel).toContain('onScroll')
    expect(panel).toContain('event.currentTarget.scrollTop = 0')
  })

  it('locks scroll and answers Escape, as every drawer here does', () => {
    expect(src).toContain("document.body.style.overflow = 'hidden'")
    expect(src).toContain("event.key === 'Escape'")
  })
})

describe('the floating trigger', () => {
  it('is fixed above the tab bar rather than sitting in the page flow', () => {
    // The old MobileFilterButton scrolled away with the top of the products
    // column; filters are wanted where the grid disappoints, further down.
    expect(src).toContain('MOBILE_TAB_BAR_OFFSET_CLASS')
    // Their measured 20px gap.
    expect(src).toContain("'mb-5'")
  })

  it('sits on the tab bar’s layer, under every scrim and panel', () => {
    expect(src).toMatch(/fixed inset-x-0 z-30/)
  })

  it('names both jobs, because it now opens both', () => {
    render(<FilterSortButton onClick={() => {}} />)
    expect(
      screen.getByRole('button', { name: /Filter and sort/i })
    ).toBeTruthy()
  })

  it('reports the sheet it controls', () => {
    render(<FilterSortButton onClick={() => {}} isOpen />)
    const button = screen.getByRole('button', { name: /Filter and sort/i })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-controls')).toBe('filter-sort-drawer')
  })

  it('opens the sheet', () => {
    const onClick = vi.fn()
    render(<FilterSortButton onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /Filter and sort/i }))
    expect(onClick).toHaveBeenCalled()
  })
})

describe('sort travels with the filters on a phone', () => {
  it('offers every toolbar sort option in the sheet', () => {
    renderDrawer()
    const select = screen.getByLabelText('Sort by') as HTMLSelectElement
    expect(select.options).toHaveLength(SORT_OPTIONS.length)
  })

  it('reports a change with the toolbar’s own id shape', () => {
    const onSortChange = vi.fn()
    renderDrawer({ onSortChange })

    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'basePrice-asc' },
    })

    expect(onSortChange).toHaveBeenCalledWith('basePrice-asc')
  })

  it('sizes the control so iOS does not zoom the page on focus', () => {
    // Anything under 16px triggers the zoom — see mobile-input-zoom.spec.ts.
    expect(src).toContain('text-base')
  })
})

describe('the pinned footer', () => {
  it('carries the result count, which is what the filters just changed', () => {
    renderDrawer({ totalProducts: 3991 })
    expect(screen.getByTestId('filter-sort-apply').textContent).toContain(
      '3,991'
    )
  })

  it('closes the sheet', () => {
    const onClose = vi.fn()
    renderDrawer({ onClose })
    fireEvent.click(screen.getByTestId('filter-sort-apply'))
    expect(onClose).toHaveBeenCalled()
  })

  it('sits above the home indicator, not in it', () => {
    expect(src).toContain('pb-[calc(env(safe-area-inset-bottom)+1rem)]')
  })
})

describe('the applied filters get a lane of their own', () => {
  const withFilters = { ...emptyFilters, styles: ['minimalist-art'] }

  it('shows nothing while nothing is applied', () => {
    renderDrawer({ onClearAll: vi.fn() })
    expect(screen.queryByTestId('filter-sort-chips')).toBeNull()
    expect(screen.queryByText('Clear all')).toBeNull()
  })

  it('names each applied value as a removable chip', () => {
    renderDrawer({ onClearAll: vi.fn(), filters: withFilters })

    const lane = screen.getByTestId('filter-sort-chips')
    expect(lane.textContent).toContain('Active filters:')
    expect(lane.textContent).toContain('minimalist art')
  })

  it('drops one facet without touching the rest', () => {
    // The whole point of the lane: before it, undoing one filter meant
    // hunting the ticked box back down through ten accordions.
    const onRemoveFilter = vi.fn()
    renderDrawer({ onClearAll: vi.fn(), onRemoveFilter, filters: withFilters })

    const chip = screen
      .getByTestId('filter-sort-chips')
      .querySelector('button')!
    fireEvent.click(chip)

    expect(onRemoveFilter).toHaveBeenCalledWith('styles', 'minimalist-art')
  })

  it('sits between the head and the scrolling body, not inside it', () => {
    // Inside the scroll container the lane leaves with the first accordion —
    // and it describes the whole sheet, not the top of it.
    const lane = src.indexOf('data-testid="filter-sort-chips"')
    const body = src.indexOf('flex-1 overflow-y-auto')
    expect(lane).toBeGreaterThan(-1)
    expect(lane).toBeLessThan(body)
  })

  it('wraps to a second line rather than scrolling values out of sight', () => {
    // The toolbar's row variant may not wrap — the rail's sticky offset is
    // pinned against that bar's height. Here height is free, and a phone has
    // no hover affordance to say a row scrolls sideways, so four facets on a
    // 390px screen simply hid the last two.
    renderDrawer({
      onClearAll: vi.fn(),
      filters: {
        ...emptyFilters,
        styles: ['minimalist-art', 'pop-art'],
        colors: ['blue'],
        orientation: 'portrait',
      },
    })

    const lane = screen.getByTestId('filter-sort-chips')
    expect(lane.querySelector('[data-testid="active-filter-tags"]')?.className)
      .toContain('flex-wrap')
  })

  it('caps the lane so it cannot eat the sheet', () => {
    // Unbounded, the wrapping lane grew with every chip: at eighteen it took
    // 359px of the 784px panel, and a few more left no facet list under it at
    // all — the sheet read as blank. Capped, it scrolls past three rows.
    const laneStart = src.indexOf('data-testid="filter-sort-chips"')
    const lane = src.slice(laneStart, src.indexOf('<ActiveFilterTags', laneStart))
    expect(lane).toContain('max-h-[7.5rem]')
    expect(lane).toContain('overflow-y-auto')

    // And the facet list must be allowed to shrink: a flex child's default
    // `min-height: auto` is its content, which pushes the pinned footer off
    // the sheet rather than scrolling.
    expect(src).toContain('min-h-0 flex-1 overflow-y-auto')
  })

  it('keeps Clear all pinned rather than riding the last chip', () => {
    // Inside the tag list it lands at the end of whichever line the last chip
    // wrapped onto, moving every time a facet comes or goes.
    expect(src).toContain('showClearAll={false}')

    const onClearAll = vi.fn()
    renderDrawer({ onClearAll, filters: withFilters })

    fireEvent.click(screen.getByText('Clear all'))
    expect(onClearAll).toHaveBeenCalled()
  })
})

describe('closes the way the other drawers do', () => {
  it('uses the storefront’s outline circle, not a bare icon', () => {
    expect(src).toContain('h-12 w-12 shrink-0 rounded-full p-0')
  })

  it('closes on the scrim', () => {
    const onClose = vi.fn()
    renderDrawer({ onClose })
    fireEvent.click(screen.getByTestId('filter-sort-scrim'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing at all while closed', () => {
    renderDrawer({ isOpen: false })
    expect(screen.queryByTestId('filter-sort-drawer')).toBeNull()
  })
})
