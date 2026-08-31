/**
 * Admin vendors API — CRUD, contacts, capabilities, pagination and role gating.
 *
 * Two things are mocked and one deliberately is not.
 *
 * - `src/database` is mocked with a recording query builder. The mock does not
 *   execute SQL, so anything that must be true *of the query itself* — the
 *   LIMIT, the offset, the capability predicate — is asserted by rendering the
 *   captured drizzle condition through `PgDialect`. That is a real assertion
 *   about real SQL, not a restatement of the handler.
 * - `src/auth` is mocked so each test picks the caller's role, and the REAL
 *   `requireAuth`/`requireAdmin` run. Gating is the point of this ticket, so
 *   mocking the middleware would test the mock. Same shape as
 *   `tests/routes/admin/products-role-access.test.ts`.
 *
 * @see packages/api/src/routes/admin/vendors.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adminSessionFor } from '../../helpers/admin-session'
import { buildRouteApp } from '../../helpers/route-app'
import '../../setup'

import {
  vendors,
  vendorCapabilities,
  vendorRates,
} from '../../../src/database/schema/vendors'
import { productionJobs } from '../../../src/database/schema/production-jobs'

// ============================================================================
// Recording database mock
// ============================================================================

const recorder = await vi.hoisted(async () =>
  (await import('../../helpers/query-recorder')).createQueryRecorder()
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

import { adminVendorsApp } from '../../../src/routes/admin/vendors'
import { readJson } from '../../helpers/json'

// ============================================================================
// Helpers
// ============================================================================

const { queries, render, queueRows, selects } = recorder

const sessionFor = adminSessionFor

const buildApp = () => buildRouteApp('/api/admin/vendors', adminVendorsApp)

const VENDOR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const CHILD_ID = '33333333-3333-4333-8333-333333333333'

const vendorRow = {
  id: VENDOR_ID,
  name: 'Chennai Print Works',
  status: 'active',
  city: 'Chennai',
  state: 'TN',
  country: 'IN',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

beforeEach(() => {
  recorder.reset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('admin'))
})

// ============================================================================
// List: pagination, filters, derived columns
// ============================================================================

describe('GET /api/admin/vendors', () => {
  it('returns a paginated envelope and applies a LIMIT with no page param', async () => {
    queueRows({
      'select:vendors': [[{ value: 1 }], [vendorRow]],
      'select:vendor_capabilities': [[{ vendorId: VENDOR_ID, kind: 'print', maxWidthInches: 24, maxHeightInches: 36 }]],
      'select:production_jobs': [[{ vendorId: VENDOR_ID, value: 3 }], []],
    })

    const res = await buildApp().request('/api/admin/vendors')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(20)
    expect(body.total).toBe(1)
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      id: VENDOR_ID,
      name: 'Chennai Print Works',
      status: 'active',
      openJobCount: 3,
      amountOwed: '0.00',
    })
    expect(body.items[0].capabilities).toEqual([
      { kind: 'print', maxWidthInches: 24, maxHeightInches: 36 },
    ])

    // Unbounded-by-default is the defect in the collections and frames list
    // endpoints. A request with no page param must still be bounded.
    const page = selects(vendors).find((q) => q.limit !== undefined)
    expect(page).toBeDefined()
    expect(page?.limit).toBe(20)
    expect(page?.offset).toBe(0)
  })

  it('honours page/pageSize and caps pageSize', async () => {
    queueRows({ 'select:vendors': [[{ value: 250 }], []] })

    const res = await buildApp().request('/api/admin/vendors?page=3&pageSize=500')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.page).toBe(3)
    expect(body.pageSize).toBe(100)

    const page = selects(vendors).find((q) => q.limit !== undefined)
    expect(page?.limit).toBe(100)
    expect(page?.offset).toBe(200)
  })

  it('filters by status', async () => {
    queueRows({ 'select:vendors': [[{ value: 0 }], []] })

    const res = await buildApp().request('/api/admin/vendors?status=suspended')
    expect(res.status).toBe(200)

    const page = selects(vendors).find((q) => q.limit !== undefined)
    const { sql, params } = render(page?.where)
    expect(sql).toContain('"status"')
    expect(params).toContain('suspended')
  })

  it('rejects an unknown status with 400', async () => {
    const res = await buildApp().request('/api/admin/vendors?status=nonsense')
    expect(res.status).toBe(400)
  })

  it('filters by capability kind and minimum printable edge', async () => {
    queueRows({
      'select:vendor_capabilities': [
        [{ vendorId: VENDOR_ID }, { vendorId: VENDOR_ID }],
        [{ vendorId: VENDOR_ID, kind: 'print', maxWidthInches: 40, maxHeightInches: 60 }],
      ],
      'select:vendors': [[{ value: 1 }], [vendorRow]],
      'select:production_jobs': [[], []],
    })

    const res = await buildApp().request('/api/admin/vendors?kind=print&minLongestEdge=36')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.items.map((v: { id: string }) => v.id)).toEqual([VENDOR_ID])

    // "can print at least 36 inches" is kind = 'print' AND (width >= 36 OR height >= 36).
    const capabilityFilter = selects(vendorCapabilities)[0]
    const { sql, params } = render(capabilityFilter?.where)
    expect(sql).toContain('"kind"')
    expect(sql).toContain('"max_width_inches"')
    expect(sql).toContain('"max_height_inches"')
    expect(sql).toMatch(/>=/)
    expect(sql.toLowerCase()).toMatch(/\bor\b/)
    expect(params).toContain('print')
    expect(params.filter((p) => p === 36)).toHaveLength(2)

    // The page query is then restricted to the vendors that matched.
    const page = selects(vendors).find((q) => q.limit !== undefined)
    expect(render(page?.where).params).toContain(VENDOR_ID)
  })

  it('short-circuits to an empty page when no vendor has the capability', async () => {
    queueRows({ 'select:vendor_capabilities': [[]] })

    const res = await buildApp().request('/api/admin/vendors?kind=frame&minLongestEdge=90')
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.items).toEqual([])
    expect(body.total).toBe(0)
    expect(selects(vendors)).toHaveLength(0)
  })

  it("derives amountOwed from the job's override, not its expectation", async () => {
    queueRows({
      'select:vendors': [[{ value: 1 }], [vendorRow]],
      'select:vendor_capabilities': [[]],
      'select:production_jobs': [
        [{ vendorId: VENDOR_ID, value: 1 }],
        [
          {
            id: 'job-1',
            vendorId: VENDOR_ID,
            amountExpected: '100.00',
            amountActual: '90.00',
            settlementId: null,
          },
        ],
      ],
    })

    const res = await buildApp().request('/api/admin/vendors')
    const body = await readJson(res)

    expect(body.items[0].amountOwed).toBe('90.00')
    expect(body.items[0].openJobCount).toBe(1)
  })

  it('asks the database for payable jobs, not merely unsettled ones (#695)', async () => {
    // The fourth query with this defect, and the one the design never named.
    // Its own comment claimed it used "the same predicate lib/vendor-payables
    // documents" while spelling out half of it, so a cancelled job with a
    // rate-card expectation and nothing agreed inflated `amountOwed` on the
    // vendor list — a number an admin reads before deciding what to pay.
    queueRows({
      'select:vendors': [[{ value: 1 }], [vendorRow]],
      'select:vendor_capabilities': [[]],
      'select:production_jobs': [[{ vendorId: VENDOR_ID, value: 1 }], []],
    })

    await buildApp().request('/api/admin/vendors')

    // The second production_jobs select is the payables read; the first is the
    // open-job count, which is a different question with a different predicate.
    const payableRead = selects(productionJobs)[1]
    const { sql, params } = render(payableRead?.where)
    expect(sql).toContain('"settlement_id" is null')
    expect(sql).toContain(
      '("production_jobs"."status" <> $2 or "production_jobs"."amount_actual" is not null)'
    )
    expect(params).toContain('cancelled')

    // And the rows it hands to sumPayable carry status, or the JS half of the
    // rule cannot be applied to them either.
    expect(payableRead?.fields).toContain('status')
  })
})

// ============================================================================
// Vendor CRUD
// ============================================================================

describe('vendor create / read / update', () => {
  it('creates a vendor and records createdBy from the session user', async () => {
    queueRows({ 'insert:vendors': [[{ ...vendorRow, name: 'New Shop' }]] })

    const res = await buildApp().request(
      '/api/admin/vendors',
      json({ name: 'New Shop', city: 'Chennai' })
    )
    expect(res.status).toBe(201)

    const inserted = queries.find((q) => q.op === 'insert' && q.table === 'vendors')
    expect(inserted?.values).toMatchObject({ name: 'New Shop', createdBy: 'admin-user-1' })
  })

  it('rejects a vendor with no name', async () => {
    const res = await buildApp().request('/api/admin/vendors', json({ city: 'Chennai' }))
    expect(res.status).toBe(400)
  })

  it('returns a vendor with contacts, capabilities and rates', async () => {
    queueRows({
      'select:vendors': [[vendorRow]],
      'select:vendor_contacts': [[{ id: CHILD_ID, vendorId: VENDOR_ID, name: 'Ravi' }]],
      'select:vendor_capabilities': [[{ id: 'cap-1', vendorId: VENDOR_ID, kind: 'print' }]],
      'select:vendor_rates': [[{ id: 'rate-1', vendorId: VENDOR_ID, amount: '450.00' }]],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`)
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.vendor.id).toBe(VENDOR_ID)
    expect(body.contacts).toHaveLength(1)
    expect(body.capabilities).toHaveLength(1)
    expect(body.rates).toHaveLength(1)
    expect(selects(vendorRates)).toHaveLength(1)
  })

  it('404s an unknown vendor id', async () => {
    queueRows({ 'select:vendors': [[]] })

    const res = await buildApp().request(`/api/admin/vendors/${OTHER_ID}`)
    expect(res.status).toBe(404)
  })

  it('400s a malformed vendor id', async () => {
    const res = await buildApp().request('/api/admin/vendors/not-a-uuid')
    expect(res.status).toBe(400)
  })

  it('updates a vendor', async () => {
    // The handler reads the row before it writes, so `vendor.updated` can carry
    // a delta rather than the whole record (#670).
    queueRows({
      'select:vendors': [[vendorRow]],
      'update:vendors': [[{ ...vendorRow, status: 'suspended' }]],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`, {
      ...json({ status: 'suspended' }),
      method: 'PATCH',
    })
    expect(res.status).toBe(200)

    const body = await readJson(res)
    expect(body.vendor.status).toBe('suspended')
  })

  it('404s a PATCH against an unknown vendor', async () => {
    // The pre-write read is what 404s now; the UPDATE is never reached.
    queueRows({ 'select:vendors': [[]], 'update:vendors': [[]] })

    const res = await buildApp().request(`/api/admin/vendors/${OTHER_ID}`, {
      ...json({ name: 'Ghost' }),
      method: 'PATCH',
    })
    expect(res.status).toBe(404)
  })
})

// ============================================================================
// Contacts and capabilities
// ============================================================================

describe('nested contacts and capabilities', () => {
  it('lists and creates contacts against an existing vendor', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'insert:vendor_contacts': [[{ id: CHILD_ID, vendorId: VENDOR_ID, name: 'Ravi' }]],
    })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/contacts`,
      json({ name: 'Ravi', email: 'ravi@example.com', isPrimary: true })
    )
    expect(res.status).toBe(201)

    const inserted = queries.find((q) => q.op === 'insert' && q.table === 'vendor_contacts')
    expect(inserted?.values).toMatchObject({ vendorId: VENDOR_ID, name: 'Ravi', isPrimary: true })
  })

  it('404s a contact create when the vendor does not exist', async () => {
    queueRows({ 'select:vendors': [[]] })

    const res = await buildApp().request(
      `/api/admin/vendors/${OTHER_ID}/contacts`,
      json({ name: 'Ravi' })
    )
    expect(res.status).toBe(404)
    expect(queries.some((q) => q.op === 'insert')).toBe(false)
  })

  it('updates and deletes a contact, 404ing one that is not this vendor’s', async () => {
    queueRows({ 'update:vendor_contacts': [[{ id: CHILD_ID, name: 'Ravi K' }]] })

    const patched = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/contacts/${CHILD_ID}`,
      { ...json({ name: 'Ravi K' }), method: 'PATCH' }
    )
    expect(patched.status).toBe(200)

    queries.length = 0
    queueRows({ 'delete:vendor_contacts': [[]] })

    const deleted = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/contacts/${CHILD_ID}`,
      { method: 'DELETE' }
    )
    expect(deleted.status).toBe(404)
  })

  it('creates a capability against an existing vendor', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'insert:vendor_capabilities': [[{ id: 'cap-1', vendorId: VENDOR_ID, kind: 'print' }]],
    })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/capabilities`,
      json({ kind: 'print', maxWidthInches: 40, maxHeightInches: 60, finishes: ['matte'] })
    )
    expect(res.status).toBe(201)

    const inserted = queries.find((q) => q.op === 'insert' && q.table === 'vendor_capabilities')
    expect(inserted?.values).toMatchObject({
      vendorId: VENDOR_ID,
      kind: 'print',
      maxWidthInches: 40,
      maxHeightInches: 60,
    })
  })

  it('404s a capability create when the vendor does not exist', async () => {
    queueRows({ 'select:vendors': [[]] })

    const res = await buildApp().request(
      `/api/admin/vendors/${OTHER_ID}/capabilities`,
      json({ kind: 'frame' })
    )
    expect(res.status).toBe(404)
  })

  it('rejects an unknown capability kind', async () => {
    queueRows({ 'select:vendors': [[{ id: VENDOR_ID }]] })

    const res = await buildApp().request(
      `/api/admin/vendors/${VENDOR_ID}/capabilities`,
      json({ kind: 'laminate' })
    )
    expect(res.status).toBe(400)
  })

  it('lists capabilities for a vendor', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_capabilities': [[{ id: 'cap-1', vendorId: VENDOR_ID, kind: 'frame' }]],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}/capabilities`)
    expect(res.status).toBe(200)
    expect((await readJson(res)).capabilities).toHaveLength(1)
  })
})

// ============================================================================
// Role gating — payables and vendor cost are admin data
// ============================================================================

describe('role gating', () => {
  const routes: Array<[string, RequestInit]> = [
    ['/api/admin/vendors', {}],
    ['/api/admin/vendors', json({ name: 'New Shop' })],
    [`/api/admin/vendors/${VENDOR_ID}`, {}],
    [`/api/admin/vendors/${VENDOR_ID}`, { ...json({ name: 'x' }), method: 'PATCH' }],
    [`/api/admin/vendors/${VENDOR_ID}/contacts`, {}],
    [`/api/admin/vendors/${VENDOR_ID}/contacts`, json({ name: 'Ravi' })],
    [`/api/admin/vendors/${VENDOR_ID}/contacts/${CHILD_ID}`, { method: 'DELETE' }],
    [`/api/admin/vendors/${VENDOR_ID}/capabilities`, {}],
    [`/api/admin/vendors/${VENDOR_ID}/capabilities`, json({ kind: 'print' })],
    [`/api/admin/vendors/${VENDOR_ID}/capabilities/${CHILD_ID}`, { method: 'DELETE' }],
  ]

  it.each(routes)('403s a content-manager on %s %#', async (path, init) => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'))

    const res = await buildApp().request(path, init)
    expect(res.status).toBe(403)
    expect(queries).toHaveLength(0)
  })

  it('403s a vendor-role user on the list', async () => {
    mockGetSession.mockResolvedValue(sessionFor('vendor'))

    const res = await buildApp().request('/api/admin/vendors')
    expect(res.status).toBe(403)
  })

  it('403s a customer on the list', async () => {
    mockGetSession.mockResolvedValue(sessionFor('customer'))

    const res = await buildApp().request('/api/admin/vendors')
    expect(res.status).toBe(403)
  })

  it('401s an unauthenticated caller', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await buildApp().request('/api/admin/vendors')
    expect(res.status).toBe(401)
  })

  it('allows a super-admin', async () => {
    mockGetSession.mockResolvedValue(sessionFor('super-admin'))
    queueRows({ 'select:vendors': [[{ value: 0 }], []] })

    const res = await buildApp().request('/api/admin/vendors')
    expect(res.status).toBe(200)
  })
})

// ============================================================================
// Module shape
// ============================================================================

describe('module exports', () => {
  it('exports the Hono app under both names', async () => {
    const mod = await import('../../../src/routes/admin/vendors')
    expect(mod.adminVendorsApp).toBeDefined()
    expect(mod.default).toBe(mod.adminVendorsApp)
  })

  it('is mounted on the server at /api/admin/vendors', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../src/index.ts', import.meta.url), 'utf8')
    )
    expect(source).toContain('app.route("/api/admin/vendors", adminVendorsApp)')
  })
})

// ============================================================================
// Shiprocket pickup nickname (#723)
// ============================================================================

describe('the Shiprocket pickup nickname', () => {
  /** Long enough to be legal, so the cap is the only thing that can reject it. */
  const NICKNAME = 'Chobii Warehouse #2 (Andheri East)'

  it('accepts a pasted nickname and writes it to the column', async () => {
    queueRows({
      'select:vendors': [[vendorRow]],
      'update:vendors': [[{ ...vendorRow, shiprocketPickupLocation: NICKNAME }]],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`, {
      ...json({ shiprocketPickupLocation: NICKNAME }),
      method: 'PATCH',
    })
    expect(res.status).toBe(200)

    const written = recorder.updates(vendors)[0]?.values as Record<string, unknown>
    expect(written.shiprocketPickupLocation).toBe(NICKNAME)
  })

  it('keeps inner spaces, case and punctuation exactly as pasted', async () => {
    // The nickname is whoever registered it in Shiprocket's dashboard. Any
    // normalisation here produces a value that looks right and matches nothing
    // on their side, and it fails at dispatch rather than on this screen.
    queueRows({
      'select:vendors': [[vendorRow]],
      'update:vendors': [[vendorRow]],
    })

    await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`, {
      ...json({ shiprocketPickupLocation: NICKNAME }),
      method: 'PATCH',
    })

    const written = recorder.updates(vendors)[0]?.values as Record<string, unknown>
    expect(written.shiprocketPickupLocation).toBe('Chobii Warehouse #2 (Andheri East)')
  })

  it('trims the surrounding whitespace a paste drags in', async () => {
    queueRows({
      'select:vendors': [[vendorRow]],
      'update:vendors': [[vendorRow]],
    })

    await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`, {
      ...json({ shiprocketPickupLocation: `  ${NICKNAME}  ` }),
      method: 'PATCH',
    })

    const written = recorder.updates(vendors)[0]?.values as Record<string, unknown>
    expect(written.shiprocketPickupLocation).toBe(NICKNAME)
  })

  it('stores null, never an empty string, when the field is cleared', async () => {
    // #670: an empty string satisfies `IS NOT NULL`, so "" would read as a
    // configured pickup location to anything that checks for one.
    queueRows({
      'select:vendors': [[vendorRow]],
      'update:vendors': [[vendorRow]],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`, {
      ...json({ shiprocketPickupLocation: '   ' }),
      method: 'PATCH',
    })
    expect(res.status).toBe(200)

    const written = recorder.updates(vendors)[0]?.values as Record<string, unknown>
    expect(written.shiprocketPickupLocation).toBeNull()
  })

  it('accepts an explicit null', async () => {
    queueRows({
      'select:vendors': [[vendorRow]],
      'update:vendors': [[vendorRow]],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`, {
      ...json({ shiprocketPickupLocation: null }),
      method: 'PATCH',
    })
    expect(res.status).toBe(200)

    const written = recorder.updates(vendors)[0]?.values as Record<string, unknown>
    expect(written.shiprocketPickupLocation).toBeNull()
  })

  it('refuses a nickname past the cap', async () => {
    // The column is unbounded `text` (pinned in
    // tests/database/vendor-shiprocket-pickup.test.ts), so this cap is ours and
    // cannot be exceeded by the storage. The dispatch review found a 100-char
    // zod cap over a varchar(64); the pairing is asserted on both sides so that
    // cannot recur here.
    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`, {
      ...json({ shiprocketPickupLocation: 'x'.repeat(201) }),
      method: 'PATCH',
    })
    expect(res.status).toBe(400)
  })

  it('accepts a nickname exactly at the cap', async () => {
    queueRows({
      'select:vendors': [[vendorRow]],
      'update:vendors': [[vendorRow]],
    })

    const res = await buildApp().request(`/api/admin/vendors/${VENDOR_ID}`, {
      ...json({ shiprocketPickupLocation: 'x'.repeat(200) }),
      method: 'PATCH',
    })
    expect(res.status).toBe(200)
  })

  it('is settable when a vendor is created', async () => {
    queueRows({ 'insert:vendors': [[{ ...vendorRow, shiprocketPickupLocation: NICKNAME }]] })

    const res = await buildApp().request('/api/admin/vendors', {
      ...json({ name: 'New Framer', shiprocketPickupLocation: NICKNAME }),
      method: 'POST',
    })
    expect(res.status).toBe(201)
  })
})
