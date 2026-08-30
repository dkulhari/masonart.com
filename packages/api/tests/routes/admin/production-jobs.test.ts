/**
 * Admin production API — job creation, assignment pricing, QC verdicts.
 *
 * Same harness as `tests/routes/admin/vendors.test.ts`: `src/database` is a
 * recording query builder, `src/auth` is mocked so each test picks the caller's
 * role, and the REAL `requireAuth`/`requireAdmin` run. Two additions the vendor
 * suite did not need:
 *
 * - **`db.transaction` is real enough to observe.** It runs the callback with
 *   the same builder and tags every query made inside it. That is what lets the
 *   "no orphan job" test assert the job insert and the item insert are in ONE
 *   transaction rather than merely both happening.
 * - **A failure injector.** `failNext('insert:production_job_items')` makes one
 *   query reject, which is how a partway failure is reproduced without a
 *   database.
 *
 * The pricing tests are the point of the file. `selectRateInForce` is already
 * unit-tested against rate rows; what is tested here is that the ROUTE asks it
 * the right question — the longest edge, at the assignment instant — and that a
 * question with no answer becomes a 422 rather than a zero.
 *
 * @see packages/api/src/routes/admin/production-jobs.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adminSessionFor } from '../../helpers/admin-session'
import { buildRouteApp } from '../../helpers/route-app'
import '../../setup'

import { QC_SHOT_LIST, requiredQcSlots } from '@chobii/shared'

import {
  productionJobs,
  productionJobItems,
  productionJobPhotos,
  productionJobReviews,
} from '../../../src/database/schema/production-jobs'
import { adminAuditLog } from '../../../src/database/schema/audit-log'

// ============================================================================
// Recording database mock
// ============================================================================

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder()
)

vi.mock('../../../src/database', () => ({ db: recorder.db }))

const mockGetSession = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}))

const SIGNED_URL =
  'https://r2.example.com/poster-app-dev/signed.jpg?X-Amz-Signature=deadbeef&X-Amz-Expires=300'

const mockPresign = vi.fn(async (_key: string, _expiresInSeconds?: number) => SIGNED_URL)

/**
 * Only the presigner is faked. Everything that decides WHETHER to sign — the
 * 404 that must be answered before a URL exists at all, and the live-photo
 * predicate — is the real code path.
 */
vi.mock('../../../src/lib/storage', () => ({
  getPresignedDownloadUrl: (...args: unknown[]) =>
    mockPresign(...(args as [string, number?])),
}))

import { adminProductionApp } from '../../../src/routes/admin/production-jobs'
import { readJson } from '../../helpers/json'

// ============================================================================
// Helpers
// ============================================================================

const { queries, rowQueues, render, queueRows, failNext, selects, inserts, updates, tx } =
  recorder

const sessionFor = adminSessionFor

const buildApp = () => buildRouteApp('/api/admin/production', adminProductionApp)

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'
const JOB_ID_2 = '2222222b-2222-4222-8222-222222222222'
const VENDOR_ID = '33333333-3333-4333-8333-333333333333'
const VENDOR_ID_2 = '3333333b-3333-4333-8333-333333333333'
const ITEM_A = '44444444-4444-4444-8444-444444444444'
const ITEM_B = '55555555-5555-4555-8555-555555555555'

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const PAST = new Date('2026-01-01T00:00:00Z')
const FUTURE = new Date(Date.now() + 30 * 86_400_000)

/** A rate row exactly as drizzle returns it — amount is a STRING. */
function rate(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rate-1',
    vendorId: VENDOR_ID,
    kind: 'print',
    finish: null,
    longestEdgeMinInches: 0,
    longestEdgeMaxInches: 49,
    amount: '100.00',
    effectiveFrom: PAST,
    effectiveTo: null,
    ...over,
  }
}

function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    orderId: ORDER_ID,
    stage: 'print',
    vendorId: null,
    status: 'draft',
    assignedAt: null,
    sentAt: null,
    dueAt: null,
    receivedAt: null,
    amountExpected: null,
    amountActual: null,
    settlementId: null,
    createdBy: 'admin-user-1',
    createdAt: PAST,
    updatedAt: PAST,
    ...over,
  }
}

/**
 * The audit rows a handler actually wrote, carrying the one fact no assertion on
 * `recordAudit` arguments could give us: whether the row shared the caller's
 * transaction. `recordAudit` writes through the mocked `src/database`, so the
 * recorder sees the INSERT and stamps `inTx` on it like any other query.
 */
interface AuditRow {
  action: string
  outcome: string
  entityType: string | null
  entityId: string | null
  summary: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  inTx: boolean
}

const audits = (): AuditRow[] =>
  inserts(adminAuditLog).map((q) => ({
    ...(q.values as Omit<AuditRow, 'inTx'>),
    inTx: q.inTx,
  }))

beforeEach(() => {
  recorder.reset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('admin'))
  mockPresign.mockClear()
})

// ============================================================================
// Job creation — one transaction, items joined to order_items
// ============================================================================

