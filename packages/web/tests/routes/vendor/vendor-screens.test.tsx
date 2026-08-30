/**
 * The four vendor screens: search schemas, the three list states, and the
 * two-step confirm.
 *
 * ## The search schemas first, because they are the blank-page hazard
 *
 * `router.tsx` replaces TanStack's search serialisation with a pair that keeps
 * every incoming value a STRING and `String(value)` on the way out. A
 * `validateSearch` schema written against real numbers therefore throws on the
 * first navigation, and a throw there does not surface as a validation message
 * — the route error-boundaries into a blank page. So every non-string param is
 * coerced and every field `.catch()`es to a usable default.
 *
 * ## Then the three states
 *
 * Skeleton, empty AND error, mutually exclusive, error winning. The missing
 * state on 9 of 13 admin lists is the error one, which is exactly how #602 and
 * #606 happened: a failed request rendered a confident `0`. Every error block
 * here is asserted to be DIGIT-FREE, and the payments screen — the one where a
 * wrong zero means "we owe you nothing" — is asserted twice.
 *
 * ## And the vocabulary, because it was wrong in production
 *
 * `lib/vendor-nav.ts` used to hand-write its status tuple. It listed the
 * RETIRED `sent` and omitted `qc_submitted` and `dispatched` — the two statuses
 * a vendor actually produces — so a vendor who finished a shot list watched
 * their job render a raw enum string through the unknown-pill fallback, under a
 * filter offering "Sent back" and nothing they could ever reach.
 *
 * Every assertion about that vocabulary below is written against
 * `@chobii/shared/schemas/production-transitions` rather than against a list
 * repeated here, because a test that restates the answer is a third copy of the
 * state machine and cannot fail the day the matrix moves.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  PRODUCTION_JOB_STATUSES,
  PRODUCTION_TRANSITIONS,
  QC_PHOTO_MAX_BYTES,
  QC_SHOT_LIST,
  QC_STAGES,
  UNREACHABLE_STATUSES,
  nextStatuses,
  qcShotsForStage,
  requiredQcSlots,
  type ProductionJobStatus,
} from '@chobii/shared'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => () => {},
  Link: ({
    children,
    to,
  }: {
    children?: React.ReactNode
    to?: string
    params?: unknown
    search?: unknown
    className?: string
  }) => <a href={to}>{children}</a>,
}))

import {
  vendorJobsSearchSchema,
  VendorJobsListBody,
  DueCell,
  VendorTransferStrip,
  VENDOR_TRANSFERS_MAX_LIMIT,
  VENDOR_TRANSFERS_MAX_PAGES,
  fetchInboundAwaitingArrival,
  fetchVendorTransfers,
  inboundAwaitingArrival,
  markVendorTransferReceived,
  mergeTransferRows,
  transferAwaitsArrival,
  type VendorJobListItem,
  type VendorTransfer,
  type VendorTransferPanelState,
} from '~/routes/vendor/index'
import {
  VendorJobDetailBody,
  VendorLabelHandoverCard,
  InlineConfirm,
  QcVerdictBanner,
  VendorJobWriteError,
  VendorQcShotList,
  mergeQcShots,
  missingRequiredQcSlots,
  missingShotsFor,
  patchVendorJobStatus,
  qcSlotLabel,
  uploadVendorQcPhoto,
  withdrawVendorQcPhoto,
  type VendorJobDetailResponse,
  type VendorJobReview,
  type VendorQcPanelState,
  type VendorQcPhoto,
  type VendorQcPhotoSet,
  type VendorQcShot,
} from '~/routes/vendor/jobs/$id'
import { VendorRatesBody, bandLabel, isCurrentBand, type VendorRate } from '~/routes/vendor/rates'
import {
  vendorPaymentsSearchSchema,
  VendorPaymentsBody,
  OutstandingAmount,
} from '~/routes/vendor/payments'
import {
  formatVendorAmount,
  nextVendorActions,
  vendorNoActionReason,
  vendorStatusLabel,
  vendorStatusStyle,
  VENDOR_JOBS_PAGE_SIZE,
  VENDOR_JOB_STATUSES,
  VENDOR_JOB_STATUS_LABELS,
  VENDOR_JOB_STATUS_STYLES,
  VENDOR_UNKNOWN_STATUS_STYLE,
  vendorJobIsOpen,
  vendorMayUploadPhotos,
  type VendorJobStage,
} from '~/lib/vendor-nav'

afterEach(cleanup)

/** What `router.tsx` actually hands `validateSearch`: strings, always. */
const asUrlWouldDeliver = (search: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(search)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  )

// ============================================================================
// Search schemas
// ============================================================================

describe('vendorJobsSearchSchema', () => {
  it('coerces the string page and pageSize the URL delivers', () => {
    expect(
      vendorJobsSearchSchema.parse(asUrlWouldDeliver({ page: 3, pageSize: 50 }))
    ).toMatchObject({ page: 3, pageSize: 50 })
  })

  it('defaults an empty search rather than throwing', () => {
    expect(vendorJobsSearchSchema.parse({})).toMatchObject({
      page: 1,
      pageSize: VENDOR_JOBS_PAGE_SIZE,
    })
  })

  it('degrades garbage to the default view instead of a blank page', () => {
    // A hand-typed or stale URL must not error-boundary the route.
    expect(() =>
      vendorJobsSearchSchema.parse(
        asUrlWouldDeliver({ page: 'banana', pageSize: '-4', status: 'nonsense' })
      )
    ).not.toThrow()

    const parsed = vendorJobsSearchSchema.parse(
      asUrlWouldDeliver({ page: 'banana', pageSize: '-4', status: 'nonsense' })
    )
    expect(parsed).toMatchObject({ page: 1, pageSize: VENDOR_JOBS_PAGE_SIZE })
    expect(parsed.status).toBeUndefined()
  })

  it('clamps an absurd pageSize rather than rejecting it', () => {
    expect(vendorJobsSearchSchema.parse(asUrlWouldDeliver({ pageSize: 100000 }))).toMatchObject({
      pageSize: 100,
    })
  })

  it('keeps a real status filter', () => {
    expect(vendorJobsSearchSchema.parse(asUrlWouldDeliver({ status: 'qc_failed' }))).toMatchObject({
      status: 'qc_failed',
    })
  })

  /**
   * The live bug, stated as a URL.
   *
   * The filter was built over a hand-written tuple that carried the retired
   * `sent` and had no option for either status a vendor produces, so
   * `?status=qc_submitted` — the state a vendor lands in the moment they finish
   * — degraded to "any status" while `?status=sent` was a view that could only
   * ever be empty.
   */
  it('drops the retired status and keeps the two a vendor actually produces', () => {
    expect(
      vendorJobsSearchSchema.parse(asUrlWouldDeliver({ status: 'sent' })).status
    ).toBeUndefined()
    expect(
      vendorJobsSearchSchema.parse(asUrlWouldDeliver({ status: 'qc_submitted' })).status
    ).toBe('qc_submitted')
    expect(
      vendorJobsSearchSchema.parse(asUrlWouldDeliver({ status: 'dispatched' })).status
    ).toBe('dispatched')
  })
})

// ============================================================================
// The vendor vocabulary — derived from the matrix, written down nowhere
// ============================================================================

describe('VENDOR_JOB_STATUSES derives from the transition matrix', () => {
  /**
   * The closure computed here rather than imported, so this assertion is an
   * independent second opinion about what a vendor's job can reach. `assigned`
   * is the seed because it is the moment a vendor first holds the job — before
   * it, `draft` has no vendor to scope a read to.
   */
  const reachableFromAssigned = () => {
    const seen = new Set<ProductionJobStatus>(['assigned'])
    const queue: ProductionJobStatus[] = ['assigned']
    while (queue.length > 0) {
      const from = queue.shift() as ProductionJobStatus
      for (const to of Object.keys(PRODUCTION_TRANSITIONS[from]) as ProductionJobStatus[]) {
        if (seen.has(to)) continue
        seen.add(to)
        queue.push(to)
      }
    }
    return seen
  }

  it('is every status reachable once a vendor holds the job, in enum order', () => {
    const reachable = reachableFromAssigned()
    expect([...VENDOR_JOB_STATUSES]).toEqual(
      PRODUCTION_JOB_STATUSES.filter((status) => reachable.has(status))
    )
  })

  it('is the seven the design names, and the two the old tuple was missing', () => {
    expect([...VENDOR_JOB_STATUSES]).toEqual([
      'assigned',
      'received',
      'qc_submitted',
      'qc_passed',
      'qc_failed',
      'dispatched',
      'cancelled',
    ])
  })

  it('offers nothing retired and nothing from before the job was assigned', () => {
    for (const retired of UNREACHABLE_STATUSES) {
      expect(VENDOR_JOB_STATUSES).not.toContain(retired)
    }
    expect(VENDOR_JOB_STATUSES).not.toContain('sent')
    // A draft job has no vendor, so a vendor filtering by it filters to nothing.
    expect(VENDOR_JOB_STATUSES).not.toContain('draft')
  })

  it.each([...VENDOR_JOB_STATUSES])('%s has both a label and a style', (status) => {
    expect(VENDOR_JOB_STATUS_LABELS[status]).toBeTruthy()
    expect(VENDOR_JOB_STATUS_STYLES[status]).toBeTruthy()
    expect(vendorStatusLabel(status)).toBe(VENDOR_JOB_STATUS_LABELS[status])
    expect(vendorStatusStyle(status)).toBe(VENDOR_JOB_STATUS_STYLES[status])
  })

  it('never tells a vendor the goods come back to us', () => {
    // They do not. The vendor despatches, and every label that said otherwise
    // described a workflow that stopped existing at §4.
    for (const label of Object.values(VENDOR_JOB_STATUS_LABELS)) {
      expect(label.toLowerCase()).not.toContain('back')
    }
  })

  it('renders a row that predates the retirement readably rather than blank', () => {
    // `db:retire-sent-status` has not run against production data, so rows still
    // carry `sent`. A pill with no label reads as a rendering fault.
    expect(vendorStatusLabel('sent')).toBe('Sent')
    expect(vendorStatusStyle('sent')).toBe(VENDOR_UNKNOWN_STATUS_STYLE)
    expect(VENDOR_JOB_STATUS_LABELS['sent' as ProductionJobStatus]).toBeUndefined()
  })
})

// ============================================================================
// The actions — read off the matrix, so they cannot disagree with the API
// ============================================================================

