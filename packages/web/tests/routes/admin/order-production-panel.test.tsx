/**
 * The production panel on /admin/orders/$id.
 *
 * One requirement carries this component: **it has to show the order items that
 * are on NO job.** An order line with no production job is invisible work —
 * nothing has been ordered from a supplier, nothing is late, nothing will ever
 * be inspected — and the production queue cannot show it, because the queue
 * only lists jobs that exist. This panel is the only surface where that gap
 * appears at all.
 *
 * Which is also why the panel must never GUESS, and that is what the rest of
 * this file is about. The old queue scan had a `truncated` flag because a
 * client-side scan could be cut short; #682 gave `GET /api/admin/production` an
 * `orderId` filter, so the scan, the flag and the tests over it are gone. The
 * REASON they existed is not:
 *
 * - a readiness read that failed renders an error and never "ready to label",
 *   because this is the one verdict on the screen that spends money;
 * - "not ready" is never rendered bare — the blockers are the answer, and every
 *   code carries its own next step;
 * - a transfer list that failed to load never reads as an order with no
 *   transfers;
 * - a consolidator whose provenance was not read is UNKNOWN, not a system
 *   default, and a consolidation read that FAILED is told apart from an order
 *   with no consolidation row in it;
 * - every claim in the consolidator box is wired to the read it depends on:
 *   the jobs read backs the vendor options and half the name lookup, so a
 *   failed jobs read must never render "nobody holds a live job on this
 *   order… assign a job first" over a list nobody read.
 *
 * Each assertion below is mutation-checked: breaking the branch it covers turns
 * it red.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

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
  }) => (
    <a href={props.to} className={props.className}>
      {children}
    </a>
  ),
}))

import {
  BLOCKER_ACTIONS,
  ConsolidatorPicker,
  OrderProductionPanel,
  OrderProductionPanelBody,
  OrderReadinessPanel,
  OrderTransfersPanel,
  blockerAction,
  consolidatorRefusalAdvice,
  fetchOrderConsolidation,
  fetchOrderProductionJobs,
  fetchOrderTransfers,
  orderVendorOptions,
  provenanceFromConsolidation,
  setOrderConsolidator,
  unassignedOrderItems,
  vendorNameFor,
  type LabelBlockerCode,
  type OrderConsolidation,
  type OrderProductionJob,
  type OrderProductionPanelItem,
  type OrderReadiness,
  type OrderTransfer,
} from '~/routes/admin/production/OrderProductionPanel'

afterEach(cleanup)

const noop = () => {}

const ORDER_ITEMS: OrderProductionPanelItem[] = [
  {
    id: 'oi-print',
    quantity: 1,
    snapshot: { title: 'Sundarbans at Dawn', sizeLabel: '24×36' },
    product: { title: 'Sundarbans at Dawn' },
    variant: { sizeLabel: '24×36' },
  },
  {
    id: 'oi-frame',
    quantity: 1,
    snapshot: { title: 'Teak Frame', sizeLabel: '24×36' },
    product: { title: 'Teak Frame' },
    variant: { sizeLabel: '24×36' },
  },
  {
    id: 'oi-orphan',
    quantity: 2,
    snapshot: { title: 'Howrah Bridge', sizeLabel: '12×18' },
    product: { title: 'Howrah Bridge' },
    variant: { sizeLabel: '12×18' },
  },
]

const JOBS: OrderProductionJob[] = [
  {
    id: 'job-print',
    orderId: 'order-1',
    stage: 'print',
    status: 'assigned',
    vendorId: 'v1',
    vendorName: 'Kolkata Print Works',
    assignedAt: '2026-03-01T00:00:00.000Z',
    sentAt: null,
    dueAt: null,
    receivedAt: null,
    amountExpected: '900.00',
    amountActual: null,
    settlementId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    payableAmount: '900.00',
    items: [
      {
        id: 'ji-1',
        orderItemId: 'oi-print',
        quantity: 1,
        widthInches: 24,
        heightInches: 36,
        sizeLabel: '24×36',
      },
    ],
  },
  {
    id: 'job-frame',
    orderId: 'order-1',
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
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    payableAmount: '0.00',
    items: [
      {
        id: 'ji-2',
        orderItemId: 'oi-frame',
        quantity: 1,
        widthInches: 24,
        heightInches: 36,
        sizeLabel: '24×36',
      },
    ],
  },
]

const TRANSFER: OrderTransfer = {
  id: 'tr-1',
  orderId: 'order-1',
  fromVendorId: 'v1',
  fromVendorName: 'Kolkata Print Works',
  toVendorId: 'v9',
  toVendorName: 'Zamin Framers',
  carrier: 'Blue Dart',
  reference: 'BD-99123',
  pieceCount: 2,
  costAmount: '450.00',
  dispatchedAt: '2026-03-06T00:00:00.000Z',
  expectedBy: '2026-03-08T00:00:00.000Z',
  receivedAt: null,
  lostAt: null,
  lostNote: null,
  createdAt: '2026-03-06T00:00:00.000Z',
  updatedAt: '2026-03-06T00:00:00.000Z',
  state: 'in_transit',
  jobIds: ['job-print'],
}

// ============================================================================
// The gap
// ============================================================================

describe('unassignedOrderItems', () => {
  it('is the order items that appear on no job at all', () => {
    expect(unassignedOrderItems(ORDER_ITEMS, JOBS).map((i) => i.id)).toEqual(['oi-orphan'])
  })

  it('is empty when every item is covered', () => {
    expect(unassignedOrderItems(ORDER_ITEMS.slice(0, 2), JOBS)).toEqual([])
  })

  /** No jobs yet means every line is uncovered, not that nothing is missing. */
  it('is every item when the order has no jobs', () => {
    expect(unassignedOrderItems(ORDER_ITEMS, []).map((i) => i.id)).toEqual([
      'oi-print',
      'oi-frame',
      'oi-orphan',
    ])
  })

  /**
   * A cancelled job is not production. Counting it as coverage would hide the
   * item that now needs re-ordering — the exact hole the panel exists to show.
   */
  it('does not let a cancelled job count as coverage', () => {
    const cancelled: OrderProductionJob[] = [
      { ...JOBS[0], status: 'cancelled' },
      JOBS[1],
    ]

    expect(unassignedOrderItems(ORDER_ITEMS, cancelled).map((i) => i.id)).toEqual([
      'oi-print',
      'oi-orphan',
    ])
  })
})