describe('POST /api/admin/production', () => {
  it('creates the job and its items in ONE transaction', async () => {
    queueRows({
      'select:orders': [[{ id: ORDER_ID }]],
      'select:order_items': [[{ id: ITEM_A, orderId: ORDER_ID }, { id: ITEM_B, orderId: ORDER_ID }]],
      'insert:production_jobs': [[jobRow()]],
      'insert:production_job_items': [
        [
          { id: 'pji-1', jobId: JOB_ID, orderItemId: ITEM_A },
          { id: 'pji-2', jobId: JOB_ID, orderItemId: ITEM_B },
        ],
      ],
    })

    const res = await buildApp().request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [ITEM_A, ITEM_B] })
    )
    expect(res.status).toBe(201)

    const body = await readJson(res)
    expect(body.job.id).toBe(JOB_ID)
    expect(body.items).toHaveLength(2)

    // Both writes inside the same transaction — this is what makes an orphan
    // job impossible rather than merely unlikely.
    const jobInsert = inserts(productionJobs)[0]
    const itemInsert = inserts(productionJobItems)[0]
    expect(jobInsert?.inTx).toBe(true)
    expect(itemInsert?.inTx).toBe(true)
    expect(tx.commits).toBe(1)
    expect(tx.rollbacks).toBe(0)

    expect(jobInsert?.values).toMatchObject({
      orderId: ORDER_ID,
      stage: 'print',
      status: 'draft',
      createdBy: 'admin-user-1',
    })
    expect(itemInsert?.values).toEqual([
      { jobId: JOB_ID, orderItemId: ITEM_A },
      { jobId: JOB_ID, orderItemId: ITEM_B },
    ])
  })

  it('rolls back — leaving no orphan job — when the item insert fails partway', async () => {
    queueRows({
      'select:orders': [[{ id: ORDER_ID }]],
      'select:order_items': [[{ id: ITEM_A, orderId: ORDER_ID }]],
      'insert:production_jobs': [[jobRow()]],
    })
    failNext('insert:production_job_items')

    const res = await buildApp().request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [ITEM_A] })
    )
    expect(res.status).toBe(500)

    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    // The job insert happened inside the transaction that rolled back, so it
    // never becomes a row.
    expect(inserts(productionJobs)[0]?.inTx).toBe(true)
  })

  it('404s an unknown order and writes nothing', async () => {
    queueRows({ 'select:orders': [[]] })

    const res = await buildApp().request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [ITEM_A] })
    )
    expect(res.status).toBe(404)
    expect(queries.some((q) => q.op === 'insert')).toBe(false)
  })

  it('422s when an order item does not belong to the order, and writes nothing', async () => {
    queueRows({
      'select:orders': [[{ id: ORDER_ID }]],
      // ITEM_B is not on this order, so only ITEM_A comes back.
      'select:order_items': [[{ id: ITEM_A, orderId: ORDER_ID }]],
    })

    const res = await buildApp().request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [ITEM_A, ITEM_B] })
    )
    expect(res.status).toBe(422)

    const body = await readJson(res)
    expect(body.missingOrderItemIds).toEqual([ITEM_B])
    expect(queries.some((q) => q.op === 'insert')).toBe(false)
  })

  it('rejects an empty item list and an unknown stage', async () => {
    const empty = await buildApp().request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [] })
    )
    expect(empty.status).toBe(400)

    const badStage = await buildApp().request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'laminate', orderItemIds: [ITEM_A] })
    )
    expect(badStage.status).toBe(400)
  })

  it('splits one order across two vendors — the reason items join to order_items', async () => {
    queueRows({
      'select:orders': [[{ id: ORDER_ID }], [{ id: ORDER_ID }]],
      'select:order_items': [[{ id: ITEM_A, orderId: ORDER_ID }], [{ id: ITEM_B, orderId: ORDER_ID }]],
      'insert:production_jobs': [
        [jobRow({ id: JOB_ID, stage: 'print' })],
        [jobRow({ id: JOB_ID_2, stage: 'frame' })],
      ],
      'insert:production_job_items': [
        [{ id: 'pji-1', jobId: JOB_ID, orderItemId: ITEM_A }],
        [{ id: 'pji-2', jobId: JOB_ID_2, orderItemId: ITEM_B }],
      ],
      // Two assignments follow: job, vendor, items, rates, update — twice.
      'select:production_jobs': [
        [jobRow({ id: JOB_ID, stage: 'print' })],
        [jobRow({ id: JOB_ID_2, stage: 'frame' })],
      ],
      'select:vendors': [[{ id: VENDOR_ID, name: 'Print Co' }], [{ id: VENDOR_ID_2, name: 'Frame Co' }]],
      'select:production_job_items': [
        [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
        [{ orderItemId: ITEM_B, widthInches: 24, heightInches: 36 }],
      ],
      'select:vendor_rates': [
        [rate({ amount: '100.00' })],
        [rate({ id: 'rate-2', vendorId: VENDOR_ID_2, kind: 'frame', amount: '250.00' })],
      ],
      'update:production_jobs': [
        [jobRow({ id: JOB_ID, vendorId: VENDOR_ID, status: 'assigned', amountExpected: '100.00' })],
        [jobRow({ id: JOB_ID_2, vendorId: VENDOR_ID_2, status: 'assigned', amountExpected: '250.00' })],
      ],
    })

    const app = buildApp()

    const first = await app.request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [ITEM_A] })
    )
    expect(first.status).toBe(201)

    const second = await app.request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'frame', orderItemIds: [ITEM_B] })
    )
    expect(second.status).toBe(201)

    const assignA = await app.request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(assignA.status).toBe(200)
    expect((await readJson(assignA)).job.amountExpected).toBe('100.00')

    const assignB = await app.request(
      `/api/admin/production/${JOB_ID_2}/assign`,
      json({ vendorId: VENDOR_ID_2 })
    )
    expect(assignB.status).toBe(200)
    expect((await readJson(assignB)).job.amountExpected).toBe('250.00')

    const assigned = updates(productionJobs)
    expect(assigned).toHaveLength(2)
    expect(assigned[0]?.values).toMatchObject({ vendorId: VENDOR_ID, status: 'assigned' })
    expect(assigned[1]?.values).toMatchObject({ vendorId: VENDOR_ID_2, status: 'assigned' })
  })
})

// ============================================================================
// Assignment pricing
// ============================================================================

