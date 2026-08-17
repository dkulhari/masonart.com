/**
 * Admin vendor rate card API — effective-dated bands, overlap rejection, as-of
 * reads and role gating.
 *
 * Same harness as `tests/routes/admin/vendors.test.ts`: `src/database` is a
 * recording query builder (so what must be true *of the query* is asserted by
 * rendering the captured drizzle condition through `PgDialect`), and `src/auth`
 * is mocked so the REAL `requireAuth`/`requireAdmin` run.
 *
 * What this file is actually guarding, beyond CRUD:
 *
 * - An overlapping band is **422 with the conflicting row in the body**. A bare
 *   400 sends the admin hunting for which of their bands collided.
 * - A write **must not clobber a scheduled future rate**. Only the row in force
 *   at the new rate's start is closed; later rows survive and are reported in
 *   `warnings`.
 * - Closing sets `effectiveTo`. It never deletes — a historical job's amount
 *   has to stay explainable.
 *
 * @see packages/api/src/routes/admin/vendor-rates.ts
 * @see packages/api/src/lib/vendor-rates.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import '../../setup'

import type { RecordedQuery } from '../../helpers/query-recorder'
import { vendorRates } from '../../../src/database/schema/vendors'

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

import { adminVendorRatesApp } from '../../../src/routes/admin/vendor-rates'

// ============================================================================
// Helpers
// ============================================================================

const { queries, render, queueRows, ops } = recorder

function sessionFor(role: string) {
  const now = new Date()
  return {
    user: {
      id: 'admin-user-1',
      name: 'Admin User',
      email: 'admin@example.com',
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
      userId: 'admin-user-1',
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  }
}

function buildApp(): Hono {
  const app = new Hono()
  app.route('/api/admin/vendors', adminVendorRatesApp)
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    return c.json({ error: err.message }, 500)
  })
  return app
}

const VENDOR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const RATE_A = '44444444-4444-4444-8444-444444444444'
const RATE_B = '55555555-5555-4555-8555-555555555555'
const RATE_SCHEDULED = '66666666-6666-4666-8666-666666666666'

/** A row shaped the way drizzle hands one back: amount is a STRING. */
function rateRow(o: Partial<Record<string, unknown>> = {}) {
  return {
    id: RATE_A,
    vendorId: VENDOR_ID,
    kind: 'print',
    finish: null,
    longestEdgeMinInches: 0,
    longestEdgeMaxInches: 24,
    amount: '450.00',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    createdBy: 'admin-user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...o,
  }
}

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const ratesPath = `/api/admin/vendors/${VENDOR_ID}/rates`

beforeEach(() => {
  recorder.reset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('admin'))
})

// ============================================================================
// GET — the card as of an instant
// ============================================================================