// ============================================================================
// The panel
// ============================================================================

describe('OrderProductionPanelBody', () => {
  const renderPanel = (
    overrides: Partial<React.ComponentProps<typeof OrderProductionPanelBody>> = {}
  ) =>
    render(
      <OrderProductionPanelBody
        jobs={JOBS}
        orderItems={ORDER_ITEMS}
        isLoading={false}
        error={null}
        onRetry={noop}
        {...overrides}
      />
    )

  it('renders a skeleton while the queue is being read', () => {
    renderPanel({ isLoading: true, jobs: [] })

    expect(screen.getByTestId('admin-order-production-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-production-jobs')).not.toBeInTheDocument()
  })

  it('renders an error with a retry when the queue read failed', () => {
    renderPanel({ jobs: [], error: 'Failed to load production jobs' })

    expect(screen.getByTestId('admin-order-production-error').textContent).toMatch(
      /failed to load production jobs/i
    )
    expect(screen.getByTestId('admin-order-production-retry')).toBeInTheDocument()
  })

  /**
   * #602/#606 again, in its sharpest form here: a failed read must not print
   * "0 jobs" and must not claim any item is unassigned.
   */
  it('claims nothing about coverage when the queue read failed', () => {
    renderPanel({ jobs: [], error: 'Failed to load production jobs' })

    expect(screen.queryByTestId('admin-order-production-unassigned')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-production-jobs')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-order-production-error').textContent).not.toMatch(/\d/)
  })

  it('shows the empty state when the order has no jobs, and still names the gap', () => {
    renderPanel({ jobs: [] })

    expect(screen.getByTestId('admin-order-production-empty')).toBeInTheDocument()
    // Every line is uncovered — that is the whole point of the empty case.
    expect(screen.getByTestId('admin-order-production-unassigned')).toBeInTheDocument()
    expect(
      screen.getByTestId('admin-order-production-unassigned-item-oi-orphan')
    ).toBeInTheDocument()
  })

  it('lists each job with its stage, status and vendor', () => {
    renderPanel()

    const printJob = screen.getByTestId('admin-order-production-job-job-print')
    expect(printJob.textContent).toMatch(/print/i)
    expect(printJob.textContent).toMatch(/assigned/i)
    expect(printJob.textContent).toMatch(/Kolkata Print Works/)

    const frameJob = screen.getByTestId('admin-order-production-job-job-frame')
    expect(frameJob.textContent).toMatch(/unassigned/i)
  })

  it('says which of the order items are on which job', () => {
    renderPanel()

    const printJob = screen.getByTestId('admin-order-production-job-job-print')
    expect(printJob.textContent).toMatch(/Sundarbans at Dawn/)
    expect(printJob.textContent).not.toMatch(/Howrah Bridge/)

    const frameJob = screen.getByTestId('admin-order-production-job-job-frame')
    expect(frameJob.textContent).toMatch(/Teak Frame/)
  })

  /** The headline requirement. */
  it('names the order item that is on no job at all', () => {
    renderPanel()

    const gap = screen.getByTestId('admin-order-production-unassigned')
    expect(gap.textContent).toMatch(/Howrah Bridge/)
    expect(gap.textContent).toMatch(/12×18/)
    expect(gap.textContent).not.toMatch(/Sundarbans at Dawn/)
  })

  it('says so plainly when nothing is missing, rather than showing an empty box', () => {
    renderPanel({ orderItems: ORDER_ITEMS.slice(0, 2) })

    expect(screen.queryByTestId('admin-order-production-unassigned')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-order-production-all-covered')).toBeInTheDocument()
  })

  it('links each job to its detail screen', () => {
    renderPanel()

    const link = screen
      .getByTestId('admin-order-production-job-job-print')
      .querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toContain('/admin/production/$id')
  })
})

// ============================================================================
// One request, not a scan
// ============================================================================

/**
 * #682 gave `GET /api/admin/production` an `orderId` filter, which is what the
 * old header comment was waiting for. The queue read is now one request that
 * asks for this order's jobs, so there is no page loop, no page bound, and
 * nothing that can be cut short.
 */