describe('POST /api/admin/production/:jobId/assign', () => {
  function queueAssign(over: {
    items: Array<{
      orderItemId: string
      widthInches: number | null
      heightInches: number | null
      /** The column the route ignored: a line of 3 was priced as one. */
      quantity?: number
    }>
    rates: unknown[]
    stage?: string
    job?: Record<string, unknown>
    updated?: Record<string, unknown>
  }) {
    queueRows({
      'select:production_jobs': [
        [jobRow({ stage: over.stage ?? 'print', ...(over.job ?? {}) })],
      ],
      'select:vendors': [[{ id: VENDOR_ID, name: 'Print Co' }]],
      'select:production_job_items': [
        over.items.map((item) => ({ quantity: 1, ...item })),
      ],
      'select:vendor_rates': [over.rates],
      'update:production_jobs': [
        [jobRow({ vendorId: VENDOR_ID, status: 'assigned', ...(over.updated ?? {}) })],
      ],
    })
  }

  it('prices from the card IN FORCE NOW, not from a rate scheduled to start later', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: [
        rate({ id: 'rate-now', amount: '100.00', effectiveFrom: PAST }),
        rate({ id: 'rate-later', amount: '150.00', effectiveFrom: FUTURE }),
      ],
      updated: { amountExpected: '100.00' },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.amountExpected).toBe('100.00')
    expect(written.vendorId).toBe(VENDOR_ID)
    expect(written.status).toBe('assigned')
    expect(written.assignedAt).toBeInstanceOf(Date)
  })

  it('prices a 24x36 and a 36x24 identically — the LONGEST edge picks the band', async () => {
    const bands = [
      rate({ id: 'small', longestEdgeMinInches: 0, longestEdgeMaxInches: 25, amount: '80.00' }),
      rate({ id: 'large', longestEdgeMinInches: 25, longestEdgeMaxInches: 49, amount: '120.00' }),
    ]

    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: bands,
      updated: { amountExpected: '120.00' },
    })

    const portrait = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(portrait.status).toBe(200)
    const portraitAmount = (updates(productionJobs)[0]?.values as Record<string, unknown>)
      .amountExpected

    queries.length = 0
    rowQueues.clear()
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 36, heightInches: 24 }],
      rates: bands,
      updated: { amountExpected: '120.00' },
    })

    const landscape = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(landscape.status).toBe(200)
    const landscapeAmount = (updates(productionJobs)[0]?.values as Record<string, unknown>)
      .amountExpected

    expect(portraitAmount).toBe('120.00')
    expect(landscapeAmount).toBe(portraitAmount)
  })

  it('sums every item into amountExpected', async () => {
    queueAssign({
      items: [
        { orderItemId: ITEM_A, widthInches: 24, heightInches: 36 },
        { orderItemId: ITEM_B, widthInches: 12, heightInches: 18 },
      ],
      rates: [
        rate({ id: 'small', longestEdgeMinInches: 0, longestEdgeMaxInches: 25, amount: '80.50' }),
        rate({ id: 'large', longestEdgeMinInches: 25, longestEdgeMaxInches: 49, amount: '120.25' }),
      ],
      updated: { amountExpected: '200.75' },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.amountExpected).toBe('200.75')
  })

  it('422s an uncovered size, naming the item — and does NOT write a silent zero', async () => {
    queueAssign({
      items: [
        { orderItemId: ITEM_A, widthInches: 24, heightInches: 36 },
        { orderItemId: ITEM_B, widthInches: 40, heightInches: 60 },
      ],
      rates: [rate({ longestEdgeMinInches: 0, longestEdgeMaxInches: 49, amount: '100.00' })],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(422)

    const body = await readJson(res)
    expect(body.unpriced).toEqual([
      expect.objectContaining({ orderItemId: ITEM_B, longestEdge: 60, size: '40x60' }),
    ])

    // Nothing was written. A zero here is an unbillable job with no explanation.
    expect(updates(productionJobs)).toHaveLength(0)
  })

  it('422s when the vendor has no rate card at all', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: [],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(422)
    expect(updates(productionJobs)).toHaveLength(0)
  })

  it('422s an item whose variant dimensions are unknown', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: null, heightInches: null }],
      rates: [rate()],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(422)

    const body = await readJson(res)
    expect(body.unpriced[0]).toMatchObject({ orderItemId: ITEM_A, longestEdge: null })
    expect(updates(productionJobs)).toHaveLength(0)
  })

  it('404s an unknown job and an unknown vendor', async () => {
    queueRows({ 'select:production_jobs': [[]] })

    const noJob = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(noJob.status).toBe(404)

    queries.length = 0
    rowQueues.clear()
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:vendors': [[]],
    })

    const noVendor = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(noVendor.status).toBe(404)
    expect(updates(productionJobs)).toHaveLength(0)
  })

  it('422s a job with no items rather than pricing it at zero', async () => {
    queueAssign({ items: [], rates: [rate()] })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(422)
    expect(updates(productionJobs)).toHaveLength(0)
  })

  it('prices a line of quantity 3 as THREE units, not one', async () => {
    // `priceItems` added one rate per item ROW, so a basket line of three
    // posters was priced as a single poster and the vendor was underpaid by
    // two. Latent only because nothing creates jobs yet.
    queueAssign({
      items: [{ orderItemId: ITEM_A, quantity: 3, widthInches: 24, heightInches: 36 }],
      rates: [rate({ amount: '100.00' })],
      updated: { amountExpected: '300.00' },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.amountExpected).toBe('300.00')
  })

  it('adds the quantities of two lines rather than the count of lines', async () => {
    queueAssign({
      items: [
        { orderItemId: ITEM_A, quantity: 2, widthInches: 24, heightInches: 36 },
        { orderItemId: ITEM_B, quantity: 3, widthInches: 12, heightInches: 18 },
      ],
      rates: [
        rate({ id: 'small', longestEdgeMinInches: 0, longestEdgeMaxInches: 25, amount: '80.50' }),
        rate({ id: 'large', longestEdgeMinInches: 25, longestEdgeMaxInches: 49, amount: '120.25' }),
      ],
      // 2 x 120.25 + 3 x 80.50 = 482.00
      updated: { amountExpected: '482.00' },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.amountExpected).toBe('482.00')
  })

  it('locks the job it read and writes inside ONE transaction with its audit row', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: [rate()],
      updated: { amountExpected: '100.00' },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)

    // A mock cannot serialise anything, so the suite proves the shape the lock
    // needs instead: the read is inside the transaction and precedes the write,
    // and the write repeats the predicate.
    const readIndex = queries.findIndex((q) => q.op === 'select' && q.table === 'production_jobs')
    const writeIndex = queries.findIndex((q) => q.op === 'update' && q.table === 'production_jobs')
    expect(readIndex).toBeGreaterThanOrEqual(0)
    expect(readIndex).toBeLessThan(writeIndex)
    expect(queries[readIndex]?.inTx).toBe(true)
    expect(updates(productionJobs)[0]?.inTx).toBe(true)
    expect(tx.commits).toBe(1)

    // The predicate is repeated in the WHERE rather than trusted from the read.
    const guard = render(updates(productionJobs)[0]?.where)
    expect(guard.params).toEqual(expect.arrayContaining([JOB_ID, 'draft']))
    expect(guard.sql).toContain('"settlement_id" is null')
  })

  it.each(['draft', 'qc_failed'])(
    'assigns a job in %s and records production_job.assigned',
    async (status) => {
      queueAssign({
        items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
        rates: [rate()],
        job: { status },
        updated: { amountExpected: '100.00' },
      })

      const res = await buildApp().request(
        `/api/admin/production/${JOB_ID}/assign`,
        json({ vendorId: VENDOR_ID })
      )
      expect(res.status).toBe(200)

      const rows = audits()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        action: 'production_job.assigned',
        outcome: 'success',
        entityType: 'production_job',
        entityId: JOB_ID,
        // Shares the transaction: a row claiming a vendor now owes us work,
        // beside a job that was never assigned, is worse than no row.
        inTx: true,
      })
      expect(rows[0]?.before?.status).toBe(status)
      expect(rows[0]?.after?.status).toBe('assigned')
    }
  )

  it('records ONE reassigned row — not a transitioned row beside it — when the vendor changes', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: [rate()],
      job: { status: 'assigned', vendorId: VENDOR_ID_2 },
      updated: { amountExpected: '100.00' },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)

    // assigned -> assigned is a legal SELF-EDGE. One act, one row, and the row
    // is the one that says what actually changed.
    const rows = audits()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.action).toBe('production_job.reassigned')
    expect(rows[0]?.before?.vendorId).toBe(VENDOR_ID_2)
    expect(rows[0]?.after?.vendorId).toBe(VENDOR_ID)
  })

  it.each(['sent', 'received', 'qc_submitted', 'qc_passed', 'dispatched', 'cancelled'])(
    'refuses to assign a job in %s — the route never read job.status before',
    async (status) => {
      queueRows({
        'select:production_jobs': [[jobRow({ status })]],
        'select:vendors': [[{ id: VENDOR_ID, name: 'Print Co' }]],
      })

      const res = await buildApp().request(
        `/api/admin/production/${JOB_ID}/assign`,
        json({ vendorId: VENDOR_ID })
      )
      expect(res.status).toBe(409)

      const body = await readJson(res)
      expect(body).toMatchObject({ code: 'ILLEGAL_TRANSITION', from: status, to: 'assigned' })
      expect(body.allowed).not.toContain('assigned')

      expect(updates(productionJobs)).toHaveLength(0)
      expect(tx.rollbacks).toBe(1)
      expect(audits()).toMatchObject([
        { action: 'production_job.transition_refused', outcome: 'failure', inTx: false },
      ])
    }
  )

  it('refuses to reassign a settled job, so the settlement cannot outgrow its jobs', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'assigned', vendorId: VENDOR_ID_2, settlementId: 'settle-1' })]],
      'select:vendors': [[{ id: VENDOR_ID, name: 'Print Co' }]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(409)
    expect((await readJson(res)).code).toBe('JOB_SETTLED')
    expect(updates(productionJobs)).toHaveLength(0)
    expect(audits()).toMatchObject([
      { action: 'production_job.transition_refused', outcome: 'failure', inTx: false },
    ])
  })

  it('409s a stale expectedVendorId and names the vendor that actually holds the job', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'assigned', vendorId: VENDOR_ID_2 })]],
      'select:vendors': [[{ id: VENDOR_ID, name: 'Print Co' }]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID, expectedVendorId: null })
    )
    expect(res.status).toBe(409)

    const body = await readJson(res)
    expect(body).toMatchObject({ code: 'VENDOR_MISMATCH', currentVendorId: VENDOR_ID_2 })
    expect(updates(productionJobs)).toHaveLength(0)
  })

  it('assigns when expectedVendorId matches what the row actually holds', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: [rate()],
      job: { status: 'assigned', vendorId: VENDOR_ID_2 },
      updated: { amountExpected: '100.00' },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID, expectedVendorId: VENDOR_ID_2 })
    )
    expect(res.status).toBe(200)
  })
})

