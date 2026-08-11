/**
 * Gift card purchase.
 *
 * The signature here is the preview: chobii sells art you hang on a wall, and
 * a gift card is the smallest thing in the catalogue that still gets handed
 * to someone. So it is drawn as the object it is — a small print, in the same
 * rounded language as a product card — and it fills in as the buyer types.
 * Everything around it stays quiet.
 *
 * Bounds are read from packages/shared, never retyped: a second copy of
 * "minimum ₹500" drifts the moment either side changes.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §5, §10
 */

import { useId, useMemo, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import {
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
  GIFT_CARD_MAX_SCHEDULE_DAYS,
} from '@chobii/shared'
import { cn, formatPrice } from '~/lib/utils'

const PRESETS_PAISE = [100_000, 250_000, 500_000, 1_000_000]

export interface GiftCardPurchaseInput {
  amountPaise: number
  recipientEmail: string
  recipientName: string
  senderName: string
  message?: string
  sendAt?: string
}

interface GiftCardPurchaseFormProps {
  onPurchase: (
    input: GiftCardPurchaseInput,
  ) => Promise<{ success: boolean; orderId?: string; error?: string }>
  /**
   * Put the card in the cart instead of buying it on its own (#579).
   *
   * Optional: without it the form still offers the standalone purchase it
   * always did, which is the only path a signed-out visitor has.
   */
  onAddToCart?: (
    input: GiftCardPurchaseInput,
  ) => Promise<{ success: boolean; error?: string }>
}

/** Rupees, no trailing decimals — the amounts here are always whole. */
function rupees(paise: number): string {
  return formatPrice(paise / 100).replace(/\.00$/, '')
}

export function GiftCardPurchaseForm({
  onPurchase,
  onAddToCart,
}: GiftCardPurchaseFormProps) {
  const ids = {
    custom: useId(),
    email: useId(),
    recipient: useId(),
    sender: useId(),
    message: useId(),
    sendAt: useId(),
  }

  const [presetPaise, setPresetPaise] = useState<number | null>(PRESETS_PAISE[0]!)
  const [customRupees, setCustomRupees] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [senderName, setSenderName] = useState('')
  const [message, setMessage] = useState('')
  const [sendAt, setSendAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** Which of the two buttons is in flight, so only that one shows a spinner. */
  const [pendingAction, setPendingAction] = useState<'buy' | 'cart' | null>(null)
  const [addedToCart, setAddedToCart] = useState(false)

  const amountPaise = useMemo(() => {
    if (customRupees.trim()) {
      const parsed = Number(customRupees)
      return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
    }
    return presetPaise ?? 0
  }, [customRupees, presetPaise])

  /**
   * Everything both buttons must agree on before anything is sent.
   *
   * Returns false and sets the message, so "add to cart" cannot accept a card
   * that "buy now" would refuse — two ways to buy the same instrument must not
   * disagree about what a valid one is (#579).
   */
  function validate(): boolean {

    if (amountPaise < GIFT_CARD_MIN_PAISE || amountPaise > GIFT_CARD_MAX_PAISE) {
      setError(
        `Choose an amount between ${rupees(GIFT_CARD_MIN_PAISE)} and ${rupees(GIFT_CARD_MAX_PAISE)}.`,
      )
      return false
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      setError("Check the recipient's email — that address is where the code is sent.")
      return false
    }

    if (!recipientName.trim() || !senderName.trim()) {
      setError('Add both names so the recipient knows who sent it.')
      return false
    }

    if (sendAt) {
      const chosen = new Date(sendAt).getTime()
      if (chosen > Date.now() + GIFT_CARD_MAX_SCHEDULE_DAYS * 86_400_000) {
        setError('Pick a send date within the next year.')
        return false
      }
    }

    return true
  }

  function currentInput(): GiftCardPurchaseInput {
    return {
      amountPaise,
      recipientEmail: recipientEmail.trim(),
      recipientName: recipientName.trim(),
      senderName: senderName.trim(),
      ...(message.trim() ? { message: message.trim() } : {}),
      ...(sendAt ? { sendAt: new Date(sendAt).toISOString() } : {}),
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isSubmitting) return
    if (!validate()) return

    setError(null)
    setIsSubmitting(true)
    setPendingAction('buy')

    try {
      const result = await onPurchase(currentInput())

      // Nothing is cleared on failure: retyping a message you already wrote
      // is the fastest way to lose a sale.
      if (!result.success) {
        setError(result.error ?? 'Could not start this purchase. Please try again.')
      }
    } catch {
      setError('Could not start this purchase. Please try again.')
    } finally {
      setIsSubmitting(false)
      setPendingAction(null)
    }
  }

  /**
   * Put the card in the cart instead of buying it on its own.
   *
   * The same validation and the same payload — only the destination differs.
   */
  async function handleAddToCart() {
    if (!onAddToCart || isSubmitting) return
    if (!validate()) return

    setError(null)
    setAddedToCart(false)
    setIsSubmitting(true)
    setPendingAction('cart')

    try {
      const result = await onAddToCart(currentInput())

      if (result.success) {
        setAddedToCart(true)
      } else {
        setError(result.error ?? 'Could not add this card to your cart.')
      }
    } catch {
      setError('Could not add this card to your cart.')
    } finally {
      setIsSubmitting(false)
      setPendingAction(null)
    }
  }

  const fieldClass = cn(
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm',
    'transition-colors hover:border-foreground/30',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  )
  const labelClass = 'mb-1.5 block text-sm font-medium text-foreground'

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
      {/* The card itself, filling in as it is written. */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div
          data-testid="gift-card-preview"
          className="relative flex aspect-[5/7] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-muted/40 p-6 sm:p-8"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              chobii.art
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Gift card</p>
          </div>

          <p className="font-heading text-5xl font-medium text-foreground sm:text-6xl">
            {rupees(amountPaise)}
          </p>

          <div className="space-y-1 text-sm">
            <p className="text-foreground">
              For {recipientName.trim() || 'someone'}
            </p>
            {message.trim() && (
              <p className="italic text-muted-foreground">
                &ldquo;{message.trim()}&rdquo;
              </p>
            )}
            <p className="text-muted-foreground">
              From {senderName.trim() || 'you'}
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          A chobii.art gift card never expires, and it can be spent across
          several orders — whatever is left stays on the card.
        </p>
      </div>

      {/*
        noValidate: this form validates itself, so every problem is reported
        in one voice and one place. Native bubbles would compete with the
        message below and say something different about the same field.
      */}
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <fieldset>
          <legend className={labelClass}>Amount</legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS_PAISE.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setPresetPaise(preset)
                  setCustomRupees('')
                  setError(null)
                }}
                className={cn(
                  'rounded-pill border px-4 py-2 text-sm font-medium transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  !customRupees && presetPaise === preset
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input text-foreground hover:border-foreground/40',
                )}
              >
                {rupees(preset)}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <label htmlFor={ids.custom} className="sr-only">
              Custom amount in rupees
            </label>
            <input
              id={ids.custom}
              type="number"
              inputMode="numeric"
              value={customRupees}
              onChange={(event) => {
                setCustomRupees(event.target.value)
                setError(null)
              }}
              placeholder={`Custom amount (${rupees(GIFT_CARD_MIN_PAISE)}–${rupees(GIFT_CARD_MAX_PAISE)})`}
              className={fieldClass}
            />
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.recipient} className={labelClass}>
              Recipient&rsquo;s name
            </label>
            <input
              id={ids.recipient}
              type="text"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor={ids.sender} className={labelClass}>
              Your name
            </label>
            <input
              id={ids.sender}
              type="text"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor={ids.email} className={labelClass}>
            Recipient&rsquo;s email
          </label>
          <input
            id={ids.email}
            type="email"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            className={fieldClass}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            The code is sent here, once. We cannot resend it, so check the
            address.
          </p>
        </div>

        <div>
          <label htmlFor={ids.message} className={labelClass}>
            Message <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id={ids.message}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
            rows={3}
            className={cn(fieldClass, 'resize-none')}
          />
        </div>

        <div>
          <label htmlFor={ids.sendAt} className={labelClass}>
            Send on <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id={ids.sendAt}
            type="date"
            value={sendAt}
            onChange={(event) => {
              setSendAt(event.target.value)
              setError(null)
            }}
            className={fieldClass}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Leave empty to send as soon as payment goes through.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-sm text-red-500"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {addedToCart && (
          <p
            role="status"
            className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
          >
            Added to your cart.{' '}
            <a href="/cart" className="underline underline-offset-4">
              View cart
            </a>
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-pill py-3 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            isSubmitting
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/85',
          )}
        >
          {pendingAction === 'buy' && <Loader2 className="h-4 w-4 animate-spin" />}
          Continue to payment
        </button>

        {/*
          Buying the card with everything else — one order, one payment, one
          receipt (#579). Offered only when the page passes a handler, which
          it does for a signed-in customer.
        */}
        {onAddToCart && (
          <button
            type="button"
            onClick={() => void handleAddToCart()}
            disabled={isSubmitting}
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-2 rounded-pill border py-3 text-sm font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              isSubmitting
                ? 'cursor-not-allowed border-border bg-muted text-muted-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted',
            )}
          >
            {pendingAction === 'cart' && <Loader2 className="h-4 w-4 animate-spin" />}
            Add to cart
          </button>
        )}
      </form>
    </div>
  )
}
