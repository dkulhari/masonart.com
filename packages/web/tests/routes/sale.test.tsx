/**
 * /sale — the promotion's own page, and the red Sale link that points at it.
 *
 * Five things are guarded here, and each is a way a sale page goes wrong.
 *
 * 1. **No promotion is not a 404.** A sale ends; the links in the email that
 *    sold it do not. `/sale` with nothing running has to answer with a plain
 *    empty state and a way back into the catalogue — never `notFound()`, which
 *    would tell a shopper who followed a real link that the page never
 *    existed.
 *
 * 2. **The client never evaluates a scope.** Which products a promotion
 *    applies to is `scope minus exclusions`, and that lives in
 *    `promotion-pricing.ts` behind `GET /api/products?onSale=true`. A grid
 *    that filtered client-side would need the scope filter and the exclusion
 *    list on the wire, and would disagree with the price the card prints the
 *    moment either changed. The source assertions below are the enforcement.
 *
 * 3. **One countdown, not two.** The strip (#434) and this page both count to
 *    the deadline `GET /api/promotions/active` resolved server-side, and both
 *    format it with the same exported `formatRemaining`. Two independent
 *    formatters are two answers on one screen.
 *
 * 4. **`validateSearch` must COERCE.** `app/router.tsx` overrides TanStack's
 *    search serialisation, so `?page=2` arrives as the STRING '2'. A schema
 *    that assumes a number throws inside `validateSearch`, which
 *    error-boundaries the route to a blank page — worse than any paging bug.
 *
 * 5. **The nav link is absent, not disabled, when no sale is running.** It is
 *    appended after the style links in row 2 rather than woven into them, so
 *    the row stays generated from `STYLE_OPTIONS`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { STYLE_OPTIONS } from '@chobii/shared'
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

import type { ActivePromotion } from '~/components/layout/SaleStrip'
import { SaleNavLink, SaleMobileNavLink } from '~/components/layout/Header'
import type { ProductCardData } from '~/components/product/ProductCard'
import {
  Route,
  SaleHero,
  SalePageView,
  SALE_PAGE_SIZE,
  parseSaleSearch,
} from '~/routes/sale'

// ============================================================================
// Fixtures
// ============================================================================

/** The clock every countdown assertion runs against. */
const NOW = new Date('2026-08-06T09:00:00.000Z')

/** Deliberately not mesonart's depth — every number comes from the payload. */
const promotion: ActivePromotion = {
  promotionId: '11111111-1111-4111-8111-111111111111',
  headline: 'WINTER SALE: DEALS STILL GOING 25% OFF',
  percentOff: 25,
  membersOnly: true,
  // 01 : 02 : 03 from NOW.
  deadline: '2026-08-06T10:02:03.000Z',
}

function makeProduct(id: string, title: string): ProductCardData {
  return {
    id,
    sku: `SKU-${id}`,
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    basePrice: '2400.00',
    images: [{ url: `https://cdn.test/${id}.webp`, alt: title }],
    orientation: 'portrait',
    averageRating: null,
    reviewCount: 0,
  } as ProductCardData
}

const PRODUCTS = [makeProduct('p1', 'Kyoto Rain'), makeProduct('p2', 'Osaka Dusk')]

/**
 * Resolved from the cwd, not `import.meta.url` — vite rewrites that to an http
 * URL in jsdom and `readFileSync` rejects anything that is not `file:`.
 */
function sourceOf(relative: string): string {
  const path = [
    resolve(process.cwd(), relative),
    resolve(process.cwd(), 'packages/web', relative),
  ].find(existsSync)
  return readFileSync(path!, 'utf8')
}

