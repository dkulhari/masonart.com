/**
 * Vendor portal API — inter-vendor transfers.
 *
 * `GET /transfers`, `GET /transfers/:id`, `POST /transfers` (vendor A
 * despatches) and `POST /transfers/:id/received` (vendor B confirms), plus the
 * two audit rows they produce.
 *
 * Seven things are asserted here that a "does it create a row" test would not:
 *
 * 1. **B is told SEVEN fields and no eighth.** `{ id, reference, carrier,
 *    pieceCount, dispatchedAt, expectedBy, receivedAt }`, plus a `direction`
 *    computed from the CALLER'S OWN id. No vendor name, no vendor id, no order
 *    id, no cost. B must not learn the parcel came from A: surfacing another
 *    vendor's row through `vendor-scope.ts` would break the isolation suite's
 *    first property, which is a hard, already-tested boundary. If B needs to
 *    chase a parcel, an admin chases it — the admin sees both ends.
 *
 *    Asserted on the PROJECTION — the columns the module asked the database for
 *    — and not only on the response. The rows come from `transferRow()`, a
 *    fixture in this file, so `Object.keys(body.transfer)` compares the fixture
 *    to a list of the fixture's own keys and agrees with itself whatever the
 *    module does. `toVendorId` added to `vendorTransferColumns` is the leak this
 *    property exists for, and only `columnsOf` can see it.
 *
 * 2. **The two writes belong to opposite ends and neither end may borrow the
 *    other's.** `received_at` is settable only by `to_vendor_id`; a transfer is
 *    created only by `from_vendor_id`. Neither is a check in application code:
 *    the receipt UPDATE names `to_vendor_id` in its WHERE, and the insert writes
 *    `from_vendor_id` from the session rather than from the body, so there is no
 *    field in which to say otherwise.
 *
 * 3. **A job is on at most one transfer, EVER.** `production_transfer_jobs_
 *    job_id_unique` is the enforcement; the explicit pre-check exists so the
 *    answer is a 409 naming the jobs rather than a 500 out of the index. A lost
 *    parcel produces a REPLACEMENT job, never a second leg for the original.
 *
 * 4. **`cost_amount` is not vendor-settable.** We pay the leg because we chose
 *    the routing, so a vendor cannot price a distance we picked. The schema is
 *    `.strict()`, so an attempt is a 400 rather than a silently dropped field —
 *    and the inserted row is asserted to carry no `costAmount` either way.
 *
 * 5. **A transfer and its jobs move together or not at all.** Despatching is
 *    what makes `qc_passed -> dispatched` legal — that edge's guard is
 *    `open-transfer-or-order-label` — so the transfer is inserted FIRST and the
 *    guard is then EVALUATED against it inside the same transaction. A transfer
 *    whose jobs never moved, or jobs that moved with no transfer, is the failure
 *    this ordering exists to make impossible.
 *
 * 6. **The order id never enters this process.** It is required by the schema
 *    (`production_transfers.order_id` is NOT NULL) and it is a person-linked
 *    handle R1 forbids, so it is written through a scoped SQL sub-select and
 *    never selected into JS. "All the jobs are on one order" is a
 *    `count(distinct …)`, not a comparison of values we read out.
 *
 * 7. **The audit rows go on opposite sides of the transaction.** The success row
 *    SHARES it — a row saying "this parcel was despatched" beside a transfer
 *    that rolled back is worse than no row. The refusal row must NOT: it records
 *    that a transaction was rolled back, and writing it inside erases the
 *    evidence. `recordAudit` is deliberately NOT mocked here so both facts are
 *    read off the real insert — including `metadata.vendorId`, which the
 *    recorder captures because the middleware put it on the context.
 *
 *    And SURVIVING is asserted, not only `inTx`. §8 asks for each mutating
 *    handler to be run against a transaction that throws at COMMIT, with no
 *    success row surviving and the refusal row surviving; `failCommit` is what
 *    makes that reachable, since a callback that throws is a case the response
 *    already gives away.
 *
 * Harness: the recording query builder from `jobs.test.ts` / `photos.test.ts`.
 * `src/database` records the WHERE that actually reached the driver, `src/auth`
 * is mocked so each test picks the caller, and the REAL `requireVendor`,
 * `lib/vendor-scope` and `lib/audit` run on top.
 *
 * @see packages/api/src/routes/vendor.ts
 * @see packages/api/src/lib/vendor-scope.ts
 * @see packages/api/src/routes/admin/transfers.ts
 * @see docs/superpowers/specs/2026-08-30-production-pipeline-design.md §5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildRouteApp } from '../../helpers/route-app'
import { vendorSessionFor } from '../../helpers/vendor-session'
import type { RecordedQuery } from '../../helpers/query-recorder'
import '../../setup'

import { productionJobs } from '../../../src/database/schema/production-jobs'
import {
  productionTransfers,
  productionTransferJobs,
} from '../../../src/database/schema/production-transfers'
import { adminAuditLog } from '../../../src/database/schema/audit-log'

// ============================================================================
// Recording database mock
// ============================================================================

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder({ rows: 'repeatLast' })
)

vi.mock('../../../src/database', () => ({ db: recorder.db }))

const mockGetSession = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

import { vendorApp } from '../../../src/routes/vendor'
import { readJson } from '../../helpers/json'

// ============================================================================
// Fixtures
// ============================================================================

const { params, render, queueRows, ops, queries, reset } = recorder

/** The caller in every test below. Vendor A when despatching, B when receiving. */
const VENDOR_ID = '33333333-3333-4333-8333-333333333333'
/** The counterparty. Nothing of theirs may appear in any body. */
const OTHER_VENDOR_ID = '11111111-1111-4111-8111-111111111111'

const TRANSFER_ID = '77777777-7777-4777-8777-777777777777'
/** A real transfer id — the counterparty's. The interesting attack. */
const OTHER_TRANSFER_ID = '7777777a-7777-4777-8777-777777777777'

const JOB_A = '22222222-2222-4222-8222-222222222222'
const JOB_B = '2222222b-2222-4222-8222-222222222222'
/** A real job id — another vendor's. */
const FOREIGN_JOB = '2222222f-2222-4222-8222-222222222222'

/** Never appears in a vendor-facing body. Present so the tests can prove it. */
const ORDER_ID = '55555555-5555-4555-8555-555555555555'

const PAST = new Date('2026-01-01T00:00:00Z')
const EXPECTED_BY = '2026-09-05T00:00:00.000Z'

const buildApp = () => buildRouteApp('/api/vendor', vendorApp)

/** The seven fields the design says B is told, and the two it computes. */
const TRANSFER_KEYS = [
  'carrier',
  'direction',
  'dispatchedAt',
  'expectedBy',
  'id',
  'isLost',
  'pieceCount',
  'receivedAt',
  'reference',
]

