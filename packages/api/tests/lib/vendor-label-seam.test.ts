/**
 * The carrier label's SEAM, and the two bounds around it.
 *
 * `lib/vendor-scope.ts` reads `order_shipments.label_object_token` as a raw SQL
 * fragment. **That column does not exist** — not in `schema/shipping.ts`, not in
 * any of the migrations — because it belongs to `order-dispatch-tracking`, and
 * inventing it here would put this feature's name on another sub-project's
 * table. That part is deliberate and stays.
 *
 * What this file exists for is everything around it:
 *
 * 1. **The seam is DETECTABLE.** Nothing in the repository noticed either
 *    state — the column being absent, or the column arriving. The first test
 *    below goes RED the day `label_object_token` lands and says, in its failure
 *    message, exactly what to wire up. Until then it holds the other half:
 *    while the column is missing, the deliberate failure path must still be
 *    there. The two cannot drift apart.
 *
 * 2. **The failure is SAFE.** The read raises `42703` today, and that used to
 *    travel to `routes/vendor.ts`'s catch-all and come back as
 *    `500 Failed to sign label URL: column "order_shipments"."label_object_token"
 *    does not exist` — our schema, narrated to a supplier, from the ONE route
 *    that exists to carry a customer's name, address and phone. It is now a
 *    typed throw, answered with a fixed 503 that names no column, table or
 *    driver.
 *
 * 3. **The label has a STATUS BOUND.** Three conditions used to live in the
 *    WHERE and the job's status was not one of them, so a vendor whose job had
 *    been cancelled — told in as many words to stop work — could still fetch the
 *    customer's address as a PDF, indefinitely. `LABEL_ACCESS_STATUSES` is
 *    derived from the transition matrix and asserted here.
 *
 * Harness: the recording query builder every vendor suite uses. The label read
 * is asserted as a QUERY (the recording db is blind to a WHERE, so a behavioural
 * fixture would be testing the mock), and the route is driven end to end.
 *
 * @see packages/api/src/lib/vendor-scope.ts
 * @see packages/api/src/routes/vendor.ts
 * @see packages/api/tests/routes/vendor/isolation.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildRouteApp } from '../helpers/route-app'
import { vendorSessionFor } from '../helpers/vendor-session'
import '../setup'

const recorder = await vi.hoisted(async () =>
  (await import('../helpers/query-recorder')).createQueryRecorder({ rows: 'repeatLast' })
)

vi.mock('../../src/database', () => ({ db: recorder.db }))

const mockGetSession = vi.fn()

vi.mock('../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

const SIGNED_URL = 'https://r2.example.com/bucket/label?X-Amz-Signature=cafef00d'

const mockPresign = vi.hoisted(() =>
  vi.fn(
    async (_key: string, _expiresIn?: number) =>
      'https://r2.example.com/bucket/label?X-Amz-Signature=cafef00d'
  )
)

vi.mock('../../src/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/storage')>()),
  getPresignedDownloadUrl: (...args: unknown[]) => mockPresign(...(args as [string, number?])),
  fileExists: async (_key: string) => true,
}))

const auditSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../../src/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/audit')>()),
  recordAudit: (...args: unknown[]) => auditSpy(...args),
}))

import { vendorApp } from '../../src/routes/vendor'
import { readJson } from '../helpers/json'
import {
  LABEL_ACCESS_STATUSES,
  LabelSeamNotReady,
  getVendorJobLabelKey,
} from '../../src/lib/vendor-scope'
import { PRODUCTION_TRANSITIONS } from '../../src/lib/production-transitions'

// ============================================================================
// Fixtures
// ============================================================================

const { params, render, queueRows, queries } = recorder

const VENDOR_ID = '33333333-3333-4333-8333-333333333333'
const JOB_ID = '22222222-2222-4222-8222-222222222222'
const LABEL_TOKEN = '9f3c1b7a5e2d4c8b1f0a6d3e7c2b8a45'
const LABEL_KEY = `fulfilment/labels/${LABEL_TOKEN}.pdf`

const labelPath = (jobId = JOB_ID) => `/api/vendor/jobs/${jobId}/label`

const buildApp = () => buildRouteApp('/api/vendor', vendorApp)

const API_SRC = resolve(__dirname, '../../src')

/**
 * The error the APPLICATION actually catches for a column that does not exist.
 *
 * Not the one Postgres raises — that one never reaches `vendor-scope.ts`.
 * Drizzle wraps it in a `DrizzleQueryError` whose `message` is
 * `Failed query: <sql>\nparams: <args>` and NOTHING else, and hangs the
 * `postgres.js` error, carrying `code` and Postgres's own sentence, on `cause`.
 *
 * This used to fabricate a bare `Error` with the code and the sentence on the
 * same object, which is a shape the driver does not produce — so the seam's
 * detector passed here while returning `false` against every real request, and
 * the 503 these tests assert was unreachable in every environment. The suite
 * guarding the bug could not fail on it. #694 found the difference by driving
 * the route end to end against a real database.
 *
 * So: the wrapped shape, deliberately split across the two links, which is what
 * makes the detector's `cause` walk load-bearing rather than decorative.
 */
