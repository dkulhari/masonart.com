/**
 * Is this order ready for a shipping label?
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §5
 *
 * This module is the SEAM between production-pipeline and
 * order-dispatch-tracking. Production knows where the goods physically are;
 * dispatch knows how to buy a courier label. Neither should learn the other's
 * vocabulary, so exactly one function crosses the line, in one direction.
 *
 * ## Two functions, one implementation
 *
 * `getOrderLabelReadiness` answers with reasons. `isOrderReadyToLabel` is
 * literally `blockers.length === 0` over that same call — never a second query
 * with its own logic. The failure this prevents is not a wrong answer, it is
 * two *different* answers: a gate that refuses while the admin screen shows a
 * green order, or worse the reverse. There is one predicate, so there is one
 * answer.
 *
 * Both exist because a "not ready" with no reason is the exact class of bug
 * `OrderProductionPanel.tsx` already guards against — a confident answer over
 * an incomplete read. The boolean is what the gate needs; the blocker list is
 * what the screen renders.
 *
 * ## The predicate
 *
 * With `J` = the order's jobs whose status is not `cancelled`, ready **iff**:
 *
 *   - the order was actually read, and
 *   - `J` is non-empty, and
 *   - every order item requiring production is covered by some job in `J`, and
 *   - a consolidator `C` is set (`order_consolidation.vendor_id`), and
 *   - `C` holds at least one job in `J`, and
 *   - every job in `J` is `qc_passed` or `dispatched`, and
 *   - every `qc_passed` job has `vendor_id = C`, and
 *   - every `dispatched` job is on a transfer `T` with `T.to_vendor_id = C`,
 *     `T.received_at IS NOT NULL` and `T.lost_at IS NULL`.
 *
 * The single exception is an order with nothing to produce — a gift card buys
 * no goods — which is ready with an empty `J`. That exception is exactly why
 * the first clause is a clause: an id matching no row reads back as an order
 * with no items and no jobs, the same shape as the gift card, and one of the
 * two must be ready while the other must never be. A gate whose whole purpose
 * is to refuse cannot let a deleted or mistyped id through it.
 *
 * ## The property that falls out: one label per order
 *
 * Once the consolidator's OWN jobs go `dispatched` — which is what happens when
 * it hands the parcel to the courier — the predicate goes FALSE again, because a
 * `dispatched` job with no inbound *received* transfer to `C` is a blocker.
 * A second label for the same order is therefore structurally impossible: no
 * `label_created_at` column to keep in step, no advisory lock, nothing anyone
 * has to remember. `tests/lib/production-readiness.test.ts` pins it.
 *
 * That argument has a precondition, which is why `C` holding a job is a clause
 * of the predicate rather than an assumption behind it: a consolidator with no
 * live job of its own has nothing that CAN go `dispatched`, so handing the
 * parcel to the courier changes no row this predicate reads and the order stays
 * labelable forever. Cancelling `C`'s only job is enough to reach that state,
 * so the clause is checked rather than argued.
 *
 * ## Why the predicate is pure and the reading is not
 *
 * `evaluateLabelReadiness` takes a snapshot of plain rows and returns the
 * verdict. `loadOrderProductionSnapshot` does the five reads. Splitting them is
 * what makes six interacting conditions testable at all — the alternative needs
 * a whole seeded order chain per condition — and it mirrors `vendor-payables.ts`,
 * where the arithmetic is pure and the caller supplies the rows.
 *
 * ## `reader`
 *
 * Optional, and defaults to `db`. `order-dispatch-tracking` evaluates this
 * INSIDE the transaction that creates the shipment, having taken `FOR UPDATE`
 * on the order's job rows, so it passes its `tx`; the read-only admin screen
 * passes nothing. The type is the same structural shape `lib/audit.ts` uses for
 * its writer (`{ insert: typeof db.insert }`) — a single method picked off `db`,
 * which a drizzle transaction handle satisfies without a new abstraction.
 *
 * This module takes no locks of its own. A pure read cannot serialise anything,
 * and pretending otherwise would be worse than not trying; the caller that
 * needs atomicity brings the transaction.
 *
 * ## Single consumer, mechanically enforced
 *
 * `LABEL_READINESS_CONSUMERS` below is the allow-list, and
 * `tests/lib/production-seam.test.ts` scans `packages/api/src` and fails on any
 * caller outside it. The reverse scan in the same suite asserts that no
 * `lib/production-*` module imports anything named `shiprocket`. The seam is one
 * function, one way — and a manifest a reviewer reads beats a rule nobody
 * wrote down.
 */