// ============================================================================
// PATCH — the transition guard, the amount override, and the audit row
// ============================================================================

/**
 * The matrix in `lib/production-transitions.ts` is the authority; these two
 * tables are the enumeration of it this route is answerable for. `qc_passed`
 * and `qc_failed` appear in neither, because PATCH no longer accepts them at
 * all: a verdict with no review row is a verdict with no evidence, so those two
 * are reachable only through POST /:jobId/reviews.
 */
const LEGAL_ADMIN_EDGES: Array<[string, string]> = [
  ['draft', 'assigned'],
  ['draft', 'cancelled'],
  ['assigned', 'cancelled'],
  ['received', 'cancelled'],
  ['qc_submitted', 'cancelled'],
  ['qc_passed', 'dispatched'],
  ['qc_passed', 'cancelled'],
  ['qc_failed', 'assigned'],
  ['qc_failed', 'cancelled'],
]

const ILLEGAL_ADMIN_EDGES: Array<[string, string]> = [
  ['draft', 'sent'], // retired: zero in-edges, zero out-edges
  ['draft', 'received'], // the vendor's edge, not ours
  ['draft', 'dispatched'], // skips the entire pipeline
  ['assigned', 'received'], // vendor-only
  ['assigned', 'dispatched'],
  ['received', 'assigned'],
  ['qc_submitted', 'dispatched'],
  ['sent', 'cancelled'],
  ['dispatched', 'cancelled'], // terminal
  ['cancelled', 'assigned'], // terminal — cancellation wins every race
  ['cancelled', 'draft'],
]

