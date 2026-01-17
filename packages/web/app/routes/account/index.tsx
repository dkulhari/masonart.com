/**
 * Account Dashboard Page - MasonArt E-commerce Platform
 *
 * User account dashboard with profile overview, recent orders,
 * and quick actions.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Package,
  Settings,
  LogOut,
  ArrowRight,
  ChevronRight,
  Loader2,
  Sparkles,
  MapPin,
} from 'lucide-react'
import { cn, formatDate, getInitials } from '~/lib/utils'
import { authApi, ordersApi } from '~/lib/api'
import { OrderList, type Order } from '~/components/account/OrderList'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/account/')({
  head: () => ({
    meta: [
      { title: 'My Account | MasonArt' },
      {
        name: 'description',
        content: 'Manage your MasonArt account, view orders, and update your preferences.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AccountDashboardPage,
})

// ============================================================================
// Types
// ============================================================================

interface UserProfile {
  id: string
  name: string
  email: string
  image?: string
  createdAt: string
}

// ============================================================================
// Quick Actions Configuration
// ============================================================================

interface QuickAction {
  title: string
  description: string
  icon: typeof Package
  href: string
  color: string
  bgColor: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: 'My Orders',
    description: 'Track and manage your orders',
    icon: Package,
    href: '/account/orders',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    title: 'AI Creations',
    description: 'View your AI-generated art',
    icon: Sparkles,
    href: '/account/ai-creations',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    title: 'Saved Addresses',
    description: 'Manage delivery addresses',
    icon: MapPin,
    href: '/account/addresses',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    title: 'Account Settings',
    description: 'Update profile & preferences',
    icon: Settings,
    href: '/account/settings',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
]

// ============================================================================
// Main Component
// ============================================================================

function AccountDashboardPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoadingUser, setIsLoadingUser] = useState(true)
  const [isLoadingOrders, setIsLoadingOrders] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  // Fetch user session
  useEffect(() => {
    async function fetchSession() {
      try {
        const session = await authApi.getSession()
        if (!session?.user) {
          // Redirect to login if not authenticated
          navigate({
            to: '/auth/login',
            search: { redirect: '/account' },
          })
          return
        }
        setUser(session.user)
      } catch {
        navigate({
          to: '/auth/login',
          search: { redirect: '/account' },
        })
      } finally {
        setIsLoadingUser(false)
      }
    }

    fetchSession()
  }, [navigate])

  // Fetch recent orders
  useEffect(() => {
    async function fetchOrders() {
      if (!user) return

      try {
        const response = await ordersApi.list({ page: 1, pageSize: 3 })
        setOrders(response.items || [])
      } catch (err) {
        setOrdersError(err instanceof Error ? err.message : 'Failed to load orders')
      } finally {
        setIsLoadingOrders(false)
      }
    }

    if (user) {
      fetchOrders()
    }
  }, [user])

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await authApi.signOut()
      navigate({ to: '/' })
    } catch {
      // Still navigate away on error
      navigate({ to: '/' })
    }
  }

  // Loading state
  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-brand-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    )
  }

  // User not loaded (shouldn't happen if redirect works)
  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">My Account</h1>
          <p className="mt-2 text-muted-foreground">
            Manage your orders, profile, and preferences
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-8 lg:col-span-2">
            {/* Profile Card */}
            <ProfileCard user={user} onSignOut={handleSignOut} />

            {/* Recent Orders */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Package className="h-5 w-5 text-brand-500" />
                  Recent Orders
                </h2>
                <a
                  href="/account/orders"
                  className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  View All
                  <ChevronRight className="h-4 w-4" />
                </a>
              </div>
              <div className="p-6">
                <OrderList
                  orders={orders}
                  isLoading={isLoadingOrders}
                  error={ordersError}
                  compact
                  limit={3}
                />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 text-base font-semibold text-foreground">Quick Actions</h3>
              <div className="space-y-3">
                {QUICK_ACTIONS.map((action) => (
                  <QuickActionCard key={action.href} action={action} />
                ))}
              </div>
            </div>

            {/* Help Section */}
            <div className="rounded-xl border border-border bg-muted/30 p-6">
              <h3 className="mb-2 text-base font-semibold text-foreground">Need Help?</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Have questions about your order or account?
              </p>
              <a
                href="/contact"
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Contact Support
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ProfileCard Component
// ============================================================================

interface ProfileCardProps {
  user: UserProfile
  onSignOut: () => void
}

function ProfileCard({ user, onSignOut }: ProfileCardProps) {
  const initials = getInitials(user.name || user.email)

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-4 sm:items-center">
        {/* Avatar */}
        <div className="relative">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-600">
              {initials}
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-foreground truncate">
            {user.name || 'User'}
          </h2>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Member since {formatDate(user.createdAt, { month: 'short', year: 'numeric' })}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/account/settings"
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </a>
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// QuickActionCard Component
// ============================================================================

interface QuickActionCardProps {
  action: QuickAction
}

function QuickActionCard({ action }: QuickActionCardProps) {
  const Icon = action.icon

  return (
    <a
      href={action.href}
      className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 transition-all hover:border-brand-300 hover:shadow-sm"
    >
      <div
        className={cn('flex h-10 w-10 items-center justify-center rounded-lg', action.bgColor)}
      >
        <Icon className={cn('h-5 w-5', action.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{action.title}</p>
        <p className="text-xs text-muted-foreground truncate">{action.description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </a>
  )
}
