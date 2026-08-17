/**
 * Vendor portal API — job-scoped signed artwork URLs.
 *
 * `GET /api/vendor/jobs/:id/artwork/:itemId` hands a vendor the file they are
 * meant to print, and nothing else. Three things are asserted here that a
 * "does it return a URL" test would not:
 *
 * 1. **The URL is signed and expiring.** A public CDN path would work just as
 *    well for the vendor and would still be readable by anyone who ever saw it,
 *    forever. The expiry is asserted as an upper bound in MINUTES — a leaked
 *    permanent URL to a customer's commissioned artwork is a worse incident
 *    than a leaked job list.
 *
 * 2. **The presigner is never CALLED on a miss.** Not "the response was a 404":
 *    a signed URL that is generated and then withheld has still been generated,
 *    and lives in whatever log, trace or crash dump saw it. Every refusal case
 *    below asserts `getPresignedDownloadUrl` has zero calls.
 *
 * 3. **The lookup is job-scoped, not id-scoped.** A real itemId on someone
 *    else's job is the interesting attack, not a made-up uuid.
 *
 * The harness is the recording query builder from `jobs.test.ts`: `src/database`
 * records the WHERE that actually reached the driver, `src/auth` is mocked so
 * each test picks the caller, and the REAL `requireVendor` / `lib/vendor-scope`
 * run on top. Only the presigner itself is a spy.
 *
 * @see packages/api/src/routes/vendor.ts
 * @see packages/api/src/lib/vendor-scope.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import {
  buildVendorApp,
  vendorSessionFor,
} from '../../helpers/vendor-session'
import '../../setup'

import { productionJobs, productionJobItems } from '../../../src/database/schema/production-jobs'

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
  const rec: RecordedQuery = { op, table: table === undefined ? null : tableName(table) }
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
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

const SIGNED_URL =
  'https://r2.example.com/poster-app-dev/products/abc.jpg?X-Amz-Signature=deadbeef&X-Amz-Expires=300'

const mockPresign = vi.fn(async () => SIGNED_URL)

// Only the presigner is faked. Everything that decides WHETHER to call it is
// the real code path.
vi.mock('../../../src/lib/storage', () => ({
  getPresignedDownloadUrl: (...args: unknown[]) => mockPresign(...(args as [])),
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
const ITEM_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_ITEM_ID = '4444444b-4444-4444-8444-444444444444'

const ARTWORK_CDN_URL = 'https://cdn.example.com/products/abc.jpg'

/** Fifteen minutes is already generous for "fetch a file you were just handed". */
const MAX_REASONABLE_TTL_SECONDS = 15 * 60

const sessionFor = vendorSessionFor
const buildApp = () => buildVendorApp(vendorApp)

const PAST = new Date('2026-01-01T00:00:00Z')

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

/** The row `getVendorJobArtwork`'s narrow select returns. */
function artworkRow(over: Record<string, unknown> = {}) {
  return { id: ITEM_ID, imageUrl: ARTWORK_CDN_URL, ...over }
}

const artworkPath = (jobId = JOB_ID, itemId = ITEM_ID) =>
  `/api/vendor/jobs/${jobId}/artwork/${itemId}`

beforeEach(() => {
  queries.length = 0
  rowQueues.clear()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('vendor'))
  mockPresign.mockClear()
  mockPresign.mockResolvedValue(SIGNED_URL)
  queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]] })
})

// ============================================================================
// The happy path
// ============================================================================

