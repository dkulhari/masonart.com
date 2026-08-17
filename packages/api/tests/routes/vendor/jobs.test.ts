/**
 * Vendor portal API — jobs, rates and payments.
 *
 * The harness is the one `tests/routes/admin/production-jobs.test.ts` uses:
 * `src/database` is a recording query builder, `src/auth` is mocked so each test
 * picks the caller, and the REAL `requireAuth` / `requireVendor` /
 * `lib/vendor-scope` run on top of it. The scoped module is deliberately NOT
 * mocked — the whole claim of this route tree is "no read escapes the vendor
 * filter", and mocking the module away would test the mock instead of the
 * filter. Every isolation assertion below reads the WHERE clause that actually
 * reached the driver.
 *
 * One difference from the admin harness: the row queues repeat their last batch
 * once exhausted. `getVendorJobItems` and `getVendorJobReviews` each re-load the
 * job through `getVendorJob` (that is how they scope themselves), so a single
 * request issues several `select:production_jobs`, and a strictly-consumed queue
 * would turn that into brittle batch-counting.
 *
 * @see packages/api/src/routes/vendor.ts
 * @see packages/api/src/lib/vendor-scope.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import '../../setup'

import { productionJobs } from '../../../src/database/schema/production-jobs'
import { vendorRates } from '../../../src/database/schema/vendors'

// ============================================================================
// Recording database mock
// ============================================================================

interface RecordedQuery {
  op: 'select' | 'insert' | 'update' | 'delete'
  table: string | null
  where?: unknown
  limit?: number
  offset?: number
  values?: unknown
}

const queries: RecordedQuery[] = []
/** Rows keyed `op:table_name`. The last batch repeats once the queue empties. */
const rowQueues = new Map<string, unknown[][]>()

function tableName(table: unknown): string {
  try {
    return getTableConfig(table as never).name
  } catch {
    return 'unknown'
  }
}

function nextRows(rec: RecordedQuery): unknown[] {
  const queue = rowQueues.get(`${rec.op}:${rec.table}`)
  if (!queue || queue.length === 0) return []
  return (queue.length === 1 ? queue[0] : queue.shift()) as unknown[]
}

function builder(op: RecordedQuery['op'], table?: unknown) {
  const rec: RecordedQuery = {
    op,
    table: table === undefined ? null : tableName(table),
  }
  queries.push(rec)

  const chain = {
    from(t: unknown) {
      rec.table = tableName(t)
      return chain
    },
    leftJoin: () => chain,
    innerJoin: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    returning: () => chain,
    where(w: unknown) {
      rec.where = w
      return chain
    },
    limit(n: number) {
      rec.limit = n
      return chain
    },
    offset(n: number) {
      rec.offset = n
      return chain
    },
    set(v: unknown) {
      rec.values = v
      return chain
    },
    values(v: unknown) {
      rec.values = v
      return chain
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(nextRows(rec)).then(resolve, reject)
    },
  }

  return chain
}

/** Function DECLARATION — `vi.mock`'s factory is hoisted above every const. */
function makeDb() {
  return {
    select: () => builder('select'),
    insert: (t: unknown) => builder('insert', t),
    update: (t: unknown) => builder('update', t),
    delete: (t: unknown) => builder('delete', t),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDb()),
  }
}

vi.mock('../../../src/database', () => ({ db: makeDb() }))

const mockGetSession = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}))

import { vendorApp } from '../../../src/routes/vendor'

// ============================================================================
// Helpers
// ============================================================================

const dialect = new PgDialect()

function params(condition: unknown): unknown[] {
  return dialect.sqlToQuery(condition as SQL).params as unknown[]
}

function queueRows(rows: Record<string, unknown[][]>) {
  for (const [key, batches] of Object.entries(rows)) {
    rowQueues.set(key, batches.map((b) => [...b]))
  }
}

function ops(op: RecordedQuery['op'], table: unknown): RecordedQuery[] {
  const name = tableName(table)
  return queries.filter((q) => q.op === op && q.table === name)
}

const VENDOR_ID = '33333333-3333-4333-8333-333333333333'
const JOB_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_JOB_ID = '2222222b-2222-4222-8222-222222222222'

function sessionFor(role: string, id = 'vendor-user-1') {
  const now = new Date()
  return {
    user: {
      id,
      name: 'Portal User',
      email: 'portal@example.com',
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
      userId: id,
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  }
}

function buildApp(): Hono {
  const app = new Hono()
  app.route('/api/vendor', vendorApp)
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    return c.json({ error: err.message }, 500)
  })
  return app
}

const PAST = new Date('2026-01-01T00:00:00Z')

/** A job row exactly as `getVendorJob`'s column list returns it. */
function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    stage: 'print',
    status: 'assigned',
    dueAt: PAST,
    sentAt: null,
    receivedAt: null,
    amountExpected: '100.00',
    amountActual: null,
    createdAt: PAST,
    ...over,
  }
}

