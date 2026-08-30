/**
 * The production panel on /admin/orders/$id.
 *
 * ## Why it exists: the items on NO job
 *
 * The queue at /admin/production lists jobs. It cannot, by construction, list
 * an order item that has no job — nothing has been ordered from a supplier for
 * it, so there is no row anywhere to show. That item is invisible work: nobody
 * is making it, nothing is late, nothing will ever be inspected, and the order
 * simply never ships complete. This panel is the ONLY surface in the admin
 * where that gap appears, which makes `unassignedOrderItems` the point of the
 * whole component rather than a nicety attached to a job list.
 *
 * A cancelled job does not count as coverage. Its item needs re-ordering, and
 * treating the cancelled row as "handled" would re-hide exactly what this panel
 * exists to reveal.
 *
 * ## The scan is gone
 *
 * This file used to page the whole production queue and match client-side,
 * because `GET /api/admin/production` had no `orderId` filter. It said so, and
 * predicted its own repair: "the day it learns the filter this narrows the scan
 * to nothing". #682 added the filter, so the queue read is now ONE request that
 * asks for this order's jobs. `MAX_SCAN_PAGES`, `SCAN_PAGE_SIZE` and the
 * `truncated` flag went with it — a guard whose reason for existing is gone is
 * not a guard, it is a branch nobody can reach or test.
 *
 * ## What did NOT go with it
 *
 * The reason that flag existed outlives it: **a confident answer over an
 * incomplete read is worse than no answer.** Four independent reads back this
 * panel, and each one owns its own loading, empty and error state:
 *
 * | Read | Answers |
 * |---|---|
 * | `GET /api/admin/production?orderId=` | which jobs exist, and so which items are on none |
 * | `GET /api/admin/orders/:id/production-readiness` | why this order cannot be labelled yet |
 * | `GET /api/admin/transfers?orderId=` | where the goods physically are |
 * | `GET /api/admin/audit-log` | whether the consolidator was chosen by the system or by a person |
 *
 * A failed read renders an error and claims nothing. Readiness in particular
 * renders the BLOCKER LIST and never a bare "not ready", and a failed readiness
 * read never renders "ready to ship" — that is the #602/#606 failure mode with
 * a courier label attached to it.
 *
 * ## Where the consolidator's provenance comes from
 *
 * `decided_by IS NULL` means the SYSTEM chose because there was nothing to
 * choose; a value means an admin stood behind an arbitrary call. That
 * distinction is the whole point of the column, and no GET exposes it —
 * `production-readiness` returns `consolidatorVendorId` and nothing more. So
 * the panel reads the newest successful `order.consolidator_set` row from the
 * audit log, whose `metadata.decision` is exactly `system_default` or
 * `admin_confirmed`. When that read fails or finds no row, the panel says the
 * provenance is unknown rather than picking one.
 *
 * ## This panel reports; it does not produce
 *
 * It has never created a job, and still does not. The one thing it writes is
 * the consolidator, because choosing who assembles the order is a judgement
 * with no other home in the admin.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertCircle, CheckCircle2, Truck } from 'lucide-react'
import type { ProductionJobStatus } from '@chobii/shared'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import {
  STAGE_LABELS,
  StatusPill,
  formatDate,
  formatRupees,
  type AdminProductionJobListItem,
  type AdminProductionPage,
} from './index'
import type { ProductionJobItemRow } from './$id'

// ============================================================================
// Types
// ============================================================================

/** A queue row with the items the job detail endpoint reports for it. */
export interface OrderProductionJob extends AdminProductionJobListItem {
  items: ProductionJobItemRow[]
}

/**
 * The slice of an order item this panel needs. Structural on purpose:
 * `OrderItem` from `components/admin/OrderDetail` satisfies it, and the panel
 * does not need to know about pricing, fulfilment or AI provenance.
 */
export interface OrderProductionPanelItem {
  id: string
  quantity: number
  snapshot?: { title?: string; sizeLabel?: string } | null
  product?: { title: string } | null
  variant?: { sizeLabel: string } | null
}

/**
 * Statuses that do NOT mean the item is being made.
 *
 * Typed against the shared vocabulary rather than left as bare strings. This is
 * the one file whose purpose is NOT to write the vocabulary down, and a `Set`
 * of loose strings hides a typo perfectly: a misspelt status matches no job at
 * all, so every job counts as coverage, every consolidator option survives, and
 * the panel's one requirement — showing the items on no job — silently reports
 * nothing. `Set<ProductionJobStatus>` makes that a compile error; the
 * `ReadonlySet<string>` annotation keeps `.has()` open to a raw status off the
 * wire, retired values included.
 */
const NON_COVERING_STATUSES: ReadonlySet<string> = new Set<ProductionJobStatus>([
  'cancelled',
])

// ============================================================================
// The gap
// ============================================================================

/**
 * The order items that appear on no live production job.
 *
 * Order preserved from the order itself, so the panel reads down the invoice
 * rather than in whatever order the jobs happened to come back.
 */
export function unassignedOrderItems(
  orderItems: OrderProductionPanelItem[],
  jobs: OrderProductionJob[]
): OrderProductionPanelItem[] {
  const covered = new Set<string>()

  for (const job of jobs) {
    if (NON_COVERING_STATUSES.has(job.status)) continue
    for (const item of job.items) covered.add(item.orderItemId)
  }

  return orderItems.filter((item) => !covered.has(item.id))
}

export function itemTitle(item: OrderProductionPanelItem): string {
  return item.snapshot?.title ?? item.product?.title ?? 'Untitled item'
}

