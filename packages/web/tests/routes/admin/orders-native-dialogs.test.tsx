/**
 * /admin/orders — the three destructive flows, proven to stay in the page
 * (#625, follow-up to #604).
 *
 * `window.confirm` and `window.prompt` are stubbed here to THROW rather than to
 * return a canned answer. A mock that returns `true` would let a screen keep
 * calling the native dialog forever while the suite stays green; a tripwire
 * fails the moment the screen reaches for one. That matters because the defect
 * being fixed is not "the dialog looks wrong" — it is that a native dialog
 * blocks the event loop and freezes the E2E harness, so every one of these
 * flows was undrivable end-to-end.
 *
 * The status flow gets the extra assertion: it must offer a SELECT of valid
 * statuses. It used to ask the operator to type one into a free-text prompt and
 * string-match it against an eleven-value enum, so a typo was a silent no-op.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'

const SEARCH = {
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt' as const,
  sortOrder: 'desc' as const,
}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useSearch: () => SEARCH,
  }),
  useNavigate: () => () => {},
}))

import AdminOrdersPage from '~/routes/admin/orders/index'

const ORDER = {
  id: 'order-1',
  orderNumber: 'CHB-1001',
  status: 'confirmed',
  paymentStatus: 'paid',
  total: '2500.00',
  subtotal: '2500.00',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  itemCount: 1,
  customerName: 'Asha Rao',
  customerEmail: 'asha@example.com',
}

const ORDERS_PAGE = {
  items: [ORDER],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

const ORDER_STATS = {
  byStatus: { confirmed: 1 },
  byPaymentStatus: { paid: 1 },
  totalRevenue: '2500.00',
  todayOrders: 1,
  monthRevenue: '2500.00',
}

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/stats') ? ok(ORDER_STATS) : ok(ORDERS_PAGE)
    )
  )

  // Tripwires, not mocks. Reaching for either one is the bug.
  vi.stubGlobal('confirm', () => {
    throw new Error('native confirm() called — blocks the E2E harness (#625)')
  })
  vi.stubGlobal('prompt', () => {
    throw new Error('native prompt() called — blocks the E2E harness (#625)')
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Opens the row's action menu and clicks one of its items. */
async function chooseRowAction(label: RegExp) {
  render(<AdminOrdersPage />)

  const row = await screen.findByText('CHB-1001')
  const actions = await screen.findByRole('button', { name: /order actions/i })
  fireEvent.click(actions)
  fireEvent.click(await screen.findByRole('button', { name: label }))

  return row
}

describe('/admin/orders destructive flows', () => {
  it('asks to cancel an order in the page, not through a native dialog', async () => {
    await chooseRowAction(/cancel order/i)

    const dialog = await screen.findByRole('dialog')

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText(/CHB-1001/)).toBeInTheDocument()
  })

  it('offers a select of valid statuses instead of a free-text prompt', async () => {
    await chooseRowAction(/update status/i)

    const select = (await screen.findByLabelText('New status')) as HTMLSelectElement

    expect(select.tagName).toBe('SELECT')
    expect(Array.from(select.options).map((option) => option.value)).toContain('shipped')
    // The eleven the API accepts, not a free-text guess.
    expect(select.options).toHaveLength(11)
  })

  it('collects a refund reason in the page, and will not send an empty one', async () => {
    await chooseRowAction(/initiate refund/i)

    const reason = await screen.findByLabelText(/reason/i)
    expect(reason).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /initiate refund/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/refund'))
      ).toHaveLength(0)
    )
  })
})
