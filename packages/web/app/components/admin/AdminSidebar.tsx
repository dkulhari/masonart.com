/**
 * Admin Sidebar Component - chobii.art E-commerce Platform
 *
 * Navigation sidebar for the admin panel with collapsible mobile support,
 * active state highlighting, and role-based navigation items.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Sparkles,
  BarChart3,
  Tags,
  ImageIcon,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Store,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { signOut } from '~/lib/auth-client'
import { isAdminNavItemVisible, staffAreaLabel } from '~/lib/admin-nav'

// ============================================================================
// Types
// ============================================================================

interface NavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  badge?: string | number
  children?: NavItem[]
}

interface AdminSidebarProps {
  className?: string
  user?: {
    name: string
    email: string
    image?: string
    role?: string
  }
  /** Controlled collapse state — lets the admin layout offset content to match */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

// ============================================================================
// Navigation Configuration
// ============================================================================

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    label: 'Products',
    href: '/admin/products',
    icon: Package,
  },
  {
    label: 'Orders',
    href: '/admin/orders',
    icon: ShoppingCart,
  },
  {
    label: 'Reviews',
    href: '/admin/reviews',
    icon: MessageSquare,
  },
  {
    label: 'AI Moderation',
    href: '/admin/ai-moderation',
    icon: ShieldCheck,
  },
  {
    label: 'Returns',
    href: '/admin/returns',
    icon: RotateCcw,
  },
  {
    label: 'AI Generations',
    href: '/admin/ai-generations',
    icon: Sparkles,
  },
  {
    label: 'Customers',
    href: '/admin/customers',
    icon: Users,
  },
  {
    label: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
  },
]

const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    label: 'Collections',
    href: '/admin/collections',
    icon: ImageIcon,
  },
  {
    label: 'Categories',
    href: '/admin/categories',
    icon: Tags,
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
]

// ============================================================================
// Main Component
// ============================================================================

export function AdminSidebar({
  className,
  user,
  collapsed,
  onCollapsedChange,
}: AdminSidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const isCollapsed = collapsed ?? internalCollapsed
  const setIsCollapsed = (value: boolean) => {
    setInternalCollapsed(value)
    onCollapsedChange?.(value)
  }
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const router = useRouter()

  // Get current path for active state
  const currentPath = router.state.location.pathname

  // Filter navigation by role (content-managers only see catalog sections)
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    isAdminNavItemVisible(user?.role, item.href)
  )
  const visibleSecondaryNavItems = SECONDARY_NAV_ITEMS.filter((item) =>
    isAdminNavItemVisible(user?.role, item.href)
  )

  // Check if a nav item is active
  const isActive = (href: string) => {
    if (href === '/admin') {
      return currentPath === '/admin'
    }
    return currentPath.startsWith(href)
  }

  // Handle sign out via the Better Auth client — same path as the account
  // page. A hand-rolled body-less fetch here once 500'd through the prod
  // edge (empty POST re-framed as chunked) and left sessions alive (#341).
  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      // Surface the failure instead of silently redirecting with a live
      // session — that's exactly how #341 stayed invisible.
      console.error('Sign out failed:', error)
    }
    window.location.href = '/'
  }

  // Get user initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-card p-2 shadow-md md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6 text-foreground" />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-300',
          isCollapsed ? 'w-[72px]' : 'w-64',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          className
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {!isCollapsed && (
            <a href="/admin" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
                M
              </div>
              <span className="text-lg font-bold text-foreground">chobii.art</span>
            </a>
          )}
          {isCollapsed && (
            <a href="/admin" className="flex w-full items-center justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
                M
              </div>
            </a>
          )}

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="rounded-lg p-1 hover:bg-muted md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Desktop Collapse Button */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden rounded-lg p-1 hover:bg-muted md:block"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          {/* Main Navigation */}
          <div className="space-y-1">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                isCollapsed={isCollapsed}
                onClick={() => setIsMobileOpen(false)}
              />
            ))}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Secondary Navigation */}
          <div className="space-y-1">
            {!isCollapsed && (
              <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Settings
              </p>
            )}
            {visibleSecondaryNavItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                isCollapsed={isCollapsed}
                onClick={() => setIsMobileOpen(false)}
              />
            ))}
          </div>
        </nav>

        {/* User Section */}
        <div className="border-t border-border p-3">
          {user && (
            <div
              className={cn(
                'flex items-center gap-3',
                isCollapsed ? 'justify-center' : ''
              )}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-600">
                    {getInitials(user.name || user.email)}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
              </div>

              {/* User Info */}
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user.name || 'Admin'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              )}
            </div>
          )}

          {/* Back to the customer site — the only way out of /admin on
              desktop, so it has to keep an accessible name once the sidebar
              collapses to icons (#362). */}
          <a
            href="/"
            aria-label="View Store"
            title={isCollapsed ? 'View Store' : undefined}
            className={cn(
              'mt-3 flex w-full items-center gap-3 rounded-lg p-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              isCollapsed ? 'justify-center' : ''
            )}
          >
            <Store className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && <span>View Store</span>}
          </a>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={handleSignOut}
            className={cn(
              'mt-3 flex w-full items-center gap-3 rounded-lg p-2 text-sm text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600',
              isCollapsed ? 'justify-center' : ''
            )}
          >
            <LogOut className="h-5 w-5" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  )
}

// ============================================================================
// NavLink Component
// ============================================================================

interface NavLinkProps {
  item: NavItem
  isActive: boolean
  isCollapsed: boolean
  onClick?: () => void
}

function NavLink({ item, isActive, isCollapsed, onClick }: NavLinkProps) {
  const Icon = item.icon

  return (
    <a
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
        isActive
          ? 'bg-brand-50 text-brand-600'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        isCollapsed ? 'justify-center px-2' : ''
      )}
      title={isCollapsed ? item.label : undefined}
    >
      <Icon
        className={cn('h-5 w-5 flex-shrink-0', isActive ? 'text-brand-500' : '')}
      />
      {!isCollapsed && (
        <>
          <span className="flex-1">{item.label}</span>
          {item.badge && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-medium text-white">
              {item.badge}
            </span>
          )}
        </>
      )}
    </a>
  )
}

// ============================================================================
// Mobile Admin Header Component (for use in layout)
// ============================================================================

export function MobileAdminHeader({ role }: { role?: string }) {
  // Same label the customer header uses to get here, so the destination
  // matches the door (#362).
  const title = staffAreaLabel(role) ?? 'Admin Panel'

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 pl-16 md:hidden">
      <span className="text-lg font-bold text-foreground">{title}</span>
      {/* The only way out of /admin on a phone — the bare text link was a
          20px-tall tap target, well under the 44px minimum (#362). */}
      <a
        href="/"
        className="-mr-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
      >
        View Store
      </a>
    </header>
  )
}

export default AdminSidebar