import { eq } from 'drizzle-orm'

import { db } from '../database'
import { orders, orderItems, type OrderType } from '../database/schema/orders'
import {
  productionJobs,
  productionJobItems,
  type ProductionJobStage,
} from '../database/schema/production-jobs'
import {
  orderConsolidation,
  productionTransfers,
  productionTransferJobs,
} from '../database/schema/production-transfers'
import type { ProductionJobStatus } from './production-transitions'

/**
 * The read surface shared by `db` and a drizzle transaction handle.
 *
 * Deliberately one method, not the whole database: this module reads and does
 * nothing else, and a type that also offered `insert` would invite it to.
 */
export type ProductionReader = { select: typeof db.select }

// ============================================================================
// The snapshot the predicate reads
// ============================================================================

/** One line on the order, reduced to what decides whether it needs producing. */
export interface ReadinessItem {
  id: string
  /** A frame chosen on this line means print THEN frame. Null means print only. */
  frameId: string | null
  /** A gift-card line buys no physical goods, so nothing is produced for it. */
  isGiftCard: boolean
}

/** One production job, with the order items it covers. */
export interface ReadinessJob {
  id: string
  stage: ProductionJobStage
  status: ProductionJobStatus
  /** Null on a `draft` job nobody has assigned yet. */
  vendorId: string | null
  assignedAt: Date | null
  orderItemIds: readonly string[]
}

/**
 * One inter-vendor parcel. State is the three timestamps, exactly as the schema
 * stores it — there is no transfer status enum to mirror.
 */
export interface ReadinessTransfer {
  id: string
  toVendorId: string
  dispatchedAt: Date | null
  receivedAt: Date | null
  lostAt: Date | null
  jobIds: readonly string[]
}

export interface OrderProductionSnapshot {
  orderId: string
  /**
   * Whether an `orders` row came back for `orderId`.
   *
   * Not derivable from the rest, and required rather than optional: a deleted
   * or mistyped id reads as an order with no items and no jobs, which is
   * indistinguishable from a gift-card order unless the read says so.
   */
  orderExists: boolean
  /** `gift_card` orders buy no goods; nothing is ever produced for them. */
  orderType: OrderType
  items: readonly ReadinessItem[]
  jobs: readonly ReadinessJob[]
  transfers: readonly ReadinessTransfer[]
  /** `order_consolidation.vendor_id`. Null means undecided, which blocks. */
  consolidatorVendorId: string | null
}

// ============================================================================
// The verdict
// ============================================================================

/**
 * Why an order cannot be labelled yet.
 *
 * One code per condition of the predicate, so a blocker always maps back to a
 * line of the spec rather than to an implementation detail.
 */
export type LabelBlockerCode =
  /** No `orders` row was read for this id: deleted, or never existed. */
  | 'order_not_found'
  /** The order has work to do and no live job doing it. */
  | 'no_jobs'
  /** Nobody has decided which vendor assembles and ships the order. */
  | 'no_consolidator'
  /** The consolidator holds no live job, so shipping would change nothing. */
  | 'consolidator_holds_no_job'
  /** An order item requiring production has no live job covering that stage. */
  | 'item_uncovered'
  /** A live job has not reached `qc_passed` (or has failed back). */
  | 'job_not_qc_passed'
  /** The goods for a job are not physically at the consolidator. */
  | 'goods_not_at_consolidator'
  /** The parcel carrying a job is still travelling. */
  | 'transfer_in_flight'
  /** The parcel carrying a job was declared lost; a replacement job is needed. */
  | 'transfer_lost'

export interface LabelBlocker {
  code: LabelBlockerCode
  /** One sentence the admin screen can render as-is. */
  message: string
  jobId?: string
  orderItemId?: string
  transferId?: string
  /** Which production stage is missing, on `item_uncovered`. */
  stage?: ProductionJobStage
}

export interface LabelReadiness {
  ready: boolean
  consolidatorVendorId: string | null
  blockers: LabelBlocker[]
}

