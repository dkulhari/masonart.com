/**
 * Admin payables and settlements.
 *
 * Same harness as `tests/routes/admin/vendors.test.ts`: `src/database` is a
 * recording query builder and `src/auth` is stubbed so the REAL
 * `requireAuth`/`requireAdmin` run. Two additions, both load-bearing:
 *
 * 1. **`db.transaction` is modelled, not stubbed away.** The settlement is
 *    one transaction or it is a way to overpay a supplier, so the tests assert
 *    WHERE the calls happen (on `tx`, after the verification read) and that a
 *    rejected settlement records no write at all.
 *
 * 2. **The aggregate select is evaluated.** `lib/vendor-scope.getVendorPayableTotal`
 *    is a SQL `SUM(COALESCE(...))`; the endpoint sums the same rows in JS via
 *    `lib/vendor-payables.sumPayable`. Ticket #611 deferred the agreement test
 *    to this ticket. Here the mock answers that aggregate by adding the seeded
 *    rows with `pgNumericSum` below — decimal string arithmetic, deliberately
 *    NOT `sumPayable`'s paise-rounding — so the two sums are computed by two
 *    independent implementations over one set of rows and compared. Two
 *    implementations of one sum is exactly how a ledger drifts, and the vendor
 *    portal reads the other one.
 *
 * @see packages/api/src/routes/admin/vendor-payables.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import '../../setup'

import { productionJobs, vendorSettlements } from '../../../src/database/schema/production-jobs'

// ============================================================================
// Recording database mock
// ============================================================================

interface RecordedQuery {
  op: 'select' | 'insert' | 'update' | 'delete'
  table: string | null
  /** 'db' or 'tx' — the settlement's whole point is that it is 'tx'. */
  on: 'db' | 'tx'
  fields?: Record<string, unknown>
  where?: unknown
  values?: unknown
  limit?: number
}

const queries: RecordedQuery[] = []
/** Rows to hand back, keyed `op:table_name`, consumed in call order. */
const rowQueues = new Map<string, unknown[][]>()

/**
 * The rows the aggregate in `getVendorPayableTotal` is evaluated against. The
 * SAME rows are queued for the endpoint's row read, which is what makes the
 * agreement assertion meaningful rather than a comparison of two fixtures.
 */
interface SeedJob {
  id: string
  vendorId: string
  status: string
  amountExpected: string | null
  amountActual: string | null
  settlementId: string | null
}
let seedJobs: SeedJob[] = []

function tableName(table: unknown): string {
  try {
    return getTableConfig(table as never).name
  } catch {
    return 'unknown'
  }
}

/**
 * Postgres `SUM()` over decimal(10,2), by string arithmetic.
 *
 * Independent of `lib/vendor-payables` on purpose — it splits the decimal and
 * carries, where the library rounds through `Number * 100`. If the two ever
 * disagree, one of them is wrong and this test is the place that says so.
 */
