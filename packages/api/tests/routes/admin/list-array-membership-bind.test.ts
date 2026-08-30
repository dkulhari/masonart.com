/**
 * The `= ANY()` bind that 500s three admin list endpoints (#624).
 *
 * `sql`${users.id} = ANY(${userIds})`` does not bind the array as an array. It
 * interpolates one parameter per element inside the parentheses, so the query
 * Postgres receives is
 *
 *     "user"."id" = ANY(($1, $2, $3))
 *
 * — ANY over a row expression, which Postgres rejects with `op ANY/ALL (array)
 * requires array on right side`. The endpoint 500s the moment the list it just
 * fetched contains a single row with a userId, which is to say: as soon as
 * anyone uses it. `inArray` renders `"user"."id" in ($1, $2, $3)` instead.
 *
 * It was found in `/api/admin/orders` while building the vendor E2E spec and
 * fixed there in 9fe39902; returns, shipments and reviews still carried it.
 *
 * ## Why this asserts rendered SQL rather than a live 500
 *
 * `src/database` is the recording query builder these admin suites use — it
 * captures conditions but executes nothing, so a mock cannot reproduce
 * Postgres's complaint. What it CAN do is hand back the exact drizzle condition
 * the handler built, which `PgDialect` renders to the exact string Postgres
 * would have been sent. Asserting on that string is a real assertion about real
 * SQL: reintroduce the `ANY()` form in any of these routers and the render
 * changes back to the row-expression, and these fail.
 *
 * Orders is included as the control. It is already fixed, so it must be green
 * before and after — proof the assertion distinguishes the two forms rather
 * than merely rejecting everything.
 *
 * @see packages/api/src/routes/admin/orders.ts — the corrected form
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import '../../setup'

import { users } from '../../../src/database/schema/users'
import { products } from '../../../src/database/schema/products'

// ============================================================================
// Recording database mock
// ============================================================================

interface RecordedQuery {
  op: 'select' | 'insert' | 'update' | 'delete'
  table: string | null
  where?: unknown
}

const queries: RecordedQuery[] = []
/** Rows to hand back, keyed `select:<table>`, consumed in call order. */
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
  return queue && queue.length > 0 ? (queue.shift() as unknown[]) : []
}

function builder(op: RecordedQuery['op'], table?: unknown) {
  const rec: RecordedQuery = { op, table: table === undefined ? null : tableName(table) }
  queries.push(rec)

  const chain = {
    from(t: unknown) {
      rec.table = tableName(t)
      return chain
    },
    leftJoin: () => chain,
    innerJoin: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    returning: () => chain,
    where(w: unknown) {
      rec.where = w
      return chain
    },
    limit: () => chain,
    offset: () => chain,
    set: () => chain,
    values: () => chain,
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(nextRows(rec)).then(resolve, reject)
    },
  }

  return chain
}

vi.mock('../../../src/database', () => ({
  db: {
    select: () => builder('select'),
    insert: (t: unknown) => builder('insert', t),
    update: (t: unknown) => builder('update', t),
    delete: (t: unknown) => builder('delete', t),
  },
}))

const mockGetSession = vi.fn()

vi.mock('../../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}))

import { adminReturnsApp } from '../../../src/routes/admin/returns'
import { adminShipmentsApp } from '../../../src/routes/admin/shipments'
import { adminReviewsApp } from '../../../src/routes/admin/reviews'
import { adminOrdersApp } from '../../../src/routes/admin/orders'

// ============================================================================
// Helpers
// ============================================================================

const dialect = new PgDialect()

function render(condition: unknown): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(condition as SQL)
  return { sql: query.sql, params: query.params as unknown[] }
}

/**
 * The assertion this whole file exists for.
 *
 * Postgres accepts `col = ANY($1)` where $1 is an array, and `col IN ($1, $2)`
 * where each is a scalar. What it refuses is `col = ANY(($1, $2))` — ANY over a
 * row constructor. The check is on the rendered shape, not on which drizzle
 * helper produced it, so any binding that reaches Postgres intact passes.
 */
