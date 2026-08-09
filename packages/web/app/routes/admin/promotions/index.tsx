/**
 * Admin — sale promotions.
 *
 * ## `isActive` is read, never re-derived
 *
 * There is no status column. The API decides whether a promotion is running,
 * from `isEnabled` plus the window, in `isPromotionActive` — the same function
 * the storefront resolver uses. Recomputing it here would give the admin a
 * second opinion, and the moment the two disagree the screen is lying about
 * what shoppers can see. The badge below only fills in the shades the API does
 * not name: a promotion that is not active is either scheduled, ended, or off.
 *
 * ## Enable and disable are their own buttons
 *
 * Not a PATCH of `isEnabled`. #431 gave them dedicated endpoints because
 * killing a live sale is the one thing an admin does in a hurry, and it should
 * not require round-tripping a whole valid promotion body to do it.
 *
 * ## The search params go through app/router.tsx
 *
 * That router keeps every param a string and stringifies with `String(value)`,
 * so `scope: ['all','products']` arrives as `?scope=all,products`. The schema
 * below splits it back, and `.catch()` guards every field: a hand-mangled URL
 * should drop the filter, not error-boundary the route into a blank page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Pencil, Plus, Power, PowerOff, RefreshCw, Trash2 } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'

// ============================================================================
// Route configuration
// ============================================================================

const SCOPE_TYPES = ['all', 'filter', 'products'] as const
const PROMOTION_STATES = ['live', 'scheduled', 'ended', 'off'] as const

/**
 * Accept both shapes: the real array a `navigate({ search })` call passes and
 * the comma-joined string it becomes once it has been through the URL.
 *
 * Copied from the /admin/customers role filter, which hit this first.
 */
const scopeListParam = z
  .preprocess(
    (value) => {
      if (value === undefined || value === '') return undefined
      if (Array.isArray(value)) return value
      if (typeof value === 'string') return value.split(',').filter(Boolean)
      return value
    },
    z.array(z.enum(SCOPE_TYPES)).min(1).optional()
  )
  .catch(undefined)

export const promotionsSearchSchema = z.object({
  search: z.string().optional().catch(undefined),
  state: z.enum(PROMOTION_STATES).optional().catch(undefined),
  scope: scopeListParam,
})

export type PromotionsSearch = z.infer<typeof promotionsSearchSchema>

export const Route = createFileRoute('/admin/promotions/')({
  validateSearch: (search) => promotionsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Promotions | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminPromotionsPage,
})

// ============================================================================
// Types — the #431 payload, verbatim
// ============================================================================

export interface AdminPromotion {
  id: string
  name: string
  headline: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  scopeType: (typeof SCOPE_TYPES)[number]
  scopeFilter: Record<string, unknown> | null
  membersOnly: boolean
  startsAt: string
  endsAt: string | null
  isEnabled: boolean
  /** Derived server-side. No column backs it, and nothing here recomputes it. */
  isActive: boolean
  priority: number
  perCustomerOrderLimit: number | null
  countdownMode: 'real' | 'rolling'
  rollingWindowMinutes: number
  rollingJitterMinutes: number
  productIds: string[]
  excludedProductIds: string[]
  createdAt: string
  updatedAt: string
}

export type PromotionState = (typeof PROMOTION_STATES)[number]

// ============================================================================
// Derived state
// ============================================================================

/**
 * Which of four words describes this row.
 *
 * `off` beats everything: a disabled promotion inside its window is still
 * showing nothing to anybody. Otherwise the API's `isActive` settles `live`,
 * and only the remaining case — enabled but not active — needs the clock, to
 * say which side of the window we are on.
 */
export function promotionState(
  promotion: AdminPromotion,
  now: Date = new Date()
): PromotionState {
  if (!promotion.isEnabled) return 'off'
  if (promotion.isActive) return 'live'
  return new Date(promotion.startsAt).getTime() > now.getTime()
    ? 'scheduled'
    : 'ended'
}

const STATE_LABEL: Record<PromotionState, string> = {
  live: 'Live',
  scheduled: 'Scheduled',
  ended: 'Ended',
  off: 'Off',
}

const STATE_CLASS: Record<PromotionState, string> = {
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700',
  scheduled: 'border-sky-500/40 bg-sky-500/10 text-sky-700',
  ended: 'border-border bg-muted text-muted-foreground',
  off: 'border-border bg-muted text-muted-foreground',
}

