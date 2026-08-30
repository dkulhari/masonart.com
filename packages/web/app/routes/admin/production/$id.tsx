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
 * A pass followed by a fail is marked as an overturn: `qc_passed -> qc_failed`
 * is in the matrix precisely so a supervisor re-inspecting leaves a SECOND row
 * while the first survives, and a disagreement rendered as two anonymous rows
 * is a disagreement nobody can see.
 *
 * ## 4. The actions come from the matrix, not from this file
 *
 * The status control was a plain `<select>` over the seven statuses the queue
 * screen knew about, which offered `draft -> dispatched` and every other move
 * the state machine refuses. `TransitionPanel` renders
 * `patchableNextStatuses(status, 'admin')` from `@chobii/shared` instead — the
 * same table `packages/api/src/lib/production-transitions.ts` imports — so an
 * edge added there appears here without anyone editing this file, and a
 * terminal status renders a sentence rather than an empty dropdown.
 *
 * Two things are subtracted, and both subtractions are the matrix's own:
 * `qc_passed`/`qc_failed`, which `PATCH` does not parse because a verdict with
 * no review row is a verdict with no evidence; and the guards `PATCH` cannot
 * evaluate, which are shown but not pressable, with the place they ARE taken
 * written beside them. A 409 that happens anyway is rendered inline from its
 * own body — `{ error, code, from, to, allowed }`, plus the owning route on a
 * `GUARD_NOT_EVALUABLE_HERE` — so the remedy needs no second round trip.
 *
 * ## 5. The photographs are the evidence, and the stamp runs backwards
 *
 * `QcShotList` renders the stage's shot list with the live photo in each slot.
 * `production_job_photos.review_id` names the FIRST verdict that judged a shot,
 * not the current one: the API stamps only where the column is still NULL, so
 * that an overturn cannot erase the record of what the approving review saw.
 * The panel says so once a job has more than one verdict, rather than letting
 * the stamp be read the intuitive way round.
 *
 * Everything else follows the vendor screens: no native `confirm()`, skeleton /
 * empty / error on every list, and no fabricated zero anywhere near a failed
 * request (#602, #606).
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import {
  VERDICT_ONLY_STATUSES,
  guardFor,
  isTerminalStatus,
  nextStatuses,
  patchableNextStatuses,
  type ProductionJobStatus,
  type TransitionGuard,
} from '@chobii/shared'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { ADMIN_PRODUCTION_SEARCH } from '~/lib/admin-nav'
import {
  STAGE_LABELS,
  STATUS_LABELS,
  StatusPill,
  formatDate,
  formatRupees,
  type ProductionStage,
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
  /**
   * The API's own vocabulary, from `@chobii/shared` — the same tuple the queue
   * screen's `ProductionStatus` is now an alias of, and the same one the matrix
   * below is keyed by. Named here rather than through `./index` so the type of a
   * status and the table of what may follow it come from one import.
   */
  status: ProductionJobStatus
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

/**
 * One live QC photograph, as `GET /:jobId/photos` answers it (#681).
 *
 * `url` is a presigned DOWNLOAD url with a five-minute life and the object key
 * never leaves the API, so this is the only handle the screen has — there is
 * nothing to store and nothing to re-derive.
 */
export interface QcLivePhoto {
  id: string
  url: string
  contentType: string
  sizeBytes: number
  uploadedBy: string | null
  uploadedAt: string
  /** The FIRST review that judged this shot. See `QcShotList`. */
  reviewId: string | null
}

/** One slot of the shot list, with whatever is live in it. */
export interface QcShotEntry {
  slot: string
  label: string
  required: boolean
  /** False for a photo in a slot this stage's shot list does not ask for. */
  onShotList: boolean
  photo: QcLivePhoto | null
}

export interface QcPhotoSet {
  jobId: string
  stage: ProductionStage
  status: ProductionJobStatus
  shots: QcShotEntry[]
  missingRequiredSlots: string[]
  expiresAt: string
}

/**
 * A refused write, verbatim from the API.
 *
 * `{ error, code, from, to, allowed }` is the shape every refusal in
 * `routes/admin/production-jobs.ts` answers with, and it carries the remedy on
 * purpose: the screen re-renders what IS possible without a second round trip.
 * `guard` and `route` are present only on `GUARD_NOT_EVALUABLE_HERE`.
 */
export interface TransitionRefusalBody {
  error: string
  code: string
  from: ProductionJobStatus
  to: ProductionJobStatus
  allowed: ProductionJobStatus[]
  guard?: TransitionGuard
  route?: string
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
// The transition panel — the matrix, rendered
// ============================================================================

/**
 * A status in words.
 *
 * `STATUS_LABELS` in `./index` is keyed partially on purpose — a retired status
 * has no label because no screen offers a view of it — so the fallback is not
 * defensive padding: rows still carry `sent`, and a transition button or a
 * refusal naming a blank is a sentence nobody can read.
 */
export function statusLabel(status: ProductionJobStatus): string {
  return (
    STATUS_LABELS[status] ??
    status.replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase())
  )
}

/**
 * The guards `PATCH /:jobId` cannot evaluate, and where each one IS evaluated.
 *
 * Keyed by the guard the MATRIX names on the edge, so this is wayfinding rather
 * than a second copy of the API's `GUARD_OWNER` route table: it says which part
 * of which screen takes the move, in the words a person uses. The API's own
 * answer — a `GUARD_NOT_EVALUABLE_HERE` naming the route — is rendered verbatim
 * by `TransitionRefusal` when a move is attempted anyway.
 *
 * `open-transfer-or-order-label` is deliberately absent: PATCH DOES evaluate it,
 * against the open transfers and the order's label, so that edge stays live and
 * a refusal there is a fact about the world, not about the route.
 */
const GUARD_TAKEN_ELSEWHERE: Partial<Record<TransitionGuard, string>> = {
  'priced-from-rate-card':
    'Taken in the assign panel on this page — the amount is priced from the vendor’s rate card at that instant, and this control carries no vendor to price against.',
  'review-verdict-pass': 'Taken by recording a passing verdict below.',
  'review-verdict-fail': 'Taken by recording a failing verdict below.',
  'shot-list-complete':
    'Taken by the vendor in their portal, once every required shot has been uploaded.',
}

export interface TransitionPanelProps {
  status: ProductionJobStatus
  onTransition: (to: ProductionJobStatus) => Promise<void> | void
  /** The target currently being written, or null. Locks every button. */
  pendingStatus: ProductionJobStatus | null
  refusal: TransitionRefusalBody | null
}

/**
 * Every move an admin may make on this job, and nothing else.
 *
 * Built from `patchableNextStatuses(status, 'admin')` — the matrix in
 * `@chobii/shared`, which `packages/api/src/lib/production-transitions.ts`
 * imports rather than restates. The screen used to be a `<select>` over all
 * seven statuses it knew about, which offered `draft -> dispatched` and every
 * other move the state machine refuses; the list is now derived, so an edge
 * added to the matrix appears here without anyone editing this file.
 *
 * Two subtractions, both of them the matrix's own:
 *
 * - **The verdicts.** `qc_passed` and `qc_failed` are reachable only through
 *   `POST /:jobId/reviews`, and PATCH does not even parse them: a verdict with
 *   no review row is a verdict with no evidence. They are dropped from the
 *   buttons and named in a sentence pointing at the form that does take them.
 * - **The guards PATCH cannot evaluate.** The edge is shown — it is real, and
 *   hiding it would make the workflow unguessable — but disabled, with the place
 *   it IS taken written beside it. Pressing it would spend a round trip on a 409
 *   this screen could already predict.
 */
export function TransitionPanel({
  status,
  onTransition,
  pendingStatus,
  refusal,
}: TransitionPanelProps) {
  const targets = patchableNextStatuses(status, 'admin')
  const verdictTargets = nextStatuses(status, 'admin').filter((to) =>
    VERDICT_ONLY_STATUSES.includes(to)
  )

  return (
    <div data-testid="admin-production-transitions" className="space-y-3">
      {isTerminalStatus(status) ? (
        <p
          data-testid="admin-production-transition-terminal"
          className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
        >
          This job is {statusLabel(status).toLowerCase()}, which is the end of the
          line: nothing leaves this status. A lost parcel becomes a NEW job rather
          than reopening this one.
        </p>
      ) : targets.length === 0 && verdictTargets.length === 0 ? (
        <p
          data-testid="admin-production-transition-none"
          className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
        >
          There is no move an admin can make on a job in{' '}
          {statusLabel(status).toLowerCase()}. This status is retired — nothing
          reaches it and nothing leaves it — and rows still carrying it are waiting
          on the backfill, not on you.
        </p>
      ) : (
        <ul className="space-y-2">
          {targets.map((to) => {
            const guard = guardFor(status, to)
            const elsewhere = guard ? GUARD_TAKEN_ELSEWHERE[guard] : undefined
            const locked = elsewhere !== undefined || pendingStatus !== null

            return (
              <li key={to} className="space-y-1">
                <Button
                  type="button"
                  variant={to === 'cancelled' ? 'outline' : 'solid'}
                  data-testid={`admin-production-transition-to-${to}`}
                  disabled={locked}
                  onClick={() => void onTransition(to)}
                >
                  {pendingStatus === to ? 'Moving…' : `Move to ${statusLabel(to).toLowerCase()}`}
                </Button>

                {elsewhere && (
                  <p
                    data-testid={`admin-production-transition-guard-${to}`}
                    className="text-xs text-muted-foreground"
                  >
                    {elsewhere}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {verdictTargets.length > 0 && (
        <p
          data-testid="admin-production-transition-verdicts"
          className="text-xs text-muted-foreground"
        >
          {verdictTargets.map((to) => statusLabel(to).toLowerCase()).join(' and ')} are
          not offered here. A verdict with no review row is a verdict with no
          evidence, so both are reached only by recording an inspection below.
        </p>
      )}

      <TransitionRefusal refusal={refusal} />
    </div>
  )
}

export interface TransitionRefusalProps {
  refusal: TransitionRefusalBody | null
}

/**
 * A refused move, answered inline.
 *
 * The 409 body carries `{ error, code, from, to, allowed }` precisely so this
 * needs no second round trip: it says what was attempted and what would have
 * worked. `GUARD_NOT_EVALUABLE_HERE` additionally carries the guard and the
 * route that owns it — rendering the code and dropping the route would leave an
 * admin with a refusal and no next step.
 */
export function TransitionRefusal({ refusal }: TransitionRefusalProps) {
  if (!refusal) return null

  return (
    <div
      data-testid="admin-production-transition-refusal"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      <p className="mb-2 font-medium">
        {statusLabel(refusal.from)} → {statusLabel(refusal.to)} was refused. Nothing
        was written.
      </p>

      <p className="mb-2 text-muted-foreground">{refusal.error}</p>

      {refusal.code === 'GUARD_NOT_EVALUABLE_HERE' && refusal.route && (
        <p className="mb-2">
          <span className="text-muted-foreground">
            The {refusal.guard ?? 'guard'} on that edge is evaluated by:{' '}
          </span>
          <code className="font-mono text-xs">{refusal.route}</code>
        </p>
      )}

      {refusal.allowed.length > 0 ? (
        <p>
          <span className="text-muted-foreground">
            From {statusLabel(refusal.from).toLowerCase()} this job can go to:{' '}
          </span>
          {refusal.allowed.map((to) => statusLabel(to)).join(', ')}
        </p>
      ) : (
        <p className="text-muted-foreground">
          There is nowhere this job can be moved from{' '}
          {statusLabel(refusal.from).toLowerCase()} — not by an admin, and not with
          this route.
        </p>
      )}
    </div>
  )
}

// ============================================================================
// The shot list — every slot the stage asks for, with its live photograph
// ============================================================================

/** Bytes as a reviewer reads them. A raking-light shot of a whole print is big. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export interface QcShotListProps {
  shots: QcShotEntry[]
  missingRequiredSlots: string[]
  /** How many verdicts this job already has — see the re-stamp note below. */
  reviewCount: number
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

/**
 * The shot list, each slot with whatever is live in it.
 *
 * Three things this deliberately does not smooth over:
 *
 * 1. **A required slot with no photograph is named.** It is the one actionable
 *    fact on this panel — the vendor has to shoot it before the job can even be
 *    submitted — and an absent tile would read as "nothing to see".
 * 2. **A photo outside the shot list is shown, not dropped.**
 *    `production_job_photos.slot` is `text` with no enum under it, so a job whose
 *    stage was edited after the upload, or a portal sending the other list's key,
 *    leaves a photograph nobody can find. Hiding it here is how it stays hidden.
 * 3. **`review_id` names the FIRST verdict that judged a shot, not the current
 *    one.** The API stamps only where the column is still NULL, so that an
 *    overturn cannot destroy the record of what the approving review saw — which
 *    means a later verdict leaves no mark on these rows at all. Its judged set is
 *    on its own audit row. Presenting the stamp as "the current verdict" would
 *    quietly invert the evidence trail, so once a job has more than one verdict
 *    the panel says which way round it runs.
 */
export function QcShotList({
  shots,
  missingRequiredSlots,
  reviewCount,
  isLoading,
  error,
  onRetry,
}: QcShotListProps) {
  // Error before loading before empty: an empty shot list after a failed read
  // says the vendor photographed nothing, which is a different, worse claim.
  if (error) {
    return (
      <div
        data-testid="admin-production-photos-error"
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="mb-1 font-medium">{error}</p>
        <p className="mb-4 text-muted-foreground">
          No shot is listed because the photos were not read — which is not the same
          as the vendor not having taken any.
        </p>
        <Button
          type="button"
          variant="outline"
          data-testid="admin-production-photos-retry"
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
        data-testid="admin-production-photos-skeleton"
        className="grid gap-3 sm:grid-cols-2"
        aria-busy="true"
        aria-label="Loading the QC photographs"
      >
        {['a', 'b', 'c', 'd'].map((key) => (
          <div key={key} className="h-40 animate-pulse rounded bg-muted" aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (shots.length === 0) {
    return (
      <div
        data-testid="admin-production-photos-empty"
        className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
      >
        This stage asks for no photographs, and none has been uploaded outside a
        shot list either. There is nothing here to inspect.
      </div>
    )
  }

  const missing = new Set(missingRequiredSlots)

  return (
    <div data-testid="admin-production-photos" className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {shots.filter((shot) => shot.photo).length} of {shots.length} slot(s)
        photographed
        {missingRequiredSlots.length > 0
          ? `, ${missingRequiredSlots.length} required shot(s) still awaited`
          : ''}
        . Links are signed for a few minutes; refresh if an image stops loading.
      </p>

      {reviewCount > 1 && (
        <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          A stamp below names the <strong>first</strong> verdict that judged that
          shot, not the latest one. Later verdicts re-examine the same live
          photographs and deliberately do not re-stamp them — that is what stops an
          overturn erasing the record of what the earlier review saw. Each verdict’s
          full judged set is on its own audit row.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {shots.map((shot) => (
          <li
            key={shot.slot}
            data-testid={`admin-production-shot-${shot.slot}`}
            className={cn(
              'space-y-2 rounded-lg border p-3 text-sm',
              !shot.onShotList
                ? 'border-amber-200 bg-amber-50/40'
                : shot.photo
                  ? 'border-border'
                  : missing.has(shot.slot)
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'border-dashed border-border'
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{shot.label}</span>
              {shot.required && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  Required
                </span>
              )}
              {!shot.onShotList && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  Uploaded outside this stage&rsquo;s shot list
                </span>
              )}
            </div>

            <p className="font-mono text-xs text-muted-foreground">{shot.slot}</p>

            {shot.photo ? (
              <>
                <img
                  src={shot.photo.url}
                  alt={shot.label}
                  loading="lazy"
                  className="w-full rounded border border-border object-cover"
                />
                <p className="text-xs text-muted-foreground">
                  {formatDate(shot.photo.uploadedAt)} ·{' '}
                  {formatBytes(shot.photo.sizeBytes)} · {shot.photo.contentType}
                </p>
                {shot.photo.reviewId ? (
                  <p className="text-xs text-muted-foreground">
                    First judged by inspection{' '}
                    <span className="font-mono">{shot.photo.reviewId.slice(0, 8)}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No verdict has judged this shot yet.
                  </p>
                )}
              </>
            ) : (
              <p
                className={cn(
                  'text-xs',
                  missing.has(shot.slot) ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                Not yet photographed
                {missing.has(shot.slot)
                  ? ' — the vendor cannot submit this job for QC until they shoot it.'
                  : '. This one is optional.'}
              </p>
            )}
          </li>
        ))}
      </ul>
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
        {ordered.map((review, index) => {
          // The `qc_passed -> qc_failed` edge, seen from the history: a pass
          // followed by a fail is a supervisor disagreeing with an approval, and
          // it is the reason this table is append-only. A fail followed by a pass
          // is the ordinary rework and gets no marker.
          const overturns =
            index > 0 &&
            review.verdict === 'fail' &&
            ordered[index - 1]?.verdict === 'pass'

          return (
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
              {overturns && (
                <span
                  data-testid={`admin-production-review-overturn-${review.id}`}
                  className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                >
                  Overturns the approval above
                </span>
              )}
            </div>

            {review.defects && review.defects.length > 0 && (
              <p className="mt-2 text-xs">
                <span className="text-muted-foreground">Defects: </span>
                {review.defects.join(', ')}
              </p>
            )}

            {review.notes && <p className="mt-1 text-muted-foreground">{review.notes}</p>}
          </li>
          )
        })}
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

/**
 * The defects a reviewer reaches for most often, as one-press chips.
 *
 * UI vocabulary, not a contract: `production_job_reviews.defects` is a text
 * array and the API validates length, not membership, so the free-text field
 * below stays — a defect nobody anticipated is exactly the one worth writing
 * down. The chips exist because a fail REQUIRES at least one defect, and making
 * the required thing a single press is what keeps that requirement from being
 * answered with "bad".
 *
 * Both stages in one list on purpose: a frame job is a print inside a frame, and
 * banding on the sheet is still the vendor's to fix.
 */
export const QC_DEFECT_CHIPS = [
  'banding',
  'colour cast',
  'scuff or scratch',
  'crease or dent',
  'ink spot or mark',
  'wrong size',
  'soft or out of focus',
  'mitre gap',
  'glazing defect',
  'mount not square',
  'no hanging fixture',
] as const

/**
 * Chips first, then whatever the free-text field adds, deduplicated.
 *
 * One array reaches the API, because `defects` IS one array. Two fields feeding
 * two lists would let the same defect be sent twice, and a reviewer typing a
 * chip's own wording is the likeliest way that happens.
 */
export function mergeDefects(chips: readonly string[], raw: string): string[] {
  const merged: string[] = []
  for (const defect of [...chips, ...splitDefects(raw)]) {
    if (!merged.includes(defect)) merged.push(defect)
  }
  return merged
}

export function QcReviewForm({ onSubmit, isSubmitting, error }: QcReviewFormProps) {
  const [verdict, setVerdict] = useState<'pass' | 'fail'>('pass')
  const [chips, setChips] = useState<string[]>([])
  const [defects, setDefects] = useState('')
  const [notes, setNotes] = useState('')

  const chosen = mergeDefects(chips, defects)

  /**
   * A fail with no defect is unactionable for the vendor — they cannot know what
   * to redo — so the API refuses it outright (400, "A failing verdict must name
   * at least one defect") and `production-transitions` names the same rule on the
   * `review-verdict-fail` edge. Refusing it here too is not a second opinion: it
   * is not spending a round trip to be told something already known.
   */
  const defectMissing = verdict === 'fail' && chosen.length === 0

  const toggleChip = (chip: string) =>
    setChips((current) =>
      current.includes(chip) ? current.filter((c) => c !== chip) : [...current, chip]
    )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    // No native alert: `reviews.tsx:269` records that they block the automation
    // harness outright. The refusal is already on screen, beside the field.
    if (defectMissing || isSubmitting) return
    void onSubmit({ verdict, defects: chosen, notes })
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

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">
          Defects {verdict === 'fail' ? '(at least one required)' : '(optional on a pass)'}
        </legend>
        <div className="flex flex-wrap gap-2">
          {QC_DEFECT_CHIPS.map((chip) => {
            const active = chips.includes(chip)
            return (
              <button
                key={chip}
                type="button"
                data-testid={`admin-production-review-chip-${chip}`}
                aria-pressed={active}
                onClick={() => toggleChip(chip)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs',
                  active
                    ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                    : 'border-border text-muted-foreground'
                )}
              >
                {chip}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Anything the chips do not cover (comma separated)
        <input
          type="text"
          data-testid="admin-production-review-defects"
          value={defects}
          onChange={(e) => setDefects(e.target.value)}
          placeholder="head strike across the sky"
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
        />
      </label>

      {defectMissing && (
        <p
          data-testid="admin-production-review-defects-required"
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
        >
          A failing verdict has to name at least one defect. The vendor cannot redo
          work they have not been told is wrong, and the API refuses the submission
          without one.
        </p>
      )}

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
        disabled={isSubmitting || defectMissing}
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

/**
 * The shot list with its live photographs (#681).
 *
 * Separate from `fetchJob` because the urls in it are signed for five minutes:
 * they go stale on their own schedule, and a refresh of the photos must not
 * depend on re-reading the job. Every failure keeps its own state for the same
 * reason the candidate list does — a screen that blanks the whole job because
 * one panel could not be read is a screen that hides the job.
 */
export async function fetchPhotos(jobId: string): Promise<QcPhotoSet> {
  const response = await fetch(`${getApiUrl()}/api/admin/production/${jobId}/photos`, {
    credentials: 'include',
  })
  return readJson<QcPhotoSet>(response, 'Failed to load the QC photographs')
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

  const [photos, setPhotos] = useState<QcPhotoSet | null>(null)
  const [photosLoading, setPhotosLoading] = useState(true)
  const [photosError, setPhotosError] = useState<string | null>(null)

  const [pendingStatus, setPendingStatus] = useState<ProductionJobStatus | null>(null)
  const [refusal, setRefusal] = useState<TransitionRefusalBody | null>(null)

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

  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true)
    try {
      setPhotos(await fetchPhotos(id))
      setPhotosError(null)
    } catch (loadError) {
      setPhotos(null)
      setPhotosError((loadError as Error).message)
    } finally {
      setPhotosLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
    void loadPhotos()
  }, [load, loadPhotos])

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

      // The verdict IS the transition — the API moves the job in the same
      // transaction — so the panel above has to be re-read, not just the history.
      await Promise.all([load(), loadPhotos()])
      setRefusal(null)
    } catch (recordError) {
      setReviewError((recordError as Error).message)
    } finally {
      setIsRecording(false)
    }
  }

  /**
   * One move, and the refusal rendered inline if it is refused.
   *
   * A 409 is not an error banner over the whole screen: the body carries
   * `{ error, code, from, to, allowed }` and, for `GUARD_NOT_EVALUABLE_HERE`,
   * the route that owns the guard. All of that goes to `TransitionRefusal`
   * beside the buttons, where the remedy is next to the thing that was refused.
   * Only a response with no recognisable body falls through to the page error.
   */
  const handleTransition = async (status: ProductionJobStatus) => {
    setPendingStatus(status)
    setRefusal(null)

    try {
      const response = await fetch(`${getApiUrl()}/api/admin/production/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Partial<
          TransitionRefusalBody
        >

        if (body.code && body.from && body.to) {
          setRefusal({
            error: body.error ?? 'This move was refused.',
            code: body.code,
            from: body.from,
            to: body.to,
            allowed: body.allowed ?? [],
            guard: body.guard,
            route: body.route,
          })
          return
        }

        throw new Error(body.error ?? 'Failed to update the job')
      }

      await Promise.all([load(), loadPhotos()])
    } catch (updateError) {
      setError((updateError as Error).message)
    } finally {
      setPendingStatus(null)
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

            <div className="space-y-2 border-t border-border pt-3">
              <h3 className="text-xs font-medium text-muted-foreground">
                Where this job can go
              </h3>
              <TransitionPanel
                status={job.status}
                onTransition={handleTransition}
                pendingStatus={pendingStatus}
                refusal={refusal}
              />
            </div>
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

          {/* The evidence */}
          <section className="space-y-3 rounded-lg border border-border p-4 lg:col-span-2">
            <h2 className="text-sm font-medium">
              Photographs{' '}
              <span className="font-normal text-muted-foreground">
                — the {STAGE_LABELS[job.stage].toLowerCase()} shot list, one live
                photo per slot
              </span>
            </h2>
            <QcShotList
              shots={photos?.shots ?? []}
              missingRequiredSlots={photos?.missingRequiredSlots ?? []}
              reviewCount={detail?.reviews.length ?? 0}
              isLoading={photosLoading}
              error={photosError}
              onRetry={() => void loadPhotos()}
            />
          </section>

          {/* QC */}
          <section className="space-y-3 rounded-lg border border-border p-4 lg:col-span-2">
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
