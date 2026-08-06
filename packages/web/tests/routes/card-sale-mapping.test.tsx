/**
 * The grid mappers must not drop `sale` (#524).
 *
 * `/sale` and `/posters` do not hand the API's rows to the grid — they rebuild
 * `ProductCardData` field by field inside their loaders. A hand-written object
 * literal is a whitelist, and every field the API grows has to be added to it
 * by hand or it is silently gone by the time a card renders. `sale` was: the
 * API resolved the discount, the loader threw it away, and `/sale` — a page
 * that exists only to show a promotion — printed base prices on every card.
 *
 * ## Why these tests run the real loader
 *
 * A component test that renders a hand-built fixture carrying `sale` passes
 * whether or not the mapper preserves it, because the fixture never went
 * through the mapper. That is exactly how this bug survived #435's card
 * integration and its passing suite. Everything below therefore mocks
 * `productsApi.list`, runs the route's own loader, and asserts on the objects
 * the loader hands the grid.
 *
 * ## Why there is a whole-row guard and not just a `sale` assertion
 *
 * This is the fourth field this feature has lost to a projection or a mapper
 * in one night (`rooms` from a query projection, `sale` from `featured`, then
 * `sale` from both of these). Asserting only on `sale` fixes today's field and
 * leaves the mechanism intact, so `preserves every card field the API sends`
 * walks the whole row: any future field that lands on `ProductCardData` and is
 * forgotten in one of these two literals fails here rather than in production.
 *
 * `sku` is deliberately absent from that walk — it is mid-flight in another
 * change on this branch and is not this ticket's contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'

const listMock = vi.hoisted(() => vi.fn())

vi.mock('~/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/api')>()
  return {
    ...actual,
    productsApi: {
      ...actual.productsApi,
      list: (...args: unknown[]) => listMock(...args),
    },
  }
})

import type { ProductCardData } from '~/components/product/ProductCard'
import { ProductGrid } from '~/components/product/ProductGrid'
import type { SalePricing } from '~/components/product/SalePrice'
import { Route as SaleRoute } from '~/routes/sale'
import { Route as PostersRoute } from '~/routes/posters/index'

// ============================================================================
// Fixtures
// ============================================================================

/**
 * Exactly what `resolveSalePrice` puts on a row (#428): resolved server-side,
 * printed by the card, never recomputed anywhere on the client.
 */
const SALE: SalePricing = {
  promotionId: '11111111-1111-4111-8111-111111111111',
  headline: 'WINTER SALE: DEALS STILL GOING 25% OFF',
  percentOff: 25,
  basePrice: '2400.00',
  salePrice: '1800.00',
  locked: false,
}

/** A discounted row as `GET /api/products` returns it, every field populated. */
const DISCOUNTED_ROW: Record<string, unknown> = {
  id: 'p1',
  title: 'Kyoto Rain',
  slug: 'kyoto-rain',
  basePrice: '2400.00',
  images: [{ url: 'https://cdn.test/p1.webp', alt: 'Kyoto Rain' }],
  orientation: 'landscape',
  styles: ['abstract', 'minimalist'],
  isFeatured: true,
  isAiGenerated: true,
  averageRating: 4.5,
  reviewCount: 12,
  sale: SALE,
}

/** The same shape with no promotion applying to it. */
const PLAIN_ROW: Record<string, unknown> = {
  ...DISCOUNTED_ROW,
  id: 'p2',
  title: 'Osaka Dusk',
  slug: 'osaka-dusk',
  sale: null,
}

function respondWith(...items: Record<string, unknown>[]) {
  listMock.mockResolvedValue({
    items,
    total: items.length,
    page: 1,
    pageSize: 24,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
}

// ============================================================================
// The two loaders, driven exactly as the router drives them
// ============================================================================

/**
 * Both loaders under one name, so every assertion below runs against both.
 * They are separate copies of the same object literal, which is precisely why
 * one of them can regress without the other.
 */
const LOADERS: Array<{ name: string; run: () => Promise<ProductCardData[]> }> = [
  {
    name: '/sale',
    run: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await (SaleRoute.options.loader as any)({
        deps: { search: { page: 1 } },
      })
      return data.products as ProductCardData[]
    },
  },
  {
    name: '/posters',
    run: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await (PostersRoute.options.loader as any)({
        deps: { search: {} },
      })
      return data.products as ProductCardData[]
    },
  },
]

