/**
 * What OrdersTable and ProductsTable must keep doing while their shared parts
 * are extracted (#634, follow-on from #630).
 *
 * These assertions describe behaviour that exists TODAY. They are written
 * before the refactor so the extraction has something to be checked against —
 * the only spec that rendered either table before this one is
 * product-popularity, which reads the file as text and would stay green
 * through almost any regression here.
 *
 * The assertions deliberately avoid naming lucide's own class names: those
 * change between icon-library releases, and a test that breaks on a dependency
 * bump stops being a safety net. The sort ladder is pinned by the row order it
 * produces and by the icon *changing*, not by which icon it is.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

import {
  OrdersTable,
  OrdersTableSkeleton,
  type AdminOrder,
} from '~/components/admin/OrdersTable'
import {
  ProductsTable,
  ProductsTableSkeleton,
  type AdminProduct,
} from '~/components/admin/ProductsTable'

afterEach(cleanup)

// ============================================================================
// Fixtures
// ============================================================================

function makeOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'order-1',
    orderNumber: 'ORD-0001',
    status: 'pending',
    paymentStatus: 'pending',
    orderType: 'regular',
    shippingCost: '0.00',
    subtotal: '100.00',
    discount: '0.00',
    tax: '0.00',
    total: '100.00',
    itemCount: 1,
    currency: 'INR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    customer: { name: 'Asha', email: 'asha@example.com' },
    ...overrides,
  }
}

function makeProduct(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: 'product-1',
    sku: 'SKU-0001',
    title: 'Alpha Poster',
    slug: 'alpha-poster',
    basePrice: '100.00',
    styles: [],
    subjects: [],
    colors: [],
    rooms: [],
    orientation: 'portrait',
    images: [],
    status: 'draft',
    isFeatured: false,
    isAiGenerated: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** The number of columns each table declares, read off the rendered header. */
function headerCellCount(container: HTMLElement) {
  return container.querySelectorAll('thead th').length
}

// ============================================================================
// Empty state
// ============================================================================

describe('the admin tables share an empty state', () => {
  it('tells the admin there are no orders, over the full width of the table', () => {
    const { container } = render(<OrdersTable orders={[]} isLoading={false} />)

    const cell = container.querySelector('tbody td') as HTMLTableCellElement
    expect(cell).toBeInTheDocument()
    expect(cell).toHaveTextContent('No orders found')
    expect(cell.colSpan).toBe(headerCellCount(container))
    expect(cell.className).toContain('px-4 py-12 text-center text-muted-foreground')
    // One icon above the copy.
    expect(cell.querySelectorAll('svg')).toHaveLength(1)
  })

  it('tells the admin there are no products, over the full width of the table', () => {
    const { container } = render(<ProductsTable products={[]} isLoading={false} />)

    const cell = container.querySelector('tbody td') as HTMLTableCellElement
    expect(cell).toHaveTextContent('No products found')
    expect(cell.colSpan).toBe(headerCellCount(container))
    expect(cell.querySelectorAll('svg')).toHaveLength(1)
  })

  it('only suggests loosening the search once something has been typed', () => {
    const { container } = render(<OrdersTable orders={[]} isLoading={false} />)
    expect(screen.queryByText(/adjusting your search/i)).toBeNull()

    fireEvent.change(screen.getByPlaceholderText('Search orders...'), {
      target: { value: 'nothing-matches-this' },
    })

    expect(screen.getByText(/adjusting your search/i)).toBeInTheDocument()
    expect(container.querySelector('tbody td')).toHaveTextContent('No orders found')
  })

  it('hides the pagination footer when there is nothing to page through', () => {
    render(<OrdersTable orders={[]} isLoading={false} />)
    expect(screen.queryByText(/showing/i)).toBeNull()
  })
})

// ============================================================================
// Loading state
// ============================================================================