/**
 * The columns a query actually asked the database for.
 *
 * The load-bearing helper in this file, and the one it did not have. Every
 * seven-field claim below used to read `Object.keys(body.transfer)` — the keys
 * of `transferRow()`, a fixture this file writes — so it compared the fixture to
 * a list of the fixture's own keys and agreed with itself. `toVendorId` added to
 * `vendorTransferColumns` in `lib/vendor-scope.ts` would have shipped vendor B
 * the identity of vendor A with every suite in this feature green.
 *
 * The projection is where that is decidable, because it is what the module asked
 * for rather than what a fixture chose to answer with. `null` means the read was
 * WHOLESALE — `db.select()` with no argument, which returns every column of
 * every joined row — and is a failure in itself, so it is refused here rather
 * than silently sorted into an empty list.
 */
function columnsOf(q: RecordedQuery | undefined, what: string): string[] {
  expect(q, `${what}: no such query was issued`).toBeDefined()
  expect(q!.fields, `${what} selected the table WHOLESALE`).not.toBeNull()
  return [...(q!.fields ?? [])].sort()
}

/** The same, for the `.returning({...})` of an INSERT or an UPDATE. */
function returnedColumnsOf(q: RecordedQuery | undefined, what: string): string[] {
  expect(q, `${what}: no such query was issued`).toBeDefined()
  expect(q!.returning, `${what} returned the row WHOLESALE`).not.toBeNull()
  expect(q!.returning, `${what} returned nothing at all`).toBeDefined()
  return [...(q!.returning ?? [])].sort()
}

/** A transfer row as the scoped module's column list returns it. */
function transferRow(over: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    reference: 'DL-9911',
    carrier: 'Delhivery',
    pieceCount: 2,
    dispatchedAt: PAST,
    expectedBy: null,
    receivedAt: null,
    isLost: false,
    direction: 'outbound',
    ...over,
  }
}

/** The row the LOCKED receipt read returns — internal, never a response shape. */
function receiptLockRow(over: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    reference: 'DL-9911',
    dispatchedAt: PAST,
    receivedAt: null,
    lostAt: null,
    ...over,
  }
}

/** The row the LOCKED job scan returns. `qc_passed` is the only dispatchable one. */
function jobLockRow(id: string, over: Record<string, unknown> = {}) {
  return { id, stage: 'print', status: 'qc_passed', settlementId: null, ...over }
}

/** The routing read: one order, one consolidator, and it is not the caller. */
function routingRow(over: Record<string, unknown> = {}) {
  return { orderCount: 1, consolidatorVendorId: OTHER_VENDOR_ID, ...over }
}

/** What the `open-transfer-or-order-label` guard sees once the parcel exists. */
const guardRow = { transferId: TRANSFER_ID, hasOrderLabel: false }

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const DISPATCH_BODY = {
  jobIds: [JOB_A, JOB_B],
  carrier: 'Delhivery',
  reference: 'DL-9911',
  pieceCount: 2,
  expectedBy: EXPECTED_BY,
}

/**
 * Everything a successful despatch reads, in the order the module reads it.
 *
 * `select:production_jobs` is consumed batch by batch: the locked scan, the
 * routing aggregate, then one guard read per job. The final batch repeats, which
 * is what lets the per-job guard loop drain without a batch each.
 */
function seedDispatchable() {
  queueRows({
    'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
    'select:production_jobs': [
      [jobLockRow(JOB_A), jobLockRow(JOB_B)],
      [routingRow()],
      [guardRow],
    ],
    'select:production_transfer_jobs': [[]],
    'insert:production_transfers': [[transferRow()]],
    'insert:production_transfer_jobs': [[]],
    'update:production_jobs': [[{ id: JOB_A }, { id: JOB_B }]],
  })
}

function seedReceivable(over: Record<string, unknown> = {}) {
  queueRows({
    'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
    'select:production_transfers': [
      [receiptLockRow(over)],
      [transferRow({ direction: 'inbound', receivedAt: new Date() })],
    ],
    // What the parcel carried. For the AUDIT ROW only — these are the sending
    // vendor's jobs, and they never appear in a response.
    'select:production_transfer_jobs': [[{ jobId: JOB_A }, { jobId: JOB_B }]],
    'update:production_transfers': [[{ id: TRANSFER_ID }]],
  })
}

const dispatch = (body: unknown = DISPATCH_BODY) =>
  buildApp().request('/api/vendor/transfers', json(body))

const confirmReceipt = (id = TRANSFER_ID) =>
  buildApp().request(`/api/vendor/transfers/${id}/received`, json({}))

/**
 * Every audit row the request wrote, in order, with WHICH SIDE of the
 * transaction it was written on.
 *
 * `inTx` is the assertion this whole helper exists for: a success row must share
 * the transaction it describes, and a refusal row must not — it records that a
 * transaction rolled back, and writing it inside rolls the evidence back too.
 */
interface AuditRow {
  action?: string
  entityType?: string | null
  entityId?: string | null
  outcome?: string
  summary?: string | null
  metadata?: Record<string, unknown>
  inTx: boolean
}

const auditRows = (): AuditRow[] =>
  ops('insert', adminAuditLog).map((q) => ({
    ...((q.values ?? {}) as Omit<AuditRow, 'inTx'>),
    inTx: q.inTx,
  }))

const readSource = (relative: string) =>
  readFileSync(resolve(__dirname, '../../../src', relative), 'utf8')

/** Source with every comment removed, so a scan judges CODE and not prose. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Keys no vendor-facing body may carry, at any depth, in any casing. */
const CUSTOMER_FIELDS = [
  'orderId',
  'order_id',
  'orderNumber',
  'orderItemId',
  'customer',
  'customerName',
  'email',
  'phone',
  'address',
  'shippingAddress',
  'userId',
  'costAmount',
  'cost_amount',
  'fromVendorId',
  'toVendorId',
  'fromVendorName',
  'toVendorName',
  'vendorName',
  'lostAt',
  'lostNote',
]

function keysAtEveryDepth(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) keysAtEveryDepth(entry, out)
    return out
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.push(key.toLowerCase())
      keysAtEveryDepth(child, out)
    }
  }
  return out
}

const forbiddenIn = (value: unknown) =>
  [...new Set(keysAtEveryDepth(value))].filter((k) =>
    CUSTOMER_FIELDS.map((f) => f.toLowerCase()).includes(k)
  )

beforeEach(() => {
  reset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(vendorSessionFor('vendor'))
  queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]] })
})

// ============================================================================
// GET /api/vendor/transfers — what a vendor is told
// ============================================================================