function describeDepth(promotion: AdminPromotion): string {
  return promotion.discountType === 'percentage'
    ? `${promotion.discountValue}%`
    : `₹${promotion.discountValue}`
}

function describeScope(promotion: AdminPromotion): string {
  switch (promotion.scopeType) {
    case 'all':
      return 'Everything'
    case 'filter':
      return 'A filter'
    case 'products':
      return `${promotion.productIds.length} ${
        promotion.productIds.length === 1 ? 'product' : 'products'
      }`
  }
}

function describeWindow(promotion: AdminPromotion): string {
  const start = new Date(promotion.startsAt).toLocaleDateString()
  return promotion.endsAt
    ? `${start} → ${new Date(promotion.endsAt).toLocaleDateString()}`
    : `${start} → no end`
}

// ============================================================================
// Empty state
// ============================================================================

/**
 * The honest empty state.
 *
 * §6 of the design: no active promotion means no strip, no countdown, no
 * badges, and the announcement bar back on shipping and returns. So this panel
 * is not just "you have not made one yet" — it is a live report of what the
 * storefront currently looks like.
 */
export function PromotionsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      data-testid="promotions-empty"
      className="rounded-lg border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="mb-1 font-medium">No sale is running.</p>
      <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
        That is exactly what the storefront is showing: no sale strip, no
        countdown, no discount badges, and the announcement bar back on shipping
        and returns.
      </p>
      <Button onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" />
        New promotion
      </Button>
    </div>
  )
}

// ============================================================================
// Table
// ============================================================================

export interface PromotionsTableProps {
  promotions: AdminPromotion[]
  now: Date
  /** The row with a request in flight, so only its own controls go quiet. */
  busyId: string | null
  onToggle: (promotion: AdminPromotion, enable: boolean) => void
  onDelete: (promotion: AdminPromotion) => void
  onEdit: (promotion: AdminPromotion) => void
}

