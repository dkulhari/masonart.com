/**
 * The production panel on /admin/orders/$id.
 *
 * One requirement carries this whole component: **it has to show the order
 * items that are on NO job.** An order line with no production job is invisible
 * work — nothing has been ordered from a supplier, nothing is late, nothing
 * will ever be inspected — and the production queue cannot show it, because the
 * queue only lists jobs that exist. This panel is the only surface where that
 * gap appears at all.
 *
 * Which is also why the panel must never GUESS. The queue endpoint has no
 * `orderId` filter yet, so the panel scans the queue client-side; when the scan
 * is cut short, "these items are on no job" would be a fabrication of exactly
 * the kind #602 and #606 are open about. A truncated scan says so and withholds
 * the unassigned list rather than inventing it.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => () => {},
  Link: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    to?: string
    params?: Record<string, string>
    search?: unknown
    className?: string
  }) => (
    <a href={props.to} className={props.className}>
      {children}
    </a>
  ),
}))

import {
  OrderProductionPanelBody,
  unassignedOrderItems,
  type OrderProductionJob,
  type OrderProductionPanelItem,
} from '~/routes/admin/production/OrderProductionPanel'

afterEach(cleanup)

const noop = () => {}

const ORDER_ITEMS: OrderProductionPanelItem[] = [
  {
    id: 'oi-print',
    quantity: 1,
    snapshot: { title: 'Sundarbans at Dawn', sizeLabel: '24×36' },
    product: { title: 'Sundarbans at Dawn' },
    variant: { sizeLabel: '24×36' },
  },
  {
    id: 'oi-frame',
    quantity: 1,
    snapshot: { title: 'Teak Frame', sizeLabel: '24×36' },
    product: { title: 'Teak Frame' },
    variant: { sizeLabel: '24×36' },
  },
  {
    id: 'oi-orphan',
    quantity: 2,
    snapshot: { title: 'Howrah Bridge', sizeLabel: '12×18' },
    product: { title: 'Howrah Bridge' },
    variant: { sizeLabel: '12×18' },
  },
]

const JOBS: OrderProductionJob[] = [
  {
    id: 'job-print',
    orderId: 'order-1',
    stage: 'print',
    status: 'assigned',
    vendorId: 'v1',
    vendorName: 'Kolkata Print Works',
    assignedAt: '2026-03-01T00:00:00.000Z',
    sentAt: null,
    dueAt: null,
    receivedAt: null,
    amountExpected: '900.00',
    amountActual: null,
    settlementId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    payableAmount: '900.00',
    items: [
      {
        id: 'ji-1',
        orderItemId: 'oi-print',
        quantity: 1,
        widthInches: 24,
        heightInches: 36,
        sizeLabel: '24×36',
      },
    ],
  },
  {
    id: 'job-frame',
    orderId: 'order-1',
    stage: 'frame',
    status: 'draft',
    vendorId: null,
    vendorName: null,
    assignedAt: null,
    sentAt: null,
    dueAt: null,
    receivedAt: null,
    amountExpected: null,
    amountActual: null,
    settlementId: null,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    payableAmount: '0.00',
    items: [
      {
        id: 'ji-2',
        orderItemId: 'oi-frame',
        quantity: 1,
        widthInches: 24,
        heightInches: 36,
        sizeLabel: '24×36',
      },
    ],
  },
]

// ============================================================================
// The gap
// ============================================================================

describe('unassignedOrderItems', () => {
  it('is the order items that appear on no job at all', () => {
    expect(unassignedOrderItems(ORDER_ITEMS, JOBS).map((i) => i.id)).toEqual(['oi-orphan'])
  })

  it('is empty when every item is covered', () => {
    expect(unassignedOrderItems(ORDER_ITEMS.slice(0, 2), JOBS)).toEqual([])
  })

  /** No jobs yet means every line is uncovered, not that nothing is missing. */
  it('is every item when the order has no jobs', () => {
    expect(unassignedOrderItems(ORDER_ITEMS, []).map((i) => i.id)).toEqual([
      'oi-print',
      'oi-frame',
      'oi-orphan',
    ])
  })

  /**
   * A cancelled job is not production. Counting it as coverage would hide the
   * item that now needs re-ordering — the exact hole the panel exists to show.
   */
  it('does not let a cancelled job count as coverage', () => {
    const cancelled: OrderProductionJob[] = [
      { ...JOBS[0], status: 'cancelled' },
      JOBS[1],
    ]

    expect(unassignedOrderItems(ORDER_ITEMS, cancelled).map((i) => i.id)).toEqual([
      'oi-print',
      'oi-orphan',
    ])
  })
})