describe('GET /transfers', () => {
  it('lists both ends of the caller, and nothing that is not theirs', async () => {
    queueRows({
      'select:production_transfers': [
        [transferRow({ direction: 'inbound' }), transferRow({ id: OTHER_TRANSFER_ID })],
      ],
    })

    const res = await buildApp().request('/api/vendor/transfers')
    expect(res.status).toBe(200)

    const read = ops('select', productionTransfers)[0]!
    const { sql, params: bound } = render(read.where)
    // Both directions, in ONE predicate. A vendor is a sender on some parcels
    // and a receiver on others, and a list that showed only one side would
    // leave half their work invisible.
    expect(sql).toContain('from_vendor_id')
    expect(sql).toContain('to_vendor_id')
    expect(bound).toContain(VENDOR_ID)
    expect(bound).not.toContain(OTHER_VENDOR_ID)
  })

  it('tells vendor B seven fields and a direction — never who sent it', async () => {
    queueRows({ 'select:production_transfers': [[transferRow({ direction: 'inbound' })]] })

    const res = await buildApp().request('/api/vendor/transfers')
    const body = await readJson<{ items: Array<Record<string, unknown>> }>(res)

    // THE PROJECTION, not the fixture. `body.items[0]` is `transferRow()`, which
    // this file wrote, so its keys prove nothing about what was asked for.
    expect(
      columnsOf(ops('select', productionTransfers)[0], 'the transfer list read'),
      'the vendor-facing transfer projection changed shape'
    ).toEqual(TRANSFER_KEYS)
    // ...and the two agree, which is what makes the body assertion meaningful
    // rather than circular.
    expect(Object.keys(body.items[0]!).sort()).toEqual(TRANSFER_KEYS)
    expect(body.items[0]!.direction).toBe('inbound')

    // The whole point of the narrow projection: B does not learn the parcel
    // came from A. If B needs to chase a carrier, an admin chases it.
    const serialised = JSON.stringify(body)
    expect(serialised).not.toContain(OTHER_VENDOR_ID)
    expect(serialised).not.toContain(ORDER_ID)
    expect(forbiddenIn(body)).toEqual([])
  })

  it('computes the direction from the CALLER, never from a stored side', async () => {
    queueRows({ 'select:production_transfers': [[transferRow()]] })
    await buildApp().request('/api/vendor/transfers')

    // `direction` is a SQL case over the caller's own id, so the vendor columns
    // never come back as fields at all. Asserting it on the rendered projection
    // is the only place that is visible.
    const source = stripComments(readSource('lib/vendor-scope.ts'))
    expect(source).toMatch(/case when[\s\S]{0,200}toVendorId/)
  })

  it('clamps the page size rather than refusing it', async () => {
    queueRows({ 'select:production_transfers': [[transferRow()]] })
    await buildApp().request('/api/vendor/transfers?limit=100000')

    expect(ops('select', productionTransfers)[0]!.limit).toBeLessThanOrEqual(100)
  })
})

// ============================================================================
// GET /api/vendor/transfers/:id
// ============================================================================

// ============================================================================
// GET /api/vendor/transfers/candidates — what may go on a parcel, grouped
// ============================================================================

/**
 * The read the despatch screen is built on, and the reason it can exist.
 *
 * `POST /transfers` refuses `JOBS_SPAN_ORDERS`, but `listVendorJobs` omits
 * `order_id` on purpose — so the portal cannot tell which of a vendor's jobs
 * belong together, and a multi-select built on the job list is trial and error
 * against a 422. The grouping is therefore the SERVER'S: it groups by
 * `order_id` and returns the buckets without ever selecting the value it
 * grouped by, exactly as `createVendorTransfer` reaches the consolidator.
 *
 * The bucket has no identity of its own. It IS its job ids, so there is no new
 * handle on an order for a vendor to hold, correlate or replay.
 */
describe('GET /transfers/candidates', () => {
  const candidateRow = (jobs: Array<Record<string, unknown>>) => ({ jobs })

  const seedCandidates = (...groups: Array<Array<Record<string, unknown>>>) =>
    queueRows({ 'select:production_jobs': [groups.map(candidateRow)] })

  const job = (over: Record<string, unknown> = {}) => ({
    id: JOB_A,
    stage: 'print',
    dueAt: null,
    ...over,
  })

  /**
   * Hono matches in registration order, so `/transfers/:id` registered first
   * would swallow this path and answer 400 on a uuid check against the word
   * "candidates" — a route that exists and is unreachable.
   */
  it('is not swallowed by the :id route', async () => {
    seedCandidates([job()])

    const res = await buildApp().request('/api/vendor/transfers/candidates')

    expect(res.status).toBe(200)
    expect(ops('select', productionTransfers)).toHaveLength(0)
  })

  it('groups the caller`s own dispatchable jobs, one bucket per order', async () => {
    seedCandidates([job(), job({ id: JOB_B, stage: 'frame' })], [job({ id: FOREIGN_JOB })])

    const res = await buildApp().request('/api/vendor/transfers/candidates')
    const body = await readJson<{ groups: Array<{ jobs: Array<{ id: string }> }> }>(res)

    expect(body.groups).toHaveLength(2)
    expect(body.groups[0]?.jobs.map((j) => j.id)).toEqual([JOB_A, JOB_B])
    expect(body.groups[1]?.jobs.map((j) => j.id)).toEqual([FOREIGN_JOB])
  })

  it('scopes the read to the caller, and to nobody else', async () => {
    seedCandidates([job()])

    await buildApp().request('/api/vendor/transfers/candidates')

    const read = ops('select', productionJobs)[0]!
    const { sql, params: bound } = render(read.where)
    expect(sql).toContain('vendor_id')
    expect(bound).toContain(VENDOR_ID)
    expect(bound).not.toContain(OTHER_VENDOR_ID)
  })

  /**
   * Every refusal `createVendorTransfer` can answer with, asked BEFORE the
   * vendor packs a box rather than after. A group this read offers is a group
   * the POST accepts.
   */
  it('offers only jobs that have passed QC and are free to travel', async () => {
    seedCandidates([job()])

    await buildApp().request('/api/vendor/transfers/candidates')

    const read = ops('select', productionJobs)[0]!
    const { sql, params: bound } = render(read.where)

    // ILLEGAL_TRANSITION: only `qc_passed` carries a vendor edge to dispatched.
    expect(bound).toContain('qc_passed')
    // JOB_SETTLED: a settled job is frozen.
    expect(sql).toContain('settlement_id')
    // JOB_ALREADY_ON_TRANSFER: a job rides exactly one parcel, ever.
    expect(sql).toContain('job_id')
    // NO_CONSOLIDATOR and CONSOLIDATOR_IS_SELF: there has to be somewhere to
    // send it, and it must not be this bench.
    expect(sql).toContain('vendor_id')
  })

  it('tells the vendor three fields per job and no more', async () => {
    seedCandidates([job({ dueAt: PAST })])

    const res = await buildApp().request('/api/vendor/transfers/candidates')
    const body = await readJson<{ groups: Array<{ jobs: Array<Record<string, unknown>> }> }>(res)

    expect(Object.keys(body.groups[0]!.jobs[0]!).sort()).toEqual(['dueAt', 'id', 'stage'])
  })

  /**
   * THE property. The grouping is by `order_id` and the projection must not
   * contain it — asserted on what was asked of the database, because the rows
   * come from a fixture this file wrote.
   */
  it('groups by the order without ever selecting it', async () => {
    seedCandidates([job()])

    const res = await buildApp().request('/api/vendor/transfers/candidates')
    const body = await readJson(res)

    expect(columnsOf(ops('select', productionJobs)[0], 'the candidates read')).toEqual(['jobs'])
    expect(JSON.stringify(body)).not.toContain(ORDER_ID)
    expect(JSON.stringify(body)).not.toContain(OTHER_VENDOR_ID)
    expect(forbiddenIn(body)).toEqual([])
  })

  it('says there is nothing to send rather than failing', async () => {
    seedCandidates()

    const res = await buildApp().request('/api/vendor/transfers/candidates')
    const body = await readJson<{ groups: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.groups).toEqual([])
  })
})

