/**
 * Admin transfer oversight, and declaring a parcel lost.
 *
 * Same harness as `tests/routes/admin/production-jobs.test.ts`: `src/database`
 * is the recording query builder from `tests/helpers/query-recorder`, `src/auth`
 * is mocked so each test picks the caller's role, and the REAL
 * `requireAuth`/`requireAdmin` run. One addition — `lib/audit.recordAudit` is
 * spied rather than executed, because the argument this suite cares about is
 * the THIRD one: whether the row shared the caller's transaction.
 *
 * The properties pinned here are the ones a later edit could quietly undo, and
 * every one of them costs money if it goes:
 *
 * 1. **A job is never on two transfers.** The database says so with a unique
 *    index on `job_id` alone (`tests/database/production-transfers.test.ts`
 *    property 3). The ROUTE's half of that is asserted here: declaring a
 *    transfer lost writes NOTHING to `production_transfer_jobs` — it makes a
 *    replacement job, it does not re-parcel the original.
 * 2. **Every job on a transfer belongs to `from_vendor_id`.** No CHECK
 *    constraint can express that (it reads other rows), so the route checks it
 *    and refuses, rather than routing a replacement for somebody else's work.
 * 3. **`lost_at` is settable only by an admin.** It costs money, and a vendor
 *    declaring it is a vendor deciding who eats that cost.
 * 4. **"Lost" means a parcel that LEFT and did not arrive** — 409 otherwise. A
 *    received transfer arrived; the dispute is about something else. An
 *    undispatched one never left, so nothing is missing. And a job that is not
 *    itself `dispatched` never rode anywhere, so replacing it would leave two
 *    live jobs over the same order items — the premise of property 5 is that
 *    the original IS dispatched.
 *
 * 5. **THE ORIGINAL KEEPS ITS PAYABLE.** The suite sums `lib/vendor-payables`
 *    over the vendor's rows before the call and over every row that exists
 *    after it, and requires the two to be equal. We owe vendor A for work they
 *    genuinely did; the parcel is what vanished. This is the assertion that
 *    would catch someone "tidying up" by cancelling the original or zeroing its
 *    amount — the ledger-drift class this repo keeps guarding against, which is
 *    exactly why payables are derived and there is no stored total to edit.
 *
 * 6. **Exactly one replacement per lost job**, `draft`, carrying the same stage
 *    and the same `production_job_items`, with `replaces_job_id` set — without
 *    which two print jobs for one order item read as a duplicate-entry mistake.
 * 7. **Two admins produce one set of replacements, not two.** `FOR UPDATE`, the
 *    predicate repeated in the UPDATE's WHERE, and a row-count mismatch that
 *    rolls the whole thing back — the recipe from
 *    `routes/admin/vendor-payables.ts:242-317`.
 * 8. **The audit transaction rule.** The success row SHARES `tx`, because a row
 *    saying "declared lost, here are the replacements" beside a transfer that
 *    rolled back is a lie. The refusal rows must NOT, because a refusal records
 *    that a transaction was rolled back and writing it inside that transaction
 *    erases the evidence it exists to preserve.
 *
 * @see packages/api/src/routes/admin/transfers.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { adminSessionFor } from '../../helpers/admin-session'
import { buildRouteApp } from '../../helpers/route-app'
import '../../setup'

import {
  productionJobs,
  productionJobItems,
} from '../../../src/database/schema/production-jobs'
import {
  productionTransfers,
  productionTransferJobs,
} from '../../../src/database/schema/production-transfers'
import { sumPayable, type PayableJob } from '../../../src/lib/vendor-payables'

// ============================================================================
// Recording database mock
// ============================================================================

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder()
)

vi.mock('../../../src/database', () => ({ db: recorder.db }))

/**
 * Spied, not executed. What matters is whether the third argument — the shared
 * transaction — was passed, and a real insert through the recorder cannot say
 * that as directly.
 */
const auditSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../../../src/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/audit')>()),
  recordAudit: (...args: unknown[]) => auditSpy(...args),
}))

const mockGetSession = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}))

import {
  adminTransfersApp,
  transferState,
} from '../../../src/routes/admin/transfers'
import { readJson } from '../../helpers/json'

