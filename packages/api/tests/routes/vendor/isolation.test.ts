/**
 * Vendor portal — the three security properties, asserted AS properties.
 *
 * This is the suite that decides whether the portal is safe to expose. It does
 * not test handlers one at a time; it tests three statements that must hold for
 * EVERY vendor-facing route, including the ones that do not exist yet:
 *
 *   1. Vendor A cannot read or write vendor B's data.
 *   2. No vendor-facing payload contains customer data.
 *   3. Artwork URLs are signed, expiring and job-scoped.
 *
 * **Driven from a route table.** `ROUTE_TABLE` below is compared against the
 * routes Hono actually has registered on `vendorApp`. A route added later
 * without a table entry FAILS the first test in this file rather than being
 * silently uncovered — which is the entire difference between a property suite
 * and a pile of per-route tests that rot.
 *
 * **Property 2 is asserted on the SELECT, not only on the response.** The real
 * defence against a customer field reaching a vendor is the explicit column
 * list in `lib/vendor-scope.ts`; the response body is downstream of it. So the
 * recording db here captures the projection object handed to `db.select({...})`
 * and the suite asserts (a) no query selects a table WHOLESALE — `db.select()`
 * with no projection pulls every column of every joined row, which is how a
 * customer column arrives without anybody typing its name — and (b) no selected
 * column is a forbidden one. The response body is then walked RECURSIVELY for
 * the same vocabulary, so a convenience field invented in a handler is caught
 * too.
 *
 * A blanket rule is only assertable because dispatch is IN-HOUSE: the piece
 * comes back to us before it ships, so a vendor needs no name, no address, no
 * phone, no email and no order reference. Not "needs little" — needs none.
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

// ============================================================================
// Recording database mock — records the WHERE *and* the projection
// ============================================================================

interface RecordedQuery {
  op: 'select' | 'insert' | 'update' | 'delete'
  table: string | null
  where?: unknown
  /** Column names handed to `db.select({...})`. `null` means WHOLESALE. */
  fields: string[] | null
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

function builder(op: RecordedQuery['op'], table?: unknown, fields?: unknown) {
  const rec: RecordedQuery = {
    op,
    table: table === undefined ? null : tableName(table),
    fields:
      fields && typeof fields === 'object' ? Object.keys(fields as object) : null,
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
    limit: () => chain,
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
      return Promise.resolve(nextRows(rec)).then(resolve, reject)
    },
  }

  return chain
}