describe('GET /api/admin/vendors/:id/rates', () => {
  it('returns the bands in force now, and echoes the instant it resolved at', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow()]],
    })

    const res = await buildApp().request(ratesPath)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.rates).toHaveLength(1)
    expect(body.rates[0].id).toBe(RATE_A)
    expect(typeof body.at).toBe('string')

    // An expired band is history: the default read filters on the window.
    const read = ops('select', vendorRates)[0]
    const { sql } = render(read?.where)
    expect(sql).toContain('"effective_from"')
    expect(sql).toContain('"effective_to"')
  })

  it('honours ?at= and resolves the card as of that instant', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ id: RATE_SCHEDULED, effectiveFrom: new Date('2026-09-01T00:00:00Z') })]],
    })

    const res = await buildApp().request(`${ratesPath}?at=2026-10-01T00:00:00.000Z`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.at).toBe('2026-10-01T00:00:00.000Z')

    // The instant the caller asked about is the one in the WHERE, not `now`.
    const read = ops('select', vendorRates)[0]
    const { params } = render(read?.where)
    expect(params.map(String).join('|')).toContain('2026-10-01')
  })

  it('rejects a nonsense ?at with 400', async () => {
    const res = await buildApp().request(`${ratesPath}?at=whenever`)
    expect(res.status).toBe(400)
  })

  it('returns expired bands too when asked, because a closed rate explains an old job', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [
        [rateRow({ id: RATE_B, effectiveTo: new Date('2026-02-01T00:00:00Z') }), rateRow()],
      ],
    })

    const res = await buildApp().request(`${ratesPath}?includeExpired=true`)
    expect(res.status).toBe(200)
    expect((await res.json()).rates).toHaveLength(2)

    // No window predicate at all — the whole history for the vendor.
    const read = ops('select', vendorRates)[0]
    expect(render(read?.where).sql).not.toContain('"effective_to"')
  })

  it('resolves one rate for a size through selectRateInForce', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [
        [
          rateRow({ id: RATE_A, longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: '450.00' }),
          rateRow({ id: RATE_B, longestEdgeMinInches: 24, longestEdgeMaxInches: 48, amount: '900.00' }),
        ],
      ],
    })

    const res = await buildApp().request(`${ratesPath}?kind=print&longestEdge=36`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.resolved.id).toBe(RATE_B)
    expect(body.resolved.amount).toBe('900.00')
  })

  it('takes the longest edge from width and height, either way round', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [
        [
          rateRow({ id: RATE_A, longestEdgeMinInches: 0, longestEdgeMaxInches: 24 }),
          rateRow({ id: RATE_B, longestEdgeMinInches: 24, longestEdgeMaxInches: 48 }),
        ],
      ],
    })

    const res = await buildApp().request(`${ratesPath}?kind=print&widthInches=36&heightInches=24`)
    expect(res.status).toBe(200)
    expect((await res.json()).resolved.id).toBe(RATE_B)
  })

  it('answers null — not zero — when the vendor has not priced that size', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ longestEdgeMinInches: 0, longestEdgeMaxInches: 24 })]],
    })

    const res = await buildApp().request(`${ratesPath}?kind=print&longestEdge=96`)
    expect(res.status).toBe(200)
    expect((await res.json()).resolved).toBeNull()
  })

  it('404s an unknown vendor and 400s a malformed id', async () => {
    queueRows({ 'select:vendors': [[]] })
    const missing = await buildApp().request(`/api/admin/vendors/${OTHER_ID}/rates`)
    expect(missing.status).toBe(404)

    const malformed = await buildApp().request('/api/admin/vendors/not-a-uuid/rates')
    expect(malformed.status).toBe(400)
  })
})

// ============================================================================
// POST — overlap rejection
// ============================================================================