describe('PATCH /api/admin/production/:jobId', () => {
  it.each(LEGAL_ADMIN_EDGES)(
    'takes the legal edge %s -> %s and records exactly one transition row',
    async (from, to) => {
      queueRows({
        'select:production_jobs': [[jobRow({ status: from })]],
        'update:production_jobs': [[jobRow({ status: to })]],
      })

      const res = await buildApp().request(
        `/api/admin/production/${JOB_ID}`,
        json({ status: to }, 'PATCH')
      )
      expect(res.status).toBe(200)

      // The from-status the move was authorised against is repeated in the
      // UPDATE's WHERE, so an admin who moved the job first wins and this one
      // matches nothing rather than overwriting them.
      const written = updates(productionJobs)[0]
      expect(written?.inTx).toBe(true)
      expect(render(written?.where).params).toEqual(expect.arrayContaining([JOB_ID, from]))

      const rows = audits()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        action: 'production_job.transitioned',
        outcome: 'success',
        entityType: 'production_job',
        entityId: JOB_ID,
        // Shares the transaction. A row saying the job moved, beside a job
        // still sitting where it was, is worse than no row at all.
        inTx: true,
      })
      expect(rows[0]?.before?.status).toBe(from)
      expect(rows[0]?.after?.status).toBe(to)
    }
  )

  it.each(ILLEGAL_ADMIN_EDGES)(
    'refuses %s -> %s with 409, writes no job row, and keeps the refusal row',
    async (from, to) => {
      queueRows({ 'select:production_jobs': [[jobRow({ status: from })]] })

      const res = await buildApp().request(
        `/api/admin/production/${JOB_ID}`,
        json({ status: to }, 'PATCH')
      )
      // 409, not 422. In this router 422 means "your payload names things that
      // do not line up" and is fixed by editing the body; here the body is fine
      // and the world moved.
      expect(res.status).toBe(409)

      const body = await readJson(res)
      expect(body).toMatchObject({ code: 'ILLEGAL_TRANSITION', from, to })
      expect(Array.isArray(body.allowed)).toBe(true)
      expect(body.allowed).not.toContain(to)

      expect(updates(productionJobs)).toHaveLength(0)
      expect(tx.rollbacks).toBe(1)
      expect(tx.commits).toBe(0)

      const rows = audits()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        action: 'production_job.transition_refused',
        outcome: 'failure',
        entityId: JOB_ID,
        // Written OUTSIDE the transaction that rolled back. Inside it, the row
        // recording the rollback would be rolled back with it.
        inTx: false,
      })
      expect(rows[0]?.metadata?.to).toBe(to)
    }
  )

  it('treats assigned -> assigned as a legal no-op and records no transition row', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'assigned', vendorId: VENDOR_ID })]],
      'update:production_jobs': [[jobRow({ status: 'assigned', vendorId: VENDOR_ID })]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'assigned' }, 'PATCH')
    )
    expect(res.status).toBe(200)

    // One row per TRANSITION. Nothing moved, so nothing is recorded here —
    // re-pricing a reassignment is the assign route's act, and its row.
    expect(audits()).toHaveLength(0)
  })

  it.each(['qc_passed', 'qc_failed'])(
    'refuses %s outright — a verdict with no review row is a verdict with no evidence',
    async (status) => {
      const res = await buildApp().request(
        `/api/admin/production/${JOB_ID}`,
        json({ status }, 'PATCH')
      )
      expect(res.status).toBe(400)
      expect(queries).toHaveLength(0)
    }
  )

  it('records an amountActual override and reports it as the payable', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ amountExpected: '100.00', status: 'received' })]],
      'update:production_jobs': [
        [jobRow({ amountExpected: '100.00', amountActual: '90.00', status: 'received' })],
      ],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ amountActual: '90.00' }, 'PATCH')
    )
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.job.amountActual).toBe('90.00')
    // The override, not the expectation — this is lib/vendor-payables' rule and
    // the number a settlement will be built from.
    expect(body.payableAmount).toBe('90.00')

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.amountActual).toBe('90.00')

    const rows = audits()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'production_job.amount_overridden',
      outcome: 'success',
      inTx: true,
    })
    expect(rows[0]?.after?.amountActual).toBe('90.00')
  })

  it('refuses a negative amountActual and writes nothing', async () => {
    // The override feeds the payables sum directly, so a negative would quietly
    // reduce what we owe a vendor — a credit note, which this system
    // deliberately does not model. Money leaves via settlements or not at all.
    // vendor-rates requires amount >= 0 and settlements require amount > 0;
    // this field was the one gap.
    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ amountActual: '-50.00' }, 'PATCH')
    )

    expect(res.status).toBe(400)
    expect(updates(productionJobs)).toHaveLength(0)
  })

  it('accepts the date fields alongside a legal move', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'draft' })]],
      'update:production_jobs': [
        [jobRow({ status: 'cancelled', sentAt: new Date('2026-08-01T00:00:00Z') })],
      ],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json(
        {
          status: 'cancelled',
          sentAt: '2026-08-01T00:00:00.000Z',
          dueAt: '2026-08-10T00:00:00.000Z',
        },
        'PATCH'
      )
    )
    expect(res.status).toBe(200)

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.status).toBe('cancelled')
    expect(written.sentAt).toBeInstanceOf(Date)
    expect(written.dueAt).toBeInstanceOf(Date)
  })

  it('locks the row it read, so two admins on one job serialise', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'draft' })]],
      'update:production_jobs': [[jobRow({ status: 'cancelled' })]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'cancelled' }, 'PATCH')
    )
    expect(res.status).toBe(200)

    const readIndex = queries.findIndex((q) => q.op === 'select' && q.table === 'production_jobs')
    const writeIndex = queries.findIndex((q) => q.op === 'update' && q.table === 'production_jobs')
    expect(readIndex).toBeGreaterThanOrEqual(0)
    expect(readIndex).toBeLessThan(writeIndex)
    expect(queries[readIndex]?.inTx).toBe(true)
  })

  it('rolls back — rather than returning a 200 — when the guarded UPDATE matches no row', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'draft' })]],
      // Someone else moved the job between the read and the write, so the
      // repeated predicate matches nothing.
      'update:production_jobs': [[]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'cancelled' }, 'PATCH')
    )
    expect(res.status).toBe(409)
    expect((await readJson(res)).code).toBe('CONCURRENT_MODIFICATION')

    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    expect(audits()).toMatchObject([
      { action: 'production_job.transition_refused', outcome: 'failure', inTx: false },
    ])
  })

  it('refuses every transition and every amount edit on a settled job', async () => {
    queueRows({
      'select:production_jobs': [
        [jobRow({ status: 'qc_passed', settlementId: 'settle-1' })],
        [jobRow({ status: 'qc_passed', settlementId: 'settle-1' })],
      ],
    })
    const app = buildApp()

    const moved = await app.request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'cancelled' }, 'PATCH')
    )
    expect(moved.status).toBe(409)
    expect((await readJson(moved)).code).toBe('JOB_SETTLED')

    const repriced = await app.request(
      `/api/admin/production/${JOB_ID}`,
      json({ amountActual: '5.00' }, 'PATCH')
    )
    expect(repriced.status).toBe(409)

    // Payables are DERIVED with no stored total, so an amount edit after
    // settlement makes the settlement disagree with the sum of its jobs
    // silently.
    expect(updates(productionJobs)).toHaveLength(0)
    expect(audits()).toHaveLength(2)
    expect(audits().every((row) => row.outcome === 'failure')).toBe(true)
  })

  it('404s an unknown job and 400s an empty patch', async () => {
    queueRows({ 'select:production_jobs': [[]] })

    const missing = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ amountActual: '10.00' }, 'PATCH')
    )
    // The 404 comes from the SELECT the guard needs anyway, not from an empty
    // returning() on a blind UPDATE.
    expect(missing.status).toBe(404)
    expect(updates(productionJobs)).toHaveLength(0)

    const empty = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({}, 'PATCH')
    )
    expect(empty.status).toBe(400)
  })
})

// ============================================================================
// QC reviews — the verdict IS the transition
// ============================================================================

/**
 * A verdict is meaningless on work that was never submitted, so the matrix in
 * `lib/production-transitions.ts` gives `qc_passed` and `qc_failed` exactly one
 * in-edge each from `qc_submitted` — plus one deliberate exception, `qc_passed
 * -> qc_failed`, so a supervisor re-inspecting and overturning leaves a SECOND
 * review row while the first survives. This route asks the matrix rather than
 * repeating a status literal beside it: a hardcoded `from === 'qc_submitted'`
 * would make that overturn edge unreachable from anywhere, and the matrix
 * documents it as reachable only through here.
 */
const NON_SUBMITTED_STATUSES = [
  'draft',
  'assigned',
  'sent',
  'received',
  'qc_failed',
  'dispatched',
  'cancelled',
] as const

const REVIEW_ID = '66666666-6666-4666-8666-666666666666'
const REVIEW_ID_2 = '6666666b-6666-4666-8666-666666666666'

function reviewRow(over: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    jobId: JOB_ID,
    reviewerId: 'admin-user-1',
    verdict: 'pass',
    defects: null,
    notes: null,
    createdAt: PAST,
    ...over,
  }
}

function photoRow(slot: string, over: Record<string, unknown> = {}) {
  return {
    id: `photo-${slot}`,
    jobId: JOB_ID,
    slot,
    objectKey: `production-qc/${JOB_ID}/${slot}/shot.jpg`,
    contentType: 'image/jpeg',
    sizeBytes: 2048,
    uploadedBy: 'vendor-user-1',
    uploadedAt: PAST,
    supersededAt: null,
    reviewId: null,
    ...over,
  }
}

const reviewsPath = `/api/admin/production/${JOB_ID}/reviews`

