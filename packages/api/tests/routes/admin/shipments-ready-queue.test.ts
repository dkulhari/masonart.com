/**
 * `GET /api/admin/shipments/ready` — the ready-to-label queue (#730).
 *
 * Two things are mocked and one deliberately is not, the same split
 * `tests/routes/admin/vendors.test.ts` documents:
 *
 * - `src/database` is a recording query builder. It executes no SQL, so every
 *   property that is about *the query* — the scan LIMIT, the candidate
 *   predicate, and above all the number of reads per candidate order — is
 *   asserted by rendering the captured drizzle condition through `PgDialect`.
 *   That is an assertion about real SQL rather than a restatement of the
 *   handler, which is what the ticket asks for by name.
 * - `src/auth` is mocked so a test picks the caller's role, and the REAL
 *   `requireAuth` / `requireAdmin` run.
 * - `src/lib/production-readiness` is NOT mocked. The whole claim of this
 *   endpoint is that its verdict is the seam's verdict and not a second
 *   opinion; mocking the seam away would test the mock. The expected blockers
 *   below are therefore computed by calling `evaluateLabelReadiness` on the
 *   same rows the fixture feeds the route, never by copying its sentences.
 *
 * @see packages/api/src/routes/admin/shipments.ts
 * @see packages/api/src/lib/production-readiness.ts
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adminSessionFor } from '../../helpers/admin-session'
import { buildRouteApp } from '../../helpers/route-app'
import '../../setup'

import { gt } from 'drizzle-orm'

import { orders, orderItems } from '../../../src/database/schema/orders'
import {
  orderShipments,
  shipmentStatusEnum,
} from '../../../src/database/schema/shipping'
import { productionJobs } from '../../../src/database/schema/production-jobs'
import {
  orderConsolidation,
  productionTransfers,
} from '../../../src/database/schema/production-transfers'
import {
  evaluateLabelReadiness,
  loadOrderProductionSnapshot,
  loadOrderProductionSnapshots,
  NON_PRODUCIBLE_ORDER_TYPES,
  requiredStagesFor,
  type OrderProductionSnapshot,
  type ReadinessItem,
  type ProductionReader,
} from '../../../src/lib/production-readiness'
import type { RecordedQuery } from '../../helpers/query-recorder'

// ============================================================================
// Recording database mock
// ============================================================================

// `repeatLast` rather than `consume`: the batched loader reads each table
// exactly once, and a fixture that had to queue a batch per call would encode
// the very call count these tests exist to pin.
const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder({ rows: 'repeatLast' })
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

import {
  ADMIN_SHIPMENT_REFUSAL_CODES,
  adminShipmentsApp,
  CLOSED_SHIPMENT_STATUSES,
  READY_QUEUE_SCAN_LIMIT,
  SHIPMENT_CUSTOMER_COLUMNS,
  SHIPMENT_DETAIL_ORDER_COLUMNS,
  SHIPMENT_LIST_ORDER_COLUMNS,
  SHIPMENT_RESPONSE_COLUMNS,
  SHIPPABLE_ORDER_STATUSES,
} from '../../../src/routes/admin/shipments'
import { readJson } from '../../helpers/json'

const { params, render, queueRows, selects } = recorder

const buildApp = () => buildRouteApp('/api/admin/shipments', adminShipmentsApp)

const ORDER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ORDER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ORDER_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ORDER_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

/**
 * One candidate row exactly as the scan projects it.
 *
 * The recorder answers with whatever a test queued and is blind to the WHERE,
 * so these rows are not "orders that matched" — they are what the handler is
 * handed. Every property about WHICH orders match is therefore asserted against
 * the rendered SQL instead, and every property here is about what the handler
 * does with rows once it has them.
 */
function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_A,
    orderNumber: 'CA-2026-000001',
    status: 'processing',
    orderType: 'regular',
    createdAt: new Date('2026-08-01T09:00:00Z'),
    itemCount: 1,
    ...over,
  }
}

/**
 * One `production_jobs` row as the BATCHED loader projects it — note `orderId`,
 * which the seam's own per-order loader has no reason to select.
 *
 * That column is the whole difference between the two shapes, and carrying it
 * in the fixture is what makes the grouping testable: the recorder ignores the
 * WHERE, so a loader that failed to group would hand every order every job, and
 * the ranking test below would report four orders with identical blockers.
 */
function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    orderId: ORDER_A,
    stage: 'print',
    status: 'draft',
    vendorId: null,
    assignedAt: null,
    replacesJobId: null,
    orderItemId: null,
    ...over,
  }
}

/**
 * Four candidates whose readiness differs, handed over in placed-at order — so
 * any resemblance between the scan's order and the response's is the handler
 * doing the ranking, not the fixture.
 *
 * What the seam makes of each, which is asserted rather than assumed by
 * `answers with the seam's own verdict` below:
 *
 * | order | placed | jobs        | blockers                                |
 * |-------|--------|-------------|-----------------------------------------|
 * | D     | 08:00  | one draft   | no_consolidator + job_not_qc_passed = 2 |
 * | A     | 09:00  | two drafts  | no_consolidator + 2 × not_qc_passed = 3 |
 * | B     | 10:00  | none        | nothing to produce, nothing to do  = 0 |
 * | C     | 11:00  | one draft   | same as D                          = 2 |
 *
 * B is ready by the seam's "an order with nothing to produce is not waiting on
 * production" clause, which is also why the gift-card exclusion further down
 * has to be a property of the SCAN rather than of readiness.
 */
const RANKING_FIXTURE = {
  'select:orders': [
    [
      orderRow({ id: ORDER_D, createdAt: new Date('2026-08-01T08:00:00Z') }),
      orderRow({ id: ORDER_A, createdAt: new Date('2026-08-01T09:00:00Z') }),
      orderRow({ id: ORDER_B, createdAt: new Date('2026-08-01T10:00:00Z') }),
      orderRow({ id: ORDER_C, createdAt: new Date('2026-08-01T11:00:00Z') }),
    ],
  ],
  'select:order_items': [[]],
  'select:production_jobs': [
    [
      jobRow({ id: 'job-a1', orderId: ORDER_A }),
      jobRow({ id: 'job-a2', orderId: ORDER_A }),
      jobRow({ id: 'job-c1', orderId: ORDER_C }),
      jobRow({ id: 'job-d1', orderId: ORDER_D }),
    ],
  ],
  'select:order_consolidation': [[]],
  'select:production_transfers': [[]],
}

beforeEach(() => {
  recorder.reset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(adminSessionFor('admin'))
})

// ============================================================================
// The route answers at all — and is not swallowed by GET /:id
// ============================================================================

describe('GET /api/admin/shipments/ready', () => {
  it('answers on its own path rather than as a shipment id', async () => {
    // Hono matches in REGISTRATION order: with `/:id` registered first,
    // `/ready` is read as a shipment id and answered `400 Invalid shipment ID`.
    // Measured against hono 4.11.4 in this tree, and it is the same failure
    // that made `/api/admin/vendors` answer `400 Invalid shipment ID` when the
    // whole router was mounted at `/api/admin`.
    queueRows({ 'select:orders': [[]] })

    const res = await buildApp().request('/api/admin/shipments/ready')

    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.error).toBeUndefined()
  })

  it('returns the paginated envelope under `items`', async () => {
    // `items`, never `orders` or `shipments`: reading `orders` is what made
    // #713's e2e spec skip both its tests and pass vacuously.
    queueRows({
      'select:orders': [[orderRow()]],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
    })

    const res = await buildApp().request('/api/admin/shipments/ready')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(Object.keys(body)).toContain('items')
    expect(body.items).toHaveLength(1)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(20)
    expect(body.total).toBe(1)
    expect(body.totalPages).toBe(1)
    expect(body.items[0].orderId).toBe(ORDER_A)

    // The same two booleans `GET /api/admin/shipments` answers with. They were
    // missing here for two rounds, with nothing naming the departure — one file,
    // two paginated GETs, two envelopes is how a client grows a branch on which
    // admin list it is reading.
    expect(body.hasNextPage).toBe(false)
    expect(body.hasPreviousPage).toBe(false)
  })

  it('answers hasNextPage about the WINDOW and scanTruncated about the backlog', async () => {
    // Two different questions, and conflating them is why they are both here:
    // `hasNextPage` is "there are more ranked rows on the next page of this
    // scan", `scanTruncated` is "there are more candidates than this scan saw
    // at all". A client that walked only the first would stop at the end of a
    // window and call it the end of the queue.
    queueRows(RANKING_FIXTURE)

    const body = await readJson(
      await buildApp().request('/api/admin/shipments/ready?page=1&pageSize=2')
    )

    expect(body.hasNextPage).toBe(true)
    expect(body.hasPreviousPage).toBe(false)
    expect(body.scanTruncated).toBe(false)

    const second = await readJson(
      await buildApp().request('/api/admin/shipments/ready?page=2&pageSize=2')
    )
    expect(second.hasNextPage).toBe(false)
    expect(second.hasPreviousPage).toBe(true)
  })

  it('terminates the page walk it tells a client to do', async () => {
    // The whole contract, exercised as a client exercises it: request a page,
    // and while `hasNextPage` says there is another, ask for the next one.
    // Every paginated list in this console is walked exactly this way, and the
    // two siblings — `GET /api/admin/shipments` and `routes/admin/vendors.ts` —
    // terminate on it because their boolean is about the page axis and nothing
    // else.
    //
    // Here it never terminated. `page` is clamped to `max(1, totalPages)`, so
    // `?page=11` of a ten-page window answers `page: 10` with byte-identical
    // items; `hasNextPage` stayed true because a scan cursor existed; and the
    // loop rode the clamp forever, re-reading page ten and paying for the whole
    // 200-row scan and six batched reads on every turn.
    //
    // Bounded at 25 requests so a regression is a failed assertion rather than
    // a hung suite: an assertion names the defect, a hang gets a `--timeout`.
    queueRows({
      'select:orders': [deepBacklog()],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
      'select:order_shipments': [[]],
    })

    const walked: number[] = []
    let page = 1

    for (let request = 0; request < 25; request += 1) {
      const body = await readJson(
        await buildApp().request(`/api/admin/shipments/ready?page=${page}&pageSize=20`)
      )
      walked.push(body.page as number)
      if (!body.hasNextPage) break
      page += 1
    }

    // Ten pages of twenty over a full window, each one visited once. Not
    // `toHaveLength`: a walk that repeats the clamped page has the length right
    // for the wrong reason on the request after it.
    expect(walked, 'the page walk did not end where the window does').toEqual(
      Array.from({ length: 10 }, (_, i) => i + 1)
    )
  })

  it('hands the next window over on the cursor, not on hasNextPage', async () => {
    // The end of a truncated scan, which is where the two axes meet and where
    // the envelope has to be unambiguous about which one moved.
    //
    // `hasNextPage: false` here is not "the queue is empty". It is "page 200 is
    // the last page of THIS window", and the window is 200 of a deeper backlog
    // — which the envelope says twice, in the two keys that exist to say it:
    // `scanTruncated` for a screen that wants to warn, `nextScanCursor` for a
    // client that wants to keep reading.
    //
    // The boolean used to be widened to cover the cursor too, so that a client
    // reading only `hasNextPage` would not stop at 200 orders. It made the page
    // walk non-terminating instead — see `terminates the page walk it tells a
    // client to do` — because `page` is clamped and the loop rode the clamp. A
    // client that ignores `nextScanCursor` stops early; a client that trusts a
    // boolean named after pages hangs. Only one of those two is a defect in the
    // envelope.
    queueRows({
      'select:orders': [deepBacklog()],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
      'select:order_shipments': [[]],
    })

    const body = await readJson(
      await buildApp().request(
        `/api/admin/shipments/ready?page=${READY_QUEUE_SCAN_LIMIT}&pageSize=1`
      )
    )

    expect(body.page).toBe(READY_QUEUE_SCAN_LIMIT)
    expect(body.totalPages).toBe(READY_QUEUE_SCAN_LIMIT)
    expect(body.hasNextPage, 'there is no page 201 of a 200-page window').toBe(false)

    // ...and the second axis is still advertised, in full, on the same
    // response. Without these two the boolean above would be the queue lying
    // about the size of the backlog rather than being narrow about pages.
    expect(body.scanTruncated).toBe(true)
    expect(
      body.nextScanCursor,
      'the deeper backlog is unreachable: no cursor and no next page'
    ).not.toBeNull()

    // The cursor is an address, not a flag, and the proof is that the route
    // takes it back: this is the request that opens the next window, with
    // `page` starting over at 1 inside it. A cursor the route would refuse is
    // the same dead end as no cursor, answered with a 200.
    const next = await buildApp().request(
      `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(String(body.nextScanCursor))}`
    )
    expect(next.status, 'the cursor this response handed out is not one it accepts').toBe(200)
  })

  it('answers hasPreviousPage about the same axis, or the pair is asymmetric', async () => {
    // The twin of the key above, and it moved with it. `page > 1 || cursor !==
    // null` answered `true` on the first page of a second window — "something
    // exists before this", which is true and is not what the key is for. A
    // client that reads `hasPreviousPage` computes `page - 1`; here that is
    // `?page=0`, which this route refuses with a 400 and a coded body.
    //
    // The asymmetry with `nextScanCursor` is deliberate and it is about what
    // the CALLER knows. A client on the second window supplied the cursor that
    // put it there, so it does not need the server to tell it. It cannot know a
    // further window exists without being told, which is why only the forward
    // direction is advertised.
    queueRows({
      'select:orders': [[orderRow()]],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
      'select:order_shipments': [[]],
    })

    const body = await readJson(
      await buildApp().request(
        `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(
          `2026-08-01T09:00:00.000Z|${ORDER_A}`
        )}`
      )
    )

    expect(body.page).toBe(1)
    expect(
      body.hasPreviousPage,
      'the envelope advertises a previous page whose only address is ?page=0'
    ).toBe(false)

    // Which is not a claim that page 0 would be answered leniently — it is
    // refused, and that refusal is what makes `true` above unactionable.
    expect((await buildApp().request('/api/admin/shipments/ready?page=0')).status).toBe(400)
  })

  it('scans a bounded candidate set, and the SQL says which orders', async () => {
    queueRows({
      'select:orders': [[orderRow()]],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
    })

    const res = await buildApp().request('/api/admin/shipments/ready')
    expect(res.status).toBe(200)

    const scan = selects(orders)[0]
    expect(scan, 'the candidate scan never ran').toBeDefined()

    // Bounded with no query string at all — the fan-out below is per candidate,
    // so an unbounded scan is an unbounded number of reads.
    expect(scan?.limit).toBeDefined()
    expect(scan?.limit).toBeLessThanOrEqual(201)

    const { sql, params } = render(scan?.where)

    // The queue must agree with the route that actually opens a shipment, or it
    // lists work `POST /orders/:orderId/ship` would refuse with a 400.
    expect(sql).toContain('"orders"."status"')
    expect(params).toContain('confirmed')
    expect(params).toContain('processing')

    // An order that already carries a live label is out the door, and a queue
    // it never leaves is a queue nobody can work.
    const lowered = sql.toLowerCase()
    expect(lowered).toContain('not exists')
    expect(lowered).toContain('voided_at')
    expect(lowered).toContain('label_object_token')
    expect(lowered).toContain('awb_number')
    expect(lowered).toContain('tracking_number')
  })
})

// ============================================================================
// The fan-out: one read per table, not one snapshot per order
// ============================================================================

describe('the readiness fan-out', () => {
  it('reads each production table ONCE for the whole page', async () => {
    // Readiness is per order and this is a list. Calling the seam in a loop
    // costs five round trips per candidate — 1000 of them at the scan cap —
    // and that is slow long before it is wrong. The batched loader is the
    // answer, and this is the assertion that keeps it batched: a reviewer who
    // "simplifies" it back into `for (const o of orders) await
    // getOrderLabelReadiness(o.id)` turns these 1s into 4s.
    queueRows(RANKING_FIXTURE)

    const res = await buildApp().request('/api/admin/shipments/ready')
    expect(res.status).toBe(200)

    // `orders` twice and everything else once, for four candidate orders. The
    // second `orders` read is the seam loader's own: it re-reads the row rather
    // than inheriting `orderExists` from the candidate scan, which is what
    // makes it a self-contained twin of `loadOrderProductionSnapshot` instead
    // of a function that only works when this route calls it. One extra batched
    // query per request buys the whole of that.
    expect(selects(orders), 'a read of orders is being re-issued per order').toHaveLength(2)
    expect(selects(orderItems)).toHaveLength(1)
    expect(selects(productionJobs)).toHaveLength(1)
    expect(selects(orderConsolidation)).toHaveLength(1)
    expect(selects(productionTransfers)).toHaveLength(1)
  })

  it('names every candidate order in each batched predicate', async () => {
    queueRows(RANKING_FIXTURE)

    await buildApp().request('/api/admin/shipments/ready')

    for (const table of [orderItems, productionJobs, orderConsolidation, productionTransfers]) {
      const read = selects(table)[0]
      const { sql, params } = render(read?.where)

      // `in (...)`, and every id bound: a batched read that dropped an id
      // would report that order as having no jobs at all, which reads as
      // "ready" for an order nobody has started.
      expect(sql.toLowerCase()).toContain(' in (')
      expect(sql).toContain('"order_id"')
      for (const id of [ORDER_A, ORDER_B, ORDER_C, ORDER_D]) {
        expect(params, `${id} was not bound in the batched read`).toContain(id)
      }
    }
  })

  it('issues no read at all when nothing is a candidate', async () => {
    // `inArray(col, [])` renders `false` in drizzle, but four queries that can
    // only return nothing are still four round trips.
    queueRows({ 'select:orders': [[]] })

    const res = await buildApp().request('/api/admin/shipments/ready')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.items).toEqual([])
    expect(body.total).toBe(0)
    expect(body.totalPages).toBe(0)

    expect(selects(productionJobs)).toHaveLength(0)
    expect(selects(orderItems)).toHaveLength(0)
    expect(selects(orderConsolidation)).toHaveLength(0)
    expect(selects(productionTransfers)).toHaveLength(0)
  })
})

// ============================================================================
// Ranking: the work first, the backlog after
// ============================================================================