// ============================================================================
// Helpers
// ============================================================================

const { queries, render, queueRows, selects, inserts, updates, tx } = recorder

const buildApp = () => buildRouteApp('/api/admin/transfers', adminTransfersApp)

const TRANSFER_ID = '99999999-9999-4999-8999-999999999999'
const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const JOB_A = '22222222-2222-4222-8222-222222222222'
const JOB_B = '2222222b-2222-4222-8222-222222222222'
const FOREIGN_JOB = '2222222c-2222-4222-8222-222222222222'
const NEW_JOB_A = '77777777-7777-4777-8777-777777777777'
const NEW_JOB_B = '7777777b-7777-4777-8777-777777777777'
const VENDOR_A = '33333333-3333-4333-8333-333333333333'
const VENDOR_B = '3333333b-3333-4333-8333-333333333333'
const ITEM_1 = '44444444-4444-4444-8444-444444444444'
const ITEM_2 = '55555555-5555-4555-8555-555555555555'

const DISPATCHED = new Date('2026-08-20T10:00:00Z')

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function transferRow(over: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    orderId: ORDER_ID,
    fromVendorId: VENDOR_A,
    toVendorId: VENDOR_B,
    carrier: 'Delhivery',
    reference: 'DKT-1234',
    pieceCount: 1,
    costAmount: '250.00',
    dispatchedAt: DISPATCHED,
    expectedBy: null,
    receivedAt: null,
    lostAt: null,
    lostNote: null,
    createdBy: 'admin-user-1',
    createdAt: DISPATCHED,
    updatedAt: DISPATCHED,
    ...over,
  }
}

/** A job on the parcel, as the join hands it back. */
function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: JOB_A,
    orderId: ORDER_ID,
    stage: 'print',
    vendorId: VENDOR_A,
    status: 'dispatched',
    amountExpected: '400.00',
    amountActual: null,
    settlementId: null,
    ...over,
  }
}

/** Every job row the database holds for vendor A in the default fixture. */
const ORIGINAL_JOBS: PayableJob[] = [
  { id: JOB_A, amountExpected: '400.00', amountActual: null, settlementId: null },
  { id: JOB_B, amountExpected: '150.50', amountActual: '175.00', settlementId: null },
]

/**
 * The default happy-path fixture: one parcel from A to B carrying two
 * `dispatched` jobs, four order items between them.
 */
function seedLostable(over: Record<string, unknown> = {}) {
  queueRows({
    'select:production_transfers': [[transferRow(over)]],
    'update:production_transfers': [[{ id: TRANSFER_ID }]],
    'select:production_transfer_jobs': [
      [
        jobRow(),
        jobRow({ id: JOB_B, stage: 'frame', amountExpected: '150.50', amountActual: '175.00' }),
      ],
    ],
    'select:production_job_items': [
      [
        { jobId: JOB_A, orderItemId: ITEM_1 },
        { jobId: JOB_B, orderItemId: ITEM_2 },
      ],
    ],
    'insert:production_jobs': [
      [
        { id: NEW_JOB_A, replacesJobId: JOB_A, stage: 'print', status: 'draft' },
        { id: NEW_JOB_B, replacesJobId: JOB_B, stage: 'frame', status: 'draft' },
      ],
    ],
    'insert:production_job_items': [[]],
  })
}

const declareLost = (body: unknown = { lostNote: 'carrier confirmed the parcel is gone' }) =>
  buildApp().request(`/api/admin/transfers/${TRANSFER_ID}/lost`, json(body))

/** Rows inserted into `table` by one request, flattened across batches. */
function insertedRows(table: unknown): Array<Record<string, unknown>> {
  return inserts(table).flatMap((q) => {
    const values = q.values
    if (values === undefined) return []
    return (Array.isArray(values) ? values : [values]) as Array<Record<string, unknown>>
  })
}

beforeEach(() => {
  recorder.reset()
  auditSpy.mockClear()
  auditSpy.mockResolvedValue(undefined)
  mockGetSession.mockResolvedValue(adminSessionFor('admin'))
})

// ============================================================================
// The derived state — there is no status enum, by design
// ============================================================================

describe('transferState', () => {
  it('reads nothing-yet as pending', () => {
    expect(
      transferState({ dispatchedAt: null, receivedAt: null, lostAt: null })
    ).toBe('pending')
  })

  it('reads a dispatched, unarrived parcel as in_transit', () => {
    expect(
      transferState({ dispatchedAt: DISPATCHED, receivedAt: null, lostAt: null })
    ).toBe('in_transit')
  })

  it('reads an arrived parcel as received', () => {
    expect(
      transferState({ dispatchedAt: DISPATCHED, receivedAt: new Date(), lostAt: null })
    ).toBe('received')
  })

  it('reads a lost parcel as lost', () => {
    expect(
      transferState({ dispatchedAt: DISPATCHED, receivedAt: null, lostAt: new Date() })
    ).toBe('lost')
  })

  it('lets arrival win over a lost stamp, because it arrived', () => {
    // The route makes this pair unreachable; if a row ever holds both, the
    // parcel is on a shelf at vendor B and the record should say so.
    expect(
      transferState({ dispatchedAt: DISPATCHED, receivedAt: new Date(), lostAt: new Date() })
    ).toBe('received')
  })
})

// ============================================================================
// GET /api/admin/transfers
// ============================================================================

describe('GET /api/admin/transfers', () => {
  function seedList() {
    queueRows({
      'select:production_transfers': [
        [{ value: 1 }],
        [{ ...transferRow(), fromVendorName: 'Vendor A', toVendorName: 'Vendor B' }],
      ],
      'select:production_transfer_jobs': [[{ transferId: TRANSFER_ID, jobId: JOB_A }]],
    })
  }

  it('rejects an anonymous caller', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await buildApp().request('/api/admin/transfers')

    expect(res.status).toBe(401)
  })

  it('rejects a non-admin caller', async () => {
    mockGetSession.mockResolvedValue(adminSessionFor('customer'))
    const res = await buildApp().request('/api/admin/transfers')

    expect(res.status).toBe(403)
  })

  it('shows an admin both ends of the leg and the derived state', async () => {
    seedList()
    const res = await buildApp().request('/api/admin/transfers')
    const body = await readJson<{ items: Array<Record<string, unknown>>; total: number }>(res)

    expect(res.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.items[0]).toMatchObject({
      id: TRANSFER_ID,
      fromVendorId: VENDOR_A,
      fromVendorName: 'Vendor A',
      toVendorId: VENDOR_B,
      toVendorName: 'Vendor B',
      reference: 'DKT-1234',
      state: 'in_transit',
    })
    expect(body.items[0]!.jobIds).toEqual([JOB_A])
  })

  it('filters by order, by either end, and by derived state', async () => {
    seedList()
    await buildApp().request(
      `/api/admin/transfers?orderId=${ORDER_ID}&fromVendorId=${VENDOR_A}&toVendorId=${VENDOR_B}&state=lost`
    )

    const listQuery = selects(productionTransfers).at(-1)
    const { sql, params } = render(listQuery!.where)

    expect(params).toContain(ORDER_ID)
    expect(params).toContain(VENDOR_A)
    expect(params).toContain(VENDOR_B)
    // `state=lost` is three timestamp tests, never a status column: there is no
    // status enum on this table, deliberately.
    expect(sql).toContain('lost_at')
    expect(sql).toContain('received_at')
    expect(sql).not.toMatch(/"?status"?/)
  })

  it('refuses a state outside the four derived ones', async () => {
    const res = await buildApp().request('/api/admin/transfers?state=in_limbo')

    expect(res.status).toBe(400)
  })

  it('clamps the page size rather than trusting it', async () => {
    seedList()
    await buildApp().request('/api/admin/transfers?pageSize=100000')

    expect(selects(productionTransfers).at(-1)!.limit).toBe(100)
  })
})

// ============================================================================
// POST /api/admin/transfers/:id/lost — who may
// ============================================================================

describe('POST /api/admin/transfers/:id/lost — authorisation', () => {
  it('rejects an anonymous caller', async () => {
    mockGetSession.mockResolvedValue(null)
    seedLostable()

    const res = await declareLost()

    expect(res.status).toBe(401)
    expect(updates(productionTransfers)).toHaveLength(0)
  })

  it('rejects a vendor: declaring a parcel lost decides who eats a cost', async () => {
    mockGetSession.mockResolvedValue(adminSessionFor('vendor'))
    seedLostable()

    const res = await declareLost()

    expect(res.status).toBe(403)
    expect(updates(productionTransfers)).toHaveLength(0)
    expect(inserts(productionJobs)).toHaveLength(0)
  })

  it('rejects a content manager, who may edit the catalogue and nothing financial', async () => {
    mockGetSession.mockResolvedValue(adminSessionFor('content-manager'))
    seedLostable()

    const res = await declareLost()

    expect(res.status).toBe(403)
  })
})

// ============================================================================
// POST /api/admin/transfers/:id/lost — refusals
// ============================================================================

describe('POST /api/admin/transfers/:id/lost — refusals', () => {
  it('404s an unknown transfer, writing nothing', async () => {
    queueRows({ 'select:production_transfers': [[]] })

    const res = await declareLost()

    expect(res.status).toBe(404)
    expect(updates(productionTransfers)).toHaveLength(0)
    expect(inserts(productionJobs)).toHaveLength(0)
  })

  it('409s a transfer that already arrived', async () => {
    seedLostable({ receivedAt: new Date('2026-08-22T09:00:00Z') })

    const res = await declareLost()
    const body = await readJson<{ error: string }>(res)

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/received/i)
    expect(updates(productionTransfers)).toHaveLength(0)
    expect(inserts(productionJobs)).toHaveLength(0)
  })

  it('409s a transfer already declared lost, so the replacements are made once', async () => {
    seedLostable({ lostAt: new Date('2026-08-25T09:00:00Z'), lostNote: 'gone' })

    const res = await declareLost()

    expect(res.status).toBe(409)
    expect(inserts(productionJobs)).toHaveLength(0)
    expect(inserts(productionJobItems)).toHaveLength(0)
  })

  it('409s a transfer that never dispatched: nothing left, so nothing is lost', async () => {
    // A parcel still sitting at vendor A cannot have gone missing. Declaring it
    // lost would create a replacement — a second job somebody has to be paid to
    // make — for goods that are on the shelf.
    seedLostable({ dispatchedAt: null })

    const res = await declareLost()
    const body = await readJson<{ error: string }>(res)

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/not been dispatched/i)
    expect(updates(productionTransfers)).toHaveLength(0)
    expect(inserts(productionJobs)).toHaveLength(0)
    expect(inserts(productionJobItems)).toHaveLength(0)
  })

  it('409s when a job on the parcel has not been dispatched either', async () => {
    // The route's whole premise is that the original stays `dispatched` with
    // its payable intact. A `qc_passed` job is still at vendor A, so a
    // replacement leaves two live jobs over the same order items and readiness
    // reports the order blocked twice over.
    seedLostable()
    queueRows({
      'select:production_transfer_jobs': [
        [jobRow(), jobRow({ id: JOB_B, status: 'qc_passed' })],
      ],
    })

    const res = await declareLost()
    const body = await readJson<{ error: string }>(res)

    expect(res.status).toBe(409)
    expect(body.error).toContain(JOB_B)
    expect(body.error).toContain('qc_passed')
    expect(body.error).not.toContain(JOB_A)
    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    expect(inserts(productionJobs)).toHaveLength(0)
    expect(inserts(productionJobItems)).toHaveLength(0)
  })

  it('409s a parcel whose jobs were cancelled rather than dispatched', async () => {
    // Cancellation has no out-edge. Replacing a job nobody is going to be paid
    // for is not a replacement, it is a duplicate.
    seedLostable()
    queueRows({
      'select:production_transfer_jobs': [[jobRow({ status: 'cancelled' })]],
    })

    const res = await declareLost()

    expect(res.status).toBe(409)
    expect(tx.rollbacks).toBe(1)
    expect(inserts(productionJobs)).toHaveLength(0)
  })

  it('422s when a job on the parcel is not the sending vendor’s', async () => {
    seedLostable()
    queueRows({
      'select:production_transfer_jobs': [
        [jobRow(), jobRow({ id: FOREIGN_JOB, vendorId: VENDOR_B })],
      ],
    })

    const res = await declareLost()
    const body = await readJson<{ error: string }>(res)

    expect(res.status).toBe(422)
    expect(body.error).toContain(FOREIGN_JOB)
    expect(tx.rollbacks).toBe(1)
    expect(inserts(productionJobs)).toHaveLength(0)
  })

  it('rolls back when the guarded update matches no row — the concurrent case', async () => {
    // Two admins read an unlost transfer at the same time. The UPDATE repeats
    // the predicate, so the loser matches zero rows and the whole thing rolls
    // back rather than producing a second set of replacements.
    seedLostable()
    queueRows({ 'update:production_transfers': [[]] })

    const res = await declareLost()

    expect(res.status).toBe(409)
    expect(tx.rollbacks).toBe(1)
    expect(tx.commits).toBe(0)
    expect(inserts(productionJobs)).toHaveLength(0)
  })

  it('rolls back when the replacement insert does not return one job per lost job', async () => {
    seedLostable()
    queueRows({
      'insert:production_jobs': [[{ id: NEW_JOB_A, replacesJobId: JOB_A, stage: 'print' }]],
    })

    const res = await declareLost()

    expect(res.status).toBe(500)
    expect(tx.rollbacks).toBe(1)
    expect(inserts(productionJobItems)).toHaveLength(0)
  })

  it('records every refusal OUTSIDE the transaction, or the refusal erases itself', async () => {
    seedLostable({ receivedAt: new Date('2026-08-22T09:00:00Z') })

    await declareLost()

    expect(auditSpy).toHaveBeenCalledTimes(1)
    const [, entry, sharedTx] = auditSpy.mock.calls[0]!
    expect(entry).toMatchObject({
      action: 'production_transfer.declared_lost',
      outcome: 'failure',
      entityId: TRANSFER_ID,
    })
    // A refusal row records that a transaction was ROLLED BACK. Writing it
    // inside that transaction rolls the row back too.
    expect(sharedTx).toBeUndefined()
  })
})

// ============================================================================
// POST /api/admin/transfers/:id/lost — the replacement
// ============================================================================

describe('POST /api/admin/transfers/:id/lost', () => {
  it('stamps lost_at and lost_note, repeating the predicate in the WHERE', async () => {
    seedLostable()

    const res = await declareLost({ lostNote: 'carrier confirmed the parcel is gone' })

    expect(res.status).toBe(200)

    const update = updates(productionTransfers)[0]!
    expect(update.inTx).toBe(true)
    expect(update.values).toMatchObject({ lostNote: 'carrier confirmed the parcel is gone' })
    expect((update.values as { lostAt: Date }).lostAt).toBeInstanceOf(Date)

    const { sql, params } = render(update.where)
    expect(params).toContain(TRANSFER_ID)
    // Belt and braces against anything that slipped in between the read and
    // the write, exactly as vendor-payables does it. All three timestamps: a
    // parcel is lost only if it dispatched, has not arrived, and is not
    // already written off.
    expect(sql).toContain('dispatched_at')
    expect(sql).toContain('is not null')
    expect(sql).toContain('received_at')
    expect(sql).toContain('lost_at')
    expect(sql).toContain('is null')
  })

  it('takes FOR UPDATE on the transfer before deciding anything', async () => {
    seedLostable()

    await declareLost()

    const read = selects(productionTransfers)[0]!
    expect(read.inTx).toBe(true)
    expect(queries.indexOf(read)).toBeLessThan(queries.indexOf(updates(productionTransfers)[0]!))
  })

  it('creates exactly one draft replacement per lost job, linked by replaces_job_id', async () => {
    seedLostable()

    const res = await declareLost()
    const body = await readJson<{
      replacements: Array<{ id: string; replacesJobId: string; orderItemIds: string[] }>
    }>(res)

    const rows = insertedRows(productionJobs)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.replacesJobId).sort()).toEqual([JOB_A, JOB_B].sort())
    for (const row of rows) {
      expect(row.status).toBe('draft')
      expect(row.orderId).toBe(ORDER_ID)
      // Unassigned and unpriced: `draft` is where assignment re-prices against
      // the rate card live at that instant. Copying A's price forward would
      // charge the replacement vendor's work at A's rate.
      expect(row.vendorId ?? null).toBeNull()
      expect(row.amountExpected ?? null).toBeNull()
      expect(row.amountActual ?? null).toBeNull()
      expect(row.settlementId ?? null).toBeNull()
    }

    expect(body.replacements).toHaveLength(2)
  })

  it('carries the same stage as the job it replaces', async () => {
    seedLostable()

    await declareLost()

    const byReplaced = new Map(
      insertedRows(productionJobs).map((r) => [r.replacesJobId as string, r])
    )
    expect(byReplaced.get(JOB_A)!.stage).toBe('print')
    expect(byReplaced.get(JOB_B)!.stage).toBe('frame')
  })

  it('carries the same production_job_items, under the new job id', async () => {
    seedLostable()

    await declareLost()

    const itemRows = insertedRows(productionJobItems)
    expect(itemRows).toHaveLength(2)
    expect(itemRows).toEqual(
      expect.arrayContaining([
        { jobId: NEW_JOB_A, orderItemId: ITEM_1 },
        { jobId: NEW_JOB_B, orderItemId: ITEM_2 },
      ])
    )
  })

  it('never deletes the original’s item rows: they say what its payable was for', async () => {
    seedLostable()

    const res = await declareLost()

    // The handler has to have RUN for the absence below to mean anything: with
    // no handler at all there are no deletes either, and the assertion passes
    // while proving nothing.
    expect(res.status).toBe(200)
    expect(insertedRows(productionJobs)).toHaveLength(2)
    expect(recorder.deletes(productionJobItems)).toHaveLength(0)
    expect(recorder.deletes(productionJobs)).toHaveLength(0)
  })

  it('leaves the original jobs alone — status, amounts and settlement all untouched', async () => {
    seedLostable()

    const res = await declareLost()

    // Pinned first: the call succeeded and did create the replacements. An
    // absence asserted over a handler that never ran is not evidence.
    expect(res.status).toBe(200)
    expect(insertedRows(productionJobs)).toHaveLength(2)
    // Not "does not set status to qc_failed" but "does not write to the table
    // at all". Moving the original would slander vendor A's QC record and
    // pollute the defect history a future scorecard reads.
    expect(updates(productionJobs)).toHaveLength(0)
  })

  it('leaves the payable total exactly where it was', async () => {
    seedLostable()
    const before = sumPayable(ORIGINAL_JOBS)

    const res = await declareLost()

    // THE headline claim of this file, and the one an absence-only assertion
    // cannot make: with no handler the patch is empty and nothing is inserted,
    // so `after === before` holds trivially. Both replacements have to exist
    // before the equality below says anything about the money.
    expect(res.status).toBe(200)
    const replacements = insertedRows(productionJobs)
    expect(replacements).toHaveLength(2)
    expect(replacements.map((r) => r.replacesJobId).sort()).toEqual([JOB_A, JOB_B].sort())

    // Every production_jobs row the database now holds: the originals with any
    // recorded UPDATE applied over them, plus whatever the route inserted. The
    // update is replayed rather than assumed absent, so an edit that zeroed an
    // amount or stamped a settlement to "tidy up" moves this number.
    const patch = updates(productionJobs).reduce<Record<string, unknown>>(
      (acc, q) => ({ ...acc, ...((q.values ?? {}) as Record<string, unknown>) }),
      {}
    )
    const after = sumPayable(
      [...ORIGINAL_JOBS.map((job) => ({ ...job, ...patch })), ...insertedRows(productionJobs)].map(
        (r) => ({
          id: String(r.id ?? 'new'),
          amountExpected: (r.amountExpected ?? null) as string | null,
          amountActual: (r.amountActual ?? null) as string | null,
          settlementId: (r.settlementId ?? null) as string | null,
        })
      )
    )

    expect(before).toBe('575.00')
    expect(after).toBe(before)
  })

  it('never puts the original on a second parcel', async () => {
    seedLostable()

    const res = await declareLost()

    // A job is on at most one transfer, EVER — the database enforces it with a
    // unique index on job_id alone. The route's half is making a REPLACEMENT
    // rather than re-parcelling: both halves are asserted, or a deleted handler
    // passes this on the strength of having done nothing.
    expect(res.status).toBe(200)
    expect(insertedRows(productionJobs)).toHaveLength(2)
    expect(inserts(productionTransferJobs)).toHaveLength(0)
    expect(updates(productionTransferJobs)).toHaveLength(0)
  })

  it('does all of it in ONE transaction', async () => {
    seedLostable()

    await declareLost()

    expect(tx.commits).toBe(1)
    expect(tx.rollbacks).toBe(0)
    for (const query of [
      ...selects(productionTransfers),
      ...updates(productionTransfers),
      ...selects(productionTransferJobs),
      ...selects(productionJobItems),
      ...inserts(productionJobs),
      ...inserts(productionJobItems),
    ]) {
      expect(query.inTx).toBe(true)
    }
  })

  it('shares the transaction with the audit row, and names both job id sets', async () => {
    seedLostable()

    await declareLost({ lostNote: 'carrier confirmed the parcel is gone' })

    expect(auditSpy).toHaveBeenCalledTimes(1)
    const [, entry, sharedTx] = auditSpy.mock.calls[0]!
    expect(entry).toMatchObject({
      action: 'production_transfer.declared_lost',
      entityType: 'production_transfer',
      entityId: TRANSFER_ID,
    })
    expect(entry.outcome ?? 'success').toBe('success')
    expect(entry.metadata.lostJobIds.sort()).toEqual([JOB_A, JOB_B].sort())
    expect(entry.metadata.replacementJobIds.sort()).toEqual([NEW_JOB_A, NEW_JOB_B].sort())
    // A row saying "declared lost, here are the replacements" beside a transfer
    // that rolled back is a lie, so this one shares the transaction.
    expect(sharedTx).toBeDefined()
  })

  it('lets an audit failure abort the whole thing rather than reporting success', async () => {
    seedLostable()
    // recordAudit RETHROWS when it is given a tx: the insert did not fail on
    // its own, it aborted the caller's transaction. Swallowing it here would
    // return 200 over a write Postgres is about to roll back.
    auditSpy.mockRejectedValueOnce(new Error('audit insert deadlocked'))

    const res = await declareLost()

    expect(res.status).toBe(500)
    expect(tx.rollbacks).toBe(1)
  })

  it('accepts a declaration with no note', async () => {
    seedLostable()

    const res = await declareLost({})

    expect(res.status).toBe(200)
    expect((updates(productionTransfers)[0]!.values as { lostNote: unknown }).lostNote).toBeNull()
  })

  it('refuses a note longer than the audit table will keep', async () => {
    seedLostable()

    const res = await declareLost({ lostNote: 'x'.repeat(2001) })

    expect(res.status).toBe(400)
    expect(updates(productionTransfers)).toHaveLength(0)
  })

  it('refuses an id that is not a uuid', async () => {
    const res = await buildApp().request('/api/admin/transfers/not-a-uuid/lost', json({}))

    expect(res.status).toBe(400)
  })
})

// ============================================================================
// The one thing a mock cannot prove
// ============================================================================

describe('the locking clause', () => {
  /**
   * A recording builder cannot serialise anything, so `FOR UPDATE` is the one
   * part of the concurrency recipe no assertion above can reach: the mock
   * answers a `.for('update')` chain exactly as it answers a plain read.
   * Scanned from the source instead, in the shape `tests/lib/production-seam.ts`
   * already uses — a lock silently dropped in a refactor is the failure this
   * catches, and it is the failure that produces two sets of paid-for
   * replacement jobs.
   */
  it('takes FOR UPDATE on both reads inside the transaction', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../src/routes/admin/transfers.ts'),
      'utf8'
    )

    expect(source.match(/\.for\(["']update["']\)/g) ?? []).toHaveLength(2)
  })
})
