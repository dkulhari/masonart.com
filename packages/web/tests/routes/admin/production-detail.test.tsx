/**
 * /admin/production/$id — the job, who is making it, and whether it passed.
 *
 * Three things are pinned here, and each one is the reason a piece of the data
 * model exists at all.
 *
 * 1. **The candidate list is the capability filter, made visible.** Vendor
 *    capabilities exist so that assigning a 40″ print does not offer a shop
 *    whose largest bed is 24″. The picker therefore filters on the job's stage
 *    AND the largest item's longest edge, and shows each candidate's rate for
 *    that size — a candidate with no covering band is named as such rather than
 *    priced at nothing.
 *
 * 2. **A 422 names the item and its size.** `POST /:jobId/assign` refuses the
 *    whole assignment when any item falls outside the vendor's bands, and
 *    answers with `unpriced: [{ orderItemId, longestEdge, size }]`. The remedy
 *    is "add a rate band for that size", which the admin can do immediately —
 *    but only if the screen says WHICH size. "Something went wrong" makes that
 *    a database query.
 *
 * 3. **Reviews are a history, not a verdict.** The rows are append-only
 *    server-side precisely so fail -> rework -> pass leaves three of them, and
 *    the screen has to render all three in order. Showing only the latest
 *    verdict throws away the entire reason reviews live in their own table.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  // `Route` IS the config object under this mock, so `Route.component` is the
  // page and `Route.useParams` has to come from here — the composed page is
  // rendered at the bottom of this file, and without a params hook it cannot be.
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ id: 'job-under-test' }),
  }),
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

import { PRODUCTION_JOB_STATUSES, type ProductionJobStatus } from '@chobii/shared'

import {
  Route,
  QcReviewHistory,
  QcReviewForm,
  QcShotList,
  TransitionPanel,
  TransitionRefusal,
  VendorCandidateList,
  AssignmentFailure,
  QC_DEFECT_CHIPS,
  sortReviewsOldestFirst,
  largestLongestEdge,
  selectRateForEdge,
  type ProductionJobReview,
  type ProductionJobItemRow,
  type QcShotEntry,
  type VendorRateRow,
  type VendorCandidate,
} from '~/routes/admin/production/$id'

afterEach(cleanup)

const noop = () => {}
const asyncNoop = async () => {}

// ============================================================================
// Sizing — which size the whole job has to be priced at
// ============================================================================

const ITEMS: ProductionJobItemRow[] = [
  {
    id: 'i1',
    orderItemId: 'oi-1111',
    quantity: 1,
    widthInches: 12,
    heightInches: 18,
    sizeLabel: '12×18',
  },
  {
    id: 'i2',
    orderItemId: 'oi-2222',
    quantity: 2,
    widthInches: 24,
    heightInches: 36,
    sizeLabel: '24×36',
  },
]

describe('largestLongestEdge', () => {
  it('is the longest edge of the biggest item, not of the first one', () => {
    expect(largestLongestEdge(ITEMS)).toBe(36)
  })

  it('reads the longest edge regardless of orientation', () => {
    expect(
      largestLongestEdge([
        { ...ITEMS[0], widthInches: 36, heightInches: 24 },
      ])
    ).toBe(36)
  })

  /**
   * A variant with no dimensions cannot be sized, and null is the honest
   * answer. Treating it as 0 would offer every vendor on the books for a job
   * nobody can actually price.
   */
  it('is null when an item has no dimensions at all', () => {
    expect(
      largestLongestEdge([
        { ...ITEMS[0], widthInches: null, heightInches: null },
        ITEMS[1],
      ])
    ).toBeNull()
  })

  it('is null for a job with no items', () => {
    expect(largestLongestEdge([])).toBeNull()
  })
})

// ============================================================================
// Rate lookup — the same band rules the API prices with
// ============================================================================

const RATES: VendorRateRow[] = [
  {
    id: 'r-small',
    vendorId: 'v1',
    kind: 'print',
    finish: null,
    longestEdgeMinInches: 0,
    longestEdgeMaxInches: 24,
    amount: '450.00',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
  },
  {
    id: 'r-large',
    vendorId: 'v1',
    kind: 'print',
    finish: null,
    longestEdgeMinInches: 24,
    longestEdgeMaxInches: 48,
    amount: '900.00',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
  },
  {
    id: 'r-frame',
    vendorId: 'v1',
    kind: 'frame',
    finish: null,
    longestEdgeMinInches: 0,
    longestEdgeMaxInches: 48,
    amount: '1200.00',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
  },
  {
    id: 'r-future',
    vendorId: 'v1',
    kind: 'print',
    finish: null,
    longestEdgeMinInches: 48,
    longestEdgeMaxInches: 96,
    amount: '2400.00',
    effectiveFrom: '2027-01-01T00:00:00.000Z',
    effectiveTo: null,
  },
]

const AT = new Date('2026-06-01T00:00:00.000Z')

describe('selectRateForEdge', () => {
  it('matches the band that starts at the edge, not the one that ends there', () => {
    // Inclusive min, exclusive max — the same rule lib/vendor-rates encodes.
    expect(selectRateForEdge(RATES, { kind: 'print', longestEdge: 24, at: AT })?.id).toBe(
      'r-large'
    )
    expect(selectRateForEdge(RATES, { kind: 'print', longestEdge: 23, at: AT })?.id).toBe(
      'r-small'
    )
  })

  it('never crosses stages — a frame band does not price a print job', () => {
    expect(selectRateForEdge(RATES, { kind: 'frame', longestEdge: 36, at: AT })?.id).toBe(
      'r-frame'
    )
  })

  it('ignores a band that is not yet in force', () => {
    expect(selectRateForEdge(RATES, { kind: 'print', longestEdge: 60, at: AT })).toBeNull()
  })

  it('ignores a band that has expired', () => {
    const expired: VendorRateRow[] = [
      { ...RATES[1], effectiveTo: '2026-03-01T00:00:00.000Z' },
    ]
    expect(selectRateForEdge(expired, { kind: 'print', longestEdge: 36, at: AT })).toBeNull()
  })

  it('returns null rather than zero when nothing covers the size', () => {
    expect(selectRateForEdge([], { kind: 'print', longestEdge: 36, at: AT })).toBeNull()
  })
})

// ============================================================================
// The assign picker — capabilities, made visible
// ============================================================================

const CANDIDATES: VendorCandidate[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Kolkata Print Works',
    status: 'active',
    maxWidthInches: 40,
    maxHeightInches: 60,
    rate: RATES[1],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Salt Lake Giclee',
    status: 'active',
    maxWidthInches: 44,
    maxHeightInches: 44,
    rate: null,
  },
]