describe('POST /api/admin/vendors/:id/rates', () => {
  it('creates a band and stores the amount as a two-decimal rupee string', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[]],
      'insert:vendor_rates': [[rateRow({ id: RATE_B, amount: '450.00' })]],
    })

    const res = await buildApp().request(
      ratesPath,
      json({ kind: 'print', longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: 450 })
    )
    expect(res.status).toBe(201)

    const inserted = ops('insert', vendorRates)[0]
    expect(inserted?.values).toMatchObject({
      vendorId: VENDOR_ID,
      kind: 'print',
      longestEdgeMinInches: 0,
      longestEdgeMaxInches: 24,
      // Rupees, never paise, and never a float.
      amount: '450.00',
      createdBy: 'admin-user-1',
    })
  })

  it('accepts a rupee string with paise', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[]],
      'insert:vendor_rates': [[rateRow({ amount: '450.50' })]],
    })

    const res = await buildApp().request(
      ratesPath,
      json({ kind: 'print', longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: '450.5' })
    )
    expect(res.status).toBe(201)
    expect(ops('insert', vendorRates)[0]?.values).toMatchObject({ amount: '450.50' })
  })

  it('rejects a negative amount and one with three decimals', async () => {
    queueRows({ 'select:vendors': [[{ id: VENDOR_ID }], [{ id: VENDOR_ID }]] })

    const negative = await buildApp().request(
      ratesPath,
      json({ kind: 'print', longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: -1 })
    )
    expect(negative.status).toBe(400)

    const tooPrecise = await buildApp().request(
      ratesPath,
      json({ kind: 'print', longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: '450.555' })
    )
    expect(tooPrecise.status).toBe(400)
  })

  it('rejects a band whose min is not below its max', async () => {
    const res = await buildApp().request(
      ratesPath,
      json({ kind: 'print', longestEdgeMinInches: 24, longestEdgeMaxInches: 24, amount: 450 })
    )
    expect(res.status).toBe(400)
  })

  it('rejects an overlapping band with 422 AND names the row it collided with', async () => {
    const existing = rateRow({ id: RATE_A, longestEdgeMinInches: 0, longestEdgeMaxInches: 24 })
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[existing]],
    })

    const res = await buildApp().request(
      ratesPath,
      json({ kind: 'print', longestEdgeMinInches: 12, longestEdgeMaxInches: 36, amount: 600 })
    )

    // 422, not 400: the payload is well-formed, it is the world that disagrees.
    expect(res.status).toBe(422)

    const body = await res.json()
    // WHICH band. Without this the admin has to go hunting.
    expect(body.conflict).toMatchObject({
      id: RATE_A,
      longestEdgeMinInches: 0,
      longestEdgeMaxInches: 24,
      amount: '450.00',
    })
    expect(body.error).toContain('0')
    expect(body.error).toContain('24')

    // And nothing was written.
    expect(queries.some((q) => q.op === 'insert' || q.op === 'update')).toBe(false)
  })

  it('allows an adjacent band — exclusive max means 24 does not collide with 0-24', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ longestEdgeMinInches: 0, longestEdgeMaxInches: 24 })]],
      'insert:vendor_rates': [[rateRow({ id: RATE_B, longestEdgeMinInches: 24, longestEdgeMaxInches: 48 })]],
    })

    const res = await buildApp().request(
      ratesPath,
      json({ kind: 'print', longestEdgeMinInches: 24, longestEdgeMaxInches: 48, amount: 900 })
    )
    expect(res.status).toBe(201)
  })

  it('does not treat another vendor kind as a conflict', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ kind: 'print', longestEdgeMinInches: 0, longestEdgeMaxInches: 24 })]],
      'insert:vendor_rates': [[rateRow({ id: RATE_B, kind: 'frame' })]],
    })

    const res = await buildApp().request(
      ratesPath,
      json({ kind: 'frame', longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: 300 })
    )
    expect(res.status).toBe(201)
  })

  // --------------------------------------------------------------------------
  // The scheduled-rate rule. wallet-config ends every open row on write;
  // shipping-config deliberately did not, and neither does this.
  // --------------------------------------------------------------------------

  it('closes only the row in force at the new start, and leaves a scheduled rate alone', async () => {
    const inForce = rateRow({
      id: RATE_A,
      amount: '450.00',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: new Date('2026-12-01T00:00:00Z'),
    })
    const scheduled = rateRow({
      id: RATE_SCHEDULED,
      amount: '700.00',
      effectiveFrom: new Date('2026-12-01T00:00:00Z'),
      effectiveTo: null,
    })

    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[inForce, scheduled]],
      'insert:vendor_rates': [[rateRow({ id: RATE_B, amount: '500.00' })]],
    })

    const res = await buildApp().request(
      ratesPath,
      json({
        kind: 'print',
        longestEdgeMinInches: 0,
        longestEdgeMaxInches: 24,
        amount: 500,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
      })
    )
    expect(res.status).toBe(201)

    // Exactly one row was closed, and it was the one in force — not the
    // scheduled one, and never by deletion.
    const updates = ops('update', vendorRates)
    expect(updates).toHaveLength(1)
    expect(updates[0]?.values).toMatchObject({
      effectiveTo: new Date('2026-09-01T00:00:00.000Z'),
    })
    const { params } = render(updates[0]?.where)
    expect(params).toContain(RATE_A)
    expect(params).not.toContain(RATE_SCHEDULED)
    expect(queries.some((q) => q.op === 'delete')).toBe(false)

    // The new row stops where the surviving scheduled one begins, so the card
    // never has two answers for one instant.
    expect(ops('insert', vendorRates)[0]?.values).toMatchObject({
      amount: '500.00',
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-12-01T00:00:00.000Z'),
    })

    // And the admin is TOLD their new rate has an expiry they did not set.
    const body = await res.json()
    expect(body.warnings).toHaveLength(1)
    expect(body.warnings[0]).toContain('2026-12-01')
    expect(body.superseded).toMatchObject({ id: RATE_A })
  })

  it('re-pricing the same band with no scheduled rate leaves the new row open-ended', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ id: RATE_A, effectiveTo: null })]],
      'insert:vendor_rates': [[rateRow({ id: RATE_B, amount: '500.00' })]],
    })

    const res = await buildApp().request(
      ratesPath,
      json({
        kind: 'print',
        longestEdgeMinInches: 0,
        longestEdgeMaxInches: 24,
        amount: 500,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
      })
    )
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.warnings).toEqual([])
    expect(ops('insert', vendorRates)[0]?.values).toMatchObject({ effectiveTo: null })
    expect(ops('update', vendorRates)).toHaveLength(1)
  })

  it('404s when the vendor does not exist, without reading or writing rates', async () => {
    queueRows({ 'select:vendors': [[]] })

    const res = await buildApp().request(
      `/api/admin/vendors/${OTHER_ID}/rates`,
      json({ kind: 'print', longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: 450 })
    )
    expect(res.status).toBe(404)
    expect(queries.some((q) => q.op === 'insert')).toBe(false)
  })
})