describe('the ranking', () => {
  it('puts the fewest blockers first, and breaks ties by who has waited longest', async () => {
    queueRows(RANKING_FIXTURE)

    const res = await buildApp().request('/api/admin/shipments/ready')
    expect(res.status).toBe(200)

    const body = await readJson(res)

    // B is ready (no items, no jobs). D and C each hold one draft job with no
    // consolidator, so they tie on blocker count and D placed first. A holds
    // two, so it sinks. The scan handed them over as D, A, B, C.
    expect(body.items.map((row: { orderId: string }) => row.orderId)).toEqual([
      ORDER_B,
      ORDER_D,
      ORDER_C,
      ORDER_A,
    ])

    // Ready-first is not a separate sort key — it falls out of fewest-blockers
    // first, because `ready` IS `blockers.length === 0`. Asserting the counts
    // are non-decreasing is asserting that, rather than trusting it.
    const counts = body.items.map((row: { blockers: unknown[] }) => row.blockers.length)
    expect(counts).toEqual([...counts].sort((a: number, b: number) => a - b))
    expect(body.items[0].ready).toBe(true)
    expect(body.readyCount).toBe(1)
  })

  it('answers with the seam’s own verdict, not a second opinion', async () => {
    queueRows(RANKING_FIXTURE)

    const res = await buildApp().request('/api/admin/shipments/ready')
    const body = await readJson(res)

    // Computed by calling `evaluateLabelReadiness` on the same rows the fixture
    // fed the route — never by copying its sentences into this file. If the
    // route ever grew its own idea of "ready", this is what would catch it.
    const expected = evaluateLabelReadiness({
      orderId: ORDER_A,
      orderExists: true,
      orderType: 'regular',
      items: [],
      jobs: [
        {
          id: 'job-a1',
          stage: 'print',
          status: 'draft',
          vendorId: null,
          assignedAt: null,
          orderItemIds: [],
          replacesJobId: null,
        },
        {
          id: 'job-a2',
          stage: 'print',
          status: 'draft',
          vendorId: null,
          assignedAt: null,
          orderItemIds: [],
          replacesJobId: null,
        },
      ],
      transfers: [],
      consolidatorVendorId: null,
    })

    const rowA = body.items.find((row: { orderId: string }) => row.orderId === ORDER_A)
    expect(rowA.ready).toBe(expected.ready)
    expect(rowA.blockers.map((b: { code: string }) => b.code)).toEqual(
      expected.blockers.map((b) => b.code)
    )
    expect(rowA.blockers.map((b: { message: string }) => b.message)).toEqual(
      expected.blockers.map((b) => b.message)
    )
  })
})

// ============================================================================
// The parity scan: the batched loader reads what the seam reads
// ============================================================================
//
// The route batches the seam's reads instead of calling it per order, which
// buys four queries where there were 5N — and costs a DUPLICATE of the seam's
// read list. This section is what stops that duplicate going stale silently.
// It is a pure function over two lists of recorded shapes, run over the real
// pair and then over planted corpora with a table and a column removed, so the
// negative case runs on every CI run rather than once on the day it was
// written.

/** One recorded read, reduced to what parity is about. */
interface ReadShape {
  table: string
  fields: string[]
}

/** The tables and projection aliases a recorded run issued, in order. */
function readShapes(queries: readonly RecordedQuery[]): ReadShape[] {
  return queries
    .filter((q) => q.op === 'select')
    .map((q) => ({ table: q.table ?? 'unknown', fields: [...(q.fields ?? [])] }))
}

/**
 * Every table, and every column of a table, the SEAM reads that the BATCH path
 * does not. Pure: two lists of shapes in, the drift out.
 *
 * A whole missing table is reported as the table; a missing column as
 * `table.column`. The batch path is allowed to read MORE — it carries
 * `orderId` on every projection so rows can be put back on their order, and
 * its candidate scan reads display columns the seam has no use for.
 */
function missingReads(
  seam: readonly ReadShape[],
  batch: readonly ReadShape[]
): string[] {
  const found: string[] = []

  for (const read of seam) {
    const covering = batch.filter((shape) => shape.table === read.table)
    if (covering.length === 0) {
      found.push(read.table)
      continue
    }

    const columns = new Set(covering.flatMap((shape) => shape.fields))
    for (const field of read.fields) {
      if (!columns.has(field)) found.push(`${read.table}.${field}`)
    }
  }

  return found.sort()
}

/** What the seam's own per-order loader reads, recorded. */
async function seamReadShapes(): Promise<ReadShape[]> {
  recorder.reset()
  queueRows({ 'select:orders': [[{ orderType: 'regular' }]] })
  await loadOrderProductionSnapshot(ORDER_A, recorder.db as unknown as ProductionReader)
  return readShapes(recorder.queries)
}

/**
 * What the batched loader reads, recorded by driving it DIRECTLY.
 *
 * Directly rather than through the handler, because the property is about the
 * two LOADERS agreeing; through the route every assertion below would instead
 * be a statement that a request to `/ready` happens to touch these tables. The
 * test further down is what carries the result back to the route.
 */
async function loaderReadShapes(): Promise<ReadShape[]> {
  recorder.reset()
  queueRows(RANKING_FIXTURE)
  await loadOrderProductionSnapshots(
    [ORDER_A],
    recorder.db as unknown as ProductionReader
  )
  return readShapes(recorder.queries)
}

/** What one request to the queue reads, recorded. */
async function routeReadShapes(): Promise<ReadShape[]> {
  recorder.reset()
  queueRows(RANKING_FIXTURE)
  const res = await buildApp().request('/api/admin/shipments/ready')
  expect(res.status, 'the queue did not answer, so there is nothing to compare').toBe(200)
  return readShapes(recorder.queries)
}


describe('parity with lib/production-readiness', () => {
  it('reads every table and column the seam reads', async () => {
    // The cost of batching the reads is that they are DUPLICATED: a sixth read
    // added to `loadOrderProductionSnapshot`, or a column added to one of its
    // five, leaves this route answering from the old shape — silently, with a
    // default, which is the worst kind of wrong for a gate. This is the scan
    // that turns that into a red test instead of a support ticket.
    const seam = await seamReadShapes()
    const batch = await loaderReadShapes()

    const drift = missingReads(seam, batch)
    expect(
      drift,
      drift.length === 0
        ? ''
        : [
            'loadOrderProductionSnapshots in lib/production-readiness.ts no longer reads',
            'everything loadOrderProductionSnapshot beside it reads:',
            ...drift.map((entry) => `  - ${entry}`),
            '',
            'Add it to loadOrderProductionSnapshots, or the ready-to-label queue answers',
            'from a snapshot with a default where a row should be.',
          ].join('\n')
    ).toEqual([])
  })

  it('really did record five reads on each side, over the same five tables', async () => {
    // A parity scan over two empty lists passes for the wrong reason.
    const TABLES = [
      'order_consolidation',
      'order_items',
      'orders',
      'production_jobs',
      'production_transfers',
    ]

    const seam = await seamReadShapes()
    expect(seam).toHaveLength(5)
    expect(seam.map((shape) => shape.table).sort()).toEqual(TABLES)

    const batch = await loaderReadShapes()
    expect(batch).toHaveLength(5)
    expect(batch.map((shape) => shape.table).sort()).toEqual(TABLES)
  })

  it('the seam filters on the order id alone — the half `readShapes` cannot see', async () => {
    // `readShapes` keeps `{ table, fields }` and DISCARDS the WHERE, so the scan
    // above compares tables and projection aliases only. That leaves one real
    // hole: the seam could start filtering a read in SQL — skipping cancelled
    // jobs, say — and the batch would keep reading everything while the scan
    // stayed green, which is the queue and the gate quietly diverging.
    //
    // This is the plug. Every one of the seam's five reads binds exactly one
    // parameter, the order id. The day one of them binds a second, this goes red
    // and names the table, which is the prompt to mirror the filter in the batch.
    recorder.reset()
    queueRows({ 'select:orders': [[{ orderType: 'regular' }]] })
    await loadOrderProductionSnapshot(ORDER_A, recorder.db as unknown as ProductionReader)

    const reads = recorder.queries.filter((q) => q.op === 'select')
    expect(reads).toHaveLength(5)
    for (const read of reads) {
      expect(params(read.where), `${read.table} filters on more than the order id`).toEqual([
        ORDER_A,
      ])
    }
  })

  it('CAN fail: it names a table the batched loader stopped reading', async () => {
    const seam = await seamReadShapes()
    const batch = await loaderReadShapes()

    expect(
      missingReads(
        seam,
        batch.filter((shape) => shape.table !== 'production_transfers')
      )
    ).toEqual(['production_transfers'])
  })

  it('CAN fail: it names a column the batched loader stopped selecting', async () => {
    // `replaces_job_id` is the one that retires a `transfer_lost` blocker. Drop
    // it and every order whose parcel was written off stays blocked forever,
    // with no other symptom.
    const seam = await seamReadShapes()
    const batch = await loaderReadShapes()

    expect(
      missingReads(
        seam,
        batch.map((shape) =>
          shape.table === 'production_jobs'
            ? { ...shape, fields: shape.fields.filter((f) => f !== 'replacesJobId') }
            : shape
        )
      )
    ).toEqual(['production_jobs.replacesJobId'])
  })

  it('the route reads through the seam loader, so parity over it is parity over the route', async () => {
    // Without this, the parity scan above is a claim about a function nothing
    // calls. A request to `/ready` issues its candidate scan FIRST and then
    // hands the ids to the loader, so dropping the first recorded read has to
    // leave exactly the list the loader issues on its own, in the same order.
    const throughRoute = await routeReadShapes()
    const direct = await loaderReadShapes()

    expect(throughRoute[0]?.table, 'the candidate scan is not the first read').toBe('orders')

    // The route's own reads at either end — the candidate scan first, the
    // open-shipment report last — with the seam loader's five in between, in
    // the loader's own order. Sliced by position rather than filtered by table
    // name, because `orders` and `order_shipments` are each read by both sides.
    const batched = throughRoute.slice(1, throughRoute.length - 1)
    expect(batched.length, 'the route issued no batched read at all').toBe(5)
    expect(batched).toEqual(direct)
    expect(
      throughRoute[throughRoute.length - 1]?.table,
      'the open-shipment report is not the last read'
    ).toBe('order_shipments')
  })

  it('clears a batch that reads more than the seam, so it is a check and not a refusal', async () => {
    const seam = await seamReadShapes()
    const batch = await loaderReadShapes()

    expect(
      missingReads(seam, [...batch, { table: 'vendors', fields: ['id', 'name'] }])
    ).toEqual([])
  })
})

// ============================================================================
// What leaves the process
// ============================================================================

describe('the response projection', () => {
  it('carries exactly the allow-listed keys and no customer data', async () => {
    // Two assertions of two different strengths, and the second is the real
    // one. The key set is a fact about the fixture as much as about the
    // handler; the recorded PROJECTION is the only place a column-level
    // property is decidable, because it is what the process actually asked the
    // database for. A column we hold is a column that reaches a log, a trace or
    // a crash dump whether or not a handler puts it in a body.
    queueRows(RANKING_FIXTURE)

    const res = await buildApp().request('/api/admin/shipments/ready')
    const body = await readJson(res)

    expect(Object.keys(body.items[0]).sort()).toEqual([
      'blockers',
      'consolidatorVendorId',
      'itemCount',
      'openShipment',
      'orderId',
      'orderNumber',
      'orderStatus',
      'placedAt',
      'ready',
    ])

    // A blocker is projected field by field, so a field added to `LabelBlocker`
    // reaches a screen only when someone adds it here.
    const blocked = body.items.find((row: { blockers: unknown[] }) => row.blockers.length > 0)
    for (const blocker of blocked.blockers) {
      for (const key of Object.keys(blocker)) {
        expect(
          ['code', 'message', 'jobId', 'orderItemId', 'transferId', 'stage'],
          `${key} is not on the blocker allow-list`
        ).toContain(key)
      }
    }

    // And the assertion that is about the QUERY rather than about the fixture:
    // the fixture decides the body's keys, the projection decides what this
    // process ever holds.
    const scan = selects(orders)[0]
    expect(scan?.fields, 'the candidate scan reads orders wholesale').not.toBeNull()
    for (const column of [
      'shippingAddress',
      'guestEmail',
      'guestPhone',
      'userId',
      'total',
      'paymentDetails',
      'internalNotes',
    ]) {
      expect(scan?.fields, `${column} is selected by the ready queue`).not.toContain(column)
    }

    const serialised = JSON.stringify(body)
    for (const internal of ['labelObjectToken', 'costPaise', 'pickupVendorId']) {
      expect(serialised, `${internal} reached the response`).not.toContain(internal)
    }
  })
})

// ============================================================================
// Bounds, refusals and the things a queue must not pretend
// ============================================================================

describe('bounds and refusals', () => {
  it('says so when the backlog is deeper than one scan', async () => {
    // Derived from the constant, never a second literal: a cap raised in the
    // route without this moving is a test that stops testing the cap.
    const rows = Array.from({ length: READY_QUEUE_SCAN_LIMIT + 1 }, (_, i) =>
      orderRow({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        createdAt: new Date(Date.UTC(2026, 7, 1, 0, i)),
      })
    )
    queueRows({
      'select:orders': [rows],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
    })

    const res = await buildApp().request('/api/admin/shipments/ready')
    const body = await readJson(res)

    expect(body.scanTruncated).toBe(true)
    expect(body.total).toBe(READY_QUEUE_SCAN_LIMIT)
    expect(body.scanLimit).toBe(READY_QUEUE_SCAN_LIMIT)

    // The extra row is a truncation probe, not a candidate: it is never
    // evaluated and never ranked.
    expect(selects(orders)[0]?.limit).toBe(READY_QUEUE_SCAN_LIMIT + 1)
  })

  // A note on what a mock can and cannot prove here: the recorder returns every
  // queued row regardless of `.limit`, so `scanTruncated` cannot be falsified by
  // deleting the `+ 1` — the flag stays true because the fixture still hands
  // over 201 rows. What IS falsifiable, and what these two tests assert, is the
  // LIMIT that reached the driver. That is the same reason the ticket asks for
  // PgDialect: a behavioural fixture here would be testing the mock.
  it('bounds the SQL by the scan cap, not by the page size', async () => {
    queueRows({ 'select:orders': [[]] })

    await buildApp().request('/api/admin/shipments/ready?pageSize=5')

    // Ranking by readiness means every candidate is evaluated before a page can
    // be cut, so `pageSize` cannot be pushed down into the LIMIT. Anyone who
    // "optimises" it there gets a page ranked against five rows.
    expect(selects(orders)[0]?.limit).toBe(READY_QUEUE_SCAN_LIMIT + 1)
    expect(selects(orders)[0]?.offset).toBeUndefined()
  })

  it('clamps an oversized pageSize instead of refusing it', async () => {
    queueRows({ 'select:orders': [[]] })

    const res = await buildApp().request('/api/admin/shipments/ready?pageSize=5000')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.pageSize).toBe(100)
  })

  it('clamps a page past the end to a page that EXISTS, not to the cap', async () => {
    // `pageSize` was clamped and `page` was not, so `?page=999999999` echoed
    // 999999999 back beside an empty list — a number that reads to a client as
    // a page it could reach.
    //
    // Round 3 clamped it to `ceil(READY_QUEUE_SCAN_LIMIT / pageSize)`, which is
    // the deepest page a FULL window could hold, and the comment beside it
    // claimed the caller was being "told where the end is". Measured against
    // this fixture that was 10, beside `totalPages: 1` and an empty list — for
    // every queue shallower than the 200-row cap, which is the normal case. A
    // page number that does not exist is exactly what the clamp was added to
    // stop echoing.
    //
    // The bound is the ranking's own length, so the two numbers in the envelope
    // agree by construction. Not a cost fix, and this test says so: the scan is
    // bounded by the cap and not by `page`, so the same batched reads happen
    // either way.
    queueRows({
      'select:orders': [[orderRow()]],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
      'select:order_shipments': [[]],
    })

    const body = await readJson(
      await buildApp().request('/api/admin/shipments/ready?page=999999999&pageSize=50')
    )

    expect(body.pageSize).toBe(50)
    expect(body.totalPages).toBe(1)
    expect(body.page, 'the echoed page is not a page this response has').toBe(1)
    expect(body.page).toBeLessThanOrEqual(body.totalPages)
    expect(body.hasPreviousPage).toBe(false)
  })

  it('pages in ranked order rather than in scan order', async () => {
    queueRows(RANKING_FIXTURE)

    const res = await buildApp().request('/api/admin/shipments/ready?page=2&pageSize=2')
    const body = await readJson(res)

    expect(body.page).toBe(2)
    expect(body.total).toBe(4)
    expect(body.totalPages).toBe(2)
    expect(body.items.map((row: { orderId: string }) => row.orderId)).toEqual([
      ORDER_C,
      ORDER_A,
    ])
  })

  it('rejects a page number that is not one', async () => {
    const res = await buildApp().request('/api/admin/shipments/ready?page=0')
    expect(res.status).toBe(400)
  })

  it('names its one refusal, and says what to do about it', async () => {
    // The only refusal this route produces itself. `zValidator`'s default body
    // is a dump of zod issues — `path`, `code: 'too_small'`, `minimum`, the
    // whole internal shape — which tells the person at the screen nothing they
    // can act on and tells a client to branch on our validator's vocabulary.
    const res = await buildApp().request('/api/admin/shipments/ready?page=0')
    expect(res.status).toBe(400)

    const body = await readJson(res)
    expect(body.code).toBe('READY_QUEUE_QUERY_INVALID')
    expect(body.error, 'the refusal does not say what to send instead').toMatch(/pageSize/)

    const serialised = JSON.stringify(body)
    for (const zodInternal of ['too_small', 'invalid_type', '"path"', 'ZodError']) {
      expect(serialised, `${zodInternal} was narrated to the caller`).not.toContain(zodInternal)
    }
  })

  it('refuses a caller who is not an admin', async () => {
    // The REAL requireAuth/requireAdmin run; only the session is mocked. The
    // second assertion is the one worth having: a 403 that arrives AFTER the
    // scan has run is still a leak of database work, and on this route the scan
    // is the expensive half.
    mockGetSession.mockResolvedValue(adminSessionFor('customer'))

    const res = await buildApp().request('/api/admin/shipments/ready')
    expect(res.status).toBe(403)
    expect(selects(orders)).toHaveLength(0)
  })

  it('tells a failed read nothing about the schema it failed on', async () => {
    recorder.failNext('select:orders')

    const res = await buildApp().request('/api/admin/shipments/ready')
    expect(res.status).toBe(500)

    const body = await readJson(res)
    expect(body).toEqual({ error: 'Failed to build the ready-to-label queue' })

    const serialised = JSON.stringify(body)
    for (const detail of [
      'injected failure',
      'order_shipments',
      'production_jobs',
      'label_object_token',
      'select',
    ]) {
      expect(serialised, `${detail} was narrated to the caller`).not.toContain(detail)
    }
  })

  it('leaves out orders that never need a courier at all', async () => {
    // A gift card buys no physical goods. The SEAM calls such an order ready,
    // and it is right to: it is not waiting on production. It is not waiting on
    // a parcel either, and no label is ever bought for it — so without this it
    // would sit at the TOP of the queue (zero blockers) forever, pushing real
    // work down the page. Readiness is about production; whether there is
    // anything to ship at all is about the order, and that is this scan's
    // question rather than the seam's.
    //
    // `order_type = 'gift_card'` is safe to name in a QUERY, unlike in the
    // index predicate at `schema/orders.ts` — the #580 hazard is a migration
    // using an enum value the same batch added, not a runtime read.
    queueRows({ 'select:orders': [[]] })

    await buildApp().request('/api/admin/shipments/ready')

    const { sql, params } = render(selects(orders)[0]?.where)
    expect(sql).toContain('"orders"."order_type"')
    expect(sql.toLowerCase()).toContain('not in')
    expect(params).toContain('gift_card')
  })

  it('keeps the queue and the ship route reading one list of statuses', async () => {
    // Not a restatement of the constant: this is the assertion that the SQL
    // predicate is built FROM it, so a status added to the tuple appears in the
    // scan without anyone editing the query.
    //
    // Read off the `"orders"."status"` comparison rather than off the flat
    // parameter list, and that is not fussiness. `shipment_status` and
    // `order_status` share four spellings — `cancelled`, `pending`, `delivered`,
    // `failed` — so once the scan started binding `CLOSED_SHIPMENT_STATUSES`
    // the negative half below read `cancelled` in the params and called the
    // ORDER window broken. Both bind the same string; only the column names can
    // tell them apart, which is the same reason `tests/routes/vendor/
    // isolation.test.ts` renders as well as binds.
    queueRows({ 'select:orders': [[]] })

    await buildApp().request('/api/admin/shipments/ready')

    const bound = boundToOrderStatus(render(selects(orders)[0]?.where))
    expect(bound, 'the scan no longer compares orders.status to a bound list').not.toEqual([])

    for (const status of SHIPPABLE_ORDER_STATUSES) {
      expect(bound, `${status} is not in the scanned window`).toContain(status)
    }
    for (const status of ['cancelled', 'delivered', 'shipped', 'pending', 'refunded']) {
      expect(bound, `${status} is inside the scanned window`).not.toContain(status)
    }
  })
})

