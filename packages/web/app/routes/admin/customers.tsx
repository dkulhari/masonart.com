/**
 * Admin Customers Page - chobii.art E-commerce Platform
 *
 * User list with per-field filtering and role assignment:
 * - Filters (search, role, status, gallery membership, joined date range) live
 *   in URL search params and are evaluated server-side, so the list is
 *   shareable, back-button safe and does not depend on loading the whole user
 *   table.
 * - Role dropdown per row to toggle customer <-> content-manager <-> admin
 * - Admin/super-admin rows show their role as static text (immutable here;
 *   the API also refuses to modify them)
 * - "Export consented" downloads the gallery mailing list. The server decides
 *   who is in it — only rows carrying a `marketingConsentAt` — so nothing on
 *   this page can widen the file, only narrow it (#442).
 *
 * This page is admin-only: it sits outside the content-manager allowed
 * prefixes, so the /admin layout guard blocks content-managers.
 *
 * Following the search-param pattern from routes/admin/products/index.tsx
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import {
  RefreshCw,
  AlertCircle,
  Users,
  Search,
  CheckCircle2,
  X,
  ArrowUpDown,
  Download,
} from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'

// ============================================================================
// Route Configuration
// ============================================================================

/**
 * Every role a user row can carry. Wider than ASSIGNABLE_ROLES on purpose:
 * `trade` and `super-admin` are not assignable from this page, but such users
 * exist and have to be findable.
 */
const FILTERABLE_ROLES = [
  'customer',
  'trade',
  'content-manager',
  'admin',
  'super-admin',
] as const

const FILTERABLE_STATUSES = [
  'active',
  'inactive',
  'suspended',
  'pending-verification',
] as const

const SORTABLE_COLUMNS = ['createdAt', 'name', 'email', 'role'] as const

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * The app's router keeps every search param a string and stringifies with
 * `String(value)` (see app/router.tsx), so an array round-trips as a
 * comma-joined string — `?role=admin,trade`. Accept either shape.
 */
const roleListParam = z.preprocess(
  (value) => {
    if (value === undefined || value === '') return undefined
    if (Array.isArray(value)) return value
    if (typeof value === 'string') return value.split(',').filter(Boolean)
    return value
  },
  z.array(z.enum(FILTERABLE_ROLES)).min(1).optional()
)

/**
 * Same router quirk, the other direction. A boolean leaves as `true` and comes
 * back as the string `'true'`, and `z.coerce.boolean()` would read `'false'`
 * as true — every non-empty string is truthy — so "not members" would quietly
 * list members. Map the two words by hand.
 *
 * Anything unrecognised becomes undefined rather than a parse error: a throw
 * in `validateSearch` error-boundaries the whole route to a blank page, so a
 * junk param would take the screen down instead of just ignoring the filter.
 */
const galleryMemberParam = z.preprocess((value) => {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}, z.boolean().optional())

