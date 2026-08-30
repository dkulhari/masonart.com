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
 * 4. **The scope is not substitutable.** Artwork is signed under ONE named
 *    scope out of `VENDOR_SIGNING_SCOPES`, and this route may sign only within
 *    it. Since vendors now despatch directly, one of the sibling scopes —
 *    `label` — deliberately carries the customer's name and address on a
 *    carrier PDF. If the artwork path would sign a `fulfilment/labels/...` key,
 *    that one narrow exception has quietly become a general PII signer. So the
 *    disjointness is asserted here in BOTH directions, over every pair of
 *    scopes, and again through the route itself.
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
import { buildRouteApp } from '../../helpers/route-app'
import { vendorSessionFor } from '../../helpers/vendor-session'
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

const mockPresign = vi.fn(async (_key: string, _expiresInSeconds?: number) => SIGNED_URL)

// Only the presigner is faked. Everything that decides WHETHER to call it is
// the real code path.
vi.mock('../../../src/lib/storage', () => ({
  getPresignedDownloadUrl: (...args: unknown[]) =>
    mockPresign(...(args as [string, number?])),
}))

import { vendorApp } from '../../../src/routes/vendor'
import {
  VENDOR_SIGNING_SCOPES,
  objectKeyForScope,
  type VendorSigningScope,
} from '../../../src/lib/vendor-scope'
import { readJson } from '../../helpers/json'

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
const buildApp = () => buildRouteApp('/api/vendor', vendorApp)

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

    const body = await readJson(res)
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

    const body = await readJson(res)
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
    const serialised = JSON.stringify(await readJson(res))

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
    const serialised = JSON.stringify(await readJson(res)).toLowerCase()

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

// ============================================================================
// The scopes are disjoint, and this route may sign only inside its own
// ============================================================================

/**
 * Why this lives beside the artwork tests rather than in a unit file of its own.
 *
 * `objectKeyForScope` is the single choke point every vendor-facing signature
 * passes through, and this route is its oldest caller. Vendors now despatch
 * directly, so a sibling scope — `label` — resolves to a carrier PDF that
 * carries the customer's name, address and phone. That document is the ONE
 * deliberate exception to "a vendor never receives customer data", and the
 * exception is only as narrow as the allow-list that contains it.
 *
 * Which makes substitutability the whole ballgame. If the artwork path would
 * sign a `fulfilment/labels/...` key — reachable, because the key is whatever
 * `snapshot.imageUrl` decodes to — then a route with no consolidator check has
 * become a signer for the one object that holds PII. The property is therefore
 * asserted as a property: over EVERY ordered pair of scopes, in both
 * directions, so a fourth scope added later cannot quietly overlap a third.
 */