// ============================================================================
// PATCH — an edit is checked for overlap too
// ============================================================================

describe('PATCH /api/admin/vendors/:id/rates/:rateId', () => {
  it('updates the amount of an existing band', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ id: RATE_A })]],
      'update:vendor_rates': [[rateRow({ id: RATE_A, amount: '500.00' })]],
    })

    const res = await buildApp().request(
      `${ratesPath}/${RATE_A}`,
      json({ amount: 500 }, 'PATCH')
    )
    expect(res.status).toBe(200)
    expect((await res.json()).rate.amount).toBe('500.00')
    expect(ops('update', vendorRates)[0]?.values).toMatchObject({ amount: '500.00' })
  })

  it('does not report the row being edited as its own conflict', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ id: RATE_A })]],
      'update:vendor_rates': [[rateRow({ id: RATE_A, amount: '500.00' })]],
    })

    const res = await buildApp().request(
      `${ratesPath}/${RATE_A}`,
      json({ longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: 500 }, 'PATCH')
    )
    expect(res.status).toBe(200)
  })

  it('422s an edit that widens a band into its neighbour, naming the neighbour', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [
        [
          rateRow({ id: RATE_A, longestEdgeMinInches: 0, longestEdgeMaxInches: 24 }),
          rateRow({ id: RATE_B, longestEdgeMinInches: 24, longestEdgeMaxInches: 48, amount: '900.00' }),
        ],
      ],
    })

    const res = await buildApp().request(
      `${ratesPath}/${RATE_A}`,
      json({ longestEdgeMaxInches: 36 }, 'PATCH')
    )
    expect(res.status).toBe(422)

    const body = await res.json()
    expect(body.conflict).toMatchObject({
      id: RATE_B,
      longestEdgeMinInches: 24,
      longestEdgeMaxInches: 48,
    })
    expect(queries.some((q) => q.op === 'update')).toBe(false)
  })

  it('404s a rate id that is not this vendor’s', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ id: RATE_A })]],
    })

    const res = await buildApp().request(`${ratesPath}/${RATE_B}`, json({ amount: 500 }, 'PATCH'))
    expect(res.status).toBe(404)
  })

  it('400s an empty patch body', async () => {
    const res = await buildApp().request(`${ratesPath}/${RATE_A}`, json({}, 'PATCH'))
    expect(res.status).toBe(400)
  })
})

// ============================================================================
// Close — never delete
// ============================================================================