describe('GET /transfers/:id', () => {
  it("answers 404 for another vendor's transfer, even with a correct id", async () => {
    // The scoped read binds the caller on both sides, so the row is NOT FOUND
    // rather than forbidden. 403 would confirm it exists, which is the one fact
    // a vendor must not learn about a parcel that is none of their business.
    queueRows({ 'select:production_transfers': [[]] })

    const res = await buildApp().request(`/api/vendor/transfers/${OTHER_TRANSFER_ID}`)
    expect(res.status).toBe(404)

    const read = ops('select', productionTransfers)[0]!
    expect(params(read.where)).toContain(VENDOR_ID)
    expect(params(read.where)).not.toContain(OTHER_VENDOR_ID)
    // Nothing was written on the way to the refusal.
    expect(queries.filter((q) => q.op !== 'select')).toEqual([])
  })

  it('lists only the caller\'s OWN jobs on the parcel', async () => {
    queueRows({
      'select:production_transfers': [[transferRow()]],
      'select:production_jobs': [[{ id: JOB_A }, { id: JOB_B }]],
    })

    const res = await buildApp().request(`/api/vendor/transfers/${TRANSFER_ID}`)
    const body = await readJson<{ transfer: Record<string, unknown>; jobIds: string[] }>(res)

    expect(res.status).toBe(200)
    expect(body.jobIds).toEqual([JOB_A, JOB_B])
    expect(
      columnsOf(ops('select', productionTransfers)[0], 'the single-transfer read')
    ).toEqual(TRANSFER_KEYS)
    expect(Object.keys(body.transfer).sort()).toEqual(TRANSFER_KEYS)

    // The manifest read asks for the job ID and NOTHING else — a second column
    // here would be a handle on the sender's work, which is the smaller version
    // of the sender's name.
    expect(columnsOf(ops('select', productionJobs)[0], 'the manifest read')).toEqual(['id'])

    // The join is entered from the caller's own jobs. A receiving vendor holds
    // none of the jobs on the parcel — they belong to the sender — so B gets an
    // empty list rather than a handle on somebody else's row.
    const jobRead = ops('select', productionJobs)[0]!
    expect(params(jobRead.where)).toContain(VENDOR_ID)
    expect(render(jobRead.where).sql).toContain('vendor_id')
  })

  it('gives an inbound parcel no job ids at all', async () => {
    queueRows({
      'select:production_transfers': [[transferRow({ direction: 'inbound' })]],
      'select:production_jobs': [[]],
    })

    const res = await buildApp().request(`/api/vendor/transfers/${TRANSFER_ID}`)
    const body = await readJson<{ jobIds: string[] }>(res)

    expect(body.jobIds).toEqual([])
    expect(forbiddenIn(body)).toEqual([])
  })
})

// ============================================================================
// POST /api/vendor/transfers — vendor A despatches
// ============================================================================