/**
 * The values compared against `orders.status`, and no others.
 *
 * Pure over a rendered predicate. `sqlToQuery` numbers its placeholders from 1
 * in emission order, so the `$n` inside the `in (...)` that follows the column
 * name index straight into `params`. A scan that read the flat list instead
 * cannot distinguish an order status from a shipment status of the same name.
 */
function boundToOrderStatus(where: RenderedWhere): unknown[] {
  const match = /\"orders\"\.\"status\"\s+in\s+\(([^)]*)\)/i.exec(where.sql)
  if (!match) return []
  return [...(match[1] as string).matchAll(/\$(\d+)/g)].map(
    (placeholder) => where.params[Number(placeholder[1]) - 1]
  )
}

// ============================================================================
// Reaching past the scan window
// ============================================================================
//
// Round 3 of #730, and the defect that produced it. The scan is capped at
// `READY_QUEUE_SCAN_LIMIT` candidates ordered oldest-first, and `page` was
// applied to the ranked list in memory — so once the backlog was deeper than
// the cap, every ready order outside the oldest 200 was unreachable from the
// endpoint whose whole job is to surface them.
//
// The state is not exotic; it is what a stall at the FRONT of the pipeline
// looks like. 200 old orders with no consolidator sit at the head of the scan,
// 50 newer ones are finished at the consolidator and ready to ship, and
// `readyCount` answers 0 at every page. `scanTruncated` named the problem and
// offered no remedy, which is the opposite of what this file does everywhere
// else — `READY_QUEUE_QUERY_HELP` names its remedy in the refusal itself.
//
// The remedy is a keyset cursor over the scan's own `(created_at, id)`
// ordering. It is deliberately NOT a filter: it moves the WINDOW, and every
// clause of `SCAN_CLAUSES` still has to hold with one supplied, which is what
// the last test in this block asserts.

const CURSOR_AT = new Date('2026-08-01T09:00:00.000Z')
const SCAN_CURSOR = `${CURSOR_AT.toISOString()}|${ORDER_A}`

/** 201 candidates, so one request cannot see the end of the backlog. */
function deepBacklog() {
  return Array.from({ length: READY_QUEUE_SCAN_LIMIT + 1 }, (_, i) =>
    orderRow({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      createdAt: new Date(Date.UTC(2026, 7, 1, 0, i)),
    })
  )
}

describe('the scan cursor', () => {
  it('hands back the position the next window starts from when it truncates', async () => {
    const rows = deepBacklog()
    queueRows({
      'select:orders': [rows],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
    })

    const res = await buildApp().request('/api/admin/shipments/ready')
    const body = await readJson(res)

    // The LAST candidate this request actually ranked — not the probe row past
    // the cap, which is read to detect truncation and never evaluated. Starting
    // the next window after the probe would skip it entirely.
    const last = rows[READY_QUEUE_SCAN_LIMIT - 1]!
    expect(body.scanTruncated).toBe(true)
    expect(body.nextScanCursor).toBe(
      `${(last.createdAt as Date).toISOString()}|${last.id}`
    )
  })

  it('hands back no cursor when the whole backlog fitted', async () => {
    // A cursor on an untruncated scan would invite a walk that never ends.
    queueRows({
      'select:orders': [[orderRow()]],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
    })

    const body = await readJson(await buildApp().request('/api/admin/shipments/ready'))
    expect(body.scanTruncated).toBe(false)
    expect(body.nextScanCursor).toBeNull()
  })

  it('turns the cursor into a keyset predicate the database can actually use', async () => {
    queueRows({ 'select:orders': [[]] })

    const res = await buildApp().request(
      `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(SCAN_CURSOR)}`
    )
    expect(res.status).toBe(200)

    const { sql, params } = render(selects(orders)[0]?.where)

    // Both halves, because `created_at` alone is not a total order: two orders
    // placed in the same tick would make the walk either skip one or loop on
    // it. The scan's ORDER BY is `(created_at, id)` and the cursor has to be
    // the same pair.
    expect(sql).toContain('"orders"."created_at"')
    expect(sql).toContain('"orders"."id"')
    expect(params).toContain(ORDER_A)
    expect(
      params.map((value) => (value instanceof Date ? value.toISOString() : value))
    ).toContain(CURSOR_AT.toISOString())
  })

  it('reaches the ready work sitting behind a full window of stalled orders', async () => {
    // The failure this whole block exists for, walked end to end. 201 stalled
    // orders fill the first window; the ready ones are past it. Without a
    // cursor there is no request an admin can make that returns them — `page`
    // is applied to the ranked list in memory, so `page=11` answers `[]`.
    queueRows({
      'select:orders': [deepBacklog()],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
    })

    const first = await readJson(await buildApp().request('/api/admin/shipments/ready'))
    expect(first.readyCount, 'the stalled window is not what this test needs').toBe(
      READY_QUEUE_SCAN_LIMIT
    )
    expect(first.nextScanCursor).toBeTruthy()

    // As deep as `page` can go, which is the deepest page a window can fill:
    // still inside the same 200 stalled orders. `page` walks the ranked list in
    // memory, so there is no page number that reaches past the window — that is
    // the whole reason the cursor below exists.
    const deepest = await readJson(
      await buildApp().request('/api/admin/shipments/ready?page=999999999')
    )
    expect(deepest.page).toBe(READY_QUEUE_SCAN_LIMIT / 20)
    expect(deepest.items.length).toBeGreaterThan(0)
    expect(
      deepest.items.every((row: { orderId: string }) =>
        row.orderId.startsWith('00000000-0000-4000-8000-')
      ),
      'a page reached an order outside the first window'
    ).toBe(true)

    recorder.reset()
    queueRows({
      'select:orders': [[orderRow({ id: ORDER_B, createdAt: new Date('2026-09-01T09:00:00Z') })]],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
    })

    const second = await readJson(
      await buildApp().request(
        `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(first.nextScanCursor)}`
      )
    )

    expect(second.items.map((row: { orderId: string }) => row.orderId)).toEqual([ORDER_B])
    expect(second.scanTruncated).toBe(false)

    // The recorder is blind to a WHERE, so the row above is the fixture's doing
    // and not the database's. What is NOT the fixture's doing is the predicate
    // that reached the driver, which is where the reachability actually lives.
    const bound = render(selects(orders)[0]?.where).params
    expect(bound).toContain(`00000000-0000-4000-8000-${String(199).padStart(12, '0')}`)
  })

  it('refuses a cursor it cannot read, and says what one looks like', async () => {
    // A cursor that is only half-checked reaches `new Date('nonsense')`, binds
    // `Invalid Date`, and Postgres answers with a type error the catch turns
    // into a 500 — a caller's typo reported back to them as our outage. Same
    // reasoning as the uuid guard on this file's `:id` routes.
    const res = await buildApp().request('/api/admin/shipments/ready?scanAfter=yesterday')
    expect(res.status).toBe(400)

    const body = await readJson(res)
    expect(body.code).toBe('READY_QUEUE_QUERY_INVALID')
    expect(body.error, 'the refusal does not name the parameter it refused').toMatch(/scanAfter/)
    expect(selects(orders), 'the malformed cursor reached a query').toHaveLength(0)
  })

  it('refuses a cursor whose id half is thirty-six dashes', async () => {
    // The same length-check-wearing-a-pattern trap the `:id` guard was fixed
    // for: the cursor pattern is built FROM `UUID_PATTERN`, so it inherits the
    // fix rather than re-deriving it.
    const res = await buildApp().request(
      `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(`${CURSOR_AT.toISOString()}|${'-'.repeat(36)}`)}`
    )
    expect(res.status).toBe(400)
  })

  // --------------------------------------------------------------------------
  // Round 3 of #730: the pattern vouched for syntax and called it validation
  // --------------------------------------------------------------------------
  //
  // `READY_QUEUE_CURSOR_PATTERN` spelled the timestamp half as bare `\d{2}`
  // groups, so it matched a string no calendar has a day for. Two different
  // failures came out the other side, and neither was visible to this suite,
  // because the recording database never builds SQL — both requests answered
  // 200 under the mock while the same request against Postgres did something
  // else entirely. So the two tests below assert the REFUSAL, and the third
  // pins what the refusal is for by rendering the predicate the handler would
  // otherwise have built.

  it('refuses a cursor naming a date the calendar does not have', async () => {
    // Month 13, day 45. `\d{2}` matched both. `new Date` answers Invalid Date,
    // which drizzle binds by calling `toISOString()` on it — a RangeError while
    // the query is still being BUILT, caught by the handler and answered as
    // `500 Failed to build the ready-to-label queue`. A caller's typo, reported
    // to them as our outage, from the one guard whose comment says it exists to
    // stop exactly that.
    const res = await buildApp().request(
      `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(`2026-13-45T09:00:00.000Z|${ORDER_A}`)}`
    )

    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.code).toBe('READY_QUEUE_QUERY_INVALID')
    expect(selects(orders), 'the impossible cursor reached a query').toHaveLength(0)
  })

  it('refuses a cursor whose date rolls over into another month', async () => {
    // The quieter half, and the worse one. 2026-02-30 is not a date; JS rolls
    // it forward to 2026-03-02 rather than refusing it, so the keyset floor
    // lands two days after the string the caller sent and every candidate
    // placed in between is dropped from the queue with a 200 and no sign that
    // anything was skipped. The comment on the pattern promised a repeat and
    // never a skip; this is the skip.
    const res = await buildApp().request(
      `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(`2026-02-30T09:00:00.000Z|${ORDER_A}`)}`
    )

    expect(res.status).toBe(400)
    expect(selects(orders), 'the rolled cursor reached a query').toHaveLength(0)
  })

  it('is refusing something real: measured against Date and against drizzle', async () => {
    // The mock is blind to both failures — it answers whatever a test queued
    // and never renders SQL — so this is where the two claims above are
    // actually evidenced, by running the same values through the code that
    // would have consumed them.
    expect(new Date('2026-13-45T09:00:00.000Z').getTime(), 'no longer an Invalid Date').toBeNaN()
    expect(
      new Date('2026-02-30T09:00:00.000Z').toISOString(),
      'no longer rolls forward'
    ).toBe('2026-03-02T09:00:00.000Z')

    // What the handler would have handed the driver. `render` is the same
    // `PgDialect().sqlToQuery` the rest of this suite asserts predicates with.
    expect(() => render(gt(orders.createdAt, new Date('2026-13-45T09:00:00.000Z')))).toThrow(
      RangeError
    )
    expect(render(gt(orders.createdAt, new Date('2026-02-30T09:00:00.000Z'))).params).toEqual([
      '2026-03-02T09:00:00.000Z',
    ])
  })

  it('still accepts the cursors this route hands out, in both spellings', async () => {
    // A check and not a blanket refusal. `formatScanCursor` emits
    // `toISOString()`, so the millisecond form is the one a client copies back;
    // the seconds form and a lower-case `t`/`z` are accepted because they name
    // the same instant, and `new Date` reads all three identically.
    for (const stamp of [
      '2026-08-01T09:00:00.000Z',
      '2026-08-01T09:00:00Z',
      '2026-08-01t09:00:00.000z',
    ]) {
      recorder.reset()
      queueRows({ 'select:orders': [[]] })
      const res = await buildApp().request(
        `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(`${stamp}|${ORDER_A}`)}`
      )
      expect(res.status, `${stamp} was refused`).toBe(200)
    }
  })

  it('moves the window without touching which orders are candidates', async () => {
    // The distinction that makes a cursor legitimate here when `status` and
    // `orderId` filters are refused: a filter changes the DEFINITION of the
    // queue and can show an order `POST /orders/:orderId/ship` would refuse; a
    // cursor changes only where the reading starts. Every clause still holds.
    recorder.reset()
    queueRows({ 'select:orders': [[]] })
    const res = await buildApp().request(
      `/api/admin/shipments/ready?scanAfter=${encodeURIComponent(SCAN_CURSOR)}`
    )
    expect(res.status).toBe(200)

    expect(missingScanClauses(render(selects(orders)[0]?.where))).toEqual([])
  })
})

// ============================================================================
// The candidate scan asks whether there are GOODS, not what the order is called
// ============================================================================
//
// Round 2 of #730. The first version of this scan kept non-shipping orders out
// by `orders.order_type`, and the comment above the clause claimed it asked
// "whether there are goods". It did not, and the gap is not theoretical:
// `routes/cart.ts` writes a cart gift card as an `order_items` row with
// `lineType: 'gift_card'` and a `giftCardPurchase` payload, and
// `routes/orders.ts` then stamps the ORDER `ai_generated` or `regular` and
// never `gift_card` — only the standalone `/gift-cards` flow
// (`routes/gift-cards.ts`) writes that order type. So a gift card bought
// through the cart is a `regular`, `confirmed` order with one gift-card line,
// no production jobs, and no `order_shipments` row anybody will ever open.
//
// The first test runs the SEAM over exactly that shape, so the reason the scan
// carries the clause is executable rather than asserted. The clause check after
// it is the guard, and it is proved able to fail one clause at a time.

describe('an order with nothing to produce', () => {
  it('reads READY to the seam, which is why the scan has to keep it out', () => {
    // Not a restatement of the seam: this CALLS it, over the row shape a cart
    // gift card actually produces. `producibleItems` drops the line
    // (`isGiftCard` ⇒ no required stages, `producibleItems` in `lib/production-readiness.ts`) and
    // there are no jobs, so evaluation takes the `items.length === 0 &&
    // jobs.length === 0` branch and returns ready with an empty blocker list.
    //
    // Fewest-blockers-first then oldest-first puts a row like that at the very
    // TOP of the queue, and nothing ever moves it off: no label is bought, so
    // the live-label clause never excludes it either.
    const verdict = evaluateLabelReadiness({
      orderId: ORDER_A,
      orderExists: true,
      // The order type a CART checkout stamps. This is the whole bug.
      orderType: 'regular',
      items: [{ id: 'line-1', frameId: null, isGiftCard: true }],
      jobs: [],
      transfers: [],
      consolidatorVendorId: null,
    })

    expect(verdict.ready).toBe(true)
    expect(verdict.blockers).toEqual([])
  })
})

/**
 * Every item shape the seam can distinguish, with the SQL column the scan's
 * line clause reads for it.
 *
 * `ORDER_HAS_A_LINE_TO_PRODUCE` asks `order_items.gift_card_purchase is null`,
 * and `ReadinessItem.isGiftCard` is `giftCardPurchase != null` — the same
 * column, on both sides. So the scan's line clause is exactly "the seam has
 * something to produce for this line" for as long as `isGiftCard` is the ONLY
 * thing that makes `requiredStagesFor` return nothing.
 */
const LINE_SHAPES: ReadonlyArray<{ label: string; item: ReadinessItem }> = [
  { label: 'a rolled poster', item: { id: 'l1', frameId: null, isGiftCard: false } },
  { label: 'a framed poster', item: { id: 'l2', frameId: 'frame-1', isGiftCard: false } },
  { label: 'a gift-card line', item: { id: 'l3', frameId: null, isGiftCard: true } },
  { label: 'a framed gift-card line', item: { id: 'l4', frameId: 'frame-1', isGiftCard: true } },
]

/** Pure: the shapes a stage function calls "nothing to produce". */
function shapesWithNothingToProduce(
  stagesFor: (item: ReadinessItem) => readonly unknown[]
): string[] {
  return LINE_SHAPES.filter(({ item }) => stagesFor(item).length === 0)
    .map(({ label }) => label)
    .sort()
}

describe('the line half of the scan and the seam agree on what has nothing to produce', () => {
  it('is the gift-card lines and nothing else', () => {
    // The cross-check the order-type half already has and the line half did
    // not. `NON_PRODUCIBLE_ORDER_TYPES` is IMPORTED into the scan and bound
    // into the SQL, with a test holding the two together; the line half is a
    // second spelling of the same rule in SQL, and the two agree today only
    // because `requiredStagesFor` returns `[]` for exactly `isGiftCard`.
    //
    // Grow a second zero-stage case — a digital download, a service line, a
    // pre-made item we resell — and this goes red. Without it nothing would:
    // the scan would keep letting that order in, the seam would keep calling it
    // ready with nothing to do, and it would sit at rank 1 of the queue
    // forever, which is the failure the clause exists to prevent.
    expect(
      shapesWithNothingToProduce(requiredStagesFor),
      'a line shape other than a gift card now produces nothing — teach ORDER_HAS_A_LINE_TO_PRODUCE about it'
    ).toEqual(['a framed gift-card line', 'a gift-card line'])
  })

  it('CAN fail: it names a second zero-stage shape', () => {
    // The control, over a stage function that treats a frameless line as
    // needing no work. If that ever became true of the real one, the SQL clause
    // would still be asking about `gift_card_purchase` alone.
    expect(
      shapesWithNothingToProduce((item) =>
        item.isGiftCard || item.frameId === null ? [] : ['frame']
      )
    ).toEqual(['a framed gift-card line', 'a gift-card line', 'a rolled poster'])
  })

  it('clears a stage function that produces something for every line', () => {
    expect(shapesWithNothingToProduce(() => ['print'])).toEqual([])
  })
})

/** A predicate as it reached the driver, reduced to what a clause check reads. */
interface RenderedWhere {
  sql: string
  params: unknown[]
}

/**
 * The clauses the candidate scan must carry, each named by the state it keeps
 * out of the queue rather than by the column it mentions.
 *
 * Pure over a rendered predicate — the real one and planted ones alike — because
 * the recording database is blind to a WHERE. A behavioural fixture here would
 * hand the handler whatever rows it queued and prove nothing about which orders
 * Postgres would have returned.
 *
 * The last two are one rule in two halves, and both halves are load-bearing:
 * they are `producibleItems` (`producibleItems` in `lib/production-readiness.ts`) spelled in SQL,
 * clause for clause. Drop the order-type half and a standalone `/gift-cards`
 * order with a stray line enters a queue the seam will always call ready with
 * nothing to do; drop the line half and every cart-bought gift card does.
 */
const SCAN_CLAUSES: ReadonlyArray<{
  name: string
  holds: (where: RenderedWhere) => boolean
}> = [
  {
    name: 'shippable-status',
    holds: (w) =>
      w.sql.includes('"orders"."status"') &&
      SHIPPABLE_ORDER_STATUSES.every((status) => w.params.includes(status)),
  },
  {
    name: 'no-live-label',
    holds: (w) =>
      /not exists/i.test(w.sql) &&
      w.sql.includes('"order_shipments"."voided_at"') &&
      w.sql.includes('"order_shipments"."label_object_token"'),
  },
  {
    // The other half of the same clause, and a separate entry because it went
    // missing on its own. A shipment that was cancelled is over, and the order
    // behind it is work again — see the round-5 test that names the state.
    name: 'cancellation-releases-the-label',
    holds: (w) =>
      w.sql.includes('"order_shipments"."status"') &&
      CLOSED_SHIPMENT_STATUSES.every((status) => w.params.includes(status)),
  },
  {
    name: 'goods-order-type',
    holds: (w) => w.sql.includes('"orders"."order_type"') && w.params.includes('gift_card'),
  },
  {
    name: 'goods-on-a-line',
    holds: (w) =>
      w.sql.includes('"order_items"."order_id"') &&
      w.sql.includes('"order_items"."gift_card_purchase"'),
  },
]