/** Function DECLARATION — `vi.mock`'s factory is hoisted above every const. */
function makeDb() {
  return {
    select: (fields?: unknown) => builder('select', undefined, fields),
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

const SIGNED_URL = 'https://r2.example.com/bucket/products/abc.jpg?X-Amz-Signature=deadbeef'
const mockPresign = vi.fn(async (_key: string, _expiresInSeconds?: number) => SIGNED_URL)
const mockPublicUrl = vi.fn((key: string) => `https://cdn.example.com/${key}`)

vi.mock('../../../src/lib/storage', () => ({
  getPresignedDownloadUrl: (...args: unknown[]) =>
    mockPresign(...(args as [string, number?])),
  // Exported into the mock ON PURPOSE, so "nobody called it" is a real
  // observation rather than an absence of evidence.
  getPublicUrl: (...args: unknown[]) => mockPublicUrl(...(args as [string])),
}))

import { vendorApp } from '../../../src/routes/vendor'
import { readJson } from '../../helpers/json'

// ============================================================================
// Fixtures
// ============================================================================

const dialect = new PgDialect()

function params(condition: unknown): unknown[] {
  if (condition === undefined || condition === null) return []
  try {
    return dialect.sqlToQuery(condition as SQL).params as unknown[]
  } catch {
    return []
  }
}

function queueRows(rows: Record<string, unknown[][]>) {
  for (const [key, batches] of Object.entries(rows)) {
    rowQueues.set(key, batches.map((b) => [...b]))
  }
}

/** The caller in every test below unless stated otherwise. */
const VENDOR_B = '33333333-3333-4333-8333-333333333333'
/** The victim. Nothing of A's may be read, written or echoed. */
const VENDOR_A = '11111111-1111-4111-8111-111111111111'

const B_JOB_ID = '22222222-2222-4222-8222-222222222222'
/** A real job id — A's. This is the interesting attack, not a made-up uuid. */
const A_JOB_ID = '2222222a-2222-4222-8222-222222222222'
const B_ITEM_ID = '44444444-4444-4444-8444-444444444444'
const A_ITEM_ID = '4444444a-4444-4444-8444-444444444444'

const PAST = new Date('2026-01-01T00:00:00Z')

function sessionFor(role: string, id = 'vendor-b-user') {
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

const jsonInit = (body: unknown, method = 'PATCH'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Rows shaped exactly as the scoped module's column lists return them. */
const OWNED_ROWS: Record<string, unknown[][]> = {
  'select:production_jobs': [
    [
      {
        id: B_JOB_ID,
        stage: 'print',
        status: 'assigned',
        dueAt: PAST,
        sentAt: null,
        receivedAt: null,
        amountExpected: '100.00',
        amountActual: null,
        createdAt: PAST,
      },
    ],
  ],
  'select:production_job_items': [[{ id: B_ITEM_ID, imageUrl: 'products/abc.jpg' }]],
  'select:production_job_reviews': [
    [{ id: 'rev-1', verdict: 'fail', defects: ['scuff'], notes: null, createdAt: PAST }],
  ],
  'select:vendor_rates': [
    [
      {
        id: 'rate-1',
        vendorId: VENDOR_B,
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
  'select:vendor_settlements': [
    [
      {
        id: 'set-1',
        vendorId: VENDOR_B,
        amount: '500.00',
        reference: 'NEFT-1',
        note: null,
        paidAt: PAST,
        createdAt: PAST,
      },
    ],
  ],
}

// ============================================================================
// THE ROUTE TABLE
// ============================================================================

interface RouteCase {
  /** Path as Hono registered it on `vendorApp`, e.g. `/jobs/:id`. */
  pattern: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** A request this vendor is entitled to make. */
  mine: () => [string, RequestInit | undefined]
  /**
   * The same request aimed at vendor A's row. `undefined` for collection
   * routes, which take no id and therefore have no cross-vendor variant
   * beyond "is the list scoped", asserted separately.
   */
  theirs?: () => [string, RequestInit | undefined]
  /** Status the entitled request answers with. */
  okStatus: number
}

const ROUTE_TABLE: RouteCase[] = [
  {
    pattern: '/jobs',
    method: 'GET',
    mine: () => ['/api/vendor/jobs', undefined],
    okStatus: 200,
  },
  {
    pattern: '/jobs/:id',
    method: 'GET',
    mine: () => [`/api/vendor/jobs/${B_JOB_ID}`, undefined],
    theirs: () => [`/api/vendor/jobs/${A_JOB_ID}`, undefined],
    okStatus: 200,
  },
  {
    pattern: '/jobs/:id',
    method: 'PATCH',
    mine: () => [`/api/vendor/jobs/${B_JOB_ID}`, jsonInit({ status: 'received' })],
    theirs: () => [`/api/vendor/jobs/${A_JOB_ID}`, jsonInit({ status: 'received' })],
    okStatus: 200,
  },
  {
    pattern: '/jobs/:id/artwork/:itemId',
    method: 'GET',
    mine: () => [`/api/vendor/jobs/${B_JOB_ID}/artwork/${B_ITEM_ID}`, undefined],
    theirs: () => [`/api/vendor/jobs/${A_JOB_ID}/artwork/${A_ITEM_ID}`, undefined],
    okStatus: 200,
  },
  {
    pattern: '/rates',
    method: 'GET',
    mine: () => ['/api/vendor/rates', undefined],
    okStatus: 200,
  },
  {
    pattern: '/payments',
    method: 'GET',
    mine: () => ['/api/vendor/payments', undefined],
    okStatus: 200,
  },
]

const label = (r: RouteCase) => `${r.method} ${r.pattern}`

// ============================================================================
// The forbidden vocabulary
// ============================================================================

/**
 * Keys a vendor-facing payload may never contain, at any depth, in any case.
 *
 * Dispatch is in-house, so this is a blanket rule rather than a judgement call
 * per field. The order references are here for the same reason as the names and
 * addresses: `orderId` / `orderItemId` are direct handles into a customer's
 * order, and a vendor addresses their work by JOB, never by order — the artwork
 * route keys on `production_job_items.id`, not on the order item behind it.
 */
const FORBIDDEN_KEYS = [
  'customer',
  'customerName',
  'customerEmail',
  'customerPhone',
  'shippingAddress',
  'billingAddress',
  'address',
  'addressLine1',
  'addressLine2',
  'postalCode',
  'orderNumber',
  'orderId',
  'orderItemId',
  'userId',
  'email',
  'phone',
].map((k) => k.toLowerCase())

/** Every key in the structure, at every depth, lowercased. */
function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, out)
    return out
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.push(key.toLowerCase())
      collectKeys(child, out)
    }
  }
  return out
}

function forbiddenKeysIn(value: unknown): string[] {
  return [...new Set(collectKeys(value))].filter((k) => FORBIDDEN_KEYS.includes(k))
}

/** Tables whose rows belong to exactly one vendor, so a read must name it. */
const VENDOR_OWNED_TABLES = ['production_jobs', 'vendor_rates', 'vendor_settlements']
/** Reachable only through a job, which is itself scoped before they are read. */
const JOB_KEYED_TABLES = ['production_job_items', 'production_job_reviews']

async function run(path: string, init?: RequestInit) {
  const res = await buildApp().request(path, init)
  const body = res.status === 204 ? null : await readJson(res).catch(() => null)
  return { res, body }
}

beforeEach(() => {
  queries.length = 0
  rowQueues.clear()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('vendor'))
  mockPresign.mockClear()
  mockPresign.mockResolvedValue(SIGNED_URL)
  mockPublicUrl.mockClear()
  queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
})

// ============================================================================
// The table is complete
// ============================================================================

describe('the route table covers the router', () => {
  it('has an entry for every route registered on vendorApp', () => {
    const registered = new Set(
      (vendorApp as unknown as { routes: Array<{ method: string; path: string }> }).routes
        // `use('*', ...)` registers as ALL /* — middleware, not a surface.
        .filter((r) => r.method !== 'ALL')
        .map((r) => `${r.method} ${r.path}`)
    )
    const covered = new Set(ROUTE_TABLE.map(label))

    // A route added without a table entry lands here, visibly, instead of
    // quietly enjoying no isolation coverage at all.
    expect([...registered].filter((r) => !covered.has(r)).sort()).toEqual([])
    // And an entry for a route that no longer exists is dead weight.
    expect([...covered].filter((r) => !registered.has(r)).sort()).toEqual([])
  })
})

// ============================================================================
// PROPERTY 1 — vendor A cannot read or write vendor B's data
// ============================================================================

describe('property 1: a vendor reaches only their own rows', () => {
  it.each(ROUTE_TABLE.map((r) => [label(r), r] as const))(
    '%s names the session vendor in every vendor-owned read',
    async (_name, route) => {
      queueRows(OWNED_ROWS)
      const [path, init] = route.mine()
      const { res } = await run(path, init)
      expect(res.status).toBe(route.okStatus)

      const unscoped = queries.filter(
        (q) =>
          q.table !== null &&
          VENDOR_OWNED_TABLES.includes(q.table) &&
          !params(q.where).includes(VENDOR_B)
      )
      expect(
        unscoped.map((q) => `${q.op}:${q.table}`),
        'a vendor-owned table was queried without the vendorId in its WHERE'
      ).toEqual([])

      // Job-keyed tables are safe only because the job was scoped first.
      const touchedJobKeyed = queries.some(
        (q) => q.table !== null && JOB_KEYED_TABLES.includes(q.table)
      )
      if (touchedJobKeyed) {
        const scopedJobRead = queries.some(
          (q) =>
            q.op === 'select' &&
            q.table === 'production_jobs' &&
            params(q.where).includes(VENDOR_B)
        )
        expect(scopedJobRead, 'job-keyed rows were read without a scoped job read').toBe(true)
      }
    }
  )

  it.each(
    ROUTE_TABLE.filter((r) => r.theirs).map((r) => [label(r), r] as const)
  )("%s answers 404 on vendor A's row and writes nothing", async (_name, route) => {
    // The scoped read finds nothing, because the WHERE carries B's id. No rows
    // are queued for anything else either: a handler that fell through to an
    // unscoped path would be caught by the assertions below, not rescued.
    queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })

    const [path, init] = route.theirs!()
    const { res, body } = await run(path, init)

    // 404, never 403: 403 would confirm the row exists, which is the one fact
    // vendor B must not learn.
    expect(res.status).toBe(404)

    // Load-first everywhere: no write was even built.
    expect(queries.filter((q) => q.op !== 'select').map((q) => `${q.op}:${q.table}`)).toEqual([])

    // A's identifiers never appear in the answer.
    const serialised = JSON.stringify(body ?? {})
    expect(serialised).not.toContain(VENDOR_A)
    expect(serialised).not.toContain(A_JOB_ID)
    expect(serialised).not.toContain(A_ITEM_ID)

    const scopedRead = queries.find((q) => q.table === 'production_jobs')
    expect(scopedRead, 'no job read happened at all').toBeDefined()
    expect(params(scopedRead?.where)).toContain(VENDOR_B)
    expect(params(scopedRead?.where)).not.toContain(VENDOR_A)
  })

  it.each(ROUTE_TABLE.map((r) => [label(r), r] as const))(
    '%s is refused outright when the caller has no vendor link',
    async (_name, route) => {
      queueRows({ 'select:vendor_users': [[]] })
      const [path, init] = route.mine()
      const { res } = await run(path, init)

      expect(res.status).toBe(403)
      // Nothing was read and nothing was signed on the way to the refusal.
      expect(queries.filter((q) => q.table !== 'vendor_users')).toEqual([])
      expect(mockPresign).not.toHaveBeenCalled()
    }
  )
})