/**
 * The production stages an order line needs before it can be packed.
 *
 * `frame_id IS NULL` is a rolled poster: print only. A frame on the line means
 * print then frame, and BOTH have to exist — a framed piece covered only by its
 * print job is a poster in a tube, and shipping it is the bug. A gift-card line
 * needs nothing at all.
 */
export function requiredStagesFor(item: ReadinessItem): readonly ProductionJobStage[] {
  if (item.isGiftCard) return []
  return item.frameId ? ['print', 'frame'] : ['print']
}

/** The order's jobs that still count: cancellation has no out-edge. */
function liveJobs(snapshot: OrderProductionSnapshot): readonly ReadinessJob[] {
  return snapshot.jobs.filter((job) => job.status !== 'cancelled')
}

/** The lines that have to be made before anything can be shipped. */
function producibleItems(snapshot: OrderProductionSnapshot): readonly ReadinessItem[] {
  if (snapshot.orderType === 'gift_card') return []
  return snapshot.items.filter((item) => requiredStagesFor(item).length > 0)
}

/**
 * The whole predicate, over plain rows.
 *
 * Each condition contributes its own blockers independently, so the screen gets
 * every reason at once rather than one per refresh. `ready` is derived from the
 * list and never computed separately.
 */
export function evaluateLabelReadiness(snapshot: OrderProductionSnapshot): LabelReadiness {
  const consolidatorVendorId = snapshot.consolidatorVendorId
  const jobs = liveJobs(snapshot)
  const items = producibleItems(snapshot)
  const blockers: LabelBlocker[] = []

  // Answered first and alone. Nothing was read, so every other condition below
  // would be a verdict about rows that do not exist — and the "nothing to
  // produce" branch immediately after this one would return `ready: true` for
  // an id the gate exists to refuse.
  if (!snapshot.orderExists) {
    blockers.push({
      code: 'order_not_found',
      message: `No order ${snapshot.orderId} exists, so there is nothing to buy a label for.`,
    })
    return { ready: blockers.length === 0, consolidatorVendorId, blockers }
  }

  // An order with nothing to produce is not waiting on production. A gift-card
  // order has no jobs and never will; reading that as "not ready" would wedge
  // it out of fulfilment permanently.
  if (items.length === 0 && jobs.length === 0) {
    return { ready: true, consolidatorVendorId, blockers: [] }
  }

  if (jobs.length === 0) {
    blockers.push({
      code: 'no_jobs',
      message:
        'This order has items to produce and no live production job. Cancelled jobs do not count — the work has to be redone.',
    })
  } else {
    for (const item of items) {
      for (const stage of requiredStagesFor(item)) {
        const covered = jobs.some(
          (job) => job.stage === stage && job.orderItemIds.includes(item.id)
        )
        if (covered) continue

        blockers.push({
          code: 'item_uncovered',
          message: `Order item ${item.id} still needs a ${stage} job; no live job covers that stage.`,
          orderItemId: item.id,
          stage,
        })
      }
    }
  }

  if (!consolidatorVendorId) {
    blockers.push({
      code: 'no_consolidator',
      message:
        'No consolidator has been chosen for this order, so there is no vendor the goods are supposed to be at.',
    })
  } else if (jobs.length > 0 && !jobs.some((job) => job.vendorId === consolidatorVendorId)) {
    // The precondition of one-label-per-order. C ships by its OWN jobs going
    // `dispatched`; a C holding none — its only job cancelled, say — ships
    // without changing a row this predicate reads, so the order would satisfy
    // the gate again after it had already gone out. `no_jobs` is the honest
    // complaint when there is no live work at all, so this asks only about an
    // order whose work is live somewhere else.
    blockers.push({
      code: 'consolidator_holds_no_job',
      message:
        'The consolidator holds no live production job for this order. Nothing it does — including handing the parcel to the courier — would change whether the order looks ready.',
    })
  }

  const transferByJobId = new Map<string, ReadinessTransfer>()
  for (const transfer of snapshot.transfers) {
    for (const jobId of transfer.jobIds) transferByJobId.set(jobId, transfer)
  }

  for (const job of jobs) {
    if (job.status === 'qc_passed') {
      // Nobody has moved these goods, so they are wherever the job is. When a
      // consolidator has not been chosen at all, `no_consolidator` above is the
      // honest complaint; inventing a mismatch against an unknown C is not.
      if (consolidatorVendorId && job.vendorId !== consolidatorVendorId) {
        blockers.push({
          code: 'goods_not_at_consolidator',
          message: `Job ${job.id} passed QC at another vendor and has not been transferred to the consolidator.`,
          jobId: job.id,
        })
      }
      continue
    }

    if (job.status === 'dispatched') {
      const transfer = transferByJobId.get(job.id)

      if (!transfer) {
        // THE anti-double-label case. The consolidator's own jobs go
        // `dispatched` when it hands the parcel to the courier, and that has no
        // inter-vendor transfer behind it — so the order stops being ready the
        // moment it ships.
        blockers.push({
          code: 'goods_not_at_consolidator',
          message: `Job ${job.id} has been dispatched and is on no inter-vendor transfer, so the goods have left the consolidator.`,
          jobId: job.id,
        })
        continue
      }

      if (transfer.lostAt) {
        // The job stays `dispatched` with its payable intact — we owe the
        // vendor for work they did. A replacement job is what unblocks this.
        blockers.push({
          code: 'transfer_lost',
          message: `The parcel carrying job ${job.id} was declared lost. A replacement job has to be produced.`,
          jobId: job.id,
          transferId: transfer.id,
        })
        continue
      }

      if (consolidatorVendorId && transfer.toVendorId !== consolidatorVendorId) {
        blockers.push({
          code: 'goods_not_at_consolidator',
          message: `Job ${job.id} rode a transfer to a vendor who is not the consolidator.`,
          jobId: job.id,
          transferId: transfer.id,
        })
        continue
      }

      if (!transfer.receivedAt) {
        blockers.push({
          code: 'transfer_in_flight',
          message: `The parcel carrying job ${job.id} has not been received yet.`,
          jobId: job.id,
          transferId: transfer.id,
        })
      }

      continue
    }

    blockers.push({
      code: 'job_not_qc_passed',
      message: `Job ${job.id} is '${job.status}'; it has to pass QC before the order can be labelled.`,
      jobId: job.id,
    })
  }

  return { ready: blockers.length === 0, consolidatorVendorId, blockers }
}