function expectBindsArrayMembership(
  where: unknown,
  ids: string[],
  what: string
): void {
  expect(where, `${what}: no WHERE clause was captured`).toBeDefined()
  const { sql, params } = render(where)

  expect(
    sql,
    `${what}: rendered as ANY() over a row expression — Postgres answers "op ANY/ALL (array) requires array on right side" and the endpoint 500s. Rendered: ${sql}`
  ).not.toMatch(/any\s*\(\s*\(/i)

  expect(sql, `${what}: rendered ${sql}`).toMatch(/\bin\s*\(/i)
  expect(params, `${what}: bound the wrong ids`).toEqual(ids)
}

function lookupWhere(table: unknown): unknown {
  const name = tableName(table)
  const rec = queries.find((q) => q.op === 'select' && q.table === name)
  return rec?.where
}

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

function buildApp<E extends Env>(path: string, router: Hono<E>): Hono {
  const app = new Hono()
  app.route(path, router as never)
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    return c.json({ error: err.message }, 500)
  })
  return app
}

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const PRODUCT_A = '33333333-3333-4333-8333-333333333333'
const ORDER_ID = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  queries.length = 0
  rowQueues.clear()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(sessionFor('admin'))
})

// ============================================================================
// Tests
// ============================================================================

describe('admin list endpoints bind their id arrays so Postgres accepts them', () => {
  it('GET /api/admin/returns looks up customers without an ANY() row expression', async () => {
    rowQueues.set('select:return_requests', [
      [{ count: 2 }],
      [
        { id: 'r1', orderId: ORDER_ID, userId: USER_A, order: { id: ORDER_ID } },
        { id: 'r2', orderId: ORDER_ID, userId: USER_B, order: { id: ORDER_ID } },
      ],
    ])
    rowQueues.set('select:user', [
      [{ id: USER_A, name: 'A', email: 'a@example.com' }],
    ])

    const res = await buildApp('/api/admin/returns', adminReturnsApp).request(
      '/api/admin/returns'
    )

    expect(res.status).toBe(200)
    expectBindsArrayMembership(lookupWhere(users), [USER_A, USER_B], 'returns customer lookup')
  })

  it('GET /api/admin/shipments looks up customers without an ANY() row expression', async () => {
    rowQueues.set('select:order_shipments', [
      [{ count: 2 }],
      [
        { id: 's1', orderId: ORDER_ID, order: { id: ORDER_ID, userId: USER_A } },
        { id: 's2', orderId: ORDER_ID, order: { id: ORDER_ID, userId: USER_B } },
      ],
    ])
    rowQueues.set('select:user', [
      [{ id: USER_A, name: 'A', email: 'a@example.com' }],
    ])

    const res = await buildApp('/api/admin/shipments', adminShipmentsApp).request(
      '/api/admin/shipments'
    )

    expect(res.status).toBe(200)
    expectBindsArrayMembership(lookupWhere(users), [USER_A, USER_B], 'shipments customer lookup')
  })

  it('GET /api/admin/reviews looks up products without an ANY() row expression', async () => {
    rowQueues.set('select:reviews', [
      [{ count: 1 }],
      [{ id: 'rev1', productId: PRODUCT_A, userId: USER_A, author: { id: USER_A } }],
    ])
    rowQueues.set('select:products', [
      [{ id: PRODUCT_A, title: 'Poster', slug: 'poster' }],
    ])

    const res = await buildApp('/api/admin/reviews', adminReviewsApp).request(
      '/api/admin/reviews'
    )

    expect(res.status).toBe(200)
    expectBindsArrayMembership(lookupWhere(products), [PRODUCT_A], 'reviews product lookup')
  })

  it('GET /api/admin/orders stays fixed — the control for this assertion', async () => {
    // Already corrected in 9fe39902. Green before and after, which is what
    // makes the three failures above mean something.
    rowQueues.set('select:orders', [
      [{ count: 1 }],
      [{ id: ORDER_ID, userId: USER_A, orderNumber: 'MA-2024-000001' }],
    ])
    rowQueues.set('select:user', [
      [{ id: USER_A, name: 'A', email: 'a@example.com' }],
    ])

    const res = await buildApp('/api/admin/orders', adminOrdersApp).request(
      '/api/admin/orders'
    )

    expect(res.status).toBe(200)
    expectBindsArrayMembership(lookupWhere(users), [USER_A], 'orders customer lookup')
  })
})