/** Pure: a rendered predicate in, the clauses it does not carry out. */
function missingScanClauses(where: RenderedWhere): string[] {
  return SCAN_CLAUSES.filter((clause) => !clause.holds(where))
    .map((clause) => clause.name)
    .sort()
}

/** The candidate scan's WHERE, as it reached the driver. */
async function renderedScanWhere(): Promise<RenderedWhere> {
  recorder.reset()
  queueRows({ 'select:orders': [[]] })
  const res = await buildApp().request('/api/admin/shipments/ready')
  expect(res.status, 'the queue did not answer, so there is no predicate').toBe(200)
  return render(selects(orders)[0]?.where)
}

/**
 * A rendered predicate carrying all five clauses, written by hand.
 *
 * The corpus every negative control below is planted into. It is deliberately
 * NOT `await renderedScanWhere()`: a control derived from the artefact under
 * test cannot fail independently of it, which is how one missing clause in the
 * route produced five red tests, four of them reporting something they do not
 * check.
 *
 * It is a stand-in and not a second copy of the query — the shapes matter, the
 * exact SQL does not — and the test directly above the plants keeps it honest
 * by asserting it clears the same checker the real predicate clears.
 */
const SYNTHETIC_SCAN_WHERE: RenderedWhere = {
  sql: [
    '"orders"."status" in ($1, $2)',
    'and "orders"."order_type" not in ($3)',
    'and exists (select 1 from "order_items"',
    'where "order_items"."order_id" = "orders"."id"',
    'and "order_items"."gift_card_purchase" is null)',
    'and not exists (select 1 from "order_shipments"',
    'where "order_shipments"."order_id" = "orders"."id"',
    'and "order_shipments"."voided_at" is null',
    'and "order_shipments"."status" not in ($4)',
    'and coalesce("order_shipments"."label_object_token",',
    '"order_shipments"."awb_number", "order_shipments"."tracking_number") is not null)',
  ].join(' '),
  params: ['confirmed', 'processing', 'gift_card', 'cancelled'],
}

describe('the candidate predicate', () => {
  it('keeps an order somebody has already opened a shipment for', async () => {
    // Round 4, undoing round 3's over-correction.
    //
    // Round 2's defect was real: `POST /orders/:orderId/ship` writes an
    // `order_shipments` row with `trackingNumber` optional, `awb_number` and
    // `label_object_token` untouched and status `pending`, so all three columns
    // the live-label clause coalesces are NULL and the order came straight back
    // at rank 1. Ship it again and one order has two rows — the partial unique
    // index deliberately permits any number of UNLABELLED ones (migration
    // 0027) — after which `liveShipmentFor` and `routes/tracking.ts` both
    // resolve `created_at DESC, id DESC` and follow the newest empty row, so an
    // AWB written onto the first is invisible to the customer.
    //
    // Round 3 answered it with a second `not exists` in this predicate, and
    // that was the wrong place. An order with an unlabelled shipment row is
    // still ready-to-label work — no label has been bought, the queue's whole
    // subject — so excluding it deleted the work from the queue permanently,
    // and the way back in that its own doc named (`voided_at`) is written by
    // NOTHING in this repo outside its own column declaration.
    //
    // The exclusion belongs on the WRITE, and it is there now:
    // `POST /orders/:orderId/ship` refuses a second live shipment with
    // `ORDER_ALREADY_HAS_SHIPMENT`, tested below. The queue REPORTS the row.
    const where = await renderedScanWhere()

    expect(
      (where.sql.match(/not exists/gi) ?? []).length,
      'the scan excludes on a second ground again — see the whole comment above'
    ).toBe(1)
    // Deliberately NOT `not.toContain('"order_shipments"."status"')`, which is
    // what this line said in round 4 and what pinned the defect below open. The
    // one exclusion this predicate has must read a shipment's status, because
    // that is the only column that says the shipment is over.
    expect(
      where.sql,
      'the exclusion is not reading the shipment status, so a cancelled row holds its order out forever'
    ).toContain('"order_shipments"."status"')
  })

  it('lets a CANCELLED shipment put its order back in the queue', async () => {
    // Round 5. Round 4 moved the "somebody already opened a shipment" exclusion
    // out of this predicate and onto the write, and left the OTHER clause —
    // `ORDER_HAS_LIVE_LABEL` — testing `voided_at` alone. That is the same
    // defect one clause to the left, and it is reachable by an ordinary
    // afternoon:
    //
    //   1. an admin pastes a carrier handle onto the wrong order, through
    //      `PATCH /api/admin/orders/:id/shipping` or
    //      `POST /api/admin/orders/:id/ship {"trackingNumber": …}`. The row
    //      lands with `voided_at` NULL, so the live-label clause matches and
    //      the order drops out of `/ready`;
    //   2. they follow this file's own documented remedy and cancel it,
    //      `PATCH /api/admin/shipments/:id {"status":"cancelled"}` — which is
    //      what the 409 on the ship route tells them to do;
    //   3. `ORDER_STATUS_FOR_SHIPMENT_STATUS.cancelled` is null, so the order
    //      stays `processing` and still passes the status clause, and
    //      `openShipmentsOf` now reads the row as closed, so the ship route
    //      will happily open another. But a clause that looks only at
    //      `voided_at` still matches, so the order never comes back.
    //
    // There is no way out of that state: nothing in this repo writes
    // `voided_at`, `updateShipmentSchema` has no `awbNumber` field, and the
    // shipping upsert in `routes/admin/orders.ts` MERGES `awbNumber` so it can
    // never be nulled. Ready-to-label work, invisible in the ready-to-label
    // queue, for ever, while the write route says the order is shippable.
    const where = await renderedScanWhere()

    const exclusion = /not exists \([^)]*?"order_shipments"[\s\S]*$/i.exec(where.sql)?.[0] ?? ''
    expect(exclusion, 'there is no order_shipments exclusion to check').not.toBe('')
    expect(
      exclusion,
      'the live-label exclusion never looks at the shipment status'
    ).toContain('"order_shipments"."status"')
    for (const status of CLOSED_SHIPMENT_STATUSES) {
      expect(
        where.params,
        `${status} does not release the order back into the queue`
      ).toContain(status)
    }
  })

  it('lets a voided label put its order back in the queue', async () => {
    // Why the live-label exclusion tests `voided_at` rather than the handle
    // alone: a queue an order can never re-enter is work nobody can find, which
    // is the same defect as a queue it never leaves. Voiding is what a re-buy
    // does, and it is the pair `order_shipments_live_label_idx` is built on.
    //
    // Scoped to the ONE exclusion this predicate now has, and asserted as a
    // conjunct of it rather than by counting occurrences across the whole
    // predicate. Round 3 counted, so deleting an unrelated clause made this
    // test red with the message 'an exclusion forgot its liveness test' — a
    // different failure than the one that had occurred.
    const where = await renderedScanWhere()

    const exclusion = /not exists \([^)]*?"order_shipments"[\s\S]*$/i.exec(where.sql)?.[0] ?? ''
    expect(exclusion, 'there is no order_shipments exclusion to check').not.toBe('')
    expect(
      exclusion,
      'the live-label exclusion forgot its liveness test, so a void cannot undo it'
    ).toContain('"order_shipments"."voided_at" is null')
  })

  it('carries every clause, and the SQL says so', async () => {
    const where = await renderedScanWhere()
    const missing = missingScanClauses(where)

    expect(
      missing,
      missing.length === 0
        ? ''
        : [
            'The ready-to-label scan lost a clause it needs:',
            ...missing.map((name) => `  - ${name}`),
            '',
            'Each one keeps a class of order out of a queue it would never leave.',
          ].join('\n')
    ).toEqual([])
  })

  // One plant per clause, so the check is shown able to fail on each of them
  // rather than on whichever one a single plant happened to touch.
  //
  // Planted onto `SYNTHETIC_SCAN_WHERE` and NOT onto the real predicate, which
  // is a round-3 correction: derived from the real one, every plant inherited
  // whatever the real one was missing, so removing the live-label clause from
  // the route turned FIVE tests red — the one that should have gone and four
  // that reported a different failure than they name. A negative control has to
  // be independent of the thing it is a control for, or it is a second copy of
  // the positive one.
  const PLANTS: ReadonlyArray<{ clause: string; plant: (w: RenderedWhere) => RenderedWhere }> = [
    {
      clause: 'shippable-status',
      plant: (w) => ({ ...w, params: w.params.filter((p) => p !== 'processing') }),
    },
    {
      clause: 'no-live-label',
      plant: (w) => ({
        ...w,
        sql: w.sql.replace(
          /"order_shipments"\."label_object_token"/g,
          '"order_shipments"."awb_number"'
        ),
      }),
    },
    {
      // The plant is the exact round-4 predicate: a live-label exclusion that
      // reads `voided_at` and nothing else. It is the state this clause was
      // added for, so the control and the defect are the same string.
      clause: 'cancellation-releases-the-label',
      plant: (w) => ({
        ...w,
        sql: w.sql.replace(' and "order_shipments"."status" not in ($4)', ''),
        params: w.params.filter((p) => p !== 'cancelled'),
      }),
    },
    {
      clause: 'goods-order-type',
      plant: (w) => ({ ...w, sql: w.sql.replace(/"orders"\."order_type"/g, '"orders"."currency"') }),
    },
    {
      clause: 'goods-on-a-line',
      plant: (w) => ({
        ...w,
        sql: w.sql.replace(/"order_items"\."gift_card_purchase"/g, '"order_items"."frame_id"'),
      }),
    },
  ]

  it('the synthetic stand-in carries every clause, so a plant removes exactly one', () => {
    // The positive control the plants below are subtractions from. Without it a
    // synthetic that had drifted out of shape would make every plant pass for
    // the wrong reason — the clause it removed was already missing.
    expect(missingScanClauses(SYNTHETIC_SCAN_WHERE)).toEqual([])
  })

  for (const { clause, plant } of PLANTS) {
    it(`CAN fail: it names the missing clause when it is ${clause}`, () => {
      expect(missingScanClauses(plant(SYNTHETIC_SCAN_WHERE))).toEqual([clause])
    })
  }

  it('clears a predicate that carries MORE than the five, so it is a check and not a refusal', () => {
    expect(
      missingScanClauses({
        sql: `${SYNTHETIC_SCAN_WHERE.sql} and "orders"."currency" = $9`,
        params: [...SYNTHETIC_SCAN_WHERE.params, 'INR'],
      })
    ).toEqual([])
  })

  it('reads orders.status off the column, not off the flat parameter list', () => {
    // `shipment_status` and `order_status` share four spellings — `cancelled`,
    // `pending`, `delivered`, `failed` — and both are bound in this request:
    // the order window here, the shipment window in the open-shipment read a
    // moment later. A checker reading the flat parameter list cannot tell them
    // apart, and the negative half of `keeps the queue and the ship route
    // reading one list of statuses` (`cancelled` is NOT an order this queue
    // scans) is exactly the assertion that gets it wrong.
    //
    // The synthetic is given a shipment-status comparison on purpose, so the
    // discrimination is exercised rather than assumed.
    const withAShipmentStatus: RenderedWhere = {
      sql: `${SYNTHETIC_SCAN_WHERE.sql} and "order_shipments"."status" not in ($5)`,
      params: [...SYNTHETIC_SCAN_WHERE.params, 'cancelled'],
    }

    expect(boundToOrderStatus(withAShipmentStatus)).toEqual(['confirmed', 'processing'])
    expect(
      boundToOrderStatus(withAShipmentStatus),
      'a shipment status was read as an order status'
    ).not.toContain('cancelled')
  })

  it('CAN fail: it reports nothing when the order-status comparison is gone', () => {
    expect(
      boundToOrderStatus({
        sql: SYNTHETIC_SCAN_WHERE.sql.replace(/"orders"\."status"/g, '"orders"."currency"'),
        params: [...SYNTHETIC_SCAN_WHERE.params],
      })
    ).toEqual([])
  })
})

// ============================================================================
// An order somebody has already opened a shipment for is reported, not hidden
// ============================================================================
//
// The two halves of round 4's answer to the double-shipment defect, in the two
// places they belong:
//
// - the QUEUE keeps the order (no label has been bought, so it is still
//   ready-to-label work) and carries the open row on it, so the screen can say
//   "a shipment is already open" instead of offering a second POST;
// - the WRITE refuses the second row, which is where the exclusion belongs
//   because it is the write that does the damage.
//
// Round 3 put the exclusion in the queue's WHERE instead, which made the work
// vanish from the endpoint whose stated purpose is to surface it, and pointed
// at a `voided_at` remedy nothing in this repo can perform.

const OPEN_SHIPMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

/** One live `order_shipments` row as the queue's report read projects it. */
function openShipmentRow(over: Record<string, unknown> = {}) {
  return {
    id: OPEN_SHIPMENT_ID,
    orderId: ORDER_A,
    status: 'pending',
    createdAt: new Date('2026-08-02T09:00:00Z'),
    ...over,
  }
}

async function queueWithOpenShipment(rows: unknown[]) {
  recorder.reset()
  queueRows({
    'select:orders': [[orderRow()]],
    'select:order_items': [[]],
    'select:production_jobs': [[]],
    'select:order_consolidation': [[]],
    'select:production_transfers': [[]],
    'select:order_shipments': [rows],
  })

  const res = await buildApp().request('/api/admin/shipments/ready')
  expect(res.status).toBe(200)
  return (await readJson(res)) as Record<string, any>
}

describe('the open shipment a candidate already has', () => {
  it('is reported on the row instead of removing the row', async () => {
    const body = await queueWithOpenShipment([openShipmentRow()])

    expect(body.items, 'the order was excluded rather than reported').toHaveLength(1)
    expect(body.items[0].orderId).toBe(ORDER_A)
    expect(body.items[0].openShipment).toEqual({
      id: OPEN_SHIPMENT_ID,
      status: 'pending',
    })
  })

  it('is null for an order nobody has opened one for', async () => {
    // `null` rather than an absent key: a screen branching on `openShipment`
    // must be able to tell "no open shipment" from "this build of the API does
    // not answer that question".
    const body = await queueWithOpenShipment([])

    expect(body.items[0].openShipment).toBeNull()
  })

  it('carries no carrier handle and no label token onto the queue', async () => {
    // The row is a POINTER — enough to name the shipment and say what state it
    // is in, so an admin can go and act on it. Everything else about the
    // shipment belongs to `GET /api/admin/shipments/:id`, which is one order at
    // a time. A queue carrying 200 shipments' tracking numbers and label tokens
    // is a PII surface with no job to do.
    const body = await queueWithOpenShipment([
      openShipmentRow({
        trackingNumber: 'AWB-LEAK-1',
        labelObjectToken: 'lbl_leak',
        carrier: 'Shiprocket',
      }),
    ])

    expect(Object.keys(body.items[0].openShipment).sort()).toEqual(['id', 'status'])
    const serialised = JSON.stringify(body)
    for (const leak of ['AWB-LEAK-1', 'lbl_leak', 'labelObjectToken', 'costPaise']) {
      expect(serialised, `${leak} reached the queue`).not.toContain(leak)
    }
  })

  it('reads order_shipments once for the whole page, not once per order', async () => {
    queueRows({
      ...RANKING_FIXTURE,
      'select:order_shipments': [[openShipmentRow()]],
    })

    await buildApp().request('/api/admin/shipments/ready')

    const reads = selects(orderShipments)
    expect(reads, 'the report read is per order, not per page').toHaveLength(1)

    const { sql, params } = render(reads[0]?.where)
    expect(sql.toLowerCase()).toContain(' in (')
    for (const id of [ORDER_A, ORDER_B, ORDER_C, ORDER_D]) {
      expect(params, `${id} was not bound in the report read`).toContain(id)
    }
  })

  it('asks only about shipments that are still live, and the SQL says so', async () => {
    // The same two conditions the write-side refusal uses, so the queue's
    // report and the ship route's refusal cannot disagree about what "open"
    // means: not voided, and not in a status that ends a shipment.
    queueRows({
      'select:orders': [[orderRow()]],
      'select:order_items': [[]],
      'select:production_jobs': [[]],
      'select:order_consolidation': [[]],
      'select:production_transfers': [[]],
      'select:order_shipments': [[]],
    })

    await buildApp().request('/api/admin/shipments/ready')

    const { sql, params } = render(selects(orderShipments)[0]?.where)
    expect(sql).toContain('"order_shipments"."voided_at"')
    expect(sql).toContain('"order_shipments"."status"')
    for (const status of CLOSED_SHIPMENT_STATUSES) {
      expect(params, `${status} does not release the order`).toContain(status)
    }
  })

  it('issues no report read when nothing is a candidate', async () => {
    recorder.reset()
    queueRows({ 'select:orders': [[]] })

    await buildApp().request('/api/admin/shipments/ready')

    expect(selects(orderShipments)).toHaveLength(0)
  })

  it('reports the newest OPEN row when legacy data left two on one order', async () => {
    // Legacy data can hold two open rows on one order — the write refusal is
    // new and the partial unique index never forbade it — so the read has to
    // pick one, and it picks the newest, which is the row an admin acting on
    // this order will meet.
    //
    // **It used to claim it picked "the row the customer tracking page would
    // follow", and that was false.** This read filters through
    // `openShipmentsOf`, which excludes `cancelled`; `liveShipmentForOrder`
    // (`routes/tracking.ts`) and `liveShipmentFor`
    // (`services/notifications.ts`) filter on `voided_at IS NULL` alone. Give
    // one order a pending row at 09:00 and a cancelled one at 10:00 and the two
    // name different shipments — the exact "reconcile the wrong row" harm the
    // old sentence claimed to prevent. The divergence is real, it is the
    // customer-facing read's to fix, and it is pinned by the test below rather
    // than described here.
    const older = openShipmentRow({ id: OPEN_SHIPMENT_ID, createdAt: new Date('2026-08-01T09:00:00Z') })
    const newer = openShipmentRow({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      status: 'label_created',
      createdAt: new Date('2026-08-05T09:00:00Z'),
    })

    // Handed over newest-first, which is the order the read asks for.
    const body = await queueWithOpenShipment([newer, older])

    expect(body.items[0].openShipment.id).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff')

    // Rendered term by term, because the read now has three keys and the first
    // of them is the `DISTINCT ON` column: reading only the first would report
    // `order_id asc` about a read whose whole point is the two after it.
    const ordering = (selects(orderShipments)[0]?.orderByTerms ?? []).map((term) =>
      render(term).sql.toLowerCase()
    )

    expect(ordering[0], 'the collapse column does not lead the ordering').toContain(
      '"order_shipments"."order_id"'
    )
    expect(ordering.join(' | '), 'the newest row per order is not the one kept').toContain(
      '"order_shipments"."created_at" desc'
    )
  })

  it('and the customer-facing read can still follow a row this one hides — pinned, not fixed', () => {
    // The deferral, made executable rather than left as prose. The day
    // `routes/tracking.ts` starts filtering on the shipment status too, this
    // goes red and the caveat in the route's comment gets deleted with it — a
    // comment describing a divergence somebody has since closed is worse than
    // no comment at all.
    //
    // Sliced to the function body so a `status` in the customer PROJECTION
    // (`trackingPayloadForOrder` returns one) is not read as a filter.
    const source = stripComments(readSource('routes/tracking.ts'))
    const body = /export async function liveShipmentForOrder[\s\S]*?\n}/.exec(source)?.[0] ?? ''

    expect(body, 'the customer-facing live-shipment read was not found').toContain('voidedAt')
    expect(
      body,
      'routes/tracking.ts now filters on the shipment status: delete this pin and the caveat it stands for'
    ).not.toContain('status')
  })

  it('bounds the report read to one row per candidate order', async () => {
    // A read scoped to 200 ids and no LIMIT is not bounded, it is bounded by
    // luck: nothing stops one order carrying a hundred open rows, and the page
    // pays for every one of them.
    //
    // The bound is exact rather than generous, because a generous one would be
    // worse than none here. This read is ordered so the newest row per order
    // wins; truncating it would drop whole orders off the end and report
    // `openShipment: null` for an order that has one — a silent wrong answer,
    // which is the failure a cap is supposed to prevent. `DISTINCT ON
    // (order_id)` makes one row per order a fact of the SQL, so `LIMIT` can be
    // the number of ids asked about and can never cut anything.
    queueRows({
      ...RANKING_FIXTURE,
      'select:order_shipments': [[openShipmentRow()]],
    })

    await buildApp().request('/api/admin/shipments/ready')

    const read = selects(orderShipments)[0]
    expect(read?.distinctOn, 'the read does not collapse to one row per order').toContain(
      'order_shipments.order_id'
    )
    expect(read?.limit, 'the report read is unbounded').toBe(4)
  })
})

