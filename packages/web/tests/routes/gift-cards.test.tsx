/**
 * Buying a gift card.
 *
 * The bounds live in packages/shared and are read, never retyped — a second
 * copy of "minimum ₹500" drifts the moment either side changes.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §5, §10
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { GiftCardPurchaseForm } from '~/components/gift-cards/GiftCardPurchaseForm'

const onPurchase = vi.fn()

beforeEach(() => {
  onPurchase.mockReset()
  onPurchase.mockResolvedValue({ success: true, orderId: 'order-1' })
})

function renderForm() {
  return render(<GiftCardPurchaseForm onPurchase={onPurchase} />)
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function fillValidForm() {
  fill(/recipient.s email/i, 'friend@example.com')
  fill(/recipient.s name/i, 'Friend')
  fill(/your name/i, 'Dhruv')
}

describe('GiftCardPurchaseForm', () => {
  it('offers preset amounts', () => {
    renderForm()

    expect(screen.getByRole('button', { name: '₹1,000' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '₹5,000' })).toBeInTheDocument()
  })

  it('submits the chosen amount in paise', async () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: '₹1,000' }))
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))

    await waitFor(() =>
      expect(onPurchase).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaise: 100_000 }),
      ),
    )
  })

  it('rejects an amount below the shared minimum', async () => {
    renderForm()

    fill(/custom amount/i, '100')
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))

    await waitFor(() => {
      expect(screen.getByText(/between ₹500 and ₹50,000/i)).toBeInTheDocument()
    })
    expect(onPurchase).not.toHaveBeenCalled()
  })

  it('rejects an amount above the shared maximum', async () => {
    renderForm()

    fill(/custom amount/i, '90000')
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))

    await waitFor(() => {
      expect(screen.getByText(/between ₹500 and ₹50,000/i)).toBeInTheDocument()
    })
    expect(onPurchase).not.toHaveBeenCalled()
  })

  it('requires a valid recipient email', async () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: '₹1,000' }))
    fill(/recipient.s email/i, 'not-an-email')
    fill(/recipient.s name/i, 'Friend')
    fill(/your name/i, 'Dhruv')
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))

    await waitFor(() => {
      expect(screen.getByText(/where the code is sent/i)).toBeInTheDocument()
    })
    expect(onPurchase).not.toHaveBeenCalled()
  })

  it('rejects a send date more than a year out', async () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: '₹1,000' }))
    fillValidForm()

    const farFuture = new Date(Date.now() + 400 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    fill(/send on/i, farFuture)
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))

    await waitFor(() => {
      expect(screen.getByText(/within the next year/i)).toBeInTheDocument()
    })
    expect(onPurchase).not.toHaveBeenCalled()
  })

  it('previews the card as the buyer fills it in', () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: '₹1,000' }))
    fill(/recipient.s name/i, 'Asha')
    fill(/your name/i, 'Dhruv')
    fill(/message/i, 'For the empty wall')

    const preview = screen.getByTestId('gift-card-preview')
    expect(preview).toHaveTextContent('₹1,000')
    expect(preview).toHaveTextContent('Asha')
    expect(preview).toHaveTextContent('Dhruv')
    expect(preview).toHaveTextContent('For the empty wall')
  })

  it('tells the buyer the card never expires and keeps its remainder', () => {
    renderForm()

    expect(screen.getByText(/never expires/i)).toBeInTheDocument()
    expect(screen.getByText(/across several orders/i)).toBeInTheDocument()
  })

  it('warns that the code goes to the address typed', () => {
    renderForm()

    // A typo here is not recoverable by support: only the hash is stored, so
    // the code cannot be looked up and resent.
    expect(screen.getByText(/cannot resend it/i)).toBeInTheDocument()
  })

  it('surfaces a server failure without losing what was typed', async () => {
    onPurchase.mockResolvedValue({ success: false, error: 'Payment unavailable' })
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: '₹1,000' }))
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))

    await waitFor(() => {
      expect(screen.getByText('Payment unavailable')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/recipient.s name/i)).toHaveValue('Friend')
  })
})