describe('the admin tables share a loading state', () => {
  it('renders five pulsing rows instead of an empty state', () => {
    const { container } = render(<OrdersTable orders={[]} isLoading />)

    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(5)
    expect(screen.queryByText('No orders found')).toBeNull()

    for (const row of rows) {
      expect(row.querySelectorAll('td')).toHaveLength(headerCellCount(container))
      expect(row.querySelectorAll('.animate-pulse')).toHaveLength(
        headerCellCount(container)
      )
    }
  })

  it('renders the same five pulsing rows for products', () => {
    const { container } = render(<ProductsTable products={[]} isLoading />)

    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(5)
    expect(screen.queryByText('No products found')).toBeNull()
    expect(rows[0].querySelectorAll('td')).toHaveLength(headerCellCount(container))
  })

  it('keeps the header visible while loading', () => {
    const { container } = render(<OrdersTable orders={[]} isLoading />)
    expect(headerCellCount(container)).toBe(7)
    expect(screen.getByText('Items')).toBeInTheDocument()
  })

  it('hides the pagination footer while loading, even with rows in hand', () => {
    render(<OrdersTable orders={[makeOrder()]} isLoading />)
    expect(screen.queryByText(/showing/i)).toBeNull()
  })
})

// ============================================================================
// The standalone skeletons
// ============================================================================

describe('the standalone table skeletons', () => {
  it('draws a header bar plus five body rows of the orders column widths', () => {
    const { container } = render(<OrdersTableSkeleton />)

    const widths = [...container.querySelectorAll('[style*="width"]')].map(
      (el) => (el as HTMLElement).style.width
    )
    // Seven columns, once in the header bar and once per body row.
    expect(widths).toHaveLength(7 * 6)
    expect(widths.slice(0, 7)).toEqual([
      '150px',
      '200px',
      '140px',
      '120px',
      '70px',
      '100px',
      '50px',
    ])
  })

  it('draws the products column widths, which differ from the orders ones', () => {
    const { container } = render(<ProductsTableSkeleton />)

    const widths = [...container.querySelectorAll('[style*="width"]')].map(
      (el) => (el as HTMLElement).style.width
    )
    expect(widths).toHaveLength(8 * 6)
    expect(widths.slice(0, 8)).toEqual([
      '40px',
      '300px',
      '100px',
      '100px',
      '100px',
      '80px',
      '120px',
      '50px',
    ])
  })
})

// ============================================================================
// Sortable headers
// ============================================================================