// ============================================================================
// PROPERTY 2 — no vendor-facing payload contains customer data
// ============================================================================

describe('property 2: no customer data crosses the vendor boundary', () => {
  it.each(ROUTE_TABLE.map((r) => [label(r), r] as const))(
    '%s selects no table wholesale',
    async (_name, route) => {
      queueRows(OWNED_ROWS)
      const [path, init] = route.mine()
      await run(path, init)

      // `db.select()` with no projection returns every column of every joined
      // row. That is how a customer column arrives in a payload without anyone
      // typing its name, so it is banned rather than reviewed.
      const wholesale = queries.filter((q) => q.op === 'select' && q.fields === null)
      expect(
        wholesale.map((q) => q.table),
        'a vendor-facing read selected a table wholesale'
      ).toEqual([])
    }
  )

  it.each(ROUTE_TABLE.map((r) => [label(r), r] as const))(
    '%s selects no forbidden column',
    async (_name, route) => {
      queueRows(OWNED_ROWS)
      const [path, init] = route.mine()
      await run(path, init)

      // The column list is the real defence; the response body is downstream of
      // it. Assert on the list, so a leak is impossible rather than merely
      // absent from today's shape.
      const offenders = queries
        .filter((q) => q.op === 'select')
        .flatMap((q) =>
          (q.fields ?? [])
            .filter((f) => FORBIDDEN_KEYS.includes(f.toLowerCase()))
            .map((f) => `${q.table}.${f}`)
        )
      expect([...new Set(offenders)].sort()).toEqual([])
    }
  )

  it.each(ROUTE_TABLE.map((r) => [label(r), r] as const))(
    '%s returns a body with no forbidden key at any depth',
    async (_name, route) => {
      queueRows(OWNED_ROWS)
      const [path, init] = route.mine()
      const { res, body } = await run(path, init)
      expect(res.status).toBe(route.okStatus)

      // Recursive, case-insensitive: a leak nested three objects deep in a
      // convenience field somebody added is the case this exists for.
      expect(forbiddenKeysIn(body).sort()).toEqual([])
    }
  )

  it('the walker actually finds a planted key — the suite is not vacuous', () => {
    // Without this, "no route leaks" and "the walker is broken" look identical.
    expect(forbiddenKeysIn({ job: { items: [{ shippingAddress: 'x' }] } })).toEqual([
      'shippingaddress',
    ])
    expect(forbiddenKeysIn({ nested: [{ deep: { CustomerEmail: 'x' } }] })).toEqual([
      'customeremail',
    ])
    expect(forbiddenKeysIn({ id: 1, amountExpected: '10.00' })).toEqual([])
  })
})