describe('fetchOrderProductionJobs', () => {
  it('asks the queue once, filtered by orderId, and never pages', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/admin/production?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [JOBS[0], JOBS[1]].map(({ items: _items, ...row }) => row),
            total: 2,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
        }
      }
      const jobId = url.split('/').pop() as string
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: JOBS.find((job) => job.id === jobId)?.items ?? [],
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const jobs = await fetchOrderProductionJobs('order-1')

    const queueCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/api/admin/production?')
    )
    expect(queueCalls).toHaveLength(1)
    expect(String(queueCalls[0][0])).toContain('orderId=order-1')
    expect(jobs.map((job) => job.id)).toEqual(['job-print', 'job-frame'])
    expect(jobs[0].items.map((item) => item.orderItemId)).toEqual(['oi-print'])
  })

  /**
   * The old scan admitted when it had been cut short, because "these items are
   * on no job" off a partial read is a fabrication. One page cannot be cut
   * short — but it can still be too small, and the honest answer to that is an
   * error the panel refuses to render a coverage verdict over, not a quietly
   * shortened list.
   */
  it('refuses to answer rather than silently dropping jobs past the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ ...JOBS[0], items: undefined }],
          total: 140,
          page: 1,
          pageSize: 100,
          totalPages: 2,
        }),
      }))
    )

    await expect(fetchOrderProductionJobs('order-1')).rejects.toThrow(
      /more production jobs than this panel reads/i
    )
  })

  /**
   * `undefined > n` is false, so the guard above used to wave through a page
   * that carried no `total` at all — the one response where completeness is not
   * merely unmet but unknowable. Unverifiable reads as complete only once.
   */
  it('refuses to answer when the page never said how many jobs there are', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ ...JOBS[0], items: undefined }],
          page: 1,
          pageSize: 100,
        }),
      }))
    )

    await expect(fetchOrderProductionJobs('order-1')).rejects.toThrow(
      /did not say how many/i
    )
  })

  it('surfaces the API error rather than an empty job list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to list production jobs: boom' }),
      }))
    )

    await expect(fetchOrderProductionJobs('order-1')).rejects.toThrow(/boom/)
  })
})

// ============================================================================
// Readiness: blockers, never a bare "not ready"
// ============================================================================

const BLOCKER_CODES: LabelBlockerCode[] = [
  'order_not_found',
  'no_jobs',
  'no_consolidator',
  'consolidator_holds_no_job',
  'item_uncovered',
  'job_not_qc_passed',
  'goods_not_at_consolidator',
  'transfer_in_flight',
  'transfer_lost',
]

const readiness = (overrides: Partial<OrderReadiness> = {}): OrderReadiness => ({
  orderId: 'order-1',
  ready: false,
  consolidatorVendorId: 'v1',
  blockers: [],
  blockerCodes: [],
  ...overrides,
})

const blockersFor = (codes: LabelBlockerCode[]) =>
  readiness({
    blockers: codes.map((code) => ({ code, message: `API says: ${code}` })),
    blockerCodes: codes,
  })

describe('blockerAction', () => {
  /**
   * The requirement in one assertion. Nine identical "this order is not ready"
   * strings would satisfy a laxer test and help nobody: the admin reading this
   * panel is trying to get an order moving, and every code has a different
   * thing to do about it.
   */
  it('gives every blocker code its own explanation', () => {
    // Every code the API can emit is covered — a missing key would silently
    // fall back to the "no guidance" string on a blocker we do understand.
    expect(Object.keys(BLOCKER_ACTIONS).sort()).toEqual([...BLOCKER_CODES].sort())

    const actions = BLOCKER_CODES.map(blockerAction)

    expect(new Set(actions).size).toBe(BLOCKER_CODES.length)
    for (const action of actions) expect(action.length).toBeGreaterThan(40)
  })

  /** A code the API learns after this file was written still gets an answer. */
  it('falls back rather than rendering nothing for a code it does not know', () => {
    expect(blockerAction('some_future_blocker')).toMatch(/no guidance/i)
    expect(blockerAction('some_future_blocker')).not.toBe(
      blockerAction('no_consolidator')
    )
  })
})

