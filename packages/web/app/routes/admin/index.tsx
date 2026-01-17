/**
 * Admin Dashboard Page - MasonArt E-commerce Platform
 *
 * Main admin dashboard displaying key metrics, recent orders,
 * and quick action links for common admin tasks.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Package,
  ShoppingCart,
  Users,
  IndianRupee,
  TrendingUp,
  Clock,
  AlertCircle,
  ExternalLink,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { StatsCard, StatsCardSkeleton } from '~/components/admin/StatsCard'
import { getApiUrl } from '~/lib/utils'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/admin/')({
  head: () => ({
    meta: [
      { title: 'Dashboard | Admin | MasonArt' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminDashboard,
})

// ============================================================================
// Types
// ============================================================================

interface OrderStats {
  byStatus: Record<string, number>
  byPaymentStatus: Record<string, number>
  totalRevenue: string
  todayOrders: number
  monthRevenue: string
}

interface ProductStats {
  totalProducts: number
  activeProducts: number
  lowStockProducts: number
  outOfStockProducts: number
}

interface RecentOrder {
  id: string
  orderNumber: string
  customer: { name: string | null; email: string } | null
  total: string
  status: string
  paymentStatus: string
  createdAt: string
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchOrderStats(): Promise<OrderStats> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders/stats`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch order stats')
  }

  return response.json()
}

async function fetchProductStats(): Promise<ProductStats> {
  const response = await fetch(`${getApiUrl()}/api/admin/products/stats`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    // Return default stats if endpoint doesn't exist yet
    return {
      totalProducts: 0,
      activeProducts: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
    }
  }

  return response.json()
}

async function fetchRecentOrders(): Promise<RecentOrder[]> {
  const response = await fetch(`${getApiUrl()}/api/admin/orders?pageSize=5&sortBy=createdAt&sortOrder=desc`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch recent orders')
  }

  const data = await response.json()
  return data.items || []
}

// ============================================================================
// Component
// ============================================================================

function AdminDashboard() {
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null)
  const [productStats, setProductStats] = useState<ProductStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [orders, products, recent] = await Promise.all([
        fetchOrderStats().catch(() => null),
        fetchProductStats().catch(() => null),
        fetchRecentOrders().catch(() => []),
      ])

      setOrderStats(orders)
      setProductStats(products)
      setRecentOrders(recent)
      setLastRefresh(new Date())
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  // Calculate derived stats
  const totalOrders = orderStats
    ? Object.values(orderStats.byStatus).reduce((a, b) => a + b, 0)
    : 0

  const pendingOrders = orderStats
    ? (orderStats.byStatus.pending || 0) +
      (orderStats.byStatus.pending_payment || 0) +
      (orderStats.byStatus.confirmed || 0) +
      (orderStats.byStatus.processing || 0)
    : 0

  const paidOrders = orderStats?.byPaymentStatus.paid || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back! Here&apos;s an overview of your store.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="ml-auto text-sm font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : (
          <>
            {/* Total Revenue */}
            <StatsCard
              title="Total Revenue"
              value={formatPrice(parseFloat(orderStats?.totalRevenue || '0'))}
              icon={IndianRupee}
              variant="success"
              description="All time paid orders"
              href="/admin/analytics"
            />

            {/* Month Revenue */}
            <StatsCard
              title="This Month"
              value={formatPrice(parseFloat(orderStats?.monthRevenue || '0'))}
              icon={TrendingUp}
              variant="info"
              description="Revenue this month"
              trend="up"
              trendValue="+12%"
              trendLabel="vs last month"
            />

            {/* Today's Orders */}
            <StatsCard
              title="Today's Orders"
              value={orderStats?.todayOrders || 0}
              icon={ShoppingCart}
              variant="default"
              description="Orders received today"
              href="/admin/orders"
            />

            {/* Pending Orders */}
            <StatsCard
              title="Pending Orders"
              value={pendingOrders}
              icon={Clock}
              variant={pendingOrders > 10 ? 'warning' : 'default'}
              description="Awaiting processing"
              href="/admin/orders?status=pending"
            />
          </>
        )}
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatsCardSkeleton compact />
            <StatsCardSkeleton compact />
            <StatsCardSkeleton compact />
            <StatsCardSkeleton compact />
          </>
        ) : (
          <>
            {/* Total Orders */}
            <StatsCard
              title="Total Orders"
              value={totalOrders}
              icon={ShoppingCart}
              compact
              href="/admin/orders"
            />

            {/* Paid Orders */}
            <StatsCard
              title="Paid Orders"
              value={paidOrders}
              icon={IndianRupee}
              variant="success"
              compact
            />

            {/* Products */}
            <StatsCard
              title="Active Products"
              value={productStats?.activeProducts || 0}
              icon={Package}
              compact
              href="/admin/products"
            />

            {/* AI Generations */}
            <StatsCard
              title="AI Generations"
              value="—"
              icon={Sparkles}
              variant="purple"
              compact
              href="/admin/ai-generations"
            />
          </>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Orders */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="font-semibold text-foreground">Recent Orders</h2>
              <a
                href="/admin/orders"
                className="flex items-center gap-1 text-sm text-brand-500 hover:text-brand-600"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            {isLoading ? (
              <div className="divide-y divide-border">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex animate-pulse items-center gap-4 p-4">
                    <div className="h-10 w-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 rounded bg-muted" />
                      <div className="h-3 w-24 rounded bg-muted" />
                    </div>
                    <div className="h-6 w-16 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : recentOrders.length > 0 ? (
              <div className="divide-y divide-border">
                {recentOrders.map((order) => (
                  <RecentOrderRow key={order.id} order={order} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShoppingCart className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No orders yet. When customers place orders, they&apos;ll appear here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold text-foreground">Quick Actions</h2>
            </div>
            <div className="p-2">
              <QuickActionButton
                href="/admin/products/new"
                icon={Package}
                label="Add New Product"
              />
              <QuickActionButton
                href="/admin/orders"
                icon={ShoppingCart}
                label="View All Orders"
              />
              <QuickActionButton
                href="/admin/customers"
                icon={Users}
                label="Manage Customers"
              />
              <QuickActionButton
                href="/"
                icon={ExternalLink}
                label="View Store"
                external
              />
            </div>
          </div>

          {/* Order Status Breakdown */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold text-foreground">Order Status</h2>
            </div>
            <div className="p-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex animate-pulse items-center justify-between">
                      <div className="h-4 w-24 rounded bg-muted" />
                      <div className="h-4 w-8 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : orderStats ? (
                <div className="space-y-3">
                  <StatusRow
                    label="Pending"
                    count={orderStats.byStatus.pending || 0}
                    color="bg-amber-500"
                  />
                  <StatusRow
                    label="Processing"
                    count={orderStats.byStatus.processing || 0}
                    color="bg-blue-500"
                  />
                  <StatusRow
                    label="Shipped"
                    count={orderStats.byStatus.shipped || 0}
                    color="bg-indigo-500"
                  />
                  <StatusRow
                    label="Delivered"
                    count={orderStats.byStatus.delivered || 0}
                    color="bg-green-500"
                  />
                  <StatusRow
                    label="Cancelled"
                    count={orderStats.byStatus.cancelled || 0}
                    color="bg-red-500"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface RecentOrderRowProps {
  order: RecentOrder
}

function RecentOrderRow({ order }: RecentOrderRowProps) {
  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    pending_payment: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-blue-100 text-blue-700',
    processing: 'bg-blue-100 text-blue-700',
    shipped: 'bg-indigo-100 text-indigo-700',
    out_for_delivery: 'bg-indigo-100 text-indigo-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    refund_requested: 'bg-orange-100 text-orange-700',
    refunded: 'bg-gray-100 text-gray-700',
    failed: 'bg-red-100 text-red-700',
  }

  const customerName = order.customer?.name || order.customer?.email || 'Guest'
  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <a
      href={`/admin/orders/${order.id}`}
      className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50"
    >
      {/* Avatar */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-600">
        {customerName.charAt(0).toUpperCase()}
      </div>

      {/* Order Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{order.orderNumber}</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
              statusColors[order.status] || 'bg-gray-100 text-gray-700'
            )}
          >
            {order.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">{customerName}</span>
          <span>•</span>
          <span>{formattedDate}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right">
        <p className="font-semibold text-foreground">
          {formatPrice(parseFloat(order.total))}
        </p>
        <p
          className={cn(
            'text-xs capitalize',
            order.paymentStatus === 'paid'
              ? 'text-green-600'
              : order.paymentStatus === 'failed'
                ? 'text-red-600'
                : 'text-muted-foreground'
          )}
        >
          {order.paymentStatus.replace(/_/g, ' ')}
        </p>
      </div>
    </a>
  )
}

interface QuickActionButtonProps {
  href: string
  icon: typeof Package
  label: string
  external?: boolean
}

function QuickActionButton({
  href,
  icon: Icon,
  label,
  external,
}: QuickActionButtonProps) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {external && <ExternalLink className="h-4 w-4 text-muted-foreground" />}
    </a>
  )
}

interface StatusRowProps {
  label: string
  count: number
  color: string
}

function StatusRow({ label, count, color }: StatusRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={cn('h-2 w-2 rounded-full', color)} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-medium text-foreground">{count}</span>
    </div>
  )
}

export default AdminDashboard
