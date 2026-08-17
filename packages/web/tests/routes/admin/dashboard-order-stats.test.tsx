/**
 * /admin — the order half of what the dashboard says when it does not know
 * (#606, sibling of #602).
 *
 * `fetchOrderStats()` throws on a bad response, but the dashboard caught it and
 * fed `null` through `?? 0` / `|| 0`, so a dead endpoint rendered ₹0.00 total
 * revenue, ₹0.00 this month, 0 orders today and 0 pending. Revenue is the worst
 * tile on the screen to be confidently wrong about: an operator cannot tell a
 * 5xx apart from a dead trading day.
 *
 * The rule this pins: a zero on this screen must mean the database said zero.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  Link: ({ children, ...props }: { children: React.ReactNode; to?: string }) => (
    <a href={props.to}>{children}</a>
  ),
}))

import AdminDashboard from '~/routes/admin/index'

const ORDER_STATS = {
  byStatus: { pending: 2, delivered: 3 },
  byPaymentStatus: { paid: 4 },
  totalRevenue: '10000.00',
  todayOrders: 1,
  monthRevenue: '5000.00',
}

const PRODUCT_STATS = {
  totalProducts: 42,
  activeProducts: 36,
  lowStockProducts: 4,
  outOfStockProducts: 2,
}

type RouteAnswer = { ok: boolean; body: unknown }

/** Route `fetch` by URL so the orders call can die while the rest answer. */
function mockFetch(answers: {
  orderStats?: RouteAnswer
  productStats?: RouteAnswer
  orders?: RouteAnswer
}) {
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

/** The card wrapper for a tile, found from its title text. */
function tileFor(title: string): HTMLElement {
  const heading = screen.getByText(title)
  const tile = heading.closest('div')
  expect(tile).not.toBeNull()
  return tile as HTMLElement
}

const ORDER_FED_TILES = [
  'Total Revenue',
  'This Month',
  "Today's Orders",
  'Pending Orders',
  'Total Orders',
  'Paid Orders',
]

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('admin dashboard order stats', () => {
  it('renders the real figures when the stats endpoint answers', async () => {
    mockFetch({})

    render(<AdminDashboard />)

    // todayOrders: 1, pending 2 + delivered 3 = 5 total, paid 4.
    await waitFor(() => {
      expect(tileFor("Today's Orders")).toHaveTextContent('1')
    })
    expect(tileFor('Total Orders')).toHaveTextContent('5')
    expect(tileFor('Paid Orders')).toHaveTextContent('4')
    expect(tileFor('Total Revenue')).toHaveTextContent(/10,000/)
  })

  it('surfaces an error when the order stats call fails', async () => {
    mockFetch({ orderStats: { ok: false, body: { error: 'boom' } } })

    render(<AdminDashboard />)

    // Any operator-visible admission that the screen is incomplete, naming the
    // half that is missing. Wording is the component's; presence is not
    // optional.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/order/i)
  })

  it.each(ORDER_FED_TILES)(
    'does not render a fabricated zero in the %s tile when the call fails',
    async (title) => {
      mockFetch({ orderStats: { ok: false, body: { error: 'boom' } } })

      render(<AdminDashboard />)

      await screen.findByRole('alert')

      // The tile still exists — it just must not claim a number it never got.
      // `formatPrice(0)` is the dangerous one: ₹0.00 reads as a real figure.
      const tile = tileFor(title)
      expect(tile).not.toHaveTextContent(/\d/)
      expect(tile).toHaveTextContent('—')
    }
  )

  it('does not claim a month-on-month trend it cannot compute', async () => {
    mockFetch({ orderStats: { ok: false, body: { error: 'boom' } } })

    render(<AdminDashboard />)

    await screen.findByRole('alert')

    expect(tileFor('This Month')).not.toHaveTextContent(/vs last month/i)
  })

  it('keeps the product tiles working when only the order call fails', async () => {
    // The failure must be scoped. A dashboard that blanks everything because
    // one endpoint died is a different bug of the same family.
    mockFetch({ orderStats: { ok: false, body: { error: 'boom' } } })

    render(<AdminDashboard />)

    await screen.findByRole('alert')

    expect(tileFor('Active Products')).toHaveTextContent('36')
  })

  it('names both halves when both stats calls fail', async () => {
    mockFetch({
      orderStats: { ok: false, body: { error: 'boom' } },
      productStats: { ok: false, body: { error: 'boom' } },
    })

    render(<AdminDashboard />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/order/i)
    expect(alert).toHaveTextContent(/product/i)
  })
})
