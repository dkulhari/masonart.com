/**
 * ProductGrid tests
 *
 * Pins the measured mesonart layout and the removal of the per-call-site
 * configuration that caused defect D1 (home page and listing passing different
 * aspect ratios).
 */

import { describe, it, expect, vi } from 'vitest'
import { render as rtlRender } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import type { ProductCardData } from '~/components/product/ProductCard'

// ProductGrid renders ProductCard, which renders ChooseOptions, whose
// add-to-cart button now reads useCartActions (#511) — which calls
// useQueryClient unconditionally. Every render needs a client.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}))

const { ProductGrid } = await import('~/components/product/ProductGrid')

const raw = readFileSync(
  join(process.cwd(), 'app/components/product/ProductGrid.tsx'),
  'utf8'
)
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const product = (i: number): ProductCardData => ({
  id: `p${i}`,
  title: `Product ${i}`,
  slug: `product-${i}`,
  basePrice: '1000.00',
  images: [
    {
      id: `i${i}`,
      url: `/i${i}.webp`,
      altText: `a${i}`,
      type: 'main',
      sortOrder: 0,
      width: 1500,
      height: 1500,
      originalKey: `o${i}`,
    },
  ],
  orientation: 'portrait',
})

describe('ProductGrid — measured layout', () => {
  it('uses the mesonart column counts (2 / md:3 / xl:4)', () => {
    const { container } = render(<ProductGrid products={[product(1)]} />)
    const grid = container.querySelector('ul')!
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('md:grid-cols-3')
    expect(grid.className).toContain('xl:grid-cols-4')
  })

  it('uses the measured 20px row / 13.5px column gaps', () => {
    const { container } = render(<ProductGrid products={[product(1)]} />)
    const grid = container.querySelector('ul')!
    expect(grid.className).toContain('gap-x-[13.5px]')
    expect(grid.className).toContain('gap-y-5')
  })

  it('is a real CSS grid — that is what aligns rows', () => {
    const { container } = render(<ProductGrid products={[product(1)]} />)
    expect(container.querySelector('ul')!.className).toContain('grid')
  })

  it('omits grid-flow-row-dense so DOM order equals visual order', () => {
    expect(code).not.toContain('grid-flow-row-dense')
  })
})

describe('ProductGrid — promo slot', () => {
  const eight = [1, 2, 3, 4, 5, 6, 7, 8].map(product)
  const promoNode = <li key="promo" data-testid="promo" />

  it('renders the plain grid when no promo is passed', () => {
    const { container } = render(<ProductGrid products={eight} />)
    expect(container.querySelectorAll('ul > li')).toHaveLength(8)
  })

  it('places the promo at the requested cell index', () => {
    const { container } = render(
      <ProductGrid products={eight} promo={{ node: promoNode, index: 4 }} />
    )
    const cells = container.querySelectorAll('ul > li')
    expect(cells).toHaveLength(9)
    expect(cells[4]?.getAttribute('data-testid')).toBe('promo')
  })

  it('keeps every product, in order, around the promo', () => {
    const { container } = render(
      <ProductGrid products={eight} promo={{ node: promoNode, index: 4 }} />
    )
    expect(container.querySelectorAll('[data-testid="product-card"]')).toHaveLength(8)
  })

  it('ignores an index past the end rather than appending a stray cell', () => {
    // A promo dangling after the last product reads as a broken card.
    const { container } = render(
      <ProductGrid products={eight} promo={{ node: promoNode, index: 99 }} />
    )
    expect(container.querySelectorAll('ul > li')).toHaveLength(8)
  })

  it('ignores a null promo node — the tile hides itself below threshold', () => {
    const { container } = render(
      <ProductGrid products={eight} promo={{ node: null, index: 4 }} />
    )
    expect(container.querySelectorAll('ul > li')).toHaveLength(8)
  })

  it('still omits grid-flow-row-dense — ours occupies exactly one cell', () => {
    // mesonart needs dense flow to backfill holes left by multi-cell promo
    // blocks. A single-cell tile leaves no hole, so DOM order stays equal to
    // visual order for keyboard and screen-reader traversal.
    expect(code).not.toContain('grid-flow-row-dense')
  })
})

describe('ProductGrid — configuration removed (D1)', () => {
  it.each(['uniformAspectRatio', 'GRID_COLUMN_CLASSES', 'GAP_CLASSES', 'cardSize'])(
    'no longer references %s',
    (dead) => {
      expect(code).not.toContain(dead)
    }
  )
})

describe('ProductGrid — rendering', () => {
  it('renders one card per product', () => {
    const { container } = render(
      <ProductGrid products={[product(1), product(2), product(3)]} />
    )
    expect(container.querySelectorAll('[data-testid="product-card"]')).toHaveLength(3)
  })

  it('renders skeletons while loading, in the same grid', () => {
    const { container } = render(<ProductGrid products={[]} isLoading skeletonCount={4} />)
    expect(container.querySelectorAll('[data-testid="product-card-skeleton"]')).toHaveLength(4)
    expect(container.querySelector('ul')!.className).toContain('grid-cols-2')
  })

  it('renders the empty state when there are no products', () => {
    const { container } = render(<ProductGrid products={[]} />)
    expect(container.textContent).toContain('No products found')
  })

  it('accepts a custom empty state', () => {
    const { container } = render(
      <ProductGrid products={[]} emptyState={<p>Nothing here</p>} />
    )
    expect(container.textContent).toContain('Nothing here')
  })

  it('renders cards as li children of the ul (valid list markup)', () => {
    const { container } = render(<ProductGrid products={[product(1), product(2)]} />)
    const ul = container.querySelector('ul')!
    expect([...ul.children].every((c) => c.tagName === 'LI')).toBe(true)
  })
})
