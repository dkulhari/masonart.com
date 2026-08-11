/**
 * Gift Cards - chobii.art
 *
 * Buying a gift card does not go through the cart: a cart line needs a real
 * product and variant behind it, and neither exists for an amount the
 * customer typed. This page posts its own order and hands the id straight to
 * the existing payment flow.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §5, §10
 */

import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

import {
  GiftCardPurchaseForm,
  type GiftCardPurchaseInput,
} from '~/components/gift-cards/GiftCardPurchaseForm'
import { PaymentButton } from '~/components/checkout/PaymentButton'
import { getApiUrl } from '~/lib/utils'
import { cartKeys } from '~/hooks/useCart'

export const Route = createFileRoute('/gift-cards/')({
  head: () => ({
    meta: [
      { title: 'Gift Cards | chobii.art' },
      {
        name: 'description',
        content:
          'Send a chobii.art gift card by email. Choose the amount, add a message, and pick when it arrives. It never expires.',
      },
    ],
  }),
  component: GiftCardsPage,
})

function GiftCardsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<{
    orderId: string
    amountRupees: number
  } | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  async function handlePurchase(input: GiftCardPurchaseInput) {
    try {
      const response = await fetch(`${getApiUrl()}/api/gift-cards/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (response.status === 401) {
        return {
          success: false,
          error: 'Sign in to buy a gift card — we send the receipt to your account.',
        }
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        return {
          success: false,
          error: body?.error ?? 'Could not start this purchase. Please try again.',
        }
      }

      const { orderId } = (await response.json()) as { orderId: string }

      // The card is minted only once this order is paid, so the last step is
      // the same Razorpay flow every other order uses — pointed at the order
      // this page just created rather than at the cart.
      setPending({ orderId, amountRupees: input.amountPaise / 100 })

      return { success: true, orderId }
    } catch {
      return {
        success: false,
        error: 'Could not reach the server. Please try again.',
      }
    }
  }

  /**
   * Put the card in the cart instead of buying it on its own (#579).
   *
   * The cart is the server's, so this needs no local projection: `CartSync`
   * refetches and the line appears with the posters already there. A signed-out
   * visitor gets a 401 and the standalone purchase above, which is the path
   * that existed before mixed carts.
   */
  async function handleAddToCart(input: GiftCardPurchaseInput) {
    try {
      const response = await fetch(`${getApiUrl()}/api/cart/gift-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        return {
          success: false,
          error: body?.error ?? 'Could not add this card to your cart.',
        }
      }

      // The cart badge and drawer read the server cart through CartSync.
      await queryClient.invalidateQueries({ queryKey: cartKeys.all })

      return { success: true }
    } catch {
      return {
        success: false,
        error: 'Could not reach the server. Please try again.',
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="mb-10 max-w-2xl lg:mb-14">
        <h1 className="font-heading text-display font-medium text-foreground">
          Give a wall, not a thing
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Let them pick the print. Choose an amount, write a line, and we email
          the card on the day you choose.
        </p>
      </header>

      {pending ? (
        <div className="mx-auto max-w-md">
          <p className="mb-4 text-sm text-muted-foreground">
            Your gift card order is ready. Pay to send it.
          </p>

          <PaymentButton
            existingOrderId={pending.orderId}
            totalAmount={pending.amountRupees}
            onSuccess={(_orderId, orderNumber) =>
              void navigate({
                to: '/checkout/success',
                search: { orderNumber },
              })
            }
            onError={setPaymentError}
          />

          {paymentError && (
            <p role="alert" className="mt-3 text-sm text-red-500">
              {paymentError}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setPending(null)
              setPaymentError(null)
            }}
            className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Change the card
          </button>
        </div>
      ) : (
        <GiftCardPurchaseForm
          onPurchase={handlePurchase}
          onAddToCart={handleAddToCart}
        />
      )}
    </main>
  )
}
