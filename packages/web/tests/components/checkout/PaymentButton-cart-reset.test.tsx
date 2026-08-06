/**
 * After a paid order the server has already emptied the cart
 * (routes/orders.ts:542-560). The button must not send a second DELETE — it
 * would be a wasted round trip, and it would take out anything added since.
 *
 * This renders the real `PaymentButton`, drives it through order creation,
 * Razorpay checkout, and verification, and asserts on what the *component*
 * did post-payment: `cartApi.clear` must never be called, and the store must
 * end up empty via the local-only path (`resetLocalCart`). A revert of the
 * call site back to `clearCart()` fails this test, because `clearCart()`
 * calls `cartApi.clear()` — see the RED-check evidence in
 * `.superpowers/sdd/2026-08-06-server-cart-write-path/task-4-report.md`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

vi.mock('~/lib/api', () => ({
  cartApi: {
    get: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    merge: vi.fn(),
  },
  ordersApi: {
    create: vi.fn(),
    initiatePayment: vi.fn(),
    verifyPayment: vi.fn(),
  },
}))

import { cartApi, ordersApi, type OrderInput } from '~/lib/api'
import { useCartStore } from '~/stores/cart'
import { PaymentButton } from '~/components/checkout/PaymentButton'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/**
 * Stands in for the real Razorpay checkout.js. `loadRazorpayScript` in
 * PaymentButton.tsx early-returns as soon as `window.Razorpay` is already
 * defined, so setting this before render skips script injection entirely.
 * `.open()` immediately invokes the `handler` the constructor received, the
 * same shape `tests/e2e/payment.spec.ts`'s MockRazorpay uses.
 */
class MockRazorpay {
  private options: {
    handler: (response: {
      razorpay_order_id: string
      razorpay_payment_id: string
      razorpay_signature: string
    }) => void
  }
  private handlers: Record<string, () => void> = {}

  constructor(options: typeof this.options) {
    this.options = options
  }

  open() {
    this.options.handler({
      razorpay_order_id: 'order_mock123',
      razorpay_payment_id: 'pay_mock456',
      razorpay_signature: 'mock_signature_789',
    })
  }

  close() {}

  on(event: string, callback: () => void) {
    this.handlers[event] = callback
  }
}

const orderData: OrderInput = {
  shippingAddress: {
    fullName: 'Jane Doe',
    phone: '9876543210',
    addressLine1: '123 Test Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
  },
  shippingOptionId: 'standard',
}

describe('PaymentButton post-payment cart reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    useCartStore.setState({
      items: [
        {
          id: 'server-1',
          productId: 'p',
          variantId: 'v',
          frameId: null,
          quantity: 1,
          productTitle: 'x',
          productSlug: 'x',
          thumbnailUrl: '',
          sizeLabel: 'A4',
          widthInches: 8,
          heightInches: 12,
          unitPrice: 100,
          framePrice: 0,
          isAiGenerated: false,
          addedAt: '2026-08-06T06:00:00.000Z',
        },
      ],
    })

    // Present before render so loadRazorpayScript's `if (window.Razorpay)`
    // early-return fires instead of injecting the real checkout.js script.
    ;(window as unknown as { Razorpay: unknown }).Razorpay = MockRazorpay

    vi.mocked(ordersApi.create).mockResolvedValue({
      success: true,
      order: { id: 'order_123', orderNumber: 'ORD-12345678' },
    })
    vi.mocked(ordersApi.initiatePayment).mockResolvedValue({
      razorpayKeyId: 'rzp_test_123',
      razorpayOrderId: 'order_mock123',
      amount: 10000,
      currency: 'INR',
      orderNumber: 'ORD-12345678',
      orderId: 'order_123',
      prefill: { name: 'Jane Doe', email: 'jane@example.com' },
    })
    vi.mocked(ordersApi.verifyPayment).mockResolvedValue({
      success: true,
      message: 'Payment verified',
      order: {
        id: 'order_123',
        orderNumber: 'ORD-12345678',
        status: 'confirmed',
        paymentStatus: 'paid',
      },
    })
  })

  afterEach(() => {
    delete (window as unknown as { Razorpay?: unknown }).Razorpay
  })

  it('drops the local projection without a DELETE after a successful payment', async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()

    render(
      <PaymentButton
        orderData={orderData}
        totalAmount={100}
        onSuccess={onSuccess}
        onError={onError}
      />,
      { wrapper }
    )

    const payButton = await screen.findByRole('button', { name: /^Pay/ })
    await waitFor(() => expect(payButton).not.toBeDisabled())

    fireEvent.click(payButton)

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('order_123', 'ORD-12345678'))
    expect(onError).not.toHaveBeenCalled()

    // The assertion that fails on a revert to `clearCart()`.
    expect(cartApi.clear).not.toHaveBeenCalled()
    expect(useCartStore.getState().items).toEqual([])
  })
})

