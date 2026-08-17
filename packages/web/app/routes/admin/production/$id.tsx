/**
 * Admin — one production job: what is in it, who is making it, and every QC
 * verdict it has ever had.
 *
 * Three parts of this screen exist because of a decision in the data model, and
 * each would be pointless without the other half.
 *
 * ## 1. The assign picker IS the capability filter
 *
 * Vendor capabilities exist so that a 40″ print is never sent to a shop whose
 * largest bed is 24″. So the picker asks the vendor directory for exactly the
 * suppliers that can make THIS job — `kind` = the job's stage, `minLongestEdge`
 * = the largest item's longest edge — and then reads each candidate's rate card
 * to show what that size actually costs there. Listing every vendor and letting
 * the assignment fail would leave the capability columns as decoration.
 *
 * The rate is resolved on the client by `selectRateForEdge`, which mirrors
 * `lib/vendor-rates.selectRateInForce` band-for-band (inclusive min, exclusive
 * max, effective-dated). It is a PREVIEW, not the price: the API prices again
 * at the assignment instant, and that server-side price is the one that is
 * stored. A vendor whose preview says "no rate for this size" is told so before
 * the button is pressed, but the 422 below is still the authority.
 *
 * ## 2. A 422 names the item and its size
 *
 * `POST /:jobId/assign` refuses the whole assignment when any item falls
 * outside the vendor's bands, and answers with
 * `unpriced: [{ orderItemId, longestEdge, size }]` — deliberately, so the
 * screen can be specific. The remedy is "add a rate band for that size", which
 * an admin can do in about thirty seconds on the vendor's rate card, but only
 * if they are told WHICH size. A generic "something went wrong" turns a
 * thirty-second fix into a database query, which is why `AssignmentFailure`
 * renders the item and the size and never degrades to a banner.
 *
 * ## 3. Reviews are a history, not a verdict
 *
 * The API has no PATCH or DELETE on a review, by construction: fail -> rework
 * -> pass has to leave three rows, because that sequence IS the QC history.
 * This screen therefore renders all of them, oldest first, numbered — showing
 * only the latest verdict would discard the entire reason reviews live in their
 * own table. The API returns them newest-first (its own ordering is
 * `desc(createdAt)`), so `sortReviewsOldestFirst` flips them into reading
 * order rather than the screen quietly relying on the server's sort.
 *
 * Everything else follows the vendor screens: no native `confirm()`, skeleton /
 * empty / error on every list, and no fabricated zero anywhere near a failed
 * request (#602, #606).
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { ADMIN_PRODUCTION_SEARCH } from '~/lib/admin-nav'
import {
  PRODUCTION_STATUSES,
  STAGE_LABELS,
  STATUS_LABELS,
  StatusPill,
  formatDate,
  formatRupees,
  type ProductionStage,
  type ProductionStatus,
} from './index'

// ============================================================================
// Route configuration
// ============================================================================

export const Route = createFileRoute('/admin/production/$id')({
  head: () => ({
    meta: [
      { title: 'Production Job | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminProductionJobPage,
})

// ============================================================================
// Types — the GET /api/admin/production/:jobId payload, verbatim
// ============================================================================

export interface ProductionJobRecord {
  id: string
  orderId: string
  stage: ProductionStage
  status: ProductionStatus
  vendorId: string | null
  assignedAt: string | null
  sentAt: string | null
  dueAt: string | null
  receivedAt: string | null
  amountExpected: string | null
  amountActual: string | null
  settlementId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ProductionJobItemRow {
  id: string
  orderItemId: string
  /** LEFT joined — null if the order item has been removed underneath us. */
  quantity: number | null
  widthInches: number | null
  heightInches: number | null
  sizeLabel: string | null
}

export interface ProductionJobReview {
  id: string
  jobId: string
  reviewerId: string | null
  verdict: 'pass' | 'fail'
  defects: string[] | null
  notes: string | null
  createdAt: string
}