describe('OrderReadinessPanel', () => {
  const renderReadiness = (
    overrides: Partial<React.ComponentProps<typeof OrderReadinessPanel>> = {}
  ) =>
    render(
      <OrderReadinessPanel
        readiness={readiness()}
        isLoading={false}
        error={null}
        onRetry={noop}
        {...overrides}
      />
    )

  it('renders a skeleton while the check is running, and claims nothing', () => {
    renderReadiness({ isLoading: true, readiness: null })

    expect(screen.getByTestId('admin-order-readiness-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-readiness-ready')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-readiness-blockers')).not.toBeInTheDocument()
  })

  /** The headline requirement: reasons, not a verdict. */
  it('renders every blocker with its own actionable explanation', () => {
    renderReadiness({ readiness: blockersFor(BLOCKER_CODES) })

    const list = screen.getByTestId('admin-order-readiness-blockers')
    const rendered = BLOCKER_CODES.map((code) => {
      const row = screen.getByTestId(`admin-order-readiness-blocker-${code}`)
      // The API's sentence AND this panel's next step, both.
      expect(row.textContent).toContain(`API says: ${code}`)
      expect(row.textContent).toContain(blockerAction(code))
      return blockerAction(code)
    })

    expect(new Set(rendered).size).toBe(BLOCKER_CODES.length)
    // The list is the answer; there is no verdict beside it to read instead.
    expect(list).toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-readiness-ready')).not.toBeInTheDocument()
  })

  it('renders a blocker it has no advice for rather than dropping it', () => {
    renderReadiness({
      readiness: readiness({
        blockers: [
          { code: 'a_code_from_the_future' as LabelBlockerCode, message: 'Something new' },
        ],
        blockerCodes: [],
      }),
    })

    const row = screen.getByTestId('admin-order-readiness-blocker-a_code_from_the_future')
    expect(row.textContent).toContain('Something new')
  })

  /**
   * A slow or failed readiness read must render an ERROR. "Ready to ship" over
   * a read that never answered is #602/#606 with a courier label attached: the
   * money is spent before anybody notices.
   */
  it('renders an error, and never "ready", when the readiness read failed', () => {
    renderReadiness({
      readiness: null,
      error: 'Failed to read order production readiness: timeout',
    })

    expect(screen.getByTestId('admin-order-readiness-error').textContent).toMatch(
      /timeout/i
    )
    expect(screen.queryByTestId('admin-order-readiness-ready')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-readiness-blockers')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-order-readiness-error').textContent).toMatch(
      /unknown is not the same as ready/i
    )
    expect(screen.getByTestId('admin-order-readiness-retry')).toBeInTheDocument()
  })

  /**
   * The error wins even when a previous, successful readiness is still in hand:
   * a stale "ready" under a failure banner is the same claim, differently
   * dressed.
   */
  it('does not fall through to a stale verdict when the newest read failed', () => {
    renderReadiness({
      readiness: readiness({ ready: true }),
      error: 'Failed to read order production readiness: timeout',
    })

    expect(screen.queryByTestId('admin-order-readiness-ready')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-order-readiness-error')).toBeInTheDocument()
  })

  it('says ready only over a read that answered with no blockers', () => {
    renderReadiness({ readiness: readiness({ ready: true }) })

    expect(screen.getByTestId('admin-order-readiness-ready').textContent).toMatch(
      /ready to label/i
    )
    expect(screen.queryByTestId('admin-order-readiness-blockers')).not.toBeInTheDocument()
  })
})

// ============================================================================
// The consolidator
// ============================================================================

/** `GET /api/admin/orders/:orderId/consolidator`, verbatim. */
const consolidationRow = (
  overrides: Partial<OrderConsolidation> = {}
): OrderConsolidation => ({
  orderId: 'order-1',
  vendorId: 'v1',
  decidedBy: 'admin-user-1',
  decidedByEmail: 'ops@chobii.art',
  decidedAt: '2026-03-05T00:00:00.000Z',
  ...overrides,
})

describe('orderVendorOptions', () => {
  it('is the vendors holding a live job on this order, named and sorted', () => {
    const jobs: OrderProductionJob[] = [
      { ...JOBS[0], vendorId: 'v2', vendorName: 'Zamin Framers' },
      { ...JOBS[1], vendorId: 'v1', vendorName: 'Kolkata Print Works', status: 'assigned' },
    ]

    expect(orderVendorOptions(jobs)).toEqual([
      { id: 'v1', name: 'Kolkata Print Works' },
      { id: 'v2', name: 'Zamin Framers' },
    ])
  })

  /** A cancelled job is not work, and a draft has no vendor to offer. */
  it('offers neither a cancelled job’s vendor nor an unassigned draft', () => {
    const jobs: OrderProductionJob[] = [
      { ...JOBS[0], status: 'cancelled' },
      JOBS[1],
    ]

    expect(orderVendorOptions(jobs)).toEqual([])
  })

  it('lists a vendor once however many jobs it holds', () => {
    const jobs: OrderProductionJob[] = [
      JOBS[0],
      { ...JOBS[1], id: 'job-2', vendorId: 'v1', vendorName: 'Kolkata Print Works' },
    ]

    expect(orderVendorOptions(jobs)).toHaveLength(1)
  })
})

describe('vendorNameFor', () => {
  it('names a vendor from the order’s own jobs', () => {
    expect(vendorNameFor('v1', JOBS, [])).toBe('Kolkata Print Works')
  })

  it('falls back to a transfer’s end when no job names the vendor', () => {
    expect(vendorNameFor('v9', [], [TRANSFER])).toBe('Zamin Framers')
  })

  /** Null, not the uuid: the caller shows the id AND says it could not name it. */
  it('is null when nothing on screen names the vendor', () => {
    expect(vendorNameFor('v-unknown', JOBS, [TRANSFER])).toBeNull()
  })
})

/**
 * `decided_by` is the whole answer, and it comes out of a table that never
 * expires. The audit log this used to be read from is swept at 400 days, so
 * the panel would have started saying "unknown" about a fact the database
 * still held.
 */
describe('provenanceFromConsolidation', () => {
  it('reads an admin confirmation, with who and when', () => {
    expect(provenanceFromConsolidation(consolidationRow())).toEqual({
      decision: 'admin_confirmed',
      actorEmail: 'ops@chobii.art',
      decidedAt: '2026-03-05T00:00:00.000Z',
    })
  })

  /** Nobody decided, so nobody is named. */
  it('names nobody on a system default', () => {
    const provenance = provenanceFromConsolidation(
      consolidationRow({ decidedBy: null, decidedByEmail: null })
    )

    expect(provenance?.decision).toBe('system_default')
    expect(provenance?.actorEmail).toBeNull()
  })

  /**
   * `decided_by` decides, not the email beside it. An email over a NULL
   * `decided_by` is a bug or a stale join, and reading it as a confirmation
   * would invent the very claim the column exists to make checkable.
   */
  it('lets decidedBy decide, never the email beside it', () => {
    const provenance = provenanceFromConsolidation(
      consolidationRow({ decidedBy: null, decidedByEmail: 'ops@chobii.art' })
    )

    expect(provenance?.decision).toBe('system_default')
    expect(provenance?.actorEmail).toBeNull()
  })

  /**
   * Absence is meaningful and it is NOT a default: no row means nobody has
   * decided at all, which is a different fact from the rules having chosen.
   */
  it('is null when there is no consolidation row', () => {
    expect(provenanceFromConsolidation(null)).toBeNull()
  })
})

describe('consolidatorRefusalAdvice', () => {
  it('gives every refusal code its own next step', () => {
    const advice = [
      'TRANSFER_DISPATCHED',
      'CONFIRMATION_REQUIRED',
      'NOTHING_TO_PROPOSE',
      'CONCURRENT_MODIFICATION',
    ].map((code) => consolidatorRefusalAdvice({ status: 409, code, message: 'x' }))

    expect(new Set(advice).size).toBe(4)
  })

  it('says what a dispatched transfer means for re-routing', () => {
    expect(
      consolidatorRefusalAdvice({
        status: 409,
        code: 'TRANSFER_DISPATCHED',
        message: 'x',
      })
    ).toMatch(/carrier/i)
  })
})

describe('ConsolidatorPicker', () => {
  const renderPicker = (
    overrides: Partial<React.ComponentProps<typeof ConsolidatorPicker>> = {}
  ) =>
    render(
      <ConsolidatorPicker
        consolidatorVendorId="v1"
        provenance={null}
        provenanceLoading={false}
        provenanceError={null}
        options={[{ id: 'v1', name: 'Kolkata Print Works' }]}
        optionsLoading={false}
        optionsError={null}
        onRetryOptions={noop}
        vendorName="Kolkata Print Works"
        nameLookupComplete={true}
        isLoading={false}
        error={null}
        isSaving={false}
        refusal={null}
        onChoose={noop}
        onUseSystemDefault={noop}
        onRetry={noop}
        {...overrides}
      />
    )

  /**
   * The distinction the column exists for: the system PROPOSES and an admin
   * CONFIRMS, and an arbitrary choice somebody confirmed is visible and
   * auditable where the same choice written silently is not.
   */
  it('distinguishes a system default from an admin confirmation', () => {
    renderPicker({
      provenance: {
        decision: 'system_default',
        actorEmail: null,
        decidedAt: '2026-03-05T00:00:00.000Z',
      },
    })
    const asDefault = screen.getByTestId('admin-order-consolidator-provenance')
    expect(asDefault.getAttribute('data-decision')).toBe('system_default')
    expect(asDefault.textContent).toMatch(/system default/i)
    expect(asDefault.textContent).toMatch(/nothing to choose/i)
    expect(asDefault.textContent).not.toMatch(/ops@chobii\.art/)
    const defaultText = asDefault.textContent

    cleanup()

    renderPicker({
      provenance: {
        decision: 'admin_confirmed',
        actorEmail: 'ops@chobii.art',
        decidedAt: '2026-03-05T00:00:00.000Z',
      },
    })
    const asConfirmed = screen.getByTestId('admin-order-consolidator-provenance')
    expect(asConfirmed.getAttribute('data-decision')).toBe('admin_confirmed')
    expect(asConfirmed.textContent).toMatch(/confirmed by an admin/i)
    expect(asConfirmed.textContent).toMatch(/ops@chobii\.art/)
    expect(asConfirmed.textContent).not.toBe(defaultText)
  })

  it('says the provenance is unknown rather than assuming the system chose', () => {
    renderPicker({ provenance: null })

    const unknown = screen.getByTestId('admin-order-consolidator-provenance-unknown')
    expect(unknown.textContent).toMatch(/not recorded/i)
    expect(unknown.textContent).toMatch(/unknown/i)
    // The one claim a missing row must never turn into.
    expect(unknown.textContent).not.toMatch(/nothing to choose/i)
    expect(
      screen.queryByTestId('admin-order-consolidator-provenance')
    ).not.toBeInTheDocument()
  })

  /**
   * Both are UNKNOWN and neither guesses — but "no row came back" is a
   * statement about the consolidation record, and printing it over a 500 says
   * the record was read and found absent when nobody looked at it. Only one of
   * the two is worth retrying. Moving the source off the audit log did not
   * merge these three states back together.
   */
  it('tells a failed consolidation read apart from an order with no row', () => {
    renderPicker({
      provenance: null,
      provenanceError: 'Failed to read who chose the consolidator',
    })

    const failed = screen.getByTestId('admin-order-consolidator-provenance-error')
    expect(failed.textContent).toMatch(/could not be read/i)
    expect(failed.textContent).toMatch(/Failed to read who chose the consolidator/)
    expect(failed.textContent).not.toMatch(/no consolidation record/i)
    expect(
      screen.queryByTestId('admin-order-consolidator-provenance-unknown')
    ).not.toBeInTheDocument()

    cleanup()

    renderPicker({ provenance: null })
    expect(
      screen.getByTestId('admin-order-consolidator-provenance-unknown').textContent
    ).toMatch(/no consolidation record/i)
    expect(
      screen.queryByTestId('admin-order-consolidator-provenance-error')
    ).not.toBeInTheDocument()
  })

  it('does not report a missing consolidation row while it is still reading', () => {
    renderPicker({ provenance: null, provenanceLoading: true })

    expect(
      screen.getByTestId('admin-order-consolidator-provenance-loading')
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('admin-order-consolidator-provenance-unknown')
    ).not.toBeInTheDocument()
  })

  it('says plainly when nobody has decided yet', () => {
    renderPicker({ consolidatorVendorId: null, vendorName: null })

    expect(screen.getByTestId('admin-order-consolidator-none').textContent).toMatch(
      /nobody has decided/i
    )
  })

  /** A bare uuid in a "Consolidator" field reads as a rendering bug. */
  it('admits it could not name the vendor rather than printing a bare id', () => {
    renderPicker({ vendorName: null })

    expect(screen.getByTestId('admin-order-consolidator-current').textContent).toMatch(
      /no job or transfer on this order names this vendor/i
    )
  })

  /**
   * The name is looked up across the jobs and transfers already on screen, so
   * "nothing names it" is a claim about two reads. Under a failure they are
   * both `[]`, which looks exactly like an order whose rows name nobody.
   */
  it('does not claim nothing names the vendor when the reads did not complete', () => {
    renderPicker({ vendorName: null, nameLookupComplete: false })

    const current = screen.getByTestId('admin-order-consolidator-current')
    expect(current.textContent).not.toMatch(/no job or transfer on this order names/i)
    expect(
      screen.getByTestId('admin-order-consolidator-name-unread').textContent
    ).toMatch(/were not read/i)
    expect(
      screen.queryByTestId('admin-order-consolidator-name-none')
    ).not.toBeInTheDocument()
  })

  /** #682 refuses this with a 409. Swallowing it leaves an admin clicking forever. */
  it('explains a 409 instead of swallowing it', () => {
    renderPicker({
      refusal: {
        status: 409,
        code: 'TRANSFER_DISPATCHED',
        message:
          'A transfer on this order has already dispatched, so the goods are moving to the current consolidator.',
        currentVendorId: 'v1',
      },
    })

    const refusal = screen.getByTestId('admin-order-consolidator-refusal')
    expect(refusal.getAttribute('data-refusal-status')).toBe('409')
    expect(refusal.getAttribute('data-refusal-code')).toBe('TRANSFER_DISPATCHED')
    // The API's own sentence, and what to do about it.
    expect(refusal.textContent).toMatch(/already dispatched/i)
    expect(refusal.textContent).toMatch(/carrier/i)
    expect(refusal.textContent).toMatch(/declare that transfer lost/i)
  })

  it('explains a 422 asking an admin to confirm the split', () => {
    renderPicker({
      refusal: {
        status: 422,
        code: 'CONFIRMATION_REQUIRED',
        message: "This order's jobs are split across vendors.",
        proposedVendorId: 'v2',
      },
    })

    expect(
      screen.getByTestId('admin-order-consolidator-refusal').textContent
    ).toMatch(/judgement/i)
  })

  it('offers only the vendors holding a live job, and says so when there are none', () => {
    renderPicker({ options: [] })

    expect(screen.getByTestId('admin-order-consolidator-no-options')).toBeInTheDocument()
    expect(
      (screen.getByTestId('admin-order-consolidator-select') as HTMLSelectElement).disabled
    ).toBe(true)
  })

  /**
   * The defect this file is pinned against, in its own words: `options` is
   * empty under a FAILED jobs read exactly as it is under an order with no
   * jobs, and "assign a job first" over the first case sends an admin to raise
   * a duplicate set of jobs for an order that already has them.
   */
  it('does not say nobody holds a job when the job list failed to load', () => {
    const onRetryOptions = vi.fn()
    renderPicker({
      options: [],
      optionsError: 'Failed to load production jobs: boom',
      onRetryOptions,
    })

    expect(
      screen.queryByTestId('admin-order-consolidator-no-options')
    ).not.toBeInTheDocument()

    const failed = screen.getByTestId('admin-order-consolidator-options-error')
    expect(failed.textContent).toMatch(/boom/)
    expect(failed.textContent).toMatch(/not the same as nobody holding one/i)

    fireEvent.click(screen.getByTestId('admin-order-consolidator-options-retry'))
    expect(onRetryOptions).toHaveBeenCalled()
  })

  it('does not say nobody holds a job while the job list is still loading', () => {
    renderPicker({ options: [], optionsLoading: true })

    expect(
      screen.getByTestId('admin-order-consolidator-options-loading')
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('admin-order-consolidator-no-options')
    ).not.toBeInTheDocument()
  })

  /**
   * The readiness read still owns the box as a whole: who the consolidator IS
   * is its answer, and a jobs failure must not blank it.
   */
  it('still reports the standing consolidator when only the job list failed', () => {
    renderPicker({ options: [], optionsError: 'Failed to load production jobs' })

    expect(screen.getByTestId('admin-order-consolidator-current')).toBeInTheDocument()
    expect(
      screen.queryByTestId('admin-order-consolidator-error')
    ).not.toBeInTheDocument()
  })

  it('renders an error with a retry, and no picker verdict, when the read failed', () => {
    renderPicker({ error: 'Failed to read order production readiness' })

    expect(screen.getByTestId('admin-order-consolidator-error')).toBeInTheDocument()
    expect(screen.getByTestId('admin-order-consolidator-retry')).toBeInTheDocument()
    expect(
      screen.queryByTestId('admin-order-consolidator-current')
    ).not.toBeInTheDocument()
  })

  it('renders a skeleton while the consolidator is being read', () => {
    renderPicker({ isLoading: true })

    expect(screen.getByTestId('admin-order-consolidator-skeleton')).toBeInTheDocument()
    expect(
      screen.queryByTestId('admin-order-consolidator-current')
    ).not.toBeInTheDocument()
  })
})

describe('setOrderConsolidator', () => {
  it('throws the 409 whole — status, code and the API’s own sentence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'A transfer on this order has already dispatched.',
          code: 'TRANSFER_DISPATCHED',
          currentVendorId: 'v1',
        }),
      }))
    )

    await expect(setOrderConsolidator('order-1', 'v2')).rejects.toMatchObject({
      refusal: {
        status: 409,
        code: 'TRANSFER_DISPATCHED',
        currentVendorId: 'v1',
      },
    })
  })

  it('asks for the system default by omitting the vendor', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    await setOrderConsolidator('order-1')

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/admin/orders/order-1/consolidator'
    )
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe('{}')
  })
})