describe('VendorCandidateList', () => {
  const renderList = (overrides: Partial<React.ComponentProps<typeof VendorCandidateList>> = {}) =>
    render(
      <VendorCandidateList
        candidates={CANDIDATES}
        stage="print"
        longestEdge={36}
        isLoading={false}
        error={null}
        onRetry={noop}
        onAssign={asyncNoop}
        assigningVendorId={null}
        {...overrides}
      />
    )

  it('renders a skeleton while the candidates are being worked out', () => {
    renderList({ isLoading: true, candidates: [] })

    expect(screen.getByTestId('admin-production-candidates-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-candidates')).not.toBeInTheDocument()
  })

  it('renders an error with a retry when the candidate lookup failed', () => {
    renderList({ candidates: [], error: 'Failed to load vendors' })

    expect(screen.getByTestId('admin-production-candidates-error').textContent).toMatch(
      /failed to load vendors/i
    )
    expect(screen.getByTestId('admin-production-candidates-retry')).toBeInTheDocument()
  })

  /**
   * The empty state has to say WHY nobody is listed, because "no vendors" and
   * "no vendor big enough" call for completely different actions.
   */
  it('names the stage and the size when nobody can make it', () => {
    renderList({ candidates: [] })

    const empty = screen.getByTestId('admin-production-candidates-empty')
    expect(empty.textContent).toMatch(/print/i)
    expect(empty.textContent).toMatch(/36/)
  })

  it('lists each candidate with its rate for this size', () => {
    renderList()

    const row = screen.getByTestId(`admin-production-candidate-${CANDIDATES[0].id}`)
    expect(row.textContent).toMatch(/Kolkata Print Works/)
    expect(row.textContent).toMatch(/900/)
    expect(row.textContent).toMatch(/36/)
  })

  /**
   * A candidate the capability filter admits but the rate card does not price
   * would 422 on assignment. Saying so up front beats letting the admin find
   * out by pressing the button.
   */
  it('says a candidate has no rate for this size instead of showing a zero', () => {
    renderList()

    const row = screen.getByTestId(`admin-production-candidate-${CANDIDATES[1].id}`)
    expect(row.textContent).toMatch(/no rate/i)
    expect(row.textContent).not.toMatch(/₹0/)
  })

  it('assigns the vendor that was chosen', () => {
    const onAssign = vi.fn(async () => {})
    renderList({ onAssign })

    fireEvent.click(screen.getByTestId(`admin-production-assign-${CANDIDATES[0].id}`))

    expect(onAssign).toHaveBeenCalledWith(CANDIDATES[0].id)
  })

  /**
   * Assignment is reversible — reassigning simply reprices — so it does not get
   * the two-step confirm the destructive vendor actions use. What it does need
   * is a visible in-flight state: a second click while the first is running
   * would price the job twice.
   */
  it('disables the buttons while an assignment is in flight', () => {
    renderList({ assigningVendorId: CANDIDATES[0].id })

    expect(screen.getByTestId(`admin-production-assign-${CANDIDATES[0].id}`)).toBeDisabled()
    expect(screen.getByTestId(`admin-production-assign-${CANDIDATES[1].id}`)).toBeDisabled()
  })

  it('uses no native confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderList()

    fireEvent.click(screen.getByTestId(`admin-production-assign-${CANDIDATES[0].id}`))

    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

// ============================================================================
// The 422 — name the item and the size, because that IS the remedy
// ============================================================================

describe('AssignmentFailure', () => {
  it('renders nothing when there is no failure', () => {
    const { container } = render(
      <AssignmentFailure error={null} unpriced={[]} items={ITEMS} vendorName={null} />
    )

    expect(container.textContent).toBe('')
  })

  it('names each unpriced item and the size that needs a band', () => {
    render(
      <AssignmentFailure
        error="Kolkata Print Works has no rate covering 1 item(s) on this job"
        unpriced={[{ orderItemId: 'oi-2222', longestEdge: 36, size: '24x36' }]}
        items={ITEMS}
        vendorName="Kolkata Print Works"
      />
    )

    const failure = screen.getByTestId('admin-production-assign-error')
    expect(failure.textContent).toMatch(/24×36|24x36/)
    expect(failure.textContent).toMatch(/36/)
    expect(failure.textContent).toMatch(/Kolkata Print Works/)
  })

  /** The remedy in words, not just the diagnosis. */
  it('tells the admin to add a rate band for that size', () => {
    render(
      <AssignmentFailure
        error="Kolkata Print Works has no rate covering 1 item(s) on this job"
        unpriced={[{ orderItemId: 'oi-2222', longestEdge: 36, size: '24x36' }]}
        items={ITEMS}
        vendorName="Kolkata Print Works"
      />
    )

    expect(screen.getByTestId('admin-production-assign-error').textContent).toMatch(
      /rate band/i
    )
  })

  /**
   * An item whose variant has no dimensions comes back with a null size. That
   * is a different fault — the variant is gone — and must not be printed as a
   * blank or as a zero.
   */
  it('says the size is unknown when the variant carries no dimensions', () => {
    render(
      <AssignmentFailure
        error="Kolkata Print Works has no rate covering 1 item(s) on this job"
        unpriced={[{ orderItemId: 'oi-1111', longestEdge: null, size: null }]}
        items={[{ ...ITEMS[0], widthInches: null, heightInches: null, sizeLabel: null }]}
        vendorName="Kolkata Print Works"
      />
    )

    const failure = screen.getByTestId('admin-production-assign-error')
    expect(failure.textContent).toMatch(/unknown|no recorded size/i)
    expect(failure.textContent).not.toMatch(/0″/)
  })

  /** Never a generic banner: the whole point is that the size is actionable. */
  it('does not degrade to a generic message', () => {
    render(
      <AssignmentFailure
        error="Kolkata Print Works has no rate covering 1 item(s) on this job"
        unpriced={[{ orderItemId: 'oi-2222', longestEdge: 36, size: '24x36' }]}
        items={ITEMS}
        vendorName="Kolkata Print Works"
      />
    )

    expect(screen.getByTestId('admin-production-assign-error').textContent).not.toMatch(
      /something went wrong/i
    )
  })
})

// ============================================================================
// QC history — three rows, in order
// ============================================================================

/** As the API returns them: newest first. */
const REVIEWS: ProductionJobReview[] = [
  {
    id: 'rev-3',
    jobId: 'job-1',
    reviewerId: 'u1',
    verdict: 'pass',
    defects: null,
    notes: 'Reprint is clean.',
    createdAt: '2026-03-05T10:00:00.000Z',
  },
  {
    id: 'rev-2',
    jobId: 'job-1',
    reviewerId: 'u1',
    verdict: 'fail',
    defects: ['banding'],
    notes: 'Still banded across the sky.',
    createdAt: '2026-03-03T10:00:00.000Z',
  },
  {
    id: 'rev-1',
    jobId: 'job-1',
    reviewerId: 'u1',
    verdict: 'fail',
    defects: ['scuff', 'colour cast'],
    notes: 'Corner scuffed in transit.',
    createdAt: '2026-03-01T10:00:00.000Z',
  },
]

describe('sortReviewsOldestFirst', () => {
  it('reverses the API order so the history reads as a sequence', () => {
    expect(sortReviewsOldestFirst(REVIEWS).map((r) => r.id)).toEqual([
      'rev-1',
      'rev-2',
      'rev-3',
    ])
  })

  it('does not mutate what it was given', () => {
    const input = [...REVIEWS]
    sortReviewsOldestFirst(input)
    expect(input.map((r) => r.id)).toEqual(['rev-3', 'rev-2', 'rev-1'])
  })
})

describe('QcReviewHistory', () => {
  it('renders a skeleton while the job is loading', () => {
    render(<QcReviewHistory reviews={[]} isLoading error={null} />)

    expect(screen.getByTestId('admin-production-reviews-skeleton')).toBeInTheDocument()
  })

  it('renders an empty state when nothing has been inspected yet', () => {
    render(<QcReviewHistory reviews={[]} isLoading={false} error={null} />)

    expect(screen.getByTestId('admin-production-reviews-empty')).toBeInTheDocument()
  })

  it('renders an error rather than an empty history when the read failed', () => {
    render(<QcReviewHistory reviews={[]} isLoading={false} error="Failed to load job" />)

    expect(screen.getByTestId('admin-production-reviews-error')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-reviews-empty')).not.toBeInTheDocument()
  })

  /**
   * The ticket's own acceptance case: fail -> rework -> pass is THREE entries,
   * in that order. Collapsing to the latest verdict is what having a separate
   * reviews table exists to prevent.
   */
  it('shows every entry of a fail -> rework -> pass job, oldest first', () => {
    render(<QcReviewHistory reviews={REVIEWS} isLoading={false} error={null} />)

    const entries = screen.getAllByTestId(/^admin-production-review-/)
    expect(entries).toHaveLength(3)
    expect(entries.map((e) => e.getAttribute('data-testid'))).toEqual([
      'admin-production-review-rev-1',
      'admin-production-review-rev-2',
      'admin-production-review-rev-3',
    ])
  })

  it('spells each verdict out and keeps the defects with their entry', () => {
    render(<QcReviewHistory reviews={REVIEWS} isLoading={false} error={null} />)

    const first = screen.getByTestId('admin-production-review-rev-1')
    expect(first.textContent).toMatch(/fail/i)
    expect(first.textContent).toMatch(/scuff/)
    expect(first.textContent).toMatch(/colour cast/)

    const last = screen.getByTestId('admin-production-review-rev-3')
    expect(last.textContent).toMatch(/pass/i)
    expect(last.textContent).toMatch(/Reprint is clean/)
  })

  it('numbers the entries so the rework count is readable at a glance', () => {
    render(<QcReviewHistory reviews={REVIEWS} isLoading={false} error={null} />)

    expect(screen.getByTestId('admin-production-reviews').textContent).toMatch(/3/)
  })
})

// ============================================================================
// The QC review form
// ============================================================================

describe('QcReviewForm', () => {
  it('submits a pass with notes and no defects', () => {
    const onSubmit = vi.fn(async () => {})
    render(<QcReviewForm status="qc_submitted" onSubmit={onSubmit} isSubmitting={false} error={null} />)

    fireEvent.change(screen.getByTestId('admin-production-review-notes'), {
      target: { value: 'Looks right.' },
    })
    fireEvent.submit(screen.getByTestId('admin-production-review-form'))

    expect(onSubmit).toHaveBeenCalledWith({
      verdict: 'pass',
      defects: [],
      notes: 'Looks right.',
    })
  })

  it('splits the free-text defects into the array the API takes', () => {
    const onSubmit = vi.fn(async () => {})
    render(<QcReviewForm status="qc_submitted" onSubmit={onSubmit} isSubmitting={false} error={null} />)

    fireEvent.change(screen.getByTestId('admin-production-review-verdict'), {
      target: { value: 'fail' },
    })
    fireEvent.change(screen.getByTestId('admin-production-review-defects'), {
      target: { value: 'banding, corner scuff ,,' },
    })
    fireEvent.submit(screen.getByTestId('admin-production-review-form'))

    expect(onSubmit).toHaveBeenCalledWith({
      verdict: 'fail',
      defects: ['banding', 'corner scuff'],
      notes: '',
    })
  })

  it('shows the submit failure instead of swallowing it', () => {
    render(
      <QcReviewForm status="qc_submitted" onSubmit={asyncNoop} isSubmitting={false} error="Failed to record review" />
    )

    expect(screen.getByTestId('admin-production-review-error').textContent).toMatch(
      /failed to record review/i
    )
  })

  it('blocks a double submission while one is in flight', () => {
    render(<QcReviewForm status="qc_submitted" onSubmit={asyncNoop} isSubmitting error={null} />)

    expect(screen.getByTestId('admin-production-review-submit')).toBeDisabled()
  })
})

// ============================================================================
// The transition panel — the matrix, rendered
// ============================================================================

/**
 * The screen used to carry a plain `<select>` over all seven statuses it knew
 * about, which offered `draft -> dispatched` and every other move the state
 * machine refuses. The panel below is built from `nextStatuses(status, 'admin')`
 * instead, so an edge added to the matrix appears here and an edge removed from
 * it disappears, without anybody editing this screen.
 *
 * `qc_passed` and `qc_failed` are subtracted, and that subtraction is not a
 * second opinion about the matrix: `PATCH /:jobId` does not even parse them —
 * a verdict with no review row is a verdict with no evidence — so the verdict
 * form below is the only route to them.
 */
describe('TransitionPanel', () => {
  const renderPanel = (
    overrides: Partial<React.ComponentProps<typeof TransitionPanel>> = {}
  ) =>
    render(
      <TransitionPanel
        status="draft"
        onTransition={asyncNoop}
        pendingStatus={null}
        refusal={null}
        error={null}
        {...overrides}
      />
    )

  const offered = () =>
    screen
      .queryAllByTestId(/^admin-production-transition-to-/)
      .map((node) => node.getAttribute('data-testid')?.replace('admin-production-transition-to-', ''))

  /**
   * What the panel offers, written out longhand.
   *
   * The two tests that stood here both derived their expectation from the
   * component's own expression — one called `patchableNextStatuses(status,
   * 'admin')`, which is the line under test verbatim, and the other inlined that
   * function's body, which is the same derivation with the call removed. Either
   * passes whatever the screen computes; between them they could catch a
   * hardcoded list and nothing else, least of all a wrong derivation.
   *
   * `packages/shared/tests/schemas/production-transitions.test.ts` is the
   * pattern, and says why: "a test that recomputes what it is checking passes
   * whatever the code does". This is that table again, one level up, at the
   * buttons a person can actually press.
   */
  const OFFERED_BY_STATUS: Record<ProductionJobStatus, ProductionJobStatus[]> = {
    draft: ['assigned', 'cancelled'],
    // The self-edge is reassignment, and it is a real move an admin makes.
    assigned: ['assigned', 'cancelled'],
    // Retired: nothing reaches it and nothing leaves it.
    sent: [],
    // `received -> qc_submitted` is the vendor's, taken in their portal.
    received: ['cancelled'],
    // Both verdicts are legal from here and NEITHER is a button: PATCH does not
    // parse them, so cancelling is all that is left on this control.
    qc_submitted: ['cancelled'],
    // The overturn to `qc_failed` belongs to the verdict form; despatch carries
    // a guard PATCH does evaluate, so it stays pressable.
    qc_passed: ['dispatched', 'cancelled'],
    qc_failed: ['assigned', 'cancelled'],
    dispatched: [],
    cancelled: [],
  }

  it('offers exactly these buttons, status by status', () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      cleanup()
      renderPanel({ status })

      expect(offered()).toEqual(OFFERED_BY_STATUS[status])
    }
  })

  /**
   * The table above is only a specification while it covers the vocabulary. A
   * status added to the pgEnum and to the matrix has to be argued about here,
   * not silently indexed as `undefined`.
   */
  it('has a written-out expectation for every status in the enum', () => {
    expect(Object.keys(OFFERED_BY_STATUS).sort()).toEqual(
      [...PRODUCTION_JOB_STATUSES].sort()
    )
  })

  it('never offers qc_passed or qc_failed, which belong to the verdict form', () => {
    renderPanel({ status: 'qc_submitted' })

    expect(screen.queryByTestId('admin-production-transition-to-qc_passed')).toBeNull()
    expect(screen.queryByTestId('admin-production-transition-to-qc_failed')).toBeNull()
    // ...and says where they ARE taken, rather than leaving a hole.
    expect(screen.getByTestId('admin-production-transitions').textContent).toMatch(
      /verdict/i
    )
  })

  /** A terminal status gets a sentence. An empty dropdown is not an answer. */
  it('renders a sentence rather than an empty control for a terminal status', () => {
    for (const status of ['dispatched', 'cancelled'] as const) {
      cleanup()
      renderPanel({ status })

      const terminal = screen.getByTestId('admin-production-transition-terminal')
      expect(terminal.textContent).toMatch(/[a-z]{4,}/i)
      expect(offered()).toEqual([])
    }
  })

  /**
   * `sent` is retired, not terminal: nothing reaches it and nothing leaves it.
   * Rows still carry it, so the screen has to say something true about one.
   */
  it('renders a sentence for a retired status nothing can leave', () => {
    renderPanel({ status: 'sent' })

    expect(screen.getByTestId('admin-production-transition-none')).toBeInTheDocument()
    expect(offered()).toEqual([])
  })

  it('moves the job to the status that was pressed', () => {
    const onTransition = vi.fn(async () => {})
    renderPanel({ status: 'received', onTransition })

    fireEvent.click(screen.getByTestId('admin-production-transition-to-cancelled'))

    expect(onTransition).toHaveBeenCalledWith('cancelled')
  })

  /**
   * `draft -> assigned` carries the `priced-from-rate-card` guard, which PATCH
   * cannot evaluate — it takes no vendor, so there is no rate card to price
   * against. Pressing it would spend a round trip on a 409 the client could
   * have predicted, so the edge is shown, disabled, and says where it is taken.
   */
  it('shows a guarded edge PATCH cannot evaluate without letting it be pressed', () => {
    const onTransition = vi.fn(async () => {})
    renderPanel({ status: 'draft', onTransition })

    const button = screen.getByTestId('admin-production-transition-to-assigned')
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(onTransition).not.toHaveBeenCalled()

    expect(screen.getByTestId('admin-production-transition-guard-assigned').textContent).toMatch(
      /assign/i
    )
  })

  /** `open-transfer-or-order-label` IS evaluable by PATCH, so it stays live. */
  it('keeps an edge whose guard the PATCH route does evaluate pressable', () => {
    const onTransition = vi.fn(async () => {})
    renderPanel({ status: 'qc_passed', onTransition })

    const button = screen.getByTestId('admin-production-transition-to-dispatched')
    expect(button).not.toBeDisabled()

    fireEvent.click(button)
    expect(onTransition).toHaveBeenCalledWith('dispatched')
  })

  it('locks every target while one move is in flight', () => {
    renderPanel({ status: 'qc_passed', pendingStatus: 'dispatched' })

    expect(screen.getByTestId('admin-production-transition-to-cancelled')).toBeDisabled()
  })

  /**
   * A write that failed for a reason no refusal body can carry belongs beside
   * the button that caused it. The page banner is gated on a successful READ, so
   * putting it there would blank a job that had loaded perfectly.
   */
  it('shows a failed write beside the buttons, with the job still offered', () => {
    renderPanel({ status: 'received', error: 'Unauthorized' })

    expect(screen.getByTestId('admin-production-transition-error').textContent).toMatch(
      /unauthorized/i
    )
    expect(offered()).toEqual(['cancelled'])
  })

  it('uses no native confirm or alert', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderPanel({ status: 'received' })

    fireEvent.click(screen.getByTestId('admin-production-transition-to-cancelled'))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })
})

// ============================================================================
// The 409 — the remedy is in the body, so no second round trip
// ============================================================================

describe('TransitionRefusal', () => {
  it('renders nothing when the last move was not refused', () => {
    const { container } = render(<TransitionRefusal refusal={null} />)

    expect(container.textContent).toBe('')
  })

  /**
   * `{ error, code, from, to, allowed }` exists precisely so the screen can say
   * what was attempted and what would have worked without asking again.
   */
  it('names the attempted move and what was allowed instead', () => {
    render(
      <TransitionRefusal
        refusal={{
          error:
            "Cannot move a production job from 'received' to 'dispatched' as admin.",
          code: 'ILLEGAL_TRANSITION',
          from: 'received',
          to: 'dispatched',
          allowed: ['cancelled'],
        }}
      />
    )

    const refusal = screen.getByTestId('admin-production-transition-refusal')
    expect(refusal.textContent).toMatch(/received/i)
    expect(refusal.textContent).toMatch(/dispatched/i)
    expect(refusal.textContent).toMatch(/cancelled/i)
  })

  /**
   * The assertion here used to be `toMatch(/nowhere|not|no move/i)`, which every
   * refusal satisfies: each one opens with "Nothing was written.", and
   * "Nothing" matches `/not/i`. It passed whichever of the two branches
   * rendered — and it was the only test guarding the choice between them.
   *
   * `ILLEGAL_TRANSITION` is the one code whose `allowed` is computed
   * (`ProductionTransitionError.toResponseBody()` fills it from
   * `nextStatuses(from, actor)`), so an empty array under it does mean nowhere.
   */
  it('says the job is stuck only when the code enumerates the alternatives', () => {
    render(
      <TransitionRefusal
        refusal={{
          error: 'A job in dispatched cannot be moved by this actor at all.',
          code: 'ILLEGAL_TRANSITION',
          from: 'dispatched',
          to: 'cancelled',
          allowed: [],
        }}
      />
    )

    expect(screen.getByTestId('admin-production-refusal-nowhere').textContent).toMatch(
      /nowhere this job can be moved from dispatched/i
    )
    expect(screen.queryByTestId('admin-production-refusal-this-edge')).toBeNull()
  })

  /**
   * `assertGuardSatisfied` writes `allowed: []` as a LITERAL beside a fact about
   * one edge, and it means "not through this edge" — not "nowhere". The
   * scenario: a `qc_passed` job on no open transfer whose order carries no
   * label. "Move to dispatched" is live, because PATCH does evaluate
   * `open-transfer-or-order-label`; pressing it used to make the panel declare
   * the job permanently stuck while its own "Move to cancelled" button sat two
   * lines above.
   */
  it('does not call the job stuck when the empty list is only about this edge', () => {
    render(
      <TransitionRefusal
        refusal={{
          error:
            'This job is on no open transfer and its order carries no shipping label.',
          code: 'GUARD_UNSATISFIED',
          guard: 'open-transfer-or-order-label',
          from: 'qc_passed',
          to: 'dispatched',
          allowed: [],
        }}
      />
    )

    expect(screen.queryByTestId('admin-production-refusal-nowhere')).toBeNull()
    expect(screen.getByTestId('admin-production-refusal-this-edge').textContent).toMatch(
      /still open/i
    )
  })

  /** Two refusals can be on screen at once, so the id has to be addressable. */
  it('takes the id of the panel it belongs to', () => {
    render(
      <TransitionRefusal
        testId="admin-production-review-refusal"
        refusal={{
          error: 'This job is already settled and can no longer be inspected here.',
          code: 'JOB_SETTLED',
          from: 'qc_submitted',
          to: 'qc_passed',
          allowed: [],
        }}
      />
    )

    expect(screen.getByTestId('admin-production-review-refusal')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-transition-refusal')).toBeNull()
  })

  /**
   * Phase 3's fix: a guarded edge PATCH cannot evaluate is refused with the
   * route that owns it. Rendering the code and dropping the route would leave
   * the admin with a refusal and no next step.
   */
  it('names the route that owns a guard this one could not evaluate', () => {
    render(
      <TransitionRefusal
        refusal={{
          error:
            "Moving a job from 'draft' to 'assigned' has to satisfy the 'priced-from-rate-card' guard, which this route cannot evaluate.",
          code: 'GUARD_NOT_EVALUABLE_HERE',
          guard: 'priced-from-rate-card',
          route: 'POST /api/admin/production/:jobId/assign',
          from: 'draft',
          to: 'assigned',
          allowed: [],
        }}
      />
    )

    const refusal = screen.getByTestId('admin-production-transition-refusal')
    expect(refusal.textContent).toMatch(/POST \/api\/admin\/production\/:jobId\/assign/)
    expect(refusal.textContent).toMatch(/priced-from-rate-card/)
    // Its `allowed: []` is a literal about this edge, not a survey of the job.
    expect(screen.queryByTestId('admin-production-refusal-nowhere')).toBeNull()
  })
})

// ============================================================================
// The shot list — every slot the stage asks for, with its live photograph
// ============================================================================

const PRINT_SHOTS: QcShotEntry[] = [
  {
    slot: 'print_full',
    label: 'The whole print, flat and front-on',
    required: true,
    onShotList: true,
    photo: {
      id: 'ph-1',
      url: 'https://r2.example/signed/print_full',
      contentType: 'image/jpeg',
      sizeBytes: 2_400_000,
      uploadedBy: 'vendor-user',
      uploadedAt: '2026-03-02T09:00:00.000Z',
      reviewId: 'rev-1',
    },
  },
  {
    slot: 'print_colour_reference',
    label: 'The print beside the colour reference',
    required: true,
    onShotList: true,
    photo: null,
  },
  {
    slot: 'legacy_slot',
    label: 'Uploaded outside the print shot list',
    required: false,
    onShotList: false,
    photo: {
      id: 'ph-9',
      url: 'https://r2.example/signed/legacy',
      contentType: 'image/png',
      sizeBytes: 900_000,
      uploadedBy: 'vendor-user',
      uploadedAt: '2026-03-02T09:05:00.000Z',
      reviewId: null,
    },
  },
]

describe('QcShotList', () => {
  const renderShots = (overrides: Partial<React.ComponentProps<typeof QcShotList>> = {}) =>
    render(
      <QcShotList
        shots={PRINT_SHOTS}
        missingRequiredSlots={['print_colour_reference']}
        reviewCount={1}
        isLoading={false}
        error={null}
        onRetry={noop}
        {...overrides}
      />
    )

  it('renders a skeleton while the photos are being read', () => {
    renderShots({ isLoading: true, shots: [] })

    expect(screen.getByTestId('admin-production-photos-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-photos')).toBeNull()
  })

  it('renders an error with a retry rather than an empty shot list', () => {
    renderShots({ shots: [], error: 'Failed to load the photos' })

    expect(screen.getByTestId('admin-production-photos-error').textContent).toMatch(
      /failed to load the photos/i
    )
    expect(screen.getByTestId('admin-production-photos-retry')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-photos-empty')).toBeNull()
  })

  it('renders an empty state when the stage asks for nothing', () => {
    renderShots({ shots: [], missingRequiredSlots: [] })

    expect(screen.getByTestId('admin-production-photos-empty')).toBeInTheDocument()
  })

  it('renders one entry per slot, each with its live photograph', () => {
    renderShots()

    const shot = screen.getByTestId('admin-production-shot-print_full')
    const image = shot.querySelector('img')
    expect(image?.getAttribute('src')).toBe('https://r2.example/signed/print_full')
    expect(image?.getAttribute('alt')).toMatch(/whole print/i)
  })

  /** A required slot with no photo is the reviewer's one actionable fact. */
  it('names a required slot that has not been photographed', () => {
    renderShots()

    const shot = screen.getByTestId('admin-production-shot-print_colour_reference')
    expect(shot.querySelector('img')).toBeNull()
    expect(shot.textContent).toMatch(/not.*photograph|missing|awaited/i)
    expect(shot.textContent).toMatch(/required/i)
  })

  it('flags a photo uploaded outside the shot list rather than hiding it', () => {
    renderShots()

    expect(screen.getByTestId('admin-production-shot-legacy_slot').textContent).toMatch(
      /outside/i
    )
  })

  /**
   * `review_id` records the FIRST verdict that judged a shot; the API stamps
   * only where it is still NULL so an overturn cannot destroy the record of
   * what the approving review saw. The consequence is that a later verdict
   * leaves no mark here at all, and the screen has to say so rather than let
   * the stamp read as "the current verdict".
   */
  it('says which verdict claimed a shot, and that later ones do not re-stamp it', () => {
    renderShots({ reviewCount: 2 })

    const shot = screen.getByTestId('admin-production-shot-print_full')
    expect(shot.textContent).toMatch(/rev-1|inspection/i)
    expect(screen.getByTestId('admin-production-photos').textContent).toMatch(
      /re-?stamp|first|earlier/i
    )
  })
})

// ============================================================================
// Defect chips — and the fail that cannot be submitted without one
// ============================================================================

describe('QcReviewForm — defects', () => {
  /**
   * The API refuses a fail with no defect (400, `A failing verdict must name at
   * least one defect`), because the vendor cannot act on it. A client that lets
   * the button be pressed spends a round trip finding that out.
   */
  it('cannot submit a fail with no defect', () => {
    const onSubmit = vi.fn(async () => {})
    render(<QcReviewForm status="qc_submitted" onSubmit={onSubmit} isSubmitting={false} error={null} />)

    fireEvent.change(screen.getByTestId('admin-production-review-verdict'), {
      target: { value: 'fail' },
    })

    expect(screen.getByTestId('admin-production-review-submit')).toBeDisabled()
    expect(screen.getByTestId('admin-production-review-defects-required')).toBeInTheDocument()

    fireEvent.submit(screen.getByTestId('admin-production-review-form'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lets a pass through with no defect at all', () => {
    const onSubmit = vi.fn(async () => {})
    render(<QcReviewForm status="qc_submitted" onSubmit={onSubmit} isSubmitting={false} error={null} />)

    expect(screen.getByTestId('admin-production-review-submit')).not.toBeDisabled()
    expect(screen.queryByTestId('admin-production-review-defects-required')).toBeNull()

    fireEvent.submit(screen.getByTestId('admin-production-review-form'))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('submits a fail once a defect chip is chosen', () => {
    const onSubmit = vi.fn(async () => {})
    render(<QcReviewForm status="qc_submitted" onSubmit={onSubmit} isSubmitting={false} error={null} />)

    fireEvent.change(screen.getByTestId('admin-production-review-verdict'), {
      target: { value: 'fail' },
    })
    fireEvent.click(screen.getByTestId(`admin-production-review-chip-${QC_DEFECT_CHIPS[0]}`))

    expect(screen.getByTestId('admin-production-review-submit')).not.toBeDisabled()

    fireEvent.submit(screen.getByTestId('admin-production-review-form'))

    expect(onSubmit).toHaveBeenCalledWith({
      verdict: 'fail',
      defects: [QC_DEFECT_CHIPS[0]],
      notes: '',
    })
  })

  it('toggles a chip back off', () => {
    const onSubmit = vi.fn(async () => {})
    render(<QcReviewForm status="qc_submitted" onSubmit={onSubmit} isSubmitting={false} error={null} />)

    fireEvent.change(screen.getByTestId('admin-production-review-verdict'), {
      target: { value: 'fail' },
    })
    const chip = screen.getByTestId(`admin-production-review-chip-${QC_DEFECT_CHIPS[0]}`)
    fireEvent.click(chip)
    fireEvent.click(chip)

    expect(screen.getByTestId('admin-production-review-submit')).toBeDisabled()
  })

  /** Chips are a shortcut over the same array, not a second field. */
  it('merges chips with the free text and drops a duplicate', () => {
    const onSubmit = vi.fn(async () => {})
    render(<QcReviewForm status="qc_submitted" onSubmit={onSubmit} isSubmitting={false} error={null} />)

    fireEvent.change(screen.getByTestId('admin-production-review-verdict'), {
      target: { value: 'fail' },
    })
    fireEvent.click(screen.getByTestId(`admin-production-review-chip-${QC_DEFECT_CHIPS[0]}`))
    fireEvent.change(screen.getByTestId('admin-production-review-defects'), {
      target: { value: `${QC_DEFECT_CHIPS[0]}, mitre gap` },
    })
    fireEvent.submit(screen.getByTestId('admin-production-review-form'))

    expect(onSubmit).toHaveBeenCalledWith({
      verdict: 'fail',
      defects: [QC_DEFECT_CHIPS[0], 'mitre gap'],
      notes: '',
    })
  })

  it('never reaches for a native alert to refuse the submission', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<QcReviewForm status="qc_submitted" onSubmit={asyncNoop} isSubmitting={false} error={null} />)

    fireEvent.change(screen.getByTestId('admin-production-review-verdict'), {
      target: { value: 'fail' },
    })
    fireEvent.submit(screen.getByTestId('admin-production-review-form'))

    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })
})

// ============================================================================
// The overturn — two rows, both of them real
// ============================================================================

/**
 * `qc_passed -> qc_failed` is in the matrix precisely so a supervisor
 * re-inspecting and overturning leaves a SECOND row while the first survives.
 * Collapsing to the latest verdict would delete the disagreement, which is the
 * one thing a dispute is about.
 */
const OVERTURN: ProductionJobReview[] = [
  {
    id: 'rev-b',
    jobId: 'job-1',
    reviewerId: 'supervisor',
    verdict: 'fail',
    defects: ['mitre gap'],
    notes: 'Overturned on a second look.',
    createdAt: '2026-03-04T10:00:00.000Z',
  },
  {
    id: 'rev-a',
    jobId: 'job-1',
    reviewerId: 'reviewer',
    verdict: 'pass',
    defects: null,
    notes: 'Looked fine to me.',
    createdAt: '2026-03-04T09:00:00.000Z',
  },
]

describe('QcReviewHistory — an overturn', () => {
  it('renders both verdicts, the approval first', () => {
    render(<QcReviewHistory reviews={OVERTURN} isLoading={false} error={null} />)

    const entries = screen.getAllByTestId(/^admin-production-review-rev-/)
    expect(entries.map((e) => e.getAttribute('data-testid'))).toEqual([
      'admin-production-review-rev-a',
      'admin-production-review-rev-b',
    ])

    expect(screen.getByTestId('admin-production-review-rev-a').textContent).toMatch(/pass/i)
    expect(screen.getByTestId('admin-production-review-rev-b').textContent).toMatch(/fail/i)
    expect(screen.getByTestId('admin-production-review-rev-a').textContent).toMatch(
      /Looked fine to me/
    )
  })

  it('marks the second verdict as overturning the one above it', () => {
    render(<QcReviewHistory reviews={OVERTURN} isLoading={false} error={null} />)

    expect(screen.getByTestId('admin-production-review-overturn-rev-b')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-review-overturn-rev-a')).toBeNull()
  })
})

// ============================================================================
// The verdict form — the OTHER half of the same subtraction
// ============================================================================

/**
 * `POST /:jobId/reviews` calls `assertTransition(from, to, 'admin')` before it
 * writes anything, so a verdict the matrix has no edge for is a 409 and nothing
 * else. The form used to render on every status with Pass preselected: on a
 * `qc_passed` job "Record inspection" asked for `qc_passed -> qc_passed`, an
 * edge that does not exist, and on a draft, assigned, received or terminal job
 * BOTH options were refusals the screen could have predicted.
 */
describe('QcReviewForm — the verdicts the matrix allows', () => {
  /**
   * Written out longhand, for the same reason the button table above is: a
   * derived expectation would agree with whatever `availableVerdicts` computes.
   */
  const VERDICTS_BY_STATUS: Record<ProductionJobStatus, Array<'pass' | 'fail'>> = {
    draft: [],
    assigned: [],
    sent: [],
    // Nothing has been submitted for inspection, so there is nothing to judge.
    received: [],
    qc_submitted: ['pass', 'fail'],
    // Only the overturn. `qc_passed -> qc_passed` is not an edge.
    qc_passed: ['fail'],
    // A failed job goes back to the vendor; it is not re-judged from here.
    qc_failed: [],
    dispatched: [],
    cancelled: [],
  }

  const optionValues = () =>
    Array.from(
      screen.getByTestId('admin-production-review-verdict').querySelectorAll('option')
    ).map((option) => option.getAttribute('value'))

  it('offers exactly these verdicts, status by status', () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      cleanup()
      render(
        <QcReviewForm
          status={status}
          onSubmit={asyncNoop}
          isSubmitting={false}
          error={null}
        />
      )

      const expected = VERDICTS_BY_STATUS[status]

      if (expected.length === 0) {
        expect(screen.queryByTestId('admin-production-review-form')).toBeNull()
        expect(screen.getByTestId('admin-production-review-unavailable')).toBeInTheDocument()
      } else {
        expect(optionValues()).toEqual(expected)
      }
    }
  })

  it('has a written-out expectation for every status in the enum', () => {
    expect(Object.keys(VERDICTS_BY_STATUS).sort()).toEqual(
      [...PRODUCTION_JOB_STATUSES].sort()
    )
  })

  /**
   * The default used to be Pass on every status. On a passed job that is the one
   * verdict the matrix has no edge for, so the untouched form's own submit
   * button was a 409.
   */
  it('never preselects a verdict the matrix has no edge for', () => {
    const onSubmit = vi.fn(async () => {})
    render(
      <QcReviewForm status="qc_passed" onSubmit={onSubmit} isSubmitting={false} error={null} />
    )

    expect(
      (screen.getByTestId('admin-production-review-verdict') as HTMLSelectElement).value
    ).toBe('fail')

    fireEvent.click(screen.getByTestId(`admin-production-review-chip-${QC_DEFECT_CHIPS[0]}`))
    fireEvent.submit(screen.getByTestId('admin-production-review-form'))

    expect(onSubmit).toHaveBeenCalledWith({
      verdict: 'fail',
      defects: [QC_DEFECT_CHIPS[0]],
      notes: '',
    })
  })

  it('says which verdict is the only one open, rather than hiding the other', () => {
    render(
      <QcReviewForm status="qc_passed" onSubmit={asyncNoop} isSubmitting={false} error={null} />
    )

    expect(screen.getByTestId('admin-production-review-only-verdict').textContent).toMatch(
      /QC failed/
    )
  })

  it('names the status when nothing can be inspected, instead of a form that 409s', () => {
    render(
      <QcReviewForm status="draft" onSubmit={asyncNoop} isSubmitting={false} error={null} />
    )

    expect(screen.getByTestId('admin-production-review-unavailable').textContent).toMatch(
      /draft/i
    )
  })
})

// ============================================================================
// The composed page — where D1, D2 and D4 live
// ============================================================================

/**
 * Every suite above renders one exported component. Three of the defects this
 * file now pins are not IN one: which status the verdict form is handed, how a
 * refused review is parsed, and where a failed write is put. Rendering
 * `Route.component` once, over a stubbed `fetch`, closes that whole gap — and
 * costs less than exporting three handlers to test them in isolation, which
 * would also stop testing the wiring, which is exactly where the bugs were.
 */
const JOB_ID = 'job-under-test'

const Page = (Route as unknown as { component: () => React.ReactElement }).component

const jobDetail = (status: ProductionJobStatus) => ({
  job: {
    id: JOB_ID,
    orderId: 'order-1',
    stage: 'print',
    status,
    vendorId: null,
    assignedAt: null,
    sentAt: null,
    dueAt: null,
    receivedAt: null,
    amountExpected: '1200.00',
    amountActual: null,
    settlementId: null,
    createdBy: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  items: [
    {
      id: 'item-1',
      orderItemId: 'order-item-1',
      quantity: 1,
      widthInches: 12,
      heightInches: 18,
      sizeLabel: '12 × 18 in',
    },
  ],
  reviews: [],
  payableAmount: '1200.00',
})

/** The same payload with the assign-refusal fields moved off their defaults. */
const jobDetailWith = (
  status: ProductionJobStatus,
  over: { settlementId?: string | null; amountActual?: string | null }
) => {
  const base = jobDetail(status)
  return { ...base, job: { ...base.job, ...over } }
}

const jsonResponse = (ok: boolean, status: number, body: unknown) =>
  ({ ok, status, json: async () => body }) as Response

/** GETs answer from the fixtures; the one write under test answers from `write`. */
function stubApi(options: {
  detail?: () => Response
  write?: () => Response
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (method !== 'GET') {
      return options.write?.() ?? jsonResponse(true, 200, {})
    }
    if (url.includes('/photos')) {
      return jsonResponse(true, 200, {
        jobId: JOB_ID,
        stage: 'print',
        status: 'qc_submitted',
        shots: [],
        missingRequiredSlots: [],
        expiresAt: '2026-07-01T00:05:00.000Z',
      })
    }
    if (url.includes('/api/admin/vendors')) {
      return jsonResponse(true, 200, { items: [] })
    }
    return options.detail?.() ?? jsonResponse(true, 200, jobDetail('qc_submitted'))
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AdminProductionJobPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * The Assign section used to render for any job that loaded, applying neither
   * guard the queue applies. Opening a `dispatched` or settled job listed
   * vendors with live Assign buttons whose only outcome was a 409 — and
   * `settlementId` was on the payload the whole time.
   */
  it.each([
    ['dispatched', () => jobDetail('dispatched'), /cannot be assigned from its current status/i],
    [
      'settled',
      () => jobDetailWith('draft', { settlementId: 'settlement-1' }),
      /has been settled/i,
    ],
    [
      'negotiated',
      () => jobDetailWith('assigned', { amountActual: '350.00' }),
      /negotiated amount/i,
    ],
  ])('offers no vendor to assign a %s job, and says why', async (_name, detail, message) => {
    stubApi({ detail: () => jsonResponse(true, 200, detail()) })

    render(<Page />)
    await screen.findByTestId('admin-production-items')

    expect(screen.getByTestId('admin-production-assign-refusal').textContent).toMatch(
      message
    )
    expect(screen.queryByTestId('admin-production-candidates')).toBeNull()
    expect(screen.queryByTestId('admin-production-candidates-empty')).toBeNull()
    expect(screen.queryByTestId('admin-production-candidates-skeleton')).toBeNull()
  })

  it('still offers vendors on a job an admin can assign', async () => {
    stubApi({ detail: () => jsonResponse(true, 200, jobDetail('draft')) })

    render(<Page />)
    await screen.findByTestId('admin-production-items')

    expect(screen.queryByTestId('admin-production-assign-refusal')).toBeNull()
    await screen.findByTestId('admin-production-candidates-empty')
  })

  /**
   * D4. A session expires; the 401 body carries no `code`/`from`/`to`, so it
   * falls past the refusal branch. Routing it to the page error blanked the
   * summary, the items, the photographs and the QC history at once — because
   * the body is gated on `!error` — despite the job having been read perfectly.
   */
  it('keeps a job that loaded fine on screen when a transition write fails', async () => {
    stubApi({
      detail: () => jsonResponse(true, 200, jobDetail('received')),
      write: () => jsonResponse(false, 401, { error: 'Unauthorized' }),
    })

    render(<Page />)
    await screen.findByTestId('admin-production-items')

    fireEvent.click(screen.getByTestId('admin-production-transition-to-cancelled'))

    expect(
      (await screen.findByTestId('admin-production-transition-error')).textContent
    ).toMatch(/unauthorized/i)
    expect(screen.getByTestId('admin-production-items')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-production-detail-error')).toBeNull()
  })

  /** A failed READ is a different thing, and still takes the job down with it. */
  it('still blanks the job when the read itself fails', async () => {
    stubApi({
      detail: () => jsonResponse(false, 500, { error: 'Failed to load the production job' }),
    })

    render(<Page />)

    await screen.findByTestId('admin-production-detail-error')
    expect(screen.queryByTestId('admin-production-items')).toBeNull()
  })

  /**
   * D2. The reviews route is the ONLY way to `qc_passed` and `qc_failed`, and it
   * refuses with the same `{ error, code, from, to, allowed }` PATCH does.
   * Flattening it to `body.error` left the one route with no alternative as the
   * one route whose remedy was thrown away.
   */
  it('renders a refused verdict with its from, to and allowed, not a bare string', async () => {
    stubApi({
      detail: () => jsonResponse(true, 200, jobDetail('qc_submitted')),
      write: () =>
        jsonResponse(false, 409, {
          error: "Cannot move a production job from 'qc_passed' to 'qc_passed' as admin.",
          code: 'ILLEGAL_TRANSITION',
          from: 'qc_passed',
          to: 'qc_passed',
          allowed: ['qc_failed', 'dispatched', 'cancelled'],
        }),
    })

    render(<Page />)
    fireEvent.submit(await screen.findByTestId('admin-production-review-form'))

    const refusal = await screen.findByTestId('admin-production-review-refusal')
    expect(refusal.textContent).toMatch(/QC passed/)
    expect(refusal.textContent).toMatch(/Dispatched by vendor/)
    expect(screen.queryByTestId('admin-production-review-error')).toBeNull()
  })

  /** D1, composed: the form is handed the job's live status, not a default. */
  it('offers no verdict form on a job the matrix has no verdict edge from', async () => {
    stubApi({ detail: () => jsonResponse(true, 200, jobDetail('received')) })

    render(<Page />)

    await screen.findByTestId('admin-production-review-unavailable')
    expect(screen.queryByTestId('admin-production-review-form')).toBeNull()
  })

  it('offers only the overturn on a job that has already passed', async () => {
    stubApi({ detail: () => jsonResponse(true, 200, jobDetail('qc_passed')) })

    render(<Page />)

    const select = (await screen.findByTestId(
      'admin-production-review-verdict'
    )) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('fail'))
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.value)).toEqual([
      'fail',
    ])
  })
})
