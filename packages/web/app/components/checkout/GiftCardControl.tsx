/**
 * Gift card entry at checkout.
 *
 * Its own control, deliberately not the dormant coupon input in
 * OrderSummary: there are no coupon codes in this system, and one box
 * labelled for both would promise something that does not exist.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §7, §10
 */

import { useId, useState } from 'react'
import { AlertCircle, Gift, Loader2, X } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'

export interface AppliedGiftCard {
  giftCardId: string
  last4: string
  amountPaise: number
}

interface GiftCardControlProps {
  /** Cards already applied to this order. */
  appliedCards: AppliedGiftCard[]
  /** Quote a code. Resolves with an error message the server chose. */
  onApply: (code: string) => Promise<{ success: boolean; error?: string }>
  onRemove: (giftCardId: string) => void
  className?: string
}

export function GiftCardControl({
  appliedCards,
  onApply,
  onRemove,
  className,
}: GiftCardControlProps) {
  const inputId = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  async function handleApply() {
    if (!code.trim() || isApplying) return

    setIsApplying(true)
    setError(null)

    try {
      const result = await onApply(code.trim())
      if (result.success) {
        setCode('')
      } else {
        // Surface the server's message verbatim. It says the same thing for
        // unknown, disabled and expired on purpose — distinguishing them
        // would let someone enumerate which codes exist.
        setError(result.error ?? 'This gift card cannot be used')
      }
    } catch {
      setError('Could not check that gift card. Please try again.')
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className={cn('border-t border-border px-4 py-4', className)}>
      <label
        htmlFor={inputId}
        className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground"
      >
        <Gift className="h-4 w-4" />
        Gift card
      </label>

      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase())
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleApply()
            }
          }}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className={cn(
            'w-full flex-1 rounded-lg border bg-background px-3 py-2 text-sm uppercase transition-colors',
            'placeholder:normal-case placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            error ? 'border-red-500' : 'border-input hover:border-foreground/30',
          )}
        />
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={!code.trim() || isApplying}
          className={cn(
            'rounded-pill border border-primary px-4 py-2 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            !code.trim() || isApplying
              ? 'cursor-not-allowed border-muted bg-muted text-muted-foreground'
              : 'bg-transparent text-primary hover:bg-primary hover:text-primary-foreground',
          )}
        >
          {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
        </button>
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {appliedCards.length > 0 && (
        <ul className="mt-3 space-y-2">
          {appliedCards.map((card) => (
            <li
              key={card.giftCardId}
              className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="text-foreground">
                Gift card •••• {card.last4}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  −{formatPrice(card.amountPaise / 100)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(card.giftCardId)}
                  aria-label={`Remove gift card ending ${card.last4}`}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        A gift card never expires. Spend part of it now and the rest stays on
        the card for next time.
      </p>
    </div>
  )
}