describe('nextVendorActions is the matrix, not a list', () => {
  it.each([...PRODUCTION_JOB_STATUSES])(
    'from %s it offers exactly the vendor edges the matrix has',
    (status) => {
      expect(nextVendorActions(status).map((action) => action.to)).toEqual(
        nextStatuses(status, 'vendor')
      )
    }
  )

  it('never offers a verdict or a cancellation, from any status', () => {
    // Those are ours. A vendor claiming their own QC pass is the bug the review
    // route exists to prevent, and `PATCH` does not even parse them.
    for (const status of PRODUCTION_JOB_STATUSES) {
      const targets = nextVendorActions(status).map((action) => action.to)
      expect(targets).not.toContain('qc_passed')
      expect(targets).not.toContain('qc_failed')
      expect(targets).not.toContain('cancelled')
    }
  })

  it('offers the retired status from nowhere, and offers nothing from it', () => {
    expect(nextVendorActions('sent')).toEqual([])
    for (const status of PRODUCTION_JOB_STATUSES) {
      expect(nextVendorActions(status).map((action) => action.to)).not.toContain('sent')
    }
  })

  it('gives every action a label, a question and a test id keyed on its target', () => {
    let seen = 0
    for (const status of PRODUCTION_JOB_STATUSES) {
      for (const action of nextVendorActions(status)) {
        expect(action.label).toBeTruthy()
        expect(action.question).toBeTruthy()
        expect(action.testId).toBe(`vendor-job-mark-${action.to}`)
        seen += 1
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('never phrases an action as sending the work back', () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      for (const action of nextVendorActions(status)) {
        expect(`${action.label} ${action.question}`.toLowerCase()).not.toContain('back')
      }
    }
  })

  it('carries the guard the matrix names on the edge, and only that guard', () => {
    const submit = nextVendorActions('received').find((a) => a.to === 'qc_submitted')
    expect(submit?.guard).toBe('shot-list-complete')
    const dispatch = nextVendorActions('qc_passed').find((a) => a.to === 'dispatched')
    expect(dispatch?.guard).toBe('open-transfer-or-order-label')
    // `assigned -> received` is unguarded in the matrix, so nothing is invented.
    expect(nextVendorActions('assigned')[0]?.guard).toBeUndefined()
  })

  it('blocks an action only when a guard is KNOWN to be unsatisfied', () => {
    const blocked = nextVendorActions('received', { 'shot-list-complete': false })
    expect(blocked[0]?.blockedReason).toBeTruthy()

    const ready = nextVendorActions('received', { 'shot-list-complete': true })
    expect(ready[0]?.blockedReason).toBeUndefined()

    // Unknown is not the same as unsatisfied. Nothing on this screen has read
    // the shot list yet, and the API remains the authority on the guard.
    expect(nextVendorActions('received')[0]?.blockedReason).toBeUndefined()
  })

  it('has a sentence for every status where a vendor has no move', () => {
    let idle = 0
    for (const status of PRODUCTION_JOB_STATUSES) {
      if (nextVendorActions(status).length > 0) continue
      idle += 1
      // A real sentence, not a placeholder dash.
      expect(vendorNoActionReason(status).length).toBeGreaterThan(30)
      expect(vendorNoActionReason(status).toLowerCase()).not.toContain('back')
    }
    expect(idle).toBeGreaterThan(0)
  })
})

describe('vendorPaymentsSearchSchema', () => {
  it('coerces and defaults exactly like the jobs one', () => {
    expect(vendorPaymentsSearchSchema.parse(asUrlWouldDeliver({ page: 2 }))).toMatchObject({
      page: 2,
      pageSize: 20,
    })
    expect(() => vendorPaymentsSearchSchema.parse(asUrlWouldDeliver({ page: 'x' }))).not.toThrow()
    expect(vendorPaymentsSearchSchema.parse(asUrlWouldDeliver({ page: 'x' }))).toMatchObject({
      page: 1,
    })
  })
})

// ============================================================================
// Fixtures
// ============================================================================

const job: VendorJobListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  stage: 'print',
  status: 'assigned',
  dueAt: '2026-09-01T00:00:00.000Z',
  sentAt: null,
  receivedAt: null,
  amountExpected: '850.00',
  amountActual: null,
  createdAt: '2026-08-10T00:00:00.000Z',
}

const detail: VendorJobDetailResponse = {
  job: {
    id: job.id,
    stage: 'print',
    status: 'assigned',
    dueAt: job.dueAt,
    sentAt: null,
    receivedAt: null,
    amountExpected: '850.00',
    amountActual: null,
  },
  items: [{ id: '22222222-2222-4222-8222-222222222222' }],
  reviews: [],
}

const rate: VendorRate = {
  id: '44444444-4444-4444-8444-444444444444',
  vendorId: '55555555-5555-4555-8555-555555555555',
  kind: 'print',
  longestEdgeMinInches: 12,
  longestEdgeMaxInches: 24,
  finish: 'matte',
  amount: '450.00',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
}

/** No digit anywhere in the error block — the whole point of #602/#606. */
function expectDigitFree(html: string) {
  const text = html.replace(/<[^>]*>/g, ' ')
  expect(text).not.toMatch(/\d/)
}

// ============================================================================
// Three states, four screens
// ============================================================================

describe('my jobs — the three states', () => {
  it('shows a skeleton while loading', () => {
    render(<VendorJobsListBody jobs={[]} isLoading error={null} onRetry={() => {}} />)
    expect(screen.getByTestId('vendor-jobs-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('vendor-jobs-empty')).not.toBeInTheDocument()
  })

  it('shows an empty state when the queue really is empty', () => {
    render(<VendorJobsListBody jobs={[]} isLoading={false} error={null} onRetry={() => {}} />)
    expect(screen.getByTestId('vendor-jobs-empty')).toBeInTheDocument()
  })

  it('shows the error INSTEAD of an empty state, with no numbers in it', () => {
    render(
      <VendorJobsListBody
        jobs={[]}
        isLoading={false}
        error="Failed to load your jobs"
        onRetry={() => {}}
      />
    )
    const block = screen.getByTestId('vendor-jobs-error')
    expect(block).toBeInTheDocument()
    // An empty state after a failed request is a lie about the data.
    expect(screen.queryByTestId('vendor-jobs-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vendor-jobs-table')).not.toBeInTheDocument()
    expectDigitFree(block.innerHTML)
  })

  it('error wins even when rows are still in hand', () => {
    render(
      <VendorJobsListBody jobs={[job]} isLoading error="Network error" onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-jobs-error')).toBeInTheDocument()
    expect(screen.queryByTestId('vendor-jobs-skeleton')).not.toBeInTheDocument()
  })

  it('retry is wired', () => {
    const onRetry = vi.fn()
    render(<VendorJobsListBody jobs={[]} isLoading={false} error="boom" onRetry={onRetry} />)
    fireEvent.click(screen.getByTestId('vendor-jobs-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('never prints a fallback zero for an unreadable amount', () => {
    render(
      <VendorJobsListBody
        jobs={[{ ...job, amountExpected: null, amountActual: null }]}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })
})

describe('the job detail — the three states and the two writes', () => {
  it('shows a skeleton, then the job', () => {
    const { rerender } = render(
      <VendorJobDetailBody data={null} isLoading error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-job-skeleton')).toBeInTheDocument()

    rerender(<VendorJobDetailBody data={detail} isLoading={false} error={null} onRetry={() => {}} />)
    expect(screen.getByTestId('vendor-job-detail')).toBeInTheDocument()
  })

  it('shows a digit-free error instead of the job', () => {
    render(
      <VendorJobDetailBody
        data={null}
        isLoading={false}
        error="Job not found"
        onRetry={() => {}}
      />
    )
    const block = screen.getByTestId('vendor-job-error')
    expect(screen.queryByTestId('vendor-job-detail')).not.toBeInTheDocument()
    expectDigitFree(block.innerHTML)
  })

  it('asks before marking a job received, and only then calls through', () => {
    const onStatus = vi.fn()
    render(
      <VendorJobDetailBody
        data={detail}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        onStatus={onStatus}
      />
    )

    fireEvent.click(screen.getByTestId('vendor-job-mark-received'))
    expect(onStatus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('vendor-job-mark-received-confirm'))
    expect(onStatus).toHaveBeenCalledWith('received')
  })

  it('cancel disarms the confirm without acting', () => {
    const onStatus = vi.fn()
    render(
      <VendorJobDetailBody
        data={detail}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        onStatus={onStatus}
      />
    )
    fireEvent.click(screen.getByTestId('vendor-job-mark-received'))
    fireEvent.click(screen.getByTestId('vendor-job-mark-received-cancel'))
    expect(onStatus).not.toHaveBeenCalled()
    expect(screen.getByTestId('vendor-job-mark-received')).toBeInTheDocument()
  })
})

// ============================================================================
// The action strip — rendered from the matrix, or it is a third copy of it
// ============================================================================

describe('the job detail action strip', () => {
  /** Every action control on the page, in the order it renders. */
  const actionIdsOf = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-testid^="vendor-job-mark-"]'))
      .map((el) => el.getAttribute('data-testid'))
      .filter((id): id is string => id !== null && !/-(confirm|cancel)$/.test(id))

  const at = (status: ProductionJobStatus): VendorJobDetailResponse => ({
    ...detail,
    job: { ...detail.job, status },
  })

  it.each([...VENDOR_JOB_STATUSES])(
    'renders exactly nextVendorActions(%s), in order, and nothing else',
    (status) => {
      const { container } = render(
        <VendorJobDetailBody
          data={at(status)}
          isLoading={false}
          error={null}
          onRetry={() => {}}
        />
      )
      expect(actionIdsOf(container)).toEqual(
        nextVendorActions(status).map((action) => action.testId)
      )
    }
  )

  it.each([...VENDOR_JOB_STATUSES, 'sent' as ProductionJobStatus])(
    'has deleted "Mark ready & sent back" — not present in %s either',
    (status) => {
      const { container } = render(
        <VendorJobDetailBody
          data={at(status)}
          isLoading={false}
          error={null}
          onRetry={() => {}}
        />
      )
      // The control the API now answers with a 400: `sent` is not in
      // `VENDOR_SETTABLE_STATUSES`, so pressing this could only ever fail.
      expect(screen.queryByTestId('vendor-job-mark-sent')).not.toBeInTheDocument()
      expect(container.textContent ?? '').not.toMatch(/sent back/i)
      expect(container.textContent ?? '').not.toMatch(/back to us/i)
    }
  )

  it.each(
    [...VENDOR_JOB_STATUSES, 'sent' as ProductionJobStatus].filter(
      (status) => nextVendorActions(status).length === 0
    )
  )('says why there is nothing to do in %s rather than showing an empty strip', (status) => {
    const { container } = render(
      <VendorJobDetailBody data={at(status)} isLoading={false} error={null} onRetry={() => {}} />
    )
    expect(actionIdsOf(container)).toEqual([])
    expect(screen.getByTestId('vendor-job-actions-none')).toHaveTextContent(
      vendorNoActionReason(status)
    )
  })

  it('offers the finish-and-submit move once a job is in production', () => {
    // The exact state the old screen could not express: a vendor holding a job
    // they are working on, whose only real next move is submitting it to us.
    const onStatus = vi.fn()
    render(
      <VendorJobDetailBody
        data={at('received')}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        onStatus={onStatus}
      />
    )
    fireEvent.click(screen.getByTestId('vendor-job-mark-qc_submitted'))
    fireEvent.click(screen.getByTestId('vendor-job-mark-qc_submitted-confirm'))
    expect(onStatus).toHaveBeenCalledWith('qc_submitted')
  })

  it('renders a readable status for a row the retirement backfill has not reached', () => {
    render(
      <VendorJobDetailBody
        data={at('sent' as ProductionJobStatus)}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )
    // Legible and obviously unfamiliar, rather than an empty pill that reads as
    // a rendering fault. Rows still carry this value.
    expect(screen.getByTestId('vendor-job-detail')).toBeInTheDocument()
    expect(screen.getByText('Sent')).toBeInTheDocument()
  })

  it('disables an action whose guard the screen knows is unsatisfied', () => {
    render(
      <VendorJobDetailBody
        data={at('received')}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        guards={{ 'shot-list-complete': false }}
      />
    )
    expect(screen.getByTestId('vendor-job-mark-qc_submitted')).toBeDisabled()
    expect(screen.getByTestId('vendor-job-guard-qc_submitted')).toBeInTheDocument()
  })

  it('keeps a failed write beside the button instead of blanking the job', () => {
    // #684: routing a write failure into the page error destroys a read that
    // succeeded — the summary, the items and the QC history all vanish at once.
    render(
      <VendorJobDetailBody
        data={detail}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        actionError="This job was cancelled, so there is nothing left to do on it."
      />
    )
    expect(screen.getByTestId('vendor-job-detail')).toBeInTheDocument()
    expect(screen.queryByTestId('vendor-job-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('vendor-job-action-error')).toHaveTextContent(/cancelled/i)
  })
})

// ============================================================================
// "In production since" is present tense, so it renders only where it is true
// ============================================================================

/**
 * The line rendered unconditionally, `formatVendorDate(job.receivedAt)` and all.
 * On an `assigned` job that is "In production since: —", which reads as a
 * broken field rather than as a fact; on `dispatched` and `cancelled` it is a
 * present-tense claim about a job nobody is working on.
 *
 * The condition is derived — `vendorJobIsOpen` is `isTerminalStatus` and
 * `UNREACHABLE_STATUSES` off the shared matrix — so the statuses are written
 * here as expectations rather than as the rule.
 */
describe('vendorJobIsOpen', () => {
  it('is false for the statuses nothing leaves, and for the retired one', () => {
    // Longhand, deliberately: recomputing `isTerminalStatus` here would agree
    // with any implementation, including one that got it backwards.
    expect(vendorJobIsOpen('dispatched')).toBe(false)
    expect(vendorJobIsOpen('cancelled')).toBe(false)
    expect(vendorJobIsOpen('sent')).toBe(false)
  })

  it('is true for every status still in play', () => {
    for (const status of [
      'draft',
      'assigned',
      'received',
      'qc_submitted',
      'qc_passed',
      'qc_failed',
    ] as const) {
      expect(vendorJobIsOpen(status)).toBe(true)
    }
  })
})

describe('the in-production line', () => {
  const at = (
    status: ProductionJobStatus,
    receivedAt: string | null
  ): VendorJobDetailResponse => ({
    ...detail,
    job: { ...detail.job, status, receivedAt },
  })

  const renderAt = (status: ProductionJobStatus, receivedAt: string | null) =>
    render(
      <VendorJobDetailBody
        data={at(status, receivedAt)}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )

  it('says when production started on a job that is in production', () => {
    renderAt('received', '2026-08-20T06:00:00.000Z')
    expect(screen.getByTestId('vendor-job-in-production-since')).toHaveTextContent(/2026/)
  })

  it('says nothing on a job that was never received', () => {
    // "In production since: —" under a label is a broken field, not a date.
    renderAt('assigned', null)
    expect(screen.queryByTestId('vendor-job-in-production-since')).not.toBeInTheDocument()
  })

  it('says nothing once the job has been handed over', () => {
    renderAt('dispatched', '2026-08-20T06:00:00.000Z')
    expect(screen.queryByTestId('vendor-job-in-production-since')).not.toBeInTheDocument()
  })

  it('says nothing on a cancelled job', () => {
    renderAt('cancelled', '2026-08-20T06:00:00.000Z')
    expect(screen.queryByTestId('vendor-job-in-production-since')).not.toBeInTheDocument()
  })

  it('says nothing rather than an em dash when the timestamp will not parse', () => {
    renderAt('received', 'not-a-date')
    expect(screen.queryByTestId('vendor-job-in-production-since')).not.toBeInTheDocument()
  })
})

// ============================================================================
// The shot list — QC_SHOT_LIST rendered, and the photos hung off it
// ============================================================================

/**
 * The uploader's structure is the SHARED list; only the photographs come from
 * the API. Every assertion below is written against `@chobii/shared` rather
 * than against slots repeated here, for the same reason the action strip is:
 * a test that restates the answer is a second copy of the shot list and cannot
 * fail the day a shot is added to it.
 */
describe('the QC shot list', () => {
  const photoIn = (slot: string, over: Partial<VendorQcPhoto> = {}): VendorQcPhoto => ({
    id: `photo-${slot}`,
    contentType: 'image/jpeg',
    sizeBytes: 2_400_000,
    uploadedAt: '2026-08-14T09:00:00.000Z',
    reviewId: null,
    // Null on purpose here: these tests are about the STRUCTURE of the panel,
    // and the display path — bytes fetched from R2, rendered from a blob — has
    // its own describe below with fetch and `createObjectURL` under control.
    // A signed URL in this fixture would put a real network call in a unit test.
    url: null,
    ...over,
  })

  /** A photo set answering exactly the shared list, with `filled` shot. */
  const photoSet = (
    stage: VendorJobStage,
    filled: string[] = []
  ): VendorQcPhotoSet => ({
    jobId: detail.job.id,
    stage,
    status: 'received',
    shots: (qcShotsForStage(stage) ?? []).map((shot) => ({
      slot: shot.slot,
      label: shot.label,
      required: shot.required,
      onShotList: true,
      photo: filled.includes(shot.slot) ? photoIn(shot.slot) : null,
    })),
    missingRequiredSlots: requiredQcSlots(stage).filter((slot) => !filled.includes(slot)),
    expiresInSeconds: 300,
    expiresAt: '2026-08-14T09:05:00.000Z',
  })

  const panel = (over: Partial<VendorQcPanelState> = {}): VendorQcPanelState => ({
    data: null,
    isLoading: false,
    error: null,
    onRetry: () => {},
    ...over,
  })

  it.each([...QC_STAGES])('renders every slot the %s shot list asks for', (stage) => {
    const { container } = render(
      <VendorQcShotList stage={stage} qc={panel({ data: photoSet(stage) })} canUpload />
    )

    const rendered = Array.from(
      container.querySelectorAll('[data-testid^="vendor-qc-shot-"]')
    ).map((el) => el.getAttribute('data-testid'))

    expect(rendered).toEqual(QC_SHOT_LIST[stage].map((shot) => `vendor-qc-shot-${shot.slot}`))
  })

  it.each([...QC_STAGES])('shows the %s shot list in the vendor’s words, not slot keys alone', (stage) => {
    render(<VendorQcShotList stage={stage} qc={panel({ data: photoSet(stage) })} canUpload />)
    for (const shot of QC_SHOT_LIST[stage]) {
      expect(screen.getByText(shot.label)).toBeInTheDocument()
    }
  })

  it.each([...QC_STAGES])('marks exactly the required slots of %s required', (stage) => {
    const { container } = render(
      <VendorQcShotList stage={stage} qc={panel({ data: photoSet(stage) })} canUpload />
    )

    const flagged = QC_SHOT_LIST[stage]
      .filter((shot) =>
        container
          .querySelector(`[data-testid="vendor-qc-shot-${shot.slot}"]`)
          ?.textContent?.includes('Required')
      )
      .map((shot) => shot.slot)

    expect(flagged).toEqual(requiredQcSlots(stage))
  })

  it('renders the shot list even before the photos have loaded', () => {
    // A vendor has to know what to photograph while we are still finding out
    // what they already photographed. The structure is the shared list; only
    // the images depend on the request.
    render(<VendorQcShotList stage="print" qc={panel({ isLoading: true })} canUpload />)
    expect(screen.getByTestId('vendor-qc-shots-skeleton')).toBeInTheDocument()
    for (const shot of QC_SHOT_LIST.print) {
      expect(screen.getByTestId(`vendor-qc-shot-${shot.slot}`)).toBeInTheDocument()
    }
  })

  it('shows the read failure and still names what has to be shot', () => {
    render(
      <VendorQcShotList
        stage="print"
        qc={panel({ error: 'Failed to load the photographs' })}
        canUpload
      />
    )
    expect(screen.getByTestId('vendor-qc-shots-error')).toHaveTextContent(
      /failed to load the photographs/i
    )
    // An empty shot list after a failed read would say the vendor photographed
    // nothing, which is a different and worse claim than "we could not look".
    expect(screen.getByTestId(`vendor-qc-shot-${QC_SHOT_LIST.print[0].slot}`)).toBeInTheDocument()
  })

  it('retry is wired on the photo panel', () => {
    const onRetry = vi.fn()
    render(<VendorQcShotList stage="print" qc={panel({ error: 'nope', onRetry })} canUpload />)
    fireEvent.click(screen.getByTestId('vendor-qc-shots-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('says so rather than rendering an empty panel when a stage asks for nothing', () => {
    render(
      <VendorQcShotList
        stage={'sculpture' as VendorJobStage}
        qc={panel({ data: null })}
        canUpload
      />
    )
    expect(screen.getByTestId('vendor-qc-shots-empty')).toBeInTheDocument()
  })

  it('shows a photo uploaded outside this stage’s shot list rather than dropping it', () => {
    // `production_job_photos.slot` is `text` with no enum under it. A photo
    // filed under a slot this stage does not ask for is a photograph nobody can
    // find, and hiding it here is how it stays hidden.
    const set = photoSet('print')
    set.shots.push({
      slot: 'frame_back',
      label: 'Uploaded outside the print shot list',
      required: false,
      onShotList: false,
      photo: photoIn('frame_back'),
    })

    render(<VendorQcShotList stage="print" qc={panel({ data: set })} canUpload />)
    expect(screen.getByTestId('vendor-qc-shot-frame_back')).toBeInTheDocument()
  })

  it('hands the picked file to the caller with the slot it belongs to', () => {
    const onUpload = vi.fn()
    render(
      <VendorQcShotList
        stage="print"
        qc={panel({ data: photoSet('print'), onUpload })}
        canUpload
      />
    )

    const file = new File(['x'], 'shot.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('vendor-qc-upload-print_full'), {
      target: { files: [file] },
    })

    expect(onUpload).toHaveBeenCalledWith('print_full', file)
  })

  it.each([...PRODUCTION_JOB_STATUSES])(
    'opens the upload window on %s exactly when the guarded submit is offered',
    (status) => {
      // The window is not a list, it is a consequence: a QC photograph exists
      // for one purpose, satisfying `shot-list-complete`, so a vendor may
      // change the shot list precisely while that guarded move is on offer.
      // Written from the ACTION STRIP rather than by repeating the filter, so
      // a hardcoded `['received']` that outlives the matrix fails here.
      const offersGuardedSubmit = nextVendorActions(status).some(
        (action) => action.guard === 'shot-list-complete'
      )
      expect(vendorMayUploadPhotos(status)).toBe(offersGuardedSubmit)
    }
  )

  it('offers the picker on the job screen while the job is in production', () => {
    const { container } = render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, status: 'received' } }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )
    expect(container.querySelectorAll('input[type="file"]').length).toBe(
      QC_SHOT_LIST[detail.job.stage].length
    )
    expect(screen.queryByTestId('vendor-qc-shots-locked')).not.toBeInTheDocument()
  })

  it('offers no picker on the job screen once the job has been handed over', () => {
    const { container } = render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, status: 'dispatched' } }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )
    expect(container.querySelectorAll('input[type="file"]').length).toBe(0)
    expect(screen.getByTestId('vendor-qc-shots-locked')).toBeInTheDocument()
  })

  it('offers no picker at all once the job has left the upload window', () => {
    // `QC_PHOTO_UPLOAD_STATUSES` is derived from the guarded edge, and the API
    // answers 409 outside it. A picker that can only produce a refusal is a
    // support ticket.
    const { container } = render(
      <VendorQcShotList stage="print" qc={panel({ data: photoSet('print') })} canUpload={false} />
    )
    expect(container.querySelectorAll('input[type="file"]').length).toBe(0)
    expect(screen.getByTestId('vendor-qc-shots-locked')).toBeInTheDocument()
  })

  it('asks before withdrawing a shot, and never with a native dialog', () => {
    const onWithdraw = vi.fn()
    render(
      <VendorQcShotList
        stage="print"
        qc={panel({ data: photoSet('print', ['print_full']), onWithdraw })}
        canUpload
      />
    )

    fireEvent.click(screen.getByTestId('vendor-qc-withdraw-print_full'))
    expect(onWithdraw).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('vendor-qc-withdraw-print_full-confirm'))
    expect(onWithdraw).toHaveBeenCalledWith('photo-print_full', 'print_full')
  })

  it('keeps one slot’s failure on that slot', () => {
    render(
      <VendorQcShotList
        stage="print"
        qc={panel({
          data: photoSet('print'),
          slotErrors: { print_full: 'That photograph is too large. The limit is 25MB.' },
        })}
        canUpload
      />
    )
    expect(screen.getByTestId('vendor-qc-error-print_full')).toHaveTextContent(/too large/i)
    expect(screen.queryByTestId('vendor-qc-error-print_raking_light')).not.toBeInTheDocument()
  })
})

// ============================================================================
// Submit for approval — enabled only when every required slot is live
// ============================================================================

describe('submitting the shot list for approval', () => {
  const shotsFor = (stage: VendorJobStage, filled: string[]): VendorQcShot[] =>
    (qcShotsForStage(stage) ?? []).map((shot) => ({
      slot: shot.slot,
      label: shot.label,
      required: shot.required,
      onShotList: true,
      photo: filled.includes(shot.slot)
        ? {
            id: `photo-${shot.slot}`,
            contentType: 'image/jpeg',
            sizeBytes: 1_000,
            uploadedAt: '2026-08-14T09:00:00.000Z',
            reviewId: null,
            url: null,
          }
        : null,
    }))

  const setFor = (stage: VendorJobStage, filled: string[]): VendorQcPhotoSet => ({
    jobId: detail.job.id,
    stage,
    status: 'received',
    shots: shotsFor(stage, filled),
    missingRequiredSlots: requiredQcSlots(stage).filter((slot) => !filled.includes(slot)),
    expiresInSeconds: 300,
    expiresAt: '2026-08-14T09:05:00.000Z',
  })

  const inProduction = (stage: VendorJobStage): VendorJobDetailResponse => ({
    ...detail,
    job: { ...detail.job, stage, status: 'received' },
  })

  const bodyWith = (stage: VendorJobStage, filled: string[] | null) =>
    render(
      <VendorJobDetailBody
        data={inProduction(stage)}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        qc={{
          data: filled === null ? null : setFor(stage, filled),
          isLoading: false,
          error: null,
          onRetry: () => {},
        }}
      />
    )

  it.each([...QC_STAGES])('disables submit on a %s job with nothing photographed', (stage) => {
    bodyWith(stage, [])
    expect(screen.getByTestId('vendor-job-mark-qc_submitted')).toBeDisabled()
    expect(screen.getByTestId('vendor-job-guard-qc_submitted')).toBeInTheDocument()
  })

  it.each([...QC_STAGES])(
    'still disables submit on a %s job one required shot short',
    (stage) => {
      const required = requiredQcSlots(stage)
      bodyWith(stage, required.slice(0, -1))
      expect(screen.getByTestId('vendor-job-mark-qc_submitted')).toBeDisabled()
    }
  )

  it.each([...QC_STAGES])(
    'enables submit on a %s job once every required shot is live',
    (stage) => {
      bodyWith(stage, requiredQcSlots(stage))
      const button = screen.getByTestId('vendor-job-mark-qc_submitted')
      expect(button).not.toBeDisabled()
      expect(screen.queryByTestId('vendor-job-guard-qc_submitted')).not.toBeInTheDocument()
    }
  )

  it('does not hold the submit back for a missing OPTIONAL shot', () => {
    const optional = QC_SHOT_LIST.print.filter((shot) => !shot.required)
    expect(optional.length).toBeGreaterThan(0)
    bodyWith('print', requiredQcSlots('print'))
    expect(screen.getByTestId('vendor-job-mark-qc_submitted')).not.toBeDisabled()
  })

  it('leaves the submit live while the photos have not been read', () => {
    // Absent is UNKNOWN, not unsatisfied. Greying out a legal move because the
    // evidence has not loaded is worse than spending a round trip on it — the
    // API evaluates the guard either way.
    bodyWith('print', null)
    expect(screen.getByTestId('vendor-job-mark-qc_submitted')).not.toBeDisabled()
  })

  it('counts a live photo, not an empty slot, when deriving what is missing', () => {
    expect(missingRequiredQcSlots('print', mergeQcShots('print', shotsFor('print', [])))).toEqual(
      requiredQcSlots('print')
    )
    expect(
      missingRequiredQcSlots('print', mergeQcShots('print', shotsFor('print', requiredQcSlots('print'))))
    ).toEqual([])
  })
})

// ============================================================================
// The 422 names the missing shots, and so does the screen
// ============================================================================

describe('the refusal a vendor can act on', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the slots the API named instead of dropping them into a string', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error:
          'This job cannot go to QC until every required photograph is uploaded. ' +
          'Still missing: print_colour_reference, print_raking_light.',
        code: 'SHOT_LIST_INCOMPLETE',
        guard: 'shot-list-complete',
        from: 'received',
        to: 'qc_submitted',
        missingSlots: ['print_colour_reference', 'print_raking_light'],
        allowed: [],
      }),
    })

    const failure = await patchVendorJobStatus(detail.job.id, 'qc_submitted').then(
      () => null,
      (error: unknown) => error as VendorJobWriteError
    )

    expect(failure).toBeInstanceOf(VendorJobWriteError)
    expect(failure?.code).toBe('SHOT_LIST_INCOMPLETE')
    expect(failure?.missingSlots).toEqual([
      'print_colour_reference',
      'print_raking_light',
    ])
  })

  it('renders the missing shots in the vendor’s own words, not only the keys', () => {
    render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, stage: 'print', status: 'received' } }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        actionError="This job cannot go to QC until every required photograph is uploaded."
        actionMissingSlots={['print_colour_reference', 'print_raking_light']}
      />
    )

    const named = screen.getByTestId('vendor-job-action-missing-slots')
    for (const slot of ['print_colour_reference', 'print_raking_light']) {
      const label = QC_SHOT_LIST.print.find((shot) => shot.slot === slot)?.label
      expect(label).toBeDefined()
      expect(named).toHaveTextContent(label as string)
      // The KEY is not printed. It is the response's own string, and printing
      // it is how our schema — or whoever's, after a regression — gets read
      // out on a supplier's screen. The words come from `QC_SHOT_LIST`.
      expect(named).not.toHaveTextContent(slot)
    }
    // And a shot that is NOT missing is not named.
    expect(named).not.toHaveTextContent('The whole print, flat and front-on')
  })

  it('counts a slot it has no words for rather than reading the response out', () => {
    render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, stage: 'print', status: 'received' } }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        actionError="This job cannot go to QC until every required photograph is uploaded."
        // Deliberately hostile, and deliberately not a slot: today's API builds
        // this list from the same shared constant, so this cannot happen — but
        // "cannot happen" is a property of the API, and the point of this
        // boundary is that the vendor's screen does not depend on one.
        actionMissingSlots={['print_colour_reference', 'pg_catalog.pg_tables']}
      />
    )

    expect(screen.getByTestId('vendor-job-action-missing-slots')).not.toHaveTextContent(
      'pg_catalog'
    )
    expect(document.body.innerHTML).not.toContain('pg_catalog')
    // Counted, though — a refusal naming something we cannot name back is not
    // a refusal to swallow silently.
    expect(screen.getByTestId('vendor-job-action-missing-unnamed')).toHaveTextContent(
      /one more check/i
    )
  })

  it('names nothing when the refusal was not about the shot list', () => {
    render(
      <VendorJobDetailBody
        data={detail}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        actionError="This job was cancelled."
      />
    )
    expect(screen.queryByTestId('vendor-job-action-missing-slots')).not.toBeInTheDocument()
  })

  it('qcSlotLabel answers null for a slot this stage does not ask for', () => {
    // Null, not the key. Falling back to the key made every caller a printer of
    // whatever string arrived, which is how `missingShotsFor` came to echo the
    // response verbatim.
    expect(qcSlotLabel('print', 'pg_catalog.pg_tables')).toBeNull()
    const [first] = QC_SHOT_LIST.print
    expect(qcSlotLabel('print', first.slot)).toBe(first.label)
  })

  it('missingShotsFor separates what it can say from what it can only count', () => {
    const [first] = QC_SHOT_LIST.print
    expect(missingShotsFor('print', [first.slot, 'not_a_slot', 'nor_this'])).toEqual({
      named: [{ slot: first.slot, label: first.label }],
      unnamed: 2,
    })
  })
})

