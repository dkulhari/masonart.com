/**
 * Admin Audit Log — chobii.art
 *
 * Who did what, to what, when, and from where. The list answers "what happened
 * today"; the detail panel answers "what exactly changed", which is the part a
 * refund dispute or an access review actually turns on.
 *
 * ## The search schema is lenient on purpose
 *
 * `router.tsx` keeps every search value a STRING, and a throw inside
 * `validateSearch` error-boundaries the route to a blank page. So this schema
 * coerces and `.catch()`es rather than rejecting — deliberately unlike the API's
 * `auditLogQuerySchema`, which answers 400 to a bad filter. That difference is
 * the right one: an API caller sending `category=everything` has a bug worth
 * surfacing, while a stale bookmark should just show the first page. An unknown
 * value is dropped here rather than forwarded, because a 400 rendered as an
 * empty table would read as "nothing ever happened" — the worst possible lie
 * from an audit log.
 *
 * Design: docs/plans/2026-08-17-logging-and-auditing.md §3.7
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertCircle, RefreshCw, Search, ShieldAlert } from 'lucide-react'

import { cn, getApiUrl } from '~/lib/utils'

/**
 * A whitelist, and one of three sites that move with the `audit_category` enum
 * (the others are `auditCategorySchema` in shared and `auditCategoryEnum` in the
 * API schema). Anything absent here is DROPPED from the URL rather than
 * rejected — right for a stale bookmark, and quietly wrong for a live category:
 * `?category=fulfilment` would degrade to the unfiltered view with no error and
 * no empty state, and the admin would read the whole table as the filtered one.
 */
const CATEGORIES = [
  'money',
  'privilege',
  'catalogue',
  'config',
  'content',
  'fulfilment',
] as const
const OUTCOMES = ['success', 'failure'] as const

/** A URL value that is a real category, or nothing. Never an error. */
const categoryList = z
  .preprocess(
    (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
    z.array(z.string())
  )
  .transform((values) =>
    values.filter((value): value is (typeof CATEGORIES)[number] =>
      (CATEGORIES as readonly string[]).includes(value)
    )
  )
  .transform((values) => (values.length ? values : undefined))
  .catch(undefined)

export const auditLogSearchSchema = z.object({
  category: categoryList.optional(),
  outcome: z.enum(OUTCOMES).optional().catch(undefined),
  actor: z.string().min(1).optional().catch(undefined),
  entityType: z.string().min(1).optional().catch(undefined),
  entityId: z.string().min(1).optional().catch(undefined),
  q: z.string().min(1).max(200).optional().catch(undefined),
  from: z.string().date().optional().catch(undefined),
  to: z.string().date().optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(200).default(50).catch(50),
})

export type AuditLogSearch = z.infer<typeof auditLogSearchSchema>

export interface AuditLogRow {
  id: string
  createdAt: string
  actorUserId: string | null
  actorEmail: string | null
  actorRole: string | null
  action: string
  category: string
  outcome: 'success' | 'failure'
  summary: string | null
  entityType: string | null
  entityId: string | null
  before: unknown
  after: unknown
  metadata: unknown
  requestId: string | null
  ipAddress: string | null
  userAgent: string | null
}

export const Route = createFileRoute('/admin/audit-log/')({
  validateSearch: auditLogSearchSchema,
  component: AdminAuditLogPage,
})

const CATEGORY_STYLES: Record<string, string> = {
  money: 'bg-amber-50 text-amber-700',
  privilege: 'bg-red-50 text-red-700',
  catalogue: 'bg-blue-50 text-blue-700',
  config: 'bg-muted text-muted-foreground',
  content: 'bg-green-50 text-green-700',
  // Needs its own entry, not just a CATEGORIES row: the badge falls back to the
  // same neutral grey `config` uses, so a missing style makes every fulfilment
  // row look like a config row rather than break anything visibly.
  fulfilment: 'bg-purple-50 text-purple-700',
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-muted-foreground">—</p>
  }

  return (
    <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/**
 * The table and its three states, split out so the states can be tested without
 * a router or a network — the same shape vendors/index.tsx uses.
 */
export function AuditLogBody({
  entries,
  isLoading,
  error,
}: {
  entries: AuditLogRow[]
  isLoading: boolean
  error: string | null
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-sm text-red-500">
        <AlertCircle className="h-4 w-4" />
        {error}
      </p>
    )
  }

  if (isLoading) {
    return (
      <div data-testid="audit-log-skeleton" className="space-y-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="h-12 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No audit entries match these filters.
      </p>
    )
  }

  const open = entries.find((entry) => entry.id === openId) ?? null

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Summary</th>
              <th className="px-4 py-3 font-medium sr-only">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-border">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatWhen(entry.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {/* The email, not the id: it is the snapshot, so it still
                      names the actor after the account is deleted. */}
                  <span className="text-foreground">{entry.actorEmail ?? 'system'}</span>
                  {entry.actorRole && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({entry.actorRole})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-pill px-2 py-0.5 text-xs',
                      CATEGORY_STYLES[entry.category] ?? 'bg-muted text-muted-foreground'
                    )}
                  >
                    {entry.category}
                  </span>
                  <span className="ml-2 text-foreground">{entry.action}</span>
                  {entry.outcome === 'failure' && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-pill bg-red-50 px-2 py-0.5 text-xs text-red-700">
                      <ShieldAlert className="h-3 w-3" />
                      Refused
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {entry.entityType ? `${entry.entityType} ${entry.entityId ?? ''}` : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.summary ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === entry.id ? null : entry.id)}
                    aria-label={`View details of ${entry.action}`}
                    className="rounded-pill border border-input px-3 py-1 text-xs text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    View details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          data-testid="audit-log-detail"
          className="space-y-4 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="text-muted-foreground">
              Request <span className="text-foreground">{open.requestId ?? '—'}</span>
            </span>
            <span className="text-muted-foreground">
              IP <span className="text-foreground">{open.ipAddress ?? '—'}</span>
            </span>
            <span className="text-muted-foreground">
              Actor id <span className="text-foreground">{open.actorUserId ?? 'deleted'}</span>
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Before
              </p>
              <Json value={open.before} />
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                After
              </p>
              <Json value={open.after} />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Request metadata
            </p>
            <Json value={open.metadata} />
          </div>
        </div>
      )}
    </div>
  )
}

function AdminAuditLogPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const [entries, setEntries] = useState<AuditLogRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [query, setQuery] = useState(search.q ?? '')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const buildParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams({ limit: String(search.limit) })
      if (search.category?.length) params.set('category', search.category.join(','))
      if (search.outcome) params.set('outcome', search.outcome)
      if (search.actor) params.set('actor', search.actor)
      if (search.entityType) params.set('entityType', search.entityType)
      if (search.entityId) params.set('entityId', search.entityId)
      if (search.q) params.set('q', search.q)
      if (search.from) params.set('from', search.from)
      if (search.to) params.set('to', search.to)
      if (cursor) params.set('cursor', cursor)
      return params
    },
    [search]
  )

  const load = useCallback(
    async (cursor?: string) => {
      setIsLoading(true)
      setError(null)

      try {
        // Through getApiUrl(), never a relative '/api': dev has no Vite proxy,
        // so a relative fetch 404s in the browser while passing in jsdom.
        const response = await fetch(
          `${getApiUrl()}/api/admin/audit-log?${buildParams(cursor)}`,
          { credentials: 'include' }
        )

        if (!response.ok) throw new Error('Could not load the audit log')

        const body = (await response.json()) as {
          entries: AuditLogRow[]
          nextCursor: string | null
        }

        setEntries((current) => (cursor ? [...current, ...body.entries] : body.entries))
        setNextCursor(body.nextCursor)
      } catch {
        setError('Could not load the audit log.')
      } finally {
        setIsLoading(false)
      }
    },
    [buildParams]
  )

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-medium text-foreground">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every admin and vendor action, append-only. Entries cannot be edited or
            deleted.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh"
          className="rounded-pill border border-input px-3 py-2 text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void navigate({
            to: '/admin/audit-log',
            search: {
              ...search,
              ...(query.trim() ? { q: query.trim() } : { q: undefined }),
            },
          })
        }}
        className="flex flex-wrap gap-2"
      >
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Summary, actor email or entity id"
            aria-label="Search the audit log"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
        </div>

        <select
          aria-label="Category"
          value={search.category?.[0] ?? ''}
          onChange={(event) =>
            void navigate({
              to: '/admin/audit-log',
              search: {
                ...search,
                category: event.target.value
                  ? [event.target.value as (typeof CATEGORIES)[number]]
                  : undefined,
              },
            })
          }
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          aria-label="Outcome"
          value={search.outcome ?? ''}
          onChange={(event) =>
            void navigate({
              to: '/admin/audit-log',
              search: {
                ...search,
                outcome: (event.target.value || undefined) as AuditLogSearch['outcome'],
              },
            })
          }
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Any outcome</option>
          {OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcome}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-pill border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Search
        </button>
      </form>

      <AuditLogBody entries={entries} isLoading={isLoading} error={error} />

      {nextCursor && !isLoading && (
        <button
          type="button"
          onClick={() => void load(nextCursor)}
          className="rounded-pill border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Load more
        </button>
      )}
    </div>
  )
}
