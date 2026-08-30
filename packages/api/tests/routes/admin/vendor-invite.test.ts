/**
 * The vendor account invite.
 *
 * Vendors cannot self-register: this endpoint is the ONLY path to a vendor
 * login, so the tests here are mostly about what it refuses.
 *
 * `src/database` is the same recording query builder used by
 * `tests/routes/admin/vendors.test.ts`, extended with `db.transaction`, and
 * `src/auth` is stubbed — including `signUpEmail`, because the account must be
 * minted through Better Auth's own path rather than hand-inserted into the
 * `user` table (a row missing what Better Auth expects is an account that
 * cannot sign in).
 *
 * The account and the `vendor_users` link are one unit. A user with role
 * `vendor` and no link is refused by `requireVendor` — an account that can log
 * in and do nothing, indistinguishable from a broken guard — so the failure
 * test asserts the compensating cleanup, not just the error code.
 *
 * @see packages/api/src/routes/admin/vendor-invite.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import '../../setup'

// ============================================================================
// Recording database mock
// ============================================================================

interface RecordedQuery {
  op: 'select' | 'insert' | 'update' | 'delete'
  table: string | null
  on: 'db' | 'tx'
  where?: unknown
  values?: unknown
}

const queries: RecordedQuery[] = []
const rowQueues = new Map<string, unknown[][]>()
/** `op:table` → the error that call rejects with, once. */
const failNext = new Map<string, Error>()

function tableName(table: unknown): string {
  try {
    return getTableConfig(table as never).name
  } catch {
    return 'unknown'
  }
}

function nextRows(rec: RecordedQuery): unknown[] {
  const queue = rowQueues.get(`${rec.op}:${rec.table}`)
  return queue && queue.length > 0 ? (queue.shift() as unknown[]) : []
}

function builder(on: 'db' | 'tx', op: RecordedQuery['op'], arg?: unknown) {
  const rec: RecordedQuery =
    op === 'select' ? { op, on, table: null } : { op, on, table: tableName(arg) }
  queries.push(rec)

  const chain = {
    from(t: unknown) {
      rec.table = tableName(t)
      return chain
    },
    leftJoin: () => chain,
    innerJoin: () => chain,
    orderBy: () => chain,
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
      const key = `${rec.op}:${rec.table}`
      const failure = failNext.get(key)
      if (failure) {
        failNext.delete(key)
        return Promise.reject(failure).then(resolve, reject)
      }
      return Promise.resolve(nextRows(rec)).then(resolve, reject)
    },
  }

  return chain
}

function handle(on: 'db' | 'tx') {
  return {
    select: (fields?: unknown) => builder(on, 'select', fields),
    insert: (t: unknown) => builder(on, 'insert', t),
    update: (t: unknown) => builder(on, 'update', t),
    delete: (t: unknown) => builder(on, 'delete', t),
  }
}

vi.mock('../../../src/database', () => ({
  db: {
    select: (fields?: unknown) => builder('db', 'select', fields),
    insert: (t: unknown) => builder('db', 'insert', t),
    update: (t: unknown) => builder('db', 'update', t),
    delete: (t: unknown) => builder('db', 'delete', t),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(handle('tx')),
  },
}))

const mockGetSession = vi.fn()
const mockSignUpEmail = vi.fn()
const mockRequestPasswordReset = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signUpEmail: (...args: unknown[]) => mockSignUpEmail(...args),
      requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
    },
  },
}))

import { adminVendorInviteApp } from '../../../src/routes/admin/vendor-invite'
import { requireAuth } from '../../../src/middleware/auth'
import { requireVendor } from '../../../src/middleware/vendor'
import { readJson } from '../../helpers/json'

// ============================================================================
// Helpers
// ============================================================================

const dialect = new PgDialect()

function render(condition: unknown): { sql: string; params: unknown[] } {
  if (!condition) return { sql: '', params: [] }
  const query = dialect.sqlToQuery(condition as SQL)
  return { sql: query.sql, params: query.params as unknown[] }
}

