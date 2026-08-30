/**
 * Vendor portal — the security properties, asserted AS properties.
 *
 * This is the suite that decides whether the portal is safe to expose. It does
 * not test handlers one at a time; it tests statements that must hold for
 * EVERY vendor-facing route, including the ones that do not exist yet:
 *
 *   1. Vendor A cannot read or write vendor B's data.
 *   2. No customer data crosses the vendor boundary AS DATA.
 *   3. Every vendor-facing signature is short-lived, and lands in exactly one
 *      named scope; the scopes are disjoint and non-substitutable.
 *   4. The carrier label — the ONE document that does carry customer data —
 *      reaches only the order's consolidator, or is never signed at all.
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
 * ## The rule this suite enforces, and why it is three clauses now
 *
 * It used to be one sentence. `lib/vendor-scope.ts` said "no return value here
 * contains customer data", and that was assertable as a BLANKET rule for
 * exactly one reason: dispatch was in-house. The piece came back to us before
 * it shipped, so a vendor needed no name, no address, no phone — not "needed
 * little", needed none.
 *
 * That premise is dead. Vendors despatch directly and the courier collects from
 * their own facility, so a carrier's shipping label necessarily carries the
 * customer's name, address and phone. The absolute cannot survive, and softening
 * it into a guideline would delete the only thing that made it worth anything —
 * that a machine could check it. So it is replaced by three clauses, each
 * mechanically checkable, two of which are checked here:
 *
 * **R1 — the JSON stays clean, absolutely.** No JSON body on any
 * `/api/vendor/*` route contains a customer name, address, phone, email or
 * person-linked order reference, at any depth, in any casing. NO EXCEPTION,
 * EVER. The forbidden-key vocabulary, the recursive body walker, the
 * wholesale-`select()` ban and the SELECT-projection assertion below are
 * unchanged in mechanism, and the route table makes them cover every new route.
 * Property 2 is R1.
 *
 * **R2 — customer data reaches a vendor only as opaque rendered bytes, behind a
 * short-lived signature.** Only as a rendered document fetched from a signed,
 * expiring URL, and only by handing that file to the operating system. Never as
 * fields, never composed by our API, never rendered into the vendor portal's own
 * DOM. Exactly one such document exists: the carrier's label PDF. The DOM half
 * of R2 belongs to `packages/web/tests/routes/vendor/no-customer-data.test.tsx`;
 * the "behind a signature, and only for the consolidator" half is Property 4.
 *
 * **R3 — the allow-list is the enforcement, and the scopes are disjoint.** Every
 * vendor-facing signature is produced through one named scope of
 * `VENDOR_SIGNING_SCOPES`, and a route may sign only within its own. Property 3
 * asserts every presign call lands in EXACTLY ONE scope, and that the scopes are
 * pairwise disjoint and non-substitutable in both directions. That last part is
 * the load-bearing one: the label is the single deliberate exception to R1's
 * spirit, and an exception is only as narrow as the allow-list containing it. An
 * artwork route that would sign a `fulfilment/labels/...` key is no longer an
 * exception — it is a general PII signer.
 *
 * @see packages/api/src/routes/vendor.ts
 * @see packages/api/src/lib/vendor-scope.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
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
  /**
   * Tables pulled in by JOIN. Recorded because a joined table crosses this
   * boundary exactly as much as the FROM table does, and #678 reached
   * `order_consolidation` and `order_shipments` through joins alone — which is
   * how they slipped past a Property 1 that only ever looked at the FROM.
   */
  joins: string[]
  /** The ORDER BY expressions, so "a deterministic row" is checkable at all. */
  orderBy: unknown[]
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
    joins: [],
    orderBy: [],
  }
  queries.push(rec)

  const chain = {
    from(t: unknown) {
      rec.table = tableName(t)
      return chain
    },
    leftJoin(t: unknown) {
      rec.joins.push(tableName(t))
      return chain
    },
    innerJoin(t: unknown) {
      rec.joins.push(tableName(t))
      return chain
    },
    groupBy: () => chain,
    orderBy(...exprs: unknown[]) {
      rec.orderBy = exprs
      return chain
    },
    /**
     * `FOR UPDATE`. A no-op link: a mock cannot serialise anything, so the lock
     * itself is proved by a source scan in `jobs.test.ts`. What matters here is
     * that chaining it does not break the recorder.
     */
    for: () => chain,
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
const UPLOAD_URL = 'https://r2.example.com/bucket/put?X-Amz-Signature=deadbeef'
const mockPresign = vi.fn(async (_key: string, _expiresInSeconds?: number) => SIGNED_URL)
/**
 * The UPLOAD presigner (#685), spied separately and then folded into the same
 * scope property as the download one.
 *
 * Property 3 is about signatures, not about downloads. An upload signature is a
 * capability over the same bucket — R2 is handed the key, and whoever holds the
 * URL can write to it — so leaving it unwatched would mean the scope allow-list
 * governed half the signing surface while the other half signed whatever it
 * liked.
 */
const mockUploadPresign = vi.fn(
  async (_key: string, _contentType?: string, _expiresInSeconds?: number) => UPLOAD_URL
)
const mockPublicUrl = vi.fn((key: string) => `https://cdn.example.com/${key}`)

/**
 * `StoragePaths` is the REAL one, which is why this mock spreads the original
 * rather than listing exports. The QC upload routes build their key through it
 * and `complete` verifies the returned key by REBUILDING it; a stubbed builder
 * would make that agreement true by construction and prove nothing about the
 * key a vendor is actually handed.
 */
vi.mock('../../../src/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/storage')>()),
  getPresignedDownloadUrl: (...args: unknown[]) =>
    mockPresign(...(args as [string, number?])),
  getPresignedUploadUrl: (...args: unknown[]) =>
    mockUploadPresign(...(args as [string, string?, number?])),
  // Exported into the mock ON PURPOSE, so "nobody called it" is a real
  // observation rather than an absence of evidence.
  getPublicUrl: (...args: unknown[]) => mockPublicUrl(...(args as [string])),
  // The bucket says yes. `complete` verifies the object exists before it writes
  // a row for it (#687's shot-list fix); the real client would HEAD a bucket no
  // unit run has, and answer no to everything.
  fileExists: async (_key: string) => true,
}))

import { vendorApp } from '../../../src/routes/vendor'
import {
  VENDOR_SIGNING_SCOPES,
  getVendorJobLabelKey,
  objectKeyForScope,
  type VendorSigningScope,
} from '../../../src/lib/vendor-scope'
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

/**
 * The WHERE as SQL TEXT, not just its bound parameters.
 *
 * Property 4 has to distinguish "the vendor id appears somewhere in this
 * predicate" from "the vendor id is compared against BOTH
 * `production_jobs.vendor_id` and `order_consolidation.vendor_id`". Both bind
 * the same uuid, so `params()` cannot tell them apart — only the column names
 * can, and they live in the rendered SQL.
 */
