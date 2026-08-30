/**
 * The label-readiness seam (#677).
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §5.
 *
 * The predicate is written once, in `evaluateLabelReadiness`, over a snapshot of
 * plain rows. That is what makes it testable at all: the alternative — a query
 * that answers `boolean` — can only be checked by seeding a whole order chain,
 * and the six conditions would then be tested one at a time by whichever
 * fixture happened to trip them.
 *
 * Four things are asserted here that a looser suite would miss:
 *
 * 1. **`ready` is `blockers.length === 0`, always.** Asserted as an invariant
 *    across every case rather than case by case, because the failure mode that
 *    matters is the gate and the admin screen disagreeing — a `ready: false`
 *    with an empty blocker list, or a `ready: true` alongside a reason.
 * 2. **The emergent property.** Once the consolidator's OWN jobs go
 *    `dispatched`, readiness goes false again: a `dispatched` job with no
 *    inbound received transfer to C is a blocker. That is what structurally
 *    prevents a second label for one order, and nothing else in the system
 *    enforces it, so it is pinned here.
 * 3. **An order with nothing to produce is not blocked.** A gift-card order has
 *    no jobs and never will. Reading "no jobs" as "not ready" would wedge every
 *    such order out of fulfilment forever.
 * 4. **The reader is injected, and defaults to `db`.** Both directions are
 *    asserted, because the whole point of the parameter is that
 *    order-dispatch-tracking can evaluate this INSIDE its shipment transaction.
 *    A default that silently ignored the argument would still pass every
 *    predicate test above.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createSelectQueue } from '../helpers/select-queue'
import {
  evaluateLabelReadiness,
  getOrderLabelReadiness,
  isOrderReadyToLabel,
  loadOrderProductionSnapshot,
  proposeConsolidator,
  consolidatorOverrideAllowed,
  canOverrideConsolidator,
  requiredStagesFor,
  type LabelBlockerCode,
  type LabelReadiness,
  type OrderProductionSnapshot,
  type ReadinessItem,
  type ReadinessJob,
  type ReadinessTransfer,
} from '../../src/lib/production-readiness'

const dbSelect = vi.hoisted(() => vi.fn())

vi.mock('../../src/database', () => ({
  db: { select: (...args: unknown[]) => dbSelect(...args) },
}))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const ASSIGNED = new Date('2026-08-01T10:00:00Z')
const LATER = new Date('2026-08-02T10:00:00Z')
const NOW = new Date('2026-08-10T10:00:00Z')

function item(over: Partial<ReadinessItem> = {}): ReadinessItem {
  return { id: 'item-1', frameId: null, isGiftCard: false, ...over }
}

function job(over: Partial<ReadinessJob> = {}): ReadinessJob {
  return {
    id: 'job-1',
    stage: 'print',
    status: 'qc_passed',
    vendorId: A,
    assignedAt: ASSIGNED,
    orderItemIds: ['item-1'],
    ...over,
  }
}

function transfer(over: Partial<ReadinessTransfer> = {}): ReadinessTransfer {
  return {
    id: 'transfer-1',
    toVendorId: A,
    dispatchedAt: ASSIGNED,
    receivedAt: NOW,
    lostAt: null,
    jobIds: [],
    ...over,
  }
}

/** A single rolled poster, printed and QC-passed at A, with A consolidating. */
function snapshot(over: Partial<OrderProductionSnapshot> = {}): OrderProductionSnapshot {
  return {
    orderId: 'order-1',
    orderType: 'regular',
    items: [item()],
    jobs: [job()],
    transfers: [],
    consolidatorVendorId: A,
    ...over,
  }
}

function codes(readiness: LabelReadiness): LabelBlockerCode[] {
  return readiness.blockers.map((blocker) => blocker.code)
}

/**
 * The one thing that must hold for every result this module ever produces.
 * Called from every case below rather than tested once in isolation.
 */
function assertConsistent(readiness: LabelReadiness): LabelReadiness {
  expect(readiness.ready).toBe(readiness.blockers.length === 0)
  for (const blocker of readiness.blockers) {
    expect(blocker.message.length).toBeGreaterThan(0)
  }
  return readiness
}

function evaluate(over: Partial<OrderProductionSnapshot> = {}): LabelReadiness {
  return assertConsistent(evaluateLabelReadiness(snapshot(over)))
}

