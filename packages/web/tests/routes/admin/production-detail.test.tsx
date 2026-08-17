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
  QcReviewHistory,
  QcReviewForm,
  VendorCandidateList,
  AssignmentFailure,
  sortReviewsOldestFirst,
  largestLongestEdge,
  selectRateForEdge,
  type ProductionJobReview,
  type ProductionJobItemRow,
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