const searchParamsSchema = z.object({
  page: z.coerce.number().positive().optional().default(1),
  pageSize: z.coerce.number().positive().max(100).optional().default(20),
  search: z.string().optional(),
  role: roleListParam,
  status: z.enum(FILTERABLE_STATUSES).optional(),
  galleryMember: galleryMemberParam,
  joinedFrom: calendarDay.optional(),
  joinedTo: calendarDay.optional(),
  sortBy: z.enum(SORTABLE_COLUMNS).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

type SearchParams = z.infer<typeof searchParamsSchema>

/**
 * Exported so the coercion above is testable on its own. A wrong answer here
 * does not throw a useful error — it error-boundaries the route to a blank
 * page — so it is worth pinning away from the component.
 */
export const parseCustomerSearch = (search: unknown): SearchParams =>
  searchParamsSchema.parse(search)

export const Route = createFileRoute('/admin/customers')({
  validateSearch: parseCustomerSearch,
  head: () => ({
    meta: [
      { title: 'Customers | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminCustomersPage,
})

// ============================================================================
// Types
// ============================================================================

interface AdminCustomer {
  id: string
  name: string
  email: string
  role: string
  status: string
  createdAt: string
  galleryMember: boolean
  galleryJoinedAt: string | null
  marketingConsentAt: string | null
  joinSource: string | null
}

interface CustomersResponse {
  data: AdminCustomer[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/** Roles assignable from this page (API enforces the same cap) */
const ASSIGNABLE_ROLES = ['customer', 'content-manager', 'admin'] as const

const ROLE_LABELS: Record<string, string> = {
  customer: 'Customer',
  trade: 'Trade',
  'content-manager': 'Content Manager',
  admin: 'Admin',
  'super-admin': 'Super Admin',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
  'pending-verification': 'Pending Verification',
}

// ============================================================================
// API Functions
// ============================================================================

/** Filters the API understands. Shared so a download matches what is on screen. */
function buildCustomerQuery(params: SearchParams): URLSearchParams {
  const query = new URLSearchParams()

  query.set('page', String(params.page))
  query.set('pageSize', String(params.pageSize))
  query.set('sortBy', params.sortBy)
  query.set('sortOrder', params.sortOrder)

  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  if (params.joinedFrom) query.set('joinedFrom', params.joinedFrom)
  if (params.joinedTo) query.set('joinedTo', params.joinedTo)
  // `false` is a filter, not an absent one — check for undefined, not falsiness
  if (params.galleryMember !== undefined) {
    query.set('galleryMember', String(params.galleryMember))
  }
  // Repeated `role=` params — the API reads roles as a list
  for (const role of params.role ?? []) query.append('role', role)

  return query
}

async function fetchCustomers(
  params: SearchParams
): Promise<CustomersResponse> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/customers?${buildCustomerQuery(params)}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch customers')
  }

  return response.json()
}

/**
 * Downloads the consented list as CSV.
 *
 * The server decides who is in the file — only rows carrying a
 * `marketingConsentAt` — and no control on this page can change that. The
 * filters are passed so the download matches the slice being viewed; they can
 * only narrow it.
 *
 * Fetched rather than linked because the API is a different origin and the
 * request needs `credentials: 'include'`. The filename is rebuilt here for the
 * same reason: `Content-Disposition` is not a CORS-exposed response header, so
 * reading it back would give null in the browser.
 */
async function downloadConsentedCsv(params: SearchParams): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/customers/export?${buildCustomerQuery(params)}`,
    { method: 'GET', credentials: 'include' }
  )

  if (!response.ok) {
    throw new Error('Failed to export the consented list')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `gallery-consented-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function updateCustomerRole(id: string, role: string): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/customers/${id}/role`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }
  )

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message ?? 'Failed to update role')
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function roleBadgeClasses(role: string): string {
  switch (role) {
    case 'super-admin':
    case 'admin':
      return 'bg-purple-100 text-purple-700'
    case 'content-manager':
      return 'bg-blue-100 text-blue-700'
    case 'trade':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/** True when anything narrows the list beyond the default view */
function hasActiveFilters(params: SearchParams): boolean {
  return Boolean(
    params.search ||
      params.status ||
      params.joinedFrom ||
      params.joinedTo ||
      params.galleryMember !== undefined ||
      (params.role && params.role.length > 0)
  )
}

const inputClasses =
  'h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500'

/**
 * Membership at a glance, and the one state worth shouting about: a member
 * with no consent stamp. That row is a bug in whatever joined them — the
 * export refuses to include it, and this is where someone notices why a
 * member they expected is missing from the file.
 */
function GalleryCell({ customer }: { customer: AdminCustomer }) {
  if (!customer.galleryMember) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const consented = Boolean(customer.marketingConsentAt)

  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium',
          consented
            ? 'bg-brand-500/10 text-brand-700'
            : 'bg-amber-100 text-amber-800'
        )}
        title={
          consented
            ? `Consented ${formatDate(customer.marketingConsentAt!)}`
            : 'Member without a consent timestamp — not exportable'
        }
      >
        {consented ? 'Member' : 'No consent'}
      </span>
      {customer.joinSource && (
        <span className="text-xs text-muted-foreground">
          via {customer.joinSource}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

function AdminCustomersPage() {
  const navigate = useNavigate()
  const searchParams = Route.useSearch()

  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(searchParams.search ?? '')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadCustomers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const body = await fetchCustomers(searchParams)
      setCustomers(body.data)
      setPagination(body.pagination)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [searchParams])

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

  // Auto-dismiss feedback after a few seconds
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 4000)
    return () => clearTimeout(timer)
  }, [feedback])

  // Update URL params — any filter change resets to the first page
  const updateSearch = useCallback(
    (updates: Partial<SearchParams>) => {
      navigate({
        to: '/admin/customers',
        search: { ...searchParams, ...updates, page: updates.page ?? 1 },
      })
    },
    [navigate, searchParams]
  )

  // Keep the input in sync when the URL changes underneath us (back button)
  useEffect(() => {
    setSearchInput(searchParams.search ?? '')
  }, [searchParams.search])

  // Debounce typing into a search-param update
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim()
      if (next === (searchParams.search ?? '')) return
      updateSearch({ search: next || undefined })
    }, 350)
    return () => clearTimeout(timer)
  }, [searchInput, searchParams.search, updateSearch])

  const toggleRole = (role: (typeof FILTERABLE_ROLES)[number]) => {
    const current = searchParams.role ?? []
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role]
    updateSearch({ role: next.length > 0 ? next : undefined })
  }

  const toggleSort = (column: (typeof SORTABLE_COLUMNS)[number]) => {
    const sortOrder =
      searchParams.sortBy === column && searchParams.sortOrder === 'asc'
        ? 'desc'
        : 'asc'
    updateSearch({ sortBy: column, sortOrder })
  }

  const clearAllFilters = () => {
    setSearchInput('')
    navigate({
      to: '/admin/customers',
      search: {
        page: 1,
        pageSize: searchParams.pageSize,
        sortBy: searchParams.sortBy,
        sortOrder: searchParams.sortOrder,
      },
    })
  }

  const handleRoleChange = async (customer: AdminCustomer, role: string) => {
    if (role === customer.role) return
    setUpdatingId(customer.id)
    const previousRole = customer.role

    // Optimistic update
    setCustomers((prev) =>
      prev.map((c) => (c.id === customer.id ? { ...c, role } : c))
    )

    try {
      await updateCustomerRole(customer.id, role)
      setFeedback({
        type: 'success',
        message: `${customer.name || customer.email} is now ${ROLE_LABELS[role] ?? role}`,
      })
    } catch (err) {
      // Roll back on failure
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customer.id ? { ...c, role: previousRole } : c
        )
      )
      setFeedback({ type: 'error', message: (err as Error).message })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await downloadConsentedCsv(searchParams)
      setFeedback({
        type: 'success',
        message: 'Consented gallery list downloaded',
      })
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message })
    } finally {
      setIsExporting(false)
    }
  }

  const filtersActive = hasActiveFilters(searchParams)

  const sortIndicator = (column: (typeof SORTABLE_COLUMNS)[number]) =>
    searchParams.sortBy === column ? (
      <span aria-hidden="true">
        {searchParams.sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    ) : (
      <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
    )

  const sortableHeader = (
    column: (typeof SORTABLE_COLUMNS)[number],
    label: string
  ) => (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {sortIndicator(column)}
      </button>
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-medium text-foreground">
            <Users className="h-6 w-6" />
            Customers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users and assign the content manager role
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Only consented rows land in the file — see the export handler */}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting}
            title="CSV of gallery members who gave marketing consent"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting…' : 'Export consented'}
          </button>
          <button
            type="button"
            onClick={() => void loadCustomers()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          role="status"
          className={cn(
            'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
            feedback.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          )}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Filter bar */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email..."
              aria-label="Search by name or email"
              className={cn(inputClasses, 'w-full pl-9')}
            />
          </div>

          {/* Status */}
          <div>
            <label
              htmlFor="status-filter"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Status
            </label>
            <select
              id="status-filter"
              value={searchParams.status ?? ''}
              onChange={(e) =>
                updateSearch({
                  status: (e.target.value ||
                    undefined) as SearchParams['status'],
                })
              }
              className={cn(inputClasses, 'w-full')}
            >
              <option value="">All statuses</option>
              {FILTERABLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          {/* Gallery membership */}
          <div>
            <label
              htmlFor="gallery-filter"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Gallery
            </label>
            <select
              id="gallery-filter"
              value={
                searchParams.galleryMember === undefined
                  ? ''
                  : String(searchParams.galleryMember)
              }
              onChange={(e) =>
                updateSearch({
                  galleryMember:
                    e.target.value === '' ? undefined : e.target.value === 'true',
                })
              }
              className={cn(inputClasses, 'w-full')}
            >
              <option value="">Everyone</option>
              <option value="true">Members</option>
              <option value="false">Not members</option>
            </select>
          </div>

          {/* Joined from */}
          <div>
            <label
              htmlFor="joined-from"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Joined from
            </label>
            <input
              id="joined-from"
              type="date"
              value={searchParams.joinedFrom ?? ''}
              max={searchParams.joinedTo}
              onChange={(e) =>
                updateSearch({ joinedFrom: e.target.value || undefined })
              }
              className={cn(inputClasses, 'w-full')}
            />
          </div>

          {/* Joined to */}
          <div>
            <label
              htmlFor="joined-to"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Joined to
            </label>
            <input
              id="joined-to"
              type="date"
              value={searchParams.joinedTo ?? ''}
              min={searchParams.joinedFrom}
              onChange={(e) =>
                updateSearch({ joinedTo: e.target.value || undefined })
              }
              className={cn(inputClasses, 'w-full')}
            />
          </div>
        </div>

        {/* Role multi-select */}
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">
            Role
          </legend>
          <div className="flex flex-wrap gap-2">
            {FILTERABLE_ROLES.map((role) => {
              const checked = (searchParams.role ?? []).includes(role)
              return (
                <label
                  key={role}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    checked
                      ? 'border-brand-500 bg-brand-500/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRole(role)}
                    className="h-3.5 w-3.5 rounded border-border accent-brand-500"
                  />
                  {ROLE_LABELS[role]}
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* Result count + clear all */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? 'Loading…'
              : `${pagination.total} ${pagination.total === 1 ? 'user' : 'users'}${
                  filtersActive ? ' match these filters' : ' total'
                }`}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Customer table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {sortableHeader('name', 'Name')}
              {sortableHeader('email', 'Email')}
              {sortableHeader('role', 'Role')}
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Gallery</th>
              {sortableHeader('createdAt', 'Joined')}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Loading customers...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No customers found
                </td>
              </tr>
            ) : (
              customers.map((customer) => {
                // customer/content-manager/admin are assignable. Super-admin
                // is immutable, your own row is locked (API enforces both),
                // and trade users are managed via the trade workflow.
                const isAssignable = ASSIGNABLE_ROLES.includes(
                  customer.role as (typeof ASSIGNABLE_ROLES)[number]
                )
                return (
                  <tr key={customer.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {customer.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {customer.email}
                    </td>
                    <td className="px-4 py-3">
                      {!isAssignable ? (
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                            roleBadgeClasses(customer.role)
                          )}
                        >
                          {customer.role}
                        </span>
                      ) : (
                        <select
                          value={customer.role}
                          disabled={updatingId === customer.id}
                          onChange={(e) =>
                            void handleRoleChange(customer, e.target.value)
                          }
                          aria-label={`Role for ${customer.name || customer.email}`}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                        >
                          <option value="customer">Customer</option>
                          <option value="content-manager">
                            Content Manager
                          </option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                          customer.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {customer.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <GalleryCell customer={customer} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(customer.createdAt)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!isLoading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateSearch({ page: pagination.page - 1 })}
              disabled={pagination.page <= 1}
              className="flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => updateSearch({ page: pagination.page + 1 })}
              disabled={pagination.page >= pagination.totalPages}
              className="flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminCustomersPage
