/**
 * `openJobCount` on the admin vendor list, against a real Postgres (#696).
 *
 * `tests/routes/admin/vendors.test.ts` mocks `db` with the recording builder,
 * which is the right tool for asserting the LIMIT, the projection and the
 * capability predicate — and the wrong tool for this one property. That suite
 * hands the handler whatever rows it queued, so `openJobCount` there is a
 * reading of the fixture: the count comes back as whatever the test said, no
 * matter which statuses the WHERE excludes. A test written over it could only
 * ever assert that the constant contains a string, and #696 is precisely a bug
 * a list-literal assertion would have passed over — `dispatched` is a REACHABLE
 * TERMINAL status that the exclusion list did not name, so every dispatched job
 * counted as open work against its vendor forever, and the number on the admin
 * vendor directory never came down.
 *
 * So: real rows, in every status the enum has, and the number the route
 * actually answers with.
 *
 * The expectation table below is written out longhand ON PURPOSE. Deriving the
 * expected count from `TERMINAL_STATUSES` — the same source the route now reads
 * — would be a tautology that passes with the old, wrong list still in place:
 * the old list also had two entries, so "nine statuses minus two" was 7 either
 * way. Only naming each status can tell `dispatched` from `qc_passed`.
 *
 * Rows are created and deleted by this suite and nothing is dropped, so it is
 * safe against the shared dev database (see tests/helpers/live-db.ts, #580).
 * A capability nobody else has — a press wider than the seed's own stand-in for
 * "unbounded" — is what isolates the vendor to a page of exactly one row.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'

import { vendors, vendorCapabilities } from '../../../src/database/schema/vendors'
import { orders } from '../../../src/database/schema/orders'
import {
  productionJobs,
  productionJobStatusEnum,
  type ProductionJobStatus,
} from '../../../src/database/schema/production-jobs'
import {
  liveDbUrl,
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from '../../helpers/live-db'
import { readJson } from '../../helpers/json'

vi.mock('../../../src/middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/middleware/auth')>()),
  ...(await import('../../helpers/admin-route-harness')).headerAdminMocks(),
}))

const DATABASE_URL = liveDbUrl()

let client: LiveDbConnection['client']
let db: LiveDbConnection['db']
let reachable = false
let app: Hono

/** Unique to this process, so two agents on one dev database cannot collide. */
const MARKER = `open-jobs-${process.pid}-${Date.now()}`

/**
 * The capability that makes the page exactly one row.
 *
 * Not a round "very big" number: the dev database seeds 999x999 as its stand-in
 * for "unbounded", so `minLongestEdge=999` selects every seeded print vendor and
 * the page comes back with twenty rows that are not ours. This is larger than
 * anything the seed produces, and the vendor carrying it is created here.
 */
const ISOLATING_EDGE = 4096

let vendorId = ''
let orderId = ''

const ADMIN = JSON.stringify({ id: 'test-user-open-jobs-admin', email: 'admin@example.com' })

/**
 * Is a job in this status still open work against the vendor holding it?
 *
 * NOT derived. See the header: a derived table cannot distinguish the bug from
 * the fix, because both lists are the same length.
 *
 * - `qc_submitted` is OPEN. The ball is in our court, but the vendor still has
 *   the piece and the job is still live against them.
 * - `qc_passed` is OPEN, and it did not used to be. Dispatch was in-house when
 *   this count was written, so passing QC was the end of the line; vendors
 *   despatch directly now (#673), so a passed job is a piece still sitting on
 *   that vendor's shelf waiting to be handed to a courier.
 * - `dispatched` is CLOSED. Terminal — this vendor's custody ended, and a lost
 *   parcel creates a NEW job rather than resurrecting this one.
 * - `cancelled` is CLOSED. Terminal.
 * - `sent` is retired (#675) and holds no new rows, but the enum still carries
 *   it and old rows still say it, so it must still count as work in hand.
 */
const IS_OPEN: Record<ProductionJobStatus, boolean> = {
  draft: true,
  assigned: true,
  sent: true,
  received: true,
  qc_submitted: true,
  qc_passed: true,
  qc_failed: true,
  dispatched: false,
  cancelled: false,
}

const ALL_STATUSES = productionJobStatusEnum.enumValues as readonly ProductionJobStatus[]

async function seedJobs(statuses: readonly ProductionJobStatus[]): Promise<void> {
  await db.insert(productionJobs).values(
    statuses.map((status) => ({
      orderId,
      vendorId,
      stage: 'print' as const,
      status,
    }))
  )
}

/** The number the admin vendor directory prints in the "open jobs" column. */
async function readOpenJobCount(): Promise<number> {
  const res = await app.request(
    `/api/admin/vendors?kind=print&minLongestEdge=${ISOLATING_EDGE}`,
    { headers: { 'X-Test-User': ADMIN } }
  )
  expect(res.status).toBe(200)

  const body = await readJson(res)
  expect(body.items).toHaveLength(1)
  expect(body.items[0].id).toBe(vendorId)

  return body.items[0].openJobCount as number
}

beforeAll(async () => {
  ;({ client, db, reachable } = await connectLiveDb({ max: 3 }))

  if (reachable) {
    const [vendor] = await db
      .insert(vendors)
      .values({ name: `Open Job Count Test ${MARKER}`, city: 'Chennai' })
      .returning({ id: vendors.id })
    vendorId = vendor!.id

    await db.insert(vendorCapabilities).values({
      vendorId,
      kind: 'print',
      maxWidthInches: ISOLATING_EDGE,
      maxHeightInches: ISOLATING_EDGE,
    })

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `CA-${MARKER}`,
        shippingAddress: { marker: MARKER } as never,
        subtotal: '0.00',
        total: '0.00',
      })
      .returning({ id: orders.id })
    orderId = order!.id
  }

  const { adminVendorsApp } = await import('../../../src/routes/admin/vendors')
  app = new Hono()
  app.route('/api/admin/vendors', adminVendorsApp)
})

afterEach(async () => {
  if (!reachable || !vendorId) return
  await db.delete(productionJobs).where(eq(productionJobs.vendorId, vendorId))
})

afterAll(async () => {
  if (reachable && vendorId) {
    await db.delete(productionJobs).where(eq(productionJobs.vendorId, vendorId))
    await db.delete(vendorCapabilities).where(eq(vendorCapabilities.vendorId, vendorId))
    await db.delete(vendors).where(eq(vendors.id, vendorId))
  }
  if (reachable && orderId) {
    await db.delete(orders).where(eq(orders.id, orderId))
  }
  await closeLiveDb(client)
})

describe('GET /api/admin/vendors — openJobCount (#696)', () => {
  it('has a database to assert against', () => {
    assertLiveDbReachable(reachable)
    expect(DATABASE_URL).toBeTruthy()
  })

  it('counts no open jobs for a vendor with no jobs at all', async () => {
    if (!reachable) return
    expect(await readOpenJobCount()).toBe(0)
  })

  it('does not count a dispatched job as open work against its vendor', async () => {
    if (!reachable) return

    await seedJobs(['dispatched'])

    // The bug: `dispatched` is terminal and was missing from the exclusion
    // list, so this answered 1 and kept answering 1 for the life of the row.
    expect(await readOpenJobCount()).toBe(0)
  })

  it('still counts a qc_submitted job as open — the vendor has not let go of it', async () => {
    if (!reachable) return

    await seedJobs(['qc_submitted'])

    expect(await readOpenJobCount()).toBe(1)
  })

  it('counts every non-terminal status and no terminal one, across the whole enum', async () => {
    if (!reachable) return

    // The extra `dispatched` is what makes this case able to fail. One job per
    // status alone cannot: the OLD list was also two statuses long, so it
    // answered 7 as well — with `qc_passed` wrongly excluded and `dispatched`
    // wrongly counted, the two errors cancelling exactly. A second terminal job
    // breaks the symmetry, and the old list answers 8.
    await seedJobs([...ALL_STATUSES, 'dispatched'])

    // draft, assigned, sent, received, qc_submitted, qc_passed, qc_failed.
    // NEITHER dispatched job, and not cancelled.
    expect(await readOpenJobCount()).toBe(7)
  })

  it('counts three dispatched jobs and one received job as one open job', async () => {
    if (!reachable) return

    await seedJobs(['dispatched', 'dispatched', 'dispatched', 'received'])

    expect(await readOpenJobCount()).toBe(1)
  })

  it.each(ALL_STATUSES)('answers %s according to the status table', async (status) => {
    if (!reachable) return

    await seedJobs([status])

    expect(await readOpenJobCount()).toBe(IS_OPEN[status] ? 1 : 0)
  })
})
