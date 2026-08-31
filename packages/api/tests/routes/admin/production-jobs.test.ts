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
import { getTableConfig } from 'drizzle-orm/pg-core'
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
import {
  orderConsolidation,
  productionTransferJobs,
} from '../../../src/database/schema/production-transfers'
import { orders } from '../../../src/database/schema/orders'
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

import {
  adminProductionApp,
  adminOrderProductionApp,
} from '../../../src/routes/admin/production-jobs'
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
const ITEM_C = '5555555c-5555-4555-8555-555555555555'
const TRANSFER_ID = '77777777-7777-4777-8777-777777777777'

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

  it('records production_job.created inside that transaction', async () => {
    queueRows({
      'select:orders': [[{ id: ORDER_ID }]],
      'select:order_items': [[{ id: ITEM_A, orderId: ORDER_ID }]],
      'insert:production_jobs': [[jobRow()]],
      'insert:production_job_items': [[{ id: 'pji-1', jobId: JOB_ID, orderItemId: ITEM_A }]],
    })

    const res = await buildApp().request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [ITEM_A] })
    )
    expect(res.status).toBe(201)

    // The action is registered in `schemas/audit-log.ts` and nothing emitted
    // it: a job appeared in the trail for the first time when somebody assigned
    // it. An action is declared in the same phase as its emitter, or not at all.
    const rows = audits()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'production_job.created',
      outcome: 'success',
      entityType: 'production_job',
      entityId: JOB_ID,
      // A row announcing a job whose insert rolled back would be a lie.
      inTx: true,
    })
    expect(rows[0]?.before).toBeNull()
    expect(rows[0]?.after).toMatchObject({ id: JOB_ID, status: 'draft' })
    expect(rows[0]?.metadata?.orderItemIds).toEqual([ITEM_A])
    expect(rows[0]?.metadata?.stage).toBe('print')
  })

  it('lets an audit write that fails inside the transaction leave no job behind', async () => {
    queueRows({
      'select:orders': [[{ id: ORDER_ID }]],
      'select:order_items': [[{ id: ITEM_A, orderId: ORDER_ID }]],
      'insert:production_jobs': [[jobRow()]],
      'insert:production_job_items': [[{ id: 'pji-1', jobId: JOB_ID, orderItemId: ITEM_A }]],
    })
    failNext('insert:admin_audit_log')

    const res = await buildApp().request(
      '/api/admin/production',
      json({ orderId: ORDER_ID, stage: 'print', orderItemIds: [ITEM_A] })
    )

    expect(res.status).toBe(500)
    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    expect(inserts(productionJobs)[0]?.inTx).toBe(true)
    expect(audits().filter((row) => !row.inTx)).toHaveLength(0)
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

  // ------------------------------------------------------------------
  // Reassignment and the price somebody negotiated with the OLD vendor
  // ------------------------------------------------------------------

  it('refuses to reassign a job carrying a negotiated amount', async () => {
    queueRows({
      'select:production_jobs': [
        [jobRow({
          status: 'qc_failed',
          vendorId: VENDOR_ID_2,
          amountExpected: '400.00',
          amountActual: '350.00',
        })],
      ],
      'select:vendors': [[{ id: VENDOR_ID, name: 'Print Co' }]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )

    // Design §10.6. `amount_actual` is a price negotiated with the vendor that
    // HOLDS the job; `amount_expected` is about to be recomputed from the new
    // vendor's card, and `jobPayableAmount` is COALESCE(actual, expected). Left
    // in place it pays the new vendor 350 for 900 of work, and the audit diff
    // never listed the column so nothing surfaced it.
    expect(res.status).toBe(409)

    const body = await readJson(res)
    expect(body).toMatchObject({
      code: 'NEGOTIATED_AMOUNT_PRESENT',
      amountActual: '350.00',
      currentVendorId: VENDOR_ID_2,
    })

    expect(updates(productionJobs)).toHaveLength(0)
    expect(tx.rollbacks).toBe(1)
    expect(audits()).toMatchObject([
      { action: 'production_job.transition_refused', outcome: 'failure', inTx: false },
    ])
  })

  it('reassigns when the caller names the price agreed with the NEW vendor', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: [rate({ amount: '900.00' })],
      job: { status: 'qc_failed', vendorId: VENDOR_ID_2, amountActual: '350.00' },
      updated: { amountExpected: '900.00', amountActual: '800.00' },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID, amountActual: '800.00' })
    )
    expect(res.status).toBe(200)

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.amountExpected).toBe('900.00')
    expect(written.amountActual).toBe('800.00')

    // The column the diff used to omit. A negotiated price moving between
    // vendors is now visible in the trail rather than inferable from nothing.
    const rows = audits()
    expect(rows[0]?.before?.amountActual).toBe('350.00')
    expect(rows[0]?.after?.amountActual).toBe('800.00')
  })

  it('reassigns when the caller drops the old negotiation with null', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: [rate({ amount: '900.00' })],
      job: { status: 'qc_failed', vendorId: VENDOR_ID_2, amountActual: '350.00' },
      updated: { amountExpected: '900.00', amountActual: null },
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID, amountActual: null })
    )
    expect(res.status).toBe(200)

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.amountActual).toBeNull()
    // COALESCE(actual, expected) — the new vendor's own rate, which is the
    // point of dropping it.
    expect((await readJson(res)).job.amountExpected).toBe('900.00')
  })

  it('leaves amount_actual alone on a job that never had one', async () => {
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

    // Not written at all, rather than written as null: a first assignment has
    // no negotiation to have an opinion about.
    expect(updates(productionJobs)[0]?.values).not.toHaveProperty('amountActual')
  })

  // ------------------------------------------------------------------
  // The consolidator nobody had to choose — design §5 rule 1
  // ------------------------------------------------------------------

  /**
   * `queueAssign` plus the rows the handler reads AFTER the job update: the
   * locked order row, then `loadOrderProductionSnapshot`'s five reads in their
   * fixed order, then the insert.
   */
  function queueAssignOnOrder(over: {
    job?: Record<string, unknown>
    updated?: Record<string, unknown>
    orderExists?: boolean
    snapshotJobs?: Array<Record<string, unknown>>
    consolidation?: Array<Record<string, unknown>>
    items?: Array<Record<string, unknown>>
  } = {}) {
    const {
      orderExists = true,
      snapshotJobs = [
        {
          id: JOB_ID,
          stage: 'print',
          status: 'assigned',
          vendorId: VENDOR_ID,
          assignedAt: PAST,
          orderItemId: ITEM_A,
        },
      ],
      consolidation = [],
      items = [{ id: ITEM_A, frameId: null, giftCardPurchase: null }],
    } = over

    queueRows({
      'select:production_jobs': [
        [jobRow({ stage: 'print', ...(over.job ?? {}) })],
        // The snapshot loader's own read of the order's jobs.
        snapshotJobs,
      ],
      'select:vendors': [[{ id: VENDOR_ID, name: 'Print Co' }]],
      'select:production_job_items': [
        [{ orderItemId: ITEM_A, quantity: 1, widthInches: 24, heightInches: 36 }],
      ],
      'select:vendor_rates': [[rate()]],
      'update:production_jobs': [
        [jobRow({ vendorId: VENDOR_ID, status: 'assigned', ...(over.updated ?? {}) })],
      ],
      // The FOR UPDATE lock, then the snapshot loader's read of the same row.
      'select:orders': [orderExists ? [{ id: ORDER_ID }] : [], [{ orderType: 'regular' }]],
      'select:order_items': [items],
      'select:order_consolidation': [consolidation],
      'select:production_transfers': [[]],
      'insert:order_consolidation': [
        [{ orderId: ORDER_ID, vendorId: VENDOR_ID, decidedBy: null, decidedAt: PAST }],
      ],
    })
  }

  it('writes the consolidator itself at first assignment, with decided_by NULL', async () => {
    queueAssignOnOrder()

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)
    expect((await readJson(res)).consolidator).toEqual({
      vendorId: VENDOR_ID,
      basis: 'sole_vendor',
    })

    // Nothing wrote this before: `POST /:orderId/consolidator` was the only
    // writer, so the MAJORITY path needed an explicit admin call and until
    // somebody made it `no_consolidator` blocked the order out of fulfilment.
    const written = inserts(orderConsolidation)
    expect(written).toHaveLength(1)
    expect(written[0]?.values).toMatchObject({
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      // NULL is the record of "the system chose, because there was nothing to
      // choose". An id would claim an admin stood behind it.
      decidedBy: null,
    })
    expect(written[0]?.inTx).toBe(true)

    const rows = audits()
    expect(rows.map((row) => row.action)).toEqual([
      'production_job.assigned',
      'order.consolidator_set',
    ])
    expect(rows[1]).toMatchObject({ entityType: 'order', entityId: ORDER_ID, inTx: true })
    expect(rows[1]?.metadata?.decision).toBe('system_default')
    expect(rows[1]?.metadata?.basis).toBe('sole_vendor')
    expect(rows[1]?.metadata?.viaJobId).toBe(JOB_ID)
  })

  it('waits while a draft on the order is still unassigned', async () => {
    queueAssignOnOrder({
      snapshotJobs: [
        {
          id: JOB_ID,
          stage: 'print',
          status: 'assigned',
          vendorId: VENDOR_ID,
          assignedAt: PAST,
          orderItemId: ITEM_A,
        },
        // proposeConsolidator ignores an unassigned draft, so this order reads
        // as sole_vendor. It is not: the draft may yet go to another shop, and
        // a decided_by NULL row would claim there was nothing to decide.
        {
          id: JOB_ID_2,
          stage: 'frame',
          status: 'draft',
          vendorId: null,
          assignedAt: null,
          orderItemId: ITEM_B,
        },
      ],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)
    expect((await readJson(res)).consolidator).toBeNull()

    expect(inserts(orderConsolidation)).toHaveLength(0)
    expect(audits()).toHaveLength(1)
  })

  it('leaves a split order to the admin who has to confirm it', async () => {
    queueAssignOnOrder({
      snapshotJobs: [
        {
          id: JOB_ID,
          stage: 'print',
          status: 'assigned',
          vendorId: VENDOR_ID,
          assignedAt: PAST,
          orderItemId: ITEM_A,
        },
        {
          id: JOB_ID_2,
          stage: 'frame',
          status: 'assigned',
          vendorId: VENDOR_ID_2,
          assignedAt: PAST,
          orderItemId: ITEM_B,
        },
      ],
      items: [
        { id: ITEM_A, frameId: null, giftCardPurchase: null },
        { id: ITEM_B, frameId: 'frame-1', giftCardPurchase: null },
      ],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)

    // `needsConfirmation` is the system saying it may propose but not write:
    // the real criterion is not modelled, and an arbitrary choice an admin
    // confirmed is auditable where the same choice written silently is not.
    expect(inserts(orderConsolidation)).toHaveLength(0)
    expect((await readJson(res)).consolidator).toBeNull()
  })

  it('never re-decides an order that already has a consolidator', async () => {
    queueAssignOnOrder({ consolidation: [{ vendorId: VENDOR_ID_2 }] })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )
    expect(res.status).toBe(200)

    // Re-deciding is POST /:orderId/consolidator's act, never a side effect of
    // an assignment — and after a transfer has dispatched it is refused there.
    expect(inserts(orderConsolidation)).toHaveLength(0)
    expect(audits()).toHaveLength(1)
  })

  it('locks the order row before reading whether it has been decided', async () => {
    queueAssignOnOrder()

    await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )

    const orderRead = queries.findIndex((q) => q.op === 'select' && q.table === 'orders')
    const decisionRead = queries.findIndex(
      (q) => q.op === 'select' && q.table === 'order_consolidation'
    )
    const write = queries.findIndex(
      (q) => q.op === 'insert' && q.table === 'order_consolidation'
    )
    expect(orderRead).toBeGreaterThanOrEqual(0)
    expect(orderRead).toBeLessThan(decisionRead)
    expect(decisionRead).toBeLessThan(write)
    // Two admins assigning two jobs of one order serialise here rather than
    // both reading "undecided" and the loser meeting a primary-key violation.
    expect(queries[orderRead]?.inTx).toBe(true)
  })

  it('lets an audit write that fails inside the transaction take the assignment down', async () => {
    queueAssign({
      items: [{ orderItemId: ITEM_A, widthInches: 24, heightInches: 36 }],
      rates: [rate()],
      updated: { amountExpected: '100.00' },
    })
    failNext('insert:admin_audit_log')

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}/assign`,
      json({ vendorId: VENDOR_ID })
    )

    expect(res.status).toBe(500)
    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    expect(updates(productionJobs)[0]?.inTx).toBe(true)
    // No row claiming a vendor owes us this work survives a transaction that
    // never committed the assignment.
    expect(audits().filter((row) => !row.inTx)).toHaveLength(0)
  })
})

// ============================================================================
// PATCH — the transition guard, the amount override, and the audit row
// ============================================================================

/**
 * The matrix in `lib/production-transitions.ts` is the authority; these tables
 * are the enumeration of it this route is answerable for. `qc_passed` and
 * `qc_failed` appear in none of them, because PATCH no longer accepts those two
 * at all: a verdict with no review row is a verdict with no evidence, so they
 * are reachable only through POST /:jobId/reviews.
 *
 * **The split is the point.** These nine edges used to be ONE list asserting
 * 200 for every one of them, which pinned the bug as intended behaviour: an
 * edge the matrix marks with a `guard` is not simply legal here.
 * `assertTransition` answers whether an admin may take it; the guard is the
 * circumstance the route still has to establish, and PATCH established none of
 * them.
 */
const UNGUARDED_ADMIN_EDGES: Array<[string, string]> = [
  ['draft', 'cancelled'],
  ['assigned', 'cancelled'],
  ['received', 'cancelled'],
  ['qc_submitted', 'cancelled'],
  ['qc_passed', 'cancelled'],
  ['qc_failed', 'cancelled'],
]

/**
 * Legal for an admin, and refused by PATCH anyway, because the guard on the
 * edge belongs to the route that can actually evaluate it.
 *
 * `priced-from-rate-card` cannot be answered by a route that takes no
 * `vendorId`. Taking these through PATCH answered 200 over a row with a NULL
 * vendor, a NULL `amount_expected` and a NULL `assigned_at` — and recorded it
 * as `production_job.transitioned`, category `fulfilment`, where an auditor
 * filtering `money` for "who committed us to this vendor" would never see it.
 */
const DELEGATED_ADMIN_EDGES: Array<[string, string, string]> = [
  ['draft', 'assigned', 'POST /api/admin/production/:jobId/assign'],
  ['qc_failed', 'assigned', 'POST /api/admin/production/:jobId/assign'],
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
  it.each(UNGUARDED_ADMIN_EDGES)(
    'takes the unguarded edge %s -> %s and records exactly one transition row',
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

  // ------------------------------------------------------------------
  // The guard on the edge — the half `assertTransition` does not answer
  // ------------------------------------------------------------------

  it.each(DELEGATED_ADMIN_EDGES)(
    'refuses the guarded edge %s -> %s and names the route that owns it',
    async (from, to, route) => {
      queueRows({ 'select:production_jobs': [[jobRow({ status: from })]] })

      const res = await buildApp().request(
        `/api/admin/production/${JOB_ID}`,
        json({ status: to }, 'PATCH')
      )
      expect(res.status).toBe(409)

      const body = await readJson(res)
      expect(body).toMatchObject({
        code: 'GUARD_NOT_EVALUABLE_HERE',
        guard: 'priced-from-rate-card',
        route,
        from,
        to: 'assigned',
      })

      // The unbillable job this refusal exists to prevent: `assigned` beside a
      // NULL vendor, a NULL amount and a NULL assigned_at.
      expect(updates(productionJobs)).toHaveLength(0)
      expect(tx.rollbacks).toBe(1)
      expect(tx.commits).toBe(0)

      // ...and no `production_job.transitioned` row claiming a fulfilment event
      // where the money row belongs.
      const rows = audits()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        action: 'production_job.transition_refused',
        outcome: 'failure',
        inTx: false,
      })
    }
  )

  it('lets qc_passed -> dispatched through when the piece is on an open transfer', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_passed', vendorId: VENDOR_ID })]],
      'select:production_transfer_jobs': [
        [{ id: TRANSFER_ID, toVendorId: VENDOR_ID_2, dispatchedAt: null, receivedAt: null }],
      ],
      'update:production_jobs': [[jobRow({ status: 'dispatched', vendorId: VENDOR_ID })]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'dispatched' }, 'PATCH')
    )
    expect(res.status).toBe(200)

    const rows = audits()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.action).toBe('production_job.transitioned')

    // A parcel answers the guard on its own; the order is not read at all.
    expect(selects(orders)).toHaveLength(0)
  })

  it('lets it through when the order already carries a shipping label', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_passed', vendorId: VENDOR_ID })]],
      // The consolidator handing the goods to the courier: no inter-vendor
      // parcel, and `evaluateLabelReadiness` reads exactly this case.
      'select:production_transfer_jobs': [[]],
      'select:orders': [[{ shippingDetails: { carrier: 'Delhivery', awbNumber: 'AWB-1' } }]],
      'update:production_jobs': [[jobRow({ status: 'dispatched', vendorId: VENDOR_ID })]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'dispatched' }, 'PATCH')
    )
    expect(res.status).toBe(200)
    expect(updates(productionJobs)).toHaveLength(1)
  })

  it('refuses qc_passed -> dispatched when nothing has moved the goods', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_passed', vendorId: VENDOR_ID })]],
      'select:production_transfer_jobs': [[]],
      'select:orders': [[{ shippingDetails: null }]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'dispatched' }, 'PATCH')
    )

    // THE unrecoverable one. `dispatched` is terminal with zero out-edges: the
    // readiness gate would then report goods_not_at_consolidator forever,
    // cancelling is illegal, and a fresh job does not remove this one from the
    // order. The order could never be labelled again.
    expect(res.status).toBe(409)

    const body = await readJson(res)
    expect(body).toMatchObject({
      code: 'GUARD_UNSATISFIED',
      guard: 'open-transfer-or-order-label',
      from: 'qc_passed',
      to: 'dispatched',
      transferId: null,
      orderLabel: null,
    })

    expect(updates(productionJobs)).toHaveLength(0)
    expect(tx.rollbacks).toBe(1)
    expect(audits()).toMatchObject([
      { action: 'production_job.transition_refused', outcome: 'failure', inTx: false },
    ])
  })

  it('does not count a parcel that was declared lost as an open transfer', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_passed', vendorId: VENDOR_ID })]],
      'select:production_transfer_jobs': [[]],
      'select:orders': [[{ shippingDetails: {} }]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'dispatched' }, 'PATCH')
    )
    expect(res.status).toBe(409)

    // The mock applies no predicates, so the exclusion is asserted on the SQL:
    // a lost parcel leaves the work undone and a REPLACEMENT job carries it.
    const { sql, params } = render(selects(productionTransferJobs)[0]?.where)
    expect(params).toContain(JOB_ID)
    expect(sql.toLowerCase()).toContain('lost_at')
    expect(sql.toLowerCase()).toContain('is null')
  })

  it('reads the guard inside the transaction, before the write', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_passed', vendorId: VENDOR_ID })]],
      'select:production_transfer_jobs': [
        [{ id: TRANSFER_ID, toVendorId: VENDOR_ID_2, dispatchedAt: null, receivedAt: null }],
      ],
      'update:production_jobs': [[jobRow({ status: 'dispatched' })]],
    })

    await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'dispatched' }, 'PATCH')
    )

    const guardIndex = queries.findIndex(
      (q) => q.op === 'select' && q.table === 'production_transfer_jobs'
    )
    const writeIndex = queries.findIndex(
      (q) => q.op === 'update' && q.table === 'production_jobs'
    )
    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(guardIndex).toBeLessThan(writeIndex)
    // Under the same lock as the job row it is about — outside the transaction
    // it would be a fact read about a different moment.
    expect(queries[guardIndex]?.inTx).toBe(true)
  })

  it('still treats a guarded SELF-edge as a no-op — nothing moved to guard', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'assigned', vendorId: VENDOR_ID })]],
      'update:production_jobs': [[jobRow({ status: 'assigned', vendorId: VENDOR_ID })]],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'assigned', dueAt: '2026-09-01T00:00:00.000Z' }, 'PATCH')
    )
    expect(res.status).toBe(200)
    expect(queries.some((q) => q.table === 'production_transfer_jobs')).toBe(false)
    expect(audits()).toHaveLength(0)
  })

  it('lets an audit write that fails inside the transaction take the whole thing down', async () => {
    queueRows({
      'select:production_jobs': [
        [jobRow({ status: 'draft' })],
        [jobRow({ status: 'draft' })],
      ],
      'update:production_jobs': [[jobRow({ status: 'cancelled' })]],
    })
    // recordAudit RETHROWS when it is given a tx: the insert did not fail on
    // its own, it aborted the caller's transaction. Swallowing would answer 200
    // over a write Postgres is about to roll back.
    failNext('insert:admin_audit_log')

    const app = buildApp()
    const res = await app.request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'cancelled' }, 'PATCH')
    )

    expect(res.status).toBe(500)
    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    // Every row this request wrote — the job UPDATE and the audit row itself —
    // was inside the transaction that rolled back. Nothing survives.
    expect(updates(productionJobs)[0]?.inTx).toBe(true)
    expect(audits().filter((row) => !row.inTx)).toHaveLength(0)

    // The other half of the rule: a REFUSAL row is written outside the
    // transaction, so it survives the rollback it exists to record.
    const refused = await app.request(
      `/api/admin/production/${JOB_ID}`,
      json({ status: 'dispatched' }, 'PATCH')
    )
    expect(refused.status).toBe(409)
    expect(audits().filter((row) => !row.inTx)).toMatchObject([
      { action: 'production_job.transition_refused', outcome: 'failure' },
    ])
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
      'select:production_job_photos': [
        [photoRow('print_full'), photoRow('print_raking_light')],
      ],
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

    // ...and a shot ALREADY judged is not re-stamped. `review_id` is a single
    // column, so an overwrite is a deletion.
    expect(sql.toLowerCase()).toContain('review_id')

    const rows = audits()
    expect(rows[0]?.metadata?.judgedPhotoIds).toEqual([
      'photo-print_full',
      'photo-print_raking_light',
    ])
    expect(rows[0]?.metadata?.stampedPhotoIds).toEqual([
      'photo-print_full',
      'photo-print_raking_light',
    ])
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
      // The SAME two live photographs, both times. Seeding this empty made the
      // property unreachable, which is how the re-stamp survived review.
      'select:production_job_photos': [
        [photoRow('print_full'), photoRow('print_raking_light')],
        [
          photoRow('print_full', { reviewId: REVIEW_ID }),
          photoRow('print_raking_light', { reviewId: REVIEW_ID }),
        ],
      ],
      'update:production_job_photos': [
        [photoRow('print_full', { reviewId: REVIEW_ID }), photoRow('print_raking_light', { reviewId: REVIEW_ID })],
        // Nothing left to claim: both shots already point at the approving
        // review, and `review_id IS NULL` is what keeps them pointing there.
        [],
      ],
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

    const rows = audits()
    expect(rows.map((row) => row.action)).toEqual([
      'production_job.qc_approved',
      'production_job.qc_rejected',
    ])

    // THE property. `review_id` is a single column: re-stamping the same live
    // photographs with the overturning review's id leaves no photograph
    // pointing at the review that APPROVED them, which is exactly what §7 says
    // the column is for — a dispute saying WHICH shots were signed off.
    const [approving, overturning] = updates(productionJobPhotos)
    expect((approving?.values as Record<string, unknown>).reviewId).toBe(REVIEW_ID)
    expect((overturning?.values as Record<string, unknown>).reviewId).toBe(REVIEW_ID_2)
    expect(render(overturning?.where).sql.toLowerCase()).toContain('review_id')

    // The overturning verdict still says which shots it looked at — on its own
    // audit row, where a second opinion is legible without erasing the first.
    expect(rows[1]?.metadata?.judgedPhotoIds).toEqual([
      'photo-print_full',
      'photo-print_raking_light',
    ])
    expect(rows[1]?.metadata?.stampedPhotoIds).toEqual([])
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

  it('lets an audit write that fails inside the transaction take the verdict down', async () => {
    queueRows({
      'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]],
      'insert:production_job_reviews': [[reviewRow()]],
      'update:production_jobs': [[jobRow({ status: 'qc_passed' })]],
      'select:production_job_photos': [[photoRow('print_full')]],
      'update:production_job_photos': [[photoRow('print_full', { reviewId: REVIEW_ID })]],
    })
    failNext('insert:admin_audit_log')

    const res = await buildApp().request(reviewsPath, json({ verdict: 'pass' }))

    expect(res.status).toBe(500)
    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    // The review row, the move and the photo stamp were all inside the
    // transaction that rolled back — so the append-only table gains no row for
    // a verdict nobody recorded.
    expect(inserts(productionJobReviews)[0]?.inTx).toBe(true)
    expect(updates(productionJobs)[0]?.inTx).toBe(true)
    expect(audits().filter((row) => !row.inTx)).toHaveLength(0)
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

  it('filters by orderId, and does it in SQL rather than by scanning', async () => {
    // The filter `OrderProductionPanel.tsx` has been waiting for. Without it
    // the panel pages the whole queue and matches client-side under
    // MAX_SCAN_PAGES, so a queue longer than the bound makes its coverage
    // verdict a guess it has to withhold.
    queueRows({ 'select:production_jobs': [[{ value: 0 }], []] })

    const res = await buildApp().request(`/api/admin/production?orderId=${ORDER_ID}`)
    expect(res.status).toBe(200)

    const page = selects(productionJobs).find((q) => q.limit !== undefined)
    const { sql, params } = render(page?.where)
    expect(sql).toContain('"order_id"')
    expect(params).toContain(ORDER_ID)

    // The COUNT is filtered too, or `total` describes a different set than
    // `items` and the panel pages through a queue that is not the one it counted.
    const total = selects(productionJobs).find((q) => q.limit === undefined)
    expect(render(total?.where).params).toContain(ORDER_ID)
  })

  it('filters on the column production_jobs_order_id_idx covers', () => {
    // The eq() above is only cheap if it lands on the index. Read off the
    // schema rather than asserted as a string: a rename that moved the index to
    // another column would leave the route doing a sequential scan of every job
    // ever created, and nothing else in the suite would notice.
    const { indexes } = getTableConfig(productionJobs)
    const byOrderId = indexes.find((i) => i.config.name === 'production_jobs_order_id_idx')

    expect(byOrderId).toBeDefined()
    expect(byOrderId?.config.columns.map((c) => (c as { name: string }).name)).toEqual([
      'order_id',
    ])
  })

  it('rejects an orderId that is not a uuid with 400', async () => {
    expect((await buildApp().request('/api/admin/production?orderId=42')).status).toBe(400)
  })

  it('rejects an unknown stage or status with 400', async () => {
    expect((await buildApp().request('/api/admin/production?stage=laminate')).status).toBe(400)
    expect((await buildApp().request('/api/admin/production?status=nonsense')).status).toBe(400)
  })
})

// ============================================================================
// The order-scoped half: who consolidates, and why it cannot ship yet
// ============================================================================

/**
 * `POST /api/admin/orders/:orderId/consolidator` and
 * `GET /api/admin/orders/:orderId/production-readiness`, mounted on a second
 * router in the same module.
 *
 * The RULES live in `lib/production-readiness.ts` and are unit-tested there
 * over plain rows. What is tested here is that the ROUTE asks them the right
 * question and records the answer honestly: which vendor comes back for each of
 * the three cases, that a system default writes `decided_by = NULL` while an
 * admin's choice writes the actor, that an override after the goods are moving
 * is refused, and that the audit row lands inside or outside the transaction
 * depending on whether it describes a write or a rollback.
 */
describe('POST /api/admin/orders/:orderId/consolidator', () => {
  const ordersApp = () => buildRouteApp('/api/admin/orders', adminOrderProductionApp)

  const setConsolidator = (body: Record<string, unknown> = {}, orderId = ORDER_ID) =>
    ordersApp().request(`/api/admin/orders/${orderId}/consolidator`, json(body))

  /** A job row in the shape `loadOrderProductionSnapshot` selects it. */
  const snapshotJob = (over: Record<string, unknown> = {}) => ({
    id: JOB_ID,
    stage: 'print',
    status: 'assigned',
    vendorId: VENDOR_ID,
    assignedAt: PAST,
    orderItemId: ITEM_A,
    ...over,
  })

  interface ConsolidatorSeed {
    orderExists?: boolean
    existing?: { vendorId: string; decidedBy: string | null } | null
    jobs?: Array<Record<string, unknown>>
    items?: Array<Record<string, unknown>>
    transfers?: Array<Record<string, unknown>>
    vendor?: { id: string; name: string } | null
    inserted?: Array<Record<string, unknown>>
    updated?: Array<Record<string, unknown>>
  }

  function seed(over: ConsolidatorSeed = {}) {
    const {
      orderExists = true,
      existing = null,
      jobs = [snapshotJob()],
      items = [{ id: ITEM_A, frameId: null, giftCardPurchase: null }],
      transfers = [],
      vendor = { id: VENDOR_ID, name: 'Print Shop A' },
      inserted,
      updated,
    } = over

    const existingRows = existing ? [existing] : []
    const written = [
      {
        orderId: ORDER_ID,
        vendorId: vendor?.id ?? VENDOR_ID,
        decidedBy: null,
        decidedAt: PAST,
      },
    ]

    queueRows({
      // The locked read first, then the snapshot loader's own read of the same row.
      'select:orders': [orderExists ? [{ id: ORDER_ID }] : [], [{ orderType: 'regular' }]],
      'select:order_consolidation': [existingRows, existingRows],
      'select:order_items': [items],
      'select:production_jobs': [jobs],
      'select:production_transfers': [transfers],
      'select:vendors': [vendor ? [vendor] : []],
      'insert:order_consolidation': [inserted ?? written],
      'update:order_consolidation': [updated ?? written],
    })
  }

  const consolidationRows = () =>
    [...inserts(orderConsolidation), ...updates(orderConsolidation)]

  // --------------------------------------------------------------------
  // Rule 1 — one vendor holds everything
  // --------------------------------------------------------------------

  it('writes the sole vendor automatically, with decided_by NULL for "system default"', async () => {
    seed({
      jobs: [
        snapshotJob({ orderItemId: ITEM_A }),
        snapshotJob({ id: JOB_ID_2, orderItemId: ITEM_B }),
      ],
      items: [
        { id: ITEM_A, frameId: null, giftCardPurchase: null },
        { id: ITEM_B, frameId: null, giftCardPurchase: null },
      ],
    })

    const res = await setConsolidator()
    const body = await readJson<{
      basis: string
      systemDefault: boolean
      consolidation: { vendorId: string; decidedBy: string | null }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.basis).toBe('sole_vendor')
    expect(body.systemDefault).toBe(true)

    const [write] = inserts(orderConsolidation)
    expect(write?.inTx).toBe(true)
    expect(write?.values).toMatchObject({ orderId: ORDER_ID, vendorId: VENDOR_ID })
    // NULL is the record of "nobody decided this; one vendor already held it all".
    expect((write?.values as { decidedBy: string | null }).decidedBy).toBeNull()
  })

  // --------------------------------------------------------------------
  // Rule 2 — the frame vendor, proposed
  // --------------------------------------------------------------------

  it('proposes the frame vendor and refuses to write it without an admin', async () => {
    seed({
      jobs: [
        snapshotJob({ vendorId: VENDOR_ID }),
        snapshotJob({ id: JOB_ID_2, stage: 'frame', vendorId: VENDOR_ID_2 }),
      ],
    })

    const res = await setConsolidator()
    const body = await readJson<{
      code: string
      proposal: { vendorId: string; basis: string; needsConfirmation: boolean }
    }>(res)

    expect(res.status).toBe(422)
    expect(body.code).toBe('CONFIRMATION_REQUIRED')
    // A finished framed piece is bulky, fragile and glazed; you never courier
    // it TO a poster shop.
    expect(body.proposal).toEqual({
      vendorId: VENDOR_ID_2,
      basis: 'frame_vendor',
      needsConfirmation: true,
    })
    // A proposal is not a decision. Nothing may reach the table unconfirmed —
    // that is exactly what `decided_by IS NULL` would then misreport.
    expect(consolidationRows()).toHaveLength(0)
  })

  it('records the actor when an admin confirms the frame proposal', async () => {
    seed({
      jobs: [
        snapshotJob({ vendorId: VENDOR_ID }),
        snapshotJob({ id: JOB_ID_2, stage: 'frame', vendorId: VENDOR_ID_2 }),
      ],
      vendor: { id: VENDOR_ID_2, name: 'Frame Shop B' },
    })

    const res = await setConsolidator({ vendorId: VENDOR_ID_2 })
    const body = await readJson<{ basis: string; systemDefault: boolean }>(res)

    expect(res.status).toBe(200)
    expect(body.systemDefault).toBe(false)
    expect(body.basis).toBe('confirmed_proposal')

    const [write] = inserts(orderConsolidation)
    expect(write?.values).toMatchObject({
      vendorId: VENDOR_ID_2,
      decidedBy: 'admin-user-1',
    })
  })

  // --------------------------------------------------------------------
  // Rule 3 — most items, ties by earliest assignment
  // --------------------------------------------------------------------

  it('proposes the vendor holding the most order items across two print shops', async () => {
    seed({
      jobs: [
        snapshotJob({ orderItemId: ITEM_A }),
        snapshotJob({ orderItemId: ITEM_B }),
        snapshotJob({ id: JOB_ID_2, vendorId: VENDOR_ID_2, orderItemId: ITEM_C }),
      ],
      items: [
        { id: ITEM_A, frameId: null, giftCardPurchase: null },
        { id: ITEM_B, frameId: null, giftCardPurchase: null },
        { id: ITEM_C, frameId: null, giftCardPurchase: null },
      ],
    })

    const res = await setConsolidator()
    const body = await readJson<{
      proposal: { vendorId: string; basis: string; needsConfirmation: boolean }
    }>(res)

    expect(res.status).toBe(422)
    expect(body.proposal).toEqual({
      vendorId: VENDOR_ID,
      basis: 'most_items',
      needsConfirmation: true,
    })
  })

  it('breaks a tie on the most-items rule by earliest assignment', async () => {
    const EARLIER = new Date('2025-12-01T00:00:00Z')

    seed({
      jobs: [
        snapshotJob({ orderItemId: ITEM_A, assignedAt: PAST }),
        snapshotJob({
          id: JOB_ID_2,
          vendorId: VENDOR_ID_2,
          orderItemId: ITEM_B,
          assignedAt: EARLIER,
        }),
      ],
      items: [
        { id: ITEM_A, frameId: null, giftCardPurchase: null },
        { id: ITEM_B, frameId: null, giftCardPurchase: null },
      ],
    })

    const body = await readJson<{ proposal: { vendorId: string } }>(await setConsolidator())

    expect(body.proposal.vendorId).toBe(VENDOR_ID_2)
  })

  it('has nothing to propose before anything is assigned', async () => {
    seed({ jobs: [snapshotJob({ vendorId: null, status: 'draft', assignedAt: null })] })

    const res = await setConsolidator()
    const body = await readJson<{ code: string; proposal: { basis: string } }>(res)

    expect(res.status).toBe(422)
    expect(body.code).toBe('NOTHING_TO_PROPOSE')
    expect(body.proposal.basis).toBe('none')
    expect(consolidationRows()).toHaveLength(0)
  })

  // --------------------------------------------------------------------
  // Override, and the point at which it stops being allowed
  // --------------------------------------------------------------------

  it('overrides an existing consolidator while nothing has dispatched', async () => {
    seed({
      existing: { vendorId: VENDOR_ID, decidedBy: null },
      transfers: [
        {
          id: 'transfer-1',
          toVendorId: VENDOR_ID,
          dispatchedAt: null,
          receivedAt: null,
          lostAt: null,
          jobId: JOB_ID,
        },
      ],
      vendor: { id: VENDOR_ID_2, name: 'Frame Shop B' },
    })

    const res = await setConsolidator({ vendorId: VENDOR_ID_2 })
    expect(res.status).toBe(200)

    const [write] = updates(orderConsolidation)
    expect(write?.inTx).toBe(true)
    expect(write?.values).toMatchObject({ vendorId: VENDOR_ID_2, decidedBy: 'admin-user-1' })

    // The predicate is repeated in the WHERE rather than trusted from the read,
    // so a second admin who moved it in between matches nothing.
    const { sql, params } = render(write?.where)
    expect(sql).toContain('"order_id"')
    expect(sql).toContain('"vendor_id"')
    expect(params).toContain(ORDER_ID)
    expect(params).toContain(VENDOR_ID)
  })

  it('refuses the override with 409 once the first transfer has dispatched', async () => {
    seed({
      existing: { vendorId: VENDOR_ID, decidedBy: null },
      transfers: [
        {
          id: 'transfer-1',
          toVendorId: VENDOR_ID,
          dispatchedAt: new Date('2026-08-29T10:00:00Z'),
          receivedAt: null,
          lostAt: null,
          jobId: JOB_ID,
        },
      ],
      vendor: { id: VENDOR_ID_2, name: 'Frame Shop B' },
    })

    const res = await setConsolidator({ vendorId: VENDOR_ID_2 })
    const body = await readJson<{ code: string; error: string }>(res)

    // The goods are already moving. Re-routing them is a phone call to a
    // courier, not a database write.
    expect(res.status).toBe(409)
    expect(body.code).toBe('TRANSFER_DISPATCHED')
    expect(consolidationRows()).toHaveLength(0)
    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
  })

  it('still lets an admin confirm the SAME vendor after a transfer dispatched', async () => {
    // Not an override: nothing is re-routed, only `decided_by` stops saying
    // "the system chose this" about a decision an admin has now stood behind.
    seed({
      existing: { vendorId: VENDOR_ID, decidedBy: null },
      transfers: [
        {
          id: 'transfer-1',
          toVendorId: VENDOR_ID,
          dispatchedAt: new Date('2026-08-29T10:00:00Z'),
          receivedAt: null,
          lostAt: null,
          jobId: JOB_ID,
        },
      ],
    })

    const res = await setConsolidator({ vendorId: VENDOR_ID })

    expect(res.status).toBe(200)
    expect((updates(orderConsolidation)[0]?.values as { decidedBy: string }).decidedBy).toBe(
      'admin-user-1'
    )
  })

  it('writes nothing when the request changes nothing', async () => {
    seed({ existing: { vendorId: VENDOR_ID, decidedBy: null } })

    const res = await setConsolidator()
    const body = await readJson<{ changed: boolean }>(res)

    expect(res.status).toBe(200)
    expect(body.changed).toBe(false)
    expect(consolidationRows()).toHaveLength(0)
    // One row per ACT. Re-confirming what already stands is not an act.
    expect(audits()).toHaveLength(0)
  })

  // --------------------------------------------------------------------
  // Concurrency — two admins must not set two consolidators
  // --------------------------------------------------------------------

  it('locks the order row inside the transaction before deciding anything', async () => {
    seed()

    await setConsolidator()

    const [lock] = selects(orders)
    expect(lock?.inTx).toBe(true)
    expect(queries.indexOf(lock!)).toBeLessThan(
      queries.indexOf(inserts(orderConsolidation)[0]!)
    )
  })

  it('rolls back when the guarded update matches no row — the concurrent case', async () => {
    seed({
      existing: { vendorId: VENDOR_ID, decidedBy: null },
      vendor: { id: VENDOR_ID_2, name: 'Frame Shop B' },
      updated: [],
    })

    const res = await setConsolidator({ vendorId: VENDOR_ID_2 })
    const body = await readJson<{ code: string }>(res)

    expect(res.status).toBe(409)
    expect(body.code).toBe('CONCURRENT_MODIFICATION')
    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
  })

  it('rolls back when the insert returns no row', async () => {
    seed({ inserted: [] })

    const res = await setConsolidator()

    expect(res.status).toBe(409)
    expect(tx.rollbacks).toBe(1)
  })

  it('leaves one consolidator per order to the database, not to the route', () => {
    // A mock cannot serialise anything, and neither can a route: what actually
    // makes two racing writers produce one row is the primary key on order_id.
    const { columns } = getTableConfig(orderConsolidation)
    const pk = columns.filter((c) => c.primary).map((c) => c.name)

    expect(pk).toEqual(['order_id'])
  })

  // --------------------------------------------------------------------
  // Audit
  // --------------------------------------------------------------------

  it('audits the set inside the transaction, naming which of the two it was', async () => {
    seed()

    await setConsolidator()

    const [row] = audits()
    expect(row).toMatchObject({
      action: 'order.consolidator_set',
      outcome: 'success',
      entityType: 'order',
      entityId: ORDER_ID,
      // A row saying an order routes through this vendor, beside an order that
      // routes through nobody, is worse than no row.
      inTx: true,
    })
    expect(row?.metadata).toMatchObject({
      decision: 'system_default',
      basis: 'sole_vendor',
      consolidatorVendorId: VENDOR_ID,
      previousConsolidatorVendorId: null,
    })
    // `vendorId` is reserved by recordAudit for the shop a VENDOR request was
    // written for, and an admin acts for nobody.
    expect(row?.metadata).not.toHaveProperty('vendorId')
  })

  it('audits an admin choice as an admin choice', async () => {
    seed({ vendor: { id: VENDOR_ID_2, name: 'Frame Shop B' } })

    await setConsolidator({ vendorId: VENDOR_ID_2 })

    expect(audits()[0]?.metadata).toMatchObject({
      decision: 'admin_confirmed',
      basis: 'admin_override',
      consolidatorVendorId: VENDOR_ID_2,
    })
  })

  it('records a refusal OUTSIDE the transaction, or the refusal erases itself', async () => {
    seed({
      existing: { vendorId: VENDOR_ID, decidedBy: null },
      transfers: [
        {
          id: 'transfer-1',
          toVendorId: VENDOR_ID,
          dispatchedAt: new Date('2026-08-29T10:00:00Z'),
          receivedAt: null,
          lostAt: null,
          jobId: JOB_ID,
        },
      ],
      vendor: { id: VENDOR_ID_2, name: 'Frame Shop B' },
    })

    await setConsolidator({ vendorId: VENDOR_ID_2 })

    const [row] = audits()
    expect(row).toMatchObject({
      action: 'order.consolidator_set',
      outcome: 'failure',
      entityId: ORDER_ID,
    })
    // A refusal row records that a transaction was ROLLED BACK. Written inside
    // it, the row rolls back too and the evidence is gone.
    expect(row?.inTx).toBe(false)
  })

  // --------------------------------------------------------------------
  // The 404s and the bad payloads
  // --------------------------------------------------------------------

  it('404s an order that does not exist', async () => {
    seed({ orderExists: false })

    const res = await setConsolidator()

    expect(res.status).toBe(404)
    expect(consolidationRows()).toHaveLength(0)
  })

  it('404s a vendor that does not exist', async () => {
    seed({ vendor: null })

    const res = await setConsolidator({ vendorId: VENDOR_ID_2 })

    expect(res.status).toBe(404)
    expect(consolidationRows()).toHaveLength(0)
  })

  it('400s an orderId or vendorId that is not a uuid', async () => {
    expect((await setConsolidator({}, 'not-a-uuid')).status).toBe(400)
    expect((await setConsolidator({ vendorId: 'nope' })).status).toBe(400)
  })
})

// ============================================================================
// GET /api/admin/orders/:orderId/consolidator
// ============================================================================

/**
 * The standing decision, read from the table that holds it.
 *
 * `decided_by` is the whole point of the row — NULL is "the rules chose",
 * an id is "an admin stood behind an arbitrary call" — and until this route
 * existed nothing outside the database could see it. `production-readiness`
 * answers `consolidatorVendorId` alone, so the panel read the provenance off
 * the newest `order.consolidator_set` audit row instead. That trail is swept
 * at 400 days (`queues/audit-retention.ts`) while `order_consolidation` never
 * expires, so the screen would eventually print "unknown" over a fact the
 * database still holds.
 *
 * The ROW comes back, not a derived boolean: absence means nobody has decided,
 * which is a different answer from a system default, and only the caller can
 * render that difference.
 *
 * NOT a history endpoint. One order, one current fact; the audit log is the
 * history and stays the history.
 */
describe('GET /api/admin/orders/:orderId/consolidator', () => {
  const readConsolidator = (orderId = ORDER_ID) =>
    buildRouteApp('/api/admin/orders', adminOrderProductionApp).request(
      `/api/admin/orders/${orderId}/consolidator`
    )

  const DECIDED_AT = new Date('2026-03-05T00:00:00.000Z')

  interface Consolidation {
    orderId: string
    vendorId: string
    decidedBy: string | null
    decidedByEmail: string | null
    decidedAt: string | null
  }

  interface Body {
    orderId: string
    consolidation: Consolidation | null
  }

  /**
   * `decided_by IS NULL` — the rules chose, because one vendor already held
   * every job. The panel must be able to say so without the audit log.
   */
  it('returns the row a system default wrote, with decidedBy null', async () => {
    queueRows({
      'select:order_consolidation': [
        [
          {
            orderId: ORDER_ID,
            vendorId: VENDOR_ID,
            decidedBy: null,
            decidedByEmail: null,
            decidedAt: DECIDED_AT,
          },
        ],
      ],
    })

    const res = await readConsolidator()
    const body = await readJson<Body>(res)

    expect(res.status).toBe(200)
    expect(body.orderId).toBe(ORDER_ID)
    expect(body.consolidation).toEqual({
      orderId: ORDER_ID,
      vendorId: VENDOR_ID,
      decidedBy: null,
      decidedByEmail: null,
      decidedAt: DECIDED_AT.toISOString(),
    })
  })

  /** An id, and the account behind it — "somebody chose", nameable. */
  it('names the admin who confirmed the choice', async () => {
    queueRows({
      'select:order_consolidation': [
        [
          {
            orderId: ORDER_ID,
            vendorId: VENDOR_ID_2,
            decidedBy: 'admin-user-1',
            decidedByEmail: 'ops@chobii.art',
            decidedAt: DECIDED_AT,
          },
        ],
      ],
    })

    const body = await readJson<Body>(await readConsolidator())

    expect(body.consolidation?.decidedBy).toBe('admin-user-1')
    expect(body.consolidation?.decidedByEmail).toBe('ops@chobii.art')
  })

  /**
   * Absence is meaningful, and it is NOT a system default. An order nobody has
   * routed yet and an order the rules routed automatically are two different
   * facts, and collapsing them is exactly the invention `decided_by` exists to
   * make checkable.
   */
  it('answers a null consolidation when nobody has decided, not a default', async () => {
    queueRows({ 'select:order_consolidation': [[]] })

    const res = await readConsolidator()
    const body = await readJson<Body>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ orderId: ORDER_ID, consolidation: null })
  })

  /**
   * The PROJECTION, not the fixture. Rows come from `queueRows`, so every
   * assertion above passes just as well over a `.select()` that never asked
   * for `decided_by` — which is the exact shape this ticket exists to fix.
   */
  it('asks the database for decidedBy and decidedAt, not the vendor alone', async () => {
    queueRows({ 'select:order_consolidation': [[]] })

    await readConsolidator()

    const [read] = selects(orderConsolidation)
    expect(read?.fields).toEqual(
      expect.arrayContaining(['vendorId', 'decidedBy', 'decidedAt'])
    )
    expect(read?.limit).toBe(1)
    // The COLUMN as well as the value. `order_id` is the primary key and the
    // only thing that makes this one order's decision; matching the same uuid
    // against `vendor_id` renders identical parameters and answers a different
    // question.
    const where = render(read?.where)
    expect(where.sql).toContain('"order_consolidation"."order_id"')
    expect(where.params).toContain(ORDER_ID)
  })

  /**
   * The point of the ticket: the provenance comes out of a table that never
   * expires, not out of a trail swept at 400 days.
   */
  it('reads order_consolidation and never the audit log', async () => {
    queueRows({ 'select:order_consolidation': [[]] })

    await readConsolidator()

    expect(selects(orderConsolidation)).toHaveLength(1)
    expect(selects(adminAuditLog)).toHaveLength(0)
    // A read is not an act. Nothing is written and nothing is audited.
    expect(inserts(adminAuditLog)).toHaveLength(0)
  })

  /** Not a history endpoint — one order, one current row. */
  it('answers with one row and no history', async () => {
    queueRows({
      'select:order_consolidation': [
        [
          {
            orderId: ORDER_ID,
            vendorId: VENDOR_ID,
            decidedBy: null,
            decidedByEmail: null,
            decidedAt: DECIDED_AT,
          },
        ],
      ],
    })

    const body = await readJson<Record<string, unknown>>(await readConsolidator())

    expect(Object.keys(body).sort()).toEqual(['consolidation', 'orderId'])
    expect(Array.isArray(body.consolidation)).toBe(false)
  })

  it('400s an orderId that is not a uuid', async () => {
    expect((await readConsolidator('not-a-uuid')).status).toBe(400)
  })

  it('500s rather than answering over a read that failed', async () => {
    failNext('select:order_consolidation')

    expect((await readConsolidator()).status).toBe(500)
  })
})

// ============================================================================
// GET /api/admin/orders/:orderId/production-readiness
// ============================================================================

/**
 * The blocker LIST, not a boolean.
 *
 * `isOrderReadyToLabel` is `blockers.length === 0` over the very same call this
 * route makes, so the gate that refuses to buy a courier label and the screen
 * that explains why cannot disagree. A "not ready" with no reason is the class
 * of bug `OrderProductionPanel.tsx` already guards against.
 */
describe('GET /api/admin/orders/:orderId/production-readiness', () => {
  const readiness = (orderId = ORDER_ID) =>
    buildRouteApp('/api/admin/orders', adminOrderProductionApp).request(
      `/api/admin/orders/${orderId}/production-readiness`
    )

  function seedReadiness(over: {
    orderExists?: boolean
    items?: Array<Record<string, unknown>>
    jobs?: Array<Record<string, unknown>>
    consolidator?: string | null
    transfers?: Array<Record<string, unknown>>
  } = {}) {
    const {
      orderExists = true,
      items = [{ id: ITEM_A, frameId: null, giftCardPurchase: null }],
      jobs = [
        {
          id: JOB_ID,
          stage: 'print',
          status: 'qc_passed',
          vendorId: VENDOR_ID,
          assignedAt: PAST,
          orderItemId: ITEM_A,
        },
      ],
      consolidator = VENDOR_ID,
      transfers = [],
    } = over

    queueRows({
      'select:orders': [orderExists ? [{ orderType: 'regular' }] : []],
      'select:order_items': [items],
      'select:production_jobs': [jobs],
      'select:order_consolidation': [consolidator ? [{ vendorId: consolidator }] : []],
      'select:production_transfers': [transfers],
    })
  }

  it('answers ready with an empty blocker list when everything is at the consolidator', async () => {
    seedReadiness()

    const res = await readiness()
    const body = await readJson<{
      ready: boolean
      consolidatorVendorId: string
      blockers: unknown[]
    }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({
      orderId: ORDER_ID,
      ready: true,
      consolidatorVendorId: VENDOR_ID,
      blockers: [],
      blockerCodes: [],
    })
  })

  it('surfaces the blocker CODES rather than a bare false', async () => {
    seedReadiness({
      jobs: [
        {
          id: JOB_ID,
          stage: 'print',
          status: 'assigned',
          vendorId: VENDOR_ID,
          assignedAt: PAST,
          orderItemId: ITEM_A,
        },
      ],
      consolidator: null,
    })

    const body = await readJson<{
      ready: boolean
      blockers: Array<{ code: string; message: string; jobId?: string }>
      blockerCodes: string[]
    }>(await readiness())

    expect(body.ready).toBe(false)
    // Every reason at once, so the screen renders the whole story rather than
    // one line per refresh.
    expect(body.blockerCodes.sort()).toEqual(['job_not_qc_passed', 'no_consolidator'])
    for (const blocker of body.blockers) {
      expect(blocker.message.length).toBeGreaterThan(0)
    }
    expect(body.blockers.find((b) => b.code === 'job_not_qc_passed')?.jobId).toBe(JOB_ID)
  })

  it('answers order_not_found rather than a ready gift-card-shaped nothing', async () => {
    // A missing order reads back as zero items and zero jobs, which is the
    // gift-card READY path. The blocker is what keeps a mistyped id out of it.
    seedReadiness({ orderExists: false, items: [], jobs: [], consolidator: null })

    const body = await readJson<{ ready: boolean; blockerCodes: string[] }>(await readiness())

    expect(body.ready).toBe(false)
    expect(body.blockerCodes).toEqual(['order_not_found'])
  })

  it('names the consolidator holding no live job of its own', async () => {
    seedReadiness({ consolidator: VENDOR_ID_2 })

    const body = await readJson<{ blockerCodes: string[] }>(await readiness())

    expect(body.blockerCodes).toContain('consolidator_holds_no_job')
  })

  it('400s an orderId that is not a uuid', async () => {
    expect((await readiness('not-a-uuid')).status).toBe(400)
  })
})

// ============================================================================
// Role gating on the order-scoped routes
// ============================================================================

describe('role gating: /api/admin/orders', () => {
  const routes: Array<[string, RequestInit]> = [
    [`/api/admin/orders/${ORDER_ID}/consolidator`, json({})],
    // The READ is gated exactly as the write is. The audit log the panel used
    // to read the provenance out of is admin-and-super-admin-only too, so
    // moving the source does not widen who can see the decision.
    [`/api/admin/orders/${ORDER_ID}/consolidator`, {}],
    [`/api/admin/orders/${ORDER_ID}/production-readiness`, {}],
  ]

  it.each(routes)('403s a content-manager on %s %#', async (path, init) => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'))

    const res = await buildRouteApp('/api/admin/orders', adminOrderProductionApp).request(
      path,
      init
    )

    expect(res.status).toBe(403)
    expect(queries).toHaveLength(0)
  })

  it.each(routes)('401s an unauthenticated caller on %s %#', async (path, init) => {
    mockGetSession.mockResolvedValue(null)

    const res = await buildRouteApp('/api/admin/orders', adminOrderProductionApp).request(
      path,
      init
    )

    expect(res.status).toBe(401)
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

  it('mounts the order-scoped router on /api/admin/orders', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../src/index.ts', import.meta.url), 'utf8')
    )
    expect(source).toContain('app.route("/api/admin/orders", adminOrderProductionApp)')
  })

  /**
   * A recording builder cannot serialise anything, so `FOR UPDATE` is the one
   * part of the concurrency recipe no assertion in this file can reach — the
   * mock answers a `.for('update')` chain exactly as it answers a plain read.
   * Scanned from the source instead, over the consolidator handler alone:
   * a lock silently dropped in a refactor is what lets two admins route one
   * order to two vendors.
   */
  it('reads the order and its decision FOR UPDATE before writing a consolidator', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../../../src/routes/admin/production-jobs.ts', import.meta.url),
        'utf8'
      )
    )

    const start = source.indexOf('adminOrderProductionApp.post(')
    const end = source.indexOf('adminOrderProductionApp.get(')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const handler = source.slice(start, end)
    expect(handler.match(/\.for\(["']update["']\)/g) ?? []).toHaveLength(2)
  })

  /**
   * The same scan over the three JOB writers, which had none: `.for('update')`
   * could be deleted from assign, PATCH and the QC verdict and every assertion
   * in this file would still pass, because `query-recorder` answers a
   * `.for('update')` chain exactly as it answers a plain read.
   */
  it.each([
    [
      'the consolidator default the assign handler writes',
      'async function writeSystemDefaultConsolidator(',
      '// POST /api/admin/production/:jobId/assign',
      1,
    ],
    ['the assign handler', 'adminProductionApp.post(\n  "/:jobId/assign"', 'adminProductionApp.patch(', 1],
    ['the PATCH handler', 'adminProductionApp.patch(', 'adminProductionApp.post(\n  "/:jobId/reviews"', 1],
    ['the QC verdict', 'adminProductionApp.post(\n  "/:jobId/reviews"', 'adminProductionApp.get(\n  "/:jobId/photos"', 1],
  ])('takes FOR UPDATE in %s', async (_label, from, to, expected) => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../../../src/routes/admin/production-jobs.ts', import.meta.url),
        'utf8'
      )
    )

    const start = source.indexOf(from as string)
    const end = source.indexOf(to as string, start + 1)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const handler = source.slice(start, end)
    expect(handler.match(/\.for\(["']update["']\)/g) ?? []).toHaveLength(expected as number)
  })
})