export interface ProductionJobDetail {
  job: ProductionJobRecord
  items: ProductionJobItemRow[]
  reviews: ProductionJobReview[]
  payableAmount: string
}

/** A `vendor_rates` row as JSON delivers it — the timestamps are ISO strings. */
export interface VendorRateRow {
  id: string
  vendorId: string
  kind: 'print' | 'frame'
  finish: string | null
  longestEdgeMinInches: number
  longestEdgeMaxInches: number
  /** decimal(10,2). Kept a string all the way to the formatter. */
  amount: string
  effectiveFrom: string
  effectiveTo: string | null
}

export interface VendorCandidate {
  id: string
  name: string
  status: string
  /** From the capability row for this stage — what the shop can physically make. */
  maxWidthInches: number | null
  maxHeightInches: number | null
  /** The band covering this job's size, or null if the vendor has not priced it. */
  rate: VendorRateRow | null
}

export interface UnpricedItem {
  orderItemId: string
  longestEdge: number | null
  size: string | null
}

// ============================================================================
// Sizing and rates — pure, so the rules are testable without a fetch
// ============================================================================

/**
 * The size the WHOLE job has to be priced at: the longest edge of the biggest
 * item on it.
 *
 * Null when any item has no dimensions, which is the honest answer rather than
 * a convenient one. The variant is gone, so we cannot say what size was made —
 * and treating the miss as 0 would offer every vendor on the books for a job
 * that the API will refuse to price anyway.
 */
export function largestLongestEdge(items: ProductionJobItemRow[]): number | null {
  if (items.length === 0) return null

  let largest = 0
  for (const item of items) {
    if (item.widthInches == null || item.heightInches == null) return null
    largest = Math.max(largest, item.widthInches, item.heightInches)
  }

  return largest
}

function inForce(rate: VendorRateRow, at: Date): boolean {
  const from = new Date(rate.effectiveFrom).getTime()
  if (Number.isNaN(from) || from > at.getTime()) return false
  if (rate.effectiveTo) {
    const to = new Date(rate.effectiveTo).getTime()
    if (!Number.isNaN(to) && to <= at.getTime()) return false
  }
  return true
}

/**
 * The rate in force for one size at one instant, or null.
 *
 * A deliberate mirror of `packages/api/src/lib/vendor-rates.selectRateInForce`:
 * bands are inclusive-min / exclusive-max on the longest edge, an exact finish
 * match beats a finish-agnostic band, and the most recently effective row wins
 * a tie. Kept in step with that module because a preview that disagrees with
 * the server is worse than no preview — it would promise a price the
 * assignment then refuses.
 *
 * Null is a real answer: "this vendor has not priced this size". Never zero.
 */
export function selectRateForEdge(
  rates: VendorRateRow[],
  query: {
    kind: ProductionStage
    longestEdge: number
    at: Date
    finish?: string | null
  }
): VendorRateRow | null {
  const finish = query.finish ?? null

  const candidates = rates.filter(
    (r) =>
      r.kind === query.kind &&
      (finish == null || r.finish == null || r.finish === finish) &&
      query.longestEdge >= r.longestEdgeMinInches &&
      query.longestEdge < r.longestEdgeMaxInches &&
      inForce(r, query.at)
  )

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const aExact = a.finish === finish ? 1 : 0
    const bExact = b.finish === finish ? 1 : 0
    if (aExact !== bExact) return bExact - aExact
    return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
  })

  return candidates[0] ?? null
}

/**
 * The API returns reviews newest-first. Flip them into reading order here
 * rather than depending on the server's sort, and copy rather than sort in
 * place — the caller's array is state.
 */