/** Source with comments removed — prose may name a thing, code may not. */
function codeOf(relative: string): string {
  return sourceOf(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

const SALE_CODE = codeOf('app/routes/sale.tsx')
const HEADER_SRC = sourceOf('app/components/layout/Header.tsx')
const HOOK_CODE = codeOf('app/hooks/useActivePromotion.ts')

/** The page's links reach real routes, so a memory router carries them. */
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

beforeEach(() => {
  listMock.mockReset()
  listMock.mockResolvedValue({
    items: PRODUCTS,
    total: PRODUCTS.length,
    page: 1,
    pageSize: SALE_PAGE_SIZE,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ============================================================================
// validateSearch — the repo trap
// ============================================================================

describe('/sale validateSearch', () => {
  const validate = (search: Record<string, unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Route.options.validateSearch as any)(search) as { page: number }

  it('coerces the string page the router hands it into a number', () => {
    // router.tsx serialises every search param as a string. A bare
    // `z.number()` throws here and blanks the page.
    expect(validate({ page: '2' })).toEqual({ page: 2 })
  })

  it('defaults to page 1 when there is no page param', () => {
    expect(validate({})).toEqual({ page: 1 })
  })

  it('falls back to page 1 rather than throwing on junk', () => {
    expect(parseSaleSearch({ page: 'nonsense' })).toEqual({ page: 1 })
    expect(parseSaleSearch({ page: '0' })).toEqual({ page: 1 })
    expect(parseSaleSearch({ page: '-4' })).toEqual({ page: 1 })
    expect(parseSaleSearch({ page: '2.5' })).toEqual({ page: 1 })
  })
})

// ============================================================================
// The loader asks the API which products are on sale
// ============================================================================

describe('the loader', () => {
  const runLoader = (page?: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Route.options.loader as any)({ deps: { search: { page: page ?? 1 } } })

  it('asks the product list for the promotion’s products, server-resolved', async () => {
    await runLoader()

    expect(listMock).toHaveBeenCalledTimes(1)
    const params = listMock.mock.calls[0]?.[0] as Record<string, unknown>
    // The narrow parameter added to GET /api/products. Scope minus exclusions
    // is resolved in SQL against the promotion rows; nothing about the scope
    // crosses the wire.
    expect(params.onSale).toBe(true)
  })

  it('widens the request rather than paging, so a shared ?page=N reproduces the view', async () => {
    await runLoader(3)

    const params = listMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(params.page).toBe(1)
    expect(params.pageSize).toBe(SALE_PAGE_SIZE * 3)
  })

  it('answers with an empty grid rather than throwing when the API is down', async () => {
    listMock.mockRejectedValue(new Error('api down'))

    const data = await runLoader()
    expect(data.products).toEqual([])
    expect(data.total).toBe(0)
  })

  it('never turns an absent sale into a 404', async () => {
    listMock.mockResolvedValue({ items: [], total: 0, hasNextPage: false })

    const data = await runLoader()
    expect(data.total).toBe(0)
    // `notFound()` anywhere in this route is the defect: an old link from an
    // email would dead-end instead of landing on an honest empty page.
    expect(SALE_CODE).not.toMatch(/notFound/)
    expect(Route.options.notFoundComponent).toBeUndefined()
  })
})

// ============================================================================
// Headline and countdown
// ============================================================================

describe('the sale hero', () => {
  it('prints the headline the promotion row carries', () => {
    render(<SaleHero promotion={promotion} />)

    const headline = screen.getByTestId('sale-headline')
    expect(headline.textContent).toContain('WINTER SALE')
    expect(headline.textContent).toContain('25% OFF')
  })

  it('bakes no discount depth into the markup', () => {
    // The headline is a column. A literal here would keep quoting a number
    // long after the row that justified it was switched off.
    expect(SALE_CODE).not.toMatch(/\d+\s*%/)
    expect(SALE_CODE).not.toMatch(/%\s*off/i)
  })

  it('counts down to the deadline the server already resolved', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    render(<SaleHero promotion={promotion} />)

    const clock = screen.getByTestId('sale-page-countdown')
    expect(clock.textContent).toBe('01 : 02 : 03')
    expect(clock.getAttribute('datetime')).toBe(promotion.deadline)
  })

  it('ticks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    render(<SaleHero promotion={promotion} />)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByTestId('sale-page-countdown').textContent).toBe(
      '01 : 02 : 01'
    )
  })

  it('drops the clock at zero and keeps the headline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T10:02:03.000Z'))

    render(<SaleHero promotion={promotion} />)

    // The rolling window can run out while the sale is still live. Nothing
    // counts past zero, and nothing renders a negative.
    expect(screen.queryByTestId('sale-page-countdown')).toBeNull()
    expect(screen.getByTestId('sale-headline').textContent).toContain(
      'WINTER SALE'
    )
  })

  it('still renders a heading when nothing is running', () => {
    render(<SaleHero promotion={null} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBeTruthy()
    expect(screen.queryByTestId('sale-page-countdown')).toBeNull()
  })
})

// ============================================================================
// The grid
// ============================================================================

describe('the sale page', () => {
  it('renders the products the API said were on sale, in the shared grid', async () => {
    renderWithRouter(
      <SalePageView products={PRODUCTS} total={2} promotion={promotion} />
    )

    const cards = await screen.findAllByTestId('product-card')
    expect(cards).toHaveLength(2)
    expect(screen.getByText('Kyoto Rain')).toBeTruthy()
  })

  it('reuses ProductGrid rather than growing a second grid', () => {
    // This page is a product list with a promotion filter. A second grid
    // drifts from the first on column counts and gaps.
    expect(SALE_CODE).toContain('ProductGrid')
    expect(SALE_CODE).not.toMatch(/grid-cols-/)
  })
})

// ============================================================================
// No promotion: an empty state, never a dead end
// ============================================================================

describe('with no promotion running', () => {
  it('renders a plain empty state instead of a 404', async () => {
    renderWithRouter(<SalePageView products={[]} total={0} promotion={null} />)

    const empty = await screen.findByTestId('sale-empty')
    expect(empty.textContent).toMatch(/no sale/i)
    expect(screen.queryByTestId('product-card')).toBeNull()
  })

  it('offers the way back into the catalogue', async () => {
    renderWithRouter(<SalePageView products={[]} total={0} promotion={null} />)

    const link = await screen.findByRole('link', { name: /posters/i })
    expect(link.getAttribute('href')).toBe('/posters')
  })
})

// ============================================================================
// One countdown, one scope owner
// ============================================================================

describe('the contracts this page must not break', () => {
  it('formats the countdown with the strip’s own formatter', () => {
    // Two formatters are two answers. `formatRemaining` is exported from
    // SaleStrip precisely so this page cannot grow a second one.
    expect(HOOK_CODE).toContain('formatRemaining')
    expect(HOOK_CODE).toContain('~/components/layout/SaleStrip')
    // No hand-rolled clock arithmetic on either side.
    expect(SALE_CODE).not.toContain('padStart')
    expect(HOOK_CODE).not.toContain('padStart')
  })

  it('never evaluates a promotion scope on the client', () => {
    // Scope minus exclusions is resolved in SQL. If any of these words appear
    // here, the page is deciding membership itself and will disagree with the
    // price the card prints.
    for (const word of ['scopeType', 'scopeFilter', 'exclusion', 'excludedIds']) {
      expect(SALE_CODE).not.toContain(word)
    }
  })

  it('reads the resolved deadline, never an end date', () => {
    // `endsAt` is private and never crosses the wire (#432).
    expect(SALE_CODE).not.toContain('endsAt')
    expect(HOOK_CODE).not.toContain('endsAt')
  })

  it('hits the API on its absolute base — there is no Vite /api proxy', () => {
    expect(HOOK_CODE).toContain('getApiUrl()')
    expect(HOOK_CODE).not.toMatch(/fetch\(\s*['"`]\/api/)
  })
})

// ============================================================================
// The red Sale link in nav row 2
// ============================================================================

describe('the Sale nav link', () => {
  it('renders nothing at all when no promotion is running', () => {
    const { container } = renderWithRouter(<SaleNavLink promotion={null} />)
    expect(container.querySelector('[data-testid="sale-nav-link"]')).toBeNull()
  })

  it('renders nothing while the lookup is still unresolved', () => {
    // `undefined` is "not known yet". Flashing a Sale link and withdrawing it
    // is worse than showing it a beat late.
    const { container } = renderWithRouter(<SaleNavLink promotion={undefined} />)
    expect(container.querySelector('[data-testid="sale-nav-link"]')).toBeNull()
  })

  it('links at /sale, in red, once a promotion is running', async () => {
    renderWithRouter(<SaleNavLink promotion={promotion} />)

    const link = await screen.findByTestId('sale-nav-link')
    expect(link.getAttribute('href')).toBe('/sale')
    expect(link.textContent).toBe('Sale')
    // --sale is the one warm colour in the storefront, reserved for exactly
    // this. Anything else and the link stops reading as a discount.
    expect(link.className).toContain('text-sale')
  })

  it('carries the same link in the mobile tree', async () => {
    // The header has two independent nav trees and patching only the desktop
    // one is the classic miss.
    renderWithRouter(<SaleMobileNavLink promotion={promotion} />)

    const link = await screen.findByTestId('sale-mobile-nav-link')
    expect(link.getAttribute('href')).toBe('/sale')
    expect(link.className).toContain('text-sale')
  })

  it('is absent from the mobile tree too when nothing is running', () => {
    const { container } = renderWithRouter(<SaleMobileNavLink promotion={null} />)
    expect(
      container.querySelector('[data-testid="sale-mobile-nav-link"]')
    ).toBeNull()
  })
})

describe('where the Sale link sits in the header', () => {
  const stylesRow = HEADER_SRC.slice(
    HEADER_SRC.indexOf('data-testid="styles-nav"'),
    HEADER_SRC.indexOf('</nav>', HEADER_SRC.indexOf('data-testid="styles-nav"'))
  )

  it('is appended after the style links, not woven into them', () => {
    // Row 2 is generated from STYLE_OPTIONS. A Sale entry inside that list
    // would mean either a fake style id or a special case in the map.
    expect(stylesRow).toContain('STYLE_OPTIONS.map')
    expect(stylesRow).toContain('SaleNavLink')
    expect(stylesRow.indexOf('SaleNavLink')).toBeGreaterThan(
      stylesRow.indexOf('STYLE_OPTIONS.map')
    )
  })

  it('leaves the generated styles list itself untouched', () => {
    expect(STYLE_OPTIONS).toHaveLength(12)
    expect(STYLE_OPTIONS.some((style) => style.id === 'sale')).toBe(false)
  })

  it('feeds both nav trees from one lookup', () => {
    expect(HEADER_SRC).toContain('useActivePromotion')
    expect(HEADER_SRC).toContain('SaleMobileNavLink')
  })
})