function pgNumericSum(values: Array<string | null>): string {
  let rupees = 0
  let paise = 0
  for (const value of values) {
    if (value == null) continue
    const negative = value.trim().startsWith('-')
    const [whole = '0', fraction = '0'] = value.trim().replace('-', '').split('.')
    const p = Number(`${fraction}00`.slice(0, 2))
    const r = Number(whole)
    rupees += negative ? -r : r
    paise += negative ? -p : p
  }
  rupees += Math.floor(paise / 100)
  paise = ((paise % 100) + 100) % 100
  return `${rupees}.${String(paise).padStart(2, '0')}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The rows `getVendorPayableTotal`'s aggregate would actually see, evaluated
 * from the COMPILED WHERE rather than from a hand-copied filter.
 *
 * This is the difference between a test and a tripwire. A mock that hardcodes
 * "unsettled and not a phantom" agrees with itself whatever the source does, so
 * deleting the predicate from `lib/vendor-payables` would leave it green — the
 * exact shape of vacuity this feature has already shipped six times. Reading
 * the predicate off `render(where)` means the mock only excludes a phantom when
 * the source actually asked it to.
 */
function evaluateWhere(where: unknown): SeedJob[] {
  const { sql, params } = render(where)
  const vendorId = params.find((p) => typeof p === 'string' && UUID.test(p)) as string | undefined
  const unsettledOnly = sql.includes('"settlement_id" is null')
  // #695, read off the compiled SQL rather than assumed. The two wrong shapes
  // are told apart, not lumped together: a query that names `cancelled` and
  // nothing else drops kill fees, which is the OTHER bug and has to be visible
  // here as a different number rather than as the right one.
  const namesCancelled = params.includes('cancelled')
  const sparesAgreedAmounts = sql.includes('"amount_actual" is not null')

  const survivesCancellation = (j: SeedJob) => {
    if (!namesCancelled) return true
    if (j.status !== 'cancelled') return true
    return sparesAgreedAmounts && j.amountActual != null
  }

  return seedJobs.filter(
    (j) =>
      j.vendorId === vendorId &&
      (!unsettledOnly || j.settlementId == null) &&
      survivesCancellation(j)
  )
}

/**
 * Opt-in: answer the payables LIST read by evaluation too, not from a fixture.
 *
 * Off by default because the settlement tests hand-pick the rows their
 * `FOR UPDATE` verification read returns. On, a queued fixture cannot decide
 * what the endpoint sees — the compiled WHERE does — so a test about which rows
 * a predicate excludes is actually about the predicate.
 */
let evaluateJobReads = false

function nextRows(rec: RecordedQuery): unknown[] {
  // The one query answered by evaluation rather than by a fixture: the
  // vendor-scope aggregate, recognised by its projected `total` column.
  if (rec.op === 'select' && rec.table === 'production_jobs' && rec.fields && 'total' in rec.fields) {
    const rows = evaluateWhere(rec.where)
    return [{ total: pgNumericSum(rows.map((j) => j.amountActual ?? j.amountExpected)) }]
  }

  if (evaluateJobReads && rec.op === 'select' && rec.table === 'production_jobs' && rec.on === 'db') {
    return evaluateWhere(rec.where)
  }

  const queue = rowQueues.get(`${rec.op}:${rec.table}`)
  return queue && queue.length > 0 ? (queue.shift() as unknown[]) : []
}

function builder(on: 'db' | 'tx', op: RecordedQuery['op'], arg?: unknown) {
  const rec: RecordedQuery =
    op === 'select'
      ? { op, on, table: null, fields: (arg ?? undefined) as Record<string, unknown> | undefined }
      : { op, on, table: tableName(arg) }
  queries.push(rec)

  const chain = {
    from(t: unknown) {
      rec.table = tableName(t)
      return chain
    },
    leftJoin: () => chain,
    innerJoin: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    for: () => chain,
    returning: () => chain,
    where(w: unknown) {
      rec.where = w
      return chain
    },
    limit(n: number) {
      rec.limit = n
      return chain
    },
    offset: () => chain,
    set(v: unknown) {
      rec.values = v
      return chain
    },
    values(v: unknown) {
      rec.values = v
      return chain
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      const failure = failNext.get(`${rec.op}:${rec.table}`)
      if (failure) {
        failNext.delete(`${rec.op}:${rec.table}`)
        return Promise.reject(failure).then(resolve, reject)
      }
      return Promise.resolve(nextRows(rec)).then(resolve, reject)
    },
  }

  return chain
}

/** `op:table` → the error that call should reject with, once. */
const failNext = new Map<string, Error>()

function handle(on: 'db' | 'tx') {
  return {
    select: (fields?: unknown) => builder(on, 'select', fields),
    insert: (t: unknown) => builder(on, 'insert', t),
    update: (t: unknown) => builder(on, 'update', t),
    delete: (t: unknown) => builder(on, 'delete', t),
  }
}

vi.mock('../../../src/database', () => ({
  db: {
    ...{
      select: (fields?: unknown) => builder('db', 'select', fields),
      insert: (t: unknown) => builder('db', 'insert', t),
      update: (t: unknown) => builder('db', 'update', t),
      delete: (t: unknown) => builder('db', 'delete', t),
    },
    // A real transaction rolls back on throw. The mock cannot un-record, which
    // is fine: the tests that reject a settlement assert nothing was recorded
    // in the first place, which is the stronger property (422 before any write).
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(handle('tx')),
  },
}))

const mockGetSession = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

import { adminVendorPayablesApp } from '../../../src/routes/admin/vendor-payables'
import { getVendorPayableTotal } from '../../../src/lib/vendor-scope'
import { readJson } from '../../helpers/json'

// ============================================================================
// Helpers
// ============================================================================

const dialect = new PgDialect()

function render(condition: unknown): { sql: string; params: unknown[] } {
  if (!condition) return { sql: '', params: [] }
  const query = dialect.sqlToQuery(condition as SQL)
  return { sql: query.sql, params: query.params as unknown[] }
}

function queueRows(rows: Record<string, unknown[][]>) {
  for (const [key, batches] of Object.entries(rows)) {
    rowQueues.set(key, batches.map((b) => [...b]))
  }
}

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
  app.route('/api/admin/vendors', adminVendorPayablesApp)
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    return c.json({ error: err.message }, 500)
  })
  return app
}

const VENDOR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_VENDOR_ID = '22222222-2222-4222-8222-222222222222'
const JOB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const JOB_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const JOB_SETTLED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
const JOB_FOREIGN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
const SETTLEMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'

/** Two unsettled jobs (one with a negotiated override), one already settled. */
const JOBS: SeedJob[] = [
  {
    id: JOB_A,
    vendorId: VENDOR_ID,
    status: 'received',
    amountExpected: '1200.50',
    amountActual: null,
    settlementId: null,
  },
  {
    id: JOB_B,
    vendorId: VENDOR_ID,
    status: 'qc_passed',
    amountExpected: '800.00',
    amountActual: '755.75',
    settlementId: null,
  },
  {
    id: JOB_SETTLED,
    vendorId: VENDOR_ID,
    status: 'dispatched',
    amountExpected: '4000.00',
    amountActual: null,
    settlementId: SETTLEMENT_ID,
  },
  {
    id: JOB_FOREIGN,
    vendorId: OTHER_VENDOR_ID,
    status: 'received',
    amountExpected: '9999.00',
    amountActual: null,
    settlementId: null,
  },
]

/**
 * #695. The three shapes a cancellation can leave behind, all unsettled:
 *
 * - PHANTOM  cancelled before the vendor did anything. Only a rate-card
 *            expectation, which nobody agreed to. Owed: nothing.
 * - KILL FEE cancelled after real work, at a price an admin stated. Owed: 250.
 * - ZEROED   cancelled and explicitly written down to nothing. Owed: nothing,
 *            but §10.6 says it "still renders as a line" so the vendor can see
 *            that someone decided it rather than that it vanished.
 */
const JOB_PHANTOM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
const JOB_KILL_FEE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
const JOB_ZEROED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7'

const CANCELLED_JOBS: SeedJob[] = [
  {
    id: JOB_PHANTOM,
    vendorId: VENDOR_ID,
    status: 'cancelled',
    amountExpected: '500.00',
    amountActual: null,
    settlementId: null,
  },
  {
    id: JOB_KILL_FEE,
    vendorId: VENDOR_ID,
    status: 'cancelled',
    amountExpected: '900.00',
    amountActual: '250.00',
    settlementId: null,
  },
  {
    id: JOB_ZEROED,
    vendorId: VENDOR_ID,
    status: 'cancelled',
    amountExpected: '700.00',
    amountActual: '0.00',
    settlementId: null,
  },
]

const unsettledFor = (vendorId: string) =>
  JOBS.filter((j) => j.vendorId === vendorId && j.settlementId == null)

/** A settlement body the schema accepts; the id list is overridden per test. */
const validSettlement = {
  amount: '1956.25',
  reference: 'NEFT-2026-08-17-001',
  paidAt: '2026-08-17T10:00:00.000Z',
  jobIds: [JOB_A, JOB_B],
}

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

beforeEach(() => {
  queries.length = 0
  rowQueues.clear()
  failNext.clear()
  evaluateJobReads = false
  seedJobs = JOBS.map((j) => ({ ...j }))
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('admin'))
})

// ============================================================================
// GET /:id/payables
// ============================================================================

describe('GET /api/admin/vendors/:id/payables', () => {
  it('lists only unsettled jobs and totals COALESCE(actual, expected)', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [unsettledFor(VENDOR_ID)],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/payables`)
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.jobs.map((j: { id: string }) => j.id)).toEqual([JOB_A, JOB_B])
    // The override wins on JOB_B: 1200.50 + 755.75, never 1200.50 + 800.00.
    expect(body.total).toBe('1956.25')
    expect(body.jobCount).toBe(2)
    expect(body.jobs.find((j: { id: string }) => j.id === JOB_B).amount).toBe('755.75')

    // The unsettled predicate belongs in SQL, not in a JS filter after the
    // fact: all-history would grow without bound.
    const jobRead = queries.find((q) => q.op === 'select' && q.table === 'production_jobs')
    const { sql, params } = render(jobRead?.where)
    expect(sql).toContain('"settlement_id" is null')
    expect(params).toContain(VENDOR_ID)
  })

  it('404s an unknown vendor and 400s a malformed id', async () => {
    queueRows({ 'select:vendors': [[]] })
    const missing = await buildApp().request(`/api/admin/vendors/${OTHER_VENDOR_ID}/payables`)
    expect(missing.status).toBe(404)

    const malformed = await buildApp().request('/api/admin/vendors/not-a-uuid/payables')
    expect(malformed.status).toBe(400)
  })

  it('agrees with lib/vendor-scope.getVendorPayableTotal on the same rows (#611)', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [unsettledFor(VENDOR_ID)],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/payables`)
    const body = await readJson(res)

    // The vendor portal reads this one. Admin and vendor must never be able to
    // open the same month and see two different numbers.
    const scopeTotal = await getVendorPayableTotal(VENDOR_ID)
    expect(Number(body.total)).toBe(Number(scopeTotal))

    // And the aggregate is scoped the same way: this vendor, unsettled only.
    const aggregate = queries.find(
      (q) => q.op === 'select' && q.table === 'production_jobs' && q.fields && 'total' in q.fields
    )
    const { sql, params } = render(aggregate?.where)
    expect(sql).toContain('"settlement_id" is null')
    expect(params).toContain(VENDOR_ID)
  })
})

// ============================================================================
// POST /:id/settlements
// ============================================================================

describe('POST /api/admin/vendors/:id/settlements', () => {
  const validBody = {
    amount: '1956.25',
    reference: 'NEFT-2026-08-17-001',
    paidAt: '2026-08-17T10:00:00.000Z',
    jobIds: [JOB_A, JOB_B],
  }

  it('inserts one settlement and stamps the jobs, inside one transaction', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [unsettledFor(VENDOR_ID)],
      'insert:vendor_settlements': [[{ id: SETTLEMENT_ID, vendorId: VENDOR_ID, amount: '1956.25' }]],
      'update:production_jobs': [[{ id: JOB_A }, { id: JOB_B }]],
    })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json(validBody)
    )
    expect(res.status).toBe(201)

    const body = await readJson(res)
    expect(body.settlement.id).toBe(SETTLEMENT_ID)
    expect(body.jobsSettled).toBe(2)

    const insert = queries.find((q) => q.op === 'insert' && q.table === 'vendor_settlements')
    expect(insert?.on).toBe('tx')
    expect(insert?.values).toMatchObject({
      vendorId: VENDOR_ID,
      amount: '1956.25',
      reference: 'NEFT-2026-08-17-001',
      createdBy: 'admin-user-1',
    })

    const update = queries.find((q) => q.op === 'update' && q.table === 'production_jobs')
    expect(update?.on).toBe('tx')
    expect(update?.values).toMatchObject({ settlementId: SETTLEMENT_ID })

    // Verification read, then insert, then stamp — all on the same handle.
    const trace = queries
      .filter((q) => q.on === 'tx')
      .map((q) => `${q.op}:${q.table}`)
    expect(trace).toEqual([
      'select:production_jobs',
      'insert:vendor_settlements',
      'update:production_jobs',
    ])

    // Exactly one settlement row. Two would be two payments on record for one.
    expect(queries.filter((q) => q.op === 'insert' && q.table === 'vendor_settlements')).toHaveLength(1)
  })

  it('drops the payable total by the settled amount and hides those jobs afterwards', async () => {
    // What the database looks like after the settlement above.
    seedJobs = JOBS.map((j) =>
      j.id === JOB_A || j.id === JOB_B ? { ...j, settlementId: SETTLEMENT_ID } : { ...j }
    )
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [seedJobs.filter((j) => j.vendorId === VENDOR_ID && !j.settlementId)],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/payables`)
    const body = await readJson(res)

    expect(body.jobs).toEqual([])
    expect(body.total).toBe('0.00')
    expect(Number(body.total)).toBe(Number(await getVendorPayableTotal(VENDOR_ID)))
  })

  it("422s a job that belongs to another vendor, writing nothing", async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [[JOBS[0], JOBS[3]]],
    })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validBody, jobIds: [JOB_A, JOB_FOREIGN] })
    )
    expect(res.status).toBe(422)
    expect((await readJson(res)).error).toMatch(/vendor/i)

    expect(queries.some((q) => q.op === 'insert' || q.op === 'update')).toBe(false)
  })

  it('422s an already-settled job — a double settle is a silent overpay', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [[JOBS[0], JOBS[2]]],
    })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validBody, jobIds: [JOB_A, JOB_SETTLED] })
    )
    expect(res.status).toBe(422)
    expect((await readJson(res)).error).toMatch(/settled/i)

    expect(queries.some((q) => q.op === 'insert' || q.op === 'update')).toBe(false)
  })

  it('422s a job id that does not exist at all', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [[JOBS[0]]],
    })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validBody, jobIds: [JOB_A, JOB_B] })
    )
    expect(res.status).toBe(422)
    expect(queries.some((q) => q.op === 'insert')).toBe(false)
  })

  it('rejects an empty job list and a non-positive amount', async () => {
    const noJobs = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validBody, jobIds: [] })
    )
    expect(noJobs.status).toBe(400)

    const zero = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validBody, amount: '0' })
    )
    expect(zero.status).toBe(400)
  })

  it('404s a settlement against an unknown vendor', async () => {
    queueRows({ 'select:vendors': [[]] })

    const res = await buildApp().request(
      `/api/admin/vendors/${OTHER_VENDOR_ID}/settlements`,
      json(validBody)
    )
    expect(res.status).toBe(404)
    expect(queries.some((q) => q.op === 'insert')).toBe(false)
  })
})