export function sortReviewsOldestFirst(
  reviews: ProductionJobReview[]
): ProductionJobReview[] {
  return [...reviews].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

/** "24x36" as the API spells it, "24×36" as a person reads it. */
function prettySize(size: string | null): string | null {
  if (!size) return null
  return size.replace(/x/i, '×')
}

// ============================================================================
// The assign picker
// ============================================================================

export interface VendorCandidateListProps {
  candidates: VendorCandidate[]
  stage: ProductionStage
  longestEdge: number | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onAssign: (vendorId: string) => Promise<void> | void
  /** Non-null while an assignment is in flight; every button is locked. */
  assigningVendorId: string | null
}

export function VendorCandidateList({
  candidates,
  stage,
  longestEdge,
  isLoading,
  error,
  onRetry,
  onAssign,
  assigningVendorId,
}: VendorCandidateListProps) {
  const sizeText = longestEdge === null ? 'an unknown size' : `${longestEdge}″`

  // Error before loading before empty: an empty list after a failed lookup
  // reads as "nobody can make this", which is a different and worse claim.
  if (error) {
    return (
      <div
        data-testid="admin-production-candidates-error"
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="mb-1 font-medium">{error}</p>
        <p className="mb-4 text-muted-foreground">
          No supplier is listed because the directory was not read — which is not
          the same as nobody being able to make this.
        </p>
        <Button
          type="button"
          variant="outline"
          data-testid="admin-production-candidates-retry"
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        data-testid="admin-production-candidates-skeleton"
        className="space-y-2"
        aria-busy="true"
        aria-label="Finding suppliers who can make this"
      >
        {['a', 'b', 'c'].map((key) => (
          <div key={key} className="h-12 animate-pulse rounded bg-muted" aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (candidates.length === 0) {
    return (
      <div
        data-testid="admin-production-candidates-empty"
        className="rounded-lg border border-dashed border-border p-6 text-sm"
      >
        <p className="mb-1 font-medium">
          No active vendor can {STAGE_LABELS[stage].toLowerCase()} at {sizeText}
        </p>
        <p className="text-muted-foreground">
          A supplier appears here once it has a {STAGE_LABELS[stage].toLowerCase()}{' '}
          capability reaching {sizeText}. Widen a vendor&rsquo;s capability, or add
          one.
        </p>
      </div>
    )
  }

  return (
    <ul data-testid="admin-production-candidates" className="space-y-2">
      {candidates.map((candidate) => {
        const rate = candidate.rate ? formatRupees(candidate.rate.amount) : null

        return (
          <li
            key={candidate.id}
            data-testid={`admin-production-candidate-${candidate.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
          >
            <div>
              <p className="font-medium">{candidate.name}</p>
              <p className="text-xs text-muted-foreground">
                Can make up to{' '}
                {candidate.maxWidthInches && candidate.maxHeightInches
                  ? `${candidate.maxWidthInches}×${candidate.maxHeightInches}″`
                  : 'an unrecorded size'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* No rate is said in words. A ₹0 here would read as "free",
                  and this is exactly the vendor the API will 422 on. */}
              {rate ? (
                <span className="tabular-nums">
                  {rate} <span className="text-muted-foreground">for {sizeText}</span>
                </span>
              ) : (
                <span className="text-destructive">No rate for {sizeText}</span>
              )}

              <Button
                type="button"
                variant={rate ? 'solid' : 'outline'}
                data-testid={`admin-production-assign-${candidate.id}`}
                disabled={assigningVendorId !== null}
                onClick={() => void onAssign(candidate.id)}
              >
                {assigningVendorId === candidate.id ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ============================================================================
// The 422 — the item and its size, because that IS the remedy
// ============================================================================

export interface AssignmentFailureProps {
  error: string | null
  unpriced: UnpricedItem[]
  items: ProductionJobItemRow[]
  vendorName: string | null
}

export function AssignmentFailure({
  error,
  unpriced,
  items,
  vendorName,
}: AssignmentFailureProps) {
  if (!error) return null

  const byOrderItemId = new Map(items.map((item) => [item.orderItemId, item]))

  return (
    <div
      data-testid="admin-production-assign-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      <p className="mb-2 font-medium">
        {vendorName
          ? `${vendorName} could not be assigned — nothing was written.`
          : 'The vendor could not be assigned — nothing was written.'}
      </p>

      {unpriced.length > 0 ? (
        <>
          <p className="mb-2 text-muted-foreground">
            {vendorName ?? 'This vendor'} has no rate band covering these item(s):
          </p>
          <ul className="mb-3 space-y-1">
            {unpriced.map((miss) => {
              const item = byOrderItemId.get(miss.orderItemId)
              // The job item's own label first, then the size the API echoed
              // back, then an explicit "unknown" — never a blank and never a 0.
              const size =
                item?.sizeLabel ?? prettySize(miss.size) ?? 'Unknown size (no dimensions recorded)'
              const edge =
                miss.longestEdge === null ? 'unknown longest edge' : `${miss.longestEdge}″ longest edge`

              return (
                <li
                  key={miss.orderItemId}
                  data-testid={`admin-production-unpriced-${miss.orderItemId}`}
                  className="font-medium"
                >
                  {size} <span className="text-muted-foreground">— {edge}</span>
                </li>
              )
            })}
          </ul>
          <p className="text-muted-foreground">
            Add a rate band covering that size on{' '}
            {vendorName ? `${vendorName}'s` : 'the vendor’s'} rate card, then
            assign again.
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">{error}</p>
      )}
    </div>
  )
}

// ============================================================================
// QC — the history, then the form that appends to it
// ============================================================================

export interface QcReviewHistoryProps {
  reviews: ProductionJobReview[]
  isLoading: boolean
  error: string | null
}

export function QcReviewHistory({ reviews, isLoading, error }: QcReviewHistoryProps) {
  if (error) {
    return (
      <div
        data-testid="admin-production-reviews-error"
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">{error}</p>
        <p className="text-muted-foreground">
          The history has not been read. An empty list here would say this job was
          never inspected, which is a different thing entirely.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        data-testid="admin-production-reviews-skeleton"
        className="space-y-2"
        aria-busy="true"
        aria-label="Loading QC history"
      >
        {['a', 'b'].map((key) => (
          <div key={key} className="h-16 animate-pulse rounded bg-muted" aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (reviews.length === 0) {
    return (
      <div
        data-testid="admin-production-reviews-empty"
        className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
      >
        Nothing has been inspected yet. The first verdict recorded below starts the
        history.
      </div>
    )
  }

  const ordered = sortReviewsOldestFirst(reviews)

  return (
    <div data-testid="admin-production-reviews">
      <p className="mb-2 text-xs text-muted-foreground">
        {ordered.length} inspection{ordered.length === 1 ? '' : 's'}, oldest first.
        Entries are appended, never edited.
      </p>
      <ol className="space-y-2">
        {ordered.map((review, index) => (
          <li
            key={review.id}
            data-testid={`admin-production-review-${review.id}`}
            className={cn(
              'rounded-lg border p-3 text-sm',
              review.verdict === 'pass'
                ? 'border-green-200 bg-green-50/40'
                : 'border-red-200 bg-red-50/40'
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                #{index + 1}
              </span>
              {/* The verdict in words, not only in colour. */}
              <span
                className={cn(
                  'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                  review.verdict === 'pass'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                )}
              >
                {review.verdict === 'pass' ? 'Pass' : 'Fail'}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(review.createdAt)}
              </span>
            </div>

            {review.defects && review.defects.length > 0 && (
              <p className="mt-2 text-xs">
                <span className="text-muted-foreground">Defects: </span>
                {review.defects.join(', ')}
              </p>
            )}

            {review.notes && <p className="mt-1 text-muted-foreground">{review.notes}</p>}
          </li>
        ))}
      </ol>
    </div>
  )
}

export interface QcReviewInput {
  verdict: 'pass' | 'fail'
  defects: string[]
  notes: string
}

export interface QcReviewFormProps {
  onSubmit: (input: QcReviewInput) => Promise<void> | void
  isSubmitting: boolean
  error: string | null
}

/** Free text in, the array the API takes out. Blanks are dropped, not sent. */
export function splitDefects(raw: string): string[] {
  return raw
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
}

export function QcReviewForm({ onSubmit, isSubmitting, error }: QcReviewFormProps) {
  const [verdict, setVerdict] = useState<'pass' | 'fail'>('pass')
  const [defects, setDefects] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void onSubmit({ verdict, defects: splitDefects(defects), notes })
  }

  return (
    <form
      data-testid="admin-production-review-form"
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <p className="text-sm font-medium">Record an inspection</p>
      <p className="text-xs text-muted-foreground">
        Every submission appends a row. Nothing above is overwritten — a rework
        that passes leaves the failure that caused it in place.
      </p>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Verdict
        <select
          data-testid="admin-production-review-verdict"
          value={verdict}
          onChange={(e) => setVerdict(e.target.value as 'pass' | 'fail')}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Defects (comma separated)
        <input
          type="text"
          data-testid="admin-production-review-defects"
          value={defects}
          onChange={(e) => setDefects(e.target.value)}
          placeholder="banding, corner scuff"
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Notes
        <textarea
          data-testid="admin-production-review-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        />
      </label>

      {error && (
        <p
          data-testid="admin-production-review-error"
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        data-testid="admin-production-review-submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Recording…' : 'Record inspection'}
      </Button>
    </form>
  )
}

// ============================================================================
// Data access
// ============================================================================

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? fallback)
  }
  return (await response.json()) as T
}

export async function fetchJob(jobId: string): Promise<ProductionJobDetail> {
  const response = await fetch(`${getApiUrl()}/api/admin/production/${jobId}`, {
    credentials: 'include',
  })
  return readJson<ProductionJobDetail>(response, 'Failed to load the production job')
}

interface VendorDirectoryRow {
  id: string
  name: string
  status: string
  capabilities: Array<{
    kind: 'print' | 'frame'
    maxWidthInches: number | null
    maxHeightInches: number | null
  }>
}

/**
 * The suppliers that can make THIS job, each with its price for THIS size.
 *
 * Two requests deep on purpose: the directory endpoint answers the capability
 * question (`kind` + `minLongestEdge`) but carries no rate card, and the rate
 * card is the second half of the question an admin is actually asking. The fan
 * out is bounded by the capability filter — it is the shortlist, not the
 * directory.
 */
export async function fetchCandidates(
  stage: ProductionStage,
  longestEdge: number
): Promise<VendorCandidate[]> {
  const query = new URLSearchParams({
    status: 'active',
    kind: stage,
    minLongestEdge: String(longestEdge),
    page: '1',
    pageSize: '100',
  })

  const listResponse = await fetch(
    `${getApiUrl()}/api/admin/vendors?${query.toString()}`,
    { credentials: 'include' }
  )
  const list = await readJson<{ items: VendorDirectoryRow[] }>(
    listResponse,
    'Failed to load vendors'
  )

  const at = new Date()

  return Promise.all(
    list.items.map(async (vendor) => {
      const capability = vendor.capabilities.find((c) => c.kind === stage) ?? null

      let rate: VendorRateRow | null = null
      try {
        const detailResponse = await fetch(
          `${getApiUrl()}/api/admin/vendors/${vendor.id}`,
          { credentials: 'include' }
        )
        const detail = await readJson<{ rates: VendorRateRow[] }>(
          detailResponse,
          'Failed to load rates'
        )
        rate = selectRateForEdge(detail.rates, { kind: stage, longestEdge, at })
      } catch {
        // A rate card that cannot be read leaves the preview blank, which the
        // list renders as "no rate for this size". That is the same thing the
        // API would answer with, and it is a preview either way.
        rate = null
      }

      return {
        id: vendor.id,
        name: vendor.name,
        status: vendor.status,
        maxWidthInches: capability?.maxWidthInches ?? null,
        maxHeightInches: capability?.maxHeightInches ?? null,
        rate,
      }
    })
  )
}

interface AssignFailureBody {
  error?: string
  unpriced?: UnpricedItem[]
}

// ============================================================================
// Page
// ============================================================================

function AdminProductionJobPage() {
  const { id } = Route.useParams()

  const [detail, setDetail] = useState<ProductionJobDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [candidates, setCandidates] = useState<VendorCandidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [candidatesError, setCandidatesError] = useState<string | null>(null)

  const [assigningVendorId, setAssigningVendorId] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignUnpriced, setAssignUnpriced] = useState<UnpricedItem[]>([])
  const [assignVendorName, setAssignVendorName] = useState<string | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setDetail(await fetchJob(id))
      setError(null)
    } catch (loadError) {
      // The stale job goes with the error — a payable rendered under a failure
      // banner is a number somebody will believe.
      setDetail(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const items = useMemo(() => detail?.items ?? [], [detail])
  const longestEdge = useMemo(() => largestLongestEdge(items), [items])
  const stage = detail?.job.stage ?? null

  const loadCandidates = useCallback(async () => {
    if (!stage || longestEdge === null) {
      setCandidates([])
      return
    }

    setCandidatesLoading(true)
    try {
      setCandidates(await fetchCandidates(stage, longestEdge))
      setCandidatesError(null)
    } catch (loadError) {
      setCandidates([])
      setCandidatesError((loadError as Error).message)
    } finally {
      setCandidatesLoading(false)
    }
  }, [stage, longestEdge])

  useEffect(() => {
    void loadCandidates()
  }, [loadCandidates])

  const handleAssign = async (vendorId: string) => {
    setAssigningVendorId(vendorId)
    setAssignError(null)
    setAssignUnpriced([])
    setAssignVendorName(candidates.find((c) => c.id === vendorId)?.name ?? null)

    try {
      const response = await fetch(`${getApiUrl()}/api/admin/production/${id}/assign`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as AssignFailureBody
        setAssignUnpriced(body.unpriced ?? [])
        setAssignError(body.error ?? 'Failed to assign the vendor')
        return
      }

      await load()
    } catch (assignFailure) {
      setAssignError((assignFailure as Error).message)
    } finally {
      setAssigningVendorId(null)
    }
  }

  const handleRecordReview = async (input: {
    verdict: 'pass' | 'fail'
    defects: string[]
    notes: string
  }) => {
    setIsRecording(true)
    setReviewError(null)

    try {
      const response = await fetch(`${getApiUrl()}/api/admin/production/${id}/reviews`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verdict: input.verdict,
          defects: input.defects.length > 0 ? input.defects : null,
          notes: input.notes.trim() || null,
        }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to record the review')
      }

      await load()
    } catch (recordError) {
      setReviewError((recordError as Error).message)
    } finally {
      setIsRecording(false)
    }
  }

  const handleStatusChange = async (status: ProductionStatus) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/production/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to update the job')
      }

      await load()
    } catch (updateError) {
      setError((updateError as Error).message)
    }
  }

  const job = detail?.job ?? null
  const payable = formatRupees(detail?.payableAmount)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link
            to="/admin/production"
            search={ADMIN_PRODUCTION_SEARCH}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border"
            aria-label="Back to the production queue"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-medium">Production job</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{id}</p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && (
        <div
          data-testid="admin-production-detail-error"
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
          <p className="text-muted-foreground">
            Nothing about this job is shown below — it has not been read, which is
            not the same as it being empty.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            data-testid="admin-production-detail-retry"
            onClick={() => void load()}
          >
            Try again
          </Button>
        </div>
      )}

      {isLoading && !error && (
        <div
          data-testid="admin-production-detail-skeleton"
          className="space-y-2"
          aria-busy="true"
          aria-label="Loading the production job"
        >
          {['a', 'b', 'c'].map((key) => (
            <div key={key} className="h-20 animate-pulse rounded bg-muted" aria-hidden="true" />
          ))}
        </div>
      )}

      {!isLoading && !error && job && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Summary */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Summary</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Stage</dt>
              <dd>{STAGE_LABELS[job.stage]}</dd>

              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusPill status={job.status} />
              </dd>

              <dt className="text-muted-foreground">Vendor</dt>
              <dd>
                {job.vendorId ? (
                  <Link
                    to="/admin/vendors/$id"
                    params={{ id: job.vendorId }}
                    className="text-brand-600 hover:underline"
                  >
                    {candidates.find((c) => c.id === job.vendorId)?.name ??
                      job.vendorId.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </dd>

              <dt className="text-muted-foreground">Due</dt>
              <dd>{formatDate(job.dueAt)}</dd>

              <dt className="text-muted-foreground">Payable</dt>
              <dd className="tabular-nums">
                {/* Never a fallback zero. */}
                {payable ?? <span className="text-destructive">Unavailable</span>}
              </dd>
            </dl>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Move to status
              <select
                data-testid="admin-production-status"
                value={job.status}
                onChange={(e) => void handleStatusChange(e.target.value as ProductionStatus)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
              >
                {PRODUCTION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* Items */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">
              Items{' '}
              <span className="font-normal text-muted-foreground">
                {longestEdge === null
                  ? '— size unknown, so this job cannot be priced'
                  : `— priced at ${longestEdge}″, the biggest item's longest edge`}
              </span>
            </h2>
            {items.length === 0 ? (
              <p
                data-testid="admin-production-items-empty"
                className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
              >
                This job has no items. It cannot be assigned until it does.
              </p>
            ) : (
              <ul data-testid="admin-production-items" className="space-y-1 text-sm">
                {items.map((item) => (
                  <li
                    key={item.id}
                    data-testid={`admin-production-item-${item.orderItemId}`}
                    className="flex items-center justify-between gap-3 border-b border-border py-1 last:border-0"
                  >
                    <span>{item.sizeLabel ?? 'No recorded size'}</span>
                    <span className="text-muted-foreground">
                      {item.quantity == null ? 'quantity unknown' : `× ${item.quantity}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Assignment */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">
              {job.vendorId ? 'Reassign' : 'Assign'} this job
            </h2>
            <p className="text-xs text-muted-foreground">
              Only suppliers whose {STAGE_LABELS[job.stage].toLowerCase()} capability
              reaches this job&rsquo;s size are listed, each with its rate for that
              size. The price shown is a preview — the API prices again at the
              instant of assignment.
            </p>

            <AssignmentFailure
              error={assignError}
              unpriced={assignUnpriced}
              items={items}
              vendorName={assignVendorName}
            />

            {longestEdge === null ? (
              <p
                data-testid="admin-production-unsizable"
                className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
              >
                This job cannot be sized — at least one item has no recorded
                dimensions — so no supplier can be matched to it. Restore the
                variant&rsquo;s dimensions first.
              </p>
            ) : (
              <VendorCandidateList
                candidates={candidates}
                stage={job.stage}
                longestEdge={longestEdge}
                isLoading={candidatesLoading}
                error={candidatesError}
                onRetry={() => void loadCandidates()}
                onAssign={handleAssign}
                assigningVendorId={assigningVendorId}
              />
            )}
          </section>

          {/* QC */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Quality control</h2>
            <QcReviewHistory
              reviews={detail?.reviews ?? []}
              isLoading={false}
              error={null}
            />
            <QcReviewForm
              onSubmit={handleRecordReview}
              isSubmitting={isRecording}
              error={reviewError}
            />
          </section>
        </div>
      )}
    </div>
  )
}