// ============================================================================
// The other half: the write refuses the second shipment
// ============================================================================
//
// ============================================================================
//
// `POST /orders/:orderId/ship` no longer opens a row here: since #729 it
// delegates to `lib/shipment-dispatch.ts`, which refuses a second live label
// (`ORDER_HAS_LIVE_LABEL`) or an in-flight claim (`LABEL_PURCHASE_IN_PROGRESS`)
// under the same lock it takes readiness through, and claims the newest open
// unlabelled row rather than opening another. The queue still reports the
// open row on `ReadyQueueItem.openShipment`; the write's half of the pairing
// is proved in `tests/lib/shipment-dispatch.test.ts` (which pins the claim's
// read to the queue's ordering) and `tests/routes/admin/shipments-ship.test.ts`.
//

// ============================================================================
// The rows go back on the order they came from
// ============================================================================
//
// Round 2 of #730, and the defect that produced it: three of the four batched
// reads were never handed a single row by any test, so the regrouping the whole
// batching design rests on was unverified. `items: []` and `transfers: []`
// could both be hard-coded in the loader and the suite stayed green.
//
// These fixtures feed all four tables and assert a verdict that is DIFFERENT
// per order and different from what a broken regrouping would produce:
//
//   A: two lines, three job rows collapsing to two jobs, a consolidator, and a
//      parcel that has been dispatched and not received  → transfer_in_flight
//   B: one line, two job rows, the same consolidator, and NO transfer at all
//      → goods_not_at_consolidator
//   C: two lines and nothing else — no job, no consolidator, no parcel
//      → no_jobs + no_consolidator
//
// Group the job rows on the wrong key and A and B read `jobs: []`, take the
// nothing-to-produce branch and come back ready. Fail to collapse the two rows
// of `job-a-print` and A gets the same blocker twice. Lose the transfer rows
// and A's parcel-in-transit is reported as a parcel that has already left.
//
// C is there for the fourth map, and it is the one case where the item rows
// change a verdict on their own: an order with lines and no jobs is `no_jobs`,
// and an order with NEITHER is ready. Lose the item regrouping and C is an
// order nobody has started sitting at the top of the ready queue — measured,
// not supposed: with `items: itemsByOrder.get(...)` replaced by `items: []` the
// A and B assertions above still pass and only C goes red.

const VENDOR_PRINTER = '11111111-1111-4111-8111-111111111111'
const VENDOR_CONSOLIDATOR = '22222222-2222-4222-8222-222222222222'
const FRAME_ID = '33333333-3333-4333-8333-333333333333'
const DISPATCHED_AT = new Date('2026-08-02T10:00:00Z')

/**
 * One `order_items` row as the BATCHED loader projects it.
 *
 * `giftCardPurchase: null` is the default because these are goods; a row with a
 * payload here is what the scan's `goods-on-a-line` clause exists to keep out,
 * and it is asserted against the SQL rather than through a fixture, because the
 * recorder answers with whatever was queued regardless of the WHERE.
 */
function itemRow(over: Record<string, unknown> = {}) {
  return { orderId: ORDER_A, id: 'item-a1', frameId: null, giftCardPurchase: null, ...over }
}

/** One `order_consolidation` row. */
function consolidationRow(over: Record<string, unknown> = {}) {
  return { orderId: ORDER_A, vendorId: VENDOR_CONSOLIDATOR, ...over }
}

/**
 * One `production_transfers` × `production_transfer_jobs` row.
 *
 * Dispatched and not received, to the consolidator: the in-flight state. The
 * three timestamps are the whole of a transfer's state — there is no transfer
 * status enum to mirror (`ReadinessTransfer` in `lib/production-readiness.ts`).
 */
function transferRow(over: Record<string, unknown> = {}) {
  return {
    orderId: ORDER_A,
    id: 'tr-a',
    toVendorId: VENDOR_CONSOLIDATOR,
    dispatchedAt: DISPATCHED_AT,
    receivedAt: null,
    lostAt: null,
    jobId: 'job-a-print',
    ...over,
  }
}

const GROUPING_FIXTURE = {
  'select:orders': [
    [
      orderRow({ id: ORDER_A, itemCount: 2, createdAt: new Date('2026-08-01T09:00:00Z') }),
      orderRow({ id: ORDER_B, itemCount: 1, createdAt: new Date('2026-08-01T10:00:00Z') }),
      orderRow({ id: ORDER_C, itemCount: 2, createdAt: new Date('2026-08-01T11:00:00Z') }),
    ],
  ],
  'select:order_items': [
    [
      itemRow({ orderId: ORDER_A, id: 'item-a1', frameId: FRAME_ID }),
      itemRow({ orderId: ORDER_A, id: 'item-a2', frameId: null }),
      itemRow({ orderId: ORDER_B, id: 'item-b1', frameId: FRAME_ID }),
      itemRow({ orderId: ORDER_C, id: 'item-c1', frameId: null }),
      itemRow({ orderId: ORDER_C, id: 'item-c2', frameId: null }),
    ],
  ],
  'select:production_jobs': [
    [
      // Two rows, ONE job: `job-a-print` covers both of A's lines.
      jobRow({
        orderId: ORDER_A,
        id: 'job-a-print',
        stage: 'print',
        status: 'dispatched',
        vendorId: VENDOR_PRINTER,
        assignedAt: DISPATCHED_AT,
        orderItemId: 'item-a1',
      }),
      jobRow({
        orderId: ORDER_A,
        id: 'job-a-print',
        stage: 'print',
        status: 'dispatched',
        vendorId: VENDOR_PRINTER,
        assignedAt: DISPATCHED_AT,
        orderItemId: 'item-a2',
      }),
      jobRow({
        orderId: ORDER_A,
        id: 'job-a-frame',
        stage: 'frame',
        status: 'qc_passed',
        vendorId: VENDOR_CONSOLIDATOR,
        assignedAt: DISPATCHED_AT,
        orderItemId: 'item-a1',
      }),
      jobRow({
        orderId: ORDER_B,
        id: 'job-b-print',
        stage: 'print',
        status: 'dispatched',
        vendorId: VENDOR_PRINTER,
        assignedAt: DISPATCHED_AT,
        orderItemId: 'item-b1',
      }),
      jobRow({
        orderId: ORDER_B,
        id: 'job-b-frame',
        stage: 'frame',
        status: 'qc_passed',
        vendorId: VENDOR_CONSOLIDATOR,
        assignedAt: DISPATCHED_AT,
        orderItemId: 'item-b1',
      }),
    ],
  ],
  'select:order_consolidation': [
    [
      consolidationRow({ orderId: ORDER_A }),
      consolidationRow({ orderId: ORDER_B }),
    ],
  ],
  // A's parcel only. B has none, and that difference is the assertion.
  'select:production_transfers': [[transferRow({ orderId: ORDER_A })]],
}

/** The snapshot order A's rows are supposed to regroup into. */
const SNAPSHOT_A: OrderProductionSnapshot = {
  orderId: ORDER_A,
  orderExists: true,
  orderType: 'regular',
  items: [
    { id: 'item-a1', frameId: FRAME_ID, isGiftCard: false },
    { id: 'item-a2', frameId: null, isGiftCard: false },
  ],
  jobs: [
    {
      id: 'job-a-print',
      stage: 'print',
      status: 'dispatched',
      vendorId: VENDOR_PRINTER,
      assignedAt: DISPATCHED_AT,
      orderItemIds: ['item-a1', 'item-a2'],
      replacesJobId: null,
    },
    {
      id: 'job-a-frame',
      stage: 'frame',
      status: 'qc_passed',
      vendorId: VENDOR_CONSOLIDATOR,
      assignedAt: DISPATCHED_AT,
      orderItemIds: ['item-a1'],
      replacesJobId: null,
    },
  ],
  transfers: [
    {
      id: 'tr-a',
      toVendorId: VENDOR_CONSOLIDATOR,
      dispatchedAt: DISPATCHED_AT,
      receivedAt: null,
      lostAt: null,
      jobIds: ['job-a-print'],
    },
  ],
  consolidatorVendorId: VENDOR_CONSOLIDATOR,
}

/**
 * B is A minus the parcel, and that is the whole of the difference.
 *
 * Same statuses, same consolidator, same coverage — so any blocker the two
 * orders do NOT share is the transfer map's doing and nothing else's. Making
 * the two snapshots differ in more than one place would have left every
 * disagreement with more than one explanation.
 */
const SNAPSHOT_B: OrderProductionSnapshot = {
  orderId: ORDER_B,
  orderExists: true,
  orderType: 'regular',
  items: [{ id: 'item-b1', frameId: FRAME_ID, isGiftCard: false }],
  jobs: [
    {
      id: 'job-b-print',
      stage: 'print',
      status: 'dispatched',
      vendorId: VENDOR_PRINTER,
      assignedAt: DISPATCHED_AT,
      orderItemIds: ['item-b1'],
      replacesJobId: null,
    },
    {
      id: 'job-b-frame',
      stage: 'frame',
      status: 'qc_passed',
      vendorId: VENDOR_CONSOLIDATOR,
      assignedAt: DISPATCHED_AT,
      orderItemIds: ['item-b1'],
      replacesJobId: null,
    },
  ],
  transfers: [],
  consolidatorVendorId: VENDOR_CONSOLIDATOR,
}

/**
 * Two unframed posters and nothing made for them yet.
 *
 * No job, no consolidator, no parcel — the shape the item map is the only thing
 * standing between and a false `ready: true`.
 */
const SNAPSHOT_C: OrderProductionSnapshot = {
  orderId: ORDER_C,
  orderExists: true,
  orderType: 'regular',
  items: [
    { id: 'item-c1', frameId: null, isGiftCard: false },
    { id: 'item-c2', frameId: null, isGiftCard: false },
  ],
  jobs: [],
  transfers: [],
  consolidatorVendorId: null,
}

/**
 * One row of the response, typed to the fields these tests read.
 *
 * Deliberately not the route's own `ReadyQueueItem`: that type is not exported,
 * and importing it would make the shape of the response true by construction on
 * the side of the boundary that decides it. This is what a client sees.
 */
type QueueRow = {
  orderId: string
  ready: boolean
  consolidatorVendorId: string | null
  blockers: Array<{ code: string; message: string; jobId?: string; transferId?: string }>
}

/**
 * One request against `GROUPING_FIXTURE`, unwrapped to its rows.
 *
 * Every test below finds its order BY ID rather than by position, so none of
 * them accidentally asserts the ranking a second time — the ranking has its own
 * describe, and a grouping test that broke when the sort changed would send the
 * next reader to the wrong file.
 */
async function readyQueueRows(): Promise<QueueRow[]> {
  queueRows(GROUPING_FIXTURE)
  const res = await buildApp().request('/api/admin/shipments/ready')
  expect(res.status).toBe(200)
  const body = await readJson(res)
  return body.items as QueueRow[]
}

describe('regrouping the batched rows', () => {
  it('gives each order its own items, jobs, transfers and consolidator', async () => {
    // The strongest form this assertion has: the response is compared against
    // the SEAM's verdict over the snapshot the rows are supposed to regroup
    // into, order by order. Every one of the four maps has to be right for both
    // sides to agree, and none of the four can be replaced by a constant.
    const rows = await readyQueueRows()

    for (const snapshot of [SNAPSHOT_A, SNAPSHOT_B, SNAPSHOT_C]) {
      const expected = evaluateLabelReadiness(snapshot)
      const row = rows.find((r) => r.orderId === snapshot.orderId)

      expect(row, `order ${snapshot.orderId} is missing from the queue`).toBeDefined()
      expect(row!.ready).toBe(expected.ready)
      expect(row!.consolidatorVendorId).toBe(expected.consolidatorVendorId)
      expect(row!.blockers.map((b) => b.message)).toEqual(
        expected.blockers.map((b) => b.message)
      )
    }
  })

  it('reports a parcel in transit as in transit, and a missing one as gone', async () => {
    // Named separately from the agreement test above because these are the two
    // states the transfer map decides between, and they are the two an admin
    // acts on differently: one is "wait", the other is "something is wrong".
    const rows = await readyQueueRows()
    const a = rows.find((r) => r.orderId === ORDER_A)!
    const b = rows.find((r) => r.orderId === ORDER_B)!

    expect(a.blockers.map((blocker) => blocker.code)).toEqual(['transfer_in_flight'])
    expect(a.blockers[0]?.transferId).toBe('tr-a')
    expect(a.blockers[0]?.jobId).toBe('job-a-print')

    // Same job status, same consolidator, no transfer row: the seam reads that
    // as goods that have already left. Lose the transfer regrouping and A says
    // this too, which is a parcel in a van being reported as delivered to a
    // courier.
    expect(b.blockers.map((blocker) => blocker.code)).toEqual(['goods_not_at_consolidator'])
    expect(b.blockers[0]?.jobId).toBe('job-b-print')
  })

  it('collapses the rows of one job into one job, not one per covered line', async () => {
    // `job-a-print` arrives as two rows because it covers two lines. Not
    // collapsing them means two `dispatched` jobs where there is one, and the
    // order is reported blocked twice on the same parcel.
    const rows = await readyQueueRows()
    const a = rows.find((r) => r.orderId === ORDER_A)!

    expect(a.blockers).toHaveLength(1)
  })

  it('carries the covered lines onto the job, so a covered item is not reported uncovered', async () => {
    // The `orderItemIds` accumulation is only visible through `item_uncovered`:
    // drop it and both of A's lines report a missing print job while the print
    // job sits right there in the same response.
    const rows = await readyQueueRows()
    const a = rows.find((r) => r.orderId === ORDER_A)!

    expect(a.blockers.map((blocker) => blocker.code)).not.toContain('item_uncovered')
  })

  it('blocks an order whose lines nobody has started, rather than calling it ready', async () => {
    // The item map's own falsification, and the reason it has one: with
    // `items` hard-coded empty, C has no items and no jobs, takes the seam's
    // "nothing to produce" branch and comes back READY with no blockers —
    // which, sorted fewest-blockers-then-oldest, is the TOP of the queue. An
    // order nobody has printed, offered to an admin as the next thing to ship.
    const rows = await readyQueueRows()
    const c = rows.find((r) => r.orderId === ORDER_C)!

    expect(c.ready).toBe(false)
    expect(c.blockers.map((blocker) => blocker.code).sort()).toEqual([
      'no_consolidator',
      'no_jobs',
    ])
  })

  it('gives an order with no consolidation row a null consolidator', async () => {
    // The other side of the consolidator map. Feeding a row for A only proves
    // the map is keyed on the order rather than filled in for everybody.
    queueRows({
      ...GROUPING_FIXTURE,
      'select:order_consolidation': [[consolidationRow({ orderId: ORDER_A })]],
    })

    const res = await buildApp().request('/api/admin/shipments/ready')
    const body = await readJson(res)
    const rows = body.items as QueueRow[]

    expect(rows.find((r) => r.orderId === ORDER_A)!.consolidatorVendorId).toBe(
      VENDOR_CONSOLIDATOR
    )
    expect(rows.find((r) => r.orderId === ORDER_B)!.consolidatorVendorId).toBeNull()
  })
})

// ============================================================================
// One loader, one set of collapse rules
// ============================================================================
//
// Round 3 of #730, and the hole it closes. The batched loader used to live in
// `routes/admin/shipments.ts` and hand-copy the seam's module-private
// `collapseJobRows` / `collapseTransferRows`. Nothing compared the two: the
// parity scan above reads tables and projection aliases, `the seam filters on
// the order id alone` reads bound parameters, and `regrouping the batched rows`
// compares the route against `evaluateLabelReadiness(SNAPSHOT_A)` — a constant
// written by hand in THIS file, which cannot move when the seam moves.
//
// The concrete drift that would have gone unseen: make a replacement job
// (`replacesJobId` set) inherit the original's `orderItemIds` in the seam, and
// the order-detail readiness panel picks it up while this queue does not — two
// admin screens disagreeing about the same order, every test green.
//
// The fix is not a better guard, it is deleting the duplicate:
// `loadOrderProductionSnapshots` now lives in `lib/production-readiness.ts`
// beside the collapse functions and calls them. The two tests below are what
// keep it that way — one proves the two loaders answer identically over the
// same rows, the other proves the route has not grown a second collapse.

/**
 * One order's five reads, shaped so BOTH loaders can be driven off them.
 *
 * Order A alone, because the recording database is blind to a WHERE: the
 * per-order loader would otherwise be handed B's and C's rows too and the two
 * snapshots would differ for a reason that is not drift.
 *
 * Every row carries `orderId`, which only the batched projection asks for — the
 * per-order loader reads the keys it named and ignores the rest, so one fixture
 * feeds both. `job-a-redo` carries `replacesJobId`, so the one collapse rule
 * the round-2 guards could not see is exercised on both sides.
 */
const ORDER_A_ROWS = {
  'select:orders': [[{ id: ORDER_A, orderType: 'regular' }]],
  'select:order_items': [
    [
      itemRow({ orderId: ORDER_A, id: 'item-a1', frameId: FRAME_ID }),
      itemRow({ orderId: ORDER_A, id: 'item-a2', frameId: null }),
    ],
  ],
  'select:production_jobs': [
    [
      // Two rows, one job: the fan-out `collapseJobRows` exists to undo.
      jobRow({ orderId: ORDER_A, id: 'job-a-print', orderItemId: 'item-a1' }),
      jobRow({ orderId: ORDER_A, id: 'job-a-print', orderItemId: 'item-a2' }),
      // The same item twice on one job, which the dedupe has to swallow.
      jobRow({ orderId: ORDER_A, id: 'job-a-print', orderItemId: 'item-a1' }),
      jobRow({
        orderId: ORDER_A,
        id: 'job-a-redo',
        stage: 'print',
        status: 'draft',
        replacesJobId: 'job-a-print',
        orderItemId: 'item-a1',
      }),
      // A job nobody has attached an item to yet: `orderItemId` null, and the
      // job still has to exist on both sides.
      jobRow({ orderId: ORDER_A, id: 'job-a-frame', stage: 'frame', orderItemId: null }),
    ],
  ],
  'select:order_consolidation': [[consolidationRow({ orderId: ORDER_A })]],
  'select:production_transfers': [
    [
      transferRow({ orderId: ORDER_A, id: 'tr-a', jobId: 'job-a-print' }),
      // Two jobs on one parcel, and one of them repeated.
      transferRow({ orderId: ORDER_A, id: 'tr-a', jobId: 'job-a-frame' }),
      transferRow({ orderId: ORDER_A, id: 'tr-a', jobId: 'job-a-print' }),
    ],
  ],
}