describe('POST /api/admin/production/:jobId/reviews', () => {
  it('passes a qc_submitted job in ONE transaction and moves it to qc_passed', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]],
      'insert:production_job_reviews': [[reviewRow({ verdict: 'pass' })]],
      'update:production_jobs': [[jobRow({ status: 'qc_passed' })]],
      'update:production_job_photos': [[photoRow('print_full', { reviewId: REVIEW_ID })]],
    })

    const res = await buildApp().request(
      reviewsPath,
      json({ verdict: 'pass', notes: 'clean' })
    )
    expect(res.status).toBe(201)

    const body = await readJson(res)
    expect(body.review.id).toBe(REVIEW_ID)
    expect(body.job.status).toBe('qc_passed')

    // The verdict and the move are one fact, so they are one transaction. The
    // queue showing `received` for a job that failed inspection an hour ago is
    // exactly what this closes.
    expect(inserts(productionJobReviews)[0]?.inTx).toBe(true)
    expect(updates(productionJobs)[0]?.inTx).toBe(true)
    expect(tx.commits).toBe(1)
    expect(tx.rollbacks).toBe(0)

    const written = updates(productionJobs)[0]
    expect((written?.values as Record<string, unknown>).status).toBe('qc_passed')
    // The from-status is REPEATED in the UPDATE's WHERE, not trusted from the
    // read: an admin who moved the job between the two statements wins.
    expect(render(written?.where).params).toEqual(
      expect.arrayContaining([JOB_ID, 'qc_submitted'])
    )

    // reviewerId comes from the session, never from the body: who signed off is
    // not the caller's to assert.
    expect(inserts(productionJobReviews)[0]?.values).toMatchObject({
      jobId: JOB_ID,
      reviewerId: 'admin-user-1',
      verdict: 'pass',
    })

    const rows = audits()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'production_job.qc_approved',
      outcome: 'success',
      entityType: 'production_job',
      entityId: JOB_ID,
      // Shares the transaction: a row saying the job passed, beside a job still
      // sitting in qc_submitted, is worse than no row.
      inTx: true,
    })
    expect(rows[0]?.metadata?.reviewId).toBe(REVIEW_ID)
    expect(rows[0]?.before?.status).toBe('qc_submitted')
    expect(rows[0]?.after?.status).toBe('qc_passed')
    // The verdict and the status move are the SAME act. A `transitioned` row
    // beside this one counts one act twice.
    expect(rows.some((row) => row.action === 'production_job.transitioned')).toBe(false)
  })

  it('fails a qc_submitted job and carries the defects on the one audit row', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]],
      'insert:production_job_reviews': [
        [reviewRow({ id: REVIEW_ID_2, verdict: 'fail', defects: ['banding', 'scuff'] })],
      ],
      'update:production_jobs': [[jobRow({ status: 'qc_failed' })]],
      'update:production_job_photos': [[]],
    })

    const res = await buildApp().request(
      reviewsPath,
      json({ verdict: 'fail', defects: ['banding', 'scuff'] })
    )
    expect(res.status).toBe(201)
    expect((await readJson(res)).job.status).toBe('qc_failed')

    expect((inserts(productionJobReviews)[0]?.values as Record<string, unknown>).defects).toEqual([
      'banding',
      'scuff',
    ])

    const rows = audits()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'production_job.qc_rejected',
      outcome: 'success',
      entityId: JOB_ID,
      inTx: true,
    })
    expect(rows[0]?.metadata?.reviewId).toBe(REVIEW_ID_2)
    expect(rows[0]?.metadata?.defects).toEqual(['banding', 'scuff'])
    expect(rows[0]?.after?.status).toBe('qc_failed')
    expect(rows.some((row) => row.action === 'production_job.transitioned')).toBe(false)
  })

  it.each([
    ['omitted', {}],
    ['null', { defects: null }],
    ['empty', { defects: [] }],
  ])('refuses a fail whose defects are %s, and writes nothing at all', async (_label, over) => {
    const res = await buildApp().request(reviewsPath, json({ verdict: 'fail', ...over }))

    // A fail with no defect is unactionable: the vendor cannot know what to
    // redo. Refused at the body, so not one query is issued.
    expect(res.status).toBe(400)
    expect(queries).toHaveLength(0)
  })

  it('still accepts a PASS with no defects — nothing was wrong with it', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]],
      'insert:production_job_reviews': [[reviewRow({ verdict: 'pass' })]],
      'update:production_jobs': [[jobRow({ status: 'qc_passed' })]],
      'update:production_job_photos': [[]],
    })

    const res = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))
    expect(res.status).toBe(201)
  })

  it('stamps review_id onto every LIVE photo the verdict judged', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]],
      'insert:production_job_reviews': [[reviewRow({ verdict: 'pass' })]],
      'update:production_jobs': [[jobRow({ status: 'qc_passed' })]],
      'update:production_job_photos': [
        [
          photoRow('print_full', { reviewId: REVIEW_ID }),
          photoRow('print_raking_light', { reviewId: REVIEW_ID }),
        ],
      ],
    })

    const res = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))
    expect(res.status).toBe(201)

    // What the verdict judged, named back to the caller — this is what lets a
    // dispute a year later say WHICH shots were approved.
    expect((await readJson(res)).judgedSlots).toEqual(['print_full', 'print_raking_light'])

    const stamp = updates(productionJobPhotos)[0]
    expect(stamp?.inTx).toBe(true)
    expect((stamp?.values as Record<string, unknown>).reviewId).toBe(REVIEW_ID)

    // LIVE photos only. A superseded shot was judged by an earlier review and
    // re-stamping it would rewrite that history.
    const { sql, params } = render(stamp?.where)
    expect(params).toContain(JOB_ID)
    expect(sql.toLowerCase()).toContain('superseded_at')
    expect(sql.toLowerCase()).toContain('is null')
  })

  it.each(NON_SUBMITTED_STATUSES)(
    'refuses a verdict on a %s job, writes no review row, and keeps the refusal row',
    async (status) => {
      queueRows({ 'select:production_jobs': [[jobRow({ status })]] })

      const res = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))
      expect(res.status).toBe(409)

      const body = await readJson(res)
      expect(body.from).toBe(status)
      expect(body.to).toBe('qc_passed')

      // Nothing is written, so production_job_reviews' append-only guarantee is
      // untouched: there is no row to be sorry about.
      expect(inserts(productionJobReviews)).toHaveLength(0)
      expect(updates(productionJobs)).toHaveLength(0)
      expect(updates(productionJobPhotos)).toHaveLength(0)
      expect(tx.rollbacks).toBe(1)
      expect(tx.commits).toBe(0)

      const rows = audits()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        action: 'production_job.transition_refused',
        outcome: 'failure',
        entityId: JOB_ID,
        // Written OUTSIDE the transaction that rolled back. Inside it, the row
        // recording the rollback is rolled back with it — the one row that has
        // to survive, erased by the thing it exists to record.
        inTx: false,
      })
    }
  )

  it('refuses a second PASS on an already-passed job — the matrix has no such edge', async () => {
    queueRows({ 'select:production_jobs': [[jobRow({ status: 'qc_passed' })]] })

    const res = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))
    expect(res.status).toBe(409)
    expect((await readJson(res)).code).toBe('ILLEGAL_TRANSITION')
    expect(inserts(productionJobReviews)).toHaveLength(0)
  })

  it('lets a supervisor overturn a pass, and BOTH review rows survive', async () => {
    queueRows({
      'select:production_jobs': [
        [jobRow({ status: 'qc_submitted' })],
        [jobRow({ status: 'qc_passed' })],
      ],
      'insert:production_job_reviews': [
        [reviewRow({ id: REVIEW_ID, verdict: 'pass' })],
        [reviewRow({ id: REVIEW_ID_2, verdict: 'fail', defects: ['mitre gap'] })],
      ],
      'update:production_jobs': [
        [jobRow({ status: 'qc_passed' })],
        [jobRow({ status: 'qc_failed' })],
      ],
      'update:production_job_photos': [[], []],
    })

    const app = buildApp()

    const passed = await app.request(reviewsPath, json({ verdict: 'pass' }))
    expect(passed.status).toBe(201)

    // qc_passed -> qc_failed exists precisely for this: a supervisor
    // re-inspecting before the piece leaves.
    const overturned = await app.request(
      reviewsPath,
      json({ verdict: 'fail', defects: ['mitre gap'] })
    )
    expect(overturned.status).toBe(201)

    const appended = inserts(productionJobReviews)
    expect(appended).toHaveLength(2)
    expect(appended.map((q) => (q.values as Record<string, unknown>).verdict)).toEqual([
      'pass',
      'fail',
    ])

    // APPEND ONLY. One UPDATE here and the QC history is gone.
    expect(updates(productionJobReviews)).toHaveLength(0)
    expect(queries.some((q) => q.op === 'delete' && q.table === 'production_job_reviews')).toBe(
      false
    )

    expect(audits().map((row) => row.action)).toEqual([
      'production_job.qc_approved',
      'production_job.qc_rejected',
    ])
  })

  it('rolls back — rather than returning a 201 — when the guarded UPDATE matches no row', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]],
      'insert:production_job_reviews': [[reviewRow()]],
      // Someone else moved the job between the read and the write, so the
      // repeated predicate matches nothing.
      'update:production_jobs': [[]],
    })

    const res = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))
    expect(res.status).toBe(409)
    expect((await readJson(res)).code).toBe('CONCURRENT_MODIFICATION')

    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    // The insert happened inside the transaction that rolled back, so it never
    // becomes a row.
    expect(inserts(productionJobReviews)[0]?.inTx).toBe(true)
    expect(audits()).toMatchObject([
      { action: 'production_job.transition_refused', outcome: 'failure', inTx: false },
    ])
  })

  it('refuses a verdict on a settled job and writes nothing', async () => {
    queueRows({
      'select:production_jobs': [
        [jobRow({ status: 'qc_submitted', settlementId: 'settle-1' })],
      ],
    })

    const res = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))
    expect(res.status).toBe(409)
    expect((await readJson(res)).code).toBe('JOB_SETTLED')

    expect(inserts(productionJobReviews)).toHaveLength(0)
    expect(updates(productionJobs)).toHaveLength(0)
    expect(audits()).toMatchObject([{ outcome: 'failure', inTx: false }])
  })

  it('locks the job row it read, and reads it before it writes', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]],
      'insert:production_job_reviews': [[reviewRow()]],
      'update:production_jobs': [[jobRow({ status: 'qc_passed' })]],
      'update:production_job_photos': [[]],
    })

    const res = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))
    expect(res.status).toBe(201)

    const readIndex = queries.findIndex((q) => q.op === 'select' && q.table === 'production_jobs')
    const writeIndex = queries.findIndex((q) => q.op === 'update' && q.table === 'production_jobs')
    expect(readIndex).toBeGreaterThanOrEqual(0)
    expect(readIndex).toBeLessThan(writeIndex)
    expect(queries[readIndex]?.inTx).toBe(true)
  })

  it('rejects an unknown verdict and 404s an unknown job', async () => {
    const bad = await buildApp().request(reviewsPath, json({ verdict: 'maybe' }))
    expect(bad.status).toBe(400)
    expect(queries).toHaveLength(0)

    queries.length = 0
    rowQueues.clear()
    queueRows({ 'select:production_jobs': [[]] })

    const missing = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))
    expect(missing.status).toBe(404)
    expect(inserts(productionJobReviews)).toHaveLength(0)
  })

  it('lists the reviews newest first on the job detail — the latest verdict is the current one', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_failed' })]],
      'select:production_job_items': [[]],
      'select:production_job_reviews': [
        [
          { id: 'rev-3', verdict: 'pass', createdAt: new Date('2026-08-03') },
          { id: 'rev-2', verdict: 'fail', createdAt: new Date('2026-08-02') },
          { id: 'rev-1', verdict: 'fail', createdAt: new Date('2026-08-01') },
        ],
      ],
    })

    const res = await buildApp().request(`/api/admin/production/${JOB_ID}`)
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.reviews.map((r: { id: string }) => r.id)).toEqual(['rev-3', 'rev-2', 'rev-1'])

    // Newest first is an ORDER BY, not the insertion order of a mock.
    expect(render(selects(productionJobReviews)[0]?.orderBy).sql.toLowerCase()).toContain('desc')
  })
})