// ============================================================================
// Transfers on the order
// ============================================================================

describe('OrderTransfersPanel', () => {
  const renderTransfers = (
    overrides: Partial<React.ComponentProps<typeof OrderTransfersPanel>> = {}
  ) =>
    render(
      <OrderTransfersPanel
        transfers={[TRANSFER]}
        isLoading={false}
        error={null}
        onRetry={noop}
        {...overrides}
      />
    )

  it('shows both ends of the leg, the state and the docket', () => {
    renderTransfers()

    const row = screen.getByTestId('admin-order-transfer-tr-1')
    expect(row.getAttribute('data-transfer-state')).toBe('in_transit')
    expect(row.textContent).toMatch(/Kolkata Print Works/)
    expect(row.textContent).toMatch(/Zamin Framers/)
    expect(row.textContent).toMatch(/in transit/i)
    expect(row.textContent).toMatch(/BD-99123/)
  })

  it('names a lost parcel and its note', () => {
    renderTransfers({
      transfers: [
        {
          ...TRANSFER,
          state: 'lost',
          lostAt: '2026-03-09T00:00:00.000Z',
          lostNote: 'Carrier closed the case',
        },
      ],
    })

    const row = screen.getByTestId('admin-order-transfer-tr-1')
    expect(row.textContent).toMatch(/lost/i)
    expect(row.textContent).toMatch(/Carrier closed the case/)
  })

  it('says nothing has moved rather than showing an empty box', () => {
    renderTransfers({ transfers: [] })

    expect(screen.getByTestId('admin-order-transfers-empty').textContent).toMatch(
      /nothing has been couriered/i
    )
  })

  /** "No transfers" and "the transfer list did not load" are different answers. */
  it('renders an error rather than reading as an order with no transfers', () => {
    renderTransfers({ transfers: null, error: 'Failed to load the transfers' })

    expect(screen.getByTestId('admin-order-transfers-error')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-transfers-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-transfers')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-order-transfers-retry')).toBeInTheDocument()
  })

  it('renders a skeleton while the transfers are being read', () => {
    renderTransfers({ transfers: null, isLoading: true })

    expect(screen.getByTestId('admin-order-transfers-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-transfers-empty')).not.toBeInTheDocument()
  })
})