describe('vendor signing scopes are pairwise disjoint and non-substitutable', () => {
  const KEY_FOR_SCOPE: Record<VendorSigningScope, string> = {
    artwork: 'products/originals/abc.jpg',
    qcPhoto: 'production-qc/job-1/front_full/shot.jpg',
    label: 'fulfilment/labels/9f3c1b7a5e2d4c8b1f0a6d3e7c2b8a45.pdf',
  }

  const SCOPES = Object.keys(VENDOR_SIGNING_SCOPES) as VendorSigningScope[]

  it('the artwork scope REFUSES a carrier-label key', () => {
    // The named direction that matters most: artwork is signed on a route with
    // no consolidator check, and the label is the only object holding PII.
    expect(objectKeyForScope('artwork', KEY_FOR_SCOPE.label)).toBeNull()
  })

  it('the label scope REFUSES a catalogue-artwork key', () => {
    // The reverse direction, so neither scope can stand in for the other and
    // "it only ever gets artwork keys" cannot become an argument for widening.
    expect(objectKeyForScope('label', KEY_FOR_SCOPE.artwork)).toBeNull()
  })

  it('accepts a key under its own scope and no other — every ordered pair', () => {
    for (const scope of SCOPES) {
      for (const other of SCOPES) {
        const got = objectKeyForScope(scope, KEY_FOR_SCOPE[other])
        if (scope === other) {
          expect(got, `${scope} refused its own key`).toBe(KEY_FOR_SCOPE[other])
        } else {
          expect(got, `${scope} signed a ${other} key`).toBeNull()
        }
      }
    }
  })

  it('has no prefix that is a prefix of another scope', () => {
    // Disjointness of the ALLOW-LIST itself, not merely of today's sample keys:
    // `fulfilment/` and `fulfilment/labels/` would both accept the label PDF.
    const all = (
      Object.entries(VENDOR_SIGNING_SCOPES) as [VendorSigningScope, readonly string[]][]
    ).flatMap(([scope, prefixes]) => prefixes.map((prefix) => [scope, prefix] as const))

    for (const [a, prefixA] of all) {
      for (const [b, prefixB] of all) {
        if (a === b) continue
        expect(
          prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA),
          `scope ${a} prefix "${prefixA}" overlaps scope ${b} prefix "${prefixB}"`
        ).toBe(false)
      }
    }
  })

  it('every scope is non-empty, so none of them fails OPEN', () => {
    // An empty prefix list would make `some()` false for everything, which
    // fails closed — but an accidental `['']` would make it true for
    // everything, which is the bucket root.
    for (const scope of SCOPES) {
      const prefixes = VENDOR_SIGNING_SCOPES[scope]
      expect(prefixes.length, `${scope} has no prefixes`).toBeGreaterThan(0)
      for (const prefix of prefixes) {
        expect(prefix, `${scope} has an empty prefix — that is the bucket root`).not.toBe('')
        expect(prefix.endsWith('/'), `${scope} prefix "${prefix}" is not a directory`).toBe(true)
      }
    }
  })

  it('keeps the fail-closed logic the artwork prefix list already had', () => {
    // Byte-for-byte the same behaviour, now parameterised by scope.
    expect(objectKeyForScope('artwork', null)).toBeNull()
    expect(objectKeyForScope('artwork', undefined)).toBeNull()
    expect(objectKeyForScope('artwork', '   ')).toBeNull()
    expect(objectKeyForScope('artwork', 'not-a-scope/abc.jpg')).toBeNull()
    // Traversal, in every scope, however the reference was stored.
    expect(objectKeyForScope('artwork', 'products/../avatars/user-9/avatar.jpg')).toBeNull()
    expect(objectKeyForScope('label', 'fulfilment/labels/../../avatars/user-9/a.pdf')).toBeNull()
    // An unrecognised scope name fails closed rather than throwing or signing.
    expect(objectKeyForScope('bucketRoot' as VendorSigningScope, 'products/abc.jpg')).toBeNull()
  })

  it('still collapses a CDN URL, a path-style URL and a bare key to one key', () => {
    const bucket = process.env.R2_BUCKET || 'poster-app-dev'
    expect(objectKeyForScope('artwork', 'https://cdn.example.com/products/abc.jpg')).toBe(
      'products/abc.jpg'
    )
    expect(
      objectKeyForScope('artwork', `https://r2.example.com/${bucket}/products/abc.jpg`)
    ).toBe('products/abc.jpg')
    expect(objectKeyForScope('artwork', '/products/abc.jpg')).toBe('products/abc.jpg')
    expect(
      objectKeyForScope('label', `https://r2.example.com/${bucket}/${KEY_FOR_SCOPE.label}`)
    ).toBe(KEY_FOR_SCOPE.label)
  })

  it('404s and NEVER signs when an item points at a carrier label instead of artwork', async () => {
    // The route-level half of the same property. `snapshot.imageUrl` is data;
    // the day one holds a label key, this route must refuse it rather than hand
    // a vendor a URL to the customer's address.
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[artworkRow({ imageUrl: KEY_FOR_SCOPE.label })]],
    })

    const res = await buildApp().request(artworkPath())
    expect(res.status).toBe(404)
    expect(mockPresign, 'the artwork route signed a carrier label').not.toHaveBeenCalled()
  })

  it('404s and never signs a QC photo through the artwork route either', async () => {
    queueRows({
      'select:production_jobs': [[jobRow()]],
      'select:production_job_items': [[artworkRow({ imageUrl: KEY_FOR_SCOPE.qcPhoto })]],
    })

    const res = await buildApp().request(artworkPath())
    expect(res.status).toBe(404)
    expect(mockPresign).not.toHaveBeenCalled()
  })
})
