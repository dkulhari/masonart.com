/**
 * Paying entirely with gift cards, which needs no gateway at all.
 *
 * When cards cover the total, `POST /api/orders/:id/payment` debits them,
 * marks the order paid, and returns `{ fullyCoveredByGiftCard: true }` with no
 * Razorpay order behind it — there is nothing to charge.
 *
 * The client never looked for that flag (#578). It went straight on to build
 * Razorpay options out of a response that has no `razorpayOrderId` and no
 * `razorpayKeyId`, and opened the modal with `order_id: undefined` — on an
 * order the server had already marked paid and cards it had already debited.
 * The customer's money was gone and the screen showed a broken gateway.
 *
 * It is the path most likely to break unnoticed, because it is the one that
 * marks an order paid without a payment.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const initiatePaymentMock = vi.fn()
const createOrderMock = vi.fn()
const verifyPaymentMock = vi.fn()

vi.mock('~/lib/api', () => ({
  ordersApi: {
    create: (...args: unknown[]) => createOrderMock(...args),
    initiatePayment: (...args: unknown[]) => initiatePaymentMock(...args),
    verifyPayment: (...args: unknown[]) => verifyPaymentMock(...args),
  },
}))

const resetLocalCartMock = vi.fn()
const refreshCartMock = vi.fn()

vi.mock('~/hooks/useCartActions', () => ({
  useCartActions: () => ({
    refreshCart: refreshCartMock,
    resetLocalCart: resetLocalCartMock,
  }),
}))

import { PaymentButton } from '~/components/checkout/PaymentButton'

/** Records every attempt to open the gateway. There should be none here. */
const razorpayConstructor = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()

  // The component loads the checkout script on mount and refuses to pay until
  // it resolves; pretending it is already there keeps this about coverage.
  ;(window as unknown as { Razorpay: unknown }).Razorpay = class {
    constructor(options: unknown) {
      razorpayConstructor(options)
    }
    open() {}
    close() {}
    on() {}
  }
})

function renderButton(onSuccess = vi.fn(), onError = vi.fn()) {
  render(
    <PaymentButton
      existingOrderId="order-1"
      giftCardCodes={['ABCDEFGH12345678']}
      totalAmount={1500}
      onSuccess={onSuccess}
      onError={onError}
    />,
  )
  return { onSuccess, onError }
}

const FULLY_COVERED = {
  fullyCoveredByGiftCard: true,
  orderId: 'order-1',
  orderNumber: 'CHB-1001',
  giftCardAmount: '1500.00',
}

describe('an order fully covered by gift cards', () => {
  it('never opens the payment gateway', async () => {
    initiatePaymentMock.mockResolvedValue(FULLY_COVERED)
    renderButton()

    fireEvent.click(await screen.findByRole('button', { name: /pay/i }))

    await waitFor(() => expect(initiatePaymentMock).toHaveBeenCalled())
    // There is nothing to charge. Opening the modal here would ask the
    // customer to pay for an order the server has already marked paid.
    expect(razorpayConstructor).not.toHaveBeenCalled()
  })

  it('reports success with the order it just paid', async () => {
    initiatePaymentMock.mockResolvedValue(FULLY_COVERED)
    const { onSuccess, onError } = renderButton()

    fireEvent.click(await screen.findByRole('button', { name: /pay/i }))

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith('order-1', 'CHB-1001'),
    )
    expect(onError).not.toHaveBeenCalled()
  })

  it('clears the local cart, as a verified payment does', async () => {
    initiatePaymentMock.mockResolvedValue(FULLY_COVERED)
    renderButton()

    fireEvent.click(await screen.findByRole('button', { name: /pay/i }))

    // The server consumed the cart when the order was created. Leaving the
    // local projection full would show the customer a basket that is gone.
    await waitFor(() => expect(resetLocalCartMock).toHaveBeenCalled())
  })

  it('does not try to verify a payment that never happened', async () => {
    initiatePaymentMock.mockResolvedValue(FULLY_COVERED)
    renderButton()

    fireEvent.click(await screen.findByRole('button', { name: /pay/i }))

    await waitFor(() => expect(initiatePaymentMock).toHaveBeenCalled())
    // There is no signature to check: no gateway was involved.
    expect(verifyPaymentMock).not.toHaveBeenCalled()
  })

  it('still opens the gateway when the cards only cover part of it', async () => {
    initiatePaymentMock.mockResolvedValue({
      razorpayOrderId: 'rzp-1',
      razorpayKeyId: 'rzp_test_key',
      amount: 50_000,
      currency: 'INR',
      orderNumber: 'CHB-1002',
      orderId: 'order-1',
      prefill: {},
    })
    renderButton()

    fireEvent.click(await screen.findByRole('button', { name: /pay/i }))

    await waitFor(() => expect(razorpayConstructor).toHaveBeenCalled())
    expect(razorpayConstructor.mock.calls[0]?.[0]).toMatchObject({
      order_id: 'rzp-1',
    })
  })
})