// ============================================================================
// Reading the snapshot
// ============================================================================

/**
 * The five reads, in a fixed order, on one connection.
 *
 * Sequential rather than concurrent on purpose: the caller that matters runs
 * this inside its own transaction, where the reads serialise anyway, and a
 * fixed order is what lets the suite assert what was read.
 */
export async function loadOrderProductionSnapshot(
  orderId: string,
  reader: ProductionReader = db
): Promise<OrderProductionSnapshot> {
  const orderRows = await reader
    .select({ orderType: orders.orderType })
    .from(orders)
    .where(eq(orders.id, orderId))

  const itemRows = await reader
    .select({
      id: orderItems.id,
      frameId: orderItems.frameId,
      giftCardPurchase: orderItems.giftCardPurchase,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))

  // Left join, not inner: a job with no `production_job_items` row yet still
  // exists and still blocks. Dropping it would report a half-built order ready.
  const jobRows = await reader
    .select({
      id: productionJobs.id,
      stage: productionJobs.stage,
      status: productionJobs.status,
      vendorId: productionJobs.vendorId,
      assignedAt: productionJobs.assignedAt,
      orderItemId: productionJobItems.orderItemId,
    })
    .from(productionJobs)
    .leftJoin(productionJobItems, eq(productionJobItems.jobId, productionJobs.id))
    .where(eq(productionJobs.orderId, orderId))

  const consolidationRows = await reader
    .select({ vendorId: orderConsolidation.vendorId })
    .from(orderConsolidation)
    .where(eq(orderConsolidation.orderId, orderId))

  const transferRows = await reader
    .select({
      id: productionTransfers.id,
      toVendorId: productionTransfers.toVendorId,
      dispatchedAt: productionTransfers.dispatchedAt,
      receivedAt: productionTransfers.receivedAt,
      lostAt: productionTransfers.lostAt,
      jobId: productionTransferJobs.jobId,
    })
    .from(productionTransfers)
    .leftJoin(
      productionTransferJobs,
      eq(productionTransferJobs.transferId, productionTransfers.id)
    )
    .where(eq(productionTransfers.orderId, orderId))

  return {
    orderId,
    // The row itself, not its contents: `?? 'regular'` below is a default for a
    // column, and defaults are exactly how a missing order used to pass.
    orderExists: orderRows.length > 0,
    orderType: orderRows[0]?.orderType ?? 'regular',
    items: itemRows.map((row) => ({
      id: row.id,
      frameId: row.frameId,
      isGiftCard: row.giftCardPurchase != null,
    })),
    jobs: collapseJobRows(jobRows),
    transfers: collapseTransferRows(transferRows),
    consolidatorVendorId: consolidationRows[0]?.vendorId ?? null,
  }
}