export function PromotionsTable({
  promotions,
  now,
  busyId,
  onToggle,
  onDelete,
  onEdit,
}: PromotionsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-testid="admin-promotions-table">
        <thead className="border-b border-border bg-muted/40 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Promotion</th>
            <th className="px-4 py-3 font-medium">Off</th>
            <th className="px-4 py-3 font-medium">Applies to</th>
            <th className="px-4 py-3 font-medium">Window</th>
            <th className="px-4 py-3 font-medium">State</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {promotions.map((promotion) => {
            const state = promotionState(promotion, now)
            const busy = busyId === promotion.id

            return (
              <tr
                key={promotion.id}
                data-testid={`promotion-row-${promotion.id}`}
                className={cn(
                  'border-b border-border last:border-0',
                  state !== 'live' && 'opacity-70'
                )}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{promotion.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {promotion.headline}
                  </div>
                  {promotion.membersOnly && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Members only
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">
                  {describeDepth(promotion)}
                </td>
                <td className="px-4 py-3">
                  {describeScope(promotion)}
                  {promotion.excludedProductIds.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      less {promotion.excludedProductIds.length} excluded
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {describeWindow(promotion)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-xs',
                      STATE_CLASS[state]
                    )}
                  >
                    {STATE_LABEL[state]}
                  </span>
                </td>
                <td className="px-4 py-3">{promotion.priority}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => onEdit(promotion)}
                      aria-label={`Edit ${promotion.name}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onToggle(promotion, !promotion.isEnabled)}
                      aria-label={
                        promotion.isEnabled
                          ? `Turn off ${promotion.name}`
                          : `Turn on ${promotion.name}`
                      }
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      {promotion.isEnabled ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        /**
                         * Confirm first. DELETE cascades the pinned and the
                         * excluded sets, so the curation of who was in the sale
                         * and who was kept out goes with it.
                         */
                        const confirmed = window.confirm(
                          `Delete “${promotion.name}”? Its product and exclusion lists go with it. This cannot be undone.`
                        )
                        if (confirmed) onDelete(promotion)
                      }}
                      aria-label={`Delete ${promotion.name}`}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

function AdminPromotionsPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  const [promotions, setPromotions] = useState<AdminPromotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/promotions`, {
        // Without this every request is a 401 — the session cookie is the only
        // thing the role gate reads.
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to load promotions')
      setPromotions((await response.json()) as AdminPromotion[])
      setNow(new Date())
      setError(null)
    } catch (loadError) {
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = useCallback(
    async (promotion: AdminPromotion, enable: boolean) => {
      setBusyId(promotion.id)
      const base = `${getApiUrl()}/api/admin/promotions/${promotion.id}`
      try {
        const response = await fetch(
          enable ? `${base}/enable` : `${base}/disable`,
          { method: 'POST', credentials: 'include' }
        )
        if (!response.ok) throw new Error('Failed to change the promotion')
        await load()
      } catch (toggleError) {
        setError((toggleError as Error).message)
      } finally {
        setBusyId(null)
      }
    },
    [load]
  )

  const remove = useCallback(
    async (promotion: AdminPromotion) => {
      setBusyId(promotion.id)
      try {
        const response = await fetch(
          `${getApiUrl()}/api/admin/promotions/${promotion.id}`,
          { method: 'DELETE', credentials: 'include' }
        )
        if (!response.ok) throw new Error('Failed to delete the promotion')
        await load()
      } catch (deleteError) {
        setError((deleteError as Error).message)
      } finally {
        setBusyId(null)
      }
    },
    [load]
  )

  const setSearch = useCallback(
    (updates: Partial<PromotionsSearch>) => {
      navigate({
        to: '/admin/promotions',
        search: (prev: PromotionsSearch) => ({ ...prev, ...updates }),
      })
    },
    [navigate]
  )

  const visible = useMemo(() => {
    const needle = search.search?.trim().toLowerCase()
    return promotions.filter((promotion) => {
      if (search.state && promotionState(promotion, now) !== search.state) {
        return false
      }
      if (search.scope && !search.scope.includes(promotion.scopeType)) {
        return false
      }
      if (
        needle &&
        !`${promotion.name} ${promotion.headline}`.toLowerCase().includes(needle)
      ) {
        return false
      }
      return true
    })
  }, [promotions, search.search, search.state, search.scope, now])

  const liveCount = promotions.filter(
    (promotion) => promotionState(promotion, now) === 'live'
  ).length

  const openEditor = useCallback(
    (id: string) =>
      navigate({ to: '/admin/promotions/$id', params: { id } }),
    [navigate]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Promotions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One sale at a time is the usual case. Priority decides which one
            wins when more than one is running.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => openEditor('new')}>
            <Plus className="mr-2 h-4 w-4" />
            New promotion
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {error}
        </div>
      )}

      {!isLoading && promotions.length > 0 && liveCount === 0 && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          No sale is running right now, so the storefront is showing no strip,
          no countdown and no discount badges.
        </div>
      )}

      {promotions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="w-56 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Search name or headline"
            aria-label="Search promotions"
            value={search.search ?? ''}
            onChange={(event) =>
              setSearch({ search: event.target.value || undefined })
            }
          />
          <select
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-label="Filter by state"
            value={search.state ?? ''}
            onChange={(event) =>
              setSearch({
                state: (event.target.value || undefined) as
                  | PromotionState
                  | undefined,
              })
            }
          >
            <option value="">Any state</option>
            {PROMOTION_STATES.map((state) => (
              <option key={state} value={state}>
                {STATE_LABEL[state]}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-label="Filter by scope"
            value={search.scope?.[0] ?? ''}
            onChange={(event) =>
              setSearch({
                scope: event.target.value
                  ? [event.target.value as AdminPromotion['scopeType']]
                  : undefined,
              })
            }
          >
            <option value="">Any scope</option>
            <option value="all">Everything</option>
            <option value="filter">A filter</option>
            <option value="products">Hand-picked</option>
          </select>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading promotions…</p>
      ) : promotions.length === 0 ? (
        <PromotionsEmpty onCreate={() => openEditor('new')} />
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No promotion matches this filter.
        </p>
      ) : (
        <PromotionsTable
          promotions={visible}
          now={now}
          busyId={busyId}
          onToggle={(promotion, enable) => void toggle(promotion, enable)}
          onDelete={(promotion) => void remove(promotion)}
          onEdit={(promotion) => openEditor(promotion.id)}
        />
      )}
    </div>
  )
}