describe('evaluateLabelReadiness — the six conditions', () => {
  it('is ready when one vendor printed the whole order and holds it', () => {
    const readiness = evaluate()

    expect(readiness.ready).toBe(true)
    expect(readiness.blockers).toEqual([])
    expect(readiness.consolidatorVendorId).toBe(A)
  })

  it('blocks an order that has items to produce and no jobs at all', () => {
    const readiness = evaluate({ jobs: [] })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toContain('no_jobs')
  })

  it('treats an order whose only jobs are cancelled as having no jobs', () => {
    // Cancellation has no out-edge (production-transitions), so the work has to
    // be redone. Counting a cancelled job towards coverage would ship an order
    // for which nothing was made.
    const readiness = evaluate({ jobs: [job({ status: 'cancelled' })] })

    expect(codes(readiness)).toContain('no_jobs')
  })

  it('blocks when an order item has no job covering it', () => {
    const readiness = evaluate({
      items: [item({ id: 'item-1' }), item({ id: 'item-2' })],
    })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toEqual(['item_uncovered'])
    expect(readiness.blockers[0]?.orderItemId).toBe('item-2')
  })

  it('requires BOTH a print and a frame job for a framed line', () => {
    // frame_id set means print then frame. A framed piece covered only by its
    // print job is a poster in a tube, and shipping it is the bug.
    const readiness = evaluate({
      items: [item({ frameId: 'frame-1' })],
      jobs: [job({ stage: 'print' })],
    })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toEqual(['item_uncovered'])
    expect(readiness.blockers[0]?.stage).toBe('frame')
  })

  it('is ready for a framed line once both stages exist at the consolidator', () => {
    const readiness = evaluate({
      items: [item({ frameId: 'frame-1' })],
      jobs: [
        job({ id: 'job-print', stage: 'print' }),
        job({ id: 'job-frame', stage: 'frame' }),
      ],
    })

    expect(readiness.ready).toBe(true)
  })

  it('blocks when no consolidator has been chosen', () => {
    const readiness = evaluate({ consolidatorVendorId: null })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toContain('no_consolidator')
    expect(readiness.consolidatorVendorId).toBeNull()
  })

  it('blocks a job that has not reached qc_passed', () => {
    const readiness = evaluate({ jobs: [job({ status: 'qc_submitted' })] })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toEqual(['job_not_qc_passed'])
    expect(readiness.blockers[0]?.jobId).toBe('job-1')
  })

  it.each([
    'draft',
    'assigned',
    'sent',
    'received',
    'qc_submitted',
    'qc_failed',
  ] as const)('blocks a live job sitting in %s', (status) => {
    expect(codes(evaluate({ jobs: [job({ status })] }))).toContain('job_not_qc_passed')
  })

  it('blocks a qc_passed job held by a vendor who is not the consolidator', () => {
    // The goods passed QC at B. Nobody has moved them, so they are not where
    // the parcel to the customer is being packed.
    const readiness = evaluate({ jobs: [job({ vendorId: B })] })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toEqual(['goods_not_at_consolidator'])
    expect(readiness.blockers[0]?.jobId).toBe('job-1')
  })
})

describe('evaluateLabelReadiness — dispatched jobs and their transfers', () => {
  it('is ready when a dispatched job rode a received transfer to the consolidator', () => {
    const readiness = evaluate({
      jobs: [job({ vendorId: B, status: 'dispatched' })],
      transfers: [transfer({ toVendorId: A, receivedAt: NOW, jobIds: ['job-1'] })],
    })

    expect(readiness.ready).toBe(true)
  })

  it('blocks while the parcel is still in flight', () => {
    const readiness = evaluate({
      jobs: [job({ vendorId: B, status: 'dispatched' })],
      transfers: [transfer({ toVendorId: A, receivedAt: null, jobIds: ['job-1'] })],
    })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toEqual(['transfer_in_flight'])
    expect(readiness.blockers[0]?.transferId).toBe('transfer-1')
  })

  it('blocks when the parcel was declared lost', () => {
    // The original job stays `dispatched` with its payable intact; a
    // replacement draft job is what unblocks the order, not this row changing.
    const readiness = evaluate({
      jobs: [job({ vendorId: B, status: 'dispatched' })],
      transfers: [
        transfer({ toVendorId: A, receivedAt: null, lostAt: NOW, jobIds: ['job-1'] }),
      ],
    })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toEqual(['transfer_lost'])
  })

  it('reports lost rather than misrouted when a lost parcel was also going elsewhere', () => {
    const readiness = evaluate({
      jobs: [job({ vendorId: B, status: 'dispatched' })],
      transfers: [
        transfer({ toVendorId: C, receivedAt: null, lostAt: NOW, jobIds: ['job-1'] }),
      ],
    })

    expect(codes(readiness)).toEqual(['transfer_lost'])
  })

  it('blocks when the parcel was received by someone other than the consolidator', () => {
    const readiness = evaluate({
      jobs: [job({ vendorId: B, status: 'dispatched' })],
      transfers: [transfer({ toVendorId: C, receivedAt: NOW, jobIds: ['job-1'] })],
    })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toEqual(['goods_not_at_consolidator'])
  })

  it('ignores a transfer that carries none of this order`s live jobs', () => {
    const readiness = evaluate({
      transfers: [transfer({ toVendorId: C, jobIds: ['job-elsewhere'] })],
    })

    expect(readiness.ready).toBe(true)
  })
})

