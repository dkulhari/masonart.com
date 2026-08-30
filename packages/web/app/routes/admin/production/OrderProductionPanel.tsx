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
 * ## Why it scans, and why it admits when the scan was cut short
 *
 * `GET /api/admin/production` filters by stage, status and vendor — there is no
 * `orderId` filter yet. So the panel pages the queue and matches client-side,
 * and sends `orderId` in the query anyway so it narrows for free the day the
 * API learns it.
 *
 * The scan is bounded (`MAX_SCAN_PAGES`), and that bound has a consequence the
 * UI must not paper over: on a queue too long to scan, "these items are on no
 * job" is a guess. So a truncated scan sets a flag, the panel withholds the
 * coverage verdict entirely and says why. Printing a reassuring "all covered"
 * off an incomplete read is #602 and #606 wearing a different hat.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import {
  STAGE_LABELS,
  StatusPill,
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

/** Statuses that do NOT mean the item is being made. */
const NON_COVERING_STATUSES = new Set(['cancelled'])

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
// The panel body — skeleton / error / empty / content
// ============================================================================

export interface OrderProductionPanelBodyProps {
  jobs: OrderProductionJob[]
  orderItems: OrderProductionPanelItem[]
  isLoading: boolean
  error: string | null
  /** The queue scan hit its page bound, so coverage cannot be answered. */
  truncated: boolean
  onRetry: () => void
}

export function OrderProductionPanelBody({
  jobs,
  orderItems,
  isLoading,
  error,
  truncated,
  onRetry,
}: OrderProductionPanelBodyProps) {
  // Error first, and it claims nothing: no job count, no coverage verdict.
  if (error) {
    return (
      <div
        data-testid="admin-order-production-error"
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <div className="mb-1 flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
        <p className="mb-3 text-muted-foreground">
          Whether anything on this order is being made is unknown — the queue was
          not read. That is not the same as nothing being made.
        </p>
        <Button
          type="button"
          variant="outline"
          data-testid="admin-order-production-retry"
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
        data-testid="admin-order-production-skeleton"
        className="space-y-2"
        aria-busy="true"
        aria-label="Loading production for this order"
      >
        {['a', 'b'].map((key) => (
          <div key={key} className="h-16 animate-pulse rounded bg-muted" aria-hidden="true" />
        ))}
      </div>
    )
  }

  const unassigned = truncated ? [] : unassignedOrderItems(orderItems, jobs)

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

      {/* The coverage verdict. Withheld outright when the scan was cut short —
          a reassuring answer off an incomplete read is worse than no answer. */}
      {truncated ? (
        <div
          data-testid="admin-order-production-truncated"
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          The production queue is longer than this panel scans, so whether every
          item on this order is on a job cannot be answered here. Check the queue
          directly.
        </div>
      ) : unassigned.length > 0 ? (
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
// Data access
// ============================================================================

/**
 * How many 100-row pages of the queue to walk before giving up. Ten pages is a
 * thousand jobs — comfortably the whole queue today, and the flag exists for
 * the day it is not.
 */
const MAX_SCAN_PAGES = 10
const SCAN_PAGE_SIZE = 100

export interface OrderProductionScan {
  jobs: OrderProductionJob[]
  truncated: boolean
}

export async function scanOrderProductionJobs(
  orderId: string
): Promise<OrderProductionScan> {
  const matched: AdminProductionJobListItem[] = []
  let truncated = false
  let page = 1

  for (;;) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(SCAN_PAGE_SIZE),
      // Ignored by the API today; the day it learns the filter this narrows
      // the scan to nothing and the loop exits on the first page.
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
    matched.push(...data.items.filter((job) => job.orderId === orderId))

    if (page >= data.totalPages || data.items.length === 0) break
    if (page >= MAX_SCAN_PAGES) {
      truncated = true
      break
    }
    page += 1
  }

  // Items come from the detail endpoint — the queue row carries none, and
  // "which item is on which job" is half of what this panel answers.
  const jobs = await Promise.all(
    matched.map(async (job) => {
      const response = await fetch(`${getApiUrl()}/api/admin/production/${job.id}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to load a production job')
      }

      const detail = (await response.json()) as { items: ProductionJobItemRow[] }
      return { ...job, items: detail.items }
    })
  )

  return { jobs, truncated }
}

// ============================================================================
// The panel
// ============================================================================

export interface OrderProductionPanelProps {
  orderId: string
  orderItems: OrderProductionPanelItem[]
}

export function OrderProductionPanel({ orderId, orderItems }: OrderProductionPanelProps) {
  const [jobs, setJobs] = useState<OrderProductionJob[]>([])
  const [truncated, setTruncated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const scan = await scanOrderProductionJobs(orderId)
      setJobs(scan.jobs)
      setTruncated(scan.truncated)
      setError(null)
    } catch (loadError) {
      // Both the jobs and the truncation flag are dropped with the error: a
      // stale coverage verdict under a failure banner is a claim we cannot back.
      setJobs([])
      setTruncated(false)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section
      data-testid="admin-order-production"
      className="space-y-3 rounded-xl border border-border bg-card p-6"
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
        isLoading={isLoading}
        error={error}
        truncated={truncated}
        onRetry={() => void load()}
      />
    </section>
  )
}