/** Drives one loader over `ORDER_A_ROWS` from a clean recorder. */
async function snapshotFrom(
  load: (reader: ProductionReader) => Promise<OrderProductionSnapshot | undefined>
): Promise<OrderProductionSnapshot | undefined> {
  recorder.reset()
  queueRows(ORDER_A_ROWS)
  return load(recorder.db as unknown as ProductionReader)
}

describe('one loader, one set of collapse rules', () => {
  it('answers exactly what the seam’s own per-order loader answers', async () => {
    const perOrder = await snapshotFrom((reader) =>
      loadOrderProductionSnapshot(ORDER_A, reader)
    )
    const batched = await snapshotFrom(async (reader) =>
      (await loadOrderProductionSnapshots([ORDER_A], reader)).get(ORDER_A)
    )

    // Vacuity first: two snapshots built from nothing are equal and prove
    // nothing. Every collection the collapse rules touch has to be non-trivial
    // before the comparison below means anything.
    expect(perOrder?.items).toHaveLength(2)
    expect(perOrder?.jobs).toHaveLength(3)
    expect(perOrder?.transfers).toHaveLength(1)
    expect(perOrder?.consolidatorVendorId).toBe(VENDOR_CONSOLIDATOR)

    expect(batched).toEqual(perOrder)
  })

  it('collapses, dedupes and carries `replacesJobId` the same way on both sides', async () => {
    // Named separately from the equality above because equality alone would
    // still hold if BOTH sides collapsed wrongly in the same way. These are the
    // three rules themselves, asserted against the rows that exercise them.
    const batched = await snapshotFrom(async (reader) =>
      (await loadOrderProductionSnapshots([ORDER_A], reader)).get(ORDER_A)
    )

    const print = batched?.jobs.find((job) => job.id === 'job-a-print')
    expect(print?.orderItemIds, 'the repeated item row was not deduped').toEqual([
      'item-a1',
      'item-a2',
    ])

    const redo = batched?.jobs.find((job) => job.id === 'job-a-redo')
    expect(redo?.replacesJobId, 'the replacement lost its original').toBe('job-a-print')
    expect(
      redo?.orderItemIds,
      'the replacement inherited the original’s items'
    ).toEqual(['item-a1'])

    const frame = batched?.jobs.find((job) => job.id === 'job-a-frame')
    expect(frame?.orderItemIds, 'a job with no item row was dropped').toEqual([])

    expect(batched?.transfers[0]?.jobIds).toEqual(['job-a-print', 'job-a-frame'])
  })

  it('gives every id it was asked about an entry, including one no order row came back for', async () => {
    // The route indexes the map by candidate id. A missing entry there is a
    // `TypeError` at best; the seam's own answer for an id with no row is
    // `orderExists: false`, which blocks — the safe direction — so the batch
    // has to produce that rather than nothing.
    recorder.reset()
    queueRows(ORDER_A_ROWS)
    const snapshots = await loadOrderProductionSnapshots(
      [ORDER_A, ORDER_B],
      recorder.db as unknown as ProductionReader
    )

    expect([...snapshots.keys()].sort()).toEqual([ORDER_A, ORDER_B].sort())
    expect(snapshots.get(ORDER_B)?.orderExists).toBe(false)
    expect(evaluateLabelReadiness(snapshots.get(ORDER_B)!).blockers.map((b) => b.code)).toEqual([
      'order_not_found',
    ])
  })

  it('issues no read at all when it is asked about nothing', async () => {
    // `inArray(col, [])` renders `false`, so these would be five correct
    // queries that cannot return anything. Correct is not worth issuing.
    recorder.reset()
    const snapshots = await loadOrderProductionSnapshots(
      [],
      recorder.db as unknown as ProductionReader
    )

    expect(snapshots.size).toBe(0)
    expect(recorder.queries).toHaveLength(0)
  })
})

// ============================================================================
// The claims this file makes about itself
// ============================================================================

const readSource = (relative: string) =>
  readFileSync(resolve(__dirname, '../../../src', relative), 'utf8')

/** Source with every comment removed, so a scan judges CODE and not prose. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Every place a file ASKS the production seam whether an order can be labelled.
 *
 * Comments are stripped first: the header of `routes/admin/shipments.ts` has to
 * name these functions to say where the verdict comes from, and a scan that
 * could not tell prose from code would push that explanation out of the file to
 * stay green.
 */
function readinessCallSites(source: string): string[] {
  return [
    ...stripComments(source).matchAll(
      /\b(evaluateLabelReadiness|getOrderLabelReadiness|isOrderReadyToLabel)\s*\(/g
    ),
  ].map((match) => match[1] as string)
}

describe('the readiness verdict is asked for in exactly one place', () => {
  it('is asked once, by the queue, and by nothing else in the file', () => {
    // The header used to describe `POST /orders/:orderId/ship` as "the gate"
    // asking the same question as this queue. It does not: it tests the status
    // list and nothing else. Reading a claim like that at 2am, after a label
    // was bought for an order the queue showed blocked, sends the reader to
    // hunt a bug in the seam over a state the header said was impossible.
    //
    // The header now says what is true, and this is what keeps it true: add the
    // gate to the ship route and this goes red, which is the prompt to rewrite
    // the paragraph rather than leave it stale in the other direction.
    const found = readinessCallSites(readSource('routes/admin/shipments.ts'))

    expect(
      found,
      found.length === 1
        ? ''
        : [
            `routes/admin/shipments.ts asks the readiness seam ${found.length} times: ${found.join(', ')}`,
            '',
            'Its header says the verdict is asked once, by GET /ready, and that',
            'POST /orders/:orderId/ship checks the status list alone. Update that',
            'paragraph in the same change that moves this number.',
          ].join('\n')
    ).toEqual(['evaluateLabelReadiness'])
  })

  it('CAN fail: it counts a second call site', () => {
    expect(
      readinessCallSites(
        'const r = evaluateLabelReadiness(s)\nif (await isOrderReadyToLabel(id)) { ship() }\n'
      )
    ).toEqual(['evaluateLabelReadiness', 'isOrderReadyToLabel'])
  })

  it('does not count a name that only appears in prose', () => {
    expect(
      readinessCallSites(
        '// isOrderReadyToLabel( is named here\n/* and getOrderLabelReadiness( here */\nconst x = 1\n'
      )
    ).toEqual([])
  })
})

/**
 * Every place a file assembles one of the seam's COLLAPSED row types by hand.
 *
 * `orderItemIds` and `jobIds` are the two fields that only exist after a
 * fan-out join has been regrouped — `production_jobs` and `production_transfers`
 * have no such column. A `:` after either name in code is therefore a literal
 * being built, which is a second implementation of `collapseJobRows` /
 * `collapseTransferRows` however it is spelled.
 *
 * Pure over a corpus, and comments are stripped first: the route's header has
 * to name both fields to explain where its snapshots come from, and a scan that
 * could not tell prose from code would push that explanation out of the file to
 * stay green.
 */
function handRolledCollapse(source: string): string[] {
  const code = stripComments(source)
  return ['jobIds', 'orderItemIds']
    .filter((field) => new RegExp(`\\b${field}\\s*:`).test(code))
    .sort()
}

describe('the collapse rules have exactly one implementation', () => {
  it('is not re-implemented in routes/admin/shipments.ts', () => {
    const found = handRolledCollapse(readSource('routes/admin/shipments.ts'))

    expect(
      found,
      found.length === 0
        ? ''
        : [
            'routes/admin/shipments.ts builds the seam’s collapsed row types itself:',
            ...found.map((field) => `  - ${field}`),
            '',
            'That is a second copy of collapseJobRows / collapseTransferRows, which are',
            'module-private to lib/production-readiness.ts and have no cross-check. Call',
            'loadOrderProductionSnapshots from the seam instead.',
          ].join('\n')
    ).toEqual([])
  })

  it('IS implemented in lib/production-readiness.ts, so the scan is looking for something real', () => {
    // The positive control. Without it the check above passes with both
    // functions deleted from the tree entirely.
    expect(handRolledCollapse(readSource('lib/production-readiness.ts'))).toEqual([
      'jobIds',
      'orderItemIds',
    ])
  })

  it('CAN fail: it names a hand-rolled collapse planted in a route', () => {
    expect(
      handRolledCollapse(
        'const job = { id: row.id, orderItemIds: [] }\nconst t = { id: row.id, jobIds: [] }\n'
      )
    ).toEqual(['jobIds', 'orderItemIds'])
  })

  it('does not report a file that only READS the collapsed fields', () => {
    // A check and not a blanket refusal: the response projection legitimately
    // reads `job.orderItemIds`, and a scan that reported that would force the
    // route to stop using the seam's own types.
    expect(handRolledCollapse('if (job.orderItemIds.includes(id)) return transfer.jobIds\n')).toEqual(
      []
    )
  })
})

describe('the non-shipping order types are the seam’s list, not a second one', () => {
  it('is bound into the scan from lib/production-readiness, with no local literal', async () => {
    // `producibleItems` short-circuits on the order type
    // (lib/`producibleItems` in `lib/production-readiness.ts`) and the candidate scan has to keep
    // the same orders out — two hard-coded `['gift_card']` tuples with nothing
    // holding them together is how a fourth non-shipping type ends up in a
    // queue no label is ever bought from.
    //
    // Fail-closed check first: `notInArray(col, [])` renders TRUE, so an empty
    // tuple silently stops excluding anything.
    expect(NON_PRODUCIBLE_ORDER_TYPES.length, 'the exclusion list derives empty').toBeGreaterThan(
      0
    )

    queueRows({ 'select:orders': [[]] })
    await buildApp().request('/api/admin/shipments/ready')

    const bound = render(selects(orders)[0]?.where).params
    for (const orderType of NON_PRODUCIBLE_ORDER_TYPES) {
      expect(bound, `${orderType} is not excluded by the scan`).toContain(orderType)
    }
  })

  it('leaves no second copy of the list in the route', () => {
    // The scan above would still pass if the route spelled the same tuple out
    // itself; this is what makes the import load-bearing.
    const code = stripComments(readSource('routes/admin/shipments.ts'))
    expect(code, 'the route names an order type literal of its own').not.toMatch(
      /['"`]gift_card['"`]/
    )
  })
})

/**
 * The body of a named `sql` template, sliced by its own backticks.
 *
 * Balanced by construction rather than by "the next thing that looks like the
 * end": both fragments are single-backtick templates with no nested template
 * inside them, and a scan whose slice is wrong is not a weaker check, it is a
 * check of something else. The assertion below that each fragment names at
 * least three columns is what catches a slice that silently came back empty.
 */
function sqlFragment(source: string, name: string): string {
  const declaration = source.indexOf(`const ${name} = sql`)
  if (declaration < 0) return ''
  const open = source.indexOf('`', declaration)
  const close = source.indexOf('`', open + 1)
  if (open < 0 || close < 0) return ''
  return source.slice(open + 1, close)
}

/** The `order_shipments` columns a fragment reads, by drizzle property name. */
function shipmentColumnsIn(fragment: string): string[] {
  return [...new Set([...fragment.matchAll(/orderShipments\.(\w+)/g)].map((m) => m[1]))].sort()
}

/**
 * The `order_shipments` columns a fragment's `coalesce(...)` names — the
 * courier handles, as distinct from the liveness test around them.
 *
 * Sliced on the first `)` after `coalesce(`, which is balanced by construction:
 * every member is a bare `${orderShipments.x}` interpolation with no call in
 * it. The emptiness assertion at each call site is what catches a slice that
 * came back wrong rather than short.
 */
function handleColumnsIn(fragment: string): string[] {
  const open = fragment.indexOf('coalesce(')
  if (open < 0) return []
  const close = fragment.indexOf(')', open)
  if (close < 0) return []
  return shipmentColumnsIn(fragment.slice(open, close))
}

const OURS = () => sqlFragment(readSource('routes/admin/shipments.ts'), 'ORDER_HAS_LIVE_LABEL')
const THEIRS = () => sqlFragment(readSource('lib/vendor-scope.ts'), 'ORDER_HAS_LABEL')

describe('the live-label fragment and its vendor-side twin', () => {
  it('name the same courier handles', () => {
    // `ORDER_HAS_LIVE_LABEL` here is a hand-copied twin of `ORDER_HAS_LABEL` in
    // `lib/vendor-scope.ts`, which is module-private to the vendor seam. The
    // comment on it says the two must agree about what a courier handle is;
    // this is what makes that a rule rather than a hope. Add a fourth handle to
    // one of them — a second AWB column, say — and they disagree here instead
    // of in production, where the symptom is an order that has shipped sitting
    // in the queue.
    //
    // **Scoped to the handles, and that is a round-5 narrowing.** It used to
    // compare every `order_shipments` column either fragment named, which
    // conflated two different agreements: what counts as a handle, and what
    // counts as a LIVE shipment. Those two came apart deliberately — this
    // fragment now takes its liveness from `openShipmentsOf`, so a cancelled
    // shipment releases its order back into the queue, while the vendor twin
    // answers a different question (has a label ever been issued for this
    // order, for the despatch guard) and is another ticket's to change. The
    // handle list is the part that must not drift; the liveness part is
    // asserted below, against the one predicate this file has for it.
    const ours = handleColumnsIn(OURS())
    const theirs = handleColumnsIn(THEIRS())

    // Vacuity first: two empty slices are equal and prove nothing.
    expect(ours.length, 'the coalesce slice came back empty').toBeGreaterThanOrEqual(3)
    expect(ours).toEqual(theirs)
  })

  it('CAN fail: a handle added to one side and not the other', () => {
    expect(
      handleColumnsIn(
        THEIRS().replace('coalesce(', 'coalesce(${orderShipments.externalShipmentId},')
      )
    ).not.toEqual(handleColumnsIn(OURS()))
  })

  it('takes its liveness from the one predicate this file has for it', () => {
    // The round-4 defect, made structural. `ORDER_HAS_LIVE_LABEL` spelled
    // `voided_at IS NULL` itself while `openShipmentsOf` — the predicate the
    // ship route refuses on and the queue reports on — spelled `voided_at IS
    // NULL AND status NOT IN (…)`. Two definitions of "still open" in one file
    // is how the screen and the write come to disagree, and they did: an order
    // whose only shipment was cancelled was shippable to the write and
    // invisible to the queue, permanently.
    const fragment = OURS()

    expect(fragment, 'the fragment slice came back empty').not.toBe('')
    expect(
      fragment,
      'the live-label fragment does not go through openShipmentsOf'
    ).toContain('openShipmentsOf(')
    expect(
      fragment,
      'the live-label fragment spells its own liveness test again'
    ).not.toMatch(/voidedAt|voided_at/)
  })

  it('CAN fail: a fragment that re-spells liveness instead of calling the predicate', () => {
    const respelled = OURS()
      .replace(/openShipmentsOf\([^)]*\)\)/, '${orderShipments.voidedAt} is null')

    expect(respelled).not.toContain('openShipmentsOf(')
    expect(respelled).toMatch(/voidedAt/)
  })
})

describe('the id guard every :id route in this file shares', () => {
  it('refuses thirty-six dashes rather than binding them as a uuid', async () => {
    // `/^[0-9a-f-]{36}$/i` is a length check wearing a pattern's clothes: a
    // hyphen is in the class, so a string of thirty-six of them passes and
    // reaches a query that binds it as a uuid. Postgres answers `invalid input
    // syntax for type uuid`, the handler's catch turns that into a 500, and a
    // caller's typo is reported as our outage.
    //
    // Not a ready-queue property, and it is here anyway because it is this
    // file's guard, repeated at four routes, and this is the file's suite.
    const dashes = '-'.repeat(36)
    queueRows({ 'select:order_shipments': [[]] })

    const res = await buildApp().request(`/api/admin/shipments/${dashes}`)

    expect(res.status).toBe(400)
    expect(selects(orderShipments), 'the malformed id reached a query').toHaveLength(0)
  })

  it('still accepts the ids this tree actually holds', async () => {
    // A check, not a blanket refusal: `00000000-0000-0000-0000-0000000000cc` is
    // a real fixture id in `tests/routes/admin/shipments-audit.test.ts` and has
    // neither a version nor a variant nibble, so the guard deliberately pins
    // the hex GROUPS and nothing else.
    queueRows({ 'select:order_shipments': [[]] })

    const res = await buildApp().request(
      '/api/admin/shipments/00000000-0000-0000-0000-0000000000cc'
    )

    expect(res.status).not.toBe(400)
  })
})

// ============================================================================
// Every `order_shipments` projection in this file is the same allow-list
// ============================================================================
//
// The gap a blind reviewer named after round 4, and it was a gap of SILENCE
// rather than of behaviour. This file spends paragraphs arguing that an
// allow-list is the only thing standing between a bare `.returning()` and
// `label_object_token` leaking the day the Shiprocket pass lands — and then
// `GET /` and `GET /:id`, the two routes that existed before this ticket, each
// hand-maintained their own list of `order_shipments` columns beside
// `SHIPMENT_RESPONSE_COLUMNS`. Three lists, one of them documented as a
// boundary, and nothing telling the next person adding a dispatch column that
// the other two exist.
//
// The lists are one now, and the two facts a single-order read carries that a
// page deliberately does not — the customer's address, the customer's record —
// are constants with their own argument rather than columns inline in a
// handler.

/** One `order_shipments` row as the list read projects it. */
const SHIPMENT_ROW = {
  id: '00000000-0000-4000-8000-0000000000cc',
  orderId: ORDER_A,
  trackingNumber: null,
  carrier: 'Shiprocket',
  status: 'pending',
  order: { id: ORDER_A, orderNumber: 'CA-2026-000001', status: 'processing', userId: null },
  shippingOption: null,
}