// ============================================================================
// GET /:id/settlements
// ============================================================================

describe('GET /api/admin/vendors/:id/settlements', () => {
  it('lists what has been paid, most recent first', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_settlements': [
        [{ id: SETTLEMENT_ID, vendorId: VENDOR_ID, amount: '1956.25', reference: 'NEFT-1' }],
      ],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/settlements`)
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.settlements).toHaveLength(1)
    expect(body.settlements[0].amount).toBe('1956.25')

    const read = queries.find((q) => q.op === 'select' && q.table === 'vendor_settlements')
    expect(render(read?.where).params).toContain(VENDOR_ID)
  })
})

// ============================================================================
// Role gating — this is finance data
// ============================================================================

describe('role gating', () => {
  const routes: Array<[string, RequestInit]> = [
    [`/api/admin/vendors/${VENDOR_ID}/payables`, {}],
    [`/api/admin/vendors/${VENDOR_ID}/settlements`, {}],
    [
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ amount: '1.00', jobIds: [JOB_A] }),
    ],
  ]

  it.each(routes)('403s a content-manager on %s %#', async (path, init) => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'))

    const res = await buildApp().request(path, init)
    expect(res.status).toBe(403)
    expect(queries).toHaveLength(0)
  })

  it('403s a vendor-role user reading payables', async () => {
    mockGetSession.mockResolvedValue(sessionFor('vendor'))

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/payables`)
    expect(res.status).toBe(403)
  })

  it('401s an unauthenticated caller', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/payables`)
    expect(res.status).toBe(401)
  })
})

// ============================================================================
// #695 — a cancelled job strands a phantom payable
// ============================================================================

/**
 * The rule under test:
 *
 * > On a cancelled job, `amount_expected` is not a payable. Only an
 * > `amount_actual` an admin explicitly stated is.
 *
 * NOT `status <> 'cancelled'`. Design §10.6 says a cancelled job at `'0.00'`
 * "contributes zero and still renders as a line" — which means a cancelled job
 * at `'250.00'` contributes 250, the kill fee for work the vendor really did.
 * A blanket status exclusion would delete those silently, and it would
 * contradict `routes/admin/transfers.ts`, which leaves a lost transfer's
 * original payable intact because we owe for the work, not for the parcel.
 *
 * Every assertion here is reachable from the compiled query: the mock's
 * evaluator reads `render(where)` rather than a copy of the rule, so removing
 * the predicate from the source turns these red instead of leaving them green.
 */
describe('the cancellation rule (#695)', () => {
  beforeEach(() => {
    seedJobs = [...JOBS, ...CANCELLED_JOBS].map((j) => ({ ...j }))
    // The list read is answered from the compiled WHERE below, so nothing in
    // this block can pass by having been handed the right rows.
    evaluateJobReads = true
  })

  it('asks the database for it, in the payables WHERE', async () => {
    queueRows({ 'select:vendors': [[{ id: VENDOR_ID }]] })

    await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/payables`)

    const jobRead = queries.find((q) => q.op === 'select' && q.table === 'production_jobs')
    const { sql, params } = render(jobRead?.where)
    // Both halves, and in this order: a phantom is dropped, an agreed amount
    // survives. The `or` is the kill fee.
    expect(sql).toContain(
      '("production_jobs"."status" <> $2 or "production_jobs"."amount_actual" is not null)'
    )
    expect(params).toContain('cancelled')
    // Still in SQL, not a JS filter over all history.
    expect(sql).toContain('"settlement_id" is null')
  })

  it('keeps the phantom off the admin list, and the kill fee and the zero on it', async () => {
    queueRows({ 'select:vendors': [[{ id: VENDOR_ID }]] })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/payables`)
    expect(res.status).toBe(200)

    const body = await readJson(res)
    const ids = body.jobs.map((j: { id: string }) => j.id)
    expect(ids).not.toContain(JOB_PHANTOM)
    expect(ids).toContain(JOB_KILL_FEE)
    expect(ids).toContain(JOB_ZEROED)

    // The line the vendor and the admin can both explain: cancelled, and zero.
    // Rendered with its status beside it, not as an unexplained blank.
    const zeroed = body.jobs.find((j: { id: string }) => j.id === JOB_ZEROED)
    expect(zeroed).toMatchObject({ status: 'cancelled', amount: '0.00' })

    const killFee = body.jobs.find((j: { id: string }) => j.id === JOB_KILL_FEE)
    expect(killFee).toMatchObject({ status: 'cancelled', amount: '250.00' })

    // 1200.50 + 755.75 + 250.00 + 0.00. The phantom's 500.00 is absent.
    expect(body.total).toBe('2206.25')
  })

  it('agrees with getVendorPayableTotal over a row set containing all three (#611)', async () => {
    queueRows({ 'select:vendors': [[{ id: VENDOR_ID }]] })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/payables`)
    const body = await readJson(res)

    // The assertion carried over from #611, now over rows that can tell the two
    // rules apart. The vendor portal reads the second one: if it kept the
    // phantom the vendor would see 2706.25 owed on a screen with no way to
    // clear it, while the admin settling the same month saw 2206.25.
    const scopeTotal = await getVendorPayableTotal(VENDOR_ID)
    expect(Number(body.total)).toBe(Number(scopeTotal))
    expect(scopeTotal).toBe('2206.25')

    const aggregate = queries.find(
      (q) => q.op === 'select' && q.table === 'production_jobs' && q.fields && 'total' in q.fields
    )
    const { sql, params } = render(aggregate?.where)
    expect(sql).toContain(
      '("production_jobs"."status" <> $2 or "production_jobs"."amount_actual" is not null)'
    )
    expect(params).toContain('cancelled')
  })

  it('refuses to settle a phantom rather than quietly stamping it paid', async () => {
    evaluateJobReads = false
    // The list will not offer it, but the endpoint takes ids from a body. A
    // settlement that swallowed it would record a payment against a job nobody
    // agreed to pay for, and `settlement.amount` would then disagree with the
    // sum over its jobs — silently, because payables are derived.
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [[JOBS[0], CANCELLED_JOBS[0]]],
    })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validSettlement, jobIds: [JOB_A, JOB_PHANTOM] })
    )

    expect(res.status).toBe(422)
    const body = await readJson(res)
    expect(body.error).toContain(JOB_PHANTOM)
    // Nothing written at all, not a partial batch.
    expect(queries.some((q) => q.op === 'insert' || q.op === 'update')).toBe(false)
  })

  it('settles a cancelled job that carries an agreed amount', async () => {
    evaluateJobReads = false
    // The other direction, and the one a blanket `status <> cancelled` would
    // break: a kill fee must be payable AND clearable, or it sits on the
    // vendor's screen forever exactly like the phantom did.
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [[CANCELLED_JOBS[1], CANCELLED_JOBS[2]]],
      'insert:vendor_settlements': [[{ id: SETTLEMENT_ID, vendorId: VENDOR_ID, amount: '250.00' }]],
      'update:production_jobs': [[{ id: JOB_KILL_FEE }, { id: JOB_ZEROED }]],
    })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validSettlement, amount: '250.00', jobIds: [JOB_KILL_FEE, JOB_ZEROED] })
    )

    expect(res.status).toBe(201)
    expect((await readJson(res)).jobsSettled).toBe(2)
  })

  it('repeats the predicate in the settlement UPDATE, not just the read', async () => {
    evaluateJobReads = false
    // The file's own concurrency rule: the WHERE that decides is repeated in
    // the write, so a row that changed between the two produces a row-count
    // mismatch and a rollback rather than a half-stamped batch.
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [[JOBS[0], JOBS[1]]],
      'insert:vendor_settlements': [[{ id: SETTLEMENT_ID, vendorId: VENDOR_ID, amount: '1956.25' }]],
      'update:production_jobs': [[{ id: JOB_A }, { id: JOB_B }]],
    })

    await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validSettlement, jobIds: [JOB_A, JOB_B] })
    )

    const update = queries.find((q) => q.op === 'update' && q.table === 'production_jobs')
    const { sql, params } = render(update?.where)
    // $4: two job ids, then the vendor id, then this.
    expect(sql).toContain(
      '("production_jobs"."status" <> $4 or "production_jobs"."amount_actual" is not null)'
    )
    expect(sql).toContain('"settlement_id" is null')
    expect(params).toContain('cancelled')
  })

  it('reads status in the verification select, or it cannot judge one', async () => {
    evaluateJobReads = false
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:production_jobs': [[JOBS[0]]],
      'insert:vendor_settlements': [[{ id: SETTLEMENT_ID, vendorId: VENDOR_ID, amount: '1200.50' }]],
      'update:production_jobs': [[{ id: JOB_A }]],
    })

    await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/settlements`,
      json({ ...validSettlement, amount: '1200.50', jobIds: [JOB_A] })
    )

    const verification = queries.find(
      (q) => q.op === 'select' && q.table === 'production_jobs' && q.on === 'tx'
    )
    expect(Object.keys(verification?.fields ?? {})).toEqual(
      expect.arrayContaining(['status', 'amountActual', 'settlementId'])
    )
  })
})

// ============================================================================
// Module shape
// ============================================================================

describe('module exports', () => {
  it('exports the Hono app under both names', async () => {
    const mod = await import('../../../src/routes/admin/vendor-payables')
    expect(mod.adminVendorPayablesApp).toBeDefined()
    expect(mod.default).toBe(mod.adminVendorPayablesApp)
  })

  it('is mounted on the server at /api/admin/vendors', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../src/index.ts', import.meta.url), 'utf8')
    )
    expect(source).toContain('app.route("/api/admin/vendors", adminVendorPayablesApp)')
  })

  it('never touches the settlement columns outside a transaction', async () => {
    // A guard on the source rather than on one request: a later handler that
    // stamps settlement_id on `db` instead of `tx` is the regression.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../../../src/routes/admin/vendor-payables.ts', import.meta.url),
        'utf8'
      )
    )
    expect(source).not.toMatch(/db\s*\.\s*insert\(\s*vendorSettlements/)
    expect(source).toMatch(/db\.transaction/)
  })
})

// The seeded fixtures reference these tables; the imports keep the schema
// names in this file honest against a rename.
void productionJobs
void vendorSettlements
