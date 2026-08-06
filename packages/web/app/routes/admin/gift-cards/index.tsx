/**
 * Admin Gift Cards - chobii.art
 *
 * Outstanding liability sits at the top because it is the question this page
 * exists to answer: unredeemed cards are money the business owes, and until
 * now nothing could total it.
 *
 * Search accepts a full code or the last four. A full code is hashed
 * server-side and looked up; it is never returned, so this page can find a
 * card from a code but can never hand one back out.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §9
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertCircle, Gift, Plus, RefreshCw, Search } from 'lucide-react'

import { cn, formatPrice, getApiUrl } from '~/lib/utils'
import {
  IssueGiftCardDialog,
  type IssueGiftCardInput,
} from '~/components/admin/IssueGiftCardDialog'

/**
 * Search params arrive as strings — the router serializes them that way — so
 * `page` is coerced rather than declared a number and trusted.
 */
const searchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  q: z.string().optional(),
})

export const Route = createFileRoute('/admin/gift-cards/')({
  validateSearch: searchSchema,
  component: AdminGiftCardsPage,
})

interface GiftCardRow {
  id: string
  last4: string
  balancePaise: number
  initialBalancePaise: number
  status: 'active' | 'spent' | 'disabled' | 'expired'
  recipientEmail: string | null
  purchaseOrderId: string | null
  createdAt: string
}

const STATUS_STYLES: Record<GiftCardRow['status'], string> = {
  active: 'bg-green-50 text-green-700',
  spent: 'bg-muted text-muted-foreground',
  disabled: 'bg-red-50 text-red-700',
  expired: 'bg-amber-50 text-amber-700',
}

function AdminGiftCardsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const [rows, setRows] = useState<GiftCardRow[]>([])
  const [total, setTotal] = useState(0)
  const [liabilityPaise, setLiabilityPaise] = useState<number | null>(null)
  const [query, setQuery] = useState(search.q ?? '')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isIssuing, setIsIssuing] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ page: String(search.page) })
      if (search.q) params.set('q', search.q)

      const [listResponse, liabilityResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/admin/gift-cards?${params}`, {
          credentials: 'include',
        }),
        fetch(`${getApiUrl()}/api/admin/gift-cards/liability`, {
          credentials: 'include',
        }),
      ])

      if (!listResponse.ok) throw new Error('Could not load gift cards')

      const list = (await listResponse.json()) as {
        giftCards: GiftCardRow[]
        pagination: { total: number }
      }
      setRows(list.giftCards)
      setTotal(list.pagination.total)

      if (liabilityResponse.ok) {
        const liability = (await liabilityResponse.json()) as {
          liabilityPaise: number
        }
        setLiabilityPaise(liability.liabilityPaise)
      }
    } catch {
      setError('Could not load gift cards.')
    } finally {
      setIsLoading(false)
    }
  }, [search.page, search.q])

  useEffect(() => {
    void load()
  }, [load])

  async function handleIssue(input: IssueGiftCardInput) {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/gift-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        return { success: false, error: body?.error ?? 'Could not issue the card.' }
      }

      const body = (await response.json()) as {
        code: string
        giftCard: { id: string }
      }

      void load()
      return { success: true, code: body.code, giftCardId: body.giftCard.id }
    } catch {
      return { success: false, error: 'Could not issue the card.' }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-medium text-foreground">
            Gift cards
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} card{total === 1 ? '' : 's'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsIssuing(true)}
          className="flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Issue a card
        </button>
      </div>

      {/* The number nobody could previously answer. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gift className="h-4 w-4" />
          Outstanding liability
        </div>
        <p
          data-testid="gift-card-liability"
          className="mt-1 font-heading text-3xl font-medium text-foreground"
        >
          {liabilityPaise === null
            ? '—'
            : formatPrice(liabilityPaise / 100)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Unredeemed balance across every card that can still be spent.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void navigate({
            to: '/admin/gift-cards',
            search: { page: 1, ...(query.trim() ? { q: query.trim() } : {}) },
          })
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Full code or last four"
            aria-label="Search gift cards"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
        </div>
        <button
          type="submit"
          className="rounded-pill border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh"
          className="rounded-pill border border-input px-3 py-2 text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
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
              <th className="px-4 py-3 font-medium">Card</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Issued for</th>
              <th className="px-4 py-3 font-medium">Recipient</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {search.q
                    ? 'No card matches that code.'
                    : 'No gift cards yet.'}
                </td>
              </tr>
            )}

            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link
                    to="/admin/gift-cards/$id"
                    params={{ id: row.id }}
                    className="font-mono text-foreground underline underline-offset-4"
                  >
                    •••• {row.last4}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-pill px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[row.status],
                    )}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground">
                  {formatPrice(row.balancePaise / 100)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatPrice(row.initialBalancePaise / 100)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.recipientEmail ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isIssuing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6">
            <IssueGiftCardDialog
              onIssue={handleIssue}
              onClose={() => setIsIssuing(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
