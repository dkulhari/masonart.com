/**
 * Admin Gift Card Detail - chobii.art
 *
 * The card, its full ledger, and the two things an admin can do to it:
 * disable it, or correct its balance.
 *
 * The ledger is the whole point of the page. Every balance change in this
 * feature writes a row, so what a card is worth today can always be
 * reconciled against how it got there.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §9
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft } from 'lucide-react'

import { cn, formatPrice, getApiUrl } from '~/lib/utils'

export const Route = createFileRoute('/admin/gift-cards/$id')({
  component: AdminGiftCardDetailPage,
})

interface LedgerEntry {
  id: string
  type: 'issue' | 'redeem' | 'refund' | 'adjustment' | 'void'
  amountPaise: number
  balanceAfterPaise: number
  orderId: string | null
  description: string
  createdAt: string
}

interface GiftCardDetail {
  id: string
  last4: string
  balancePaise: number
  initialBalancePaise: number
  status: 'active' | 'spent' | 'disabled' | 'expired'
  recipientEmail: string | null
  recipientName: string | null
  purchaseOrderId: string | null
  disabledAt: string | null
  sentAt: string | null
  createdAt: string
}

/** Positive entries add to the balance; the type says which way it went. */
const CREDIT_TYPES = new Set(['issue', 'refund', 'void', 'adjustment'])

function AdminGiftCardDetailPage() {
  const { id } = Route.useParams()

  const [card, setCard] = useState<GiftCardDetail | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/gift-cards/${id}`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('not found')

      const body = (await response.json()) as {
        giftCard: GiftCardDetail
        ledger: LedgerEntry[]
      }
      setCard(body.giftCard)
      setLedger(body.ledger)
      setError(null)
    } catch {
      setError('Could not load this gift card.')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function post(path: string, body?: unknown) {
    setIsWorking(true)
    try {
      const response = await fetch(
        `${getApiUrl()}/api/admin/gift-cards/${id}${path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body ?? {}),
        },
      )

      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        setError(failure?.error ?? 'That did not work.')
        return false
      }

      setError(null)
      await load()
      return true
    } finally {
      setIsWorking(false)
    }
  }

  if (!card) {
    return (
      <div className="space-y-4">
        <BackLink />
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="rounded-xl border border-border bg-card p-5">
        <p className="font-mono text-lg text-foreground">•••• {card.last4}</p>
        <p className="mt-2 font-heading text-3xl font-medium text-foreground">
          {formatPrice(card.balancePaise / 100)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          of {formatPrice(card.initialBalancePaise / 100)} · {card.status}
        </p>

        {card.recipientEmail && (
          <p className="mt-3 text-sm text-muted-foreground">
            Sent to {card.recipientEmail}
            {card.sentAt ? '' : ' — not delivered yet'}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={isWorking}
            onClick={() =>
              void post(card.disabledAt ? '/enable' : '/disable')
            }
            className="rounded-pill border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {card.disabledAt ? 'Enable card' : 'Disable card'}
          </button>
        </div>
      </div>

      {/* Correcting a balance is the only action here that creates money. */}
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          const amountPaise = Math.round(Number(adjustAmount) * 100)
          if (!Number.isFinite(amountPaise) || amountPaise === 0) {
            setError('Enter an amount to add or take off.')
            return
          }
          if (!adjustReason.trim()) {
            setError('Say why this balance is changing.')
            return
          }
          const ok = await post('/adjust', {
            amountPaise,
            reason: adjustReason.trim(),
          })
          if (ok) {
            setAdjustAmount('')
            setAdjustReason('')
          }
        }}
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 className="font-heading text-base font-medium text-foreground">
          Correct the balance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use a negative amount to take money off. Recorded on the ledger with
          your reason.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr_auto]">
          <input
            type="number"
            value={adjustAmount}
            onChange={(event) => setAdjustAmount(event.target.value)}
            placeholder="₹"
            aria-label="Adjustment amount in rupees"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="text"
            value={adjustReason}
            onChange={(event) => setAdjustReason(event.target.value)}
            placeholder="Reason"
            aria-label="Reason for the adjustment"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={isWorking}
            className="rounded-pill bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            Apply
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">What</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Balance after</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => (
              <tr key={entry.id} className="border-t border-border">
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-foreground">{entry.type}</td>
                <td
                  className={cn(
                    'px-4 py-3',
                    CREDIT_TYPES.has(entry.type)
                      ? 'text-green-700'
                      : 'text-foreground',
                  )}
                >
                  {CREDIT_TYPES.has(entry.type) ? '+' : '−'}
                  {formatPrice(entry.amountPaise / 100)}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {formatPrice(entry.balanceAfterPaise / 100)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {entry.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/admin/gift-cards"
      search={{ page: 1 }}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All gift cards
    </Link>
  )
}
