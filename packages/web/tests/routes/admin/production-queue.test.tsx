/**
 * /admin/production — the production queue, listed.
 *
 * Same two audit findings the vendor directory is pinned against, because this
 * screen is built from the same parts.
 *
 * ## The search schema, first
 *
 * `router.tsx` replaces TanStack's search serialisation with a pair that keeps
 * every value a STRING on the way in and `String(value)` on the way out. A
 * `validateSearch` schema written against real numbers therefore throws on the
 * very first navigation, and a throw inside `validateSearch` is not a
 * validation message — the route error-boundaries and the admin gets a blank
 * page with nothing to read. So the coercion suite is written before the screen.
 *
 * The comma case is the other half of that hazard. Nothing here is a real
 * multi-select — the API takes ONE `stage` and ONE `status` — but a URL can
 * still arrive carrying `?status=draft,sent`, from a hand edit or from a link
 * built by something that joins arrays. Dropping the value on the floor would
 * silently show the wrong queue, and throwing would blank the route, so the
 * schema splits on the comma and keeps the first member it recognises.
 *
 * ## Then the three list states
 *
 * Skeleton, empty AND error, mutually exclusive. #602 and #606 are both open
 * bugs about a failed request rendering a confident `0`, so the error
 * assertions check both halves: the failure is shown, and no fabricated number
 * is shown beside it.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Only the router is stubbed, not the component under test — the same trade
 * vendors-list.test.tsx makes. `createFileRoute` runs at module load and `Link`
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
  productionSearchSchema,
  ProductionQueueBody,
  type AdminProductionJobListItem,
} from '~/routes/admin/production/index'
import { ADMIN_PRODUCTION_SEARCH } from '~/lib/admin-nav'

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

describe('productionSearchSchema', () => {
  it('coerces the string page and pageSize the URL delivers', () => {
    const parsed = productionSearchSchema.parse({ page: '4', pageSize: '50' })

    expect(parsed.page).toBe(4)
    expect(parsed.pageSize).toBe(50)
  })

  it('applies the documented defaults when the URL carries nothing', () => {
    const parsed = productionSearchSchema.parse({})

    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
    expect(parsed.stage).toBeUndefined()
    expect(parsed.status).toBeUndefined()
    expect(parsed.vendorId).toBeUndefined()
  })

  it('keeps stage, status and vendorId as the API spells them', () => {
    const parsed = productionSearchSchema.parse({
      stage: 'frame',
      status: 'qc_failed',
      vendorId: '11111111-1111-4111-8111-111111111111',
    })

    expect(parsed.stage).toBe('frame')
    expect(parsed.status).toBe('qc_failed')
    expect(parsed.vendorId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('clamps pageSize to the API cap rather than asking for the table', () => {
    expect(productionSearchSchema.parse({ pageSize: '100000' }).pageSize).toBe(100)
  })

  /**
   * The comma-joined case. `?status=draft,sent` must not throw and must not be
   * silently dropped — the first recognised member wins, so the admin gets a
   * real queue rather than a blank page or an unfiltered one.
   */
  it('splits a comma-joined status and keeps the first member', () => {
    expect(productionSearchSchema.parse({ status: 'draft,sent' }).status).toBe('draft')
  })

  it('splits a comma-joined stage the same way', () => {
    expect(productionSearchSchema.parse({ stage: 'frame,print' }).stage).toBe('frame')
  })

  it('skips an unrecognised leading member rather than dropping the filter', () => {
    expect(productionSearchSchema.parse({ status: 'nonsense,sent' }).status).toBe('sent')
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
    { stage: 'engraving' },
    { status: 'retired' },
    { status: 'retired,also-retired' },
    { vendorId: 'not-a-uuid' },
    { vendorId: '' },
  ])('never throws on a nonsense URL: %o', (search) => {
    expect(() => productionSearchSchema.parse(search)).not.toThrow()
  })

  it('recovers a usable page number from a nonsense one', () => {
    expect(productionSearchSchema.parse({ page: 'abc' }).page).toBe(1)
    expect(productionSearchSchema.parse({ page: '-3' }).page).toBe(1)
  })

  it('drops a vendorId that is not a uuid instead of asking the API for it', () => {
    expect(productionSearchSchema.parse({ vendorId: 'not-a-uuid' }).vendorId).toBeUndefined()
  })

  it('survives the round trip through router.tsx stringify and parse', () => {
    const once = productionSearchSchema.parse({
      page: '2',
      pageSize: '20',
      stage: 'print',
      status: 'assigned',
      vendorId: '11111111-1111-4111-8111-111111111111',
    })
    const twice = productionSearchSchema.parse(asUrlWouldDeliver(once))

    expect(twice).toEqual(once)
  })

  it('accepts ADMIN_PRODUCTION_SEARCH, so an external link lands on a valid URL', () => {
    const parsed = productionSearchSchema.parse(
      asUrlWouldDeliver({ ...ADMIN_PRODUCTION_SEARCH })
    )

    expect(parsed.page).toBe(ADMIN_PRODUCTION_SEARCH.page)
    expect(parsed.pageSize).toBe(ADMIN_PRODUCTION_SEARCH.pageSize)
  })
})

