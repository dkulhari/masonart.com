/**
 * Admin production API — job creation, assignment pricing, QC reviews.
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
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import '../../setup'

import type { RecordedQuery } from '../../helpers/query-recorder'
import {
  productionJobs,
  productionJobItems,
  productionJobReviews,
} from '../../../src/database/schema/production-jobs'

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

import { adminProductionApp } from '../../../src/routes/admin/production-jobs'

// ============================================================================
// Helpers
// ============================================================================

const { queries, rowQueues, render, queueRows, failNext, selects, inserts, updates, tx } =
  recorder

function sessionFor(role: string) {
  const now = new Date()
  return {
    user: {
      id: 'admin-user-1',
      name: 'Admin User',
      email: 'admin@example.com',
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role,
      status: 'active',
    },
    session: {
      id: 'sess-1',
      token: 'tok-1',
      userId: 'admin-user-1',
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  }
}

function buildApp(): Hono {
  const app = new Hono()
  app.route('/api/admin/production', adminProductionApp)
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    return c.json({ error: err.message }, 500)
  })
  return app
}

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

beforeEach(() => {
  recorder.reset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('admin'))
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

    const body = await res.json()
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

    const body = await res.json()
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
    expect((await assignA.json()).job.amountExpected).toBe('100.00')

    const assignB = await app.request(
      `/api/admin/production/${JOB_ID_2}/assign`,
      json({ vendorId: VENDOR_ID_2 })
    )
    expect(assignB.status).toBe(200)
    expect((await assignB.json()).job.amountExpected).toBe('250.00')

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
    items: Array<{ orderItemId: string; widthInches: number | null; heightInches: number | null }>
    rates: unknown[]
    stage?: string
    updated?: Record<string, unknown>
  }) {
    queueRows({
      'select:production_jobs': [[jobRow({ stage: over.stage ?? 'print' })]],
      'select:vendors': [[{ id: VENDOR_ID, name: 'Print Co' }]],
      'select:production_job_items': [over.items],
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

    const body = await res.json()
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

    const body = await res.json()
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
})

// ============================================================================
// PATCH — the amountActual override
// ============================================================================

describe('PATCH /api/admin/production/:jobId', () => {
  it('records an amountActual override and reports it as the payable', async () => {
    queueRows({
      'update:production_jobs': [
        [jobRow({ amountExpected: '100.00', amountActual: '90.00', status: 'received' })],
      ],
    })

    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ amountActual: '90.00' }, 'PATCH')
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.job.amountActual).toBe('90.00')
    // The override, not the expectation — this is lib/vendor-payables' rule and
    // the number a settlement will be built from.
    expect(body.payableAmount).toBe('90.00')

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.amountActual).toBe('90.00')
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

  it('accepts the date fields and a status, with no transition guard', async () => {
    queueRows({
      'update:production_jobs': [[jobRow({ status: 'sent', sentAt: new Date('2026-08-01T00:00:00Z') })]],
    })

    // draft -> sent skips 'assigned'. Status is a vocabulary here; the state
    // machine is production-pipeline's. This 200 is deliberate.
    const res = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json(
        {
          status: 'sent',
          sentAt: '2026-08-01T00:00:00.000Z',
          dueAt: '2026-08-10T00:00:00.000Z',
        },
        'PATCH'
      )
    )
    expect(res.status).toBe(200)

    const written = updates(productionJobs)[0]?.values as Record<string, unknown>
    expect(written.status).toBe('sent')
    expect(written.sentAt).toBeInstanceOf(Date)
    expect(written.dueAt).toBeInstanceOf(Date)
  })

  it('404s an unknown job and 400s an empty patch', async () => {
    queueRows({ 'update:production_jobs': [[]] })

    const missing = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({ amountActual: '10.00' }, 'PATCH')
    )
    expect(missing.status).toBe(404)

    const empty = await buildApp().request(
      `/api/admin/production/${JOB_ID}`,
      json({}, 'PATCH')
    )
    expect(empty.status).toBe(400)
  })
})

// ============================================================================
// QC reviews — append-only
// ============================================================================

describe('POST /api/admin/production/:jobId/reviews', () => {
  it('appends three rows across fail -> rework -> pass and mutates none', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()], [jobRow()], [jobRow()], [jobRow()]],
      'insert:production_job_reviews': [
        [{ id: 'rev-1', jobId: JOB_ID, verdict: 'fail', createdAt: new Date('2026-08-01') }],
        [{ id: 'rev-2', jobId: JOB_ID, verdict: 'fail', createdAt: new Date('2026-08-02') }],
        [{ id: 'rev-3', jobId: JOB_ID, verdict: 'pass', createdAt: new Date('2026-08-03') }],
      ],
      'select:production_job_items': [[]],
      'select:production_job_reviews': [
        [
          { id: 'rev-3', verdict: 'pass', createdAt: new Date('2026-08-03') },
          { id: 'rev-2', verdict: 'fail', createdAt: new Date('2026-08-02') },
          { id: 'rev-1', verdict: 'fail', createdAt: new Date('2026-08-01') },
        ],
      ],
    })

    const app = buildApp()

    for (const verdict of ['fail', 'fail', 'pass'] as const) {
      const res = await app.request(
        `/api/admin/production/${JOB_ID}/reviews`,
        json({ verdict, defects: ['banding'], notes: `${verdict} pass` })
      )
      expect(res.status).toBe(201)
    }

    const appended = inserts(productionJobReviews)
    expect(appended).toHaveLength(3)
    expect(appended.map((q) => (q.values as Record<string, unknown>).verdict)).toEqual([
      'fail',
      'fail',
      'pass',
    ])
    // Append-only. One UPDATE here and the rework history is gone.
    expect(updates(productionJobReviews)).toHaveLength(0)
    expect(queries.some((q) => q.op === 'delete' && q.table === 'production_job_reviews')).toBe(
      false
    )

    // reviewerId comes from the session, not the body.
    expect(appended[0]?.values).toMatchObject({
      jobId: JOB_ID,
      reviewerId: 'admin-user-1',
      defects: ['banding'],
    })

    const detail = await app.request(`/api/admin/production/${JOB_ID}`)
    expect(detail.status).toBe(200)

    const body = await detail.json()
    expect(body.reviews).toHaveLength(3)
    expect(body.reviews.map((r: { id: string }) => r.id)).toEqual(['rev-3', 'rev-2', 'rev-1'])

    // Newest first is an ORDER BY, not the insertion order of a mock.
    const reviewSelect = selects(productionJobReviews)[0]
    expect(render(reviewSelect?.orderBy).sql.toLowerCase()).toContain('desc')
  })

  it('rejects an unknown verdict and 404s an unknown job', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const bad = await buildApp().request(
      `/api/admin/production/${JOB_ID}/reviews`,
      json({ verdict: 'maybe' })
    )
    expect(bad.status).toBe(400)

    queries.length = 0
    rowQueues.clear()
    queueRows({ 'select:production_jobs': [[]] })

    const missing = await buildApp().request(
      `/api/admin/production/${JOB_ID}/reviews`,
      json({ verdict: 'pass' })
    )
    expect(missing.status).toBe(404)
    expect(inserts(productionJobReviews)).toHaveLength(0)
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

    const body = await res.json()
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

    const body = await res.json()
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
