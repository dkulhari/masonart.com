/**
 * Issue a gift card by hand.
 *
 * Support goodwill, compensation, or replacing a card whose email was lost.
 *
 * Only the hash of a code is stored, so the code this dialog shows after
 * issuing is the only copy that will ever exist. That is stated next to the
 * code rather than in a tooltip, because an admin who closes this without
 * copying has to disable the card and issue another.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §9
 */

import { useId, useState } from 'react'
import { AlertCircle, Check, Copy, Loader2 } from 'lucide-react'
import {
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
} from '@chobii/shared'
import { cn, formatPrice } from '~/lib/utils'

export interface IssueGiftCardInput {
  amountPaise: number
  reason: string
  recipientEmail?: string
  recipientName?: string
}

interface IssueGiftCardDialogProps {
  onIssue: (input: IssueGiftCardInput) => Promise<{
    success: boolean
    code?: string
    giftCardId?: string
    error?: string
  }>
  onClose: () => void
}

function rupees(paise: number): string {
  return formatPrice(paise / 100).replace(/\.00$/, '')
}

export function IssueGiftCardDialog({
  onIssue,
  onClose,
}: IssueGiftCardDialogProps) {
  const ids = {
    amount: useId(),
    reason: useId(),
    email: useId(),
    name: useId(),
  }

  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isIssuing, setIsIssuing] = useState(false)
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleIssue(event: React.FormEvent) {
    event.preventDefault()
    if (isIssuing) return

    const amountPaise = Math.round(Number(amount) * 100)

    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      setError('Enter an amount.')
      return
    }

    if (!reason.trim()) {
      // Required because this creates money from nothing, and a balance
      // change nobody explained cannot be audited later.
      setError('Say why this card is being issued.')
      return
    }

    setError(null)
    setIsIssuing(true)

    try {
      const result = await onIssue({
        amountPaise,
        reason: reason.trim(),
        ...(recipientEmail.trim() ? { recipientEmail: recipientEmail.trim() } : {}),
        ...(recipientName.trim() ? { recipientName: recipientName.trim() } : {}),
      })

      if (result.success && result.code) {
        setIssuedCode(result.code)
      } else {
        setError(result.error ?? 'Could not issue the card.')
      }
    } catch {
      setError('Could not issue the card.')
    } finally {
      setIsIssuing(false)
    }
  }

  const fieldClass = cn(
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  )
  const labelClass = 'mb-1.5 block text-sm font-medium text-foreground'

  // Once the card exists the form is gone: issuing twice by mistake creates a
  // second card and a second liability.
  if (issuedCode) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading text-lg font-medium text-foreground">
            Card issued
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give this code to the customer now. We cannot show it again — only
            a hash is stored, so it cannot be looked up or resent. If it is
            lost, disable this card and issue another.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3">
          <code className="font-mono text-lg tracking-wider text-foreground">
            {issuedCode}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(issuedCode)
              setCopied(true)
            }}
            className="flex items-center gap-1.5 rounded-pill border border-input px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-pill bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleIssue} noValidate className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-medium text-foreground">
          Issue a gift card
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates spendable balance. The code is shown once, here.
        </p>
      </div>

      <div>
        <label htmlFor={ids.amount} className={labelClass}>
          Amount (₹)
        </label>
        <input
          id={ids.amount}
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value)
            setError(null)
          }}
          placeholder={`${rupees(GIFT_CARD_MIN_PAISE)} – ${rupees(GIFT_CARD_MAX_PAISE)}`}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor={ids.reason} className={labelClass}>
          Reason
        </label>
        <input
          id={ids.reason}
          type="text"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setError(null)
          }}
          placeholder="Goodwill for a delayed order"
          className={fieldClass}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Recorded on the card&rsquo;s ledger.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.name} className={labelClass}>
            Recipient name <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id={ids.name}
            type="text"
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={ids.email} className={labelClass}>
            Recipient email <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id={ids.email}
            type="email"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-red-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-pill border border-input py-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isIssuing}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-pill py-2.5 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            isIssuing
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/85',
          )}
        >
          {isIssuing && <Loader2 className="h-4 w-4 animate-spin" />}
          Issue card
        </button>
      </div>
    </form>
  )
}