const json = (body: unknown, method = 'PATCH') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/**
 * The forbidden vocabulary. Asserted over the serialised body so a leak nested
 * anywhere in the shape is caught, not only a leak at the top level.
 */
const CUSTOMER_FIELDS = [
  'orderId',
  'order_id',
  'orderNumber',
  'customer',
  'customerName',
  'email',
  'phone',
  'address',
  'shippingAddress',
]

function expectNoCustomerData(body: unknown) {
  const serialised = JSON.stringify(body)
  for (const field of CUSTOMER_FIELDS) {
    expect(serialised, `response leaks ${field}`).not.toContain(`"${field}"`)
  }
}

beforeEach(() => {
  queries.length = 0
  rowQueues.clear()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('vendor'))
  // The vendor_users -> vendors join requireVendor resolves the caller with.
  queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]] })
})

// ============================================================================
// GET /api/vendor/jobs
// ============================================================================

describe('GET /api/vendor/jobs', () => {
  it('lists only jobs scoped to the session vendor, paginated', async () => {
    queueRows({ 'select:production_jobs': [[jobRow(), jobRow({ id: OTHER_JOB_ID })]] })

    const res = await buildApp().request('/api/vendor/jobs?limit=5&offset=10')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.items).toHaveLength(2)

    // The filter reached the driver — not applied in JS after an unscoped read.
    const read = ops('select', productionJobs)[0]
    expect(read).toBeDefined()
    expect(params(read?.where)).toContain(VENDOR_ID)
    expect(read?.limit).toBe(5)
    expect(read?.offset).toBe(10)

    expectNoCustomerData(body)
  })

  it('passes a status filter through to the scoped query', async () => {
    queueRows({ 'select:production_jobs': [[jobRow({ status: 'sent' })]] })

    const res = await buildApp().request('/api/vendor/jobs?status=sent')
    expect(res.status).toBe(200)

    const read = ops('select', productionJobs)[0]
    const where = params(read?.where)
    expect(where).toContain(VENDOR_ID)
    expect(where).toContain('sent')
  })
})

// ============================================================================
// GET /api/vendor/jobs/:id
// ============================================================================