interface JobRow {
  id: string
  stage: ProductionJobStage
  status: ProductionJobStatus
  vendorId: string | null
  assignedAt: Date | null
  orderItemId: string | null
}

/** One row per (job, item) becomes one job carrying its items. */
function collapseJobRows(rows: readonly JobRow[]): ReadinessJob[] {
  const jobs = new Map<string, ReadinessJob & { orderItemIds: string[] }>()

  for (const row of rows) {
    let job = jobs.get(row.id)
    if (!job) {
      job = {
        id: row.id,
        stage: row.stage,
        status: row.status,
        vendorId: row.vendorId,
        assignedAt: row.assignedAt,
        orderItemIds: [],
      }
      jobs.set(row.id, job)
    }
    if (row.orderItemId && !job.orderItemIds.includes(row.orderItemId)) {
      job.orderItemIds.push(row.orderItemId)
    }
  }

  return [...jobs.values()]
}

interface TransferRow {
  id: string
  toVendorId: string
  dispatchedAt: Date | null
  receivedAt: Date | null
  lostAt: Date | null
  jobId: string | null
}

/** One row per (transfer, job) becomes one parcel carrying its jobs. */
function collapseTransferRows(rows: readonly TransferRow[]): ReadinessTransfer[] {
  const transfers = new Map<string, ReadinessTransfer & { jobIds: string[] }>()

  for (const row of rows) {
    let transfer = transfers.get(row.id)
    if (!transfer) {
      transfer = {
        id: row.id,
        toVendorId: row.toVendorId,
        dispatchedAt: row.dispatchedAt,
        receivedAt: row.receivedAt,
        lostAt: row.lostAt,
        jobIds: [],
      }
      transfers.set(row.id, transfer)
    }
    if (row.jobId && !transfer.jobIds.includes(row.jobId)) transfer.jobIds.push(row.jobId)
  }

  return [...transfers.values()]
}

/** The readiness of one order, with every reason it is not ready. */
export async function getOrderLabelReadiness(
  orderId: string,
  reader?: ProductionReader
): Promise<LabelReadiness> {
  return evaluateLabelReadiness(await loadOrderProductionSnapshot(orderId, reader))
}

/**
 * The gate's question.
 *
 * `blockers.length === 0` over the call above, and nothing else. Not
 * `readiness.ready`, not a second query — the point is that there is exactly one
 * place the answer is computed, so the gate and the screen cannot drift apart.
 */
export async function isOrderReadyToLabel(
  orderId: string,
  reader?: ProductionReader
): Promise<boolean> {
  const readiness = await getOrderLabelReadiness(orderId, reader)
  return readiness.blockers.length === 0
}

// ============================================================================
// Choosing the consolidator: the system proposes, an admin confirms
// ============================================================================

export type ConsolidatorBasis =
  /** One vendor holds every job on the order. The overwhelming majority. */
  | 'sole_vendor'
  /** A frame job exists, so the framed piece stays where it was framed. */
  | 'frame_vendor'
  /** Rolled posters split across print vendors; most items wins. */
  | 'most_items'
  /** Nothing is assigned yet, so there is nothing to propose. */
  | 'none'

export interface ConsolidatorProposal {
  vendorId: string | null
  basis: ConsolidatorBasis
  /**
   * Whether an admin has to confirm before this is written.
   *
   * False only for `sole_vendor`, which is written automatically at first
   * assignment with `decided_by = NULL` recording "system default". The other
   * two are proposals: the real criterion — who is nearest the customer, which
   * leg is cheapest — is not modelled, and a confirmed proposal keeps an
   * arbitrary choice visible and auditable instead of silently arbitrary.
   */
  needsConfirmation: boolean
}

