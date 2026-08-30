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
import { buildRouteApp } from '../../helpers/route-app'
import { vendorSessionFor } from '../../helpers/vendor-session'
import '../../setup'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  productionJobs,
  productionJobPhotos,
} from '../../../src/database/schema/production-jobs'
import { vendorRates } from '../../../src/database/schema/vendors'
import {
  PRODUCTION_TRANSITIONS,
  VENDOR_SETTABLE_STATUSES,
  nextStatuses,
  type ProductionJobStatus,
} from '../../../src/lib/production-transitions'

// ============================================================================
// Recording database mock
// ============================================================================

/**
 * `repeatLast`: requireVendor re-issues the same vendor_users scope lookup on
 * every request, so the last queued batch has to keep answering it.
 */
const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder({ rows: 'repeatLast' })
)

vi.mock('../../../src/database', () => ({ db: recorder.db }))

const mockGetSession = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}))

/**
 * `recordAudit` is spied rather than left real, because the three things this
 * suite has to prove about it are all about the CALL: which action, whether the
 * caller's transaction was shared, and whether the row outlives a rollback.
 * None of them is visible in an insert that a recording db swallows.
 */
const auditSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../../../src/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/audit')>()),
  recordAudit: (...args: unknown[]) => auditSpy(...args),
}))

import { vendorApp } from '../../../src/routes/vendor'
import { VENDOR_STATUS_STAMP } from '../../../src/lib/vendor-scope'
import { readJson } from '../../helpers/json'

// ============================================================================
// Helpers
// ============================================================================

const { params, queueRows, ops } = recorder

const VENDOR_ID = '33333333-3333-4333-8333-333333333333'
const JOB_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_JOB_ID = '2222222b-2222-4222-8222-222222222222'

const sessionFor = vendorSessionFor
const buildApp = () => buildRouteApp('/api/vendor', vendorApp)

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
 * The row the LOCKED read inside the transaction returns.
 *
 * Deliberately not `jobRow()`: that models `getVendorJob`'s customer-free
 * response projection, and the locked read is an INTERNAL one that additionally
 * needs `settlementId` — the column the freeze is about, and one no vendor
 * response has ever carried.
 */
function lockRow(over: Record<string, unknown> = {}) {
  return { id: JOB_ID, stage: 'print', status: 'assigned', settlementId: null, ...over }
}

const readSource = (relative: string) =>
  readFileSync(resolve(__dirname, '../../../src', relative), 'utf8')

/** Source with every comment removed, so a scan judges CODE and not prose. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every live shot the `print` shot list marks required. */
const PRINT_REQUIRED_SLOTS = [
  { slot: 'print_full' },
  { slot: 'print_colour_reference' },
  { slot: 'print_raking_light' },
]

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
  recorder.reset()
  auditSpy.mockReset()
  auditSpy.mockResolvedValue(undefined)
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

    const body = await readJson(res)
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
    // `qc_submitted`, not `sent`. The queue filter is a READ and would happily
    // accept the retired status as a string, but a suite that keeps typing it
    // is a suite that keeps it alive in everybody's head — and the vendor's own
    // queue is the one screen where `sent` used to mean something.
    queueRows({ 'select:production_jobs': [[jobRow({ status: 'qc_submitted' })]] })

    const res = await buildApp().request('/api/vendor/jobs?status=qc_submitted')
    expect(res.status).toBe(200)

    const read = ops('select', productionJobs)[0]
    const where = params(read?.where)
    expect(where).toContain(VENDOR_ID)
    expect(where).toContain('qc_submitted')
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

    const body = await readJson(res)
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

