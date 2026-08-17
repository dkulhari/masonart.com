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

function nextRows(rec: RecordedQuery): unknown[] {
  // The one query answered by evaluation rather than by a fixture: the
  // vendor-scope aggregate, recognised by its projected `total` column.
  if (rec.op === 'select' && rec.table === 'production_jobs' && rec.fields && 'total' in rec.fields) {
    const params = render(rec.where).params
    const vendorId = params.find((p) => typeof p === 'string') as string | undefined
    const rows = seedJobs.filter((j) => j.vendorId === vendorId && j.settlementId == null)
    return [{ total: pgNumericSum(rows.map((j) => j.amountActual ?? j.amountExpected)) }]
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
  { id: JOB_A, vendorId: VENDOR_ID, amountExpected: '1200.50', amountActual: null, settlementId: null },
  { id: JOB_B, vendorId: VENDOR_ID, amountExpected: '800.00', amountActual: '755.75', settlementId: null },
  {
    id: JOB_SETTLED,
    vendorId: VENDOR_ID,
    amountExpected: '4000.00',
    amountActual: null,
    settlementId: SETTLEMENT_ID,
  },
  {
    id: JOB_FOREIGN,
    vendorId: OTHER_VENDOR_ID,
    amountExpected: '9999.00',
    amountActual: null,
    settlementId: null,
  },
]

const unsettledFor = (vendorId: string) =>
  JOBS.filter((j) => j.vendorId === vendorId && j.settlementId == null)

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

beforeEach(() => {
  queries.length = 0
  rowQueues.clear()
  failNext.clear()
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

    const body = await res.json()
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
    const body = await res.json()

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

    const body = await res.json()
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
    const body = await res.json()

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
    expect((await res.json()).error).toMatch(/vendor/i)

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
    expect((await res.json()).error).toMatch(/settled/i)

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

    const body = await res.json()
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