// ============================================================================
// The three list states
// ============================================================================

const JOBS: AdminProductionJobListItem[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    orderId: 'o1111111-1111-4111-8111-111111111111',
    stage: 'print',
    status: 'assigned',
    vendorId: '11111111-1111-4111-8111-111111111111',
    vendorName: 'Kolkata Print Works',
    assignedAt: '2026-02-01T00:00:00.000Z',
    sentAt: null,
    dueAt: '2026-02-08T00:00:00.000Z',
    receivedAt: null,
    amountExpected: '1800.00',
    amountActual: null,
    settlementId: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    payableAmount: '1800.00',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    orderId: 'o2222222-2222-4222-8222-222222222222',
    stage: 'frame',
    status: 'draft',
    vendorId: null,
    vendorName: null,
    assignedAt: null,
    sentAt: null,
    dueAt: null,
    receivedAt: null,
    amountExpected: null,
    amountActual: null,
    settlementId: null,
    createdAt: '2026-02-02T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
    payableAmount: '0.00',
  },
]

const noop = () => {}

describe('ProductionQueueBody', () => {
  it('renders a skeleton while the first page is in flight', () => {
    render(<ProductionQueueBody jobs={[]} isLoading error={null} onRetry={noop} />)

    expect(screen.getByTestId('admin-production-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-empty')).not.toBeInTheDocument()
  })

  it('renders an empty state, not an empty table, when nothing is queued', () => {
    render(<ProductionQueueBody jobs={[]} isLoading={false} error={null} onRetry={noop} />)

    expect(screen.getByTestId('admin-production-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-skeleton')).not.toBeInTheDocument()
  })

  it('renders an error state with a retry when the request failed', () => {
    render(
      <ProductionQueueBody
        jobs={[]}
        isLoading={false}
        error="Failed to load production jobs"
        onRetry={noop}
      />
    )

    const state = screen.getByTestId('admin-production-error')
    expect(state.textContent).toMatch(/failed to load production jobs/i)
    expect(screen.getByTestId('admin-production-retry')).toBeInTheDocument()
  })

  /** #602 and #606, as a guard: no confident number over a failed request. */
  it('fabricates no number when the request failed', () => {
    const { container } = render(
      <ProductionQueueBody
        jobs={[]}
        isLoading={false}
        error="Failed to load production jobs"
        onRetry={noop}
      />
    )

    expect(screen.queryByTestId('admin-production-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-empty')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/₹/)
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('is a table of jobs once the page has loaded', () => {
    render(<ProductionQueueBody jobs={JOBS} isLoading={false} error={null} onRetry={noop} />)

    expect(screen.getByTestId('admin-production-table')).toBeInTheDocument()
    expect(screen.getByTestId(`admin-production-row-${JOBS[0].id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`admin-production-row-${JOBS[1].id}`)).toBeInTheDocument()
  })

  it('names the vendor, the stage and the status in words', () => {
    render(<ProductionQueueBody jobs={JOBS} isLoading={false} error={null} onRetry={noop} />)

    const row = screen.getByTestId(`admin-production-row-${JOBS[0].id}`)
    expect(row.textContent).toMatch(/Kolkata Print Works/)
    expect(row.textContent).toMatch(/print/i)
    expect(row.textContent).toMatch(/assigned/i)
    expect(row.textContent).toMatch(/1,800/)
  })

  /**
   * An unassigned draft has no vendor. "Unassigned" in words beats an empty
   * cell, which reads as a rendering bug rather than as work waiting.
   */
  it('says a draft job is unassigned rather than leaving the cell blank', () => {
    render(<ProductionQueueBody jobs={JOBS} isLoading={false} error={null} onRetry={noop} />)

    const row = screen.getByTestId(`admin-production-row-${JOBS[1].id}`)
    expect(row.textContent).toMatch(/unassigned/i)
  })
})

// ============================================================================
// Navigation registration — the pair that must not drift (#603)
// ============================================================================

describe('navigation registration', () => {
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

  const sidebar = read('app/components/admin/AdminSidebar.tsx')
  const adminNav = read('app/lib/admin-nav.ts')

  it('links /admin/production from the sidebar', () => {
    expect(sidebar).toContain("href: '/admin/production'")
  })

  it('files it in the primary list, not under Settings', () => {
    const secondary = sidebar.slice(sidebar.indexOf('SECONDARY_NAV_ITEMS'))
    expect(secondary).not.toContain("href: '/admin/production'")
  })

  it('publishes the default search params the way /admin/vendors does', () => {
    expect(adminNav).toContain('ADMIN_PRODUCTION_SEARCH')
  })

  /**
   * Vendor cost is admin data and the production API gates with `requireAdmin`.
   * `admin-nav-vendor-role.test.ts` asserts the refusal from the other side;
   * this is here so a nav edit that adds the prefix fails in the file that made
   * the edit.
   */
  it('keeps production out of content-manager territory', () => {
    const allowed = adminNav.slice(
      adminNav.indexOf('CONTENT_MANAGER_ALLOWED_PREFIXES'),
      adminNav.indexOf('isContentManagerPathAllowed')
    )
    expect(allowed).not.toContain('/admin/production')
  })
})