describe('PATCH /api/vendor/jobs/:id — the guarded transition', () => {
  // --------------------------------------------------------------------
  // Every vendor-legal edge, and the timestamp the SERVER stamps for it
  // --------------------------------------------------------------------

  /** `[from, to, the column the server stamps]`, straight off the matrix. */
  const LEGAL_EDGES: Array<[ProductionJobStatus, ProductionJobStatus, string]> = [
    ['assigned', 'received', 'receivedAt'],
    // Rework in place. The clock RESTARTS: this is a second attempt at the
    // piece, not a continuation of the first.
    ['qc_failed', 'received', 'receivedAt'],
    ['received', 'qc_submitted', 'qcSubmittedAt'],
    ['qc_passed', 'dispatched', 'dispatchedAt'],
  ]

  /** Whatever the guard on `from -> to` needs to see, queued. */
  function seedGuardRows(to: ProductionJobStatus) {
    if (to === 'qc_submitted') {
      queueRows({ 'select:production_job_photos': [PRINT_REQUIRED_SLOTS] })
    }
    if (to === 'dispatched') {
      // An open transfer is one of the two ways the piece may legitimately go.
      queueRows({
        'select:production_jobs': [
          [lockRow({ status: 'qc_passed' })],
          [lockRow({ status: 'qc_passed' })],
          [{ transferId: 'transfer-1', hasOrderLabel: false }],
          [jobRow({ status: 'dispatched' })],
        ],
      })
    }
  }

  it.each(LEGAL_EDGES)(
    'moves %s -> %s and stamps %s itself',
    async (from, to, stamped) => {
      queueRows({
        'select:production_jobs': [[lockRow({ status: from })], [lockRow({ status: from })], [jobRow({ status: to })]],
        'update:production_jobs': [[{ id: JOB_ID }]],
      })
      seedGuardRows(to)

      const res = await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status: to }))
      const body = await readJson(res)
      expect(res.status, JSON.stringify(body)).toBe(200)

      const write = ops('update', productionJobs)[0]
      expect(write).toBeDefined()
      const values = write?.values as Record<string, unknown>
      expect(values.status).toBe(to)

      // The stamp is a Date this process made, not a string off the wire.
      expect(values[stamped]).toBeInstanceOf(Date)

      // ...and it is the ONLY clock this edge touches. Stamping two of them
      // would let one edge rewrite an earlier edge's history.
      for (const other of ['receivedAt', 'qcSubmittedAt', 'dispatchedAt', 'sentAt']) {
        if (other !== stamped) expect(values).not.toHaveProperty(other)
      }

      // Scoped twice: the pre-read and the UPDATE both name the vendor, and the
      // UPDATE repeats the from-status and the unsettled predicate.
      const where = params(write?.where)
      expect(where).toContain(VENDOR_ID)
      expect(where).toContain(JOB_ID)
      expect(where).toContain(from)

      expectNoCustomerData(body)
    }
  )

  it('stamps a clock for every vendor edge, and for nothing else', () => {
    // A vendor edge added to the matrix with no clock behind it would move a
    // job and record nothing about when — invisible until an SLA argument. The
    // map is validated at module load, so this asserts the derived tuple and
    // the declared clocks are the SAME set, in both directions.
    expect(Object.keys(VENDOR_STATUS_STAMP).sort()).toEqual([...VENDOR_SETTABLE_STATUSES].sort())

    // And `sentAt` is not among them. `retire-sent-status.ts` leaves `sent_at`
    // alone because the date the material went out is evidence; nothing here
    // may overwrite it.
    expect(Object.values(VENDOR_STATUS_STAMP)).not.toContain('sentAt')
  })

  // --------------------------------------------------------------------
  // The dates leave the patch surface entirely
  // --------------------------------------------------------------------

  it('never writes a receivedAt the VENDOR supplied — that is an SLA clock', async () => {
    queueRows({
      'select:production_jobs': [[lockRow()], [lockRow()], [jobRow({ status: 'received' })]],
      'update:production_jobs': [[{ id: JOB_ID }]],
    })

    const backdated = '2020-01-01T00:00:00.000Z'
    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received', receivedAt: backdated, sentAt: backdated })
    )
    expect(res.status).toBe(200)

    const values = ops('update', productionJobs)[0]?.values as Record<string, unknown>
    expect(values).toBeDefined()
    expect(values).not.toHaveProperty('sentAt')
    expect(JSON.stringify(values)).not.toContain('2020-01-01')
    // Stamped from the server clock instead, so "three days ago" is unsayable.
    expect((values.receivedAt as Date).getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00Z').getTime()
    )
  })

  it('rejects a body carrying only dates, rather than silently writing nothing', async () => {
    queueRows({ 'select:production_jobs': [[jobRow()]] })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ receivedAt: '2026-08-01T10:00:00.000Z' })
    )
    expect(res.status).toBe(400)
    expect(ops('update', productionJobs)).toHaveLength(0)
  })

  it('ignores amountExpected and amountActual — a vendor may not price their own job', async () => {
    queueRows({
      'select:production_jobs': [[lockRow()], [lockRow()], [jobRow({ status: 'received' })]],
      'update:production_jobs': [[{ id: JOB_ID }]],
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

  // --------------------------------------------------------------------
  // The vocabulary: three statuses, and NOT the retired one
  // --------------------------------------------------------------------

  it('accepts exactly the three statuses the matrix gives a vendor', () => {
    expect([...VENDOR_SETTABLE_STATUSES]).toEqual(['received', 'qc_submitted', 'dispatched'])
  })

  it('does not re-declare the vocabulary as a literal beside the matrix', () => {
    // The whole defect: a second copy of the list went stale the day `sent` was
    // retired, and the route kept offering it. There must be ONE copy, and the
    // route must be reading it.
    //
    // Comments are stripped before judging, deliberately. The prose SHOULD keep
    // naming `sent` — a retired status with no explanation anywhere is a status
    // somebody re-adds — and a scan that cannot tell prose from code would push
    // the history out of the file to stay green.
    const source = stripComments(readSource('routes/vendor.ts'))
    expect(source).not.toMatch(/VENDOR_SETTABLE_STATUSES\s*=/)
    expect(source).toMatch(/VENDOR_SETTABLE_STATUSES/)
    expect(readSource('routes/vendor.ts')).toContain('production-transitions')
    // No status literal of ANY kind: the vocabulary is imported, entire.
    expect(source).not.toMatch(/["']sent["']/)
    expect(source).not.toMatch(/["']received["']/)
  })

  it.each(['qc_passed', 'qc_failed', 'cancelled', 'assigned', 'draft', 'sent'])(
    'refuses %s at the schema, before any read happens',
    async (status) => {
      queueRows({ 'select:production_jobs': [[lockRow()]] })

      const res = await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status }))
      expect(res.status).toBe(400)
      expect(ops('update', productionJobs)).toHaveLength(0)
    }
  )

  it('NO reachable path produces the retired `sent` status', async () => {
    // A property over the whole vocabulary, not one example: for every status a
    // job can be in, and every status a vendor may ask for, the value written
    // is never `sent`. `sent` is edgeless in the matrix in both directions and
    // `retire-sent-status.ts` erased it from the rows that carried it; a vendor
    // writing it back would re-create exactly what that backfill removed.
    const everyStatus = Object.keys(PRODUCTION_TRANSITIONS) as ProductionJobStatus[]

    for (const from of everyStatus) {
      for (const to of VENDOR_SETTABLE_STATUSES) {
        recorder.reset()
        auditSpy.mockReset()
        auditSpy.mockResolvedValue(undefined)
        queueRows({
          'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]],
          'select:production_jobs': [
            [lockRow({ status: from })],
            [lockRow({ status: from })],
            [{ transferId: 'transfer-1', hasOrderLabel: false }],
            [jobRow({ status: to })],
          ],
          'select:production_job_photos': [PRINT_REQUIRED_SLOTS],
          'update:production_jobs': [[{ id: JOB_ID }]],
        })

        const res = await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status: to }))

        for (const write of ops('update', productionJobs)) {
          expect((write.values as Record<string, unknown>).status).not.toBe('sent')
        }
        // A refusal may NAME `sent` — a legacy row the backfill missed still has
        // to be reportable, and `from: 'sent'` is the honest answer. What may
        // never happen is a SUCCESS carrying it, which would mean the job is
        // sitting in the retired status after a write we accepted.
        if (res.status === 200) {
          expect(JSON.stringify(await readJson(res))).not.toContain('"sent"')
        }
      }
    }
  })

  // --------------------------------------------------------------------
  // Every vendor-ILLEGAL edge, refused with the matrix's own remedy
  // --------------------------------------------------------------------

  /**
   * Every `from` x `to` the matrix does NOT give a vendor.
   *
   * `cancelled` is excluded because it is refused EARLIER and on purpose, with
   * its own code and its own message — see the cancellation test below. It is
   * still an illegal edge; it is just one the vendor is owed a better answer
   * about than "the matrix says no".
   */
  const ILLEGAL_EDGES = (Object.keys(PRODUCTION_TRANSITIONS) as ProductionJobStatus[])
    .filter((from) => from !== 'cancelled')
    .flatMap((from) =>
      VENDOR_SETTABLE_STATUSES.filter(
        (to) => !nextStatuses(from, 'vendor').includes(to)
      ).map((to) => [from, to] as const)
    )

  it.each(ILLEGAL_EDGES)('refuses %s -> %s with 409 and no UPDATE', async (from, to) => {
    queueRows({
      'select:production_jobs': [[lockRow({ status: from })], [lockRow({ status: from })]],
    })

    const res = await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status: to }))
    expect(res.status).toBe(409)

    const body = await readJson(res)
    // 409 and not 422: the body is fine, the world moved. And the remedy comes
    // with it, scoped to THIS actor, so the portal re-renders its buttons
    // without a second round trip.
    expect(body.code).toBe('ILLEGAL_TRANSITION')
    expect(body.from).toBe(from)
    expect(body.to).toBe(to)
    expect(body.allowed).toEqual(nextStatuses(from, 'vendor'))

    expect(ops('update', productionJobs)).toHaveLength(0)
  })

  // --------------------------------------------------------------------
  // The guards the matrix NAMES — evaluated, not assumed
  // --------------------------------------------------------------------

  it('refuses received -> qc_submitted with an incomplete shot list, naming what is missing', async () => {
    queueRows({
      'select:production_jobs': [
        [lockRow({ status: 'received' })],
        [lockRow({ status: 'received' })],
      ],
      // The colour reference and the raking-light shot were never uploaded.
      'select:production_job_photos': [[{ slot: 'print_full' }]],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'qc_submitted' })
    )
    // 422, not 409: this one IS fixable by the caller — upload the photos.
    expect(res.status).toBe(422)

    const body = await readJson(res)
    expect(body.code).toBe('SHOT_LIST_INCOMPLETE')
    expect(body.missingSlots).toEqual(['print_colour_reference', 'print_raking_light'])
    expect(ops('update', productionJobs)).toHaveLength(0)
  })

  it('lets an OPTIONAL shot stay missing', async () => {
    queueRows({
      'select:production_jobs': [
        [lockRow({ status: 'received' })],
        [lockRow({ status: 'received' })],
        [jobRow({ status: 'qc_submitted' })],
      ],
      // `print_detail` is optional and absent; the three required ones are live.
      'select:production_job_photos': [PRINT_REQUIRED_SLOTS],
      'update:production_jobs': [[{ id: JOB_ID }]],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'qc_submitted' })
    )
    expect(res.status).toBe(200)
  })

  it('only counts LIVE photos towards the shot list', async () => {
    queueRows({
      'select:production_jobs': [
        [lockRow({ status: 'received' })],
        [lockRow({ status: 'received' })],
      ],
      'select:production_job_photos': [[{ slot: 'print_full' }]],
    })

    await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status: 'qc_submitted' }))

    // A superseded photo is a photo the vendor REPLACED. Counting it would let
    // a reshoot that never happened satisfy the list.
    const read = ops('select', productionJobPhotos)[0]
    expect(read, 'the shot list was judged without reading any photo').toBeDefined()
    expect(recorder.render(read?.where).sql).toContain('superseded_at')
    expect(params(read?.where)).toContain(JOB_ID)
  })

  it('refuses qc_passed -> dispatched with no open transfer and no order label', async () => {
    queueRows({
      'select:production_jobs': [
        [lockRow({ status: 'qc_passed' })],
        [lockRow({ status: 'qc_passed' })],
        // Neither kind of evidence.
        [{ transferId: null, hasOrderLabel: false }],
      ],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'dispatched' })
    )
    expect(res.status).toBe(409)

    const body = await readJson(res)
    expect(body.code).toBe('GUARD_UNSATISFIED')
    expect(body.guard).toBe('open-transfer-or-order-label')
    // `dispatched` is terminal with zero out-edges: taking this edge on no
    // evidence leaves the order permanently unlabelable.
    expect(ops('update', productionJobs)).toHaveLength(0)
  })

  it('accepts an ORDER LABEL as despatch evidence when there is no transfer', async () => {
    queueRows({
      'select:production_jobs': [
        [lockRow({ status: 'qc_passed' })],
        [lockRow({ status: 'qc_passed' })],
        [{ transferId: null, hasOrderLabel: true }],
        [jobRow({ status: 'dispatched' })],
      ],
      'update:production_jobs': [[{ id: JOB_ID }]],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'dispatched' })
    )
    expect(res.status).toBe(200)
    expect(ops('update', productionJobs)).toHaveLength(1)
  })

  // --------------------------------------------------------------------
  // The freezes
  // --------------------------------------------------------------------

  it.each([...VENDOR_SETTABLE_STATUSES])(
    'a SETTLED job refuses %s — payables are derived and would silently disagree',
    async (to) => {
      queueRows({
        'select:production_jobs': [
          [lockRow({ status: 'assigned', settlementId: 'set-1' })],
          [lockRow({ status: 'assigned', settlementId: 'set-1' })],
        ],
      })

      const res = await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status: to }))
      expect(res.status).toBe(409)

      const body = await readJson(res)
      expect(body.code).toBe('JOB_SETTLED')
      expect(ops('update', productionJobs)).toHaveLength(0)
    }
  )

  it('tells a vendor their job was CANCELLED rather than 404ing them', async () => {
    queueRows({
      'select:production_jobs': [
        [lockRow({ status: 'cancelled' })],
        [lockRow({ status: 'cancelled' })],
      ],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received' })
    )
    // A DELIBERATE exception to the portal's 404-not-403 rule. They already
    // know the job exists — it is theirs and it is in their queue — so nothing
    // leaks, and withholding it means they keep working on something nobody
    // will pay for.
    expect(res.status).toBe(409)

    const body = await readJson(res)
    expect(body.code).toBe('JOB_CANCELLED')
    expect(String(body.error).toLowerCase()).toContain('cancelled')
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

  it("refuses another vendor's job even with a CORRECT id, inside the transaction too", async () => {
    // The pre-read finds it (a race: an admin reassigned it a moment ago), the
    // locked re-read does not. The scoped predicate is in both.
    queueRows({
      'select:production_jobs': [[jobRow()], []],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received' })
    )
    expect(res.status).toBe(404)
    expect(ops('update', productionJobs)).toHaveLength(0)

    for (const read of ops('select', productionJobs)) {
      expect(params(read.where)).toContain(VENDOR_ID)
    }
  })

  // --------------------------------------------------------------------
  // Concurrency
  // --------------------------------------------------------------------

  it('rolls back when the UPDATE matches no row, rather than reporting success', async () => {
    queueRows({
      'select:production_jobs': [[lockRow()], [lockRow()], [jobRow({ status: 'received' })]],
      // Somebody moved or settled the job between the locked read and the write.
      'update:production_jobs': [[]],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received' })
    )
    expect(res.status).toBe(409)
    expect((await readJson(res)).code).toBe('CONCURRENT_MODIFICATION')
    expect(recorder.tx.rollbacks).toBe(1)
    expect(recorder.tx.commits).toBe(0)
  })

  it('does the read, the guard and the write in ONE transaction', async () => {
    queueRows({
      'select:production_jobs': [
        [lockRow({ status: 'received' })],
        [lockRow({ status: 'received' })],
        [jobRow({ status: 'qc_submitted' })],
      ],
      'select:production_job_photos': [PRINT_REQUIRED_SLOTS],
      'update:production_jobs': [[{ id: JOB_ID }]],
    })

    await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status: 'qc_submitted' }))

    expect(recorder.tx.commits).toBe(1)
    expect(recorder.tx.rollbacks).toBe(0)

    // The route's own pre-read is outside; everything the decision rests on is
    // inside, or the lock is decorative.
    expect(ops('select', productionJobPhotos).every((q) => q.inTx)).toBe(true)
    expect(ops('update', productionJobs).every((q) => q.inTx)).toBe(true)
    expect(ops('select', productionJobs).filter((q) => q.inTx).length).toBeGreaterThanOrEqual(2)
  })

  it('takes FOR UPDATE on the read every transaction in the module rests on', () => {
    // The one part of the recipe no assertion above can reach: the recorder
    // answers `.for('update')` exactly as it answers a plain read, so a lock
    // dropped in a refactor is invisible to it. Scanned from the source in the
    // shape `tests/routes/admin/transfers.test.ts` already uses.
    //
    // Counted against the TRANSACTIONS rather than fixed at one. #685 gave the
    // module two more — recording a QC photograph and withdrawing one — and a
    // hardcoded `1` would have had to be raised to `3` by hand, which is a
    // number nobody can check. Every transaction here decides something from a
    // row it then writes, so every one of them locks that row.
    const source = stripComments(readSource('lib/vendor-scope.ts'))
    const transactions = source.match(/db\.transaction\(/g) ?? []
    const locks = source.match(/\.for\(["']update["']\)/g) ?? []

    expect(transactions.length, 'no transaction found — the scan is vacuous').toBeGreaterThan(0)
    expect(locks).toHaveLength(transactions.length)
  })

  // --------------------------------------------------------------------
  // Audit
  // --------------------------------------------------------------------

  it('records ONE transition, sharing the transaction with the write', async () => {
    queueRows({
      'select:production_jobs': [[lockRow()], [lockRow()], [jobRow({ status: 'received' })]],
      'update:production_jobs': [[{ id: JOB_ID }]],
    })

    await buildApp().request(`/api/vendor/jobs/${JOB_ID}`, json({ status: 'received' }))

    expect(auditSpy).toHaveBeenCalledTimes(1)
    const [, entry, sharedTx] = auditSpy.mock.calls[0]!
    expect(entry.action).toBe('production_job.transitioned')
    expect(entry.entityType).toBe('production_job')
    expect(entry.entityId).toBe(JOB_ID)
    expect(entry.outcome ?? 'success').toBe('success')
    expect(entry.metadata).toMatchObject({ from: 'assigned', to: 'received' })

    // A row saying "the job moved" beside a job that did not is worse than no
    // row, so this one SHARES the transaction.
    expect(sharedTx).toBeDefined()
  })

  it('leaves exactly one failure row that SURVIVES the rollback, written outside the tx', async () => {
    queueRows({
      'select:production_jobs': [
        [lockRow({ status: 'dispatched' })],
        [lockRow({ status: 'dispatched' })],
      ],
    })

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received' })
    )
    expect(res.status).toBe(409)

    expect(auditSpy).toHaveBeenCalledTimes(1)
    const [, entry, sharedTx] = auditSpy.mock.calls[0]!
    expect(entry.action).toBe('production_job.transition_refused')
    expect(entry.outcome).toBe('failure')
    expect(entry.metadata).toMatchObject({ code: 'ILLEGAL_TRANSITION' })

    // THE TRAP, and the instinct is the wrong way round: a refusal row records
    // that a transaction was rolled back. Writing it inside that transaction
    // rolls the evidence back with it.
    expect(sharedTx).toBeUndefined()
    expect(recorder.tx.rollbacks).toBe(1)
  })

  it('writes NO refusal row for a 404 — there is no entity to refuse', async () => {
    queueRows({ 'select:production_jobs': [[]] })

    const res = await buildApp().request(
      `/api/vendor/jobs/${OTHER_JOB_ID}`,
      json({ status: 'received' })
    )
    expect(res.status).toBe(404)
    // The middleware's floor row is the right level of detail for a 404, and a
    // refusal row here would confirm the job exists.
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('an audit failure inside the transaction leaves NO success row', async () => {
    queueRows({
      'select:production_jobs': [[lockRow()], [lockRow()], [jobRow({ status: 'received' })]],
      'update:production_jobs': [[{ id: JOB_ID }]],
    })
    // `recordAudit` RETHROWS when it is handed a tx: the insert did not fail on
    // its own, it aborted the caller's transaction. Swallowing it would answer
    // 200 over a write Postgres is about to roll back.
    auditSpy.mockRejectedValueOnce(new Error('audit insert deadlocked'))

    const res = await buildApp().request(
      `/api/vendor/jobs/${JOB_ID}`,
      json({ status: 'received' })
    )
    expect(res.status).toBe(500)
    expect(recorder.tx.rollbacks).toBe(1)
    expect(recorder.tx.commits).toBe(0)
    // One attempt, and it failed. No second row claiming the move happened.
    expect(auditSpy).toHaveBeenCalledTimes(1)
  })

  // --------------------------------------------------------------------
  // The module boundary
  // --------------------------------------------------------------------

  it('keeps routes/vendor.ts free of every database import', () => {
    const source = readSource('routes/vendor.ts')
    expect(source).not.toMatch(/from ["'][^"']*\/database/)
    expect(source).not.toMatch(/\bdb\./)
    expect(source).not.toMatch(/drizzle-orm/)
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

    const body = await readJson(res)
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

    const body = await readJson(res)
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