describe('GET /api/vendor/jobs/:id/artwork/:itemId', () => {
  it('returns a signed URL for an item on my own job', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[artworkRow()]],
    })

    const res = await buildApp().request(artworkPath())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.url).toBe(SIGNED_URL)
    expect(body.itemId).toBe(ITEM_ID)

    // Signed via the presigner, once, for the object key behind the stored URL.
    expect(mockPresign).toHaveBeenCalledTimes(1)
    expect(mockPresign.mock.calls[0][0]).toBe('products/abc.jpg')
  })

  it('signs with a short expiry — minutes, not days — and says when it dies', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[artworkRow()]],
    })

    const before = Date.now()
    const res = await buildApp().request(artworkPath())
    expect(res.status).toBe(200)

    const ttl = mockPresign.mock.calls[0][1] as number
    expect(typeof ttl).toBe('number')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(MAX_REASONABLE_TTL_SECONDS)

    const body = await res.json()
    // The caller is told the same expiry the signature actually carries, so a
    // client cannot cache a URL it believes is still good.
    expect(body.expiresInSeconds).toBe(ttl)
    const expiresAt = Date.parse(body.expiresAt)
    expect(Number.isNaN(expiresAt)).toBe(false)
    expect(expiresAt).toBeGreaterThanOrEqual(before)
    expect(expiresAt).toBeLessThanOrEqual(before + (ttl + 5) * 1000)
  })

  it('never hands back the permanent public path alongside the signed one', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[artworkRow()]],
    })

    const res = await buildApp().request(artworkPath())
    const serialised = JSON.stringify(await res.json())

    // The whole point of signing is defeated if the CDN path rides along.
    expect(serialised).not.toContain(ARTWORK_CDN_URL)
    expect(serialised).not.toContain('cdn.example.com')
  })

  it('scopes the job read to the session vendor and the item read to the job', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[artworkRow()]],
    })

    await buildApp().request(artworkPath())

    expect(params(ops('select', productionJobs)[0]?.where)).toContain(VENDOR_ID)

    const itemRead = ops('select', productionJobItems)[0]
    expect(itemRead).toBeDefined()
    const where = params(itemRead?.where)
    // Both halves: the item id AND the job it must belong to. Looking the item
    // up by id alone is the bug this asserts against.
    expect(where).toContain(ITEM_ID)
    expect(where).toContain(JOB_ID)
  })

  it('carries no customer data', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[artworkRow()]],
    })

    const res = await buildApp().request(artworkPath())
    const serialised = JSON.stringify(await res.json()).toLowerCase()

    for (const field of ['customer', 'orderid', 'ordernumber', 'address', 'email', 'phone']) {
      expect(serialised, `artwork response leaks ${field}`).not.toContain(`"${field}`)
    }
  })
})

// ============================================================================
// Refusals — and in every one of them, the presigner is never called
// ============================================================================

describe('artwork URLs are job-scoped', () => {
  it("404s on another vendor's job and NEVER calls the presigner", async () => {
    // Scoped job read misses, so the request ends before any key is resolved.
    queueRows({ 'select:production_jobs': [[]] })

    const res = await buildApp().request(artworkPath(OTHER_JOB_ID))
    expect(res.status).toBe(404)

    expect(mockPresign).not.toHaveBeenCalled()
    expect(ops('select', productionJobItems)).toHaveLength(0)
    expect(params(ops('select', productionJobs)[0]?.where)).toContain(VENDOR_ID)
  })

  it('404s when a real item belongs to a different job, without signing', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[]],
    })

    const res = await buildApp().request(artworkPath(JOB_ID, OTHER_ITEM_ID))
    expect(res.status).toBe(404)
    expect(mockPresign).not.toHaveBeenCalled()
  })

  it('404s rather than signing nothing when the item has no artwork on file', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[artworkRow({ imageUrl: null })]],
    })

    const res = await buildApp().request(artworkPath())
    expect(res.status).toBe(404)
    // Signing an empty key would produce a valid-looking URL to nothing.
    expect(mockPresign).not.toHaveBeenCalled()
  })

  it('400s a malformed itemId without touching storage', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await buildApp().request(artworkPath(JOB_ID, 'not-a-uuid'))
    expect(res.status).toBe(400)
    expect(mockPresign).not.toHaveBeenCalled()
  })

  it('403s a vendor-role caller with no vendor link, and never signs', async () => {
    queueRows({ 'select:vendor_users': [[]] })

    const res = await buildApp().request(artworkPath())
    expect(res.status).toBe(403)
    expect(mockPresign).not.toHaveBeenCalled()
    expect(ops('select', productionJobs)).toHaveLength(0)
  })

  it('401s an anonymous caller, and never signs', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await buildApp().request(artworkPath())
    expect(res.status).toBe(401)
    expect(mockPresign).not.toHaveBeenCalled()
  })
})
