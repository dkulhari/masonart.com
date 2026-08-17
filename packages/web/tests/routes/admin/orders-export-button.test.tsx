/**
 * /admin/orders — the Export button that exported nothing (#604).
 *
 * The orders header shipped an enabled-looking Export button wired to
 * `alert('Export functionality coming soon')`. Two defects in one control:
 *
 * 1. On a launched store the first thing an operator reaches for is an orders
 *    export for accounting. A control that looks live and does nothing is worse
 *    than no control — it costs a support ticket to discover.
 * 2. `alert()` is a blocking native dialog. It freezes the browser automation
 *    harness outright, so any E2E run that clicks near it stalls — the same
 *    hazard `reviews.tsx` documents about `window.confirm`.
 *
 * The button is removed until a real CSV export exists. These tests pin both
 * halves: the control is gone from the screen, and no admin route reintroduces
 * a native `alert()` anywhere.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SEARCH = {
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt' as const,
  sortOrder: 'desc' as const,
}

/**
 * `createFileRoute` runs at module load and the component reads its search
 * params off the returned Route object, so the factory has to hand back a
 * Route-shaped thing rather than the bare config vendors-list.test.tsx uses.
 */
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useSearch: () => SEARCH,
  }),
  useNavigate: () => () => {},
}))

import AdminOrdersPage from '~/routes/admin/orders/index'

const ORDERS_PAGE = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
}

const ORDER_STATS = {
  byStatus: { pending: 2, delivered: 3 },
  byPaymentStatus: { paid: 4 },
  totalRevenue: '10000.00',
  todayOrders: 1,
  monthRevenue: '5000.00',
}

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/stats') ? ok(ORDER_STATS) : ok(ORDERS_PAGE)
    )
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('/admin/orders header controls', () => {
  it('renders no Export control while CSV export is unbuilt', async () => {
    render(<AdminOrdersPage />)

    await waitFor(() => expect(screen.getByText('Refresh')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
    expect(screen.queryByText(/export/i)).toBeNull()
  })

  it('opens no native dialog on the way to a rendered orders list', async () => {
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)

    render(<AdminOrdersPage />)

    await waitFor(() => expect(screen.getByText('Refresh')).toBeInTheDocument())

    expect(alertSpy).not.toHaveBeenCalled()
  })
})

/**
 * The screen-level assertion above only covers one route. This one covers the
 * class of defect: a native `alert()` anywhere under the admin tree is a
 * harness-freezing hazard regardless of which screen reintroduces it.
 */
describe('admin routes and native dialogs', () => {
  const ADMIN_ROUTES = join(process.cwd(), 'app/routes/admin')

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) return walk(full)
      return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : []
    })

  // `setAlert(` and friends are fine; a bare or `window.`-qualified call is not.
  const ALERT_CALL = /(?<![\w$])(?:window\.)?alert\s*\(/

  it('calls alert() from no admin route', () => {
    const offenders = walk(ADMIN_ROUTES).filter((file) =>
      ALERT_CALL.test(readFileSync(file, 'utf8'))
    )

    expect(offenders).toEqual([])
  })
})