describe('the emergent property: one label per order', () => {
  /**
   * This is the whole reason the predicate is shaped the way it is. When the
   * consolidator finally hands the parcel to the courier, its own jobs go
   * `dispatched` — and a dispatched job with no inbound received transfer TO
   * the consolidator is a blocker. So the same order cannot satisfy the gate
   * twice, without a `label_created_at` column, a lock, or anything to forget.
   */
  it('goes FALSE again once the consolidator`s own jobs are dispatched', () => {
    const before = evaluate({ jobs: [job({ vendorId: A, status: 'qc_passed' })] })
    expect(before.ready).toBe(true)

    const after = evaluate({ jobs: [job({ vendorId: A, status: 'dispatched' })] })

    expect(after.ready).toBe(false)
    expect(codes(after)).toEqual(['goods_not_at_consolidator'])
    expect(after.blockers[0]?.jobId).toBe('job-1')
  })

  it('stays false even though every earlier inbound leg was received', () => {
    // B printed, transferred to A, A received it, A framed it, A shipped it.
    // The inbound leg is still received and not lost — and the order is still
    // not ready for a SECOND label, because A`s own frame job left.
    const after = evaluate({
      items: [item({ frameId: 'frame-1' })],
      jobs: [
        job({ id: 'job-print', stage: 'print', vendorId: B, status: 'dispatched' }),
        job({ id: 'job-frame', stage: 'frame', vendorId: A, status: 'dispatched' }),
      ],
      transfers: [transfer({ toVendorId: A, receivedAt: NOW, jobIds: ['job-print'] })],
    })

    expect(after.ready).toBe(false)
    expect(codes(after)).toEqual(['goods_not_at_consolidator'])
    expect(after.blockers[0]?.jobId).toBe('job-frame')
  })
})

describe('orders that need no production', () => {
  it('does not block a gift_card order that has no jobs', () => {
    const readiness = assertConsistent(
      evaluateLabelReadiness(
        snapshot({
          orderType: 'gift_card',
          items: [item({ isGiftCard: true })],
          jobs: [],
          consolidatorVendorId: null,
        })
      )
    )

    expect(readiness.ready).toBe(true)
    expect(readiness.blockers).toEqual([])
  })

  it('does not block an order whose only lines are gift cards', () => {
    const readiness = evaluate({
      items: [item({ id: 'item-1', isGiftCard: true })],
      jobs: [],
      consolidatorVendorId: null,
    })

    expect(readiness.ready).toBe(true)
  })

  it('still requires production for the poster lines of a mixed basket', () => {
    const readiness = evaluate({
      items: [item({ id: 'item-1', isGiftCard: true }), item({ id: 'item-2' })],
      jobs: [],
      consolidatorVendorId: null,
    })

    expect(readiness.ready).toBe(false)
    expect(codes(readiness)).toContain('no_jobs')
  })

  it('asks for no production stages on a gift-card line', () => {
    expect(requiredStagesFor(item({ isGiftCard: true }))).toEqual([])
    expect(requiredStagesFor(item())).toEqual(['print'])
    expect(requiredStagesFor(item({ frameId: 'frame-1' }))).toEqual(['print', 'frame'])
  })
})

describe('getOrderLabelReadiness and its boolean', () => {
  const readerSelect = vi.fn()
  const reader = { select: readerSelect } as unknown as Parameters<
    typeof getOrderLabelReadiness
  >[1]
  const queue = createSelectQueue(readerSelect)

  /** The five reads `loadOrderProductionSnapshot` makes, in order. */
  function queueOrder(over: {
    order?: unknown[]
    items?: unknown[]
    jobs?: unknown[]
    consolidation?: unknown[]
    transfers?: unknown[]
  }) {
    queue.queueSelects(
      over.order ?? [{ orderType: 'regular' }],
      over.items ?? [{ id: 'item-1', frameId: null, giftCardPurchase: null }],
      over.jobs ?? [
        {
          id: 'job-1',
          stage: 'print',
          status: 'qc_passed',
          vendorId: A,
          assignedAt: ASSIGNED,
          orderItemId: 'item-1',
        },
      ],
      over.consolidation ?? [{ vendorId: A }],
      over.transfers ?? []
    )
  }

  beforeEach(() => {
    queue.reset()
    readerSelect.mockReset()
    dbSelect.mockReset()
  })

  it('reads the order through the injected reader and never touches db', async () => {
    queueOrder({})

    const readiness = await getOrderLabelReadiness('order-1', reader)

    expect(readiness.ready).toBe(true)
    expect(dbSelect).not.toHaveBeenCalled()
    expect(queue.selects).toHaveLength(5)
  })

  it('falls back to db when no reader is given', async () => {
    const dbQueue = createSelectQueue(dbSelect)
    dbQueue.queueSelects(
      [{ orderType: 'regular' }],
      [{ id: 'item-1', frameId: null, giftCardPurchase: null }],
      [],
      [],
      []
    )

    const readiness = await getOrderLabelReadiness('order-1')

    expect(dbSelect).toHaveBeenCalled()
    expect(readiness.ready).toBe(false)
  })

  it('answers the same question as the blocker list, by construction', async () => {
    queueOrder({ consolidation: [] })
    const detailed = await getOrderLabelReadiness('order-1', reader)

    queue.reset()
    readerSelect.mockReset()
    queueOrder({ consolidation: [] })
    const boolean = await isOrderReadyToLabel('order-1', reader)

    expect(detailed.blockers.length).toBeGreaterThan(0)
    expect(boolean).toBe(detailed.blockers.length === 0)
    expect(boolean).toBe(false)
  })

  it('reads a gift-card line as needing no production', async () => {
    queueOrder({
      items: [{ id: 'item-1', frameId: null, giftCardPurchase: { amount: '500.00' } }],
      jobs: [],
      consolidation: [],
    })

    expect(await isOrderReadyToLabel('order-1', reader)).toBe(true)
  })

  it('collapses the job rows a join fans out into one job per id', async () => {
    queueOrder({
      items: [
        { id: 'item-1', frameId: null, giftCardPurchase: null },
        { id: 'item-2', frameId: null, giftCardPurchase: null },
      ],
      jobs: [
        {
          id: 'job-1',
          stage: 'print',
          status: 'qc_passed',
          vendorId: A,
          assignedAt: ASSIGNED,
          orderItemId: 'item-1',
        },
        {
          id: 'job-1',
          stage: 'print',
          status: 'qc_passed',
          vendorId: A,
          assignedAt: ASSIGNED,
          orderItemId: 'item-2',
        },
      ],
    })

    const snapshotRead = await loadOrderProductionSnapshot('order-1', reader)

    expect(snapshotRead.jobs).toHaveLength(1)
    expect(snapshotRead.jobs[0]?.orderItemIds).toEqual(['item-1', 'item-2'])
  })

  it('collapses the transfer rows a join fans out into one transfer per id', async () => {
    queueOrder({
      jobs: [
        {
          id: 'job-1',
          stage: 'print',
          status: 'dispatched',
          vendorId: B,
          assignedAt: ASSIGNED,
          orderItemId: 'item-1',
        },
      ],
      transfers: [
        {
          id: 'transfer-1',
          toVendorId: A,
          dispatchedAt: ASSIGNED,
          receivedAt: NOW,
          lostAt: null,
          jobId: 'job-1',
        },
        {
          id: 'transfer-1',
          toVendorId: A,
          dispatchedAt: ASSIGNED,
          receivedAt: NOW,
          lostAt: null,
          jobId: 'job-2',
        },
      ],
    })

    const snapshotRead = await loadOrderProductionSnapshot('order-1', reader)

    expect(snapshotRead.transfers).toHaveLength(1)
    expect(snapshotRead.transfers[0]?.jobIds).toEqual(['job-1', 'job-2'])
  })

  it('reports no consolidator when the order has no consolidation row', async () => {
    queueOrder({ consolidation: [] })

    const readiness = await getOrderLabelReadiness('order-1', reader)

    expect(readiness.consolidatorVendorId).toBeNull()
    expect(codes(readiness)).toContain('no_consolidator')
  })
})

