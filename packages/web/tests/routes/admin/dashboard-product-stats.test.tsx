/**
 * /admin — what the dashboard says when it does not know (#602).
 *
 * `fetchProductStats()` used to answer a failed request with
 * `{ totalProducts: 0, activeProducts: 0, lowStockProducts: 0,
 * outOfStockProducts: 0 }` and a comment explaining that the endpoint did not
 * exist yet. The endpoint stayed missing, so the first screen an operator sees
 * reported a catalogue of zero products and zero low-stock alarms — numbers
 * indistinguishable from a genuinely empty, genuinely healthy catalogue.
 *
 * The rule this pins: an unanswered question renders as unanswered. A zero on
 * this screen must mean the database said zero.
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

/**
 * Route `fetch` by URL so a single endpoint can fail while the rest succeed —
 * the whole point being that one dead call must not be laundered into a zero.
 */
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

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('admin dashboard product stats', () => {
  it('renders the real count when the stats endpoint answers', async () => {
    mockFetch({})

    render(<AdminDashboard />)

    expect(await screen.findByText('36')).toBeInTheDocument()
  })

  it('surfaces an error when the product stats call fails', async () => {
    mockFetch({ productStats: { ok: false, body: { error: 'boom' } } })

    render(<AdminDashboard />)

    // Any operator-visible admission that the screen is incomplete. The
    // wording is the component's to choose; the presence is not optional.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/product/i)
  })

  it('does not render a fabricated zero for products when the call fails', async () => {
    mockFetch({ productStats: { ok: false, body: { error: 'boom' } } })

    render(<AdminDashboard />)

    await screen.findByRole('alert')

    // The tile still exists — it just must not claim a number it never got.
    const tile = screen.getByText('Active Products').closest('div')
    expect(tile).not.toHaveTextContent(/\b0\b/)
  })

  it('keeps the order tiles working when only the product call fails', async () => {
    // The failure must be scoped. A dashboard that blanks everything because
    // one endpoint died is a different bug of the same family.
    mockFetch({ productStats: { ok: false, body: { error: 'boom' } } })

    render(<AdminDashboard />)

    await waitFor(() => {
      expect(screen.getByText("Today's Orders")).toBeInTheDocument()
    })
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