function queueRows(rows: Record<string, unknown[][]>) {
  for (const [key, batches] of Object.entries(rows)) {
    rowQueues.set(key, batches.map((b) => [...b]))
  }
}

function sessionFor(role: string, id = 'admin-user-1') {
  const now = new Date()
  return {
    user: {
      id,
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
      userId: id,
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  }
}

function buildApp(): Hono {
  const app = new Hono()
  app.route('/api/admin/vendors', adminVendorInviteApp)
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    return c.json({ error: err.message }, 500)
  })
  return app
}

const VENDOR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_VENDOR_ID = '22222222-2222-4222-8222-222222222222'
const NEW_USER_ID = 'user_new_1'

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const invite = (body: unknown = { email: 'shop@printworks.test', name: 'Chennai Print Works' }) =>
  buildApp().request(`/api/admin/vendors/${VENDOR_ID}/invite`, json(body))

beforeEach(() => {
  queries.length = 0
  rowQueues.clear()
  failNext.clear()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('admin'))
  mockSignUpEmail.mockReset()
  mockSignUpEmail.mockResolvedValue({
    user: { id: NEW_USER_ID, email: 'shop@printworks.test', name: 'Chennai Print Works' },
  })
  mockRequestPasswordReset.mockReset()
  mockRequestPasswordReset.mockResolvedValue({ status: true })
})

// ============================================================================
// The happy path: one account, one link, one transaction
// ============================================================================

describe('POST /api/admin/vendors/:id/invite', () => {
  it('mints a role=vendor account AND the vendor_users link together', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID, name: 'Chennai Print Works' }]],
      'select:user': [[]],
      'update:user': [[{ id: NEW_USER_ID, email: 'shop@printworks.test', role: 'vendor' }]],
      'insert:vendor_users': [[{ id: 'link-1', vendorId: VENDOR_ID, userId: NEW_USER_ID }]],
    })

    const res = await invite()
    expect(res.status).toBe(201)

    const body = await readJson(res)
    expect(body.user).toMatchObject({ id: NEW_USER_ID, role: 'vendor' })
    expect(body.created).toBe(true)

    // Through Better Auth, not a hand-rolled INSERT into `user`: the account
    // row has expectations (hashed credential row, ids) this route must not
    // reinvent.
    expect(mockSignUpEmail).toHaveBeenCalledTimes(1)
    const signUpArg = mockSignUpEmail.mock.calls[0][0] as { body: { email: string; password: string } }
    expect(signUpArg.body.email).toBe('shop@printworks.test')
    expect(signUpArg.body.password.length).toBeGreaterThanOrEqual(16)
    expect(queries.some((q) => q.op === 'insert' && q.table === 'user')).toBe(false)

    // Role promotion and link, both on `tx`.
    const roleUpdate = queries.find((q) => q.op === 'update' && q.table === 'user')
    expect(roleUpdate?.on).toBe('tx')
    expect(roleUpdate?.values).toMatchObject({ role: 'vendor' })

    const link = queries.find((q) => q.op === 'insert' && q.table === 'vendor_users')
    expect(link?.on).toBe('tx')
    expect(link?.values).toMatchObject({ vendorId: VENDOR_ID, userId: NEW_USER_ID })

    expect(queries.filter((q) => q.on === 'tx').map((q) => `${q.op}:${q.table}`)).toEqual([
      'update:user',
      'insert:vendor_users',
    ])
  })

  it('sends the set-a-password mail, and does not fail the invite if that mail fails', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:user': [[]],
      'update:user': [[{ id: NEW_USER_ID, email: 'shop@printworks.test', role: 'vendor' }]],
      'insert:vendor_users': [[{ id: 'link-1', vendorId: VENDOR_ID, userId: NEW_USER_ID }]],
    })

    const ok = await invite()
    expect(ok.status).toBe(201)
    expect((await readJson(ok)).passwordResetSent).toBe(true)
    expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1)

    // The account and the link are already committed when the mail is
    // attempted. Failing the request here would tell the admin to retry, and
    // the retry would answer 409 — worse than an un-sent email they can
    // re-trigger.
    queries.length = 0
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:user': [[]],
      'update:user': [[{ id: NEW_USER_ID, email: 'shop@printworks.test', role: 'vendor' }]],
      'insert:vendor_users': [[{ id: 'link-1', vendorId: VENDOR_ID, userId: NEW_USER_ID }]],
    })
    mockRequestPasswordReset.mockRejectedValueOnce(new Error('SMTP down'))

    const stillOk = await invite()
    expect(stillOk.status).toBe(201)
    expect((await readJson(stillOk)).passwordResetSent).toBe(false)
    expect(queries.some((q) => q.op === 'delete')).toBe(false)
  })

  it('links an existing unlinked vendor-role account without creating a second one', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:user': [[{ id: 'user_existing', email: 'shop@printworks.test', role: 'vendor' }]],
      'select:vendor_users': [[]],
      'insert:vendor_users': [[{ id: 'link-2', vendorId: VENDOR_ID, userId: 'user_existing' }]],
    })

    const res = await invite()
    expect(res.status).toBe(201)

    const body = await readJson(res)
    expect(body.created).toBe(false)
    expect(body.user.id).toBe('user_existing')
    expect(mockSignUpEmail).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Refusals