describe('every order_shipments projection in this file is one allow-list', () => {
  it('the list route reads the columns the writes answer with, and no others', async () => {
    recorder.reset()
    queueRows({ 'select:order_shipments': [[{ count: 1 }], [SHIPMENT_ROW]] })

    const res = await buildApp().request('/api/admin/shipments')
    expect(res.status).toBe(200)

    // [0] is the `count(*)`; [1] is the page.
    const list = selects(orderShipments)[1]
    expect(list?.fields, 'the list read is wholesale').not.toBeNull()
    expect(list?.fields).toEqual([
      ...Object.keys(SHIPMENT_RESPONSE_COLUMNS),
      'order',
      'shippingOption',
    ])
  })

  it('the detail route reads the same list', async () => {
    recorder.reset()
    queueRows({ 'select:order_shipments': [[SHIPMENT_ROW]] })

    const res = await buildApp().request(
      '/api/admin/shipments/00000000-0000-4000-8000-0000000000cc'
    )
    expect(res.status).toBe(200)

    const detail = selects(orderShipments)[0]
    expect(detail?.fields).toEqual([
      ...Object.keys(SHIPMENT_RESPONSE_COLUMNS),
      'order',
      'shippingOption',
    ])
  })

  it('names the one order column a single-shipment read carries that a page does not', () => {
    // `shippingAddress` is the whole difference, and the argument for it is
    // that `GET /:id` answers ONE shipment to an admin who is about to act on
    // that parcel, while `GET /` answers up to a hundred. The allow-list is
    // where that argument is checkable; before this it was an inline column in
    // a handler with no comment either way.
    const extra = Object.keys(SHIPMENT_DETAIL_ORDER_COLUMNS).filter(
      (key) => !(key in SHIPMENT_LIST_ORDER_COLUMNS)
    )

    expect(extra).toEqual(['shippingAddress'])
    expect(
      Object.keys(SHIPMENT_LIST_ORDER_COLUMNS),
      'a page of shipments started carrying customer addresses'
    ).not.toContain('shippingAddress')
  })

  it('names the customer a shipment read may carry, and it is not the whole record', () => {
    // `users` holds a phone number, an image, a role and the better-auth
    // bookkeeping. A shipment screen needs to know who to call it about, which
    // is a name and an email.
    expect(Object.keys(SHIPMENT_CUSTOMER_COLUMNS).sort()).toEqual(['email', 'id', 'name'])
  })

  it('has exactly one place naming the shipment columns a response carries', () => {
    // The sentinel for a FOURTH list appearing. `deliveredAt` is carried by
    // every shipment response and by no predicate, so a second mention of it in
    // this file's code is a second projection — which is precisely the state
    // this section exists to end.
    expect(shipmentColumnMentions(readSource('routes/admin/shipments.ts'), 'deliveredAt')).toBe(1)
  })

  it('CAN fail: a second projection that names the same column again', () => {
    expect(
      shipmentColumnMentions(
        [
          'const A = { deliveredAt: orderShipments.deliveredAt }',
          'const B = { deliveredAt: orderShipments.deliveredAt }',
        ].join('\n'),
        'deliveredAt'
      )
    ).toBe(2)
  })

  it('does not count a column named only in prose', () => {
    expect(
      shipmentColumnMentions('/** orderShipments.deliveredAt is the anchor. */', 'deliveredAt')
    ).toBe(0)
  })
})

/** Pure: source in, the number of places its CODE names one shipment column. */
function shipmentColumnMentions(source: string, column: string): number {
  return (
    stripComments(source).match(new RegExp(`orderShipments\\.${column}\\b`, 'g')) ?? []
  ).length
}

// ============================================================================
// Every handler that writes both tables does it in one transaction
// ============================================================================
//
// Round 2 of #730 shipped a header section naming three handlers that wrote
// `order_shipments` and then `orders` as two independent statements, listing
// the half-applied state each one leaves behind, and closing with "Anyone
// adding a fourth write: do not copy this."
//
// Round 3 gave that paragraph a scan. The scan was fake: it cleared any handler
// whose body CONTAINED the token `db.transaction(`, so a pair split across the
// transaction boundary — one write inside, one outside — was reported clean,
// and the negative control that claimed to catch exactly that case planted a
// corpus with no transaction anywhere in it. A guard that cannot fail is worse
// than none, because it reads as coverage.
//
// Round 4 wrapped the three. So this scan is now a check on a property the file
// HAS rather than a description of one it lacks, and it is written to fail in
// three directions: a fourth pair with no transaction, a pair split across the
// boundary, and a pair spread over two separate transactions that commit
// independently and leave exactly the same split.

/** One route handler, sliced from its own registration to the next one. */
interface HandlerSlice {
  label: string
  body: string
}

/**
 * The registration of a route on either router in this file.
 *
 * Sliced by the NEXT registration rather than by a brace count, and the reason
 * is the same one `tests/routes/vendor/jobs.test.ts` gives for its balanced
 * slices: a slice whose end is guessed is not a weaker check, it is a check of
 * something else. Registrations are the one boundary in this file that cannot
 * nest — hono takes a handler, not a router — so "up to the next one" is exact,
 * and the last slice running to end-of-file costs nothing because what follows
 * it is the export block.
 */
const ROUTE_REGISTRATION =
  /\b(?:adminShipmentsApp|adminOrderShipmentsApp)\s*\.\s*(get|post|patch|put|delete)\(\s*"([^"]+)"/g

function handlerSlices(source: string): HandlerSlice[] {
  const code = stripComments(source)
  const found = [...code.matchAll(ROUTE_REGISTRATION)]

  return found.map((match, index) => ({
    label: `${(match[1] as string).toUpperCase()} ${match[2]}`,
    body: code.slice(match.index ?? 0, found[index + 1]?.index ?? code.length),
  }))
}

/**
 * A write through one named handle onto one table, however the chain is
 * line-broken.
 *
 * The HANDLE is a parameter, and that is the whole point. `db.update(orders)`
 * written inside a `db.transaction(async (tx) => …)` callback runs on the root
 * connection and commits whether or not the transaction does — the defect
 * wearing a transaction as clothes, and the one the round-3 version of this
 * scan cleared. The recorder models the same distinction: `RecordedQuery.inTx`
 * is the WRITER, not the ambient depth.
 */
const writesTo = (handle: string, table: string) =>
  new RegExp(`\\b${handle}\\s*\\.\\s*(?:insert|update|delete)\\s*\\(\\s*${table}\\s*\\)`)

const PAIRED_TABLES = ['orders', 'orderShipments'] as const

/** Any write to either table, through any handle. */
const ANY_PAIRED_WRITE = new RegExp(
  `\\b[A-Za-z_$][\\w$]*\\s*\\.\\s*(?:insert|update|delete)\\s*\\(\\s*(?:${PAIRED_TABLES.join('|')})\\s*\\)`
)

const writesEitherTable = (code: string) => ANY_PAIRED_WRITE.test(code)

/** The handle names used for writes to either table, in order. */
function writeHandles(code: string): string[] {
  return [
    ...code.matchAll(
      new RegExp(
        `\\b([A-Za-z_$][\\w$]*)\\s*\\.\\s*(?:insert|update|delete)\\s*\\(\\s*(?:${PAIRED_TABLES.join('|')})\\s*\\)`,
        'g'
      )
    ),
  ].map((match) => match[1] as string)
}

/**
 * Where a `db.transaction(` callback begins, and what its handle is called.
 *
 * The capture group is the callback's single parameter. A callback that is not
 * a plain arrow with one named parameter leaves it undefined, and a span with
 * no known handle provides no atomicity at all below — fail-closed, because a
 * scan that cannot name the handle cannot tell a `tx` write from a `db` one,
 * which is the only distinction that matters here.
 */
const TRANSACTION_OPEN =
  /\b(?:db|tx)\s*\.\s*transaction\s*\(\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g

interface Span {
  start: number
  end: number
  handle: string | null
}

/**
 * The span of one parenthesised call, by BALANCED parentheses.
 *
 * Not "up to the next `)`", and the difference decides what this whole scan
 * measures: a transaction callback in this file contains `.where(eq(orders.id,
 * orderId))` before its second write, so a naive slice ends three lines in and
 * reports the write that follows as loose. `a naive slice would stop at the
 * first inner call` below plants exactly that shape and shows the two answers
 * differ, so the balance is a measured requirement rather than a precaution.
 *
 * Quotes are skipped because a parenthesis inside a string literal is not a
 * parenthesis, and `set({ notes: "re-booked (see ticket)" })` is ordinary in
 * these bodies. An unbalanced input runs to the end of the corpus, which the
 * vacuity test below would have caught as an empty slice.
 */
function balancedEndFrom(code: string, openParen: number): number {
  let depth = 0
  let quote: string | null = null

  for (let i = openParen; i < code.length; i += 1) {
    const ch = code[i] as string

    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }

    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }

  return code.length
}