describe('fetchOrderTransfers', () => {
  it('asks for this order only, once', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [TRANSFER],
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchOrderTransfers('order-1')).toEqual([TRANSFER])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('orderId=order-1')
  })
})

describe('fetchOrderConsolidation', () => {
  /**
   * The consolidator route, not the audit log. The trail is swept at 400 days
   * and is admin-and-super-admin-only; `order_consolidation` is neither.
   */
  it('asks the consolidator route for this order, not the audit trail', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ orderId: 'order-1', consolidation: consolidationRow() }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const row = await fetchOrderConsolidation('order-1')

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/admin/orders/order-1/consolidator')
    expect(url).not.toContain('audit-log')
    expect(row?.decidedBy).toBe('admin-user-1')
    expect(row?.decidedAt).toBe('2026-03-05T00:00:00.000Z')
  })

  /** `consolidation: null` is an ANSWER — nobody has decided — not a failure. */
  it('returns null when the order has no consolidation row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ orderId: 'order-1', consolidation: null }),
      }))
    )

    await expect(fetchOrderConsolidation('order-1')).resolves.toBeNull()
  })

  /** A failed read is UNKNOWN provenance, and must not read as a default. */
  it('throws rather than reporting a decision it did not read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'consolidation unavailable' }),
      }))
    )

    await expect(fetchOrderConsolidation('order-1')).rejects.toThrow(
      /consolidation unavailable/
    )
  })
})