// ============================================================================
// GET /:jobId/photos — the shot list the admin judges
// ============================================================================

describe('GET /api/admin/production/:jobId/photos', () => {
  it('lays the live photos out against the shot list and signs a download url for each', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted', stage: 'print' })]],
      'select:production_job_photos': [
        [photoRow('print_full'), photoRow('print_raking_light')],
      ],
    })

    const res = await buildApp().request(`/api/admin/production/${JOB_ID}/photos`)
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.stage).toBe('print')

    // The WHOLE shot list, not only what was uploaded: an empty slot is the
    // point of the screen.
    expect(body.shots.map((s: { slot: string }) => s.slot)).toEqual(
      QC_SHOT_LIST.print.map((shot) => shot.slot)
    )

    const full = body.shots.find((s: { slot: string }) => s.slot === 'print_full')
    expect(full.required).toBe(true)
    expect(full.photo.url).toBe(SIGNED_URL)
    expect(full.photo.contentType).toBe('image/jpeg')

    const optional = body.shots.find((s: { slot: string }) => s.slot === 'print_detail')
    expect(optional.photo).toBeNull()
    expect(optional.required).toBe(false)

    // One signature per live photo and none for the empty slots — a signed URL
    // that is generated and then withheld has still been generated.
    expect(mockPresign).toHaveBeenCalledTimes(2)
    expect(mockPresign).toHaveBeenCalledWith(
      `production-qc/${JOB_ID}/print_full/shot.jpg`,
      expect.any(Number)
    )

    // What the vendor still has to shoot, which is the one thing the reviewer
    // has to act on.
    expect(body.missingRequiredSlots).toEqual(['print_colour_reference'])
    expect(body.expiresInSeconds).toBeGreaterThan(0)
  })

  it('never returns the object key — a key that leaves is a capability that leaves', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted', stage: 'print' })]],
      'select:production_job_photos': [[photoRow('print_full')]],
    })

    const res = await buildApp().request(`/api/admin/production/${JOB_ID}/photos`)
    const serialised = JSON.stringify(await readJson(res))

    expect(serialised).not.toContain('objectKey')
    expect(serialised).not.toContain('production-qc/')
  })

  it('reads LIVE photos only, scoped to this job', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted', stage: 'print' })]],
      'select:production_job_photos': [[]],
    })

    const res = await buildApp().request(`/api/admin/production/${JOB_ID}/photos`)
    expect(res.status).toBe(200)

    const { sql, params } = render(selects(productionJobPhotos)[0]?.where)
    expect(params).toContain(JOB_ID)
    expect(sql.toLowerCase()).toContain('superseded_at')
    expect(sql.toLowerCase()).toContain('is null')
  })

  it('renders the frame shot list for a frame job', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'received', stage: 'frame' })]],
      'select:production_job_photos': [[]],
    })

    const res = await buildApp().request(`/api/admin/production/${JOB_ID}/photos`)
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.shots).toHaveLength(QC_SHOT_LIST.frame.length)
    // Each corner is its own slot: one entry would be one photograph asserting
    // four mitre joins are clean.
    expect(body.missingRequiredSlots).toEqual(requiredQcSlots('frame'))
    expect(mockPresign).not.toHaveBeenCalled()
  })

  it('surfaces a live photo whose slot is not on this stage list rather than hiding it', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted', stage: 'print' })]],
      'select:production_job_photos': [[photoRow('frame_back')]],
    })

    const res = await buildApp().request(`/api/admin/production/${JOB_ID}/photos`)
    expect(res.status).toBe(200)

    const body = await readJson(res)
    const stray = body.shots.find((s: { slot: string }) => s.slot === 'frame_back')
    expect(stray).toBeDefined()
    expect(stray.onShotList).toBe(false)
    expect(stray.photo.url).toBe(SIGNED_URL)
  })

  it('404s an unknown job and never reaches the presigner', async () => {
    queueRows({ 'select:production_jobs': [[]] })

    const res = await buildApp().request(`/api/admin/production/${JOB_ID}/photos`)
    expect(res.status).toBe(404)
    expect(selects(productionJobPhotos)).toHaveLength(0)
    expect(mockPresign).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Queue listing
// ============================================================================

describe('GET /api/admin/production', () => {
  it('returns a bounded, paginated envelope with no query string', async () => {
    queueRows({
      'select:production_jobs': [
        [{ value: 1 }],
        [{ ...jobRow(), vendorName: null }],
      ],
    })

    const res = await buildApp().request('/api/admin/production')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 })
    expect(body.items).toHaveLength(1)

    const page = selects(productionJobs).find((q) => q.limit !== undefined)
    expect(page?.limit).toBe(20)
    expect(page?.offset).toBe(0)
  })

  it('honours page/pageSize and caps pageSize at 100', async () => {
    queueRows({ 'select:production_jobs': [[{ value: 250 }], []] })

    const res = await buildApp().request('/api/admin/production?page=3&pageSize=500')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.page).toBe(3)
    expect(body.pageSize).toBe(100)

    const page = selects(productionJobs).find((q) => q.limit !== undefined)
    expect(page?.limit).toBe(100)
    expect(page?.offset).toBe(200)
  })

  it('filters by stage, status and vendor', async () => {
    queueRows({ 'select:production_jobs': [[{ value: 0 }], []] })

    const res = await buildApp().request(
      `/api/admin/production?stage=frame&status=assigned&vendorId=${VENDOR_ID}`
    )
    expect(res.status).toBe(200)

    const page = selects(productionJobs).find((q) => q.limit !== undefined)
    const { sql, params } = render(page?.where)
    expect(sql).toContain('"stage"')
    expect(sql).toContain('"status"')
    expect(sql).toContain('"vendor_id"')
    expect(params).toContain('frame')
    expect(params).toContain('assigned')
    expect(params).toContain(VENDOR_ID)
  })

  it('rejects an unknown stage or status with 400', async () => {
    expect((await buildApp().request('/api/admin/production?stage=laminate')).status).toBe(400)
    expect((await buildApp().request('/api/admin/production?status=nonsense')).status).toBe(400)
  })
})

