/**
 * Gift card tender on order surfaces.
 *
 * The same rule as checkout: a gift card sits below the total and after tax,
 * never inside the discount block. It reduced what was charged, not what the
 * goods cost — and the charged figure is what reconciles against the payment
 * gateway when someone is investigating a refund.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §10
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { OrderDetail } from '~/components/admin/OrderDetail'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))

const baseOrder = {
  id: 'order-1',
  orderNumber: 'MA-2026-000001',
  status: 'confirmed',
  paymentStatus: 'paid',
  orderType: 'regular',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  items: [],
  subtotal: '2000.00',
  discount: '0.00',
  shippingCost: '0.00',
  tax: '0.00',
  total: '2000.00',
  itemCount: 1,
  currency: 'INR',
  shippingAddress: {
    fullName: 'Test Buyer',
    addressLine1: '1 Test Road',
    city: 'Test',
    state: 'Test',
    postalCode: '000000',
    country: 'IN',
    phone: '0000000000',
  },
}

function renderDetail(overrides: Record<string, unknown> = {}) {
  return render(
    <OrderDetail order={{ ...baseOrder, ...overrides } as never} />,
  )
}

describe('gift card tender on the admin order detail', () => {
  it('shows the tender and the charged amount', () => {
    renderDetail({ giftCardAmount: '500.00' })

    expect(screen.getByText('Gift card')).toBeInTheDocument()
    expect(screen.getByText('Charged')).toBeInTheDocument()

    const chargedRow = screen.getByText('Charged').parentElement!
    expect(chargedRow).toHaveTextContent('₹1,500.00')
  })

  it('leaves the total unchanged by the tender', () => {
    renderDetail({ giftCardAmount: '500.00' })

    // The order was still worth 2000; only what was charged differs.
    const totalRow = screen.getByText('Total').parentElement!
    expect(totalRow).toHaveTextContent('₹2,000.00')
  })

  it('keeps the tender out of the discount block', () => {
    renderDetail({ giftCardAmount: '500.00', discount: '0.00' })

    // Discount renders only when non-zero, and a gift card must never be
    // what makes it appear.
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
  })

  it('renders nothing when no gift card was used', () => {
    renderDetail({ giftCardAmount: '0.00' })

    // No zero row.
    expect(screen.queryByText('Gift card')).not.toBeInTheDocument()
    expect(screen.queryByText('Charged')).not.toBeInTheDocument()
  })

  it('renders nothing when the field is absent entirely', () => {
    renderDetail()

    // Orders predating the feature carry no giftCardAmount at all.
    expect(screen.queryByText('Gift card')).not.toBeInTheDocument()
  })
})