describe('POST /transfers', () => {
  it('creates the parcel, moves its jobs, and answers 201', async () => {
    seedDispatchable()

    const res = await dispatch()
    const body = await readJson<{ transfer: Record<string, unknown>; jobIds: string[] }>(res)

    expect(res.status).toBe(201)
    // The created parcel is answered straight out of `.returning({...})`, so
    // THAT is the projection this response's shape is decided by.
    expect(
      returnedColumnsOf(ops('insert', productionTransfers)[0], 'the transfer insert'),
      'the created-transfer projection changed shape'
    ).toEqual(TRANSFER_KEYS)
    expect(Object.keys(body.transfer).sort()).toEqual(TRANSFER_KEYS)
    expect(body.jobIds.sort()).toEqual([JOB_A, JOB_B].sort())
    expect(forbiddenIn(body)).toEqual([])

    expect(recorder.tx.commits).toBe(1)
    expect(recorder.tx.rollbacks).toBe(0)
    // The other half of the rollback property: on a COMMITTED transaction the
    // rows that were issued are the rows that survive. Without this, the
    // "nothing survived" assertions below would also pass against a recorder
    // that marked everything rolled back.
    expect(recorder.survivors('insert', productionTransfers)).toHaveLength(1)
    expect(recorder.survivors('update', productionJobs)).toHaveLength(1)
  })

  it('writes from_vendor_id from the SESSION and to_vendor_id from the consolidator', async () => {
    seedDispatchable()
    await dispatch()

    const inserted = ops('insert', productionTransfers)[0]!.values as Record<string, unknown>
    // A transfer is created only by `from_vendor_id`, and there is no field in
    // which to say otherwise: the sender is the session, full stop.
    expect(inserted.fromVendorId).toBe(VENDOR_ID)
    // The destination is DERIVED. We chose the routing, so a vendor does not get
    // to name a counterparty — and naming one would be a vendor learning who the
    // other vendors on this order are.
    expect(inserted.toVendorId).toBe(OTHER_VENDOR_ID)
  })

  it('stamps dispatched_at from OUR clock and never from the body', async () => {
    seedDispatchable()
    const before = Date.now()
    await dispatch({ ...DISPATCH_BODY, dispatchedAt: '2020-01-01T00:00:00.000Z' })

    // `.strict()`, so back-dating a despatch is a 400 rather than a silently
    // dropped field: a vendor back-dating an SLA clock is a lie, and the only
    // way to make it unsayable is to give it no field to say it in.
    expect(ops('insert', productionTransfers)).toEqual([])

    reset()
    seedDispatchable()
    await dispatch()
    const inserted = ops('insert', productionTransfers)[0]!.values as Record<string, unknown>
    expect((inserted.dispatchedAt as Date).getTime()).toBeGreaterThanOrEqual(before)
  })

  it('never lets a vendor price the leg — cost_amount is refused and never written', async () => {
    seedDispatchable()
    const res = await dispatch({ ...DISPATCH_BODY, costAmount: '499.00' })

    // We pay the leg because we chose the routing. A vendor cannot price a
    // distance we picked, and asking A to absorb it is how rate cards get padded.
    expect(res.status).toBe(400)
    expect(ops('insert', productionTransfers)).toEqual([])

    reset()
    seedDispatchable()
    await dispatch()
    const inserted = ops('insert', productionTransfers)[0]!.values as Record<string, unknown>
    expect(inserted).not.toHaveProperty('costAmount')
  })

  it('refuses a body that names the counterparty or the order', async () => {
    for (const extra of [
      { toVendorId: OTHER_VENDOR_ID },
      { fromVendorId: OTHER_VENDOR_ID },
      { orderId: ORDER_ID },
      { receivedAt: new Date().toISOString() },
      { lostAt: new Date().toISOString() },
    ]) {
      reset()
      seedDispatchable()
      const res = await dispatch({ ...DISPATCH_BODY, ...extra })
      expect(res.status, `accepted ${JSON.stringify(extra)}`).toBe(400)
      expect(ops('insert', productionTransfers)).toEqual([])
    }
  })

  it("answers 404 for another vendor's job and writes nothing", async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      // The locked scan is scoped, so the foreign job simply is not there.
      'select:production_jobs': [[jobLockRow(JOB_A)]],
    })

    const res = await dispatch({ ...DISPATCH_BODY, jobIds: [JOB_A, FOREIGN_JOB] })
    expect(res.status).toBe(404)

    expect(ops('insert', productionTransfers)).toEqual([])
    expect(ops('update', productionJobs)).toEqual([])
    expect(recorder.tx.rollbacks).toBe(1)

    const scan = ops('select', productionJobs)[0]!
    expect(params(scan.where)).toContain(VENDOR_ID)
  })

  it('refuses a job that is already on a transfer — one job, one parcel, ever', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_jobs': [[jobLockRow(JOB_A), jobLockRow(JOB_B)], [routingRow()]],
      'select:production_transfer_jobs': [[{ jobId: JOB_B }]],
    })

    const res = await dispatch()
    const body = await readJson<{ error: string; code: string; jobIds: string[] }>(res)

    // `production_transfer_jobs_job_id_unique` is the real enforcement; this
    // check exists so the answer names the job instead of being a 500 out of the
    // index. A lost parcel produces a REPLACEMENT job, never a second leg.
    expect(res.status).toBe(409)
    expect(body.code).toBe('JOB_ALREADY_ON_TRANSFER')
    expect(body.jobIds).toEqual([JOB_B])
    expect(ops('insert', productionTransfers)).toEqual([])
    expect(ops('insert', productionTransferJobs)).toEqual([])
    expect(recorder.tx.rollbacks).toBe(1)
  })

  it('refuses jobs that span more than one order', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_jobs': [
        [jobLockRow(JOB_A), jobLockRow(JOB_B)],
        [routingRow({ orderCount: 2 })],
      ],
    })

    const res = await dispatch()
    const body = await readJson<{ code: string }>(res)

    // One parcel, one order: `production_transfers.order_id` is single-valued,
    // and the readiness gate reads every transfer on ONE order.
    expect(res.status).toBe(422)
    expect(body.code).toBe('JOBS_SPAN_ORDERS')
    expect(ops('insert', productionTransfers)).toEqual([])
  })

  it('refuses when no consolidator has been decided yet', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_jobs': [
        [jobLockRow(JOB_A), jobLockRow(JOB_B)],
        [routingRow({ consolidatorVendorId: null })],
      ],
    })

    const res = await dispatch()
    const body = await readJson<{ code: string }>(res)

    // Absence is meaningful: `order_consolidation` has no row, so nobody has
    // decided who assembles this order and there is nowhere to send the parcel.
    expect(res.status).toBe(409)
    expect(body.code).toBe('NO_CONSOLIDATOR')
    expect(ops('insert', productionTransfers)).toEqual([])
  })

  it('refuses to let the consolidator courier a parcel to itself — B cannot create', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_jobs': [
        [jobLockRow(JOB_A), jobLockRow(JOB_B)],
        [routingRow({ consolidatorVendorId: VENDOR_ID })],
      ],
    })

    const res = await dispatch()
    const body = await readJson<{ code: string }>(res)

    // The receiving vendor is the one who assembles the order. There is no leg
    // for them to book — the goods are already on their bench — so the whole
    // create surface is closed to the receiving end by construction.
    expect(res.status).toBe(422)
    expect(body.code).toBe('CONSOLIDATOR_IS_SELF')
    expect(ops('insert', productionTransfers)).toEqual([])
  })

  it('refuses a job the matrix will not move, with the matrix\'s own remedy', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_jobs': [
        [jobLockRow(JOB_A), jobLockRow(JOB_B, { status: 'received' })],
        [routingRow()],
      ],
      'select:production_transfer_jobs': [[]],
    })

    const res = await dispatch()
    const body = await readJson<{ code: string; allowed?: string[] }>(res)

    // Decided by `lib/production-transitions.ts`, not by a literal here: only
    // `qc_passed -> dispatched` carries a vendor edge, so a job still in QC has
    // nothing to ride a parcel with.
    expect(res.status).toBe(409)
    expect(body.code).toBe('ILLEGAL_TRANSITION')
    expect(ops('insert', productionTransfers)).toEqual([])
  })

  it('refuses a cancelled job and a settled job', async () => {
    for (const [over, code] of [
      [{ status: 'cancelled' }, 'JOB_CANCELLED'],
      [{ settlementId: 'set-1' }, 'JOB_SETTLED'],
    ] as const) {
      reset()
      queueRows({
        'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
        'select:production_jobs': [
          [jobLockRow(JOB_A), jobLockRow(JOB_B, over)],
          [routingRow()],
        ],
        'select:production_transfer_jobs': [[]],
      })

      const res = await dispatch()
      const body = await readJson<{ code: string }>(res)
      expect(res.status).toBe(409)
      expect(body.code).toBe(code)
      expect(ops('insert', productionTransfers)).toEqual([])
    }
  })

  // --------------------------------------------------------------------------
  // The transfer and its jobs move together, or not at all
  // --------------------------------------------------------------------------

  it('inserts the parcel BEFORE evaluating the guard the moved edge names', async () => {
    seedDispatchable()
    await dispatch()

    // `qc_passed -> dispatched` is guarded by `open-transfer-or-order-label`.
    // Despatching is what makes that edge legal, so the parcel has to exist —
    // inside this transaction — before the guard is asked. Evaluated, not
    // assumed: an edge whose guard nobody evaluates is an unguarded edge with a
    // comment.
    const insertAt = queries.indexOf(ops('insert', productionTransfers)[0]!)
    const linkAt = queries.indexOf(ops('insert', productionTransferJobs)[0]!)
    const updateAt = queries.indexOf(ops('update', productionJobs)[0]!)

    expect(insertAt).toBeLessThan(linkAt)
    expect(linkAt).toBeLessThan(updateAt)

    // ONE guard read per job on the parcel, and every one of them issued after
    // the links exist and before anything moves. Counted rather than merely
    // present: a loop that evaluated the guard for the first job and assumed the
    // rest would satisfy exactly a "there was a guard read" assertion.
    const guardReadsAt = ops('select', productionJobs)
      .map((q) => queries.indexOf(q))
      .filter((at) => at > linkAt && at < updateAt)
    expect(guardReadsAt).toHaveLength(DISPATCH_BODY.jobIds.length)
    // Every read the decision rests on is inside the transaction.
    expect(ops('select', productionJobs).every((q) => q.inTx)).toBe(true)
    expect(ops('insert', productionTransfers).every((q) => q.inTx)).toBe(true)
    expect(ops('update', productionJobs).every((q) => q.inTx)).toBe(true)
  })

  it('rolls the whole thing back when the guard is not satisfied', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_jobs': [
        [jobLockRow(JOB_A)],
        [routingRow()],
        // No transfer, no order label: the guard sees nothing.
        [{ transferId: null, hasOrderLabel: false }],
      ],
      'select:production_transfer_jobs': [[]],
      'insert:production_transfers': [[transferRow()]],
      'insert:production_transfer_jobs': [[]],
    })

    const res = await dispatch({ ...DISPATCH_BODY, jobIds: [JOB_A] })
    expect(res.status).toBe(409)

    // A transfer whose jobs never moved is exactly the state this ordering
    // exists to make impossible, so the insert goes back with everything else.
    // ISSUED and SURVIVING are different facts here, and only the second one is
    // the property: the parcel row WAS written — the guard reads it, which is
    // why the insert comes first — and it is gone afterwards. Asserting
    // `rollbacks` alone proved only that the callback threw.
    expect(ops('insert', productionTransfers)).toHaveLength(1)
    expect(
      recorder.survivors('insert', productionTransfers),
      'the parcel survived a transaction that rolled back'
    ).toEqual([])
    expect(recorder.survivors('insert', productionTransferJobs)).toEqual([])
    expect(ops('update', productionJobs)).toEqual([])
    expect(recorder.tx.rollbacks).toBe(1)
    expect(recorder.tx.commits).toBe(0)
  })

  it('takes the whole parcel back when a write fails part-way through', async () => {
    seedDispatchable()
    // The jobs move LAST, so a driver failure there is the worst-placed one:
    // everything before it has already been written.
    recorder.failNext('update:production_jobs')

    const res = await dispatch()
    expect(res.status).toBe(500)

    expect(ops('insert', productionTransfers)).toHaveLength(1)
    expect(recorder.survivors('insert', productionTransfers)).toEqual([])
    expect(recorder.survivors('insert', productionTransferJobs)).toEqual([])
    expect(recorder.survivors('update', productionJobs)).toEqual([])
    expect(recorder.tx.rollbacks).toBe(1)
    expect(recorder.tx.commits).toBe(0)
  })

  it('leaves NO success row when the transaction throws at COMMIT', async () => {
    // §8 of the design, in as many words: *"run each mutating handler against a
    // `tx` that throws at commit; assert no success row survives and the
    // refusal row does."* The callback runs to the END here — every write is
    // issued, the audit row included — and then the commit fails, which is the
    // one shape a callback-throws test cannot reach.
    seedDispatchable()
    recorder.failCommit()

    const res = await dispatch()
    expect(res.status).toBe(500)

    expect(ops('insert', productionTransfers)).toHaveLength(1)
    expect(ops('update', productionJobs)).toHaveLength(1)
    expect(recorder.survivors('insert', productionTransfers)).toEqual([])
    expect(recorder.survivors('update', productionJobs)).toEqual([])

    // The despatch row SHARES the transaction, so it goes back with the parcel
    // it describes. A row saying "this parcel was despatched" beside a transfer
    // that never committed is the exact lie the sharing rule exists to prevent.
    expect(auditRows()).toHaveLength(1)
    expect(auditRows()[0]!.outcome).toBe('success')
    expect(recorder.survivors('insert', adminAuditLog)).toEqual([])

    expect(recorder.tx.rollbacks).toBe(1)
    expect(recorder.tx.commits).toBe(0)
  })

  it('repeats the predicate in the UPDATE and rolls back on a row-count mismatch', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_jobs': [
        [jobLockRow(JOB_A), jobLockRow(JOB_B)],
        [routingRow()],
        [guardRow],
      ],
      'select:production_transfer_jobs': [[]],
      'insert:production_transfers': [[transferRow()]],
      'insert:production_transfer_jobs': [[]],
      // Somebody moved one of them in between.
      'update:production_jobs': [[{ id: JOB_A }]],
    })

    const res = await dispatch()
    const body = await readJson<{ code: string }>(res)

    expect(res.status).toBe(409)
    expect(body.code).toBe('CONCURRENT_MODIFICATION')
    expect(recorder.tx.rollbacks).toBe(1)

    const write = ops('update', productionJobs)[0]!
    const { sql } = render(write.where)
    // The predicate is REPEATED rather than trusted from the locked read:
    // anybody who moved or settled a job in between wins, and we match nothing.
    expect(sql).toContain('vendor_id')
    expect(sql).toContain('status')
    expect(sql).toContain('settlement_id')
    expect(params(write.where)).toContain(VENDOR_ID)
  })

  it('stamps the job clock ourselves, and only the dispatch columns', async () => {
    seedDispatchable()
    await dispatch()

    const set = ops('update', productionJobs)[0]!.values as Record<string, unknown>
    expect(set.status).toBe('dispatched')
    expect(set.dispatchedAt).toBeInstanceOf(Date)
    expect(Object.keys(set).sort()).toEqual(['dispatchedAt', 'status', 'updatedAt'])
  })

  it('never selects the order id into this process', async () => {
    seedDispatchable()
    await dispatch()

    // `production_transfers.order_id` is NOT NULL and is a person-linked handle
    // R1 forbids, so it is written through a scoped sub-select and never read
    // out. "One order" is a count, not a comparison of values we hold.
    const inserted = ops('insert', productionTransfers)[0]!.values as Record<string, unknown>
    expect(inserted.orderId).toBeDefined()
    expect(typeof inserted.orderId).not.toBe('string')

    const source = stripComments(readSource('lib/vendor-scope.ts'))
    expect(source).not.toMatch(/orderId:\s*productionJobs\.orderId/)
  })
})