describe('GET /api/vendor/jobs/:id', () => {
  it('returns the job with its items and QC history', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[{ id: 'pji-1', orderItemId: 'oi-1' }]],
      'select:production_job_reviews': [
        [{ id: 'rev-1', verdict: 'fail', defects: ['scuff'], notes: null, createdAt: PAST }],
      ],
    })

    const res = await buildApp().request(`/api/vendor/jobs/${JOB_ID}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.job.id).toBe(JOB_ID)
    expect(body.items).toHaveLength(1)
    expect(body.reviews).toHaveLength(1)

    expect(params(ops('select', productionJobs)[0]?.where)).toContain(VENDOR_ID)
    expectNoCustomerData(body)
  })

  it("404s — not 403 — on another vendor's job, leaking nothing about its existence", async () => {
    queueRows({ 'select:production_jobs': [[]] })

    const res = await buildApp().request(`/api/vendor/jobs/${OTHER_JOB_ID}`)
    expect(res.status).toBe(404)

    // The miss came from a scoped read, so "not found" is the honest answer.
    expect(params(ops('select', productionJobs)[0]?.where)).toContain(VENDOR_ID)
  })
})

// ============================================================================
// PATCH /api/vendor/jobs/:id
// ============================================================================

describe('PATCH /api/vendor/jobs/:id', () => {
  it('updates status and the date fields', async () => {
    const receivedAt = '2026-08-01T10:00:00.000Z'
    queueRows({
      'select:production_jobs': [
        [jobRow()],
        [jobRow()],
        [jobRow({ status: 'received', receivedAt: new Date(receivedAt) })],
      ],
      'update:production_jobs': [[]],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received', receivedAt })
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.job.status).toBe('received')

    const write = ops('update', productionJobs)[0]
    expect(write).toBeDefined()
    expect(write?.values).toMatchObject({ status: 'received' })
    expect((write?.values as Record<string, unknown>).receivedAt).toBeInstanceOf(Date)
    // The vendorId is in the UPDATE's WHERE as well as in the pre-read.
    expect(params(write?.where)).toContain(VENDOR_ID)

    expectNoCustomerData(body)
  })

  it('ignores amountExpected and amountActual in the body — a vendor may not price their own job', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'update:production_jobs': [[]],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received', amountExpected: '9999.00', amountActual: '9999.00' })
    )
    expect(res.status).toBe(200)

    const written = ops('update', productionJobs)[0]?.values as Record<string, unknown>
    expect(written).toBeDefined()
    expect(written).not.toHaveProperty('amountExpected')
    expect(written).not.toHaveProperty('amountActual')
    expect(JSON.stringify(written)).not.toContain('9999.00')
  })

  it('rejects a body that carries only amounts rather than silently writing nothing', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ amountActual: '9999.00' })
    )
    expect(res.status).toBe(400)
    expect(ops('update', productionJobs)).toHaveLength(0)
  })

  it('refuses a status a vendor does not own, such as passing their own QC', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status: 'qc_passed' }))
    expect(res.status).toBe(400)
    expect(ops('update', productionJobs)).toHaveLength(0)
  })

  it("404s on another vendor's job and writes NOTHING", async () => {
    queueRows({ 'select:production_jobs': [[]] })

    const res = await buildApp().request(
      `/api/vendor/jobs/${OTHER_JOB_ID}`,
      json({ status: 'received' })
    )
    expect(res.status).toBe(404)

    // Load-first, not update-then-check: an UPDATE was never issued at all.
    expect(ops('update', productionJobs)).toHaveLength(0)
    expect(params(ops('select', productionJobs)[0]?.where)).toContain(VENDOR_ID)
  })
})

// ============================================================================
// GET /api/vendor/rates
// ============================================================================

describe('GET /api/vendor/rates', () => {
  it("returns only this vendor's rate rows", async () => {
    queueRows({
      'select:vendor_rates': [
        [
          {
            id: 'rate-1',
            vendorId: VENDOR_ID,
            kind: 'print',
            longestEdgeMinInches: 0,
            longestEdgeMaxInches: 24,
            finish: null,
            amount: '100.00',
            effectiveFrom: PAST,
            effectiveTo: null,
          },
        ],
      ],
    })

    const res = await buildApp().request('/api/vendor/rates')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].amount).toBe('100.00')

    expect(params(ops('select', vendorRates)[0]?.where)).toContain(VENDOR_ID)
    expectNoCustomerData(body)
  })
})

// ============================================================================
// GET /api/vendor/payments
// ============================================================================

describe('GET /api/vendor/payments', () => {
  it('returns this vendor’s settlements and the derived payable total', async () => {
    queueRows({
      'select:vendor_settlements': [
        [
          {
            id: 'set-1',
            vendorId: VENDOR_ID,
            amount: '500.00',
            reference: 'NEFT-1',
            note: null,
            paidAt: PAST,
            createdAt: PAST,
          },
        ],
      ],
      'select:production_jobs': [[{ total: '250.00' }]],
    })

    const res = await buildApp().request('/api/vendor/payments')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.settlements).toHaveLength(1)
    expect(body.payableTotal).toBe('250.00')

    // Both halves are scoped: the settlement list and the derived total.
    expect(params(ops('select', productionJobs)[0]?.where)).toContain(VENDOR_ID)
    expectNoCustomerData(body)
  })
})

// ============================================================================
// requireVendor — a role is not a link
// ============================================================================

const EVERY_ROUTE: Array<[string, RequestInit | undefined]> = [
  ['/api/vendor/jobs', undefined],
  [`/api/vendor/jobs/${JOB_ID}`, undefined],
  [`/api/vendor/jobs/${JOB_ID}`, json({ status: 'received' })],
  ['/api/vendor/rates', undefined],
  ['/api/vendor/payments', undefined],
]

describe('vendor scoping gate', () => {
  it.each(EVERY_ROUTE)('403s a vendor-role caller with no vendor_users row on %s', async (path, init) => {
    // No link row, and no rows queued for anything else either: if the gate
    // were to fall through, the assertions below would catch an unscoped read.
    queueRows({ 'select:vendor_users': [[]] })

    const res = await buildApp().request(path, init)
    expect(res.status).toBe(403)

    expect(ops('select', productionJobs)).toHaveLength(0)
    expect(ops('select', vendorRates)).toHaveLength(0)
    expect(ops('update', productionJobs)).toHaveLength(0)
  })

  it.each(EVERY_ROUTE)('403s an admin with no vendor link on %s — this is not an admin surface', async (path, init) => {
    mockGetSession.mockResolvedValue(sessionFor('admin', 'admin-user-1'))
    queueRows({ 'select:vendor_users': [[]] })

    const res = await buildApp().request(path, init)
    expect(res.status).toBe(403)
    expect(ops('select', productionJobs)).toHaveLength(0)
  })

  it('403s a linked user whose vendor is suspended', async () => {
    queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'suspended' }]] })

    const res = await buildApp().request('/api/vendor/jobs')
    expect(res.status).toBe(403)
    expect(ops('select', productionJobs)).toHaveLength(0)
  })

  it('401s an anonymous caller', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await buildApp().request('/api/vendor/jobs')
    expect(res.status).toBe(401)
    expect(ops('select', productionJobs)).toHaveLength(0)
  })
})