// ============================================================================
// Upload — presign, straight to R2, then complete. Never a delete.
// ============================================================================

describe('uploading a shot', () => {
  const fetchMock = vi.fn()
  const file = () => new File(['bytes'], 'shot.jpg', { type: 'image/jpeg' })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** presign -> PUT -> complete, in that order. */
  const happyPath = (supersededPhotoId: string | null = null) => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://r2.example.com/production-qc/j/print_full/u.jpg?X-Amz-Signature=abc',
          key: 'production-qc/j/print_full/u.jpg',
          slot: 'print_full',
          contentType: 'image/jpeg',
          maxBytes: QC_PHOTO_MAX_BYTES,
          expiresInSeconds: 900,
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          photo: {
            id: 'photo-new',
            slot: 'print_full',
            contentType: 'image/jpeg',
            sizeBytes: 5,
            uploadedAt: '2026-08-14T10:00:00.000Z',
          },
          supersededPhotoId,
        }),
      })
  }

  it('presigns, PUTs straight to R2 and then records what landed', async () => {
    happyPath()
    await uploadVendorQcPhoto('j', 'print_full', file())

    const [presignUrl, presignInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(presignUrl).toContain('/api/vendor/jobs/j/photos/presign')
    expect(presignInit.method).toBe('POST')
    expect(presignInit.credentials).toBe('include')

    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    // The BYTES do not route through our API. A 25MB photograph through Hono
    // holds a request open on the box that also serves the storefront.
    expect(putUrl).not.toContain('/api/')
    expect(putUrl).toContain('r2.example.com')
    expect(putInit.method).toBe('PUT')
    // The signature IS the auth; a cookie ride-along changes what R2 hashes.
    expect(putInit.credentials).toBeUndefined()

    const [completeUrl, completeInit] = fetchMock.mock.calls[2] as [string, RequestInit]
    expect(completeUrl).toContain('/api/vendor/jobs/j/photos/complete')
    expect(JSON.parse(String(completeInit.body))).toMatchObject({
      slot: 'print_full',
      key: 'production-qc/j/print_full/u.jpg',
    })
  })

  it('re-uploading supersedes: it issues no DELETE and says the old shot is still on file', async () => {
    happyPath('photo-old')
    const result = await uploadVendorQcPhoto('j', 'print_full', file())

    expect(result.supersededPhotoId).toBe('photo-old')
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit | undefined][]) {
      expect(init?.method).not.toBe('DELETE')
    }
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('shows the replacement and says the earlier shot stayed on file', async () => {
    fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(['new bytes']) })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:replacement')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(
      <VendorQcShotList
        stage="print"
        qc={{
          data: {
            jobId: 'j',
            stage: 'print',
            status: 'received',
            shots: (qcShotsForStage('print') ?? []).map((shot) => ({
              slot: shot.slot,
              label: shot.label,
              required: shot.required,
              onShotList: true,
              photo:
                shot.slot === 'print_full'
                  ? {
                      id: 'photo-new',
                      contentType: 'image/jpeg',
                      sizeBytes: 5,
                      uploadedAt: '2026-08-14T10:00:00.000Z',
                      reviewId: null,
                      url: 'https://r2.example.com/production-qc/j/print_full/new.jpg?X-Amz-Signature=new',
                    }
                  : null,
            })),
            missingRequiredSlots: [],
            expiresInSeconds: 300,
            expiresAt: '2026-08-14T10:05:00.000Z',
          },
          isLoading: false,
          error: null,
          onRetry: () => {},
          supersededSlots: { print_full: 'photo-old' },
        }}
        canUpload
      />
    )

    // The NEW shot is what the slot shows...
    await waitFor(() =>
      expect(screen.getByTestId('vendor-qc-photo-print_full')).toBeInTheDocument()
    )
    // ...and the replacement is named rather than implied, because the earlier
    // row is superseded, not deleted, and a silently swapped thumbnail hides it.
    expect(screen.getByTestId('vendor-qc-superseded-print_full')).toHaveTextContent(
      /still on file/i
    )
  })

  it('refuses a file QC cannot review before spending a presign', async () => {
    await expect(
      uploadVendorQcPhoto('j', 'print_full', new File(['x'], 'p.heic', { type: 'image/heic' }))
    ).rejects.toThrow(/JPEG, PNG or WebP/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses an oversized photograph before spending a presign', async () => {
    const huge = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(huge, 'size', { value: QC_PHOTO_MAX_BYTES + 1 })

    await expect(uploadVendorQcPhoto('j', 'print_full', huge)).rejects.toThrow(/too large/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not record an upload that never landed', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://r2.example.com/x?X-Amz-Signature=abc',
          key: 'production-qc/j/print_full/u.jpg',
          slot: 'print_full',
          contentType: 'image/jpeg',
          maxBytes: QC_PHOTO_MAX_BYTES,
          expiresInSeconds: 900,
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 403 })

    await expect(uploadVendorQcPhoto('j', 'print_full', file())).rejects.toThrow(/403/)
    // A `complete` after a failed PUT writes a row for a photograph that is not
    // there, which is QC evidence of nothing.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('withdrawing a shot removes it from the LIVE list, not from history', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Photograph withdrawn', photoId: 'p1', slot: 'print_full' }),
    })

    await withdrawVendorQcPhoto('j', 'p1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/vendor/jobs/j/photos/p1')
    expect(init.method).toBe('DELETE')
  })
})

