/**
 * Admin Customers Page - chobii.art E-commerce Platform
 *
 * User list with role assignment:
 * - Lists all users (name, email, role, status, joined date)
 * - Role dropdown per row to toggle customer <-> content-manager
 * - Admin/super-admin rows show their role as static text (immutable here;
 *   the API also refuses to modify them)
 *
 * This page is admin-only: it sits outside the content-manager allowed
 * prefixes, so the /admin layout guard blocks content-managers.
 *
 * Following patterns from routes/admin/reviews.tsx
 */

import { useCallback, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  RefreshCw,
  AlertCircle,
  Users,
  Search,
  CheckCircle2,
} from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'

// ============================================================================
// Route Configuration
// ============================================================================

export const Route = createFileRoute('/admin/customers')({
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
}

/** Roles assignable from this page (API enforces the same cap) */
const ASSIGNABLE_ROLES = ['customer', 'content-manager', 'admin'] as const

// ============================================================================
// API Functions
// ============================================================================

async function fetchCustomers(): Promise<AdminCustomer[]> {
  const response = await fetch(`${getApiUrl()}/api/admin/customers`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch customers')
  }

  const data = await response.json()
  return data.customers
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

// ============================================================================
// Component
// ============================================================================

function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadCustomers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCustomers(await fetchCustomers())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

  // Auto-dismiss feedback after a few seconds
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 4000)
    return () => clearTimeout(timer)
  }, [feedback])

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
        message: `${customer.name || customer.email} is now ${role === 'content-manager' ? 'a content manager' : 'a customer'}`,
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

  const filteredCustomers = customers.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Users className="h-6 w-6" />
            Customers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users and assign the content manager role
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadCustomers()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </button>
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
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
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Loading customers...
                </td>
              </tr>
            ) : filteredCustomers.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No customers found
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => {
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
    </div>
  )
}

export default AdminCustomersPage
