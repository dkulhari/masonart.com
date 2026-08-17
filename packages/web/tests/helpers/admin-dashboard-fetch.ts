/**
 * The dashboard's three network calls, stubbed one at a time.
 *
 * Both dashboard suites exist to prove the same rule from opposite ends: a zero
 * on /admin must mean the database said zero. Testing that needs a `fetch` that
 * can kill exactly one endpoint while the others answer normally — a blanket
 * failure would not tell a laundered zero apart from a screen that never
 * loaded.
 *
 * @see packages/web/tests/routes/admin/dashboard-order-stats.test.tsx
 * @see packages/web/tests/routes/admin/dashboard-product-stats.test.tsx
 */

import { vi } from 'vitest'

export const ORDER_STATS = {
  byStatus: { pending: 2, delivered: 3 },
  byPaymentStatus: { paid: 4 },
  totalRevenue: '10000.00',
  todayOrders: 1,
  monthRevenue: '5000.00',
}

export const PRODUCT_STATS = {
  totalProducts: 42,
  activeProducts: 36,
  lowStockProducts: 4,
  outOfStockProducts: 2,
}

export type RouteAnswer = { ok: boolean; body: unknown }

export interface DashboardAnswers {
  orderStats?: RouteAnswer
  productStats?: RouteAnswer
  orders?: RouteAnswer
}

/** Route `fetch` by URL. Anything not named answers as the recent-orders list. */
export function mockDashboardFetch(answers: DashboardAnswers) {
  const respond = (answer: RouteAnswer) =>
    Promise.resolve({
      ok: answer.ok,
      status: answer.ok ? 200 : 500,
      json: () => Promise.resolve(answer.body),
    } as Response)

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/admin/products/stats')) {
        return respond(answers.productStats ?? { ok: true, body: PRODUCT_STATS })
      }
      if (url.includes('/api/admin/orders/stats')) {
        return respond(answers.orderStats ?? { ok: true, body: ORDER_STATS })
      }
      return respond(answers.orders ?? { ok: true, body: { items: [] } })
    })
  )
}