export function itemSize(item: OrderProductionPanelItem): string | null {
  return item.variant?.sizeLabel ?? item.snapshot?.sizeLabel ?? null
}

// ============================================================================
// Readiness: why this order cannot be labelled yet
// ============================================================================

/**
 * `LabelBlockerCode` from `packages/api/src/lib/production-readiness.ts`,
 * verbatim. One code per condition of the predicate, so a blocker always maps
 * back to a line of the spec rather than to an implementation detail.
 */
export type LabelBlockerCode =
  | 'order_not_found'
  | 'no_jobs'
  | 'no_consolidator'
  | 'consolidator_holds_no_job'
  | 'item_uncovered'
  | 'job_not_qc_passed'
  | 'goods_not_at_consolidator'
  | 'transfer_in_flight'
  | 'transfer_lost'

export interface LabelBlocker {
  code: LabelBlockerCode
  /** The API's own sentence: what is wrong. */
  message: string
  jobId?: string
  orderItemId?: string
  transferId?: string
  stage?: string
}

/** `GET /api/admin/orders/:orderId/production-readiness`, verbatim. */
export interface OrderReadiness {
  orderId: string
  ready: boolean
  consolidatorVendorId: string | null
  blockers: LabelBlocker[]
  blockerCodes: LabelBlockerCode[]
}

/**
 * What to DO about each blocker.
 *
 * The API's `message` says what is wrong; these say what clears it, and they
 * are deliberately all different. "Not ready" with no reason is the bug this
 * whole seam exists to prevent, and a reason with no next step is only half a
 * repair of it — an admin reading this panel is trying to get an order moving,
 * not to admire a diagnosis.
 */
export const BLOCKER_ACTIONS: Record<LabelBlockerCode, string> = {
  order_not_found:
    'No order row was read for this id, so nothing on this screen describes a ' +
    'real order. Check the id in the address bar — an order that was deleted ' +
    'reads exactly like an order with nothing to make.',
  no_jobs:
    'Nothing has been ordered from a supplier yet. Raise the print job, and the ' +
    'frame job too if any line on this order has a frame.',
  no_consolidator:
    'Nobody has decided which vendor assembles and ships this order. Choose one ' +
    'in the consolidator picker above — that is the only place the decision is made.',
  consolidator_holds_no_job:
    'The consolidator holds no live job, so shipping from there would ship an ' +
    'empty box. Either move work to them, or set the consolidator to the vendor ' +
    'that actually holds the goods.',
  item_uncovered:
    'An order line has no live job for a stage it needs. Raise the missing job — ' +
    'a framed piece needs BOTH a print and a frame job, and a cancelled job ' +
    'covers nothing.',
  job_not_qc_passed:
    'A job has not passed inspection yet. Open it, review the photographs and ' +
    'record a verdict; a job that failed needs re-printing, not a label.',
  goods_not_at_consolidator:
    'The goods for a job are not physically where the parcel would be collected ' +
    'from. Book a transfer to the consolidator, or make the vendor already ' +
    'holding them the consolidator.',
  transfer_in_flight:
    'A parcel is still travelling. Wait for the receiving vendor to mark it ' +
    'arrived, or chase the carrier with the docket reference in the transfers ' +
    'list below.',
  transfer_lost:
    'A parcel was declared lost, and a replacement draft job was raised for each ' +
    'job it carried. Assign those replacements — the original will not arrive.',
}

/**
 * The next step for a blocker code, including one the API learns after this
 * file was written. An unknown code still renders its own message; what it
 * loses is the advice, and saying so is better than silently dropping a
 * blocker off a list whose completeness is the point.
 */
export function blockerAction(code: string): string {
  return (
    BLOCKER_ACTIONS[code as LabelBlockerCode] ??
    'This panel has no guidance for this blocker yet. The message above comes ' +
      'straight from the readiness check.'
  )
}

// ============================================================================
// Transfers: where the goods physically are
// ============================================================================

/**
 * Derived from three timestamps rather than stored — there is no transfer
 * status enum, deliberately, so a fourth state later costs a nullable column
 * instead of a migration.
 */
export type TransferState = 'pending' | 'in_transit' | 'received' | 'lost'

/** `GET /api/admin/transfers`, verbatim. */
export interface OrderTransfer {
  id: string
  orderId: string
  fromVendorId: string
  fromVendorName: string | null
  toVendorId: string
  toVendorName: string | null
  carrier: string | null
  reference: string | null
  pieceCount: number
  /** decimal(10,2) INR as a string. */
  costAmount: string | null
  dispatchedAt: string | null
  expectedBy: string | null
  receivedAt: string | null
  lostAt: string | null
  lostNote: string | null
  createdAt: string
  updatedAt: string
  state: TransferState
  jobIds: string[]
}

