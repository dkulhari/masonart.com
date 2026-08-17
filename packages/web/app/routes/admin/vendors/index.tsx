/**
 * Admin — the supplier directory.
 *
 * Who prints and frames for us, what each one can make, how much work they are
 * carrying and what we owe them. `GET /api/admin/vendors` is gated with
 * `requireAdmin`, not `requireContentManager`, because `amountOwed` is finance
 * data wearing a catalogue shape — and `admin-nav.ts` keeps `/admin/vendors`
 * out of `CONTENT_MANAGER_ALLOWED_PREFIXES` so the route guard agrees with it.
 *
 * ## The search schema is the fragile part
 *
 * `router.tsx` replaces TanStack's search serialisation with a pair that keeps
 * every value a STRING coming in (`URLSearchParams` entries) and `String(value)`
 * going out. So `validateSearch` receives `{ page: '2' }`, never `{ page: 2 }`,
 * and a schema written against real numbers throws on the first navigation. A
 * throw inside `validateSearch` is not a validation message — the route
 * error-boundaries and the admin gets a blank page with nothing to read.
 *
 * Hence two rules in `vendorsSearchSchema`, both covered by
 * `tests/routes/admin/vendors-list.test.tsx`:
 *
 * 1. Every non-string param is `z.coerce`-d.
 * 2. Every field `.catch(...)`es to a usable default. A stale bookmark or a
 *    hand-typed URL degrades to the default view rather than to a blank one.
 *
 * There is no array-valued param here yet: the API takes one `status` and one
 * `kind`, so offering a multi-select would be offering a filter the server
 * cannot honour. When one is added it must ALSO split on comma — see the
 * `scopeListParam` preprocessor in `routes/admin/promotions/index.tsx`, which
 * hit exactly this.
 *
 * ## Three states, and no invented numbers
 *
 * Skeleton, empty and error are all present, and they are mutually exclusive.
 * On failure the body renders the error and nothing else: no `0` owed, no dash
 * standing in for a count. #602 and #606 are both open bugs about an admin
 * surface printing a confident zero that was really a failed request.
 *
 * ## Paginated from day one
 *
 * The API defaults to 20 rows and caps at 100 with no query string at all; this
 * screen never asks for more, and the page number lives in the URL so a filtered
 * page is a link an admin can send to someone else.
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { VENDOR_PAGE_SIZE } from '~/lib/admin-nav'

// ============================================================================
// Route configuration
// ============================================================================

export const VENDOR_STATUSES = ['active', 'inactive', 'suspended'] as const
export const VENDOR_CAPABILITY_KINDS = ['print', 'frame'] as const

export type VendorStatus = (typeof VENDOR_STATUSES)[number]
export type VendorCapabilityKind = (typeof VENDOR_CAPABILITY_KINDS)[number]

/** The API's own cap. Asking beyond it just gets clamped there anyway. */
const MAX_PAGE_SIZE = 100

export const vendorsSearchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .catch(VENDOR_PAGE_SIZE)
    .default(VENDOR_PAGE_SIZE)
    // Clamped rather than rejected: `?pageSize=100000` should show a page, not
    // a blank error boundary.
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  status: z.enum(VENDOR_STATUSES).optional().catch(undefined),
  kind: z.enum(VENDOR_CAPABILITY_KINDS).optional().catch(undefined),
  /** "Who can make something this big?" — matched against the larger axis. */
  minLongestEdge: z.coerce.number().int().positive().optional().catch(undefined),
})

export type VendorsSearch = z.infer<typeof vendorsSearchSchema>

export const Route = createFileRoute('/admin/vendors/')({
  validateSearch: (search) => vendorsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Vendors | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminVendorsPage,
})

// ============================================================================
// Types — the GET /api/admin/vendors payload, verbatim
// ============================================================================

export interface AdminVendorCapabilitySummary {
  kind: VendorCapabilityKind
  maxWidthInches: number | null
  maxHeightInches: number | null
}

export interface AdminVendorListItem {
  id: string
  name: string
  status: VendorStatus
  city: string | null
  state: string | null
  country: string | null
  createdAt: string
  updatedAt: string
  capabilities: AdminVendorCapabilitySummary[]
  openJobCount: number
  /** decimal(10,2) INR as a string, exactly as lib/vendor-payables formats it. */
  amountOwed: string
}