function undefinedColumn(column: string) {
  const driverError = new Error(
    `column "order_shipments"."${column}" does not exist`
  ) as Error & { code?: string }
  driverError.code = '42703'

  // The wrapper quotes the SQL — so it mentions the column, and says nothing
  // about why the query failed.
  const wrapped = new Error(
    `Failed query: select "order_shipments"."${column}" from "production_jobs"\nparams: `,
    { cause: driverError }
  )
  wrapped.name = 'DrizzleQueryError'
  return wrapped
}

/**
 * Make the Nth `db.select()` of this request REJECT, with the WHERE still
 * recorded.
 *
 * The recorder's own `failNext` raises a generic `injected failure on …`, which
 * is the negative case here rather than the positive one — the whole point of
 * the seam catch is that it recognises ONE failure and rethrows every other. So
 * the chain is wrapped: every builder call still reaches the recorder, and only
 * the await rejects.
 */
function rejectNthSelect(n: number, error: unknown) {
  let seen = 0
  const original = recorder.db.select.bind(recorder.db)

  vi.spyOn(recorder.db, 'select').mockImplementation(() => {
    seen += 1
    const inner = original() as Record<string, (...args: unknown[]) => unknown>
    if (seen !== n) return inner

    const wrapper: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolveFn: (v: unknown) => unknown, rejectFn?: (e: unknown) => unknown) =>
              Promise.reject(error).then(resolveFn, rejectFn)
          }
          return (...args: unknown[]) => {
            inner[prop as string]?.(...args)
            return wrapper
          }
        },
      }
    )

    return wrapper
  })
}