interface VendorHolding {
  vendorId: string
  /** Distinct order items, so two jobs on one item do not count twice. */
  itemCount: number
  earliestAssignedAt: Date | null
}

function holdingsOf(jobs: readonly ReadinessJob[]): VendorHolding[] {
  const byVendor = new Map<string, { items: Set<string>; earliest: Date | null }>()

  for (const job of jobs) {
    if (!job.vendorId) continue
    let holding = byVendor.get(job.vendorId)
    if (!holding) {
      holding = { items: new Set(), earliest: null }
      byVendor.set(job.vendorId, holding)
    }
    for (const itemId of job.orderItemIds) holding.items.add(itemId)
    if (job.assignedAt && (!holding.earliest || job.assignedAt < holding.earliest)) {
      holding.earliest = job.assignedAt
    }
  }

  return [...byVendor.entries()].map(([vendorId, holding]) => ({
    vendorId,
    itemCount: holding.items.size,
    earliestAssignedAt: holding.earliest,
  }))
}

/**
 * Most items, then earliest assignment, then vendor id.
 *
 * The last key is not arbitrary decoration: without a total order the proposal
 * would depend on row order, and "the admin screen suggested a different vendor
 * on refresh" is not a bug anyone would enjoy diagnosing. A job with no
 * `assigned_at` sorts last rather than first — an unassigned draft is not
 * evidence of being early.
 */
function bestHolding(holdings: readonly VendorHolding[]): VendorHolding | null {
  return (
    [...holdings].sort((a, b) => {
      if (a.itemCount !== b.itemCount) return b.itemCount - a.itemCount

      const at = a.earliestAssignedAt?.getTime() ?? Number.POSITIVE_INFINITY
      const bt = b.earliestAssignedAt?.getTime() ?? Number.POSITIVE_INFINITY
      if (at !== bt) return at - bt

      return a.vendorId < b.vendorId ? -1 : a.vendorId > b.vendorId ? 1 : 0
    })[0] ?? null
  )
}

/**
 * Which vendor should assemble the order and ship it to the customer.
 *
 * Cancelled jobs and unassigned drafts are ignored — neither holds anything.
 */
export function proposeConsolidator(jobs: readonly ReadinessJob[]): ConsolidatorProposal {
  const assigned = jobs.filter((job) => job.status !== 'cancelled' && job.vendorId)
  const holdings = holdingsOf(assigned)

  if (holdings.length === 0) {
    return { vendorId: null, basis: 'none', needsConfirmation: false }
  }

  // 1. One vendor holds everything. No admin action; `decided_by` stays NULL.
  if (holdings.length === 1) {
    return { vendorId: holdings[0]!.vendorId, basis: 'sole_vendor', needsConfirmation: false }
  }

  // 2. A finished framed piece is bulky, fragile and glazed. You never courier
  //    it TO a poster shop, so it stays where it was framed.
  const frameJobs = assigned.filter((job) => job.stage === 'frame')
  if (frameJobs.length > 0) {
    const best = bestHolding(holdingsOf(frameJobs))
    if (best) return { vendorId: best.vendorId, basis: 'frame_vendor', needsConfirmation: true }
  }

  // 3. All rolled posters across two print vendors. Most items, ties by
  //    earliest assignment — a proposal, not a decision.
  const best = bestHolding(holdings)
  return { vendorId: best!.vendorId, basis: 'most_items', needsConfirmation: true }
}

/**
 * May the consolidator still be changed?
 *
 * Until the first transfer on the order has dispatched. After that the goods
 * are already moving, and re-routing them is a phone call to a courier, not a
 * database write. The 409 belongs to the route (#682); this is the predicate it
 * asks.
 */
export function consolidatorOverrideAllowed(
  transfers: readonly { dispatchedAt: Date | null }[]
): boolean {
  return transfers.every((transfer) => transfer.dispatchedAt === null)
}

/** The same question, read from the order's transfers. */
export async function canOverrideConsolidator(
  orderId: string,
  reader: ProductionReader = db
): Promise<boolean> {
  const rows = await reader
    .select({ dispatchedAt: productionTransfers.dispatchedAt })
    .from(productionTransfers)
    .where(eq(productionTransfers.orderId, orderId))

  return consolidatorOverrideAllowed(rows)
}