// ============================================================================
// The verdict banner — a fail that does not say what to redo is a phone call
// ============================================================================

describe('the QC verdict banner', () => {
  const review = (over: Partial<VendorJobReview> = {}): VendorJobReview => ({
    id: 'review-1',
    verdict: 'fail',
    defects: ['banding across the top third', 'scuffed lower left corner'],
    notes: 'Reprint and reshoot.',
    createdAt: '2026-08-14T09:00:00.000Z',
    ...over,
  })

  it('renders one chip per defect on a fail', () => {
    const failed = review()
    render(<QcVerdictBanner reviews={[failed]} />)

    const chips = screen.getAllByTestId('vendor-job-verdict-defect')
    expect(chips.map((chip) => chip.textContent)).toEqual(failed.defects)
  })

  it('says what to redo without a phone call', () => {
    render(<QcVerdictBanner reviews={[review()]} />)
    const banner = screen.getByTestId('vendor-job-verdict')
    expect(banner).toHaveTextContent(/banding across the top third/)
    expect(banner).toHaveTextContent(/Reprint and reshoot/)
  })

  it('shows no defect chips on a pass', () => {
    render(<QcVerdictBanner reviews={[review({ verdict: 'pass', defects: null, notes: null })]} />)
    expect(screen.getByTestId('vendor-job-verdict')).toBeInTheDocument()
    expect(screen.queryAllByTestId('vendor-job-verdict-defect')).toHaveLength(0)
  })

  it('shows no defect chips on a pass that still carries a defect list', () => {
    // The verdict decides, not the array. `defects` is nullish on a pass, so a
    // non-empty one is either an overturned earlier judgement or a note we
    // accepted the piece in spite of — and a row of red chips under "we
    // approved this job" tells a vendor to redo work we already took.
    render(
      <QcVerdictBanner
        reviews={[review({ verdict: 'pass', defects: ['a scuff we accepted'], notes: null })]}
      />
    )
    expect(screen.getByTestId('vendor-job-verdict')).toBeInTheDocument()
    expect(screen.queryAllByTestId('vendor-job-verdict-defect')).toHaveLength(0)
    expect(screen.queryByTestId('vendor-job-verdict-no-defects')).not.toBeInTheDocument()
  })

  it('shows the LATEST verdict, not the first one recorded', () => {
    render(
      <QcVerdictBanner
        reviews={[
          review({ id: 'old', verdict: 'fail', defects: ['old defect'], createdAt: '2026-08-10T00:00:00.000Z' }),
          review({ id: 'new', verdict: 'pass', defects: null, notes: null, createdAt: '2026-08-14T00:00:00.000Z' }),
        ]}
      />
    )
    expect(screen.queryAllByTestId('vendor-job-verdict-defect')).toHaveLength(0)
    expect(screen.getByTestId('vendor-job-verdict')).not.toHaveTextContent('old defect')
  })

  it('says a fail arrived with no defect rather than showing an empty chip row', () => {
    // The API refuses a fail with no defect, so this is a regression tell, not
    // a normal state — and an empty chip row would read as "nothing wrong",
    // which inverts the verdict.
    render(<QcVerdictBanner reviews={[review({ defects: [] })]} />)
    expect(screen.queryAllByTestId('vendor-job-verdict-defect')).toHaveLength(0)
    expect(screen.getByTestId('vendor-job-verdict-no-defects')).toBeInTheDocument()
  })

  it('renders nothing at all before any verdict exists', () => {
    const { container } = render(<QcVerdictBanner reviews={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('rides on the job detail so a failed job leads with what to redo', () => {
    render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, status: 'qc_failed' }, reviews: [review()] }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )
    expect(screen.getByTestId('vendor-job-verdict')).toBeInTheDocument()
    expect(screen.getAllByTestId('vendor-job-verdict-defect')).toHaveLength(2)
  })
})

// ============================================================================
// The photograph is shown, and its signature is not
// ============================================================================

describe('showing a photograph without parking its signature in the DOM', () => {
  const signed =
    'https://r2.example.com/production-qc/j/print_full/u.jpg?X-Amz-Signature=deadbeefcafe'

  const withPhoto = (): VendorQcPhotoSet => ({
    jobId: 'j',
    stage: 'print',
    status: 'received',
    shots: (qcShotsForStage('print') ?? []).map((shot) => ({
      slot: shot.slot,
      label: shot.label,
      required: shot.required,
      onShotList: true,
      photo:
        shot.slot === 'print_full'
          ? {
              id: 'photo-1',
              contentType: 'image/jpeg',
              sizeBytes: 1_048_576,
              uploadedAt: '2026-08-14T09:00:00.000Z',
              reviewId: null,
              url: signed,
            }
          : null,
    })),
    missingRequiredSlots: [],
    expiresInSeconds: 300,
    expiresAt: '2026-08-14T09:05:00.000Z',
  })

  const fetchMock = vi.fn()
  let createObjectURL: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:vendor-qc-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches the bytes and renders them from a local blob, never from the signed URL', async () => {
    fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })

    const { container } = render(
      <VendorQcShotList
        stage="print"
        qc={{ data: withPhoto(), isLoading: false, error: null, onRetry: () => {} }}
        canUpload
      />
    )

    await waitFor(() =>
      expect(screen.getByTestId('vendor-qc-photo-print_full')).toHaveAttribute(
        'src',
        'blob:vendor-qc-preview'
      )
    )

    expect(createObjectURL).toHaveBeenCalled()
    // The bytes came straight from R2, not through our API.
    expect(String(fetchMock.mock.calls[0][0])).toBe(signed)
    // And the signature is nowhere in the markup.
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
  })

  it('keeps the signature out of the DOM even when the bytes cannot be fetched', async () => {
    // R2 CORS, an expired signature, a dropped connection — all end here, and
    // none of them may be answered with a link carrying the signature.
    fetchMock.mockRejectedValue(new Error('network'))

    const { container } = render(
      <VendorQcShotList
        stage="print"
        qc={{ data: withPhoto(), isLoading: false, error: null, onRetry: () => {} }}
        canUpload
      />
    )

    await waitFor(() =>
      expect(screen.getByTestId('vendor-qc-photo-unavailable-print_full')).toBeInTheDocument()
    )
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(container.innerHTML).not.toContain('r2.example.com')
  })

  it('embeds nothing — no iframe, no embed, no object', async () => {
    fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })

    const { container } = render(
      <VendorQcShotList
        stage="print"
        qc={{ data: withPhoto(), isLoading: false, error: null, onRetry: () => {} }}
        canUpload
      />
    )

    await waitFor(() => expect(screen.getByTestId('vendor-qc-photo-print_full')).toBeInTheDocument())
    expect(container.querySelectorAll('iframe, embed, object').length).toBe(0)
  })
})