export interface OrderTransfersPage {
  items: OrderTransfer[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const TRANSFER_STATE_LABELS: Record<TransferState, string> = {
  pending: 'Booked',
  in_transit: 'In transit',
  received: 'Arrived',
  lost: 'Lost',
}

/** In words beside the pill: a colour alone is invisible to half the readers. */
export const TRANSFER_STATE_MEANING: Record<TransferState, string> = {
  pending: 'Booked, not handed to the carrier yet',
  in_transit: 'With the carrier, not yet marked arrived',
  received: 'Arrived at the receiving vendor',
  lost: 'Declared lost; replacement jobs were raised',
}

const TRANSFER_STATE_STYLES: Record<TransferState, string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  in_transit: 'bg-amber-50 text-amber-700 border-amber-200',
  received: 'bg-green-50 text-green-700 border-green-200',
  lost: 'bg-red-50 text-red-700 border-red-200',
}

// ============================================================================
// The consolidator: who assembles and ships the order
// ============================================================================

/**
 * `decided_by IS NULL` versus a value. The system PROPOSES and an admin
 * CONFIRMS, and this is the difference between "there was nothing to choose"
 * and "somebody chose" — which is exactly why an arbitrary call is written as a
 * confirmed one rather than silently.
 */
export type ConsolidatorDecision = 'system_default' | 'admin_confirmed'

export interface ConsolidatorProvenance {
  decision: ConsolidatorDecision
  /** Null on a system default: nobody decided, so nobody is named. */
  actorEmail: string | null
  decidedAt: string | null
  /** `sole_vendor` / `confirmed_proposal` / `admin_override`. */
  basis: string | null
}

/** One audit row, reduced to the fields the provenance is read out of. */
export interface ConsolidatorAuditEntry {
  action: string
  outcome: string
  createdAt: string
  actorEmail: string | null
  metadata?: Record<string, unknown> | null
}

export interface ConsolidatorOption {
  id: string
  name: string
}

/**
 * Who the consolidator may be: the vendors holding a live job on this order.
 *
 * Not every vendor in the directory. A consolidator holding no job on the order
 * is itself a readiness blocker (`consolidator_holds_no_job`), so offering the
 * whole directory would be offering a list of ways to jam the order.
 */
export function orderVendorOptions(jobs: OrderProductionJob[]): ConsolidatorOption[] {
  const byId = new Map<string, string>()

  for (const job of jobs) {
    if (NON_COVERING_STATUSES.has(job.status)) continue
    if (!job.vendorId) continue
    byId.set(job.vendorId, job.vendorName ?? job.vendorId)
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * A vendor's name from the rows already on screen, or null.
 *
 * Null rather than the id: the caller shows the id and says it could not name
 * it, which is honest, where a bare uuid in a "Consolidator" field reads as a
 * rendering bug.
 */
export function vendorNameFor(
  vendorId: string | null,
  jobs: OrderProductionJob[],
  transfers: OrderTransfer[]
): string | null {
  if (!vendorId) return null

  for (const job of jobs) {
    if (job.vendorId === vendorId && job.vendorName) return job.vendorName
  }

  for (const transfer of transfers) {
    if (transfer.fromVendorId === vendorId && transfer.fromVendorName) {
      return transfer.fromVendorName
    }
    if (transfer.toVendorId === vendorId && transfer.toVendorName) {
      return transfer.toVendorName
    }
  }

  return null
}

/**
 * The provenance of the standing consolidator, read off the audit trail.
 *
 * Null when no successful `order.consolidator_set` row is in the page, or when
 * the row does not carry a decision this file recognises. Null means UNKNOWN
 * and is rendered as such — guessing `system_default` from a missing actor
 * would invent the very claim the column exists to make checkable.
 */
export function provenanceFromAuditEntries(
  entries: ConsolidatorAuditEntry[]
): ConsolidatorProvenance | null {
  // The API returns newest first, so the first match is the standing decision.
  const entry = entries.find(
    (row) => row.action === 'order.consolidator_set' && row.outcome === 'success'
  )
  if (!entry) return null

  const raw = entry.metadata?.decision
  const decision: ConsolidatorDecision | null =
    raw === 'system_default' || raw === 'admin_confirmed' ? raw : null
  if (decision === null) return null

  const basis = entry.metadata?.basis
  return {
    decision,
    actorEmail: decision === 'admin_confirmed' ? entry.actorEmail : null,
    decidedAt: entry.createdAt,
    basis: typeof basis === 'string' ? basis : null,
  }
}

/** A refusal from `POST /:orderId/consolidator`, kept whole. */
export interface ConsolidatorRefusal {
  status: number
  code: string | null
  /** The API's own sentence. */
  message: string
  currentVendorId?: string | null
  proposedVendorId?: string | null
}

export class ConsolidatorRefused extends Error {
  constructor(readonly refusal: ConsolidatorRefusal) {
    super(refusal.message)
    this.name = 'ConsolidatorRefused'
  }
}

/**
 * What an admin can actually do about a refusal.
 *
 * The 409 is the one that matters: the goods are already moving, and a screen
 * that swallowed it would leave somebody clicking a button that will never
 * work. Each case names the action that resolves it instead.
 */
export function consolidatorRefusalAdvice(refusal: ConsolidatorRefusal): string {
  switch (refusal.code) {
    case 'TRANSFER_DISPATCHED':
      return (
        'A parcel on this order has already been handed to the carrier, so the ' +
        'goods are physically on their way to the current consolidator. ' +
        'Re-routing them is a phone call to the carrier, not a database write. ' +
        'If the parcel is genuinely gone, declare that transfer lost — the ' +
        'replacement work is free to go somewhere else.'
      )
    case 'CONFIRMATION_REQUIRED':
      return (
        'The jobs on this order sit at more than one vendor, so which one ' +
        'assembles it is a judgement rather than a fact. The system will not ' +
        'write that silently: pick the vendor yourself and confirm it, so the ' +
        'record shows who chose.'
      )
    case 'NOTHING_TO_PROPOSE':
      return (
        'No job on this order is assigned to a vendor yet, so there is nobody ' +
        'to consolidate at. Assign a job first, then come back.'
      )
    case 'CONCURRENT_MODIFICATION':
      return (
        'Somebody else changed the consolidator while this was open, so nothing ' +
        'was written. Reload the order and look at the current value before ' +
        'choosing again.'
      )
    default:
      return refusal.status === 404
        ? 'Either the order or the vendor no longer exists. Reload the order.'
        : 'Nothing was written. Try again, and if it keeps failing check the API logs.'
  }
}

// ============================================================================
// The panel body — skeleton / error / empty / content
// ============================================================================

export interface OrderProductionPanelBodyProps {
  jobs: OrderProductionJob[]
  orderItems: OrderProductionPanelItem[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

export function OrderProductionPanelBody({
  jobs,
  orderItems,
  isLoading,
  error,
  onRetry,
}: OrderProductionPanelBodyProps) {
  // Error first, and it claims nothing: no job count, no coverage verdict.
  if (error) {
    return (
      <SectionError
        testId="admin-order-production-error"
        retryTestId="admin-order-production-retry"
        error={error}
        hint={
          'Whether anything on this order is being made is unknown — the queue ' +
          'was not read. That is not the same as nothing being made.'
        }
        onRetry={onRetry}
      />
    )
  }

  if (isLoading) {
    return (
      <SectionSkeleton
        testId="admin-order-production-skeleton"
        label="Loading production for this order"
        rows={['a', 'b']}
      />
    )
  }

  const unassigned = unassignedOrderItems(orderItems, jobs)

  return (
    <div className="space-y-4">
      {jobs.length === 0 ? (
        <div
          data-testid="admin-order-production-empty"
          className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
        >
          No production job has been raised for this order yet.
        </div>
      ) : (
        <ul data-testid="admin-order-production-jobs" className="space-y-2">
          {jobs.map((job) => {
            const payable = formatRupees(job.payableAmount)
            const covered = job.items
              .map((jobItem) => orderItems.find((oi) => oi.id === jobItem.orderItemId))
              .filter((oi): oi is OrderProductionPanelItem => oi !== undefined)

            return (
              <li
                key={job.id}
                data-testid={`admin-order-production-job-${job.id}`}
                className="rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/admin/production/$id"
                      params={{ id: job.id }}
                      className="font-mono text-xs font-medium text-brand-600 hover:underline"
                    >
                      {job.id.slice(0, 8)}
                    </Link>
                    <span>{STAGE_LABELS[job.stage]}</span>
                    <StatusPill status={job.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span>
                      {/* "Unassigned" in words — a blank reads as a bug. */}
                      {job.vendorName ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </span>
                    <span className="tabular-nums">
                      {payable ?? <span className="text-destructive">Unavailable</span>}
                    </span>
                  </div>
                </div>

                {covered.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {covered.map((item) => (
                      <li key={item.id}>
                        {itemTitle(item)}
                        {itemSize(item) ? ` — ${itemSize(item)}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* The coverage verdict, and it is only ever printed over a read that
          completed — an error above returns before reaching here. */}
      {unassigned.length > 0 ? (
        <div
          data-testid="admin-order-production-unassigned"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <p className="mb-2 font-medium">
            On no production job — nobody is making these:
          </p>
          <ul className="space-y-0.5">
            {unassigned.map((item) => (
              <li
                key={item.id}
                data-testid={`admin-order-production-unassigned-item-${item.id}`}
              >
                {itemTitle(item)}
                {itemSize(item) ? ` — ${itemSize(item)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p
          data-testid="admin-order-production-all-covered"
          className="rounded-lg border border-border p-3 text-sm text-muted-foreground"
        >
          Every item on this order is on a live production job.
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Shared read states
// ============================================================================

/**
 * The failure state every read on this panel shares.
 *
 * `hint` is required rather than optional on purpose: an error banner with no
 * sentence saying what is now UNKNOWN invites the reader to fill the gap in
 * themselves, and they fill it in optimistically every time.
 */
function SectionError({
  testId,
  retryTestId,
  error,
  hint,
  onRetry,
}: {
  testId: string
  retryTestId: string
  error: string
  hint: string
  onRetry: () => void
}) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      <div className="mb-1 flex items-center gap-2 font-medium">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {error}
      </div>
      <p className="mb-3 text-muted-foreground">{hint}</p>
      <Button type="button" variant="outline" data-testid={retryTestId} onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function SectionSkeleton({
  testId,
  label,
  rows,
}: {
  testId: string
  label: string
  rows: string[]
}) {
  return (
    <div data-testid={testId} className="space-y-2" aria-busy="true" aria-label={label}>
      {rows.map((key) => (
        <div key={key} className="h-16 animate-pulse rounded bg-muted" aria-hidden="true" />
      ))}
    </div>
  )
}

// ============================================================================
// The readiness panel — blockers, never a bare "not ready"
// ============================================================================

export interface OrderReadinessPanelProps {
  readiness: OrderReadiness | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

export function OrderReadinessPanel({
  readiness,
  isLoading,
  error,
  onRetry,
}: OrderReadinessPanelProps) {
  // Error FIRST, and it never falls through to a verdict. A readiness read that
  // failed is the one state where an optimistic "ready to ship" buys a courier
  // label for goods that are not there.
  if (error) {
    return (
      <SectionError
        testId="admin-order-readiness-error"
        retryTestId="admin-order-readiness-retry"
        error={error}
        hint={
          'Whether this order can be labelled is unknown — the check did not ' +
          'answer. Unknown is not the same as ready, and nothing below should ' +
          'be read as clearance to ship.'
        }
        onRetry={onRetry}
      />
    )
  }

  if (isLoading || !readiness) {
    return (
      <SectionSkeleton
        testId="admin-order-readiness-skeleton"
        label="Checking whether this order can be labelled"
        rows={['a', 'b']}
      />
    )
  }

  if (readiness.ready) {
    return (
      <div
        data-testid="admin-order-readiness-ready"
        className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
      >
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Ready to label
        </div>
        <p className="mt-1">
          Every item is on a job, every job has passed inspection, and the goods
          are all at the consolidator.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="admin-order-readiness-blockers"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p className="mb-2 font-medium">
        Not ready to label. {readiness.blockers.length === 1 ? 'One thing is' : 'These are'}{' '}
        in the way:
      </p>
      <ul className="space-y-2">
        {readiness.blockers.map((blocker, index) => (
          <li
            // The code is on the id AND on an attribute: a screen reader gets
            // the sentences, and a test gets the code without matching English.
            key={`${blocker.code}-${blocker.jobId ?? blocker.orderItemId ?? blocker.transferId ?? index}`}
            data-testid={`admin-order-readiness-blocker-${blocker.code}`}
            data-blocker-code={blocker.code}
            className="rounded border border-amber-200 bg-white/60 p-2"
          >
            <p className="font-medium">{blocker.message}</p>
            <p className="mt-1 text-amber-800">{blockerAction(blocker.code)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// The consolidator picker
// ============================================================================

/**
 * Every claim this section makes is wired to the read it depends on.
 *
 * Three different reads back one box. Who the consolidator IS comes from
 * readiness; who it COULD be comes from the jobs read; how it was decided comes
 * from the audit trail. Hanging all three off `isLoading`/`error` — which is
 * what this component used to do — meant a 500 on the jobs read still rendered
 * "no vendor holds a live job on this order yet, so there is nobody to
 * consolidate at. Assign a job first", in full confidence, over a list that was
 * never read. That sentence sends an admin to raise a second set of jobs for an
 * order that already has them: #602/#606 with a purchase order attached.
 */
export interface ConsolidatorPickerProps {
  /** From the readiness read — the only endpoint that reports it. */
  consolidatorVendorId: string | null
  /** Null means the provenance is UNKNOWN, not that the system chose. */
  provenance: ConsolidatorProvenance | null
  /** The audit read is still running: unknown, and not yet answerable. */
  provenanceLoading: boolean
  /** The audit read FAILED, which is a different unknown from "no row". */
  provenanceError: string | null
  /** From the jobs read: the vendors holding a live job on this order. */
  options: ConsolidatorOption[]
  /** The jobs read's own states — `options` is empty under both of them. */
  optionsLoading: boolean
  optionsError: string | null
  onRetryOptions: () => void
  /** Names the vendor id when a job or transfer on screen carries the name. */
  vendorName: string | null
  /**
   * Whether BOTH reads that could name the vendor completed. A null
   * `vendorName` under a failed jobs or transfers read means "not read", not
   * "nothing on this order names it".
   */
  nameLookupComplete: boolean
  /** The readiness read's states: whether there IS a consolidator. */
  isLoading: boolean
  error: string | null
  isSaving: boolean
  refusal: ConsolidatorRefusal | null
  onChoose: (vendorId: string) => void
  onUseSystemDefault: () => void
  onRetry: () => void
}

export function ConsolidatorPicker({
  consolidatorVendorId,
  provenance,
  provenanceLoading,
  provenanceError,
  options,
  optionsLoading,
  optionsError,
  onRetryOptions,
  vendorName,
  nameLookupComplete,
  isLoading,
  error,
  isSaving,
  refusal,
  onChoose,
  onUseSystemDefault,
  onRetry,
}: ConsolidatorPickerProps) {
  const [selected, setSelected] = useState('')

  if (error) {
    return (
      <SectionError
        testId="admin-order-consolidator-error"
        retryTestId="admin-order-consolidator-retry"
        error={error}
        hint={
          'Who assembles and ships this order is unknown — the read failed. ' +
          'Setting one from here now would be choosing without seeing what is ' +
          'already recorded.'
        }
        onRetry={onRetry}
      />
    )
  }

  if (isLoading) {
    return (
      <SectionSkeleton
        testId="admin-order-consolidator-skeleton"
        label="Loading the consolidator for this order"
        rows={['a']}
      />
    )
  }

  return (
    <div data-testid="admin-order-consolidator" className="space-y-3">
      <div
        data-testid="admin-order-consolidator-current"
        className="rounded-lg border border-border p-3 text-sm"
      >
        {consolidatorVendorId ? (
          <>
            <p className="font-medium">
              {vendorName ?? (
                <>
                  <span className="font-mono text-xs">{consolidatorVendorId}</span>{' '}
                  {/* The name is looked up in the jobs and transfers on screen,
                      so "nothing names it" is only sayable once both were
                      read. Under a failed read the id is unnamed, not unnamable. */}
                  {nameLookupComplete ? (
                    <span
                      data-testid="admin-order-consolidator-name-none"
                      className="font-normal text-muted-foreground"
                    >
                      (no job or transfer on this order names this vendor)
                    </span>
                  ) : (
                    <span
                      data-testid="admin-order-consolidator-name-unread"
                      className="font-normal text-muted-foreground"
                    >
                      (the jobs and transfers on this order were not read, so
                      this id could not be named — that is not the same as
                      nothing naming it)
                    </span>
                  )}
                </>
              )}
            </p>
            {provenance ? (
              <p
                data-testid="admin-order-consolidator-provenance"
                data-decision={provenance.decision}
                className="mt-1 text-muted-foreground"
              >
                {provenance.decision === 'system_default' ? (
                  <>
                    <span className="font-medium text-foreground">System default</span> —
                    one vendor already held every job, so there was nothing to
                    choose and nobody confirmed it.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      Confirmed by an admin
                    </span>{' '}
                    — {provenance.actorEmail ?? 'an admin'} stood behind this choice on{' '}
                    {formatDate(provenance.decidedAt)}.
                  </>
                )}
              </p>
            ) : provenanceError ? (
              /* A read that FAILED, told apart from a trail with no row in it.
                 Both end in "unknown" and neither guesses, but only one of them
                 is worth retrying, and printing "not recorded" over a 500 says
                 the audit trail is empty when nobody has looked. #698 is the
                 standing bill for the missing GET; this is not it. */
              <p
                data-testid="admin-order-consolidator-provenance-error"
                className="mt-1 text-muted-foreground"
              >
                How this was decided could not be read — the audit trail read
                failed: {provenanceError}. Whether the system defaulted to it or
                an admin confirmed it is unknown, and nothing was found saying
                otherwise because nothing was read.
              </p>
            ) : provenanceLoading ? (
              <p
                data-testid="admin-order-consolidator-provenance-loading"
                className="mt-1 text-muted-foreground"
              >
                Reading how this was decided from the audit trail…
              </p>
            ) : (
              <p
                data-testid="admin-order-consolidator-provenance-unknown"
                className="mt-1 text-muted-foreground"
              >
                How this was decided is not recorded here — the audit trail holds
                no successful order.consolidator_set row for this order. Whether
                the system defaulted to it or an admin confirmed it is unknown.
              </p>
            )}
          </>
        ) : (
          <p data-testid="admin-order-consolidator-none" className="text-muted-foreground">
            Nobody has decided which vendor assembles and ships this order.
          </p>
        )}
      </div>

      {/* The picker offers only vendors holding a live job on this order — a
          consolidator holding nothing is itself a blocker. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="admin-order-consolidator-select">
          Consolidating vendor
        </label>
        <select
          id="admin-order-consolidator-select"
          data-testid="admin-order-consolidator-select"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          value={selected}
          disabled={isSaving || optionsLoading || Boolean(optionsError) || options.length === 0}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Choose a vendor…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>

        <Button
          type="button"
          data-testid="admin-order-consolidator-save"
          disabled={!selected || isSaving}
          onClick={() => onChoose(selected)}
        >
          {isSaving ? 'Saving…' : 'Set consolidator'}
        </Button>

        <Button
          type="button"
          variant="outline"
          data-testid="admin-order-consolidator-default"
          disabled={isSaving}
          onClick={onUseSystemDefault}
        >
          Use the system default
        </Button>
      </div>

      {/* `options` is empty three ways, and only ONE of them is "nobody holds
          a live job". The other two are "not read yet" and "the read failed",
          and telling an admin to assign a job over either of those is telling
          them to duplicate the jobs this order already has. */}
      {optionsError ? (
        <SectionError
          testId="admin-order-consolidator-options-error"
          retryTestId="admin-order-consolidator-options-retry"
          error={optionsError}
          hint={
            'Which vendors hold a live job on this order is unknown — the job ' +
            'list did not load. That is not the same as nobody holding one, so ' +
            'do not raise fresh jobs on the strength of this screen.'
          }
          onRetry={onRetryOptions}
        />
      ) : optionsLoading ? (
        <p
          data-testid="admin-order-consolidator-options-loading"
          className="text-sm text-muted-foreground"
        >
          Reading which vendors hold a live job on this order…
        </p>
      ) : options.length === 0 ? (
        <p
          data-testid="admin-order-consolidator-no-options"
          className="text-sm text-muted-foreground"
        >
          No vendor holds a live job on this order yet, so there is nobody to
          consolidate at. Assign a job first.
        </p>
      ) : null}

      {/* The refusal is EXPLAINED, not swallowed. A 409 here means the goods
          are already moving, which no amount of retrying changes. */}
      {refusal && (
        <div
          data-testid="admin-order-consolidator-refusal"
          data-refusal-status={String(refusal.status)}
          data-refusal-code={refusal.code ?? 'none'}
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <p className="font-medium">{refusal.message}</p>
          <p className="mt-1 text-muted-foreground">
            {consolidatorRefusalAdvice(refusal)}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// The transfers on this order
// ============================================================================

export interface OrderTransfersPanelProps {
  transfers: OrderTransfer[] | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

export function OrderTransfersPanel({
  transfers,
  isLoading,
  error,
  onRetry,
}: OrderTransfersPanelProps) {
  if (error) {
    return (
      <SectionError
        testId="admin-order-transfers-error"
        retryTestId="admin-order-transfers-retry"
        error={error}
        hint={
          'Where the goods physically are is unknown — the transfer list did not ' +
          'load. An order with no transfers and an order whose transfers could ' +
          'not be read look identical, and they are not the same thing.'
        }
        onRetry={onRetry}
      />
    )
  }

  if (isLoading || !transfers) {
    return (
      <SectionSkeleton
        testId="admin-order-transfers-skeleton"
        label="Loading the transfers on this order"
        rows={['a']}
      />
    )
  }

  if (transfers.length === 0) {
    return (
      <p
        data-testid="admin-order-transfers-empty"
        className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
      >
        Nothing has been couriered between vendors for this order.
      </p>
    )
  }

  return (
    <ul data-testid="admin-order-transfers" className="space-y-2">
      {transfers.map((transfer) => (
        <li
          key={transfer.id}
          data-testid={`admin-order-transfer-${transfer.id}`}
          data-transfer-state={transfer.state}
          className="rounded-lg border border-border p-3 text-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>
                {transfer.fromVendorName ?? 'Unknown vendor'} →{' '}
                {transfer.toVendorName ?? 'Unknown vendor'}
              </span>
              <span
                className={cn(
                  'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                  TRANSFER_STATE_STYLES[transfer.state]
                )}
              >
                {TRANSFER_STATE_LABELS[transfer.state]}
              </span>
            </div>
            <span className="tabular-nums text-muted-foreground">
              {transfer.pieceCount} {transfer.pieceCount === 1 ? 'piece' : 'pieces'}
              {formatRupees(transfer.costAmount) ? ` · ${formatRupees(transfer.costAmount)}` : ''}
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {TRANSFER_STATE_MEANING[transfer.state]}
            {transfer.carrier ? ` · ${transfer.carrier}` : ''}
            {transfer.reference ? ` · ${transfer.reference}` : ''}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Dispatched {formatDate(transfer.dispatchedAt)} · expected{' '}
            {formatDate(transfer.expectedBy)} · arrived {formatDate(transfer.receivedAt)}
          </p>

          {transfer.lostAt && (
            <p className="mt-1 text-xs text-destructive">
              Declared lost {formatDate(transfer.lostAt)}
              {transfer.lostNote ? ` — ${transfer.lostNote}` : ''}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

// ============================================================================
// Data access
// ============================================================================

/**
 * The API's own page cap. One order cannot plausibly carry more jobs than this
 * — it is one job per stage per item — so a single page is the whole answer.
 */
const JOB_PAGE_SIZE = 100

/**
 * This order's production jobs, each carrying the order items it covers.
 *
 * ONE queue request. If the answer somehow does not fit on a page this throws
 * rather than returning a short list: the panel's coverage verdict is only
 * honest over a complete read, and a quietly truncated list is the fabrication
 * the deleted `truncated` flag existed to prevent. An error the admin can see
 * is the cheap, correct replacement for the page loop.
 */
export async function fetchOrderProductionJobs(
  orderId: string
): Promise<OrderProductionJob[]> {
  const query = new URLSearchParams({
    page: '1',
    pageSize: String(JOB_PAGE_SIZE),
    orderId,
  })

  const response = await fetch(
    `${getApiUrl()}/api/admin/production?${query.toString()}`,
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load production jobs')
  }

  const data = (await response.json()) as AdminProductionPage

  // `undefined > n` is false, so a page that carried no `total` used to walk
  // straight past this guard into a coverage verdict over an unverified list.
  // Unverifiable is not the same as complete.
  if (typeof data.total !== 'number' || data.total > data.items.length) {
    throw new Error(
      'This order has more production jobs than this panel reads in one page, ' +
        'or the queue did not say how many there are, so what is covered ' +
        'cannot be answered here. Check the production queue.'
    )
  }

  // Items come from the detail endpoint — the queue row carries none, and
  // "which item is on which job" is half of what this panel answers.
  return Promise.all(
    data.items.map(async (job) => {
      const detailResponse = await fetch(
        `${getApiUrl()}/api/admin/production/${job.id}`,
        { credentials: 'include' }
      )

      if (!detailResponse.ok) {
        const body = (await detailResponse.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(body.error ?? 'Failed to load a production job')
      }

      const detail = (await detailResponse.json()) as { items: ProductionJobItemRow[] }
      return { ...job, items: detail.items }
    })
  )
}

/** `GET /api/admin/orders/:orderId/production-readiness`. */
export async function fetchOrderReadiness(orderId: string): Promise<OrderReadiness> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/orders/${orderId}/production-readiness`,
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to check whether this order can be labelled')
  }

  return (await response.json()) as OrderReadiness
}

/** `GET /api/admin/transfers?orderId=`. One order's legs, newest first. */
export async function fetchOrderTransfers(orderId: string): Promise<OrderTransfer[]> {
  const query = new URLSearchParams({
    page: '1',
    pageSize: String(JOB_PAGE_SIZE),
    orderId,
  })

  const response = await fetch(
    `${getApiUrl()}/api/admin/transfers?${query.toString()}`,
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load the transfers on this order')
  }

  return ((await response.json()) as OrderTransfersPage).items
}

/**
 * The standing consolidator decision, out of the audit trail.
 *
 * The only place `decided_by` is legible from outside the database: no read
 * route returns the `order_consolidation` row, and `production-readiness`
 * reports the vendor id alone. `order.consolidator_set` is audited on every
 * write — by an admin and by the system default alike — with
 * `metadata.decision` spelling out which it was, so the trail answers a
 * question the API does not.
 */
export async function fetchConsolidatorProvenance(
  orderId: string
): Promise<ConsolidatorProvenance | null> {
  const query = new URLSearchParams({
    entityType: 'order',
    entityId: orderId,
    action: 'order.consolidator_set',
    outcome: 'success',
    limit: '1',
  })

  const response = await fetch(
    `${getApiUrl()}/api/admin/audit-log?${query.toString()}`,
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to read who chose the consolidator')
  }

  const data = (await response.json()) as { entries: ConsolidatorAuditEntry[] }
  return provenanceFromAuditEntries(data.entries ?? [])
}

/**
 * `POST /api/admin/orders/:orderId/consolidator`.
 *
 * `vendorId` omitted asks for the system default, which the API writes only
 * when there is genuinely nothing to choose; otherwise it comes back 422
 * carrying its proposal. A refusal is thrown WHOLE — status, code and the
 * API's own sentence — because "could not save" over a 409 would hide the one
 * fact that matters: the goods are already moving.
 */
export async function setOrderConsolidator(
  orderId: string,
  vendorId?: string
): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/orders/${orderId}/consolidator`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vendorId ? { vendorId } : {}),
    }
  )

  if (response.ok) return

  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    code?: string
    currentVendorId?: string | null
    proposal?: { vendorId?: string | null }
  }

  throw new ConsolidatorRefused({
    status: response.status,
    code: body.code ?? null,
    message: body.error ?? 'Failed to set the consolidator',
    currentVendorId: body.currentVendorId ?? null,
    proposedVendorId: body.proposal?.vendorId ?? null,
  })
}

// ============================================================================
// The panel
// ============================================================================

/**
 * One read, with its own loading, empty and error state.
 *
 * The data is dropped WITH the error every time: a stale answer under a failure
 * banner is a claim nobody can back, and on the readiness read specifically it
 * is a claim that buys a courier label.
 */
interface AsyncRead<T> {
  data: T | null
  isLoading: boolean
  error: string | null
  reload: () => void
}

function useAsyncRead<T>(read: () => Promise<T>): AsyncRead<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setIsLoading(true)
    try {
      setData(await read())
      setError(null)
    } catch (readError) {
      setData(null)
      setError((readError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [read])

  useEffect(() => {
    void run()
  }, [run])

  return { data, isLoading, error, reload: () => void run() }
}

export interface OrderProductionPanelProps {
  orderId: string
  orderItems: OrderProductionPanelItem[]
}

export function OrderProductionPanel({ orderId, orderItems }: OrderProductionPanelProps) {
  const jobsRead = useAsyncRead(
    useCallback(() => fetchOrderProductionJobs(orderId), [orderId])
  )
  const readinessRead = useAsyncRead(
    useCallback(() => fetchOrderReadiness(orderId), [orderId])
  )
  const transfersRead = useAsyncRead(
    useCallback(() => fetchOrderTransfers(orderId), [orderId])
  )
  const provenanceRead = useAsyncRead(
    useCallback(() => fetchConsolidatorProvenance(orderId), [orderId])
  )

  const [isSaving, setIsSaving] = useState(false)
  const [refusal, setRefusal] = useState<ConsolidatorRefusal | null>(null)

  const jobs = jobsRead.data ?? []
  const transfers = transfersRead.data ?? []
  const options = useMemo(() => orderVendorOptions(jobs), [jobs])
  const consolidatorVendorId = readinessRead.data?.consolidatorVendorId ?? null

  /**
   * The vendor's NAME is looked up across two reads, so "nothing names it" is
   * only sayable when both of them answered. `jobs` and `transfers` are `[]`
   * under a failure as well as under a genuinely empty order, and the panel
   * must not read the first as the second.
   */
  const nameLookupComplete =
    !jobsRead.isLoading &&
    !jobsRead.error &&
    !transfersRead.isLoading &&
    !transfersRead.error

  const save = useCallback(
    async (vendorId?: string) => {
      setIsSaving(true)
      setRefusal(null)
      try {
        await setOrderConsolidator(orderId, vendorId)
        // Both reads move: the vendor comes from readiness, the provenance from
        // the audit row this write just made.
        readinessRead.reload()
        provenanceRead.reload()
      } catch (saveError) {
        setRefusal(
          saveError instanceof ConsolidatorRefused
            ? saveError.refusal
            : {
                status: 0,
                code: null,
                message: (saveError as Error).message,
              }
        )
      } finally {
        setIsSaving(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderId]
  )

  return (
    <section
      data-testid="admin-order-production"
      className="space-y-6 rounded-xl border border-border bg-card p-6"
    >
      <div>
        <h2 className="text-lg text-foreground">Production</h2>
        <p className="text-sm text-muted-foreground">
          What has been sent out to be made for this order — and what has not.
        </p>
      </div>

      <OrderProductionPanelBody
        jobs={jobs}
        orderItems={orderItems}
        isLoading={jobsRead.isLoading}
        error={jobsRead.error}
        onRetry={jobsRead.reload}
      />

      <div className="space-y-3 border-t border-border pt-5">
        <div>
          <h3 className="text-sm font-medium text-foreground">Consolidator</h3>
          <p className="text-sm text-muted-foreground">
            Which vendor assembles the order and hands it to the courier. The
            system proposes; an admin confirms.
          </p>
        </div>

        {/* Each prop below is wired to the read that actually answers it:
            readiness for who the consolidator is, the jobs read for who it
            could be, the audit trail for how it was decided. */}
        <ConsolidatorPicker
          consolidatorVendorId={consolidatorVendorId}
          provenance={provenanceRead.data}
          provenanceLoading={provenanceRead.isLoading}
          provenanceError={provenanceRead.error}
          options={options}
          optionsLoading={jobsRead.isLoading}
          optionsError={jobsRead.error}
          onRetryOptions={jobsRead.reload}
          vendorName={vendorNameFor(consolidatorVendorId, jobs, transfers)}
          nameLookupComplete={nameLookupComplete}
          isLoading={readinessRead.isLoading}
          error={readinessRead.error}
          isSaving={isSaving}
          refusal={refusal}
          onChoose={(vendorId) => void save(vendorId)}
          onUseSystemDefault={() => void save()}
          onRetry={readinessRead.reload}
        />
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <div>
          <h3 className="text-sm font-medium text-foreground">Ready to label?</h3>
          <p className="text-sm text-muted-foreground">
            Every reason this order cannot be handed to a courier yet, listed.
          </p>
        </div>

        <OrderReadinessPanel
          readiness={readinessRead.data}
          isLoading={readinessRead.isLoading}
          error={readinessRead.error}
          onRetry={readinessRead.reload}
        />
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <div>
          <h3 className="text-sm font-medium text-foreground">Transfers</h3>
          <p className="text-sm text-muted-foreground">
            Parcels moving between vendors for this order.
          </p>
        </div>

        <OrderTransfersPanel
          transfers={transfersRead.data}
          isLoading={transfersRead.isLoading}
          error={transfersRead.error}
          onRetry={transfersRead.reload}
        />
      </div>
    </section>
  )
}