// ============================================================================
// POST /api/vendor/transfers/:id/received — vendor B confirms
// ============================================================================

describe('POST /transfers/:id/received', () => {
  it('confirms an inbound parcel and stamps received_at from our clock', async () => {
    seedReceivable()
    const before = Date.now()

    const res = await confirmReceipt()
    const body = await readJson<{ transfer: Record<string, unknown> }>(res)

    expect(res.status).toBe(200)

    // Two reads of one table, and they are DIFFERENT projections on purpose.
    // The locked read is internal and needs `lostAt` to decide the refusal; the
    // re-read that becomes the response must never carry it. Reading both off
    // the fixture would make that distinction invisible, since the fixture is
    // what decides which keys come back.
    const [locked, reread] = ops('select', productionTransfers)
    expect(columnsOf(locked, 'the locked receipt read')).toContain('lostAt')
    expect(columnsOf(reread, 'the receipt re-read')).toEqual(TRANSFER_KEYS)
    // `isLost` is the ANSWER and is theirs; `lostAt` is when, and `lostNote` is
    // an admin writing about another vendor's failure. Neither ever crosses.
    expect(columnsOf(reread, 'the receipt re-read')).toContain('isLost')
    expect(columnsOf(reread, 'the receipt re-read')).not.toContain('lostAt')
    expect(columnsOf(reread, 'the receipt re-read')).not.toContain('lostNote')

    expect(Object.keys(body.transfer).sort()).toEqual(TRANSFER_KEYS)
    expect(forbiddenIn(body)).toEqual([])

    const set = ops('update', productionTransfers)[0]!.values as Record<string, unknown>
    expect(Object.keys(set).sort()).toEqual(['receivedAt', 'updatedAt'])
    expect((set.receivedAt as Date).getTime()).toBeGreaterThanOrEqual(before)
  })

  it('scopes the locked read to to_vendor_id — the sender gets a 404', async () => {
    // `received_at` is settable ONLY by `to_vendor_id`. It is not an `if` in the
    // handler: the read names the receiving side, so vendor A asking about their
    // own outbound parcel finds nothing.
    queueRows({ 'select:production_transfers': [[]] })

    const res = await confirmReceipt()
    expect(res.status).toBe(404)

    const read = ops('select', productionTransfers)[0]!
    expect(render(read.where).sql).toContain('to_vendor_id')
    expect(render(read.where).sql).not.toContain('from_vendor_id')
    expect(params(read.where)).toContain(VENDOR_ID)
    expect(ops('update', productionTransfers)).toEqual([])
  })

  it('refuses a parcel that has not been dispatched', async () => {
    seedReceivable({ dispatchedAt: null })

    const res = await confirmReceipt()
    const body = await readJson<{ code: string }>(res)

    expect(res.status).toBe(409)
    expect(body.code).toBe('TRANSFER_NOT_DISPATCHED')
    expect(ops('update', productionTransfers)).toEqual([])
  })

  it('refuses a parcel that already arrived, and one already declared lost', async () => {
    for (const [over, code] of [
      [{ receivedAt: PAST }, 'TRANSFER_ALREADY_RECEIVED'],
      [{ lostAt: PAST }, 'TRANSFER_LOST'],
    ] as const) {
      reset()
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]] })
      seedReceivable(over)

      const res = await confirmReceipt()
      const body = await readJson<{ code: string }>(res)
      expect(res.status).toBe(409)
      expect(body.code).toBe(code)
      expect(ops('update', productionTransfers)).toEqual([])
    }
  })

  it('repeats all three timestamp predicates in the UPDATE and rolls back a race', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_transfers': [[receiptLockRow()]],
      // Somebody else claimed it between the read and the write.
      'update:production_transfers': [[]],
    })

    const res = await confirmReceipt()
    const body = await readJson<{ code: string }>(res)

    expect(res.status).toBe(409)
    expect(body.code).toBe('CONCURRENT_MODIFICATION')
    expect(recorder.tx.rollbacks).toBe(1)

    const write = ops('update', productionTransfers)[0]!
    const { sql } = render(write.where)
    expect(sql).toContain('to_vendor_id')
    expect(sql).toContain('dispatched_at')
    expect(sql).toContain('received_at')
    expect(sql).toContain('lost_at')
  })

  it('confirms nothing when the transaction throws at COMMIT', async () => {
    // The second mutating handler, against §8's requirement. A parcel that is
    // recorded as arrived when the commit failed is the worst version of this:
    // the sending vendor is off the hook for a parcel nobody has.
    seedReceivable()
    recorder.failCommit()

    const res = await confirmReceipt()
    expect(res.status).toBe(500)

    expect(ops('update', productionTransfers)).toHaveLength(1)
    expect(recorder.survivors('update', productionTransfers)).toEqual([])
    expect(auditRows()).toHaveLength(1)
    expect(recorder.survivors('insert', adminAuditLog)).toEqual([])
    expect(recorder.tx.rollbacks).toBe(1)
    expect(recorder.tx.commits).toBe(0)
  })

  it('moves no job — a received parcel is a fact about the parcel', async () => {
    seedReceivable()
    await confirmReceipt()

    // The consolidation case has no job for the receiving vendor to move: the
    // rolled poster has `frame_id NULL`, so B holds no row for it at all. The
    // readiness gate reads the TRANSFER, not a second status.
    expect(ops('update', productionJobs)).toEqual([])
    expect(ops('select', productionJobs)).toEqual([])
  })

  it('tells the receiving vendor nothing about the jobs it carried', async () => {
    seedReceivable()
    const res = await confirmReceipt()
    const body = await readJson<Record<string, unknown>>(res)

    // The manifest read exists for the audit row and for nothing else. The jobs
    // on a parcel belong to the SENDER, and handing B a set of stable handles on
    // A's work is a smaller version of handing B A's name.
    expect(JSON.stringify(body)).not.toContain(JOB_A)
    expect(JSON.stringify(body)).not.toContain(JOB_B)
    expect(Object.keys(body).sort()).toEqual(['message', 'transfer'])
  })
})