// ============================================================================

describe('invite refusals', () => {
  it('leaves no orphan account when the link insert fails', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:user': [[]],
      'update:user': [[{ id: NEW_USER_ID, email: 'shop@printworks.test', role: 'vendor' }]],
    })
    failNext.set('insert:vendor_users', new Error('link insert exploded'))

    const res = await invite()
    expect(res.status).toBeGreaterThanOrEqual(400)

    // A vendor-role user with no link can sign in and do nothing at all. The
    // account is removed rather than left as a puzzle.
    const cleanup = queries.find((q) => q.op === 'delete' && q.table === 'user')
    expect(cleanup).toBeDefined()
    expect(render(cleanup?.where).params).toContain(NEW_USER_ID)
  })

  it('reports why the INVITE failed even when the cleanup delete also fails', async () => {
    // The compensating delete runs outside the transaction. If it throws, the
    // caller must still be told the real cause — an unrelated cleanup error
    // masking a UNIQUE violation turns a clear 422 into an opaque 500, and the
    // admin then has no idea the email is already linked to another vendor.
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:user': [[]],
      'update:user': [[{ id: NEW_USER_ID, email: 'shop@printworks.test', role: 'vendor' }]],
    })
    const uniqueViolation = Object.assign(new Error('duplicate key value'), { code: '23505' })
    failNext.set('insert:vendor_users', uniqueViolation)
    failNext.set('delete:user', new Error('cleanup delete exploded'))

    const res = await invite()

    expect(res.status).toBe(422)
    expect((await readJson(res)).error).toMatch(/already linked to a vendor/i)
  })

  it('does NOT silently convert an existing customer account', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:user': [[{ id: 'user_customer', email: 'shop@printworks.test', role: 'customer' }]],
    })

    const res = await invite()
    expect(res.status).toBe(409)
    expect((await readJson(res)).error).toMatch(/already/i)

    // No signup, no role change, no link. Promoting a shopper's account to a
    // vendor login is a silent privilege change against a real person.
    expect(mockSignUpEmail).not.toHaveBeenCalled()
    expect(queries.some((q) => q.op === 'update' || q.op === 'insert')).toBe(false)
  })

  it('422s a user already linked to another vendor, not a 500 from UNIQUE(user_id)', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:user': [[{ id: 'user_existing', email: 'shop@printworks.test', role: 'vendor' }]],
      'select:vendor_users': [[{ id: 'link-9', vendorId: OTHER_VENDOR_ID, userId: 'user_existing' }]],
    })

    const res = await invite()
    expect(res.status).toBe(422)
    expect((await readJson(res)).error).toMatch(/vendor/i)
    expect(queries.some((q) => q.op === 'insert')).toBe(false)
  })

  it('422s rather than 500s when the UNIQUE(user_id) constraint fires anyway', async () => {
    queueRows({
      'select:vendors': [[{ id: VENDOR_ID }]],
      'select:user': [[{ id: 'user_existing', email: 'shop@printworks.test', role: 'vendor' }]],
      'select:vendor_users': [[]],
    })
    const unique = new Error('duplicate key value violates unique constraint') as Error & {
      cause?: { code: string }
    }
    unique.cause = { code: '23505' }
    failNext.set('insert:vendor_users', unique)

    const res = await invite()
    expect(res.status).toBe(422)
  })

  it('404s an unknown vendor and 400s a bad email', async () => {
    queueRows({ 'select:vendors': [[]] })
    const missing = await buildApp().request(
      `/api/admin/vendors/${OTHER_VENDOR_ID}/invite`,
      json({ email: 'shop@printworks.test' })
    )
    expect(missing.status).toBe(404)
    expect(mockSignUpEmail).not.toHaveBeenCalled()

    const bad = await invite({ email: 'not-an-email' })
    expect(bad.status).toBe(400)
  })
})