function sqlText(condition: unknown): string {
  if (condition === undefined || condition === null) return ''
  try {
    return dialect.sqlToQuery(condition as SQL).sql
  } catch {
    return ''
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
const B_PHOTO_ID = '66666666-6666-4666-8666-666666666666'
/** A real photo id — A's, on A's job. */
const A_PHOTO_ID = '6666666a-6666-4666-8666-666666666666'
const B_TRANSFER_ID = '77777777-7777-4777-8777-777777777777'
/** A real transfer id — A's, between A and somebody who is not B. */
const A_TRANSFER_ID = '7777777a-7777-4777-8777-777777777777'

/** The key the QC upload routes build, spelled here as the client would. */
const qcKey = (jobId: string, slot = 'print_full') =>
  `production-qc/${jobId}/${slot}/1a2b3c.jpg`

const PAST = new Date('2026-01-01T00:00:00Z')

/**
 * The carrier label's random token, and the key it becomes.
 *
 * Hoisted out of Property 4 because the route table needs the same value: the
 * label route's row fixture IS the token — `getVendorJobLabelKey` selects one
 * column and nothing else — and Property 3 reads back the key the route signed.
 */
const LABEL_TOKEN = '9f3c1b7a5e2d4c8b1f0a6d3e7c2b8a45'
const LABEL_KEY = `fulfilment/labels/${LABEL_TOKEN}.pdf`

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

/** One live QC photograph, shaped as every read of that table projects it. */
const qcPhotoRow = (slot: string, id = B_PHOTO_ID) => ({
  id,
  slot,
  objectKey: qcKey(B_JOB_ID, slot),
  contentType: 'image/jpeg',
  sizeBytes: 1024,
  uploadedAt: PAST,
  reviewId: null,
})

/**
 * Rows shaped exactly as the scoped module's column lists return them.
 *
 * The job sits at `received` with a COMPLETE print shot list, which is the one
 * state in which every route in the table below has something to do: the QC
 * upload window is open (it is derived from the `shot-list-complete` edge), and
 * the PATCH entry can take that edge for real rather than being the only route
 * exercised against a job nobody has started.
 */
const OWNED_ROWS: Record<string, unknown[][]> = {
  'select:production_jobs': [
    [
      {
        id: B_JOB_ID,
        stage: 'print',
        status: 'received',
        settlementId: null,
        dueAt: PAST,
        sentAt: null,
        receivedAt: PAST,
        amountExpected: '100.00',
        amountActual: null,
        createdAt: PAST,
      },
    ],
  ],
  'select:production_job_photos': [
    [
      qcPhotoRow('print_full'),
      qcPhotoRow('print_colour_reference', '6666666b-6666-4666-8666-666666666666'),
      qcPhotoRow('print_raking_light', '6666666c-6666-4666-8666-666666666666'),
    ],
  ],
  'update:production_job_photos': [[{ id: B_PHOTO_ID }]],
  'insert:production_job_photos': [[qcPhotoRow('print_full')]],
  /**
   * The guarded PATCH writes with `.returning({ id })` and refuses on a
   * row-count mismatch, so "no rows queued" is now a 409 rather than a silent
   * success. One row, matching the one job.
   */
  'update:production_jobs': [[{ id: B_JOB_ID }]],
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
  /**
   * One parcel, through the SEVEN-field projection plus the caller-relative
   * `direction`. No vendor id on it at all — which is the point: vendor B never
   * learns the parcel came from vendor A.
   */
  'select:production_transfers': [
    [
      {
        id: B_TRANSFER_ID,
        reference: 'DL-9911',
        carrier: 'Delhivery',
        pieceCount: 1,
        dispatchedAt: PAST,
        expectedBy: null,
        receivedAt: null,
        direction: 'outbound',
      },
    ],
  ],
  'select:production_transfer_jobs': [[]],
  'insert:production_transfer_jobs': [[]],
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
  /**
   * Row batches for THIS route, layered over `OWNED_ROWS`.
   *
   * `OWNED_ROWS` is one job in one state, which is all a per-job route needs.
   * A transfer route reads `production_jobs` three times for three different
   * shapes — the locked scan, the routing aggregate, the guard's evidence — and
   * from a status no per-job route uses. Overriding the key here keeps that
   * local to the entry that needs it instead of bending the shared fixture into
   * a shape no reader actually returns.
   */
  rows?: Record<string, unknown[][]>
  /**
   * The ONE signing scope this route may produce a signature in, if any.
   *
   * R3 in the route table itself. A route that omits this signs nothing at all,
   * and Property 3 asserts both halves — that a scoped route's every signature
   * lands in its own scope, and that an unscoped route reaches no presigner.
   * Naming it here rather than special-casing the artwork route is what makes
   * the property extend to a route added later without anybody editing it.
   */
  scope?: VendorSigningScope
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
    // The job sits at `received` with a full shot list, so this is the real
    // guarded edge rather than the only one a fresh job could take.
    mine: () => [`/api/vendor/jobs/${B_JOB_ID}`, jsonInit({ status: 'qc_submitted' })],
    theirs: () => [`/api/vendor/jobs/${A_JOB_ID}`, jsonInit({ status: 'qc_submitted' })],
    okStatus: 200,
  },
  {
    pattern: '/jobs/:id/artwork/:itemId',
    method: 'GET',
    mine: () => [`/api/vendor/jobs/${B_JOB_ID}/artwork/${B_ITEM_ID}`, undefined],
    theirs: () => [`/api/vendor/jobs/${A_JOB_ID}/artwork/${A_ITEM_ID}`, undefined],
    okStatus: 200,
    scope: 'artwork',
  },
  {
    pattern: '/jobs/:id/label',
    method: 'GET',
    mine: () => [`/api/vendor/jobs/${B_JOB_ID}/label`, undefined],
    theirs: () => [`/api/vendor/jobs/${A_JOB_ID}/label`, undefined],
    okStatus: 200,
    scope: 'label',
    rows: {
      // `getVendorJobLabelKey` selects ONE column — the seam's token — with all
      // three authorisation conditions in the WHERE, so the shared job fixture
      // (a whole job row, no token on it) is not what this read returns.
      'select:production_jobs': [[{ token: LABEL_TOKEN }]],
    },
  },
  {
    pattern: '/jobs/:id/photos',
    method: 'GET',
    mine: () => [`/api/vendor/jobs/${B_JOB_ID}/photos`, undefined],
    theirs: () => [`/api/vendor/jobs/${A_JOB_ID}/photos`, undefined],
    okStatus: 200,
    scope: 'qcPhoto',
  },
  {
    pattern: '/jobs/:id/photos/presign',
    method: 'POST',
    mine: () => [
      `/api/vendor/jobs/${B_JOB_ID}/photos/presign`,
      jsonInit({ slot: 'print_full', contentType: 'image/jpeg', sizeBytes: 2048 }, 'POST'),
    ],
    theirs: () => [
      `/api/vendor/jobs/${A_JOB_ID}/photos/presign`,
      jsonInit({ slot: 'print_full', contentType: 'image/jpeg', sizeBytes: 2048 }, 'POST'),
    ],
    okStatus: 200,
    scope: 'qcPhoto',
  },
  {
    pattern: '/jobs/:id/photos/complete',
    method: 'POST',
    mine: () => [
      `/api/vendor/jobs/${B_JOB_ID}/photos/complete`,
      jsonInit(
        {
          slot: 'print_full',
          key: qcKey(B_JOB_ID),
          contentType: 'image/jpeg',
          sizeBytes: 2048,
        },
        'POST'
      ),
    ],
    // The key names A's job too. A well-formed request aimed at somebody else's
    // row is the attack; a key still naming B's job would be refused by the
    // rebuild check before the scoping ever came into it.
    theirs: () => [
      `/api/vendor/jobs/${A_JOB_ID}/photos/complete`,
      jsonInit(
        {
          slot: 'print_full',
          key: qcKey(A_JOB_ID),
          contentType: 'image/jpeg',
          sizeBytes: 2048,
        },
        'POST'
      ),
    ],
    okStatus: 201,
  },
  {
    pattern: '/jobs/:id/photos/:photoId',
    method: 'DELETE',
    mine: () => [`/api/vendor/jobs/${B_JOB_ID}/photos/${B_PHOTO_ID}`, { method: 'DELETE' }],
    theirs: () => [`/api/vendor/jobs/${A_JOB_ID}/photos/${A_PHOTO_ID}`, { method: 'DELETE' }],
    okStatus: 200,
  },
  {
    pattern: '/transfers',
    method: 'GET',
    mine: () => ['/api/vendor/transfers', undefined],
    okStatus: 200,
  },
  {
    pattern: '/transfers/:id',
    method: 'GET',
    mine: () => [`/api/vendor/transfers/${B_TRANSFER_ID}`, undefined],
    theirs: () => [`/api/vendor/transfers/${A_TRANSFER_ID}`, undefined],
    okStatus: 200,
  },
  {
    pattern: '/transfers',
    method: 'POST',
    mine: () => [
      '/api/vendor/transfers',
      jsonInit(
        { jobIds: [B_JOB_ID], carrier: 'Delhivery', reference: 'DL-9911', pieceCount: 1 },
        'POST'
      ),
    ],
    // A real job id — A's. A well-formed request aimed at somebody else's row
    // is the attack; the locked scan is vendor-scoped, so it finds nothing.
    theirs: () => [
      '/api/vendor/transfers',
      jsonInit(
        { jobIds: [A_JOB_ID], carrier: 'Delhivery', reference: 'DL-9911', pieceCount: 1 },
        'POST'
      ),
    ],
    okStatus: 201,
    rows: {
      'select:production_jobs': [
        // The locked scan: `qc_passed` is the only status with a vendor edge
        // into `dispatched`, which is what despatching a parcel takes.
        [{ id: B_JOB_ID, stage: 'print', status: 'qc_passed', settlementId: null }],
        // The routing aggregate. The order id is never selected — see the
        // module note — so "one order" is a count and the destination is the
        // consolidator, joined off the caller's own job.
        [{ orderCount: 1, consolidatorVendorId: VENDOR_A }],
        // The guard's evidence, once the parcel exists inside this transaction.
        [{ transferId: B_TRANSFER_ID, hasOrderLabel: false }],
      ],
      'insert:production_transfers': [
        [
          {
            id: B_TRANSFER_ID,
            reference: 'DL-9911',
            carrier: 'Delhivery',
            pieceCount: 1,
            dispatchedAt: PAST,
            expectedBy: null,
            receivedAt: null,
            direction: 'outbound',
          },
        ],
      ],
      'update:production_jobs': [[{ id: B_JOB_ID }]],
    },
  },
  {
    pattern: '/transfers/:id/received',
    method: 'POST',
    mine: () => [
      `/api/vendor/transfers/${B_TRANSFER_ID}/received`,
      jsonInit({}, 'POST'),
    ],
    theirs: () => [
      `/api/vendor/transfers/${A_TRANSFER_ID}/received`,
      jsonInit({}, 'POST'),
    ],
    okStatus: 200,
    rows: {
      'select:production_transfers': [
        // The locked read is INTERNAL: it needs `lostAt`, which no vendor-facing
        // projection has ever carried.
        [
          {
            id: B_TRANSFER_ID,
            reference: 'DL-9911',
            dispatchedAt: PAST,
            receivedAt: null,
            lostAt: null,
          },
        ],
        [
          {
            id: B_TRANSFER_ID,
            reference: 'DL-9911',
            carrier: 'Delhivery',
            pieceCount: 1,
            dispatchedAt: PAST,
            expectedBy: null,
            receivedAt: PAST,
            direction: 'inbound',
          },
        ],
      ],
      'update:production_transfers': [[{ id: B_TRANSFER_ID }]],
    },
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
 * This is R1, and R1 is the clause that took NO exception when dispatch moved
 * out of house. The vocabulary is therefore unchanged, and stays a blanket rule
 * rather than a judgement call per field. The order references are here for the
 * same reason as the names and addresses: `orderId` / `orderItemId` are direct
 * handles into a customer's order, and a vendor addresses their work by JOB,
 * never by order — the artwork route keys on `production_job_items.id`, not on
 * the order item behind it.
 *
 * The carrier label does not weaken this. It is delivered as RENDERED BYTES
 * behind a signature (R2), and its object key is identity-free by construction
 * (`fulfilment/labels/<token>.pdf`, never `<orderId>`), so nothing about it
 * arrives as a field for this walker to find — which is precisely why it is
 * allowed to exist at all.
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

/**
 * Order-keyed tables the carrier label pulled across this boundary (#678).
 *
 * Neither is vendor-owned the way the three above are: `order_shipments` has no
 * vendor column at all, and `order_consolidation.vendor_id` names the ONE vendor
 * despatching the order rather than the row's owner. Both are still required to
 * bind the caller's id in the SAME query's WHERE, because the only legitimate
 * way to reach either from this boundary is joined to a vendor-scoped row —
 * which is what `getVendorJobLabelKey` does today, and what #687's routes have
 * to keep doing.
 *
 * `orders` joined them with #686, and it is the same silence a fourth time. The
 * `open-transfer-or-order-label` guard has joined it since #684 — it asks
 * whether a shipping label exists as a BOOLEAN, because the AWB is a courier's
 * handle on a customer's parcel — but no route in this table could reach that
 * guard until a vendor could despatch a parcel, so the join has sat here
 * unexamined for two tickets. It holds more customer data than any other table
 * on this boundary, which makes it the worst one to have been silently skipping.
 *
 * They are written down because **Property 1 is an ALLOW-LIST**, and an
 * allow-list fails silently: a read of a table nobody listed is not judged
 * unscoped, it is not examined. #678 brought two of them across and added
 * neither, so every assertion below went on passing while covering none of the
 * new surface — which is indistinguishable, from the outside, from coverage.
 */
const ORDER_KEYED_TABLES = ['order_consolidation', 'order_shipments', 'orders']

/**
 * The parcel table. Two vendor columns, not one, so it is not vendor-OWNED the
 * way `production_jobs` is — but every vendor-facing read of it must still bind
 * the caller, on one side or the other, or a vendor sees a leg that is none of
 * their business.
 *
 * Written down for the reason the note above gives: **Property 1 is an
 * ALLOW-LIST**, and an allow-list fails SILENTLY. A read of a table nobody
 * listed is not judged unscoped, it is not examined — the silence that let #678
 * bring two tables across with no coverage, that #684 had to fix again for
 * `production_job_photos`, and that #685 hit twice. This is the fourth time; the
 * table goes in the vocabulary in the same commit that first queries it.
 *
 * `production_transfer_jobs` is deliberately NOT here. It carries no vendor
 * column at all, so there is nothing for a WHERE to bind — it is reachable only
 * behind a scoped job or a scoped transfer, which is what `JOB_KEYED_TABLES`
 * means, and where it is listed instead.
 */
const TRANSFER_TABLES = ['production_transfers']

/** Every table a vendor-facing query must name the caller's vendor id in. */
const SCOPED_TABLES = [...VENDOR_OWNED_TABLES, ...ORDER_KEYED_TABLES, ...TRANSFER_TABLES]

/**
 * Reachable only through a job, which is itself scoped before they are read.
 *
 * `production_job_photos` joined this list with #684's shot-list guard. Adding
 * it is not bookkeeping: this vocabulary is an ALLOW-LIST, so a table nobody
 * listed is not judged unscoped — it is not examined at all. That silence is
 * exactly what let #678 bring two tables across with no coverage while every
 * assertion here went on passing.
 */
const JOB_KEYED_TABLES = [
  'production_job_items',
  'production_job_reviews',
  'production_job_photos',
  // #686. A join table with no vendor column: a row here is reachable only
  // through a job we scoped or a transfer we scoped, both of which name the
  // caller in their own WHERE.
  'production_transfer_jobs',
]

/**
 * The tables a job-keyed read is only safe BEHIND. One of them must have been
 * read with the caller's id first, or the join it hangs off proves nothing.
 *
 * `production_transfers` joined the list with #686: `GET /transfers/:id` reaches
 * `production_transfer_jobs` from the parcel rather than from a job, and a gate
 * that only ever knew about `production_jobs` would have called that unproven.
 */
const GATE_TABLES = ['production_jobs', 'production_transfers']

/** Every scoped table one query touches, in its FROM or in any of its JOINs. */
function scopedTablesTouched(q: RecordedQuery): string[] {
  return [q.table, ...q.joins].filter((t): t is string => t !== null && SCOPED_TABLES.includes(t))
}

/**
 * The queries that touch a scoped table without binding the caller's vendor id.
 *
 * Factored out of the property so the property can be SHOWN to go red on a
 * planted violation — see the not-vacuous test below. An allow-list assertion
 * nobody has watched fail is indistinguishable from one that examines nothing,
 * which is exactly the state #678 left this in.
 */
/**
 * Does this query bind the caller's id in the ROW IT WRITES?
 *
 * An INSERT has no WHERE, so judging it by `params(q.where)` alone calls every
 * insert into a scoped table unscoped — which is why `production_job_photos`
 * could never be added to `SCOPED_TABLES` and had to settle for the weaker
 * job-keyed rule. An insert that writes `from_vendor_id = <the session's
 * vendor>` is scoped exactly as surely as a select that filters on it, and
 * saying so is what lets `production_transfers` be judged on BOTH its reads and
 * its writes rather than on half of them.
 *
 * Recursive, with a `seen` guard: drizzle wraps a bound value in a `Param`
 * object, and a `sql` fragment in a chunk list, so the id is rarely at the top
 * level.
 */
function bindsVendorInValues(
  values: unknown,
  vendorId: string,
  seen = new Set<unknown>()
): boolean {
  if (values === vendorId) return true
  if (values === null || typeof values !== 'object') return false
  if (seen.has(values)) return false
  seen.add(values)
  return Object.values(values as Record<string, unknown>).some((v) =>
    bindsVendorInValues(v, vendorId, seen)
  )
}

function unscopedReads(qs: readonly RecordedQuery[], vendorId: string): RecordedQuery[] {
  return qs.filter(
    (q) =>
      scopedTablesTouched(q).length > 0 &&
      !params(q.where).includes(vendorId) &&
      !(q.op !== 'select' && bindsVendorInValues(q.values, vendorId))
  )
}

/** `OWNED_ROWS`, with whatever the route's own entry layers over it. */
function seedFor(route: RouteCase) {
  queueRows({ ...OWNED_ROWS, ...(route.rows ?? {}) })
}

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
  mockUploadPresign.mockClear()
  mockUploadPresign.mockResolvedValue(UPLOAD_URL)
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
      seedFor(route)
      const [path, init] = route.mine()
      const { res } = await run(path, init)
      expect(res.status).toBe(route.okStatus)

      const unscoped = unscopedReads(queries, VENDOR_B)
      expect(
        unscoped.map((q) => `${q.op}:${q.table}`),
        'a vendor-scoped table was queried without the vendorId in its WHERE'
      ).toEqual([])

      // Job-keyed tables are safe only because a job — or a parcel — was scoped
      // first. JOINS count: a table reached only through a join is exactly the
      // position #678's two tables were in when nothing examined them.
      const touchedJobKeyed = queries.some((q) =>
        [q.table, ...q.joins].some((t) => t !== null && JOB_KEYED_TABLES.includes(t))
      )
      if (touchedJobKeyed) {
        const scopedGateRead = queries.some(
          (q) =>
            q.op === 'select' &&
            q.table !== null &&
            GATE_TABLES.includes(q.table) &&
            params(q.where).includes(VENDOR_B)
        )
        expect(scopedGateRead, 'job-keyed rows were read without a scoped gate read').toBe(true)
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

    // The FIRST scoped read, whichever table it lands on. It used to name
    // `production_jobs` outright, which was true of every route that existed —
    // and silently vacuous for the transfer routes, which reach a parcel
    // without touching a job at all.
    const scopedRead = queries.find(
      (q) => q.op === 'select' && scopedTablesTouched(q).length > 0
    )
    expect(scopedRead, 'no scoped read happened at all').toBeDefined()
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

  it('the scoped-table vocabulary actually catches an unscoped read — not vacuous', () => {
    // Same guard the body walker and the scope matcher already carry, and the
    // one this property was missing. Its failure mode is SILENCE: a table
    // outside the vocabulary is skipped, not judged, so "no route is unscoped"
    // and "no route was examined" produce identical green. #678 put this suite
    // in the second state for two tables and nothing went red.
    const scoped = sql`"production_jobs"."vendor_id" = ${VENDOR_B}`
    const q = (over: Partial<RecordedQuery>): RecordedQuery => ({
      op: 'select',
      table: null,
      fields: ['id'],
      joins: [],
      orderBy: [],
      ...over,
    })

    // One planted violation per shape the vocabulary now covers.
    const planted = [
      q({ table: 'production_jobs' }),
      q({ table: 'order_consolidation' }),
      q({ table: 'order_shipments' }),
      // The FROM is innocent; the JOIN is where #678 actually reached.
      q({ table: 'production_job_items', joins: ['order_shipments'] }),
      // #686's parcel table, read and WRITTEN. The write is the shape the
      // WHERE-only rule could never judge: an insert has no WHERE, so it was
      // either a false positive or invisible, and this vocabulary chose
      // invisible for every table an insert could reach.
      q({ table: 'production_transfers' }),
      q({ op: 'insert', table: 'production_transfers', values: { pieceCount: 1 } }),
      q({ table: 'production_jobs', joins: ['production_transfers'] }),
      // The guard's join, unexamined since #684 because nothing could reach it.
      q({ table: 'production_jobs', joins: ['orders'] }),
    ]
    expect(unscopedReads(planted, VENDOR_B).map((p) => p.table)).toEqual([
      'production_jobs',
      'order_consolidation',
      'order_shipments',
      'production_job_items',
      'production_transfers',
      'production_transfers',
      'production_jobs',
      'production_jobs',
    ])

    // ...and an insert that WRITES the caller's id is scoped, so the widening
    // is a check and not a blanket pass for every write.
    expect(
      unscopedReads(
        [q({ op: 'insert', table: 'production_transfers', values: { fromVendorId: VENDOR_B } })],
        VENDOR_B
      )
    ).toEqual([])
    expect(
      unscopedReads(
        [q({ op: 'insert', table: 'production_transfers', values: { fromVendorId: VENDOR_A } })],
        VENDOR_B
      ).map((p) => p.table)
    ).toEqual(['production_transfers'])

    // ...and it clears the same reads once they name the caller, so it is a
    // check and not a blanket refusal.
    expect(unscopedReads(planted.map((p) => ({ ...p, where: scoped })), VENDOR_B)).toEqual([])

    // A table nobody listed is genuinely not covered. Stated out loud, because
    // it is the property's cost: the next table to cross this boundary has to
    // be added to ORDER_KEYED_TABLES or it enjoys the same silence.
    expect(unscopedReads([q({ table: 'order_items' })], VENDOR_B)).toEqual([])
  })
})

// ============================================================================
// PROPERTY 2 — no vendor-facing payload contains customer data
// ============================================================================

describe('property 2: no customer data crosses the vendor boundary', () => {
  it.each(ROUTE_TABLE.map((r) => [label(r), r] as const))(
    '%s selects no table wholesale',
    async (_name, route) => {
      seedFor(route)
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
      seedFor(route)
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
      seedFor(route)
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
// PROPERTY 3 — every signature is short-lived, and lands in exactly one scope
// ============================================================================

/**
 * The scope vocabulary, and the two readings of it every signing property
 * needs. Module-level rather than inside Property 3 because Property 4 asks the
 * same two questions of the label route — which scope did this key land in, and
 * what did the whole surface hand a presigner — and a second private copy of
 * the matcher is a second thing that can go quietly wrong.
 */
const SCOPES = Object.keys(VENDOR_SIGNING_SCOPES) as VendorSigningScope[]

function scopesMatching(key: string): VendorSigningScope[] {
  return SCOPES.filter((scope) =>
    VENDOR_SIGNING_SCOPES[scope].some((prefix) => key.startsWith(prefix))
  )
}

/** Every key handed to EITHER presigner — downloads and uploads alike. */
const signedKeys = () =>
  [...mockPresign.mock.calls, ...mockUploadPresign.mock.calls].map((call) => call[0] as string)

describe('property 3: every vendor signature is short-lived and single-scoped', () => {
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
    // The two sibling SCOPES. `production-qc/` and `fulfilment/labels/` are
    // legitimate keys for other routes and refused here, which is R3: a route
    // signs inside its own scope or not at all. The label one is the case that
    // matters — it is the only object in the bucket that holds a customer's
    // name and address, and this route performs no consolidator check.
    'production-qc/job-1/front_full/shot.jpg',
    'fulfilment/labels/9f3c1b7a5e2d4c8b1f0a6d3e7c2b8a45.pdf',
  ]

  it.each(OFF_LIMITS_KEYS)('refuses to sign %s — outside the artwork scope, and often person-linked', async (key) => {
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

  it('never signs on a route that declares no scope', async () => {
    // It used to read "never signs on any other route", with artwork as the one
    // exception. #685 made that false — the QC routes sign too — and the honest
    // generalisation is the route table's own `scope` field rather than a
    // growing list of exceptions here. A route that names no scope still signs
    // NOTHING, which is the half that was ever load-bearing.
    for (const route of ROUTE_TABLE.filter((r) => !r.scope)) {
      queries.length = 0
      rowQueues.clear()
      mockPresign.mockClear()
      mockUploadPresign.mockClear()
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
      seedFor(route)

      const [path, init] = route.mine()
      await run(path, init)
      expect(mockPresign, `${label(route)} signed a download`).not.toHaveBeenCalled()
      expect(mockUploadPresign, `${label(route)} signed an upload`).not.toHaveBeenCalled()
    }
  })

  it('never builds a permanent public URL anywhere on this boundary', async () => {
    // `getPublicUrl` produces an unauthenticated path that stays readable by
    // anyone who ever saw it. Its call count across the whole vendor surface is
    // zero — asserted over every route, not only the ones that sign.
    for (const route of ROUTE_TABLE) {
      queries.length = 0
      rowQueues.clear()
      mockPublicUrl.mockClear()
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
      seedFor(route)

      const [path, init] = route.mine()
      await run(path, init)
      expect(mockPublicUrl, `${label(route)} built a public URL`).not.toHaveBeenCalled()
    }
  })

  // --------------------------------------------------------------------------
  // R3: the allow-list is the enforcement, and the scopes are disjoint
  // --------------------------------------------------------------------------

  it('every key ever handed to a presigner falls in EXACTLY ONE scope', async () => {
    // Not "in some scope". Exactly one — because a key matching two scopes
    // means the prefixes overlap, and an overlap is how the label scope's
    // consolidator check gets bypassed by asking the artwork route instead.
    for (const route of ROUTE_TABLE) {
      queries.length = 0
      rowQueues.clear()
      mockPresign.mockClear()
      mockUploadPresign.mockClear()
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
      seedFor(route)

      const [path, init] = route.mine()
      await run(path, init)

      for (const key of signedKeys()) {
        expect(
          scopesMatching(key),
          `${label(route)} signed "${key}", which matches ${scopesMatching(key).length} scopes`
        ).toHaveLength(1)
      }
    }
  })

  it("and it is the route's OWN scope, never a sibling's", async () => {
    // The half that stops the label exception widening. `objectKeyForScope`
    // refuses a key from another scope, but only if the route passes its own
    // scope name; a route that passed `label` "because the key looked like one"
    // would be a general PII signer with a correct-looking allow-list behind it.
    for (const route of ROUTE_TABLE.filter((r) => r.scope)) {
      queries.length = 0
      rowQueues.clear()
      mockPresign.mockClear()
      mockUploadPresign.mockClear()
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
      seedFor(route)

      const [path, init] = route.mine()
      await run(path, init)

      const keys = signedKeys()
      expect(keys.length, `${label(route)} declares a scope but signed nothing`).toBeGreaterThan(0)
      for (const key of keys) {
        expect(scopesMatching(key), `${label(route)} signed "${key}"`).toEqual([route.scope])
      }
    }
  })

  it('the scopes are pairwise disjoint and non-substitutable, both directions', () => {
    const SAMPLE: Record<VendorSigningScope, string> = {
      artwork: 'products/originals/abc.jpg',
      qcPhoto: 'production-qc/job-1/front_full/shot.jpg',
      label: 'fulfilment/labels/9f3c1b7a5e2d4c8b1f0a6d3e7c2b8a45.pdf',
    }

    for (const scope of SCOPES) {
      for (const other of SCOPES) {
        const got = objectKeyForScope(scope, SAMPLE[other])
        if (scope === other) {
          expect(got, `${scope} refused its own key`).toBe(SAMPLE[other])
        } else {
          expect(got, `${scope} accepted a ${other} key — the scopes are substitutable`).toBeNull()
        }
      }
    }

    // Named explicitly, because these two are the pair that matters: the label
    // is the only PII carrier, and artwork is the route with no consolidator
    // check. Either substitution turns one narrow exception into a wide hole.
    expect(objectKeyForScope('artwork', SAMPLE.label)).toBeNull()
    expect(objectKeyForScope('label', SAMPLE.artwork)).toBeNull()
  })

  it.each(['constructor', '__proto__', 'hasOwnProperty', 'toString'])(
    'fails CLOSED on the inherited property name %s, rather than throwing',
    (name) => {
      // `VENDOR_SIGNING_SCOPES[name]` resolves up the PROTOTYPE CHAIN to a
      // function, whose truthy `.length` walks past a plain emptiness guard and
      // then explodes inside `.some`. The scope argument is always a code
      // literal, so this is not attacker-reachable — it is asserted because
      // "fails closed rather than throwing" has to actually mean that.
      expect(objectKeyForScope(name as VendorSigningScope, 'products/abc.jpg')).toBeNull()
      expect(mockPresign).not.toHaveBeenCalled()
    }
  )

  it('the scope matcher actually finds a match — this property is not vacuous', () => {
    // Same guard as the body walker has. `scopesMatching` returning [] for
    // everything would make the "exactly one scope" test above pass by
    // examining nothing at all.
    expect(scopesMatching('products/abc.jpg')).toEqual(['artwork'])
    expect(scopesMatching('fulfilment/labels/tok.pdf')).toEqual(['label'])
    expect(scopesMatching('avatars/user-9/avatar.jpg')).toEqual([])
  })
})

// ============================================================================
// PROPERTY 4 — the carrier label, the one document that carries customer data
// ============================================================================

/**
 * R2 in full: customer data reaches a vendor ONLY as opaque rendered bytes,
 * behind a short-lived signature, and only for the vendor who is actually
 * despatching the parcel.
 *
 * `getVendorJobLabelKey` is where that is decided, and it has to decide it in
 * ONE query. All three conditions live in the WHERE — the job is this vendor's,
 * the order's consolidator is this vendor, a label token exists — so a
 * non-consolidator's request resolves to `null` before any key is built, which
 * means the presigner is NEVER REACHED. That distinction is the whole point:
 * a signed URL that is generated and then withheld has still been generated,
 * and lives in whatever log, trace or crash dump saw it. "The response was a
 * 404" is not the property. "No signature exists" is.
 *
 * A fourth condition rides along that is NOT an authorisation check and cannot
 * be a predicate: WHICH shipment. `order_shipments.order_id` is a plain indexed
 * FK, not unique, so an order whose label was voided and re-bought has several
 * rows with several tokens, and a bare `LIMIT 1` over them is a coin flip that
 * can land on the dead label — or on a different one each call. It is asserted
 * below as an explicit ORDER BY, because "deterministic" is not observable in a
 * single-row fixture.
 *
 * Asserted in two layers, because a green test proves nothing about the ORDER
 * two calls happen in. The scoped module is asserted directly — one query, the
 * three predicates, the identity-free key — and `GET /api/vendor/jobs/:id/label`
 * is then driven end to end through the route table. The layer that ties them
 * together is a SOURCE SCAN: a handler that signed first and threw the URL away
 * on a `null` would pass every fixture below, because a discarded signature is
 * invisible from the outside. It is visible in the code, so the code is what is
 * read.
 */
describe('property 4: the carrier label reaches only the consolidator, or is never signed', () => {
  /** Never appears in a label key. Present so the test can prove that. */
  const ORDER_ID = '55555555-5555-4555-8555-555555555555'

  /** The row the seam's narrow select returns: the token, and nothing else. */
  const tokenRow = (token: unknown = LABEL_TOKEN) => ({ token })

  it('puts all THREE conditions in one WHERE — job, consolidator, token', async () => {
    queueRows({ 'select:production_jobs': [[tokenRow()]] })

    const got = await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)
    expect(got).toEqual({ jobId: B_JOB_ID, key: LABEL_KEY })

    // ONE query. Three separate reads with the checks in application code is
    // the shape that grows a branch where one check is skipped.
    const reads = queries.filter((q) => q.op === 'select')
    expect(reads.map((q) => q.table)).toEqual(['production_jobs'])

    const where = sqlText(reads[0].where)
    expect(where, 'the job is not scoped to this vendor').toContain(
      '"production_jobs"."vendor_id"'
    )
    expect(where, 'the consolidator is not checked in the WHERE').toContain(
      '"order_consolidation"."vendor_id"'
    )
    expect(where.toLowerCase(), 'the label token is not required in the WHERE').toContain(
      'label_object_token'
    )
    expect(where.toLowerCase()).toContain('is not null')

    const bound = params(reads[0].where)
    expect(bound).toContain(B_JOB_ID)
    expect(bound).toContain(VENDOR_B)
    expect(bound).not.toContain(VENDOR_A)
  })

  it('picks the shipment DETERMINISTICALLY, not whichever row Postgres reached first', async () => {
    queueRows({ 'select:production_jobs': [[tokenRow()]] })
    await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)

    const read = queries.find((q) => q.op === 'select')!
    // A single-row fixture cannot see this: with one shipment every ordering
    // agrees. The assertion is therefore on the QUERY, which is where the
    // nondeterminism lives — an order with a voided-and-rebought label has two
    // labelled rows, and `LIMIT 1` with no ORDER BY picks between them by luck.
    expect(read.orderBy.length, 'the label read has no ORDER BY at all').toBeGreaterThan(0)

    const ordering = read.orderBy.map((o) => sqlText(o)).join(' ')
    expect(ordering, 'the newest label is not what decides').toContain(
      '"order_shipments"."created_at"'
    )
    // Total, not merely usually stable: two labels bought in the same instant
    // must still resolve to exactly one answer.
    expect(ordering, 'a same-instant tie is left to the planner').toContain(
      '"order_shipments"."id"'
    )
    expect(ordering.toLowerCase(), 'the OLDEST label would win').toContain('desc')
    expect(ordering.toLowerCase()).not.toContain('asc')
  })

  it('names the caller in every scoped table it touches, JOINS included', async () => {
    queueRows({ 'select:production_jobs': [[tokenRow()]] })
    await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)

    const read = queries.find((q) => q.op === 'select')!
    // The two tables #678 brought across are reached by JOIN, so Property 1's
    // vocabulary covers them only if joins are part of what it looks at. If
    // this list ever shrinks, the vocabulary has gone dormant again.
    expect(scopedTablesTouched(read).sort()).toEqual([
      'order_consolidation',
      'order_shipments',
      'production_jobs',
    ])
    expect(unscopedReads(queries, VENDOR_B), 'the label read is not vendor-scoped').toEqual([])
  })

  it('returns null for a NON-CONSOLIDATOR and the presigner is never called', async () => {
    // The consolidator predicate in the WHERE excluded the row, so the read
    // comes back empty and nothing downstream of it ever runs.
    queueRows({ 'select:production_jobs': [[]] })

    expect(await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)).toBeNull()
    expect(
      mockPresign,
      'a label URL was signed for a vendor who is not the consolidator'
    ).not.toHaveBeenCalled()
    expect(mockPublicUrl).not.toHaveBeenCalled()
  })

  it("returns null for another vendor's job, and signs nothing", async () => {
    queueRows({ 'select:production_jobs': [[]] })

    expect(await getVendorJobLabelKey(VENDOR_B, A_JOB_ID)).toBeNull()
    expect(mockPresign).not.toHaveBeenCalled()
    expect(params(queries[0]?.where)).toContain(VENDOR_B)
    expect(params(queries[0]?.where)).not.toContain(VENDOR_A)
  })

  it('returns null when no label has been issued yet, rather than signing nothing', async () => {
    // Belt and braces: the WHERE already excludes a null token, but a row that
    // arrives with one anyway must not become `fulfilment/labels/null.pdf`.
    queueRows({ 'select:production_jobs': [[tokenRow(null)]] })

    expect(await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)).toBeNull()
    expect(mockPresign).not.toHaveBeenCalled()
  })

  it('throws rather than reading anything when the vendorId is missing', async () => {
    await expect(getVendorJobLabelKey(null, B_JOB_ID)).rejects.toThrow(/vendorId is required/)
    await expect(getVendorJobLabelKey(undefined, B_JOB_ID)).rejects.toThrow(/vendorId is required/)
    expect(queries).toEqual([])
    expect(mockPresign).not.toHaveBeenCalled()
  })

  it('returns null for a missing jobId without building a query', async () => {
    expect(await getVendorJobLabelKey(VENDOR_B, undefined)).toBeNull()
    expect(queries).toEqual([])
    expect(mockPresign).not.toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // The key is identity-free BY CONSTRUCTION
  // --------------------------------------------------------------------------

  it('builds a key that embeds no order, job or vendor identifier', async () => {
    queueRows({ 'select:production_jobs': [[tokenRow()]] })

    const got = await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)
    const key = got!.key

    // An order id in a URL path is a stable person-linked handle, and it lives
    // where no assertion about JSON *keys* can ever see it — the signed URL
    // carries the object key in its path. So it is excluded by construction,
    // not filtered out afterwards.
    expect(key.startsWith('fulfilment/labels/')).toBe(true)
    expect(key.endsWith('.pdf')).toBe(true)
    for (const id of [ORDER_ID, B_JOB_ID, A_JOB_ID, VENDOR_A, VENDOR_B, B_ITEM_ID]) {
      expect(key, `the label key embeds ${id}`).not.toContain(id)
    }
    // What is left is the random token and nothing else.
    expect(key).toBe(`fulfilment/labels/${LABEL_TOKEN}.pdf`)
  })

  it('refuses a token that would escape the label prefix', async () => {
    // The token is DATA, read from a table another sub-project writes. A token
    // of `../../avatars/user-9/avatar` would otherwise resolve to a key outside
    // the scope entirely, which is the general-signer bug in a new costume.
    for (const bad of [
      '../../avatars/user-9/avatar',
      'a/../../../products/secret',
      '..',
      '',
      '   ',
      // The same traversal, URL-ENCODED. `objectKeyForScope` only decodes a
      // full URL, so a raw `%2e%2e` would survive to the key — the token gate
      // is what refuses it, one layer earlier, on the character class.
      '%2e%2e/%2e%2e/avatars/user-9/avatar',
      // Bucket-qualified and scheme-qualified forms, refused for the same
      // reason: a token is one path SEGMENT and these are not.
      'poster-app-dev/fulfilment/labels/tok',
      's3://poster-app-dev/fulfilment/labels/tok',
      'https://cdn.example.com/avatars/user-9/avatar',
      // Case variants of the prefix. `startsWith` is case-SENSITIVE, so
      // `Fulfilment/` is outside the scope; the token gate refuses the slash
      // first, and `objectKeyForScope` would refuse the key after it.
      'Fulfilment/labels/tok',
    ]) {
      queries.length = 0
      rowQueues.clear()
      mockPresign.mockClear()
      queueRows({ 'select:production_jobs': [[tokenRow(bad)]] })

      expect(
        await getVendorJobLabelKey(VENDOR_B, B_JOB_ID),
        `accepted an escaping token: ${JSON.stringify(bad)}`
      ).toBeNull()
      expect(mockPresign).not.toHaveBeenCalled()
    }
  })

  it('resolves the key through the LABEL scope, so an artwork key cannot arrive', async () => {
    // The final key goes through the same allow-list every other signature
    // does, under its own scope. That is what makes R3 an enforcement rather
    // than a naming convention.
    queueRows({ 'select:production_jobs': [[tokenRow()]] })
    const got = await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)

    expect(objectKeyForScope('label', got!.key)).toBe(got!.key)
    expect(objectKeyForScope('artwork', got!.key)).toBeNull()
    expect(objectKeyForScope('qcPhoto', got!.key)).toBeNull()
  })

  // --------------------------------------------------------------------------
  // R1 is untouched by the exception
  // --------------------------------------------------------------------------

  it('selects nothing wholesale and no forbidden column', async () => {
    queueRows({ 'select:production_jobs': [[tokenRow()]] })
    await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)

    const read = queries.find((q) => q.op === 'select')!
    expect(read.fields, 'the label read selected a table wholesale').not.toBeNull()
    expect(
      (read.fields ?? []).filter((f) => FORBIDDEN_KEYS.includes(f.toLowerCase()))
    ).toEqual([])
  })

  it('returns no customer data as DATA — only a job id and an opaque key', async () => {
    queueRows({ 'select:production_jobs': [[tokenRow()]] })
    const got = await getVendorJobLabelKey(VENDOR_B, B_JOB_ID)

    // R1 holds over the return value the same way it holds over every route
    // body: the label's PII is inside the rendered PDF, never in a field.
    expect(Object.keys(got!).sort()).toEqual(['jobId', 'key'])
    expect(forbiddenKeysIn(got)).toEqual([])
    expect(JSON.stringify(got)).not.toContain(ORDER_ID)
  })

  // --------------------------------------------------------------------------
  // The route: GET /api/vendor/jobs/:id/label
  // --------------------------------------------------------------------------

  describe('the route hands over bytes behind a signature, and only to the consolidator', () => {
    const LABEL = ROUTE_TABLE.find((r) => r.pattern === '/jobs/:id/label')!
    const ARTWORK = ROUTE_TABLE.find((r) => r.pattern === '/jobs/:id/artwork/:itemId')!

    /**
     * A customer, planted where a customer actually lives: the shipment row the
     * label token is read from. `order_shipments` sits beside the address the
     * carrier printed, and the recording db returns whatever a fixture queues —
     * so this is the shape of the leak that would happen if the seam's select
     * ever widened from one column to the row.
     */
    const PLANTED_ROW = {
      token: LABEL_TOKEN,
      customerName: 'Asha Menon',
      shippingAddress: '221B Nehru Place, New Delhi 110019',
      phone: '+919812345678',
      email: 'asha.menon@example.com',
      orderId: ORDER_ID,
    }

    it('answers { jobId, url, expiresInSeconds, expiresAt } and nothing else', async () => {
      seedFor(LABEL)
      const [path, init] = LABEL.mine()
      const { res, body } = await run(path, init)

      expect(res.status).toBe(200)
      expect(Object.keys(body).sort()).toEqual([
        'expiresAt',
        'expiresInSeconds',
        'jobId',
        'url',
      ])
      expect(body.jobId).toBe(B_JOB_ID)
      expect(body.url).toBe(SIGNED_URL)

      // R1, on the one route that exists to move customer data. The PII is
      // inside the PDF the vendor will fetch; not one field of it is here.
      expect(forbiddenKeysIn(body).sort()).toEqual([])
      // The key itself never leaves either — only the signature over it.
      expect(JSON.stringify(body)).not.toContain(LABEL_KEY)
    })

    it('signs the LABEL key, through the label scope, and signs it once', async () => {
      seedFor(LABEL)
      const [path, init] = LABEL.mine()
      await run(path, init)

      expect(mockPresign).toHaveBeenCalledTimes(1)
      expect(mockPresign.mock.calls[0][0]).toBe(LABEL_KEY)
      expect(scopesMatching(LABEL_KEY)).toEqual(['label'])
      // A permanent public path to a customer's address would be the whole
      // incident in one line.
      expect(mockPublicUrl).not.toHaveBeenCalled()
      expect(mockUploadPresign).not.toHaveBeenCalled()
    })

    it('expires in 300 seconds — the SAME number as artwork, not a second one', async () => {
      seedFor(LABEL)
      const [labelPath, labelInit] = LABEL.mine()
      const { body } = await run(labelPath, labelInit)
      const labelTtl = mockPresign.mock.calls[0][1] as number

      expect(labelTtl).toBe(300)
      expect(body.expiresInSeconds).toBe(labelTtl)
      // `expiresAt` is the same fact in the other unit, so a client cannot read
      // the two and disagree with itself.
      expect(
        Math.abs(Date.parse(body.expiresAt) - (Date.now() + labelTtl * 1000))
      ).toBeLessThan(5_000)

      // One number, not three that drift. Property 3's "expires in minutes, not
      // days" extends over this route unchanged because the TTL is artwork's.
      queries.length = 0
      rowQueues.clear()
      mockPresign.mockClear()
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
      seedFor(ARTWORK)
      const [artPath, artInit] = ARTWORK.mine()
      await run(artPath, artInit)
      expect(mockPresign.mock.calls[0][1]).toBe(labelTtl)
    })

    it('a NON-CONSOLIDATOR gets 404 and the presigner is NEVER CALLED', async () => {
      // The consolidator predicate lives in the WHERE, so the row does not come
      // back at all. Nothing downstream of the read ever runs.
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
      queueRows({ 'select:production_jobs': [[]] })

      const [path, init] = LABEL.mine()
      const { res, body } = await run(path, init)

      expect(res.status).toBe(404)
      // Not "the response was a 404". A signed URL that is generated and then
      // withheld has still been generated, and lives in whatever log, trace or
      // crash dump saw it.
      expect(
        mockPresign,
        'a carrier label was signed for a vendor who is not the consolidator'
      ).not.toHaveBeenCalled()
      expect(mockPublicUrl).not.toHaveBeenCalled()
      // And no row claims a label was issued.
      expect(queries.filter((q) => q.op !== 'select')).toEqual([])
      expect(JSON.stringify(body)).not.toContain(LABEL_TOKEN)
    })

    it("asks for another vendor's job with BOTH vendor predicates bound to the caller", async () => {
      // The recording db is blind to the WHERE — it answers whatever a fixture
      // queued — so "queue A's token and watch the route refuse it" would be a
      // test of the mock, not of the code, and would go green on a route with
      // no scoping at all. What IS observable is the predicate the route sends,
      // and it is the predicate that makes the empty result real in Postgres.
      // The 404 half is Property 1's `theirs` case, on an empty read.
      queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
      queueRows({ 'select:production_jobs': [[]] })

      const [path, init] = LABEL.theirs!()
      const { res } = await run(path, init)

      expect(res.status).toBe(404)
      expect(mockPresign).not.toHaveBeenCalled()

      const read = queries.find((q) => q.op === 'select' && q.table === 'production_jobs')!
      const where = sqlText(read.where)
      // TWO different columns, both compared to the caller. `params` cannot tell
      // them apart — they bind the same uuid — so the columns are read off the
      // rendered SQL: the job is theirs, AND they are the consolidator.
      expect(where, 'the job is not scoped to this vendor').toContain(
        '"production_jobs"."vendor_id"'
      )
      expect(where, 'the consolidator is not checked at all').toContain(
        '"order_consolidation"."vendor_id"'
      )
      expect(params(read.where)).toContain(VENDOR_B)
      expect(params(read.where)).toContain(A_JOB_ID)
      expect(params(read.where)).not.toContain(VENDOR_A)
    })

    it('a customer planted in the shipment row reaches NO JSON', async () => {
      seedFor(LABEL)
      queueRows({ 'select:production_jobs': [[PLANTED_ROW]] })

      const [path, init] = LABEL.mine()
      const { res, body } = await run(path, init)

      expect(res.status).toBe(200)
      expect(forbiddenKeysIn(body).sort()).toEqual([])
      const serialised = JSON.stringify(body)
      for (const secret of [
        PLANTED_ROW.customerName,
        PLANTED_ROW.shippingAddress,
        PLANTED_ROW.phone,
        PLANTED_ROW.email,
        PLANTED_ROW.orderId,
      ]) {
        expect(serialised, `the label body echoed ${secret}`).not.toContain(secret)
      }

      // The audit row is JSON too, written on the same request, and it is the
      // other place a row could be copied wholesale into.
      const audit = queries.find((q) => q.op === 'insert' && q.table === 'admin_audit_log')
      expect(audit, 'the label was issued without an audit row').toBeDefined()
      const auditText = JSON.stringify(audit?.values ?? {})
      for (const secret of [
        PLANTED_ROW.customerName,
        PLANTED_ROW.shippingAddress,
        PLANTED_ROW.phone,
        PLANTED_ROW.email,
        PLANTED_ROW.orderId,
      ]) {
        expect(auditText, `the audit row recorded ${secret}`).not.toContain(secret)
      }
    })

    it('the plant is one the walker WOULD catch — this property is not vacuous', () => {
      // Without this, "the planted name reached no JSON" and "the plant was
      // never in the fixture" produce identical green. Four reviews of this
      // feature have found tests that could not fail.
      expect(forbiddenKeysIn(PLANTED_ROW).sort()).toEqual([
        'customername',
        'email',
        'orderid',
        'phone',
        'shippingaddress',
      ])
      expect(JSON.stringify(PLANTED_ROW)).toContain('Asha Menon')
    })

    it('records production_job.label_issued on success, for this vendor', async () => {
      seedFor(LABEL)
      const [path, init] = LABEL.mine()
      await run(path, init)

      const audit = queries.find((q) => q.op === 'insert' && q.table === 'admin_audit_log')
      expect(audit, 'no audit row for a customer document leaving the building').toBeDefined()
      const values = audit!.values as Record<string, unknown>
      expect(values.action).toBe('production_job.label_issued')
      expect(values.entityType).toBe('production_job')
      expect(values.entityId).toBe(B_JOB_ID)
      expect(values.outcome).toBe('success')
      // §8's property: every audit row written under /api/vendor/* names the
      // shop it was written for.
      expect((values.metadata as Record<string, unknown>).vendorId).toBe(VENDOR_B)
    })

    it('claims no disclosure when the signature never happened', async () => {
      // The row says a customer's name and address left the building. If the
      // presigner throws, nothing left it, and a row saying otherwise is worse
      // than no row — it is the shape an auditor would trust.
      seedFor(LABEL)
      mockPresign.mockRejectedValueOnce(new Error('R2 unreachable'))

      const [path, init] = LABEL.mine()
      const { res, body } = await run(path, init)

      expect(res.status).toBe(500)
      expect(
        queries.filter((q) => q.op === 'insert' && q.table === 'admin_audit_log'),
        'a label_issued row survived a label that was never issued'
      ).toEqual([])
      // And the failure says nothing about the customer either.
      expect(forbiddenKeysIn(body).sort()).toEqual([])
      expect(JSON.stringify(body)).not.toContain(LABEL_TOKEN)
    })

    it('is the ONLY door to the label scope on the whole vendor surface', async () => {
      // The narrow exception R2 grants is only as narrow as the number of
      // routes that can produce a key inside it. Asserted over every route in
      // the table, so a second door added later fails here rather than being
      // reviewed for.
      for (const route of ROUTE_TABLE) {
        queries.length = 0
        rowQueues.clear()
        mockPresign.mockClear()
        mockUploadPresign.mockClear()
        queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_B, status: 'active' }]] })
        seedFor(route)

        const [path, init] = route.mine()
        await run(path, init)

        const labelKeys = signedKeys().filter((k) => scopesMatching(k).includes('label'))
        if (route === LABEL) {
          expect(labelKeys, 'the label route signed no label').toEqual([LABEL_KEY])
        } else {
          expect(
            labelKeys,
            `${label(route)} signed a carrier label — the exception is now a hole`
          ).toEqual([])
        }
      }
    })

    // ------------------------------------------------------------------------
    // The ordering, read off the CODE
    // ------------------------------------------------------------------------

    /**
     * `routes/vendor.ts`, comments removed so a scan judges CODE and not prose.
     *
     * Every fixture above is blind to the one failure that matters most: a
     * handler that signs the URL, then discovers the caller is not the
     * consolidator and returns 404 anyway, answers exactly what these tests
     * expect while the signature it discarded already exists. `mockPresign` is
     * only ever called on the paths a fixture can reach, and the dangerous path
     * is one where the answer looks identical. So the order is asserted where it
     * is actually decided.
     */
    const VENDOR_SOURCE = readFileSync(
      resolve(__dirname, '../../../src/routes/vendor.ts'),
      'utf8'
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    /** The label handler alone: from its path literal to the next registration. */
    const LABEL_HANDLER = (() => {
      const at = VENDOR_SOURCE.indexOf('"/jobs/:id/label"')
      if (at === -1) return ''
      const rest = VENDOR_SOURCE.slice(at)
      const next = rest.indexOf('vendorApp.', 1)
      return next === -1 ? rest : rest.slice(0, next)
    })()

    const firstIndexOf = (needle: string) => LABEL_HANDLER.indexOf(needle)

    it('AUTHORISES BEFORE IT SIGNS — in the code, not only in the fixture', () => {
      expect(LABEL_HANDLER, 'no /jobs/:id/label handler found to scan').not.toBe('')

      const authorised = firstIndexOf('getVendorJobLabelKey')
      const refused = firstIndexOf('404')
      const signed = firstIndexOf('getPresignedDownloadUrl')

      // Each is present at all — a scan over the wrong slice would report -1
      // for everything and pass every ordering comparison it made.
      expect(authorised, 'the handler never calls the scoped module').toBeGreaterThan(-1)
      expect(refused, 'the handler has no 404 path').toBeGreaterThan(-1)
      expect(signed, 'the handler never signs anything').toBeGreaterThan(-1)

      expect(authorised, 'the handler signs before it authorises').toBeLessThan(signed)
      expect(refused, 'the 404 is returned after the URL was already signed').toBeLessThan(
        signed
      )
    })

    it('audits AFTER the signature exists, and shares no transaction', () => {
      const signed = firstIndexOf('getPresignedDownloadUrl')
      const audited = firstIndexOf('recordAudit')

      expect(audited, 'the label issue is not audited at all').toBeGreaterThan(-1)
      // "On first success" means after the URL is real. A row written before the
      // presigner claims a label was issued that a throw would then unissue.
      expect(audited, 'the audit row is written before the URL exists').toBeGreaterThan(signed)
      // No transaction exists on this path — §8's rule — so none is invented,
      // and `recordAudit` therefore cannot rethrow into a handler that has
      // already handed the vendor a working URL.
      expect(LABEL_HANDLER, 'the label handler invented a transaction').not.toMatch(/\btx\b/)
      expect(LABEL_HANDLER).not.toContain('transaction')
    })

    it('the ordering comparator can actually fail — this property is not vacuous', () => {
      // The two assertions above are `<` over indexes into a string. If the
      // slice were empty both sides would be -1 and every comparison would be
      // trivially satisfied, which is the exact shape of a test that cannot go
      // red. So the comparator is shown deciding both ways.
      const signsFirst = 'const url = await getPresignedDownloadUrl(k); const r = await getVendorJobLabelKey(v);'
      expect(signsFirst.indexOf('getVendorJobLabelKey')).toBeGreaterThan(
        signsFirst.indexOf('getPresignedDownloadUrl')
      )
      expect(LABEL_HANDLER.indexOf('getVendorJobLabelKey')).toBeLessThan(
        LABEL_HANDLER.indexOf('getPresignedDownloadUrl')
      )
    })

    it('reaches no table outside the vocabulary Property 1 examines', async () => {
      // Property 1 is an ALLOW-LIST, and an allow-list fails SILENTLY: a table
      // nobody listed is not judged unscoped, it is not examined at all. That
      // silence has been found five times on this boundary — most recently
      // `orders`, which sat unexamined for two tickets. So the label route's
      // tables are enumerated here rather than assumed.
      seedFor(LABEL)
      const [path, init] = LABEL.mine()
      await run(path, init)

      const read = queries.find((q) => q.op === 'select' && q.table === 'production_jobs')!
      expect([read.table, ...read.joins].sort()).toEqual([
        'order_consolidation',
        'order_shipments',
        'production_jobs',
      ])
      // Every one of them is in SCOPED_TABLES, so the assertion below is a
      // judgement rather than a shrug.
      expect([read.table, ...read.joins].filter((t) => !SCOPED_TABLES.includes(t!))).toEqual([])
      expect(unscopedReads(queries, VENDOR_B), 'the label read is not vendor-scoped').toEqual([])
    })
  })
})