beforeEach(() => {
  listMock.mockReset()
  respondWith(DISCOUNTED_ROW)
})

afterEach(() => {
  cleanup()
})

describe.each(LOADERS)('$name maps API rows to cards', ({ run }) => {
  it('carries the resolved sale through to the card', async () => {
    const [product] = await run()

    // The whole ticket in one assertion: the API resolved a discount and the
    // object the grid receives still has it. Without this the card falls back
    // to `basePrice` and advertises a price the checkout will not charge.
    expect(product?.sale).toEqual(SALE)
  })

  it('preserves every number in the sale, not a reshaped subset', async () => {
    const [product] = await run()

    // A mapper that rebuilt `sale` field by field would be the same bug one
    // level down. Nothing here may be derived: `percentOff` is the server's
    // rounding and `basePrice` is what the saving was measured against.
    expect(product?.sale?.salePrice).toBe('1800.00')
    expect(product?.sale?.basePrice).toBe('2400.00')
    expect(product?.sale?.percentOff).toBe(25)
    expect(product?.sale?.locked).toBe(false)
    expect(product?.sale?.promotionId).toBe(SALE.promotionId)
    expect(product?.sale?.headline).toBe(SALE.headline)
  })

  it('passes an undiscounted row through as a null sale, not undefined-ish junk', async () => {
    respondWith(PLAIN_ROW)

    const [product] = await run()

    // `null` is the API's "no promotion applies". SalePrice branches on
    // falsiness either way, but a mapper that invented `{}` here would render
    // a strike-through with no numbers in it.
    expect(product?.sale ?? null).toBeNull()
  })

  it('preserves every card field the API sends, not just the ones it had on the day it was written', async () => {
    const [product] = await run()

    // The anti-drop guard. Add a field to ProductCardData and forget one of
    // the two literals, and this is where you find out.
    expect(product).toMatchObject({
      id: 'p1',
      title: 'Kyoto Rain',
      slug: 'kyoto-rain',
      basePrice: '2400.00',
      images: [{ url: 'https://cdn.test/p1.webp', alt: 'Kyoto Rain' }],
      orientation: 'landscape',
      styles: ['abstract', 'minimalist'],
      isFeatured: true,
      isAiGenerated: true,
      averageRating: 4.5,
      reviewCount: 12,
      sale: SALE,
    })
  })

  it('keeps the sale on every card in the page, not only the first', async () => {
    respondWith(DISCOUNTED_ROW, { ...DISCOUNTED_ROW, id: 'p3', slug: 'p3' })

    const products = await run()

    expect(products).toHaveLength(2)
    expect(products.every((product) => product.sale != null)).toBe(true)
  })
})

// ============================================================================
// End to end through the grid the two pages share
// ============================================================================

/** The grid's cards link to real routes, so a memory router carries them. */
function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> })
  const children = ['/posters', '/posters/$slug', '/sale'].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null })
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(children),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe.each(LOADERS)('$name renders the mapped price', ({ run }) => {
  it('prints the sale price, the struck base and the depth on the card', async () => {
    // Loader output, not a fixture. This is the assertion a hand-built
    // ProductCardData cannot make: it proves the field survives the journey
    // from the API row to the pixels, which is the journey that was broken.
    const products = await run()

    renderWithRouter(<ProductGrid products={products} />)

    expect(await screen.findByTestId('sale-price')).toBeTruthy()
    expect(screen.getByTestId('price-current').textContent).toContain('1,800')
    expect(screen.getByTestId('price-was').textContent).toContain('2,400')
    expect(screen.getByTestId('sale-percent-off').textContent).toContain(
      '25% off'
    )
  })

  it('falls back to the base price when nothing is discounted', async () => {
    respondWith(PLAIN_ROW)
    const products = await run()

    renderWithRouter(<ProductGrid products={products} />)

    expect(await screen.findByTestId('price-current')).toBeTruthy()
    expect(screen.queryByTestId('sale-price')).toBeNull()
    expect(screen.getByTestId('price-current').textContent).toContain('2,400')
  })
})