describe('the admin tables share a sort ladder', () => {
  const orders = [
    makeOrder({ id: 'b', orderNumber: 'ORD-0002', total: '300.00' }),
    makeOrder({ id: 'a', orderNumber: 'ORD-0001', total: '100.00' }),
    makeOrder({ id: 'c', orderNumber: 'ORD-0003', total: '200.00' }),
  ]

  function orderNumbersInDomOrder(container: HTMLElement) {
    return [...container.querySelectorAll('tbody tr td:first-child p:first-child')].map(
      (el) => el.textContent
    )
  }

  it('cycles unsorted, ascending, descending and back on repeated clicks', () => {
    const { container } = render(<OrdersTable orders={orders} isLoading={false} />)
    const header = screen.getByRole('button', { name: 'Order' })

    expect(orderNumbersInDomOrder(container)).toEqual([
      'ORD-0002',
      'ORD-0001',
      'ORD-0003',
    ])

    fireEvent.click(header)
    expect(orderNumbersInDomOrder(container)).toEqual([
      'ORD-0001',
      'ORD-0002',
      'ORD-0003',
    ])

    fireEvent.click(header)
    expect(orderNumbersInDomOrder(container)).toEqual([
      'ORD-0003',
      'ORD-0002',
      'ORD-0001',
    ])

    fireEvent.click(header)
    expect(orderNumbersInDomOrder(container)).toEqual([
      'ORD-0002',
      'ORD-0001',
      'ORD-0003',
    ])
  })

  it('shows a different chevron in each of the three states', () => {
    render(<OrdersTable orders={orders} isLoading={false} />)
    const header = screen.getByRole('button', { name: 'Order' })

    const chevron = () => {
      const svgs = header.querySelectorAll('svg')
      expect(svgs).toHaveLength(1)
      return svgs[0].getAttribute('class')
    }

    const unsorted = chevron()
    fireEvent.click(header)
    const ascending = chevron()
    fireEvent.click(header)
    const descending = chevron()

    expect(new Set([unsorted, ascending, descending]).size).toBe(3)
    // The resting chevron is the muted one; the two active ones are not.
    expect(unsorted).toContain('text-muted-foreground')
    expect(ascending).not.toContain('text-muted-foreground')
    expect(descending).not.toContain('text-muted-foreground')
  })

  it('gives the header button the same layout classes in both tables', () => {
    const { unmount } = render(<OrdersTable orders={[]} isLoading={false} />)
    const ordersHeader = screen.getByRole('button', { name: 'Order' })
    expect(ordersHeader.className).toBe('flex items-center gap-1 font-medium')
    expect(ordersHeader).toHaveAttribute('type', 'button')
    unmount()

    render(<ProductsTable products={[]} isLoading={false} />)
    const productsHeader = screen.getByRole('button', { name: 'Product' })
    expect(productsHeader.className).toBe('flex items-center gap-1 font-medium')
  })

  it('sorts the products table by price as a number, not a string', () => {
    const { container } = render(
      <ProductsTable
        products={[
          makeProduct({ id: '1', title: 'Nine', basePrice: '9.00' }),
          makeProduct({ id: '2', title: 'Eighty', basePrice: '80.00' }),
          makeProduct({ id: '3', title: 'Seven Hundred', basePrice: '700.00' }),
        ]}
        isLoading={false}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Price' }))

    const titles = [...container.querySelectorAll('tbody tr td:nth-child(2) p:first-child')].map(
      (el) => el.textContent
    )
    expect(titles).toEqual(['Nine', 'Eighty', 'Seven Hundred'])
  })

  it('leaves the non-sortable headers as plain text', () => {
    render(<OrdersTable orders={[]} isLoading={false} />)
    expect(screen.queryByRole('button', { name: 'Items' })).toBeNull()
    expect(screen.getByText('Items')).toBeInTheDocument()
  })
})

// ============================================================================
// Status badges
// ============================================================================

describe('the status badges', () => {
  const BADGE_SHELL =
    'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium'

  /**
   * Scoped to the body: the filter dropdowns above the table carry the very
   * same words as <option> labels.
   */
  function body(container: HTMLElement) {
    return within(container.querySelector('tbody') as HTMLElement)
  }

  it('labels an order status in words, with its own palette', () => {
    const { container } = render(
      <OrdersTable
        orders={[makeOrder({ status: 'out_for_delivery' })]}
        isLoading={false}
      />
    )

    const badge = body(container).getByText('Out for Delivery')
    expect(badge.className).toBe(
      `${BADGE_SHELL} bg-cyan-100 text-cyan-700 border-cyan-200`
    )
  })

  it('labels a payment status from its own, separate map', () => {
    const { container } = render(
      <OrdersTable
        orders={[makeOrder({ status: 'refunded', paymentStatus: 'partially_refunded' })]}
        isLoading={false}
      />
    )

    expect(body(container).getByText('Refunded').className).toBe(
      `${BADGE_SHELL} bg-gray-100 text-gray-600 border-gray-200`
    )
    expect(body(container).getByText('Partial Refund').className).toBe(
      `${BADGE_SHELL} bg-orange-100 text-orange-700 border-orange-200`
    )
  })

  it('renders the product status as the raw value, capitalised by CSS', () => {
    const { container } = render(
      <ProductsTable products={[makeProduct({ status: 'archived' })]} isLoading={false} />
    )

    const badge = body(container).getByText('archived')
    expect(badge.className).toBe(
      `${BADGE_SHELL} capitalize bg-gray-100 text-gray-700 border-gray-200`
    )
  })
})

// ============================================================================
// Row actions menu
// ============================================================================

describe('the row actions menu', () => {
  /** The icon-only trigger in the last cell of the first body row. */
  function trigger(container: HTMLElement) {
    return container.querySelector(
      'tbody tr td .relative > button'
    ) as HTMLButtonElement
  }

  it('opens on the trigger and closes on the click-away backdrop', () => {
    const onView = vi.fn()
    const { container } = render(
      <OrdersTable orders={[makeOrder()]} isLoading={false} onView={onView} />
    )

    const button = trigger(container)
    expect(screen.queryByText('View Details')).toBeNull()

    fireEvent.click(button)
    expect(screen.getByText('View Details')).toBeInTheDocument()

    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement
    expect(backdrop).toBeInTheDocument()
    fireEvent.click(backdrop)

    expect(screen.queryByText('View Details')).toBeNull()
    expect(onView).not.toHaveBeenCalled()
  })

  it('names the orders trigger for screen readers and reports its open state (#625)', () => {
    const { container } = render(
      <OrdersTable orders={[makeOrder({ orderNumber: 'ORD-0042' })]} isLoading={false} />
    )

    const button = trigger(container)
    expect(button).toHaveAttribute('aria-label', 'Order actions for ORD-0042')
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('runs the handler and closes the menu when an item is chosen', () => {
    const onView = vi.fn()
    const order = makeOrder()
    const { container } = render(
      <OrdersTable orders={[order]} isLoading={false} onView={onView} />
    )

    fireEvent.click(trigger(container))
    fireEvent.click(screen.getByText('View Details'))

    expect(onView).toHaveBeenCalledWith(order)
    expect(screen.queryByText('View Details')).toBeNull()
  })

  it('omits the items whose handler was not supplied', () => {
    const { container } = render(
      <OrdersTable orders={[makeOrder()]} isLoading={false} onView={vi.fn()} />
    )

    fireEvent.click(trigger(container))
    expect(screen.getByText('View Details')).toBeInTheDocument()
    expect(screen.queryByText('Update Status')).toBeNull()
  })

  it('hides Cancel Order on an order that has already been delivered', () => {
    const { container } = render(
      <OrdersTable
        orders={[makeOrder({ status: 'delivered' })]}
        isLoading={false}
        onCancel={vi.fn()}
        onRefund={vi.fn()}
      />
    )

    fireEvent.click(trigger(container))
    expect(screen.queryByText('Cancel Order')).toBeNull()
  })

  it('offers a refund only once the payment is actually paid', () => {
    const { container } = render(
      <OrdersTable
        orders={[makeOrder({ status: 'processing', paymentStatus: 'paid' })]}
        isLoading={false}
        onRefund={vi.fn()}
      />
    )

    fireEvent.click(trigger(container))
    expect(screen.getByText('Initiate Refund')).toBeInTheDocument()
  })

  it('gives the products menu the same shell and click-away', () => {
    const { container } = render(
      <ProductsTable
        products={[makeProduct()]}
        isLoading={false}
        onEdit={vi.fn()}
      />
    )

    const button = trigger(container)
    expect(button.className).toBe(
      'flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted'
    )

    fireEvent.click(button)
    const menu = container.querySelector('.absolute.right-0') as HTMLElement
    expect(menu.className).toBe(
      'absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-card py-1 shadow-lg'
    )
    // The store link is always offered, handler or not.
    expect(within(menu).getByText('View in Store').closest('a')).toHaveAttribute(
      'href',
      '/posters/alpha-poster'
    )

    fireEvent.click(container.querySelector('.fixed.inset-0') as HTMLElement)
    expect(screen.queryByText('Edit Product')).toBeNull()
  })
})

// ============================================================================
// Data rows
// ============================================================================

describe('the data rows', () => {
  it('renders one row per order with the shared cell classes', () => {
    const { container } = render(
      <OrdersTable orders={[makeOrder(), makeOrder({ id: 'order-2' })]} isLoading={false} />
    )

    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].className).toBe(
      'border-b border-border transition-colors hover:bg-muted/50'
    )
    expect((rows[0].querySelector('td') as HTMLElement).className).toBe('px-4 py-3 text-sm')
  })

  it('tints a selected product row, which the orders table has no notion of', () => {
    const { container } = render(
      <ProductsTable products={[makeProduct()]} isLoading={false} />
    )

    const row = container.querySelector('tbody tr') as HTMLElement
    expect(row.className).not.toContain('bg-brand-50')

    fireEvent.click(row.querySelector('input[type="checkbox"]') as HTMLElement)
    expect(row.className).toContain('bg-brand-50')
  })

  it('shows the pagination footer once there are rows', () => {
    render(<OrdersTable orders={[makeOrder()]} isLoading={false} />)
    expect(screen.getByText(/showing/i)).toBeInTheDocument()
  })
})
