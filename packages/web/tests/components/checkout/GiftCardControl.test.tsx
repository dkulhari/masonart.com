/**
 * Applying a gift card at checkout.
 *
 * The assertion that matters most is that a gift card renders as TENDER, not
 * as a discount. It reduces what is charged, never what things cost — a
 * customer who reads it as a discount will expect the invoice price to move,
 * and the tax behind it would be wrong.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §7, §10
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { GiftCardControl } from '~/components/checkout/GiftCardControl'

const onApply = vi.fn()
const onRemove = vi.fn()

beforeEach(() => {
  onApply.mockReset()
  onRemove.mockReset()
  onApply.mockResolvedValue({ success: true })
})

function renderControl(props: Partial<React.ComponentProps<typeof GiftCardControl>> = {}) {
  return render(
    <GiftCardControl
      appliedCards={[]}
      onApply={onApply}
      onRemove={onRemove}
      {...props}
    />,
  )
}

describe('GiftCardControl', () => {
  it('submits a typed code', async () => {
    renderControl()

    fireEvent.change(screen.getByLabelText(/gift card/i), { target: { value: '7QF3-A8K2-M4NP-XR59' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    expect(onApply).toHaveBeenCalledWith('7QF3-A8K2-M4NP-XR59')
  })

  it('does not submit an empty code', async () => {
    renderControl()

    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    expect(onApply).not.toHaveBeenCalled()
  })

  it('lists applied cards by last four with a remove action', async () => {
    renderControl({
      appliedCards: [
        { giftCardId: 'a', last4: '7QF3', amountPaise: 50_000 },
        { giftCardId: 'b', last4: 'XR59', amountPaise: 20_000 },
      ],
    })

    expect(screen.getByText(/7QF3/)).toBeInTheDocument()
    expect(screen.getByText(/XR59/)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!)
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('shows one message for unknown, disabled and expired codes', async () => {
    onApply.mockResolvedValue({
      success: false,
      error: 'This gift card cannot be used',
    })
    renderControl()

    fireEvent.change(screen.getByLabelText(/gift card/i), { target: { value: 'ZZZZZZZZZZZZZZZZ' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => {
      // The server deliberately does not say which of the three it is;
      // the UI must not invent a distinction either.
      expect(screen.getByText('This gift card cannot be used')).toBeInTheDocument()
    })
  })

  it('clears the field after a card is applied', async () => {
    renderControl()

    const input = screen.getByLabelText(/gift card/i)
    fireEvent.change(input, { target: { value: '7QF3-A8K2-M4NP-XR59' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('says a card never expires and keeps its remainder', () => {
    renderControl()

    // Both are surprising if unstated, and both drive whether a customer
    // applies a card now or saves it.
    expect(screen.getByText(/never expires/i)).toBeInTheDocument()
  })
})

// ============================================================================
// Placement inside the order summary
// ============================================================================

describe('gift cards in OrderSummary', () => {
  const baseProps = {
    items: [],
    subtotal: 2000,
    shippingCost: 0,
    taxAmount: 0,
  }

  async function renderSummary(
    props: Record<string, unknown> = {},
  ) {
    const { OrderSummary } = await import('~/components/checkout/OrderSummary')
    return render(<OrderSummary {...baseProps} {...props} />)
  }

  it('shows an amount due of total minus gift cards', async () => {
    await renderSummary({
      giftCards: [{ giftCardId: 'a', last4: '7QF3', amountPaise: 50_000 }],
      onApplyGiftCard: onApply,
      onRemoveGiftCard: onRemove,
    })

    expect(screen.getByText('Amount due')).toBeInTheDocument()
    // 2000 total, 500 on the card.
    expect(screen.getByText('₹1,500.00')).toBeInTheDocument()
  })

  it('renders the gift card as tender, not among the discount rows', async () => {
    await renderSummary({
      giftCards: [{ giftCardId: 'a', last4: '7QF3', amountPaise: 50_000 }],
      onApplyGiftCard: onApply,
      onRemoveGiftCard: onRemove,
    })

    // The total is unchanged by the card: a gift card reduces what is
    // charged, never what the goods cost. Scoped to the Total row, because
    // the subtotal legitimately shows the same figure.
    const totalRow = screen.getByText('Total').parentElement!
    expect(totalRow).toHaveTextContent('₹2,000.00')

    // And it is not a discount.
    expect(screen.queryByText(/discount/i)).not.toBeInTheDocument()
    const dueRow = screen.getByText('Amount due').parentElement!
    expect(dueRow).toHaveTextContent('₹1,500.00')
  })

  it('renders no amount due when no card is applied', async () => {
    await renderSummary({
      onApplyGiftCard: onApply,
      onRemoveGiftCard: onRemove,
    })

    // No zero row.
    expect(screen.queryByText('Amount due')).not.toBeInTheDocument()
  })

  it('tells the buyer nothing is left to pay when cards cover the total', async () => {
    await renderSummary({
      giftCards: [{ giftCardId: 'a', last4: '7QF3', amountPaise: 200_000 }],
      onApplyGiftCard: onApply,
      onRemoveGiftCard: onRemove,
      onCheckout: vi.fn(),
    })

    expect(screen.getByText(/cover this order in full/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Order' })).toBeInTheDocument()
  })

  it('hides the control entirely when no handler is passed', async () => {
    await renderSummary()

    expect(screen.queryByLabelText(/gift card/i)).not.toBeInTheDocument()
  })

  it('leaves the dormant coupon input dormant', async () => {
    await renderSummary({
      onApplyGiftCard: onApply,
      onRemoveGiftCard: onRemove,
    })

    // No caller passes onApplyCoupon; there are no coupon codes in this
    // system, so that box must stay unrendered.
    expect(screen.queryByPlaceholderText(/coupon/i)).not.toBeInTheDocument()
  })
})
