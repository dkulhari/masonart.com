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
 * still arrive carrying `?status=draft,dispatched`, from a hand edit or from a
 * link built by something that joins arrays. Dropping the value on the floor
 * would silently show the wrong queue, and throwing would blank the route, so
 * the schema splits on the comma and keeps the first member it recognises.
 *
 * ## Then the three list states
 *
 * Skeleton, empty AND error, mutually exclusive. #602 and #606 are both open
 * bugs about a failed request rendering a confident `0`, so the error
 * assertions check both halves: the failure is shown, and no fabricated number
 * is shown beside it.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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
  PRODUCTION_JOB_STATUSES,
  PRODUCTION_TRANSITIONS,
  UNREACHABLE_STATUSES,
} from '@chobii/shared'
import {
  productionSearchSchema,
  ProductionQueueBody,
  ASSIGNABLE_STATUSES,
  PRODUCTION_STATUSES,
  STATUS_LABELS,
  STATUS_STYLES,
  StatusPill,
  isAssignable,
  assignRefusal,
  ASSIGN_REFUSAL_MESSAGES,
  assignJobsToVendor,
  BulkAssignBar,
  BulkAssignResults,
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
    expect(productionSearchSchema.parse({ status: 'draft,dispatched' }).status).toBe('draft')
  })

  it('splits a comma-joined stage the same way', () => {
    expect(productionSearchSchema.parse({ stage: 'frame,print' }).stage).toBe('frame')
  })

  it('skips an unrecognised leading member rather than dropping the filter', () => {
    expect(productionSearchSchema.parse({ status: 'nonsense,dispatched' }).status).toBe(
      'dispatched'
    )
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

// ============================================================================
// The vocabulary — one list, and nothing rendered from a gap in it
// ============================================================================

/**
 * The enum as the API actually declares it, read off disk.
 *
 * The screen no longer writes the vocabulary down — it derives it from
 * `@chobii/shared/schemas/production-transitions`. But that shared tuple is
 * itself a mirror of the pgEnum, because `schema/` is drizzle-kit's input and a
 * value import from this ESM-only package there breaks `drizzle-kit generate`.
 * So one seam is left, and this is the assertion across it from the consumer's
 * side: whatever the pgEnum holds, this screen renders legibly.
 *
 * #696 is what an unwatched seam costs: `qc_submitted` and `dispatched` were
 * added to the enum, the screen's hardcoded seven-value list was not widened,
 * and the result was a blank badge and a filter that silently dropped the row.
 */
const API_STATUS_ENUM: string[] = (() => {
  const source = readFileSync(
    join(process.cwd(), '../api/src/database/schema/production-jobs.ts'),
    'utf8'
  )
  const declaration = source.slice(source.indexOf("pgEnum('production_job_status'"))
  const values = declaration.slice(0, declaration.indexOf('])'))
  return [...values.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).slice(1)
})()

describe('the production status vocabulary', () => {
  it('reads a non-trivial enum off the API source, so the drift tests mean something', () => {
    expect(API_STATUS_ENUM.length).toBeGreaterThan(5)
    expect(API_STATUS_ENUM).toContain('draft')
  })

  /**
   * The headline of #688: the vocabulary exists once. Not "the two lists agree"
   * — there is no second list to agree with.
   */
  it('is the shared tuple minus whatever the matrix retired, not a copy', () => {
    const derived = PRODUCTION_JOB_STATUSES.filter(
      (status) => !UNREACHABLE_STATUSES.includes(status)
    )

    expect([...PRODUCTION_STATUSES]).toEqual(derived)
    expect(derived.length).toBeLessThan(PRODUCTION_JOB_STATUSES.length)
  })

  it('reads its assignable set off the matrix rather than listing it', () => {
    const fromMatrix = PRODUCTION_JOB_STATUSES.filter(
      (from) => PRODUCTION_TRANSITIONS[from].assigned?.actors.includes('admin') ?? false
    )

    expect([...ASSIGNABLE_STATUSES]).toEqual(fromMatrix)
    expect(fromMatrix.length).toBeGreaterThan(0)
  })

  it('offers the two statuses production-pipeline added', () => {
    expect(PRODUCTION_STATUSES).toContain('qc_submitted')
    expect(PRODUCTION_STATUSES).toContain('dispatched')
  })

  /** Decision 9: retired in code, kept in the Postgres type. */
  it('no longer offers the retired status', () => {
    expect(PRODUCTION_STATUSES as readonly string[]).not.toContain('sent')
    expect(Object.keys(STATUS_LABELS)).not.toContain('sent')
    expect(Object.keys(STATUS_STYLES)).not.toContain('sent')
  })

  it('invents no status the API does not have, and keeps the enum order', () => {
    for (const status of PRODUCTION_STATUSES) {
      expect(API_STATUS_ENUM).toContain(status)
    }

    const inEnumOrder = API_STATUS_ENUM.filter((v) =>
      (PRODUCTION_STATUSES as readonly string[]).includes(v)
    )
    expect([...PRODUCTION_STATUSES]).toEqual(inEnumOrder)
  })

  it.each([...PRODUCTION_STATUSES])('gives %s a label and a style', (status) => {
    expect(STATUS_LABELS[status]).toBeTruthy()
    expect(STATUS_STYLES[status]).toBeTruthy()
  })

  /** #696, mechanically: every value a row can carry renders as words. */
  it.each(API_STATUS_ENUM)('renders %s as a legible badge, never a blank one', (status) => {
    render(<StatusPill status={status} />)

    const pill = screen.getByTestId(`admin-production-status-${status}`)
    expect(pill.textContent?.trim()).toBeTruthy()
    expect(pill.textContent).not.toMatch(/undefined/i)
    expect(pill.className).toMatch(/border/)
  })

  /**
   * The relabelling. "Sent"/"Received" is the neutral wording that let the
   * sent/received ambiguity survive two tickets; `received` now means the
   * vendor has everything needed to start.
   */
  it('does not label received with the bare word that caused the ambiguity', () => {
    expect(STATUS_LABELS.received.trim().toLowerCase()).not.toBe('received')
  })

  it('says qc_submitted is blocked on us, because that is the admin QC queue', () => {
    expect(STATUS_LABELS.qc_submitted).toMatch(/\bour\b|\bawait/i)
  })

  it('says dispatched in words a despatch clerk would use', () => {
    expect(STATUS_LABELS.dispatched).toMatch(/dispatch/i)
  })

  it('falls back to the raw value rather than an empty pill', () => {
    render(<StatusPill status="something_new" />)

    expect(screen.getByTestId('admin-production-status-something_new').textContent).toMatch(
      /something_new/
    )
  })
})

// ============================================================================
// The new statuses, through the URL
// ============================================================================

describe('the new statuses round-trip through the URL', () => {
  it.each([...PRODUCTION_STATUSES])('keeps ?status=%s', (status) => {
    expect(productionSearchSchema.parse({ status }).status).toBe(status)
  })

  it.each([...PRODUCTION_STATUSES])(
    'survives router.tsx stringify and parse for %s',
    (status) => {
      const once = productionSearchSchema.parse({ status })
      expect(productionSearchSchema.parse(asUrlWouldDeliver(once)).status).toBe(status)
    }
  )

  /** A bookmark from before the retirement must degrade, not blank the route. */
  it('drops a retired status instead of error-boundarying the route', () => {
    expect(() => productionSearchSchema.parse({ status: 'sent' })).not.toThrow()
    expect(productionSearchSchema.parse({ status: 'sent' }).status).toBeUndefined()
  })
})

// ============================================================================
// Which jobs can be assigned at all — read from the matrix, not invented
// ============================================================================

const jobWith = (
  overrides: Partial<AdminProductionJobListItem>
): AdminProductionJobListItem => ({ ...JOBS[1], ...overrides })

describe('isAssignable', () => {
  /** The three matrix rows with an admin edge to `assigned`. */
  it.each(['draft', 'assigned', 'qc_failed'] as const)(
    'lets an admin assign a %s job',
    (status) => {
      expect(isAssignable(jobWith({ status }))).toBe(true)
    }
  )

  it.each(['received', 'qc_submitted', 'qc_passed', 'dispatched', 'cancelled'] as const)(
    'refuses a %s job, which the matrix gives no admin edge to assigned',
    (status) => {
      expect(isAssignable(jobWith({ status }))).toBe(false)
    }
  )

  /**
   * A settled job is frozen: payables are derived with no stored total, so
   * re-pricing one makes the settlement disagree with the sum of its jobs.
   */
  it('refuses a settled job even in an assignable status', () => {
    expect(
      isAssignable(jobWith({ status: 'draft', settlementId: 's1111111-1111-4111-8111-111111111111' }))
    ).toBe(false)
  })

  /**
   * The assign route's third unconditional refusal. Neither this screen nor the
   * detail screen has a control that sets or clears `amountActual`, so nothing
   * either of them can send satisfies `NEGOTIATED_AMOUNT_PRESENT`: a job
   * carrying one is refused 100% of the time, and ticking it into a bulk
   * assign only spends a round trip to be told so.
   */
  it('refuses a job carrying a negotiated amount', () => {
    expect(isAssignable(jobWith({ status: 'assigned', amountActual: '350.00' }))).toBe(false)
  })
})

describe('assignRefusal — which refusal, so a screen can say it', () => {
  it('names no refusal for a job an admin can assign', () => {
    expect(assignRefusal(jobWith({ status: 'draft' }))).toBeNull()
  })

  it('names the settlement first, which the API checks first', () => {
    expect(
      assignRefusal(
        jobWith({
          status: 'dispatched',
          settlementId: 's1111111-1111-4111-8111-111111111111',
          amountActual: '350.00',
        })
      )
    ).toBe('settled')
  })

  it('names the status when the matrix has no admin edge to assigned', () => {
    expect(assignRefusal(jobWith({ status: 'dispatched' }))).toBe('status')
  })

  it('names the negotiated amount on an otherwise assignable job', () => {
    expect(assignRefusal(jobWith({ status: 'assigned', amountActual: '350.00' }))).toBe(
      'negotiated_amount'
    )
  })

  it('gives every refusal a sentence to render', () => {
    for (const code of ['settled', 'status', 'negotiated_amount'] as const) {
      expect(ASSIGN_REFUSAL_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })

  it('agrees with isAssignable on every status the matrix knows', () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      const job = jobWith({ status })
      expect(isAssignable(job)).toBe(assignRefusal(job) === null)
    }
  })
})

// ============================================================================
// Selecting jobs in the table
// ============================================================================

const SELECTABLE_JOBS: AdminProductionJobListItem[] = [
  jobWith({ id: 'job-draft', status: 'draft' }),
  jobWith({ id: 'job-dispatched', status: 'dispatched' }),
  jobWith({ id: 'job-failed', status: 'qc_failed' }),
]

describe('ProductionQueueBody selection', () => {
  it('offers a checkbox on every job an admin could actually assign', () => {
    render(
      <ProductionQueueBody
        jobs={SELECTABLE_JOBS}
        isLoading={false}
        error={null}
        onRetry={noop}
        selectedIds={new Set()}
        onToggleJob={noop}
        onToggleAll={noop}
      />
    )

    expect(screen.getByTestId('admin-production-select-job-draft')).toBeEnabled()
    expect(screen.getByTestId('admin-production-select-job-failed')).toBeEnabled()
    expect(screen.getByTestId('admin-production-select-job-dispatched')).toBeDisabled()
  })

  it('ticks the boxes the caller says are selected', () => {
    render(
      <ProductionQueueBody
        jobs={SELECTABLE_JOBS}
        isLoading={false}
        error={null}
        onRetry={noop}
        selectedIds={new Set(['job-failed'])}
        onToggleJob={noop}
        onToggleAll={noop}
      />
    )

    expect(screen.getByTestId('admin-production-select-job-failed')).toBeChecked()
    expect(screen.getByTestId('admin-production-select-job-draft')).not.toBeChecked()
  })

  it('reports a toggle by job id', () => {
    const onToggleJob = vi.fn()
    render(
      <ProductionQueueBody
        jobs={SELECTABLE_JOBS}
        isLoading={false}
        error={null}
        onRetry={noop}
        selectedIds={new Set()}
        onToggleJob={onToggleJob}
        onToggleAll={noop}
      />
    )

    fireEvent.click(screen.getByTestId('admin-production-select-job-draft'))

    expect(onToggleJob).toHaveBeenCalledWith('job-draft')
  })

  it('select-all reaches only the assignable rows on this page', () => {
    const onToggleAll = vi.fn()
    render(
      <ProductionQueueBody
        jobs={SELECTABLE_JOBS}
        isLoading={false}
        error={null}
        onRetry={noop}
        selectedIds={new Set()}
        onToggleJob={noop}
        onToggleAll={onToggleAll}
      />
    )

    fireEvent.click(screen.getByTestId('admin-production-select-all'))

    expect(onToggleAll).toHaveBeenCalledWith(['job-draft', 'job-failed'])
  })
})

// ============================================================================
// Assigning many jobs to one vendor — per job atomic, batch level partial
// ============================================================================

const VENDOR_ID = '22222222-2222-4222-8222-222222222222'

function mockAssignFetch(
  responses: Record<string, { ok: boolean; status?: number; body?: unknown }>
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const jobId = url.match(/production\/([^/]+)\/assign/)?.[1] ?? ''
    const planned = responses[jobId] ?? { ok: true, body: {} }

    return {
      ok: planned.ok,
      status: planned.status ?? (planned.ok ? 200 : 422),
      json: async () => planned.body ?? {},
    } as Response
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('assignJobsToVendor', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts exactly once per selected job, to that job’s own endpoint', async () => {
    const fetchMock = mockAssignFetch({})

    await assignJobsToVendor(['j1', 'j2', 'j3'], VENDOR_ID)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls[0]).toMatch(/\/api\/admin\/production\/j1\/assign$/)
    expect(urls[1]).toMatch(/\/api\/admin\/production\/j2\/assign$/)
    expect(urls[2]).toMatch(/\/api\/admin\/production\/j3\/assign$/)

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(String(init.body))).toEqual({ vendorId: VENDOR_ID })
  })

  /** The whole point of D2: one unpriced job must not block nine good ones. */
  it('lets the good jobs through when one is refused', async () => {
    const fetchMock = mockAssignFetch({
      j2: {
        ok: false,
        status: 422,
        body: {
          error: 'Kolkata Print Works has no rate covering 1 item(s) on this job',
          unpriced: [{ orderItemId: 'oi-1', longestEdge: 48, size: '36x48' }],
        },
      },
    })

    const outcomes = await assignJobsToVendor(['j1', 'j2', 'j3'], VENDOR_ID)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(outcomes.map((o) => o.jobId)).toEqual(['j1', 'j2', 'j3'])
    expect(outcomes.map((o) => o.assigned)).toEqual([true, false, true])
  })

  it('carries the unpriced items through, because they are the remedy', async () => {
    mockAssignFetch({
      j2: {
        ok: false,
        status: 422,
        body: {
          error: 'no rate',
          unpriced: [{ orderItemId: 'oi-1', longestEdge: 48, size: '36x48' }],
        },
      },
    })

    const [, refused] = await assignJobsToVendor(['j1', 'j2'], VENDOR_ID)

    expect(refused.unpriced).toEqual([
      { orderItemId: 'oi-1', longestEdge: 48, size: '36x48' },
    ])
    expect(refused.error).toBe('no rate')
  })

  it('turns a thrown request into that job’s refusal, not the batch’s', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/j1/')) throw new Error('Network down')
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const outcomes = await assignJobsToVendor(['j1', 'j2'], VENDOR_ID)

    expect(outcomes[0].assigned).toBe(false)
    expect(outcomes[0].error).toMatch(/network down/i)
    expect(outcomes[1].assigned).toBe(true)
  })

  it('reports a 409 as a refusal with its own reason, not as an unpriced list', async () => {
    mockAssignFetch({
      j1: {
        ok: false,
        status: 409,
        body: { error: 'This job is already settled', code: 'JOB_SETTLED' },
      },
    })

    const [outcome] = await assignJobsToVendor(['j1'], VENDOR_ID)

    expect(outcome.assigned).toBe(false)
    expect(outcome.error).toMatch(/already settled/i)
    expect(outcome.unpriced).toEqual([])
  })
})