export interface AdminVendorsPage {
  items: AdminVendorListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Rupees. Returns null rather than a zero when the string is not a number —
 * the caller shows "unavailable" instead, because a wrong ₹0 next to a supplier
 * name reads as "we owe them nothing".
 */
export function formatRupees(value: string): string | null {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const STATUS_LABELS: Record<VendorStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
}

const STATUS_STYLES: Record<VendorStatus, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  inactive: 'bg-muted text-muted-foreground border-border',
  suspended: 'bg-red-50 text-red-700 border-red-200',
}

function capabilitySummary(capabilities: AdminVendorCapabilitySummary[]): string {
  if (capabilities.length === 0) return 'None recorded'
  return capabilities
    .map((cap) => {
      const w = cap.maxWidthInches
      const h = cap.maxHeightInches
      const size = w && h ? ` up to ${w}×${h}″` : ''
      return `${cap.kind}${size}`
    })
    .join(', ')
}

function placeOf(vendor: AdminVendorListItem): string {
  return [vendor.city, vendor.state].filter(Boolean).join(', ') || '—'
}

// ============================================================================
// The three list states
// ============================================================================

function VendorsSkeleton() {
  return (
    <div
      data-testid="admin-vendors-skeleton"
      className="space-y-2 rounded-lg border border-border p-4"
      aria-busy="true"
      aria-label="Loading vendors"
    >
      {['a', 'b', 'c', 'd', 'e'].map((key) => (
        <div
          key={key}
          className="h-10 animate-pulse rounded bg-muted"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

/**
 * The error state carries no numbers at all, on purpose. A failed request that
 * still prints "₹0 owed" is #606; the test asserts this block is digit-free.
 */
function VendorsError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      data-testid="admin-vendors-error"
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mb-1 font-medium">{message}</p>
      <p className="mb-6 text-sm text-muted-foreground">
        Nothing is shown below because nothing was loaded — the directory has not
        been read, which is not the same as it being empty.
      </p>
      <Button
        type="button"
        variant="outline"
        data-testid="admin-vendors-retry"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  )
}

function VendorsEmpty() {
  return (
    <div
      data-testid="admin-vendors-empty"
      className="rounded-lg border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="mb-1 font-medium">No vendors match this view</p>
      <p className="mb-6 text-sm text-muted-foreground">
        Clear the filters, or add the supplier who prints and frames for you.
      </p>
      <Link to="/admin/vendors/new" className="inline-block">
        <Button type="button">
          <Plus className="mr-2 h-4 w-4" />
          New vendor
        </Button>
      </Link>
    </div>
  )
}

export interface VendorsListBodyProps {
  vendors: AdminVendorListItem[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

/**
 * Exactly one of skeleton / error / empty / table. Split out from the page so
 * each state can be asserted without standing up a router or a fetch mock.
 */
export function VendorsListBody({
  vendors,
  isLoading,
  error,
  onRetry,
}: VendorsListBodyProps) {
  // Error wins over loading and over emptiness: an empty state after a failed
  // request is a lie about the data.
  if (error) return <VendorsError message={error} onRetry={onRetry} />
  if (isLoading) return <VendorsSkeleton />
  if (vendors.length === 0) return <VendorsEmpty />

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-testid="admin-vendors-table">
        <thead className="border-b border-border bg-muted/40 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Vendor</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Capabilities</th>
            <th className="px-4 py-3 text-right font-medium">Open jobs</th>
            <th className="px-4 py-3 text-right font-medium">Owed</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => {
            const owed = formatRupees(vendor.amountOwed)

            return (
              <tr
                key={vendor.id}
                data-testid={`admin-vendor-row-${vendor.id}`}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3">
                  <Link
                    to="/admin/vendors/$id"
                    params={{ id: vendor.id }}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {vendor.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {/* In words as well as in colour — a coloured pill alone is
                      invisible to a screen reader and to a colourblind admin. */}
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[vendor.status]
                    )}
                  >
                    {STATUS_LABELS[vendor.status]}
                  </span>
                </td>
                <td className="px-4 py-3">{placeOf(vendor)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {capabilitySummary(vendor.capabilities)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {vendor.openJobCount}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {/* Never a fallback zero: an unreadable amount says so. */}
                  {owed ?? (
                    <span className="text-destructive">Unavailable</span>
                  )}
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

async function fetchVendors(params: VendorsSearch): Promise<AdminVendorsPage> {
  const query = new URLSearchParams()
  query.set('page', String(params.page))
  query.set('pageSize', String(params.pageSize))
  if (params.status) query.set('status', params.status)
  if (params.kind) query.set('kind', params.kind)
  if (params.minLongestEdge !== undefined) {
    query.set('minLongestEdge', String(params.minLongestEdge))
  }

  const response = await fetch(
    `${getApiUrl()}/api/admin/vendors?${query.toString()}`,
    // Without this every request is a 401 — the session cookie is the only
    // thing the role gate reads.
    { credentials: 'include' }
  )

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to load vendors')
  }

  return (await response.json()) as AdminVendorsPage
}

function AdminVendorsPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  const [page, setPage] = useState<AdminVendorsPage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await fetchVendors(search)
      setPage(data)
      setError(null)
    } catch (loadError) {
      // The stale page is dropped along with the error: showing last page's
      // rows under a failure banner is how a stale number gets believed.
      setPage(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    void load()
  }, [load])

  const updateSearch = (updates: Partial<VendorsSearch>) => {
    void navigate({
      to: '/admin/vendors',
      // A merged object rather than the `(prev) => ...` reducer form. The
      // reducer's return type does not typecheck against TanStack's
      // `ParamsReducerFn` here — /admin/products and /admin/orders both carry
      // that error today — and `search` from `useSearch()` already IS `prev`.
      search: {
        ...search,
        ...updates,
        // Any filter change resets to page one; otherwise page 4 of the old
        // result set silently becomes an empty page of the new one.
        page: updates.page ?? 1,
      },
    })
  }

  const total = page?.total ?? null
  const totalPages = page?.totalPages ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium">Vendors</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {/* `total` is null until a page actually loads, so the count is
                absent rather than zero while the request is in flight. */}
            The suppliers who print and frame for us
            {total === null ? '.' : ` — ${total} on file.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Link to="/admin/vendors/new">
            <Button type="button">
              <Plus className="mr-2 h-4 w-4" />
              New vendor
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters — every one of them lives in the URL */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            data-testid="admin-vendors-filter-status"
            value={search.status ?? ''}
            onChange={(e) =>
              updateSearch({
                status: (e.target.value || undefined) as VendorStatus | undefined,
              })
            }
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">Any status</option>
            {VENDOR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Capability
          <select
            data-testid="admin-vendors-filter-kind"
            value={search.kind ?? ''}
            onChange={(e) =>
              updateSearch({
                kind: (e.target.value || undefined) as
                  | VendorCapabilityKind
                  | undefined,
              })
            }
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">Any capability</option>
            <option value="print">Print</option>
            <option value="frame">Frame</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Can make at least (inches)
          <input
            type="number"
            min={1}
            data-testid="admin-vendors-filter-edge"
            value={search.minLongestEdge ?? ''}
            onChange={(e) =>
              updateSearch({
                minLongestEdge: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-9 w-40 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>

        {(search.status || search.kind || search.minLongestEdge !== undefined) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              updateSearch({
                status: undefined,
                kind: undefined,
                minLongestEdge: undefined,
              })
            }
          >
            Clear filters
          </Button>
        )}
      </div>

      <VendorsListBody
        vendors={page?.items ?? []}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load()}
      />

      {/* Pagination. Hidden while loading or failed — a page indicator over a
          failed request is another confident number that is not true. */}
      {!isLoading && !error && page && totalPages > 1 && (
        <div
          data-testid="admin-vendors-pagination"
          className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
        >
          <span className="text-muted-foreground">
            Page {page.page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page.page <= 1}
              onClick={() => updateSearch({ page: page.page - 1 })}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={page.page >= totalPages}
              onClick={() => updateSearch({ page: page.page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