/**
 * The other ways out of the payment flow (#511 final review, finding 4).
 *
 * `ordersApi.create` empties the DATABASE cart before Razorpay's modal opens,
 * so every exit other than a verified payment leaves the page showing a basket
 * the server no longer has. The customer dismisses the modal, the store still
 * shows their items, and "Try Again" calls `ordersApi.create` again — which
 * answers "Cart is empty", 400, permanently, against a cart the UI insists is
 * full.
 *
 * Whether the cart should be consumed at order creation or at verification is
 * a separate question and is deliberately not answered here. These pin the
 * minimum: the failure paths ask the server what is actually left.
 */
describe('PaymentButton failure paths re-read the cart', () => {
  /** Razorpay that opens and then has the customer walk away from it. */
  class DismissedRazorpay {
    private options: { modal?: { ondismiss?: () => void } }

    constructor(options: typeof this.options) {
      this.options = options
    }

    open() {
      this.options.modal?.ondismiss?.()
    }

    close() {}

    on() {}
  }

  const emptiedCart = {
    id: 'cart-1',
    itemCount: 0,
    subtotal: '0.00',
    savingTotal: '0.00',
    savedForLater: [],
    items: [],
  }

  beforeEach(() => {
    // A sibling describe, so the suite above's `beforeEach` does not run here:
    // seed the store explicitly or every "the cart emptied" assertion below is
    // vacuously true against a store the previous test already emptied.
    useCartStore.setState({
      items: [
        {
          id: 'server-1',
          productId: 'p',
          variantId: 'v',
          frameId: null,
          quantity: 1,
          productTitle: 'x',
          productSlug: 'x',
          thumbnailUrl: '',
          sizeLabel: 'A4',
          widthInches: 8,
          heightInches: 12,
          unitPrice: 100,
          framePrice: 0,
          isAiGenerated: false,
          addedAt: '2026-08-06T06:00:00.000Z',
        },
      ],
    })
    expect(useCartStore.getState().items).toHaveLength(1)
    vi.mocked(cartApi.get).mockResolvedValue(emptiedCart)
  })

  it('empties the shown cart when the customer dismisses the payment modal', async () => {
    ;(window as unknown as { Razorpay: unknown }).Razorpay = DismissedRazorpay

    render(
      <PaymentButton
        orderData={orderData}
        totalAmount={100}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
      { wrapper }
    )

    const payButton = await screen.findByRole('button', { name: /^Pay/ })
    await waitFor(() => expect(payButton).not.toBeDisabled())
    fireEvent.click(payButton)

    await waitFor(() => expect(cartApi.get).toHaveBeenCalled())
    // The order took these lines. Continuing to show them is what strands the
    // customer on a "Try Again" that can never succeed.
    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
    expect(cartApi.clear).not.toHaveBeenCalled()
  })

  it('re-reads the cart when the flow throws after the order was created', async () => {
    // Order creation succeeded — and emptied the cart — before this failed.
    vi.mocked(ordersApi.initiatePayment).mockRejectedValue(
      new Error('Payment gateway unavailable')
    )
    const onError = vi.fn()

    render(
      <PaymentButton
        orderData={orderData}
        totalAmount={100}
        onSuccess={vi.fn()}
        onError={onError}
      />,
      { wrapper }
    )

    const payButton = await screen.findByRole('button', { name: /^Pay/ })
    await waitFor(() => expect(payButton).not.toBeDisabled())
    fireEvent.click(payButton)

    await waitFor(() => expect(onError).toHaveBeenCalled())
    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
  })
})