describe('my rates — read-only, three states', () => {
  it('has a skeleton, an empty and a digit-free error', () => {
    const { rerender } = render(
      <VendorRatesBody rates={[]} isLoading error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-rates-skeleton')).toBeInTheDocument()

    rerender(<VendorRatesBody rates={[]} isLoading={false} error={null} onRetry={() => {}} />)
    expect(screen.getByTestId('vendor-rates-empty')).toBeInTheDocument()

    rerender(
      <VendorRatesBody rates={[]} isLoading={false} error="Failed" onRetry={() => {}} />
    )
    const block = screen.getByTestId('vendor-rates-error')
    expect(screen.queryByTestId('vendor-rates-empty')).not.toBeInTheDocument()
    expectDigitFree(block.innerHTML)
  })

  it('renders a band and offers no way to change it', () => {
    const { container } = render(
      <VendorRatesBody rates={[rate]} isLoading={false} error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId(`vendor-rate-row-${rate.id}`)).toBeInTheDocument()
    expect(screen.getByText('₹450.00')).toBeInTheDocument()
    // Read-only means no form controls at all on this screen.
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('describes bands in words', () => {
    expect(bandLabel(rate)).toBe('12–24″')
    expect(bandLabel({ ...rate, longestEdgeMinInches: null })).toBe('Up to 24″')
    expect(bandLabel({ ...rate, longestEdgeMaxInches: null })).toBe('Over 12″')
    expect(
      bandLabel({ ...rate, longestEdgeMinInches: null, longestEdgeMaxInches: null })
    ).toBe('Any size')
  })

  it('knows which band is in force', () => {
    const now = new Date('2026-06-01T00:00:00.000Z')
    expect(isCurrentBand(rate, now)).toBe(true)
    expect(isCurrentBand({ ...rate, effectiveTo: '2026-03-01T00:00:00.000Z' }, now)).toBe(false)
    expect(isCurrentBand({ ...rate, effectiveFrom: '2026-09-01T00:00:00.000Z' }, now)).toBe(false)
  })
})

describe('my payments — an error is never a zero', () => {
  it('states the outstanding amount only on a successful read', () => {
    const { rerender, container } = render(
      <OutstandingAmount payableTotal={null} isLoading error={null} />
    )
    expect(screen.getByTestId('vendor-payments-outstanding-loading')).toBeInTheDocument()
    expectDigitFree(container.innerHTML)

    rerender(<OutstandingAmount payableTotal={null} isLoading={false} error="Failed" />)
    const failed = screen.getByTestId('vendor-payments-outstanding-unknown')
    // The one thing this must never say is ₹0.00.
    expect(failed.textContent).not.toContain('0')
    expectDigitFree(failed.innerHTML)

    rerender(<OutstandingAmount payableTotal="7300.00" isLoading={false} error={null} />)
    expect(screen.getByTestId('vendor-payments-outstanding')).toHaveTextContent('₹7,300.00')
  })

  it('shows a genuine zero when the read genuinely says zero', () => {
    // The rule is "no INVENTED zero". A real settled-up balance is information.
    render(<OutstandingAmount payableTotal="0" isLoading={false} error={null} />)
    expect(screen.getByTestId('vendor-payments-outstanding')).toHaveTextContent('₹0.00')
  })

  it('has all three list states, error digit-free', () => {
    const { rerender } = render(
      <VendorPaymentsBody settlements={[]} isLoading error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-payments-skeleton')).toBeInTheDocument()

    rerender(
      <VendorPaymentsBody settlements={[]} isLoading={false} error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-payments-empty')).toBeInTheDocument()

    rerender(
      <VendorPaymentsBody settlements={[]} isLoading={false} error="Failed" onRetry={() => {}} />
    )
    const block = screen.getByTestId('vendor-payments-error')
    expect(screen.queryByTestId('vendor-payments-empty')).not.toBeInTheDocument()
    expectDigitFree(block.innerHTML)
  })
})

// ============================================================================
// Formatting and due dates
// ============================================================================

describe('formatting never invents a number', () => {
  it('returns null rather than zero for an unparseable amount', () => {
    expect(formatVendorAmount(null)).toBeNull()
    expect(formatVendorAmount('')).toBeNull()
    expect(formatVendorAmount('not-a-number')).toBeNull()
    expect(formatVendorAmount('0')).toBe('₹0.00')
  })

  it('says how late a job is, not just when it was due', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T10:00:00.000Z'))
    render(<DueCell dueAt="2026-09-01T00:00:00.000Z" />)
    expect(screen.getByText(/2 days late/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('says so when there is no due date', () => {
    render(<DueCell dueAt={null} />)
    expect(screen.getByText('No due date')).toBeInTheDocument()
  })
})

// ============================================================================
// Exactly four screens, and no native dialogs
// ============================================================================

// ============================================================================
// Inbound parcels — the strip, and the seven fields a vendor is told
// ============================================================================

/**
 * A parcel, exactly as `GET /api/vendor/transfers` answers it.
 *
 * Seven fields plus `direction`, and the assertions below are written against
 * THAT LIST rather than against the markup, because the whole point of the
 * surface is subtraction: a `fromVendorName`, an `orderId` or a `costAmount`
 * appearing here would be the isolation suite's first property breaking, and a
 * test that only checked the fields it expected to see could never notice.
 */
const inboundParcel: VendorTransfer = {
  id: '88888888-8888-4888-8888-888888888888',
  reference: 'BLR-DKT-99120',
  carrier: 'Delhivery',
  pieceCount: 3,
  dispatchedAt: '2026-08-20T06:00:00.000Z',
  expectedBy: '2026-08-23T06:00:00.000Z',
  receivedAt: null,
  direction: 'inbound',
}

const outboundParcel: VendorTransfer = {
  id: '99999999-9999-4999-8999-999999999999',
  reference: 'BLR-DKT-99121',
  carrier: null,
  pieceCount: 1,
  dispatchedAt: '2026-08-21T06:00:00.000Z',
  expectedBy: null,
  receivedAt: null,
  direction: 'outbound',
}

const arrivedParcel: VendorTransfer = {
  ...inboundParcel,
  id: 'aaaaaaaa-8888-4888-8888-888888888888',
  receivedAt: '2026-08-22T11:30:00.000Z',
}

/**
 * A parcel that exists and has NOT been sent — `pending`, in the admin screens'
 * vocabulary (`routes/admin/transfers.ts#transferState`), which names and
 * filters it as one of four first-class states.
 *
 * No fixture in either vendor suite had `dispatchedAt: null` until this one,
 * which is exactly why the strip could offer "Confirm arrival" on a box still
 * on the sender's bench for a whole phase: every test agreed with the code
 * about a null nobody produced. The API does not agree — it answers 409
 * `TRANSFER_NOT_DISPATCHED`.
 */
const pendingParcel: VendorTransfer = {
  ...inboundParcel,
  id: 'bbbbbbbb-8888-4888-8888-888888888888',
  dispatchedAt: null,
  expectedBy: null,
  receivedAt: null,
}

const transferPanel = (
  over: Partial<VendorTransferPanelState> = {}
): VendorTransferPanelState => ({
  data: [inboundParcel],
  isLoading: false,
  error: null,
  onRetry: () => {},
  ...over,
})

describe('the inbound parcel strip', () => {
  it('shows the docket, the carrier and the piece count', () => {
    render(<VendorTransferStrip transfers={transferPanel()} />)

    const row = screen.getByTestId(`vendor-transfer-row-${inboundParcel.id}`)
    expect(row).toHaveTextContent('BLR-DKT-99120')
    expect(row).toHaveTextContent('Delhivery')
    // The piece count is what a vendor counts against on arrival, so it is
    // rendered as a number of pieces rather than as a bare digit.
    expect(row.textContent ?? '').toMatch(/3\s*pieces/i)
  })

  it('names the direction, which is all a vendor learns about the other end', () => {
    render(
      <VendorTransferStrip
        transfers={transferPanel({ data: [inboundParcel, outboundParcel] })}
      />
    )

    expect(
      screen.getByTestId(`vendor-transfer-direction-${inboundParcel.id}`)
    ).toHaveTextContent(/coming to you/i)
    expect(
      screen.getByTestId(`vendor-transfer-direction-${outboundParcel.id}`)
    ).toHaveTextContent(/sent by you/i)
  })

  it('says a parcel has no docket rather than printing a blank', () => {
    render(
      <VendorTransferStrip
        transfers={transferPanel({ data: [{ ...inboundParcel, reference: null }] })}
      />
    )
    expect(screen.getByTestId(`vendor-transfer-row-${inboundParcel.id}`)).toHaveTextContent(
      /no docket/i
    )
  })

  it('shows a skeleton while the parcels are loading', () => {
    render(<VendorTransferStrip transfers={transferPanel({ data: null, isLoading: true })} />)
    expect(screen.getByTestId('vendor-transfers-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('vendor-transfers-empty')).not.toBeInTheDocument()
  })

  it('shows the error INSTEAD of an empty state, with no numbers in it', () => {
    const { container } = render(
      <VendorTransferStrip
        transfers={transferPanel({ data: null, error: 'Failed to list transfers' })}
      />
    )
    // An empty state after a failed read is a lie: "no parcels" and "we did not
    // find out" are different facts, and only one of them is safe to act on.
    expect(screen.getByTestId('vendor-transfers-error')).toBeInTheDocument()
    expect(screen.queryByTestId('vendor-transfers-empty')).not.toBeInTheDocument()
    expectDigitFree(container.innerHTML)
  })

  it('retry is wired', () => {
    const onRetry = vi.fn()
    render(
      <VendorTransferStrip
        transfers={transferPanel({ data: null, error: 'Failed to list transfers', onRetry })}
      />
    )
    fireEvent.click(screen.getByTestId('vendor-transfers-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when there really are no parcels', () => {
    render(<VendorTransferStrip transfers={transferPanel({ data: [] })} />)
    expect(screen.getByTestId('vendor-transfers-empty')).toBeInTheDocument()
  })

  it('offers arrival confirmation on an inbound parcel that has not arrived', () => {
    render(<VendorTransferStrip transfers={transferPanel({ onReceived: () => {} })} />)
    expect(
      screen.getByTestId(`vendor-transfer-received-${inboundParcel.id}`)
    ).toBeInTheDocument()
  })

  it('offers it on NEITHER an outbound parcel nor one already arrived', () => {
    render(
      <VendorTransferStrip
        transfers={transferPanel({ data: [outboundParcel, arrivedParcel], onReceived: () => {} })}
      />
    )
    // `received_at` is settable only by the receiving end — the API answers the
    // sender with a 404 — and a control whose only outcome is a refusal is a
    // support ticket rather than an affordance.
    expect(
      screen.queryByTestId(`vendor-transfer-received-${outboundParcel.id}`)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(`vendor-transfer-received-${arrivedParcel.id}`)
    ).not.toBeInTheDocument()
    expect(screen.getByTestId(`vendor-transfer-row-${arrivedParcel.id}`)).toHaveTextContent(
      /arrived/i
    )
  })

  it('offers it on NEITHER a parcel nobody has despatched yet', () => {
    render(
      <VendorTransferStrip
        transfers={transferPanel({ data: [pendingParcel], onReceived: () => {} })}
      />
    )
    // `lib/vendor-scope.ts` answers this exact press with a 409
    // `TRANSFER_NOT_DISPATCHED`: the parcel has not been sent, so it cannot
    // have arrived. The refusal is predictable from the row itself.
    expect(
      screen.queryByTestId(`vendor-transfer-received-${pendingParcel.id}`)
    ).not.toBeInTheDocument()
  })

  it('says WHY there is nothing to confirm rather than dropping the control silently', () => {
    render(
      <VendorTransferStrip
        transfers={transferPanel({ data: [pendingParcel], onReceived: () => {} })}
      />
    )
    // A missing button is indistinguishable from one that failed to render.
    const said = screen.getByTestId(`vendor-transfer-pending-${pendingParcel.id}`).textContent ?? ''
    expect(said).toMatch(/not been sent/i)
    expect(said).toMatch(/nothing to confirm/i)
  })

  it('claims no departure and no transit for a parcel that has not been sent', () => {
    render(<VendorTransferStrip transfers={transferPanel({ data: [pendingParcel] })} />)

    const dates = screen.getByTestId(`vendor-transfer-dates-${pendingParcel.id}`).textContent ?? ''
    // The old strip printed "Left on —" above "In transit, due —". Both are
    // assertions about a despatch that has not happened, and the em dash reads
    // as a missing value rather than as the state of the row.
    expect(dates).not.toMatch(/left on/i)
    expect(dates).not.toMatch(/in transit/i)
    expect(dates).toMatch(/not sent yet/i)
  })

  it('still says when a despatched parcel left and when it is due', () => {
    // The counterpart of the case above: the dates that ARE true still print,
    // so "say nothing" was not the fix.
    render(<VendorTransferStrip transfers={transferPanel({ data: [inboundParcel] })} />)
    const dates = screen.getByTestId(`vendor-transfer-dates-${inboundParcel.id}`).textContent ?? ''
    expect(dates).toMatch(/left on/i)
    expect(dates).toMatch(/in transit/i)
  })

  it('says older parcels may exist when the walk could not reach the end', () => {
    render(
      <VendorTransferStrip transfers={transferPanel({ olderNotListed: true })} />
    )
    // This strip is the only place an arrival can be confirmed, so a partial
    // answer to "everything you have to confirm" has to say it is partial.
    expect(screen.getByTestId('vendor-transfers-older-not-listed')).toHaveTextContent(
      /older parcels/i
    )
  })

  it('says nothing of the sort when the walk did reach the end', () => {
    render(<VendorTransferStrip transfers={transferPanel()} />)
    expect(screen.queryByTestId('vendor-transfers-older-not-listed')).not.toBeInTheDocument()
  })

  it('asks before confirming an arrival, and only then calls through', () => {
    const onReceived = vi.fn()
    render(<VendorTransferStrip transfers={transferPanel({ onReceived })} />)

    fireEvent.click(screen.getByTestId(`vendor-transfer-received-${inboundParcel.id}`))
    expect(onReceived).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId(`vendor-transfer-received-${inboundParcel.id}-confirm`))
    expect(onReceived).toHaveBeenCalledWith(inboundParcel.id)
  })

  it('keeps a failed confirmation on its own row', () => {
    render(
      <VendorTransferStrip
        transfers={transferPanel({
          data: [inboundParcel, { ...outboundParcel, direction: 'inbound' }],
          onReceived: () => {},
          rowErrors: { [inboundParcel.id]: 'This parcel was already confirmed.' },
        })}
      />
    )
    expect(screen.getByTestId(`vendor-transfer-error-${inboundParcel.id}`)).toHaveTextContent(
      /already confirmed/i
    )
    expect(
      screen.queryByTestId(`vendor-transfer-error-${outboundParcel.id}`)
    ).not.toBeInTheDocument()
  })
})

describe('transferAwaitsArrival', () => {
  /**
   * Written longhand, one case per condition, rather than as a loop over the
   * fixtures: the whole defect this predicate exists to close was a missing
   * clause, and a table-driven test written from the same reading as the code
   * would have had the same clause missing.
   */
  it('accepts a despatched inbound parcel that has not arrived', () => {
    expect(transferAwaitsArrival(inboundParcel)).toBe(true)
  })

  it('refuses an outbound parcel — the sending end is answered 404', () => {
    expect(transferAwaitsArrival(outboundParcel)).toBe(false)
  })

  it('refuses one already confirmed — the API answers 409 TRANSFER_ALREADY_RECEIVED', () => {
    expect(transferAwaitsArrival(arrivedParcel)).toBe(false)
  })

  it('refuses one nobody has despatched — the API answers 409 TRANSFER_NOT_DISPATCHED', () => {
    expect(transferAwaitsArrival(pendingParcel)).toBe(false)
  })
})

describe('inboundAwaitingArrival', () => {
  it('is the despatched inbound parcels with no arrival stamp, and nothing else', () => {
    expect(
      inboundAwaitingArrival([inboundParcel, outboundParcel, arrivedParcel, pendingParcel])
    ).toEqual([inboundParcel])
  })

  it('is empty when the parcels have not been read — unknown is not waiting', () => {
    expect(inboundAwaitingArrival(null)).toEqual([])
    expect(inboundAwaitingArrival(undefined)).toEqual([])
  })
})

describe('mergeTransferRows', () => {
  it('puts what has to be acted on above what merely happened', () => {
    // `created_at DESC` sorts a fortnight-old parcel below yesterday's
    // despatch, and the old one is the one with a button on it.
    expect(mergeTransferRows([inboundParcel], [outboundParcel])).toEqual([
      inboundParcel,
      outboundParcel,
    ])
  })

  it('lists a parcel that is both recent and awaiting confirmation once', () => {
    const merged = mergeTransferRows([inboundParcel], [outboundParcel, inboundParcel])
    expect(merged.map((transfer) => transfer.id)).toEqual([
      inboundParcel.id,
      outboundParcel.id,
    ])
  })
})

// ============================================================================
// Waiting on an inbound parcel
// ============================================================================

/**
 * A frame job cannot start until the printed sheet reaches the bench, and the
 * portal is the only place that says so.
 *
 * The link between a parcel and an ORDER is deliberately unavailable here: the
 * API withholds `order_id` from every vendor-facing projection (R1), and
 * `GET /transfers/:id` scopes `jobIds` to the CALLER's own jobs, so a receiving
 * vendor gets an empty list rather than a handle on the sender's work. The
 * strongest honest statement the screen can make is therefore about the vendor's
 * own inbound parcels, and the wording says exactly that rather than claiming a
 * link the response does not carry.
 */
describe('waiting on an inbound parcel', () => {
  const frameAt = (status: ProductionJobStatus): VendorJobDetailResponse => ({
    ...detail,
    job: { ...detail.job, stage: 'frame', status },
  })

  it('says so on a frame job while a parcel is still in transit', () => {
    render(
      <VendorJobDetailBody
        data={frameAt('assigned')}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        inboundInTransit={[inboundParcel]}
      />
    )
    expect(screen.getByTestId('vendor-job-awaiting-inbound')).toHaveTextContent(
      /waiting on an inbound parcel/i
    )
  })

  it('stops saying it once the parcel has arrived', () => {
    render(
      <VendorJobDetailBody
        data={frameAt('assigned')}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        inboundInTransit={[arrivedParcel]}
      />
    )
    expect(screen.queryByTestId('vendor-job-awaiting-inbound')).not.toBeInTheDocument()
  })

  it('does not announce a parcel still sitting on the sender’s bench', () => {
    render(
      <VendorJobDetailBody
        data={frameAt('assigned')}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        inboundInTransit={[pendingParcel]}
      />
    )
    // "Something is in transit to you" about a `pending` parcel sends a vendor
    // to look for a courier nobody has called, and then to a confirm control
    // the API answers 409. Both halves of that came from the same missing
    // clause, which is why one predicate now answers both.
    expect(screen.queryByTestId('vendor-job-awaiting-inbound')).not.toBeInTheDocument()
  })

  it('never says it on a print job — nothing is couriered TO a print shop', () => {
    render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, stage: 'print' } }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        inboundInTransit={[inboundParcel]}
      />
    )
    expect(screen.queryByTestId('vendor-job-awaiting-inbound')).not.toBeInTheDocument()
  })

  it('does not claim a parcel is coming before the parcels have been read', () => {
    render(
      <VendorJobDetailBody
        data={frameAt('assigned')}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        inboundInTransit={null}
      />
    )
    expect(screen.queryByTestId('vendor-job-awaiting-inbound')).not.toBeInTheDocument()
  })

  it('names no vendor, no order and no other end at all', () => {
    const { container } = render(
      <VendorJobDetailBody
        data={frameAt('assigned')}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        inboundInTransit={[inboundParcel]}
      />
    )
    const note = screen.getByTestId('vendor-job-awaiting-inbound').textContent ?? ''
    // Asserted on the note's TEXT rather than on the container: `border-border`
    // contains the substring "order", and an assertion that trips over Tailwind
    // teaches the next person to weaken it.
    expect(note).not.toMatch(/\border\b/i)
    expect(note).not.toMatch(/\bvendor\b|\bworkshop\b|\bfrom\b/i)
    // Nor a docket, a carrier or a piece count: naming the parcel here would
    // be the screen asserting a link between THIS job and THAT parcel, which
    // is exactly the join the API refuses to make.
    expect(note).not.toContain(String(inboundParcel.reference))
    expect(note).not.toContain(String(inboundParcel.carrier))
    expect(container.querySelectorAll('iframe, embed, object').length).toBe(0)
  })
})

// ============================================================================
// The label handover card — a button, fetched at click, used in the same tick
// ============================================================================

/**
 * The one document on this whole boundary that carries a customer.
 *
 * §6 (R2): customer data reaches a vendor ONLY as opaque rendered bytes behind a
 * short-lived signature, handed to the operating system — never composed by our
 * API, never rendered into the portal's own DOM. So the control is a BUTTON, the
 * signed URL is fetched inside the click handler, and what the browser is handed
 * is a local `blob:` URL. `no-customer-data.test.tsx` holds the mechanical half
 * of that rule; this block holds the behaviour.
 */
describe('the label handover card', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vendor-label')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** The API's two hops: the signature, then the bytes it signs. */
  const respondWithLabel = () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jobId: detail.job.id,
          url: 'https://r2.example.com/fulfilment/labels/tok.pdf?X-Amz-Signature=deadbeef',
          expiresInSeconds: 300,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => new Blob(['%PDF']) })
  }

  it('is a button, not an embed, and holds no URL before the click', () => {
    const { container } = render(<VendorLabelHandoverCard jobId={detail.job.id} />)

    const control = screen.getByTestId('vendor-job-label')
    expect(control.tagName).toBe('BUTTON')
    expect(container.querySelectorAll('iframe, embed, object').length).toBe(0)
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the signature at click and hands the BYTES to the operating system', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    respondWithLabel()

    const { container } = render(<VendorLabelHandoverCard jobId={detail.job.id} />)
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))

    // Two hops: our API for the signature, then R2 for the bytes.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [labelUrl, labelInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(labelUrl).toContain(`/api/vendor/jobs/${detail.job.id}/label`)
    expect(labelInit.credentials).toBe('include')
    expect(fetchMock.mock.calls[1][0]).toContain('X-Amz-Signature')

    // What the OS was handed is a local object URL. The signature never became
    // an href, and nothing carrying it is left in the document.
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(document.body.querySelectorAll('a[href*="X-Amz-Signature"]').length).toBe(0)
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(container.querySelectorAll('iframe, embed, object').length).toBe(0)
  })

  it('does not revoke the blob in the same tick it hands it over', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      respondWithLabel()

      render(<VendorLabelHandoverCard jobId={detail.job.id} />)
      fireEvent.click(screen.getByTestId('vendor-job-label'))

      // Drain the promises without advancing the clock: the anchor has been
      // clicked, so the browser is reading the blob for the save right now.
      await vi.advanceTimersByTimeAsync(0)
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
      // Revoking here is a known way to abort an `<a download>` — Safari
      // always, Chrome once the PDF is big enough that the write has not
      // started by the time the task queue drains.
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()

      // But it IS revoked. A blob held for the life of the tab is a leak of a
      // customer's address into the page's memory.
      await vi.advanceTimersByTimeAsync(5_000)
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders OUR words on a 5xx, not the body’s', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      // `failed()` returns a fixed string today, so nothing leaks — which is
      // exactly the problem: the protection lived in the API, and this
      // boundary's whole position is that it lives here.
      json: async () => ({
        error: 'Failed to issue label: relation "order_shipments" does not exist',
      }),
    })

    const { container } = render(<VendorLabelHandoverCard jobId={detail.job.id} />)
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() => expect(screen.getByTestId('vendor-job-label-error')).toBeInTheDocument())
    for (const leak of ['order_shipments', 'relation', 'does not exist', 'Failed to issue']) {
      expect(container.innerHTML).not.toContain(leak)
    }
    expect(screen.getByTestId('vendor-job-label-error').textContent ?? '').toMatch(
      /try again/i
    )
  })

  it('renders OUR words on a 503 that lost its code in a proxy', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      // The seam's status without the seam's `code` — one proxy or one
      // error-shape change away, and the card used to print this verbatim.
      json: async () => ({ error: 'upstream connect error: label_object_token' }),
    })

    const { container } = render(<VendorLabelHandoverCard jobId={detail.job.id} />)
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() => expect(screen.getByTestId('vendor-job-label-error')).toBeInTheDocument())
    expect(container.innerHTML).not.toContain('label_object_token')
    expect(container.innerHTML).not.toContain('upstream')
  })

  it('renders the 503 seam honestly, and repeats no database detail', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      // Deliberately hostile: a future regression that put the driver's own
      // sentence in the body must not reach a supplier's screen through here.
      json: async () => ({
        error:
          'column order_shipments.label_object_token does not exist — relation "order_shipments"',
        code: 'LABEL_NOT_AVAILABLE',
      }),
    })

    const { container } = render(<VendorLabelHandoverCard jobId={detail.job.id} />)
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() =>
      expect(screen.getByTestId('vendor-job-label-unavailable')).toBeInTheDocument()
    )
    const said = screen.getByTestId('vendor-job-label-unavailable').textContent ?? ''
    // Honest: the label is not available here yet, and nothing is wrong with
    // the order. The copy is OURS, so the body cannot leak through it.
    expect(said).toMatch(/not available/i)
    expect(said).toMatch(/office/i)
    for (const leak of [
      'order_shipments',
      'label_object_token',
      'column',
      'relation',
      'does not exist',
    ]) {
      expect(container.innerHTML).not.toContain(leak)
    }
  })

  it('says there is no label rather than confirming whose order it is', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Label not found' }),
    })

    render(<VendorLabelHandoverCard jobId={detail.job.id} />)
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() => expect(screen.getByTestId('vendor-job-label-error')).toBeInTheDocument())
    const said = screen.getByTestId('vendor-job-label-error').textContent ?? ''
    expect(said).toMatch(/no (courier )?label/i)
    // A 404 covers "no such job", "not your job", "you are not the
    // consolidator" and "no label bought yet" alike, and the screen must not
    // put back the distinction the API withholds.
    expect(said).not.toMatch(/consolidat|not yours|does not exist/i)
  })

  it('a failed byte fetch says so instead of falling back to a link', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jobId: detail.job.id,
          url: 'https://r2.example.com/fulfilment/labels/tok.pdf?X-Amz-Signature=deadbeef',
          expiresInSeconds: 300,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 403 })

    const { container } = render(<VendorLabelHandoverCard jobId={detail.job.id} />)
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() => expect(screen.getByTestId('vendor-job-label-error')).toBeInTheDocument())
    // The tempting fallback — "here is the link instead" — is exactly what the
    // whole component exists to avoid.
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(container.querySelectorAll('a[href]').length).toBe(0)
    // And the sentence is the REMEDY, not the exception. "Label fetch failed
    // (403)" is a status code shown to a print shop; pressing the button again
    // signs afresh, which is the thing they can actually do.
    const said = screen.getByTestId('vendor-job-label-error').textContent ?? ''
    expect(said).not.toMatch(/403|fetch failed/i)
    expect(said).toMatch(/press the button again/i)
  })
})