// ============================================================================
// Role gating — vendor cost is admin data
// ============================================================================

describe('role gating', () => {
  const routes: Array<[string, RequestInit]> = [
    ['/api/admin/production', {}],
    ['/api/admin/production', json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [ITEM_A] })],
    [`/api/admin/production/${JOB_ID}`, {}],
    [`/api/admin/production/${JOB_ID}`, json({ amountActual: '1.00' }, 'PATCH')],
    [`/api/admin/production/${JOB_ID}/assign`, json({ vendorId: VENDOR_ID })],
    [`/api/admin/production/${JOB_ID}/reviews`, json({ verdict: 'pass' })],
    [`/api/admin/production/${JOB_ID}/photos`, {}],
  ]

  it.each(routes)('403s a content-manager on %s %#', async (path, init) => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'))

    const res = await buildApp().request(path, init)
    expect(res.status).toBe(403)
    expect(queries).toHaveLength(0)
  })

  it('403s a vendor-role user and a customer', async () => {
    mockGetSession.mockResolvedValue(sessionFor('vendor'))
    expect((await buildApp().request('/api/admin/production')).status).toBe(403)

    mockGetSession.mockResolvedValue(sessionFor('customer'))
    expect((await buildApp().request('/api/admin/production')).status).toBe(403)
  })

  it('401s an unauthenticated caller', async () => {
    mockGetSession.mockResolvedValue(null)
    expect((await buildApp().request('/api/admin/production')).status).toBe(401)
  })

  it('allows a super-admin', async () => {
    mockGetSession.mockResolvedValue(sessionFor('super-admin'))
    queueRows({ 'select:production_jobs': [[{ value: 0 }], []] })

    expect((await buildApp().request('/api/admin/production')).status).toBe(200)
  })
})

// ============================================================================
// Module shape
// ============================================================================

describe('module exports', () => {
  it('exports the Hono app under both names', async () => {
    const mod = await import('../../../src/routes/admin/production-jobs')
    expect(mod.adminProductionApp).toBeDefined()
    expect(mod.default).toBe(mod.adminProductionApp)
  })

  it('is mounted on the server at /api/admin/production', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../src/index.ts', import.meta.url), 'utf8')
    )
    expect(source).toContain('app.route("/api/admin/production", adminProductionApp)')
  })
})