// ============================================================================
// PROPERTY 3 — artwork URLs are signed, expiring and job-scoped
// ============================================================================

describe('property 3: artwork is delivered by short-lived signature only', () => {
  const ARTWORK = ROUTE_TABLE.find((r) => r.pattern === '/jobs/:id/artwork/:itemId')!

  it('signs with a presigned URL and never a public path', async () => {
    queueRows(OWNED_ROWS)
    const [path, init] = ARTWORK.mine()
    const { res, body } = await run(path, init)

    expect(res.status).toBe(200)
    expect(mockPresign).toHaveBeenCalledTimes(1)
    // `getPublicUrl` produces a permanent, unauthenticated path. Its call count
    // across the whole vendor surface is zero, and this is where that is proved.
    expect(mockPublicUrl).not.toHaveBeenCalled()
    expect(body.url).toBe(SIGNED_URL)
  })

  it('expires in minutes, not days', async () => {
    queueRows(OWNED_ROWS)
    const [path, init] = ARTWORK.mine()
    const { body } = await run(path, init)

    const ttl = mockPresign.mock.calls[0][1] as number
    expect(ttl).toBeGreaterThan(0)
    // Fifteen minutes is already generous for "fetch a file you were just
    // handed". A leaked permanent URL to a customer's commissioned artwork is a
    // worse incident than a leaked job list.
    expect(ttl).toBeLessThanOrEqual(15 * 60)
    expect(body.expiresInSeconds).toBe(ttl)
  })

  it("NEVER CALLS the presigner for vendor A's artwork", async () => {
    queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })

    const [path, init] = ARTWORK.theirs!()
    const { res } = await run(path, init)

    expect(res.status).toBe(404)
    // Not "the response was a 404". A signed URL that is generated and then
    // withheld has still been generated, and lives in whatever log, trace or
    // crash dump saw it.
    expect(mockPresign).not.toHaveBeenCalled()
  })

  it('never calls the presigner for a real item id on a job that is not mine', async () => {
    // The job read misses; the item is never even looked up.
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]],
      'select:production_job_items': [[{ id: A_ITEM_ID, imageUrl: 'products/secret.jpg' }]],
    })

    const { res } = await run(`/api/vendor/jobs/${A_JOB_ID}/artwork/${A_ITEM_ID}`)
    expect(res.status).toBe(404)
    expect(mockPresign).not.toHaveBeenCalled()
  })

  /**
   * The signed URL carries the OBJECT KEY in its path, so the key itself is
   * part of the payload whether or not it appears as a JSON field. Two of this
   * bucket's prefixes are partitioned by user id — `ai-generations/<userId>/…`
   * and `avatars/<userId>/…` — so signing one would hand a vendor a stable
   * person-linked identifier inside the URL, which the body walk above cannot
   * see because it is a value, not a key.
   *
   * It is also the difference between "a URL for this artwork" and "a URL for
   * anything in the bucket": the key is whatever `snapshot.imageUrl` happens to
   * decode to, and the vendor route must not be a general-purpose signer.
   */
  const OFF_LIMITS_KEYS = [
    'ai-generations/user-9/gen-1/0.png',
    'avatars/user-9/avatar.jpg',
    'ai-reference-images/user-9/1-abc.png',
    'user-uploads/user-9/thing.png',
    'reviews/rev-9/media/clip.mp4',
  ]

  it.each(OFF_LIMITS_KEYS)('refuses to sign %s — not artwork, and often user-partitioned', async (key) => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]],
      ...OWNED_ROWS,
      'select:production_job_items': [[{ id: B_ITEM_ID, imageUrl: key }]],
    })

    const [path, init] = ARTWORK.mine()
    const { res } = await run(path, init)

    // Fail CLOSED. A vendor prints catalogue artwork; anything else reaching
    // this route is a bug, and signing it first and asking later is how the
    // bug becomes an incident.
    expect(res.status).toBe(404)
    expect(mockPresign, `signed an off-limits key: ${key}`).not.toHaveBeenCalled()
  })

  it('never signs a key that embeds a user id, whatever the stored URL looked like', async () => {
    queueRows({
      'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]],
      ...OWNED_ROWS,
      'select:production_job_items': [
        [{ id: B_ITEM_ID, imageUrl: 'https://cdn.example.com/ai-generations/user-9/gen-1/0.png' }],
      ],
    })

    const [path, init] = ARTWORK.mine()
    const { res, body } = await run(path, init)

    expect(res.status).toBe(404)
    expect(mockPresign).not.toHaveBeenCalled()
    expect(JSON.stringify(body ?? {})).not.toContain('user-9')
  })

  it('never signs on any other vendor route', async () => {
    for (const route of ROUTE_TABLE.filter((r) => r !== ARTWORK)) {
      queries.length = 0
      rowQueues.clear()
      mockPresign.mockClear()
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
      queueRows(OWNED_ROWS)

      const [path, init] = route.mine()
      await run(path, init)
      expect(mockPresign, `${label(route)} signed something`).not.toHaveBeenCalled()
      expect(mockPublicUrl, `${label(route)} built a public URL`).not.toHaveBeenCalled()
    }
  })
})