// ============================================================================
// Handover is offered where the MATRIX says, and nowhere else
// ============================================================================

describe('the handover card follows the transition matrix', () => {
  /**
   * WRITTEN OUT, not recomputed.
   *
   * This used to be `VENDOR_JOB_STATUSES.filter(status => nextVendorActions(...)
   * .some(action => action.guard === 'open-transfer-or-order-label'))` — the
   * same expression the card's placement uses. That agrees with today's matrix
   * and with any other, including one where the placement had been replaced by
   * the literal `job.status === 'qc_passed'` the derivation exists to prevent.
   * A test that recomputes what it is checking passes whatever the code does;
   * `packages/shared/tests/schemas/production-transitions.test.ts` writes its
   * expectations longhand for exactly this reason.
   *
   * `qc_passed` is the one status the matrix gates on a label: it is the only
   * `from` with a `dispatched` edge, and that edge carries
   * `open-transfer-or-order-label`.
   */
  const handoverStatuses: ProductionJobStatus[] = ['qc_passed']

  it('the matrix still gates exactly these statuses on the label', () => {
    // The bridge between the literal above and the table. If the matrix moves
    // that edge, this fails and the literal gets updated deliberately —
    // rather than the whole block quietly re-deriving itself into agreement.
    const gated = PRODUCTION_JOB_STATUSES.filter((from) =>
      PRODUCTION_JOB_STATUSES.some((to) => {
        const edge = PRODUCTION_TRANSITIONS[from][to]
        return (
          edge?.guard === 'open-transfer-or-order-label' && edge.actors.includes('vendor')
        )
      })
    )
    expect(gated).toEqual(handoverStatuses)
  })

  it.each([...VENDOR_JOB_STATUSES, 'sent' as ProductionJobStatus])(
    'shows the card in %s exactly when the matrix guards that edge on the label',
    (status) => {
      render(
        <VendorJobDetailBody
          data={{ ...detail, job: { ...detail.job, status } }}
          isLoading={false}
          error={null}
          onRetry={() => {}}
        />
      )
      const shown = screen.queryByTestId('vendor-job-label-card') !== null
      expect(shown).toBe(handoverStatuses.includes(status))
    }
  )

  it('leaves the handover move live, because nothing can observe its guard', () => {
    const [status] = handoverStatuses
    render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, status } }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )
    // `open-transfer-or-order-label` is a disjunction over an open transfer OR
    // a label on the order, and a browser can see neither: probing the label
    // route signs a customer's address and writes an audit row, and
    // `GET /transfers` withholds the order a parcel belongs to. Absent means
    // UNKNOWN, and the API evaluates the guard either way.
    expect(screen.getByTestId('vendor-job-mark-dispatched')).not.toBeDisabled()
    expect(screen.queryByTestId('vendor-job-guard-dispatched')).not.toBeInTheDocument()
  })

  /**
   * The chain that used to feed this guard is gone, and this is why.
   *
   * The label card raised `onIssued`, the page set `labelIssued`, and the body
   * passed `{ 'open-transfer-or-order-label': true }`. But `nextVendorActions`
   * blocks only on an explicit `false`, and the chain was upward-only by
   * construction — so it rendered identically to passing nothing at all, from
   * the day it was written. Three props, a piece of state and a sentence of
   * guard copy, none of which could change a pixel.
   */
  it('is not fed a guard by pressing the label button', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vendor-label')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jobId: detail.job.id,
          url: 'https://r2.example.com/l.pdf?X-Amz-Signature=deadbeef',
          expiresInSeconds: 300,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => new Blob(['%PDF']) })

    const [status] = handoverStatuses
    render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, status } }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )

    fireEvent.click(screen.getByTestId('vendor-job-label'))
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))

    // Identical before and after, which is the whole finding: the move was
    // live because the guard is unknown, and issuing a label did not and could
    // not change that.
    expect(screen.getByTestId('vendor-job-mark-dispatched')).not.toBeDisabled()

    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})