// ============================================================================
// The single-consumer manifest
// ============================================================================

/**
 * A file permitted to ask whether an order is ready to label.
 *
 * The entry is not documentation — `tests/lib/production-seam.test.ts` reads it.
 * Adding a caller without adding an entry fails that suite by name.
 */
export interface LabelReadinessConsumer {
  /**
   * Path relative to `packages/api/src`, with `/` separators. A trailing `*`
   * matches a prefix, which is how a family of shipment modules is admitted
   * without listing files that do not exist yet.
   */
  path: string
  /** The feature that owns the file. */
  owner: string
  /** Why this one is allowed to ask. */
  reason: string
}

/**
 * The allow-list.
 *
 * Deliberately short, and deliberately all one feature. The gate is a
 * *dispatch* concern: production tells dispatch the goods are assembled, and
 * dispatch decides what to do about it. A second consumer — an email, a
 * dashboard, a report — would be a second place that has to agree about what
 * "ready" means, and the whole design of this module is that there is only one.
 */
export const LABEL_READINESS_CONSUMERS: readonly LabelReadinessConsumer[] = [
  {
    path: 'routes/admin/shipments.ts',
    owner: 'order-dispatch-tracking',
    reason:
      'The gate itself: refuses to create a shipment for an order whose goods are not assembled at the consolidator.',
  },
  {
    path: 'lib/shipment-*',
    owner: 'order-dispatch-tracking',
    reason:
      'The shipment library the route delegates to, which evaluates readiness inside the transaction that writes the shipment.',
  },
]

/**
 * The seam's own module, which necessarily contains the definition.
 *
 * Excluded from the forward scan by name rather than by a cleverer regex: a
 * pattern that tried to tell a definition from a call is a pattern that can be
 * fooled, and being fooled here means the guard silently stops guarding.
 */
export const LABEL_READINESS_MODULE = 'lib/production-readiness.ts'

/** Whether `path` (relative to `packages/api/src`) may call the seam. */
export function isAllowedReadinessConsumer(path: string): boolean {
  if (path === LABEL_READINESS_MODULE) return true

  return LABEL_READINESS_CONSUMERS.some((consumer) =>
    consumer.path.endsWith('*')
      ? path.startsWith(consumer.path.slice(0, -1))
      : path === consumer.path
  )
}

/** What to tell someone whose new file calls the seam. */
export function unauthorisedConsumerMessage(paths: readonly string[]): string {
  return [
    `${paths.length} file(s) call isOrderReadyToLabel() from outside the allow-list:`,
    ...paths.map((path) => `  - ${path}`),
    '',
    'The label gate is a single-consumer seam: production-pipeline answers the question,',
    'order-dispatch-tracking asks it, and nothing else does. A second consumer is a second',
    'place that has to agree about what "ready" means, which is exactly what one shared',
    'predicate exists to prevent.',
    '',
    'If this really is the gate, add it to LABEL_READINESS_CONSUMERS in',
    'src/lib/production-readiness.ts with the reason. If it is a screen that wants to show',
    'why an order is stuck, call getOrderLabelReadiness() and render the blockers instead.',
  ].join('\n')
}

/**
 * The carrier this side of the seam must never know about.
 *
 * The forward scan stops dispatch's logic leaking into production. This is the
 * other direction: a `lib/production-*` module that imported a courier client
 * would have quietly made production responsible for shipping, and the seam
 * would still look like one function.
 */
export const PRODUCTION_LIB_FORBIDDEN_IMPORT = 'shiprocket'

/** What to tell someone whose production module reached for a courier. */
export function forbiddenCarrierImportMessage(paths: readonly string[]): string {
  return [
    `${paths.length} file(s) under lib/production-* import something named '${PRODUCTION_LIB_FORBIDDEN_IMPORT}':`,
    ...paths.map((path) => `  - ${path}`),
    '',
    'production-pipeline knows where the goods physically are. It does not know how to buy a',
    'courier label, and must not learn: the seam is one function, one way. Move the work to',
    'order-dispatch-tracking and have it call isOrderReadyToLabel() instead.',
  ].join('\n')
}