describe('POST /api/admin/vendors/:id/rates/:rateId/close', () => {
  it('sets effectiveTo and does not delete the row', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ id: RATE_A })]],
      'update:vendor_rates': [[rateRow({ id: RATE_A, effectiveTo: new Date('2026-08-17T00:00:00Z') })]],
    })

    const res = await buildApp().request(`${ratesPath}/${RATE_A}/close`, json({}))
    expect(res.status).toBe(200)

    const updated = ops('update', vendorRates)[0]
    expect((updated?.values as { effectiveTo?: unknown })?.effectiveTo).toBeInstanceOf(Date)

    // A deleted rate makes an old job's amount unexplainable. Never delete.
    expect(queries.some((q) => q.op === 'delete')).toBe(false)
  })

  it('honours an explicit effectiveTo', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[rateRow({ id: RATE_A })]],
      'update:vendor_rates': [[rateRow({ id: RATE_A, effectiveTo: new Date('2026-10-01T00:00:00Z') })]],
    })

    const res = await buildApp().request(
      `${ratesPath}/${RATE_A}/close`,
      json({ effectiveTo: '2026-10-01T00:00:00.000Z' })
    )
    expect(res.status).toBe(200)
    expect(ops('update', vendorRates)[0]?.values).toMatchObject({
      effectiveTo: new Date('2026-10-01T00:00:00.000Z'),
    })
  })

  it('refuses to close a rate before it starts', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [
        [rateRow({ id: RATE_A, effectiveFrom: new Date('2026-09-01T00:00:00Z') })],
      ],
    })

    const res = await buildApp().request(
      `${ratesPath}/${RATE_A}/close`,
      json({ effectiveTo: '2026-08-01T00:00:00.000Z' })
    )
    expect(res.status).toBe(422)
    expect(queries.some((q) => q.op === 'update')).toBe(false)
  })

  it('404s an unknown rate', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[]],
    })

    const res = await buildApp().request(`${ratesPath}/${RATE_B}/close`, json({}))
    expect(res.status).toBe(404)
  })

  it('exposes no DELETE route for a rate at all', async () => {
    const res = await buildApp().request(`${ratesPath}/${RATE_A}`, { method: 'DELETE' })
    expect(res.status).toBe(404)
    expect(queries.some((q) => q.op === 'delete')).toBe(false)
  })
})

// ============================================================================
// Role gating — a rate card is what we buy at, i.e. finance data
// ============================================================================

describe('role gating', () => {
  const routes: Array<[string, RequestInit]> = [
    [ratesPath, {}],
    [ratesPath, json({ kind: 'print', longestEdgeMinInches: 0, longestEdgeMaxInches: 24, amount: 450 })],
    [`${ratesPath}/${RATE_A}`, json({ amount: 500 }, 'PATCH')],
    [`${ratesPath}/${RATE_A}/close`, json({})],
  ]

  it.each(routes)('403s a content-manager on %s %#', async (path, init) => {
    mockGetSession.mockResolvedValue(sessionFor('content-manager'))

    const res = await buildApp().request(path, init)
    expect(res.status).toBe(403)
    expect(queries).toHaveLength(0)
  })

  it('403s a vendor-role user — a vendor does not read its own card here', async () => {
    mockGetSession.mockResolvedValue(sessionFor('vendor'))

    const res = await buildApp().request(ratesPath)
    expect(res.status).toBe(403)
  })

  it('401s an unauthenticated caller', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await buildApp().request(ratesPath)
    expect(res.status).toBe(401)
  })

  it('allows a super-admin', async () => {
    mockGetSession.mockResolvedValue(sessionFor('super-admin'))
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:vendor_rates': [[]],
    })

    const res = await buildApp().request(ratesPath)
    expect(res.status).toBe(200)
  })
})

// ============================================================================
// Module shape
// ============================================================================

describe('module exports', () => {
  it('exports the Hono app under both names', async () => {
    const mod = await import('../../../src/routes/admin/vendor-rates')
    expect(mod.adminVendorRatesApp).toBeDefined()
    expect(mod.default).toBe(mod.adminVendorRatesApp)
  })

  it('is mounted on the server under the vendors prefix', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../src/index.ts', import.meta.url), 'utf8')
    )
    expect(source).toContain('app.route("/api/admin/vendors", adminVendorRatesApp)')
  })
})