// ============================================================================
// The panel itself — four reads, and no claim wired to the wrong one
// ============================================================================

/**
 * The components above are each honest in isolation; the defect this block
 * pins was in the WIRING. `options` and the vendor name come off the jobs read,
 * but the consolidator box took its loading and error state from the readiness
 * read alone — so a 500 on `GET /api/admin/production?orderId=` rendered the
 * jobs error correctly and then, immediately below it, a fully confident
 * "nobody holds a live job on this order… assign a job first" over a list that
 * was never read.
 */
describe('OrderProductionPanel', () => {
  const stubReads = ({ jobsFail = false }: { jobsFail?: boolean } = {}) => {
    const fetchMock = vi.fn(async (url: string) => {
      const target = String(url)

      if (target.includes('/production-readiness')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId: 'order-1',
            ready: false,
            consolidatorVendorId: 'v-unnamed',
            blockers: [{ code: 'no_jobs', message: 'API says: no_jobs' }],
            blockerCodes: ['no_jobs'],
          }),
        }
      }

      if (target.includes('/api/admin/transfers')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }),
        }
      }

      if (target.includes('/consolidator')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ orderId: 'order-1', consolidation: null }),
        }
      }

      if (target.includes('/api/admin/production?')) {
        return jobsFail
          ? {
              ok: false,
              status: 500,
              json: async () => ({ error: 'Failed to list production jobs: boom' }),
            }
          : {
              ok: true,
              status: 200,
              json: async () => ({
                items: JOBS.map(({ items: _items, ...row }) => row),
                total: JOBS.length,
                page: 1,
                pageSize: 100,
                totalPages: 1,
              }),
            }
      }

      const jobId = target.split('/').pop() as string
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: JOBS.find((job) => job.id === jobId)?.items ?? [] }),
      }
    })

    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('never answers the consolidator question out of a failed job read', async () => {
    stubReads({ jobsFail: true })

    render(<OrderProductionPanel orderId="order-1" orderItems={ORDER_ITEMS} />)

    await waitFor(() => {
      expect(screen.getByTestId('admin-order-production-error')).toBeInTheDocument()
    })

    // The claim the jobs read backs, and it is NOT made.
    expect(
      screen.queryByTestId('admin-order-consolidator-no-options')
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('admin-order-consolidator-options-error').textContent
    ).toMatch(/boom/)

    // Nor the other one: naming the vendor needs the jobs read too.
    expect(
      screen.getByTestId('admin-order-consolidator-name-unread')
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('admin-order-consolidator-name-none')
    ).not.toBeInTheDocument()

    // And the reads that DID answer still answer: the blockers are listed, and
    // the coverage verdict — which the jobs read backs — is not.
    expect(screen.getByTestId('admin-order-readiness-blockers')).toBeInTheDocument()
    expect(
      screen.queryByTestId('admin-order-production-all-covered')
    ).not.toBeInTheDocument()
  })

  it('does say nobody was read as holding a job once the read succeeded', async () => {
    stubReads()

    render(<OrderProductionPanel orderId="order-1" orderItems={ORDER_ITEMS} />)

    await waitFor(() => {
      expect(screen.getByTestId('admin-order-production-jobs')).toBeInTheDocument()
    })

    expect(
      screen.queryByTestId('admin-order-consolidator-options-error')
    ).not.toBeInTheDocument()
    // v-unnamed is on no job and no transfer, and now that both were read the
    // panel is entitled to say so.
    expect(screen.getByTestId('admin-order-consolidator-name-none')).toBeInTheDocument()
    expect(
      screen.getByTestId('admin-order-consolidator-select').querySelectorAll('option')
    ).toHaveLength(2)
  })

  /**
   * #698. The provenance used to come off the newest `order.consolidator_set`
   * audit row. The audit log is swept at 400 days and `order_consolidation` is
   * not, so that read would eventually print "unknown" over a fact the database
   * still holds — and it tied a display to an endpoint a content-manager cannot
   * reach at all. The indirection is gone, not merely unused.
   */
  it('reads the consolidator decision from its own route and never the audit log', async () => {
    const fetchMock = stubReads()

    render(<OrderProductionPanel orderId="order-1" orderItems={ORDER_ITEMS} />)

    await waitFor(() => {
      expect(screen.getByTestId('admin-order-production-jobs')).toBeInTheDocument()
    })

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((url) => url.includes('/api/admin/orders/order-1/consolidator'))).toBe(
      true
    )
    expect(urls.some((url) => url.includes('audit-log'))).toBe(false)
  })
})