// ============================================================================
// The audit trail
// ============================================================================

describe('the audit rows', () => {
  it('records production_transfer.dispatched INSIDE the transaction', async () => {
    seedDispatchable()
    await dispatch()

    const rows = auditRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('production_transfer.dispatched')
    expect(rows[0]!.entityType).toBe('production_transfer')
    expect(rows[0]!.entityId).toBe(TRANSFER_ID)
    expect(rows[0]!.outcome).toBe('success')
    // A row saying "this parcel was despatched" beside a transfer that rolled
    // back is worse than no row, so this one SHARES the transaction.
    expect(rows[0]!.inTx).toBe(true)

    const metadata = rows[0]!.metadata!
    expect(metadata.vendorId).toBe(VENDOR_ID)
    expect((metadata.jobIds as string[]).sort()).toEqual([JOB_A, JOB_B].sort())
    expect(metadata.reference).toBe('DL-9911')
  })

  it('records production_transfer.received INSIDE the transaction', async () => {
    seedReceivable()
    await confirmReceipt()

    const rows = auditRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('production_transfer.received')
    expect(rows[0]!.outcome).toBe('success')
    expect(rows[0]!.inTx).toBe(true)
    expect(rows[0]!.metadata!.vendorId).toBe(VENDOR_ID)
    expect(rows[0]!.metadata!.reference).toBe('DL-9911')
    // The job ids and the reference, on BOTH rows: an admin reading the trail
    // has to be able to answer "what arrived" without joining anything.
    expect((rows[0]!.metadata!.jobIds as string[]).sort()).toEqual([JOB_A, JOB_B].sort())
  })

  it('leaves exactly one failure row that SURVIVES the rollback, written outside the tx', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_jobs': [[jobLockRow(JOB_A), jobLockRow(JOB_B)], [routingRow()]],
      'select:production_transfer_jobs': [[{ jobId: JOB_B }]],
    })

    const res = await dispatch()
    expect(res.status).toBe(409)

    const rows = auditRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.outcome).toBe('failure')
    // A refusal row records that a transaction was ROLLED BACK. Written inside
    // that transaction it would be rolled back too, erasing the evidence it
    // exists to preserve.
    expect(rows[0]!.inTx).toBe(false)
    // The other half of §8's pairing, and the half the title claims: it does not
    // merely sit outside the transaction, it SURVIVES the rollback. `inTx` says
    // where it was written; this says what is left afterwards.
    expect(recorder.survivors('insert', adminAuditLog)).toHaveLength(1)
    expect(recorder.tx.rollbacks).toBe(1)
    expect(rows[0]!.metadata!.vendorId).toBe(VENDOR_ID)
  })

  it('writes no refusal row for a 404 — there is no entity to refuse', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
      'select:production_transfers': [[]],
    })

    const res = await confirmReceipt(OTHER_TRANSFER_ID)
    expect(res.status).toBe(404)
    // A row confirming the transfer exists is the very fact the 404 withholds.
    expect(auditRows()).toEqual([])
  })

  it('records a receipt refusal outside the transaction too', async () => {
    seedReceivable({ receivedAt: PAST })

    await confirmReceipt()
    const rows = auditRows()

    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('production_transfer.received')
    expect(rows[0]!.outcome).toBe('failure')
    expect(rows[0]!.inTx).toBe(false)
  })
})