beforeEach(() => {
  recorder.reset()
  auditSpy.mockReset()
  auditSpy.mockResolvedValue(undefined)
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(vendorSessionFor('vendor'))
  mockPresign.mockClear()
  mockPresign.mockResolvedValue(SIGNED_URL)
  queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// 1. The tripwire
// ============================================================================

describe('the label seam is detectable in BOTH directions', () => {
  const schemaDir = resolve(API_SRC, 'database/schema')
  const migrationsDir = resolve(API_SRC, 'database/migrations')

  const read = (dir: string, filter: (f: string) => boolean) =>
    readdirSync(dir)
      .filter(filter)
      .map((file) => ({ file, text: readFileSync(resolve(dir, file), 'utf8') }))

  it('goes RED the day order_shipments.label_object_token lands', () => {
    // The seam is a raw SQL fragment against a column that does not exist. The
    // day `order-dispatch-tracking` adds it, `GET /jobs/:id/label` stops raising
    // and starts WORKING — through a catch that converts its every failure into
    // "not available yet" and a route that answers 503 before it ever signs.
    // Nothing else in this repository would notice that, in either direction:
    // the tests around it queue their own rows and never touch the schema.
    const schema = read(schemaDir, (f) => f.endsWith('.ts'))
    const migrations = read(migrationsDir, (f) => f.endsWith('.sql'))

    const landed = [...schema, ...migrations]
      .filter(({ text }) => text.includes('label_object_token'))
      .map(({ file }) => file)

    expect(
      landed,
      [
        'order_shipments.label_object_token has LANDED. The label route is still',
        'wired for its absence and now fails safely instead of working:',
        '',
        '  1. lib/vendor-scope.ts — replace the LABEL_OBJECT_TOKEN sql fragment',
        '     with orderShipments.labelObjectToken, and delete the catch in',
        '     getVendorJobLabelKey that turns 42703 into LabelSeamNotReady.',
        '  2. routes/vendor.ts — delete the LabelSeamNotReady branch that answers',
        '     503 on GET /jobs/:id/label.',
        '  3. Delete this test, and check the rest of this file still passes.',
        '',
        'Found in: ',
      ].join('\n') + landed.join(', ')
    ).toEqual([])

    // Not vacuous: the scan reads real files with real content in them.
    expect(schema.length, 'the schema scan found no files').toBeGreaterThan(5)
    expect(migrations.length, 'the migration scan found no files').toBeGreaterThan(20)
    expect(schema.some(({ file }) => file === 'shipping.ts')).toBe(true)
    expect(schema.find(({ file }) => file === 'shipping.ts')!.text).toContain('order_shipments')
  })

  it('and while it has NOT landed, the deliberate failure path is still there', () => {
    // The other half of the same fact. A seam whose catch was deleted while the
    // column was still missing puts the raw database message back in the body of
    // the one route that carries customer PII, and the test above would stay
    // green through it.
    const scopeSrc = readFileSync(resolve(API_SRC, 'lib/vendor-scope.ts'), 'utf8')
    const routeSrc = readFileSync(resolve(API_SRC, 'routes/vendor.ts'), 'utf8')

    expect(scopeSrc, 'the seam no longer raises a typed error').toContain(
      'throw new LabelSeamNotReady()'
    )
    expect(routeSrc, 'the route no longer answers the seam deliberately').toContain(
      'error instanceof LabelSeamNotReady'
    )
    expect(routeSrc).toContain('LABEL_NOT_AVAILABLE')
  })
})

// ============================================================================
// 2. The failure is safe
// ============================================================================

describe('the missing seam fails clearly, and says nothing about the schema', () => {
  it('turns Postgres 42703 on THAT column into a typed refusal', async () => {
    rejectNthSelect(1, undefinedColumn('label_object_token'))

    await expect(getVendorJobLabelKey(VENDOR_ID, JOB_ID)).rejects.toBeInstanceOf(
      LabelSeamNotReady
    )
  })

  it('rethrows a 42703 naming a DIFFERENT column — the catch is not a swallow', async () => {
    // A genuine typo in some other column of this select must not be reported
    // for months as "the label feature is not wired up yet".
    rejectNthSelect(1, undefinedColumn('tracking_numbr'))

    await expect(getVendorJobLabelKey(VENDOR_ID, JOB_ID)).rejects.not.toBeInstanceOf(
      LabelSeamNotReady
    )
  })

  it('rethrows a failure that is nothing to do with columns at all', async () => {
    rejectNthSelect(1, new Error('connection terminated unexpectedly'))

    await expect(getVendorJobLabelKey(VENDOR_ID, JOB_ID)).rejects.toThrow(
      /connection terminated/
    )
  })

  it('answers 503 with a fixed body that quotes no column, table or driver', async () => {
    // Call 1 is requireVendor's `vendor_users` read; call 2 is the label read.
    rejectNthSelect(2, undefinedColumn('label_object_token'))

    const res = await buildApp().request(labelPath())
    const body = await readJson(res)

    expect(res.status).toBe(503)
    expect(body.code).toBe('LABEL_NOT_AVAILABLE')
    expect(Object.keys(body).sort()).toEqual(['code', 'error'])

    const serialised = JSON.stringify(body)
    for (const internal of [
      'label_object_token',
      'order_shipments',
      'production_jobs',
      'column',
      '42703',
      'select',
    ]) {
      expect(serialised.toLowerCase(), `the 503 body leaked "${internal}"`).not.toContain(
        internal
      )
    }
  })

  it('signs nothing and claims no disclosure when the seam is missing', async () => {
    rejectNthSelect(2, undefinedColumn('label_object_token'))

    await buildApp().request(labelPath())

    // The presigner is never reached, so no signature exists in any log — and
    // no `label_issued` row claims a customer document left the building.
    expect(mockPresign, 'a label was signed for a route that cannot work').not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('does NOT echo the driver on the generic 500 either', async () => {
    // D5. `failed()` used to append `error.message` verbatim; on this route that
    // is whatever the database or the S3 client happened to say.
    queueRows({ 'select:production_jobs': [[{ token: LABEL_TOKEN }]] })
    mockPresign.mockRejectedValueOnce(
      new Error('R2 refused: bucket poster-app-prod key fulfilment/labels/secret.pdf')
    )

    const res = await buildApp().request(labelPath())
    const body = await readJson(res)

    expect(res.status).toBe(500)
    expect(body).toEqual({ error: 'Failed to sign label URL' })
    expect(JSON.stringify(body)).not.toContain('poster-app-prod')
    expect(JSON.stringify(body)).not.toContain(LABEL_KEY)
  })
})

// ============================================================================
// 3. The status bound
// ============================================================================

describe('the label is bound to the statuses where it is legitimately needed', () => {
  it('is DERIVED from the matrix, not listed — and derives non-empty', () => {
    // The same move `QC_PHOTO_UPLOAD_STATUSES` makes: a label exists on this
    // boundary to satisfy `open-transfer-or-order-label`, so its window is the
    // set of statuses a vendor can take that edge FROM.
    const expected = Object.keys(PRODUCTION_TRANSITIONS).filter((from) =>
      Object.values(
        PRODUCTION_TRANSITIONS[from as keyof typeof PRODUCTION_TRANSITIONS] as Record<
          string,
          { actors: readonly string[]; guard?: string } | undefined
        >
      ).some((edge) => edge?.guard === 'open-transfer-or-order-label' && edge.actors.includes('vendor'))
    )

    expect([...LABEL_ACCESS_STATUSES]).toEqual(expected)
    // An empty derivation fails CLOSED (`inArray(status, [])` renders `false`),
    // which is safe and silent. Silence is not how anyone should find out.
    expect(LABEL_ACCESS_STATUSES.length).toBeGreaterThan(0)
    expect([...LABEL_ACCESS_STATUSES]).toEqual(['qc_passed'])
  })

  it('excludes cancelled, dispatched and every pre-QC status', () => {
    // Each of these was fetchable before, and each is a different failure:
    // `cancelled` is the freeze walked around through another door; `dispatched`
    // is TERMINAL, so it is not a window at all but a permanent grant; the
    // pre-QC statuses are the QC gate the design puts in front of the label.
    for (const status of [
      'draft',
      'assigned',
      'received',
      'qc_submitted',
      'qc_failed',
      'dispatched',
      'cancelled',
    ]) {
      expect(
        LABEL_ACCESS_STATUSES.includes(status as never),
        `${status} can still fetch a customer's address`
      ).toBe(false)
    }
  })

  it('puts the status in the WHERE, beside the other three conditions', async () => {
    queueRows({ 'select:production_jobs': [[{ token: LABEL_TOKEN }]] })

    const got = await getVendorJobLabelKey(VENDOR_ID, JOB_ID)
    expect(got).toEqual({ jobId: JOB_ID, key: LABEL_KEY })

    // ONE query, four predicates. A status check in application code is the
    // shape that grows a branch where it gets skipped.
    const reads = queries.filter((q) => q.op === 'select')
    expect(reads.map((q) => q.table)).toEqual(['production_jobs'])

    const where = render(reads[0]?.where).sql
    expect(where, 'the job is not scoped to this vendor').toContain(
      '"production_jobs"."vendor_id"'
    )
    expect(where, 'the consolidator is not checked in the WHERE').toContain(
      '"order_consolidation"."vendor_id"'
    )
    expect(where, 'the job status is not bound at all').toContain('"production_jobs"."status"')
    expect(where.toLowerCase()).toContain('label_object_token')

    const bound = params(reads[0]?.where)
    for (const status of LABEL_ACCESS_STATUSES) {
      expect(bound, `${status} is not in the bound window`).toContain(status)
    }
    for (const status of ['cancelled', 'received', 'dispatched', 'draft']) {
      expect(bound, `${status} is inside the label window`).not.toContain(status)
    }
  })
})