// ============================================================================
// Vendors cannot self-register
// ============================================================================

describe('there is no unauthenticated path to a vendor login', () => {
  it('401s without a session', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await invite()
    expect(res.status).toBe(401)
    expect(queries).toHaveLength(0)
    expect(mockSignUpEmail).not.toHaveBeenCalled()
  })

  it.each(['customer', 'content-manager', 'trade', 'vendor'])('403s a %s', async (role) => {
    mockGetSession.mockResolvedValue(sessionFor(role))

    const res = await invite()
    expect(res.status).toBe(403)
    expect(queries).toHaveLength(0)
    expect(mockSignUpEmail).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Suspension: one mechanism, the one that already exists
// ============================================================================

describe('suspending the vendor suspends its logins', () => {
  /** A vendor-facing route, gated exactly as the real ones are. */
  function vendorApp(): Hono {
    const app = new Hono()
    app.use('/api/vendor/*', requireAuth, requireVendor)
    app.get('/api/vendor/jobs', (c) => c.json({ ok: true }))
    app.onError((err, c) => {
      if (err instanceof HTTPException) return err.getResponse()
      return c.json({ error: err.message }, 500)
    })
    return app
  }

  it('403s the invited user once the vendor is suspended — via requireVendor', async () => {
    mockGetSession.mockResolvedValue(sessionFor('vendor', NEW_USER_ID))
    queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'suspended' }]] })

    const res = await vendorApp().request('/api/vendor/jobs')
    expect(res.status).toBe(403)
    expect((await readJson(res)).message).toMatch(/not active/i)
  })

  it('lets the same user through while the vendor is active', async () => {
    mockGetSession.mockResolvedValue(sessionFor('vendor', NEW_USER_ID))
    queueRows({ 'select:vendor_users': [[{ vendorId: VENDOR_ID, status: 'active' }]] })

    const res = await vendorApp().request('/api/vendor/jobs')
    expect(res.status).toBe(200)
  })
})

// ============================================================================
// Module shape
// ============================================================================

describe('module exports', () => {
  it('exports the Hono app under both names', async () => {
    const mod = await import('../../../src/routes/admin/vendor-invite')
    expect(mod.adminVendorInviteApp).toBeDefined()
    expect(mod.default).toBe(mod.adminVendorInviteApp)
  })

  it('is mounted on the server at /api/admin/vendors', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../src/index.ts', import.meta.url), 'utf8')
    )
    expect(source).toContain('app.route("/api/admin/vendors", adminVendorInviteApp)')
  })
})