// ============================================================================
// A known-unsatisfied guard always says why
// ============================================================================

/**
 * `blockedReason` is what renders a button disabled, so a guard with no copy
 * must not fall through to `undefined` — that turns "we know this will be
 * refused" back into a live button, silently, which is the defect class the
 * upload window and the parcel strip were both fixed for.
 *
 * This matters more now that there is one entry in the copy table rather than
 * two. Deleting the `open-transfer-or-order-label` sentence, which was dead,
 * must not have made a `false` for it render as a live control.
 */
describe('every guard the matrix names has a sentence when it is known unmet', () => {
  /** Every guard on a vendor edge, off the matrix rather than off a list. */
  const vendorGuardedEdges = PRODUCTION_JOB_STATUSES.flatMap((from) =>
    PRODUCTION_JOB_STATUSES.flatMap((to) => {
      const edge = PRODUCTION_TRANSITIONS[from][to]
      return edge?.guard && edge.actors.includes('vendor')
        ? [{ from, to, guard: edge.guard }]
        : []
    })
  )

  it('the matrix names some, or every case below is vacuous', () => {
    expect(vendorGuardedEdges.length).toBeGreaterThan(0)
  })

  it.each(vendorGuardedEdges)(
    '$from -> $to ($guard) is disabled with a reason, never disabled in silence',
    ({ from, to, guard }) => {
      const [action] = nextVendorActions(from, { [guard]: false }).filter(
        (candidate) => candidate.to === to
      )
      expect(action).toBeDefined()
      expect(action?.blockedReason).toBeTruthy()
      // A sentence, not a key: the remedy is what a vendor needs, and the
      // guard's name is our vocabulary.
      expect(action?.blockedReason).not.toContain(guard)
    }
  )

  it('renders that reason beside the disabled button', () => {
    // The shot-list guard is the one this portal can actually answer `false`
    // for, so this case is the reachable one rather than an invented state.
    render(
      <VendorJobDetailBody
        data={{ ...detail, job: { ...detail.job, status: 'received' } }}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        guards={{ 'shot-list-complete': false }}
      />
    )
    expect(screen.getByTestId('vendor-job-mark-qc_submitted')).toBeDisabled()
    expect(screen.getByTestId('vendor-job-guard-qc_submitted')).toHaveTextContent(
      /every required photo/i
    )
  })
})