describe('proposeConsolidator — the system proposes, an admin confirms', () => {
  it('picks the only vendor on the order, with no confirmation needed', () => {
    const proposal = proposeConsolidator([
      job({ id: 'job-1', vendorId: A }),
      job({ id: 'job-2', vendorId: A, stage: 'frame' }),
    ])

    expect(proposal).toEqual({ vendorId: A, basis: 'sole_vendor', needsConfirmation: false })
  })

  it('proposes the frame vendor when the order is split across stages', () => {
    // A finished framed piece is bulky, fragile and glazed. You never courier
    // it TO a poster shop, so the frame vendor consolidates.
    const proposal = proposeConsolidator([
      job({ id: 'job-print', stage: 'print', vendorId: A, orderItemIds: ['i1', 'i2', 'i3'] }),
      job({ id: 'job-frame', stage: 'frame', vendorId: B, orderItemIds: ['i1'] }),
    ])

    expect(proposal.vendorId).toBe(B)
    expect(proposal.basis).toBe('frame_vendor')
    expect(proposal.needsConfirmation).toBe(true)
  })

  it('proposes the vendor holding the most items when every job is a rolled poster', () => {
    const proposal = proposeConsolidator([
      job({ id: 'job-1', vendorId: A, orderItemIds: ['i1'] }),
      job({ id: 'job-2', vendorId: B, orderItemIds: ['i2', 'i3'] }),
    ])

    expect(proposal.vendorId).toBe(B)
    expect(proposal.basis).toBe('most_items')
    // The real criterion — who is nearest the customer, which leg is cheapest —
    // is not modelled, so the arbitrary choice is made visible rather than
    // silently applied.
    expect(proposal.needsConfirmation).toBe(true)
  })

  it('breaks an item-count tie by the earliest assignment', () => {
    const proposal = proposeConsolidator([
      job({ id: 'job-1', vendorId: A, assignedAt: LATER, orderItemIds: ['i1'] }),
      job({ id: 'job-2', vendorId: B, assignedAt: ASSIGNED, orderItemIds: ['i2'] }),
    ])

    expect(proposal.vendorId).toBe(B)
  })

  it('counts an order item once however many jobs of a vendor touch it', () => {
    const proposal = proposeConsolidator([
      job({ id: 'job-1', vendorId: A, orderItemIds: ['i1'] }),
      job({ id: 'job-2', vendorId: A, orderItemIds: ['i1'] }),
      job({ id: 'job-3', vendorId: B, orderItemIds: ['i2', 'i3'] }),
    ])

    expect(proposal.vendorId).toBe(B)
  })

  it('ignores cancelled jobs and unassigned drafts', () => {
    const proposal = proposeConsolidator([
      job({ id: 'job-1', vendorId: A }),
      job({ id: 'job-2', vendorId: B, status: 'cancelled' }),
      job({ id: 'job-3', vendorId: null, status: 'draft' }),
    ])

    expect(proposal).toEqual({ vendorId: A, basis: 'sole_vendor', needsConfirmation: false })
  })

  it('proposes nothing for an order with no assigned jobs', () => {
    expect(proposeConsolidator([])).toEqual({
      vendorId: null,
      basis: 'none',
      needsConfirmation: false,
    })
  })

  it('is deterministic when everything ties', () => {
    const jobs = [
      job({ id: 'job-1', vendorId: B, assignedAt: ASSIGNED, orderItemIds: ['i1'] }),
      job({ id: 'job-2', vendorId: A, assignedAt: ASSIGNED, orderItemIds: ['i2'] }),
    ]

    expect(proposeConsolidator(jobs).vendorId).toBe(A)
    expect(proposeConsolidator([...jobs].reverse()).vendorId).toBe(A)
  })
})

describe('overriding the consolidator', () => {
  it('is allowed while nothing has physically left', () => {
    expect(consolidatorOverrideAllowed([])).toBe(true)
    expect(consolidatorOverrideAllowed([{ dispatchedAt: null }])).toBe(true)
  })

  it('is refused once the first transfer on the order has dispatched', () => {
    // The 409 belongs to the route (#682); this is only the predicate it asks.
    expect(consolidatorOverrideAllowed([{ dispatchedAt: null }, { dispatchedAt: NOW }])).toBe(
      false
    )
  })

  it('reads the order`s transfers through the injected reader', async () => {
    const readerSelect = vi.fn()
    const queue = createSelectQueue(readerSelect)
    queue.queueSelects([{ dispatchedAt: NOW }])

    const allowed = await canOverrideConsolidator('order-1', {
      select: readerSelect,
    } as unknown as Parameters<typeof canOverrideConsolidator>[1])

    expect(allowed).toBe(false)
    expect(queue.selects).toHaveLength(1)
  })
})
