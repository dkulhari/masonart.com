/**
 * /admin/vendors — the supplier directory, listed.
 *
 * Two things are pinned here, and both are audit findings rather than taste.
 *
 * ## The search schema, first
 *
 * `router.tsx` replaces TanStack's search serialisation with a pair that keeps
 * every value a STRING on the way in and `String(value)` on the way out. A
 * `validateSearch` schema written against real numbers therefore throws on the
 * very first navigation, and a throw inside `validateSearch` does not surface
 * as a validation message — the route error-boundaries and the admin gets a
 * blank page. That failure mode is why the coercion suite is written before the
 * screen exists.
 *
 * ## Then the three list states
 *
 * Skeleton, empty AND error. Only 4 of 13 admin lists have all three today, and
 * the missing one is almost always the error state — which is how #602 and #606
 * happened: a failed request rendered a confident `0`. The error assertions
 * below check both halves of that: the error is shown, AND no fabricated number
 * is shown beside it.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Only the router is stubbed, not the component under test — the same trade
 * frames-list.test.tsx makes. `createFileRoute` runs at module load and `Link`
 * reads router context, so without this the import alone throws.
 */
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => () => {},
  Link: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    to?: string
    params?: Record<string, string>
    search?: unknown
    className?: string
    'aria-label'?: string
  }) => (
    <a href={props.to} aria-label={props['aria-label']} className={props.className}>
      {children}
    </a>
  ),
}))

import {
  vendorsSearchSchema,
  VendorsListBody,
  type AdminVendorListItem,
} from '~/routes/admin/vendors/index'
import { ADMIN_VENDORS_SEARCH } from '~/lib/admin-nav'

afterEach(cleanup)

// ============================================================================
// Search schema — the blank-page hazard
// ============================================================================

/**
 * What `router.tsx` actually hands `validateSearch`: `URLSearchParams` entries,
 * so every value is a string no matter what was navigated with.
 */
const asUrlWouldDeliver = (search: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(search)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  )

describe('vendorsSearchSchema', () => {
  it('coerces the string page and pageSize the URL delivers', () => {
    const parsed = vendorsSearchSchema.parse({ page: '3', pageSize: '50' })

    expect(parsed.page).toBe(3)
    expect(parsed.pageSize).toBe(50)
  })

  it('coerces minLongestEdge, so the capability filter is a number', () => {
    expect(vendorsSearchSchema.parse({ minLongestEdge: '36' }).minLongestEdge).toBe(36)
  })

  it('applies the documented defaults when the URL carries nothing', () => {
    const parsed = vendorsSearchSchema.parse({})

    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
    expect(parsed.status).toBeUndefined()
    expect(parsed.kind).toBeUndefined()
  })

  it('keeps the status and kind filters as the API spells them', () => {
    const parsed = vendorsSearchSchema.parse({ status: 'suspended', kind: 'frame' })

    expect(parsed.status).toBe('suspended')
    expect(parsed.kind).toBe('frame')
  })

  it('clamps pageSize to the API cap rather than asking for the table', () => {
    expect(vendorsSearchSchema.parse({ pageSize: '100000' }).pageSize).toBe(100)
  })

  /**
   * The blank-page case. A hand-typed or stale URL must degrade to the default
   * view; anything that throws here takes the whole route down.
   */
  it.each([
    { page: 'abc' },
    { page: '-3' },
    { page: '0' },
    { pageSize: 'lots' },
    { status: 'retired' },
    { kind: 'sculpture' },
    { minLongestEdge: 'big' },
    { minLongestEdge: '-4' },
  ])('never throws on a nonsense URL: %o', (search) => {
    expect(() => vendorsSearchSchema.parse(search)).not.toThrow()
  })

  it('recovers a usable page number from a nonsense one', () => {
    expect(vendorsSearchSchema.parse({ page: 'abc' }).page).toBe(1)
    expect(vendorsSearchSchema.parse({ page: '-3' }).page).toBe(1)
  })

  it('survives the round trip through router.tsx stringify and parse', () => {
    const once = vendorsSearchSchema.parse({
      page: '2',
      pageSize: '20',
      status: 'active',
      kind: 'print',
      minLongestEdge: '24',
    })
    const twice = vendorsSearchSchema.parse(asUrlWouldDeliver(once))

    expect(twice).toEqual(once)
  })

  it('accepts ADMIN_VENDORS_SEARCH, so an external link lands on a valid URL', () => {
    // The precedent is ADMIN_PRODUCTS_SEARCH: links from outside the route have
    // to spell the defaults out, so the constant and the schema must agree.
    expect(() =>
      vendorsSearchSchema.parse(asUrlWouldDeliver({ ...ADMIN_VENDORS_SEARCH }))
    ).not.toThrow()

    const parsed = vendorsSearchSchema.parse(asUrlWouldDeliver({ ...ADMIN_VENDORS_SEARCH }))
    expect(parsed.page).toBe(ADMIN_VENDORS_SEARCH.page)
    expect(parsed.pageSize).toBe(ADMIN_VENDORS_SEARCH.pageSize)
  })
})