// ============================================================================
// The bulk bar — no native dialog anywhere near it
// ============================================================================

const VENDORS = [
  { id: VENDOR_ID, name: 'Kolkata Print Works' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Howrah Framing' },
]

const barProps = {
  selectedCount: 3,
  vendors: VENDORS,
  vendorsLoading: false,
  vendorsError: null,
  onRetryVendors: noop,
  vendorId: VENDOR_ID,
  onVendorChange: noop,
  onAssign: noop,
  isAssigning: false,
  onClearSelection: noop,
}

describe('BulkAssignBar', () => {
  it('stays out of the way until something is selected', () => {
    const { container } = render(<BulkAssignBar {...barProps} selectedCount={0} />)

    expect(container.textContent).toBe('')
  })

  it('says how many jobs the next action would touch', () => {
    render(<BulkAssignBar {...barProps} />)

    expect(screen.getByTestId('admin-production-bulk-bar').textContent).toMatch(/3/)
  })

  it('will not assign until a vendor has been chosen', () => {
    render(<BulkAssignBar {...barProps} vendorId={null} />)

    expect(screen.getByTestId('admin-production-bulk-assign')).toBeDisabled()
  })

  /**
   * reviews.tsx:269 — native dialogs block the automation harness outright,
   * which is how nine admin destructive paths ended up with no E2E coverage.
   */
  it('confirms inline, and touches no native dialog', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const alertSpy = vi.spyOn(window, 'alert')
    const onAssign = vi.fn()

    render(<BulkAssignBar {...barProps} onAssign={onAssign} />)
    fireEvent.click(screen.getByTestId('admin-production-bulk-assign'))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(onAssign).not.toHaveBeenCalled()
    expect(screen.getByTestId('admin-production-bulk-confirm')).toBeInTheDocument()

    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })

  it('assigns once the second step is taken', () => {
    const onAssign = vi.fn()
    render(<BulkAssignBar {...barProps} onAssign={onAssign} />)

    fireEvent.click(screen.getByTestId('admin-production-bulk-assign'))
    fireEvent.click(screen.getByTestId('admin-production-bulk-confirm'))

    expect(onAssign).toHaveBeenCalledTimes(1)
  })

  it('backs out of the confirm without writing anything', () => {
    const onAssign = vi.fn()
    render(<BulkAssignBar {...barProps} onAssign={onAssign} />)

    fireEvent.click(screen.getByTestId('admin-production-bulk-assign'))
    fireEvent.click(screen.getByTestId('admin-production-bulk-cancel'))

    expect(onAssign).not.toHaveBeenCalled()
    expect(screen.queryByTestId('admin-production-bulk-confirm')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-production-bulk-assign')).toBeInTheDocument()
  })

  it('names the vendor in the confirm step, so the second click is informed', () => {
    render(<BulkAssignBar {...barProps} />)
    fireEvent.click(screen.getByTestId('admin-production-bulk-assign'))

    expect(screen.getByTestId('admin-production-bulk-bar').textContent).toMatch(
      /Kolkata Print Works/
    )
  })

  it('locks the control while the batch is in flight', () => {
    render(<BulkAssignBar {...barProps} isAssigning />)

    expect(screen.getByTestId('admin-production-bulk-assign')).toBeDisabled()
  })

  // --- the vendor picker's own three states ---

  it('shows a skeleton while the supplier list is in flight', () => {
    render(<BulkAssignBar {...barProps} vendors={[]} vendorsLoading />)

    expect(screen.getByTestId('admin-production-bulk-vendors-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-bulk-vendor')).not.toBeInTheDocument()
  })

  it('shows the failure and a retry when the supplier list did not load', () => {
    const onRetryVendors = vi.fn()
    render(
      <BulkAssignBar
        {...barProps}
        vendors={[]}
        vendorsError="Failed to load vendors"
        onRetryVendors={onRetryVendors}
      />
    )

    expect(screen.getByTestId('admin-production-bulk-vendors-error').textContent).toMatch(
      /failed to load vendors/i
    )
    fireEvent.click(screen.getByTestId('admin-production-bulk-vendors-retry'))
    expect(onRetryVendors).toHaveBeenCalled()
  })

  it('says there is no active supplier rather than offering an empty select', () => {
    render(<BulkAssignBar {...barProps} vendors={[]} vendorId={null} />)

    expect(screen.getByTestId('admin-production-bulk-vendors-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-bulk-vendor')).not.toBeInTheDocument()
  })
})

// ============================================================================
// The refusals — named per job, per item, the way AssignmentFailure does
// ============================================================================

const OUTCOMES = [
  { jobId: 'aaaaaaaa-1111-4111-8111-111111111111', assigned: true, error: null, code: null, unpriced: [] },
  {
    jobId: 'bbbbbbbb-2222-4222-8222-222222222222',
    assigned: false,
    error: 'Kolkata Print Works has no rate covering 2 item(s) on this job',
    code: null,
    unpriced: [
      { orderItemId: 'oi-1', longestEdge: 48, size: '36x48' },
      { orderItemId: 'oi-2', longestEdge: null, size: null },
    ],
  },
  {
    jobId: 'cccccccc-3333-4333-8333-333333333333',
    assigned: false,
    error: 'This job is already settled and cannot be assigned or re-priced.',
    code: 'JOB_SETTLED',
    unpriced: [],
  },
]

describe('BulkAssignResults', () => {
  it('renders nothing before a batch has run', () => {
    const { container } = render(
      <BulkAssignResults outcomes={[]} vendorName="Kolkata Print Works" onDismiss={noop} />
    )

    expect(container.textContent).toBe('')
  })

  it('counts what was written and what was not', () => {
    render(
      <BulkAssignResults outcomes={OUTCOMES} vendorName="Kolkata Print Works" onDismiss={noop} />
    )

    const panel = screen.getByTestId('admin-production-bulk-results')
    expect(panel.textContent).toMatch(/1 .*assigned/i)
    expect(panel.textContent).toMatch(/2 .*refused/i)
  })

  it('names every refused job, so a refusal is actionable rather than a banner', () => {
    render(
      <BulkAssignResults outcomes={OUTCOMES} vendorName="Kolkata Print Works" onDismiss={noop} />
    )

    expect(
      screen.getByTestId('admin-production-bulk-result-bbbbbbbb-2222-4222-8222-222222222222')
        .textContent
    ).toMatch(/no rate covering/i)
    expect(
      screen.getByTestId('admin-production-bulk-result-cccccccc-3333-4333-8333-333333333333')
        .textContent
    ).toMatch(/already settled/i)
  })

  /** Mirrors AssignmentFailure in $id.tsx: the item and its size, never a zero. */
  it('names each unpriced item with its size and its longest edge', () => {
    render(
      <BulkAssignResults outcomes={OUTCOMES} vendorName="Kolkata Print Works" onDismiss={noop} />
    )

    const row = screen.getByTestId(
      'admin-production-bulk-unpriced-bbbbbbbb-2222-4222-8222-222222222222-oi-1'
    )
    expect(row.textContent).toMatch(/36×48/)
    expect(row.textContent).toMatch(/48/)
  })

  it('says an unknown size in words rather than printing a zero', () => {
    render(
      <BulkAssignResults outcomes={OUTCOMES} vendorName="Kolkata Print Works" onDismiss={noop} />
    )

    const row = screen.getByTestId(
      'admin-production-bulk-unpriced-bbbbbbbb-2222-4222-8222-222222222222-oi-2'
    )
    expect(row.textContent).toMatch(/unknown/i)
    expect(row.textContent).not.toMatch(/\b0\b/)
  })

  it('lists no refusal block when every job was written', () => {
    render(
      <BulkAssignResults
        outcomes={[OUTCOMES[0]]}
        vendorName="Kolkata Print Works"
        onDismiss={noop}
      />
    )

    expect(screen.getByTestId('admin-production-bulk-results').textContent).toMatch(
      /1 .*assigned/i
    )
    expect(screen.queryByTestId('admin-production-bulk-refusals')).not.toBeInTheDocument()
  })

  it('can be dismissed, so the panel is not a permanent fixture', () => {
    const onDismiss = vi.fn()
    render(
      <BulkAssignResults outcomes={OUTCOMES} vendorName="Kolkata Print Works" onDismiss={onDismiss} />
    )

    fireEvent.click(screen.getByTestId('admin-production-bulk-results-dismiss'))

    expect(onDismiss).toHaveBeenCalled()
  })
})

// ============================================================================
// The retired word, gone from the screen
// ============================================================================

describe('the retired status is absent from the screen', () => {
  const queueSource = readFileSync(
    join(process.cwd(), 'app/routes/admin/production/index.tsx'),
    'utf8'
  )

  it('carries no string literal for it', () => {
    expect(queueSource).not.toMatch(/'sent'/)
    expect(queueSource).not.toMatch(/"sent"/)
  })

  /** And carries no second copy of the vocabulary for it to hide in. */
  it('takes the vocabulary from the shared matrix rather than writing one', () => {
    expect(queueSource).toMatch(/from '@chobii\/shared'/)
    expect(queueSource).toMatch(/PRODUCTION_JOB_STATUSES/)
    expect(queueSource).toMatch(/UNREACHABLE_STATUSES/)
  })

  /**
   * This assertion used to render `ProductionQueueBody` and look for the word
   * in it. There is no filter markup in that component at all — the status
   * `<select>` lives in `AdminProductionQueuePage`, which this suite never
   * renders — over a fixture carrying no retired row either, so nothing it
   * looked for could ever have been present and nothing could ever have turned
   * it red. The property is worth keeping; the test was not.
   *
   * The options are `PRODUCTION_STATUSES.map(...)` and nothing else, so what
   * that list does not contain is what the filter cannot offer. Asserting
   * against the list is asserting against the options, and it goes red the day
   * the retired value is filterable again — whether by an edit here or by an
   * edge appearing in the shared matrix.
   */
  it('offers no filter option for it', () => {
    expect(queueSource).toMatch(/data-testid="admin-production-filter-status"/)
    expect(queueSource).toMatch(/\{PRODUCTION_STATUSES\.map\(/)

    expect(PRODUCTION_STATUSES).not.toContain('sent')
    // Not vacuous over an empty or unrelated list: the reachable statuses ARE
    // offered, and the retired one is the only member of the vocabulary missing.
    expect(PRODUCTION_STATUSES).toContain('assigned')
    expect([...PRODUCTION_STATUSES]).toEqual(
      PRODUCTION_JOB_STATUSES.filter((status) => status !== 'sent')
    )
  })
})