// ============================================================================
// The panel
// ============================================================================

describe('OrderProductionPanelBody', () => {
  const renderPanel = (
    overrides: Partial<React.ComponentProps<typeof OrderProductionPanelBody>> = {}
  ) =>
    render(
      <OrderProductionPanelBody
        jobs={JOBS}
        orderItems={ORDER_ITEMS}
        isLoading={false}
        error={null}
        truncated={false}
        onRetry={noop}
        {...overrides}
      />
    )

  it('renders a skeleton while the queue is being scanned', () => {
    renderPanel({ isLoading: true, jobs: [] })

    expect(screen.getByTestId('admin-order-production-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-production-jobs')).not.toBeInTheDocument()
  })

  it('renders an error with a retry when the scan failed', () => {
    renderPanel({ jobs: [], error: 'Failed to load production jobs' })

    expect(screen.getByTestId('admin-order-production-error').textContent).toMatch(
      /failed to load production jobs/i
    )
    expect(screen.getByTestId('admin-order-production-retry')).toBeInTheDocument()
  })

  /**
   * #602/#606 again, in its sharpest form here: a failed scan must not print
   * "0 jobs" and must not claim any item is unassigned.
   */
  it('claims nothing about coverage when the scan failed', () => {
    renderPanel({ jobs: [], error: 'Failed to load production jobs' })

    expect(screen.queryByTestId('admin-order-production-unassigned')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-production-jobs')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-order-production-error').textContent).not.toMatch(/\d/)
  })

  it('shows the empty state when the order has no jobs, and still names the gap', () => {
    renderPanel({ jobs: [] })

    expect(screen.getByTestId('admin-order-production-empty')).toBeInTheDocument()
    // Every line is uncovered — that is the whole point of the empty case.
    expect(screen.getByTestId('admin-order-production-unassigned')).toBeInTheDocument()
    expect(
      screen.getByTestId('admin-order-production-unassigned-item-oi-orphan')
    ).toBeInTheDocument()
  })

  it('lists each job with its stage, status and vendor', () => {
    renderPanel()

    const printJob = screen.getByTestId('admin-order-production-job-job-print')
    expect(printJob.textContent).toMatch(/print/i)
    expect(printJob.textContent).toMatch(/assigned/i)
    expect(printJob.textContent).toMatch(/Kolkata Print Works/)

    const frameJob = screen.getByTestId('admin-order-production-job-job-frame')
    expect(frameJob.textContent).toMatch(/unassigned/i)
  })

  it('says which of the order items are on which job', () => {
    renderPanel()

    const printJob = screen.getByTestId('admin-order-production-job-job-print')
    expect(printJob.textContent).toMatch(/Sundarbans at Dawn/)
    expect(printJob.textContent).not.toMatch(/Howrah Bridge/)

    const frameJob = screen.getByTestId('admin-order-production-job-job-frame')
    expect(frameJob.textContent).toMatch(/Teak Frame/)
  })

  /** The headline requirement. */
  it('names the order item that is on no job at all', () => {
    renderPanel()

    const gap = screen.getByTestId('admin-order-production-unassigned')
    expect(gap.textContent).toMatch(/Howrah Bridge/)
    expect(gap.textContent).toMatch(/12×18/)
    expect(gap.textContent).not.toMatch(/Sundarbans at Dawn/)
  })

  it('says so plainly when nothing is missing, rather than showing an empty box', () => {
    renderPanel({ orderItems: ORDER_ITEMS.slice(0, 2) })

    expect(screen.queryByTestId('admin-order-production-unassigned')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-order-production-all-covered')).toBeInTheDocument()
  })

  /**
   * A truncated scan cannot answer "is anything uncovered?". Withholding the
   * answer is the honest option; printing a reassuring "all covered" would be a
   * fabrication.
   */
  it('withholds the coverage verdict when the queue scan was cut short', () => {
    renderPanel({ truncated: true })

    expect(screen.getByTestId('admin-order-production-truncated')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-production-unassigned')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-order-production-all-covered')).not.toBeInTheDocument()
  })

  it('links each job to its detail screen', () => {
    renderPanel()

    const link = screen
      .getByTestId('admin-order-production-job-job-print')
      .querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toContain('/admin/production/$id')
  })
})