// ============================================================================
// The three list states
// ============================================================================

const VENDORS: AdminVendorListItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Kolkata Print Works',
    status: 'active',
    city: 'Kolkata',
    state: 'West Bengal',
    country: 'IN',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    capabilities: [{ kind: 'print', maxWidthInches: 40, maxHeightInches: 60 }],
    openJobCount: 4,
    amountOwed: '12500.00',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Suspended Framers',
    status: 'suspended',
    city: null,
    state: null,
    country: 'IN',
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    capabilities: [],
    openJobCount: 0,
    amountOwed: '0.00',
  },
]

const noop = () => {}

describe('VendorsListBody', () => {
  it('renders a skeleton while the first page is in flight', () => {
    render(
      <VendorsListBody vendors={[]} isLoading error={null} onRetry={noop} />
    )

    expect(screen.getByTestId('admin-vendors-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-vendors-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-vendors-empty')).not.toBeInTheDocument()
  })

  it('renders an empty state, not an empty table, when there are no vendors', () => {
    render(
      <VendorsListBody vendors={[]} isLoading={false} error={null} onRetry={noop} />
    )

    expect(screen.getByTestId('admin-vendors-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-vendors-skeleton')).not.toBeInTheDocument()
  })

  it('renders an error state with a retry when the request failed', () => {
    render(
      <VendorsListBody
        vendors={[]}
        isLoading={false}
        error="Failed to load vendors"
        onRetry={noop}
      />
    )

    const state = screen.getByTestId('admin-vendors-error')
    expect(state).toBeInTheDocument()
    expect(state.textContent).toMatch(/failed to load vendors/i)
    expect(screen.getByTestId('admin-vendors-retry')).toBeInTheDocument()
  })

  /**
   * #602 and #606, as a guard. A failed request must not leave a confident
   * number on screen: no zero, and no dash standing in for one either.
   */
  it('fabricates no number when the request failed', () => {
    const { container } = render(
      <VendorsListBody
        vendors={[]}
        isLoading={false}
        error="Failed to load vendors"
        onRetry={noop}
      />
    )

    expect(screen.queryByTestId('admin-vendors-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-vendors-empty')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/₹/)
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('is a table of vendors once the page has loaded', () => {
    render(
      <VendorsListBody
        vendors={VENDORS}
        isLoading={false}
        error={null}
        onRetry={noop}
      />
    )

    expect(screen.getByTestId('admin-vendors-table')).toBeInTheDocument()
    expect(screen.getByText('Kolkata Print Works')).toBeInTheDocument()
    expect(screen.getByText('Suspended Framers')).toBeInTheDocument()
  })

  it('shows what is owed and how much work is open, per vendor', () => {
    render(
      <VendorsListBody
        vendors={VENDORS}
        isLoading={false}
        error={null}
        onRetry={noop}
      />
    )

    const row = screen.getByTestId(`admin-vendor-row-${VENDORS[0].id}`)
    expect(row.textContent).toMatch(/12,500/)
    expect(row.textContent).toMatch(/4/)
  })

  it('names a suspended vendor in words, not only by colour', () => {
    render(
      <VendorsListBody
        vendors={VENDORS}
        isLoading={false}
        error={null}
        onRetry={noop}
      />
    )

    const row = screen.getByTestId(`admin-vendor-row-${VENDORS[1].id}`)
    expect(row.textContent).toMatch(/suspended/i)
  })
})

// ============================================================================
// Navigation registration — the pair that must not drift (#603)
// ============================================================================

describe('navigation registration', () => {
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

  const sidebar = read('app/components/admin/AdminSidebar.tsx')
  const adminNav = read('app/lib/admin-nav.ts')

  it('links /admin/vendors from the sidebar', () => {
    expect(sidebar).toContain("href: '/admin/vendors'")
  })

  it('files it in the primary list, not under Settings', () => {
    const secondary = sidebar.slice(sidebar.indexOf('SECONDARY_NAV_ITEMS'))
    expect(secondary).not.toContain("href: '/admin/vendors'")
  })

  it('publishes the default search params the way /admin/products does', () => {
    expect(adminNav).toContain('ADMIN_VENDORS_SEARCH')
  })

  /**
   * Payables and vendor cost are admin data. `admin-nav-vendor-role.test.ts`
   * asserts the same thing from the other side; this is here so a nav edit
   * that adds the prefix fails in the file that made the edit.
   */
  it('keeps vendors out of content-manager territory', () => {
    const allowed = adminNav.slice(
      adminNav.indexOf('CONTENT_MANAGER_ALLOWED_PREFIXES'),
      adminNav.indexOf('isContentManagerPathAllowed')
    )
    expect(allowed).not.toContain('/admin/vendors')
    expect(allowed).not.toContain('/admin/production')
  })
})
