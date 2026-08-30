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
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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
  VERDICT_ONLY_STATUSES,
  nextStatuses,
  patchableNextStatuses,
} from '@chobii/shared'

import {
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
    render(<QcReviewForm onSubmit={onSubmit} isSubmitting={false} error={null} />)

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
    render(<QcReviewForm onSubmit={onSubmit} isSubmitting={false} error={null} />)

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
      <QcReviewForm onSubmit={asyncNoop} isSubmitting={false} error="Failed to record review" />
    )

    expect(screen.getByTestId('admin-production-review-error').textContent).toMatch(
      /failed to record review/i
    )
  })

  it('blocks a double submission while one is in flight', () => {
    render(<QcReviewForm onSubmit={asyncNoop} isSubmitting error={null} />)

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
        {...overrides}
      />
    )

  const offered = () =>
    screen
      .queryAllByTestId(/^admin-production-transition-to-/)
      .map((node) => node.getAttribute('data-testid')?.replace('admin-production-transition-to-', ''))

  it('offers exactly the matrix edges an admin may take, for every status', () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      cleanup()
      renderPanel({ status })

      expect(offered()).toEqual(patchableNextStatuses(status, 'admin'))
    }
  })

  /**
   * The subtraction, stated the other way round so it cannot pass vacuously:
   * what is offered is the matrix minus the two verdicts, never a third list.
   */
  it('offers the matrix minus the verdict-only statuses, and nothing else', () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      cleanup()
      renderPanel({ status })

      expect(offered()).toEqual(
        nextStatuses(status, 'admin').filter((to) => !VERDICT_ONLY_STATUSES.includes(to))
      )
    }
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

  it('says so in words when the actor may not move the job at all', () => {
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

    const refusal = screen.getByTestId('admin-production-transition-refusal')
    expect(refusal.textContent).toMatch(/nowhere|not|no move/i)
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
    render(<QcReviewForm onSubmit={onSubmit} isSubmitting={false} error={null} />)

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
    render(<QcReviewForm onSubmit={onSubmit} isSubmitting={false} error={null} />)

    expect(screen.getByTestId('admin-production-review-submit')).not.toBeDisabled()
    expect(screen.queryByTestId('admin-production-review-defects-required')).toBeNull()

    fireEvent.submit(screen.getByTestId('admin-production-review-form'))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('submits a fail once a defect chip is chosen', () => {
    const onSubmit = vi.fn(async () => {})
    render(<QcReviewForm onSubmit={onSubmit} isSubmitting={false} error={null} />)

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
    render(<QcReviewForm onSubmit={onSubmit} isSubmitting={false} error={null} />)

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
    render(<QcReviewForm onSubmit={onSubmit} isSubmitting={false} error={null} />)

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
    render(<QcReviewForm onSubmit={asyncNoop} isSubmitting={false} error={null} />)

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