describe('the parcel fetchers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('asks for both ends by default and sends the session cookie', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [], limit: 20, offset: 0 }) })
    await fetchVendorTransfers()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/vendor/transfers')
    // No `direction`: both ends, which is the API's own default and the only
    // one that shows a vendor all of their own legs.
    expect(url).not.toContain('direction')
    // `requireVendor` reads the session cookie and nothing else; without this
    // every request is a 401.
    expect(init.credentials).toBe('include')
  })

  it('narrows to one end when asked', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [], limit: 20, offset: 0 }) })
    await fetchVendorTransfers({ direction: 'inbound' })
    expect(fetchMock.mock.calls[0][0]).toContain('direction=inbound')
  })

  it('sends an offset when there is one, and no offset when there is not', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [], limit: 20, offset: 0 }) })
    await fetchVendorTransfers({ offset: 40 })
    expect(fetchMock.mock.calls[0][0]).toContain('offset=40')

    fetchMock.mockClear()
    await fetchVendorTransfers()
    expect(fetchMock.mock.calls[0][0]).not.toContain('offset')
  })
})

// ============================================================================
// Everything awaiting confirmation is reachable, however old
// ============================================================================

/**
 * The strip is the ONLY place an arrival can be confirmed, so the read behind
 * it has to be complete rather than recent.
 *
 * It was neither. One page, no `direction`, no `limit`: the API's default of
 * twenty rows ordered `created_at DESC` across BOTH ends. A print shop
 * despatches more than it receives, so twenty of its own outbound legs push the
 * parcel actually on its bench off the page — and `jobs/$id.tsx` goes on telling
 * it to confirm that parcel on the job list. There was no "load more".
 */
describe('the parcels awaiting confirmation are all reachable', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** A page of `count` parcels, each of them inbound and confirmable. */
  const pageOf = (count: number, from = 0): VendorTransfer[] =>
    Array.from({ length: count }, (_, index) => ({
      ...inboundParcel,
      id: `page-${from + index}`,
    }))

  const respondWith = (...pages: VendorTransfer[][]) => {
    for (const items of pages) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items, limit: VENDOR_TRANSFERS_MAX_LIMIT, offset: 0 }),
      })
    }
  }

  it('asks for one END, at the biggest page the API will serve', async () => {
    respondWith([inboundParcel])
    await fetchInboundAwaitingArrival()

    const [url] = fetchMock.mock.calls[0] as [string]
    // `direction=inbound` is what stops outbound legs crowding the actionable
    // rows out of the page — a client-side filter over a mixed page cannot.
    expect(url).toContain('direction=inbound')
    expect(url).toContain(`limit=${VENDOR_TRANSFERS_MAX_LIMIT}`)
  })

  it('stops at the first short page — that is the only end-of-list this endpoint gives', async () => {
    respondWith(pageOf(VENDOR_TRANSFERS_MAX_LIMIT - 1))
    const { items, truncated } = await fetchInboundAwaitingArrival()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(items).toHaveLength(VENDOR_TRANSFERS_MAX_LIMIT - 1)
    expect(truncated).toBe(false)
  })

  it('walks past a full page to reach a parcel no first page could hold', async () => {
    const older = { ...inboundParcel, id: 'the-old-one' }
    respondWith(pageOf(VENDOR_TRANSFERS_MAX_LIMIT), [older])

    const { items, truncated } = await fetchInboundAwaitingArrival()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain(
      `offset=${VENDOR_TRANSFERS_MAX_LIMIT}`
    )
    // The whole point: a parcel a hundred rows down is still confirmable.
    expect(items.map((transfer) => transfer.id)).toContain('the-old-one')
    expect(truncated).toBe(false)
  })

  it('keeps only what a vendor can actually act on', async () => {
    respondWith([inboundParcel, arrivedParcel, pendingParcel])
    const { items } = await fetchInboundAwaitingArrival()

    // An arrived parcel is history and a pending one is somebody else's move;
    // both still appear in the recent page the strip shows underneath.
    expect(items).toEqual([inboundParcel])
  })

  it('says so rather than silently truncating when the walk hits its cap', async () => {
    respondWith(...Array.from({ length: VENDOR_TRANSFERS_MAX_PAGES }, () =>
      pageOf(VENDOR_TRANSFERS_MAX_LIMIT)
    ))

    const { truncated } = await fetchInboundAwaitingArrival()

    // The cap is a runaway guard, not a page size: a server that ignored
    // `offset` costs ten requests rather than an unbounded loop.
    expect(fetchMock).toHaveBeenCalledTimes(VENDOR_TRANSFERS_MAX_PAGES)
    // A partial answer to "everything you have to confirm" that does not say it
    // is partial is the same dead end one page down.
    expect(truncated).toBe(true)
  })

  it('confirms an arrival with NO body at all', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: 'Transfer received' }) })
    await markVendorTransferReceived('88888888-8888-4888-8888-888888888888')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/vendor/transfers/88888888-8888-4888-8888-888888888888/received')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    // `received_at` is stamped from OUR clock, and the only other thing a vendor
    // could put in a body is `cost_amount`, which is not theirs to set in either
    // direction. A request with no payload cannot be talked into carrying one.
    expect(init.body).toBeUndefined()
  })

  it('carries the API\'s refusal through rather than inventing one', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'This parcel was already confirmed as arrived.' }),
    })
    await expect(
      markVendorTransferReceived('88888888-8888-4888-8888-888888888888')
    ).rejects.toThrow(/already confirmed/i)
  })
})

describe('the shape of the portal', () => {
  const files = [
    'app/routes/vendor.tsx',
    'app/routes/vendor/index.tsx',
    'app/routes/vendor/jobs/$id.tsx',
    'app/routes/vendor/rates.tsx',
    'app/routes/vendor/payments.tsx',
  ]

  /**
   * Comments are stripped first. Every one of these files EXPLAINS why it does
   * not use a native dialog, and an assertion that trips over its own rationale
   * teaches the next person to delete the rationale.
   */
  const codeOf = (file: string) =>
    readFileSync(join(process.cwd(), file), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('uses no native confirm or alert anywhere', () => {
    for (const file of files) {
      const source = codeOf(file)
      // A native dialog blocks the automation harness, so a path guarded by one
      // can never be covered end to end. InlineConfirm exists for this.
      expect(source).not.toMatch(/(?<![\w.])(window\.)?confirm\s*\(/)
      expect(source).not.toMatch(/(?<![\w.])(window\.)?alert\s*\(/)
    }
  })

  it('is exactly four screens under one layout — no fifth', () => {
    // Four deliberately. A print shop will not learn more than that, and every
    // added screen is another thing that has to be right about isolation.
    const routeFiles: string[] = []
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), `${prefix}${entry.name}/`)
        } else if (entry.name.endsWith('.tsx')) {
          routeFiles.push(`${prefix}${entry.name}`)
        }
      }
    }
    walk(join(process.cwd(), 'app/routes/vendor'), '')

    expect(routeFiles.sort()).toEqual(['index.tsx', 'jobs/$id.tsx', 'payments.tsx', 'rates.tsx'])
  })

  it('the inline confirm is a two-step, not a dialog', () => {
    const onConfirm = vi.fn()
    render(
      <InlineConfirm
        testId="probe"
        label="Do it"
        question="Sure?"
        onConfirm={onConfirm}
      />
    )
    expect(screen.queryByTestId('probe-confirm')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('probe'))
    expect(screen.getByText('Sure?')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('probe-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