/** Every top-level transaction callback in a body, as spans. */
function transactionSpans(code: string): Span[] {
  const spans: Span[] = []

  for (const match of code.matchAll(TRANSACTION_OPEN)) {
    const start = (match.index ?? 0) + (match[0] as string).indexOf('(')
    // A nested transaction is already inside the span that opened before it,
    // and counting it separately would let the inner one satisfy the outer's
    // "one transaction holds both writes" test on its own.
    if (spans.some((span) => start >= span.start && start < span.end)) continue
    spans.push({ start, end: balancedEndFrom(code, start), handle: match[1] ?? null })
  }

  // A `db.transaction(` that this pattern could not read as an arrow with one
  // named parameter is still a transaction, and a span with a null handle
  // clears nothing below. Without this the call would simply not be seen, and
  // the writes inside it would read as loose — a different wrong answer.
  for (const match of code.matchAll(/\b(?:db|tx)\s*\.\s*transaction\s*\(/g)) {
    const start = (match.index ?? 0) + (match[0] as string).length - 1
    if (spans.some((span) => start >= span.start && start < span.end)) continue
    spans.push({ start, end: balancedEndFrom(code, start), handle: null })
  }

  return spans.sort((a, b) => a.start - b.start)
}

/** The text of each transaction callback. */
function transactionBodies(code: string): string[] {
  return transactionSpans(code).map((span) => code.slice(span.start, span.end))
}

/** The body with every transaction callback cut out of it. */
function looseCode(code: string): string {
  let out = ''
  let cursor = 0

  for (const span of transactionSpans(code)) {
    out += code.slice(cursor, span.start)
    cursor = span.end
  }

  return out + code.slice(cursor)
}

/**
 * Pure: does this handler write both tables inside ONE transaction, through
 * that transaction's own handle?
 *
 * Three conditions, and dropping any one of them is a way this scan has already
 * been wrong:
 *
 * 1. **Nothing loose.** A write to either table outside every transaction
 *    callback is the half-applied write, whether or not the handler opens a
 *    transaction elsewhere.
 * 2. **Through the transaction's own handle.** Round 3 of this scan tested only
 *    that the handler's text CONTAINED `db.transaction(`; round 4's first
 *    attempt tested only that the write sat inside the callback's TEXT. Both
 *    clear `db.update(orders)` written inside `db.transaction(async (tx) => …)`,
 *    which runs on the root connection and commits independently — measured by
 *    planting exactly that into `POST /:id/mark-delivered` and watching this
 *    suite stay green.
 * 3. **One transaction, not two.** Two transactions with one write each commit
 *    separately and leave precisely the split state the header describes, so
 *    "every write is inside some transaction" is not the property either.
 */
function isAtomicPair(body: string): boolean {
  if (writesEitherTable(looseCode(body))) return false

  return transactionSpans(body).some((span) => {
    if (!span.handle) return false

    const text = body.slice(span.start, span.end)
    if (writeHandles(text).some((handle) => handle !== span.handle)) return false

    return (
      writesTo(span.handle, 'orders').test(text) &&
      writesTo(span.handle, 'orderShipments').test(text)
    )
  })
}

/** Every handler that writes both tables and does NOT do it atomically. */
function nonAtomicWritePairs(source: string): string[] {
  return handlerSlices(source)
    .filter(writesBothTables)
    .filter((slice) => !isAtomicPair(slice.body))
    .map((slice) => slice.label)
    .sort()
}

/** A handler that writes BOTH tables, whichever handle it used for each. */
function writesBothTables(slice: HandlerSlice): boolean {
  const handles = writeHandles(slice.body)
  return (
    handles.some((handle) => writesTo(handle, 'orders').test(slice.body)) &&
    handles.some((handle) => writesTo(handle, 'orderShipments').test(slice.body))
  )
}

/** Every handler that writes both tables and DOES do it atomically. */
function atomicWritePairs(source: string): string[] {
  return handlerSlices(source)
    .filter(writesBothTables)
    .filter((slice) => isAtomicPair(slice.body))
    .map((slice) => slice.label)
    .sort()
}

/**
 * The two handlers that write both tables, spelled out so the count below is
 * a claim rather than a count of whatever happens to be there.
 */
const PAIRED_WRITE_HANDLERS = [
  'PATCH /:id',
  'POST /:id/mark-delivered',
  // `POST /orders/:orderId/ship` left this list in #729: it writes neither
  // table itself any more, and the paired writes it used to make are the
  // dispatch library's, proved atomic in its own suites.
]

describe('every handler that writes both tables does it in one transaction', () => {
  it('has no half-applied write left in the file', () => {
    const found = nonAtomicWritePairs(readSource('routes/admin/shipments.ts'))

    expect(
      found,
      [
        'routes/admin/shipments.ts writes order_shipments and orders without one',
        `transaction holding both, in: ${found.join(', ') || '(none)'}`,
        '',
        'A throw between the two leaves the shipment moved and the order behind it:',
        'the tracking page reads order_shipments and says delivered while the admin',
        'orders list reads orders and says in transit, and the return window counted',
        'from the order has not started.',
        '',
        'Wrap the pair in db.transaction and write both through the `tx` handle. A',
        'write through the root `db` inside a transaction callback runs on its own',
        'connection and is exactly this defect wearing a transaction as clothes.',
      ].join('\n')
    ).toEqual([])
  })

  it('is not vacuous: both paired-write handlers are accounted for', () => {
    // `nonAtomicWritePairs` over a corpus it could not slice returns `[]`,
    // which is what a clean file returns. These two facts are different and
    // only one of them is the property, so the positive half is asserted too:
    // the two handlers are found, and found to be atomic.
    expect(atomicWritePairs(readSource('routes/admin/shipments.ts'))).toEqual(
      PAIRED_WRITE_HANDLERS
    )
  })

  it('found the handlers at all, so the slicer is not reporting an empty file', () => {
    const slices = handlerSlices(readSource('routes/admin/shipments.ts'))

    expect(slices.map((slice) => slice.label).sort()).toEqual([
      'GET /',
      'GET /:id',
      'GET /ready',
      'PATCH /:id',
      'POST /:id/mark-delivered',
      'POST /orders/:orderId/ship',
    ])
    expect(
      slices.every((slice) => slice.body.length > 0),
      'a slice came back empty'
    ).toBe(true)
  })

  it('CAN fail: a fourth pair planted with no transaction at all', () => {
    expect(
      nonAtomicWritePairs(`
        adminShipmentsApp.post("/:id/void", async (c) => {
          await db.update(orderShipments).set({ voidedAt: now }).where(eq(t.id, id))
          await db.update(orders).set({ status: "processing" }).where(eq(orders.id, oid))
        })
      `)
    ).toEqual(['POST /:id/void'])
  })

  it('CAN fail: a pair that opens a transaction and then writes outside it', () => {
    // THE case round 3 claimed to cover and did not. `db.update(orders)` here
    // is inside the callback's source text but runs through the root handle, so
    // it commits whether or not the transaction does — and a scan that stopped
    // at "the handler mentions a transaction" clears it. This corpus really
    // does contain `db.transaction(`, which the round-3 version of this test
    // did not.
    const planted = `
      adminShipmentsApp.post("/:id/void", async (c) => {
        await db.transaction(async (tx) => {
          await tx.update(orderShipments).set({ voidedAt: now }).where(eq(t.id, id))
        })
        await db.update(orders).set({ status: "processing" }).where(eq(orders.id, oid))
      })
    `

    expect(/\bdb\s*\.\s*transaction\s*\(/.test(planted), 'the plant has no transaction in it').toBe(
      true
    )
    expect(nonAtomicWritePairs(planted)).toEqual(['POST /:id/void'])
  })

  it('CAN fail: a write through the ROOT handle inside the transaction callback', () => {
    // Found by falsification, not by review: `db.update(orders)` moved INSIDE
    // the `/mark-delivered` callback left this whole suite green, because the
    // first version of the scan only asked whether the write sat inside the
    // callback's text. It runs on the root connection and commits whatever the
    // transaction does — the same split state, with a transaction wrapped
    // around half of it.
    const planted = `
      adminShipmentsApp.post("/:id/void", async (c) => {
        await db.transaction(async (tx) => {
          await tx.update(orderShipments).set({ voidedAt: now }).where(eq(t.id, id))
          await db.update(orders).set({ status: "processing" }).where(eq(orders.id, oid))
        })
      })
    `

    expect(nonAtomicWritePairs(planted)).toEqual(['POST /:id/void'])
  })

  it('CAN fail: a transaction whose callback handle it cannot read', () => {
    // Fail-closed. A callback this pattern cannot parse as an arrow with one
    // named parameter is still a transaction, and the writes in it are still
    // writes — but nothing here can tell which handle issued them, so the span
    // clears nothing rather than clearing everything.
    expect(
      nonAtomicWritePairs(`
        adminShipmentsApp.post("/:id/void", async (c) => {
          await db.transaction(runTheWrites(orderShipments, orders))
          await db.update(orderShipments).set({ voidedAt: now })
          await db.update(orders).set({ status: "processing" })
        })
      `)
    ).toEqual(['POST /:id/void'])
  })

  it('CAN fail: a pair spread over two transactions that commit separately', () => {
    // Every write is inside a transaction and the handler is still broken: the
    // first commits, the second throws, and the split state is identical to
    // having used no transaction at all.
    expect(
      nonAtomicWritePairs(`
        adminShipmentsApp.post("/:id/void", async (c) => {
          await db.transaction(async (tx) => {
            await tx.update(orderShipments).set({ voidedAt: now }).where(eq(t.id, id))
          })
          await db.transaction(async (tx) => {
            await tx.update(orders).set({ status: "processing" }).where(eq(orders.id, oid))
          })
        })
      `)
    ).toEqual(['POST /:id/void'])
  })

  it('clears a pair written through one tx handle, so it is a check and not a refusal', () => {
    // The positive control. Without it this scan is satisfied by a file with no
    // writes in it, and would refuse the very fix it exists to ask for.
    const planted = `
      adminShipmentsApp.post("/:id/void", async (c) => {
        await db.transaction(async (tx) => {
          await tx.update(orderShipments).set({ voidedAt: now }).where(eq(orderShipments.id, id))
          await tx.update(orders).set({ status: "processing" }).where(eq(orders.id, oid))
        })
      })
    `

    expect(nonAtomicWritePairs(planted)).toEqual([])
    expect(atomicWritePairs(planted)).toEqual(['POST /:id/void'])
  })

  it('clears a handler that writes only one of the two tables', () => {
    expect(
      nonAtomicWritePairs(`
        adminShipmentsApp.patch("/:id/notes", async (c) => {
          await db.update(orderShipments).set({ notes }).where(eq(t.id, id))
        })
      `)
    ).toEqual([])
  })

  it('does not report a handler that only names the tables in prose', () => {
    expect(
      nonAtomicWritePairs(`
        adminShipmentsApp.get("/:id/preview", async (c) => {
          // db.update(orders) and db.update(orderShipments) would go here
          /* db.update(orders) */
          return c.json({})
        })
      `)
    ).toEqual([])
  })

  it('a naive slice would stop at the first inner call, and this one does not', () => {
    // The measurement behind `balancedSpanFrom`. Every real transaction body in
    // this file closes a nested call before its second write, so a slice that
    // ended at the first `)` would cut the callback in half and report the
    // second write as loose — a check of something else, arriving as a red
    // test about atomicity.
    const body = `
      await db.transaction(async (tx) => {
        await tx.update(orderShipments).set({ a: 1 }).where(eq(orderShipments.id, id))
        await tx.update(orders).set({ b: 2 }).where(eq(orders.id, oid))
      })
    `

    const balanced = transactionBodies(body)[0] as string
    const naive = body.slice(body.indexOf('db.transaction('), body.indexOf(')') + 1)

    expect(writesTo('tx', 'orders').test(balanced), 'the balanced span lost the second write').toBe(
      true
    )
    expect(writesTo('tx', 'orders').test(naive), 'the naive slice reached the second write').toBe(
      false
    )
    expect(balanced.length).toBeGreaterThan(naive.length)
  })

  it('does not treat a parenthesis inside a string as a parenthesis', () => {
    // `set({ notes: "shipped (partial)" })` is ordinary in these bodies, and a
    // scanner that counted that `)` would end the span early and report the
    // next write as loose.
    const body = `
      await db.transaction(async (tx) => {
        await tx.update(orderShipments).set({ notes: "re-booked (see ticket)" })
        await tx.update(orders).set({ status: "processing" })
      })
    `

    expect(isAtomicPair(body)).toBe(true)
  })
})

// ============================================================================
// The citations in this feature name symbols, never line numbers
// ============================================================================
//
// A measured rule, not a stylistic one. `routes/admin/shipments.ts` documents
// itself almost entirely by pointing at other files, and it argues twice that a
// stale paragraph is what sends the on-call engineer hunting a bug that is not
// there. Round 3 of #730 added 198 lines to `lib/production-readiness.ts` and
// broke FIVE of this file's `path:line` citations in one change — each of them
// correct before it, each landing on unrelated code after it, with nothing
// anywhere going red.
//
// The repo's own house style is `path:line`, and this is a deliberate departure
// scoped to the two files below. The difference is direction: `vendor-scope.ts`
// cites `vendor-scope.ts`, and a citation into the file you are editing moves
// with the edit. Every citation here crosses a seam into a file this ticket
// does not own and cannot re-check.
//
// A symbol name can go stale too — but a rename is a grep, a compiler error and
// a diff, while a line shift is invisible. And the two checks below make even
// that failure loud: the filenames are resolved on disk, and the symbols this
// feature leans on are held against the file that is supposed to define them.

/** The two files this ticket owns, whose prose is scanned below. */
const CITING_SOURCES: ReadonlyArray<{ label: string; contents: string }> = [
  {
    label: 'src/routes/admin/shipments.ts',
    contents: readSource('routes/admin/shipments.ts'),
  },
  {
    label: 'tests/routes/admin/shipments-ready-queue.test.ts',
    contents: readFileSync(resolve(__dirname, 'shipments-ready-queue.test.ts'), 'utf8'),
  },
]

/** Just the comment text of a source — the inverse of `stripComments`. */
function commentsOf(source: string): string {
  return [
    ...(source.match(/\/\*[\s\S]*?\*\//g) ?? []),
    ...(source.match(/^\s*\/\/.*$/gm) ?? []),
  ].join('\n')
}

/**
 * The character a line wrap is replaced by, so a joined citation is
 * distinguishable from an ordinary space.
 *
 * This is the whole reason the unwrapping below is safe. A citation split
 * across two comment lines has to be joined to be seen at all; joining with a
 * SPACE would also make prose like a filename followed by a sentence beginning
 * with a number read as a citation, and a scan that reports English is a scan
 * people delete. The sentinel cannot occur in a source file, so the pattern can
 * accept it where it accepts nothing else.
 */
const WRAP = '\u0000'

/** Comment text with the line wrapping taken out — see `WRAP`. */
function unwrapComments(text: string): string {
  return text.replace(/\n[ \t]*(?:\*\/?|\/\/)[ \t]*/g, WRAP)
}

/**
 * Pure: a source in, every citation of the form `<path>.ts` followed by a colon
 * and a line number, found in its COMMENTS, out.
 *
 * The shape is described rather than written out because this scan reads its
 * own file, and an example in this comment would be a finding.
 *
 * **It used to miss the commonest spelling of one, and that is why the sentinel
 * exists.** The route file carried a filename at the end of one comment line
 * and `:243-246` at the start of the next; the pattern was matched against text
 * that still had the `\n * ` between them, so the scan returned nothing and
 * stayed green over a citation that was ALREADY stale — it claimed to name one
 * function and landed on another. Which is the entire argument for the rule the
 * scan enforces: a line citation across a seam rots invisibly, and a guard that
 * cannot see the ordinary way one is written reads as coverage.
 */
function lineNumberCitations(source: string): string[] {
  return [
    ...unwrapComments(commentsOf(source)).matchAll(
      new RegExp(`[A-Za-z0-9_./-]+\\.(?:ts|tsx|sql)${WRAP}?:${WRAP}?\\d+(?:-\\d+)?`, 'g')
    ),
  ].map((match) => (match[0] as string).split(WRAP).join(''))
}

/**
 * Pure: every src-relative file path a source's comments name.
 *
 * Only paths that start with a directory this repo actually has under
 * `packages/api/src`, so a bare basename (`isolation.test.ts`) is skipped
 * rather than guessed at. A prefix-anchored path is unambiguous and therefore
 * decidable; a basename is not, and a check that guesses is a check that
 * reports the wrong thing.
 */
const SRC_DIRECTORY_PREFIXES = [
  'lib/',
  'routes/',
  'services/',
  'middleware/',
  'database/',
  'config/',
]

function citedSrcPaths(source: string): string[] {
  return [...new Set(
    [...unwrapComments(commentsOf(source)).matchAll(/[A-Za-z0-9_./-]+\.tsx?/g)]
      .map((match) => match[0] as string)
      .filter((path) => SRC_DIRECTORY_PREFIXES.some((prefix) => path.startsWith(prefix)))
      .filter((path) => !path.includes('.test.'))
  )].sort()
}

/**
 * The cross-seam symbols this feature's prose leans on, and where each is
 * supposed to live.
 *
 * Hand-maintained on purpose: extracting "the symbol named next to a filename"
 * out of English prose is a parser, and a parser that is nearly right reports
 * the wrong thing. This is the short list of names that, if they moved, would
 * make a paragraph in `routes/admin/shipments.ts` actively misleading.
 */
const CITED_SYMBOLS: ReadonlyArray<{ file: string; symbol: string }> = [
  { file: 'lib/production-readiness.ts', symbol: 'LABEL_READINESS_CONSUMERS' },
  { file: 'lib/production-readiness.ts', symbol: 'producibleItems' },
  { file: 'lib/production-readiness.ts', symbol: 'evaluateLabelReadiness' },
  { file: 'lib/production-readiness.ts', symbol: 'loadOrderProductionSnapshot' },
  { file: 'lib/production-readiness.ts', symbol: 'loadOrderProductionSnapshots' },
  { file: 'lib/production-readiness.ts', symbol: 'NON_PRODUCIBLE_ORDER_TYPES' },
  { file: 'lib/vendor-scope.ts', symbol: 'ORDER_HAS_LABEL' },
  { file: 'lib/vendor-scope.ts', symbol: 'VendorJobRefusalCode' },
  { file: 'lib/vendor-scope.ts', symbol: 'VendorJobRefusal' },
  { file: 'lib/audit.ts', symbol: 'recordAudit' },
  { file: 'routes/tracking.ts', symbol: 'trackingPayloadForOrder' },
  { file: 'services/notifications.ts', symbol: 'liveShipmentFor' },
  { file: 'lib/production-transitions.ts', symbol: 'PRODUCTION_TRANSITIONS' },
]

describe('the citations in this feature name symbols, never line numbers', () => {
  for (const { label, contents } of CITING_SOURCES) {
    it(`${label} cites no line number in another file`, () => {
      const found = lineNumberCitations(contents)

      expect(
        found,
        found.length === 0
          ? ''
          : [
              `${label} cites a line number: ${found.join(', ')}`,
              '',
              'Line citations across a seam rot silently. Round 3 of #730 added 198',
              'lines to lib/production-readiness.ts and broke five of them in one',
              'change, with nothing going red. Cite the symbol instead — a rename is a',
              'grep and a compiler error, a line shift is invisible — and add it to',
              'CITED_SYMBOLS below if a paragraph would be misleading without it.',
            ].join('\n')
      ).toEqual([])
    })

    it(`${label} names only files that exist`, () => {
      const missing = citedSrcPaths(contents).filter(
        (path) => !existsSync(resolve(__dirname, '../../../src', path))
      )

      expect(missing, `cited but not on disk: ${missing.join(', ')}`).toEqual([])
    })
  }

  it('names only symbols the cited file still defines', () => {
    const missing = CITED_SYMBOLS.filter(({ file, symbol }) => {
      const contents = readSource(file)
      return !new RegExp(`\\b${symbol}\\b`).test(contents)
    }).map(({ file, symbol }) => `${symbol} in ${file}`)

    expect(
      missing,
      missing.length === 0
        ? ''
        : [
            'A symbol this feature’s prose points at is no longer there:',
            ...missing.map((entry) => `  - ${entry}`),
            '',
            'Rename it in the paragraphs that cite it, or delete the entry if the',
            'paragraph went away with it.',
          ].join('\n')
    ).toEqual([])
  })

  it('CAN fail: it names a line citation planted in a comment', () => {
    // Assembled rather than written literally: this suite scans its own source,
    // and a plant spelled out here would be reported by the very check it is
    // the control for. `${…}` breaks the pattern in THIS file and produces it
    // in the corpus, which is exactly the difference that matters.
    const citation = `lib/production-readiness.ts:${852}`

    expect(lineNumberCitations(`/** See ${citation} for the allow-list. */ const x = 1`)).toEqual([
      citation,
    ])
  })

  it('CAN fail: it names a citation the line wrap split in two', () => {
    // The hole this closes, found by a reader and not by the guard. The file
    // carried `production-readiness.ts` at the end of one comment line and
    // `:243-246` at the start of the next; the scan matched against text that
    // still had the `\n * ` in it, so it returned nothing and stayed green over
    // a citation that was ALREADY stale — it claimed to name `producibleItems`
    // and landed on `requiredStagesFor`. Which is the entire argument for the
    // rule: a line citation across a seam rots invisibly, and a guard that
    // cannot see the commonest spelling of one reads as coverage.
    //
    // Assembled rather than written literally, like the plant above: this suite
    // scans its own source.
    const wrapped = ['/**', ` * see lib/production-readiness.ts`, ` * :${243}-${246} for it`, ' */'].join('\n')

    expect(lineNumberCitations(wrapped)).toEqual([`lib/production-readiness.ts:${243}-${246}`])
  })

  it('CAN fail: it names a citation wrapped after the colon', () => {
    const wrapped = ['/**', ` * see lib/vendor-scope.ts:`, ` * ${405} for the pattern`, ' */'].join('\n')

    expect(lineNumberCitations(wrapped)).toEqual([`lib/vendor-scope.ts:${405}`])
  })

  it('does not report a wrapped sentence that merely ends on a filename', () => {
    // The positive control the two plants above are subtractions from. Joining
    // wrapped lines is only safe if the join is distinguishable from ordinary
    // prose spacing: `routes/tracking.ts` followed by a sentence starting with
    // a number is not a citation, and a scan that read it as one would police
    // English.
    const wrapped = ['/**', ' * see routes/tracking.ts', ' * 4 columns live there', ' */'].join('\n')

    expect(lineNumberCitations(wrapped)).toEqual([])
    expect(lineNumberCitations('// routes/tracking.ts: 4 columns live there')).toEqual([])
  })

  it('CAN fail: it names a cited file that is not on disk', () => {
    expect(
      citedSrcPaths('// see lib/there-is-no-such-module.ts for the rule').filter(
        (path) => !existsSync(resolve(__dirname, '../../../src', path))
      )
    ).toEqual(['lib/there-is-no-such-module.ts'])
  })

  it('CAN fail: it names a symbol the cited file does not define', () => {
    const missing = [{ file: 'lib/production-readiness.ts', symbol: 'aSymbolNobodyDefined' }]
      .filter(({ file, symbol }) => !new RegExp(`\\b${symbol}\\b`).test(readSource(file)))
      .map(({ symbol }) => symbol)

    expect(missing).toEqual(['aSymbolNobodyDefined'])
  })

  it('does not report a line number that is written in CODE rather than prose', () => {
    // Comments are the subject. The same text inside a string literal is a
    // value — a fixture, a rendered path, a log line — and a scan that could
    // not tell them apart would police data.
    const citation = `lib/thing.ts:${12}`

    expect(lineNumberCitations(`const where = '${citation}'`)).toEqual([])
  })

  it('does not report a colon-and-digits that is not a citation', () => {
    // Timestamps are all over this file's prose — the cursor format is
    // `2026-08-01T09:00:00.000Z|<uuid>` — and a looser pattern would report
    // every one of them.
    expect(
      lineNumberCitations('// the cursor is 2026-08-01T09:00:00.000Z|<uuid>, placed at 09:00')
    ).toEqual([])
  })

  it('does not treat a bare basename as a src path it could resolve', () => {
    // `isolation.test.ts` is a real file in another package tree, and guessing
    // where it lives is how a check starts reporting the wrong thing.
    expect(citedSrcPaths('// same shape as isolation.test.ts')).toEqual([])
  })
})

describe('the shipment statuses that end a shipment', () => {
  it('names values the enum still has', () => {
    // `CLOSED_SHIPMENT_STATUSES` is a literal and says so, because there is no
    // shipment-status transition matrix to derive it from. This is the price of
    // that: `tsc` checks the annotation, and a value RENAMED in a later
    // migration would still typecheck for as long as the old name survives in
    // the enum tuple, so the runtime read is what actually pins it.
    for (const status of CLOSED_SHIPMENT_STATUSES) {
      expect(shipmentStatusEnum.enumValues, `${status} is not a shipment status`).toContain(status)
    }
  })

  it('is non-empty, because the empty set holds every order out forever', () => {
    // `notInArray(status, [])` renders TRUE, so an empty list means every
    // non-voided shipment row keeps its order out of the queue — the safe
    // direction (no duplicate label) but a queue an order can never re-enter,
    // which is work nobody can find.
    expect(CLOSED_SHIPMENT_STATUSES.length).toBeGreaterThan(0)
  })

  it('leaves out the statuses whose parcel still exists', () => {
    // An absence asserted rather than assumed. A failed or undelivered parcel
    // is still in a courier's hands and a second shipment is not the remedy;
    // `schema/shipping.ts` is where that distinction is drawn.
    for (const status of ['failed', 'undelivered', 'delivered', 'in_transit']) {
      expect(CLOSED_SHIPMENT_STATUSES, `${status} releases its order back into the queue`)
        .not.toContain(status)
    }
  })
})

// ============================================================================
// One refusal vocabulary, for the whole file
// ============================================================================

/** Every `code:` string literal this file answers a caller with. */
function emittedRefusalCodes(source: string): string[] {
  return [
    ...new Set(
      [...stripComments(source).matchAll(/\bcode:\s*"([A-Z0-9_]+)"/g)].map(
        (match) => match[1] as string
      )
    ),
  ].sort()
}

describe('every declared refusal code is emitted, and every emitted one is declared', () => {
  it('holds the vocabulary against the file that answers with it', () => {
    // The account. `#730` declared one code for one route while four handlers
    // beside it answered with a bare sentence; the union has since been widened
    // to the file, and this is what stops it drifting in either direction — a
    // code declared and never emitted is a promise to a client that nothing
    // keeps, and a code emitted and never declared is the second vocabulary all
    // over again.
    const declared = [...ADMIN_SHIPMENT_REFUSAL_CODES].sort()
    const emitted = emittedRefusalCodes(readSource('routes/admin/shipments.ts'))

    expect(emitted).toEqual(declared)
  })

  it('CAN fail: it sees a code emitted without being declared', () => {
    expect(
      emittedRefusalCodes('return c.json({ error: "no", code: "SOMETHING_ELSE" }, 400)')
    ).toEqual(['SOMETHING_ELSE'])
  })

  it('does not count a code named only in prose', () => {
    // The declaration block itself is a `/** */` doc comment full of code
    // names; a scan that could not tell prose from code would count them.
    expect(emittedRefusalCodes('// code: "READY_QUEUE_QUERY_INVALID"\nconst x = 1\n')).toEqual([])
  })

  it('answers the list route’s own malformed query with a code, not a zod dump', async () => {
    // The judge's finding, made executable. `ADMIN_SHIPMENT_REFUSAL_CODES` was
    // introduced as "every refusal this file can answer with, named rather than
    // inferred" while three of the four handlers around `/ready` fell straight
    // through to `zValidator`'s default body — an uncoded dump of zod issues,
    // which is exactly the body this file argues against 500 lines earlier.
    const res = await buildApp().request('/api/admin/shipments?pageSize=500')
    expect(res.status).toBe(400)

    const body = (await readJson(res)) as Record<string, string>
    expect(body.code).toBe('SHIPMENT_LIST_QUERY_INVALID')
    expect(body.error, 'the refusal does not say what to send instead').toMatch(/pageSize/)

    const serialised = JSON.stringify(body)
    for (const zodInternal of ['too_big', 'too_small', 'invalid_type', '"path"', 'ZodError']) {
      expect(serialised, `${zodInternal} was narrated to the caller`).not.toContain(zodInternal)
    }
  })

  it('answers a malformed shipment body with a code, not a zod dump', async () => {
    const res = await buildApp().request(`/api/admin/shipments/${ORDER_A}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'teleported' }),
    })
    expect(res.status).toBe(400)

    const body = (await readJson(res)) as Record<string, string>
    expect(body.code).toBe('SHIPMENT_BODY_INVALID')
    expect(body.error).toMatch(/carrier/)

    const serialised = JSON.stringify(body)
    for (const zodInternal of ['invalid_enum_value', 'invalid_value', '"path"', 'ZodError']) {
      expect(serialised, `${zodInternal} was narrated to the caller`).not.toContain(zodInternal)
    }
  })

  it('leaves the 500s without a code, deliberately', () => {
    // The absence, asserted. A failed read answers a fixed string and nothing
    // else; a code on it would be one more fact about a failure whose whole
    // design is to give the least away.
    const code = stripComments(readSource('routes/admin/shipments.ts'))
    const fiveHundreds = [...code.matchAll(/\{[^{}]*error:[^{}]*\},\s*500\s*\)/g)].map(
      (match) => match[0]
    )

    expect(fiveHundreds.length, 'no 500 body was found, so this proves nothing').toBeGreaterThan(0)
    for (const body of fiveHundreds) {
      expect(body, 'a 500 body carries a refusal code').not.toContain('code:')
    }
  })
})

describe('the router', () => {
  it('accounts for every route registered on it', () => {
    // An account, not a shadowing check — `tests/routes/route-shadowing.test.ts`
    // already proves no literal hides behind an earlier `/:param` across the
    // composed app. What this catches is a route added to this file with no
    // decision made about where it sits: the list is spelled out, in
    // registration order, so a new one has to be placed deliberately.
    // Deduped: hono pushes one `routes` entry per registered HANDLER, and a
    // route with a `zValidator` in front of it has two — so the raw list
    // double-counts exactly the validated routes and nothing else.
    const registered = [
      ...new Set(
        (adminShipmentsApp as unknown as { routes: Array<{ method: string; path: string }> }).routes
          .filter((route) => route.method !== 'ALL')
          .map((route) => `${route.method} ${route.path}`)
      ),
    ]

    expect(registered).toEqual([
      'GET /',
      'GET /ready',
      'GET /:id',
      'PATCH /:id',
      'POST /:id/mark-delivered',
    ])
  })
})
