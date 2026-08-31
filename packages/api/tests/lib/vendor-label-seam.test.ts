/**
 * The carrier label: it works, it hides nothing, and it is bounded.
 *
 * This file used to be about a SEAM. `lib/vendor-scope.ts` read
 * `order_shipments.label_object_token` as a raw SQL fragment against a column
 * that did not exist, because the column belonged to `order-dispatch-tracking`
 * and inventing it here would have put one feature's name on another's table.
 * Every request raised `42703`, a catch turned that into a typed
 * `LabelSeamNotReady`, and the route answered a fixed 503 — in production too.
 *
 * #703 landed the column and #704 deleted all of that. A tripwire test here
 * fired on exactly the commit that added it and named what to unwire; it has
 * done its job and is gone. What the file holds now:
 *
 * 1. **The route WORKS.** It signs the live label and answers 200, and the key
 *    it signs is `fulfilment/labels/<token>.pdf` — identity-free by
 *    construction, because the key rides in the PATH of the signed URL where no
 *    assertion about JSON keys can reach it. A miss is an ordinary 404.
 *
 * 2. **Nothing is swallowed, and nothing is echoed.** With the catch gone,
 *    every failure the read produces is real and must travel — a catch that
 *    stayed would report an outage as "not available yet". The other half is
 *    unchanged and still matters: `failed()` must not append the driver's
 *    sentence, on the ONE route that exists to carry a customer's name, address
 *    and phone.
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

/**
 * The error the APPLICATION actually sees for a column that does not exist.
 *
 * Not the one Postgres raises — that one never reaches `vendor-scope.ts`.
 * Drizzle wraps it in a `DrizzleQueryError` whose `message` is
 * `Failed query: <sql>\nparams: <args>` and NOTHING else, and hangs the
 * `postgres.js` error, carrying `code` and Postgres's own sentence, on `cause`.
 *
 * The real shape is kept even though nothing inspects it any more. There used
 * to be a detector walking this `cause` chain to recognise the missing seam,
 * and it was written against a fabricated bare `Error` carrying the code and
 * the sentence on one object — a shape the driver never produces — so it passed
 * here while returning `false` against every real request (#694). The detector
 * is gone with the seam; the lesson that a fixture must match what the driver
 * emits is not, and these tests assert that no part of either link reaches a
 * response body.
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
// 1. The route WORKS
// ============================================================================

describe('the label route works now that the column exists', () => {
  it('signs the live label and answers 200', async () => {
    // This is the whole point of #703/#704. Until `label_object_token` landed,
    // every request to this route answered 503 — in production too.
    queueRows({ 'select:production_jobs': [[{ token: LABEL_TOKEN }]] })

    const res = await buildApp().request(labelPath())
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.jobId).toBe(JOB_ID)
    expect(body.url).toBe(SIGNED_URL)
    expect(body.expiresInSeconds).toBeGreaterThan(0)
  })

  it('signs the key built from the token, never a path naming the order', async () => {
    queueRows({ 'select:production_jobs': [[{ token: LABEL_TOKEN }]] })

    await buildApp().request(labelPath())

    // The key rides in the PATH of the signed URL, which is the one place an
    // assertion about JSON keys can never reach. An order id there would be a
    // stable person-linked handle.
    expect(mockPresign).toHaveBeenCalledWith(LABEL_KEY, expect.any(Number))
    expect(LABEL_KEY).toMatch(/^fulfilment\/labels\/[A-Za-z0-9_-]+\.pdf$/)
  })

  it('records the disclosure only after the URL exists', async () => {
    queueRows({ 'select:production_jobs': [[{ token: LABEL_TOKEN }]] })

    await buildApp().request(labelPath())

    // The audit row says a customer document crossed to a vendor. Written on
    // SUCCESS, so no row ever claims a disclosure a throw then unmade.
    expect(auditSpy).toHaveBeenCalled()
  })

  it('answers 404 — never 503 — when no label row matches', async () => {
    // A miss still covers all of: no such job, not your job, you are not the
    // consolidator, no label bought yet. None is worth distinguishing, and 403
    // would confirm the order exists and name somebody else's parcel.
    queueRows({ 'select:production_jobs': [[]] });

    const res = await buildApp().request(labelPath())

    expect(res.status).toBe(404)
  })

  it('signs nothing when no label row matches', async () => {
    queueRows({ 'select:production_jobs': [[]] })

    await buildApp().request(labelPath())

    // Authorisation is checked BEFORE signing, not after. A signed URL that is
    // generated and then withheld has still been generated, and lives in
    // whatever log, trace or crash dump saw it.
    expect(mockPresign, 'a label was signed for a request that had no row').not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })
})

// ============================================================================
// 2. A real failure is a real failure
// ============================================================================

describe('the read no longer swallows anything', () => {
  it('lets a genuine database failure travel', async () => {
    // There used to be a catch here converting Postgres `42703` on
    // `label_object_token` into a typed `LabelSeamNotReady`, because the column
    // did not exist and the route could not work in any environment. It exists
    // now, so every failure this read produces is real and must propagate —
    // a catch that stayed would report an outage as "not available yet".
    rejectNthSelect(1, new Error('connection terminated unexpectedly'))

    await expect(getVendorJobLabelKey(VENDOR_ID, JOB_ID)).rejects.toThrow(
      /connection terminated/
    )
  })

  it('lets a missing-column failure travel too, rather than dressing it up', async () => {
    // The case the deleted catch used to intercept. A `42703` now means a
    // genuine defect — a typo, or a migration that did not run — and reporting
    // it as an ordinary empty state is how that hides for months.
    rejectNthSelect(1, undefinedColumn('label_object_token'))

    await expect(getVendorJobLabelKey(VENDOR_ID, JOB_ID)).rejects.toThrow()
  })

  it('does NOT echo the driver on the generic 500', async () => {
    // D5, and now the ONLY guard on this route's error body. `failed()` used to
    // append `error.message` verbatim; on this route that is whatever the
    // database or the S3 client happened to say, on the one route that exists
    // to carry a customer's name, address and phone.
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

  it('names no column, table or driver in any body it produces', async () => {
    rejectNthSelect(2, undefinedColumn('label_object_token'))

    const res = await buildApp().request(labelPath())
    const serialised = JSON.stringify(await readJson(res))

    for (const internal of [
      'label_object_token',
      'order_shipments',
      'production_jobs',
      '42703',
      'select',
    ]) {
      expect(serialised.toLowerCase(), `the body leaked "${internal}"`).not.toContain(internal)
    }
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