// ============================================================================
// The things a mock cannot prove
// ============================================================================

describe('the locking clause and the route invariant', () => {
  /**
   * `FOR UPDATE` is asserted ONCE, in `jobs.test.ts`, and it is asserted there
   * as a PAIRING rather than as a count.
   *
   * This file used to carry a verbatim copy of the counting version — five
   * `db.transaction(` against five `.for('update')` — and both copies were
   * satisfied by two locks in one transaction and none in another, by a lock
   * taken inside an `if`, and by a lock issued after the write it was supposed
   * to protect. The scan covers `lib/vendor-scope.ts` whole, so the copy added
   * no coverage; what it added was a second thing to keep in step. Strengthened
   * in one place instead: `jobs.test.ts` → "every transaction locks the row it
   * decides from, before it writes".
   */

  it('keeps routes/vendor.ts free of every database import', () => {
    // The route hands the transaction to `recordAudit` as an opaque insert
    // surface, so the audit row can share it without the router importing `db`,
    // a table or a query builder.
    const source = stripComments(readSource('routes/vendor.ts'))
    expect(source).not.toMatch(/from ["'][^"']*\/database/)
    expect(source).not.toMatch(/\bdrizzle-orm\b/)
  })
})

// ============================================================================
// The projection — the only place a column-level property is decidable
// ============================================================================

/**
 * Columns no vendor-facing read of this surface may ASK FOR.
 *
 * Not a list of keys to strip from a response — a list of values that must
 * never enter this process, because a value we hold is a value that reaches a
 * log, a trace or a crash dump whether or not a handler puts it in a body.
 *
 * `lostAt` is deliberately NOT here: the locked receipt read needs it to decide
 * the refusal, and the module's own comment says "READ, NEVER PROJECTED". That
 * distinction is asserted where it lives — the re-read that becomes the
 * response is checked not to carry it — rather than by banning the column
 * outright and forcing the refusal to be decided in application code.
 */
const FORBIDDEN_COLUMNS = [
  'orderId',
  'order_id',
  'fromVendorId',
  'from_vendor_id',
  'toVendorId',
  'to_vendor_id',
  'costAmount',
  'cost_amount',
  'lostNote',
  'createdBy',
  'customerName',
  'shippingAddress',
  'email',
  'phone',
].map((c) => c.toLowerCase())

/** Every projection this request asked for — SELECTs and `.returning` alike. */
const projectionsAsked = (): Array<{ what: string; columns: string[] | null }> =>
  queries.flatMap((q) => [
    ...(q.op === 'select' ? [{ what: `select:${q.table}`, columns: q.fields }] : []),
    ...(q.returning !== undefined
      ? [{ what: `${q.op}:${q.table} returning`, columns: q.returning }]
      : []),
  ])

describe('the vendor-facing projection', () => {
  it('the recorder actually captures the projection — this property is not vacuous', () => {
    // Without this guard, "the projection is the seven fields" and "the recorder
    // throws the projection away" produce identical green — `columnsOf` would
    // return [] for every query and match nothing. That is not hypothetical:
    // `select: () => builder('select')` discarded the argument until this
    // commit, so every column assertion in this file was a fixture agreeing
    // with itself.
    reset()
    const withColumns = recorder.db.select({
      id: productionTransfers.id,
      toVendorId: productionTransfers.toVendorId,
    }) as { from: (t: unknown) => unknown }
    withColumns.from(productionTransfers)
    expect(ops('select', productionTransfers)[0]!.fields).toEqual(['id', 'toVendorId'])

    reset()
    const wholesale = recorder.db.select() as { from: (t: unknown) => unknown }
    wholesale.from(productionTransfers)
    // `null` is WHOLESALE, and it is a different fact from "no columns" — which
    // is why `columnsOf` refuses it rather than sorting it into an empty list.
    expect(ops('select', productionTransfers)[0]!.fields).toBeNull()

    reset()
  })

  it.each([
    [
      'GET /transfers',
      () => {
        queueRows({ 'select:production_transfers': [[transferRow()]] })
        return buildApp().request('/api/vendor/transfers')
      },
    ],
    [
      'GET /transfers/:id',
      () => {
        queueRows({
          'select:production_transfers': [[transferRow()]],
          'select:production_jobs': [[{ id: JOB_A }]],
        })
        return buildApp().request(`/api/vendor/transfers/${TRANSFER_ID}`)
      },
    ],
    [
      'POST /transfers',
      () => {
        seedDispatchable()
        return dispatch()
      },
    ],
    [
      'POST /transfers/:id/received',
      () => {
        seedReceivable()
        return confirmReceipt()
      },
    ],
  ])('%s asks for no counterparty, order or cost column', async (_name, run) => {
    reset()
    queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]] })
    await run()

    for (const { what, columns } of projectionsAsked()) {
      // A wholesale read returns every column of every joined row, which is how
      // a forbidden one arrives without anybody typing its name.
      expect(columns, `${what} asked for the row WHOLESALE`).not.toBeNull()
      expect(
        (columns ?? []).filter((c) => FORBIDDEN_COLUMNS.includes(c.toLowerCase())),
        `${what} asked the database for a column this boundary may not hold`
      ).toEqual([])
    }
    // ...and the check saw something, rather than passing over an empty list.
    expect(projectionsAsked().length).toBeGreaterThan(0)
  })

  it('the forbidden-column check finds a planted column — this property is not vacuous', () => {
    const planted = ['id', 'toVendorId'].filter((c) => FORBIDDEN_COLUMNS.includes(c.toLowerCase()))
    expect(planted).toEqual(['toVendorId'])
    expect(['id', 'direction'].filter((c) => FORBIDDEN_COLUMNS.includes(c.toLowerCase()))).toEqual(
      []
    )
  })
})
