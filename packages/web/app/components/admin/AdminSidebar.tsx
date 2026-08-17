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
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  ImageIcon,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  ClipboardCheck,
  Store,
  Percent,
  Gift,
  Truck,
  Frame,
  Factory,
  Hammer,
  ScrollText,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { signOut } from '~/lib/auth-client'
import { clearLocalCart } from '~/hooks/useCartAuthTransition'
import { isAdminNavItemVisible, staffAreaLabel } from '~/lib/admin-nav'

// ============================================================================
// Types
// ============================================================================

export interface NavItem {
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

/**
 * Exported so `tests/components/admin/AdminSidebar.test.tsx` can compare every
 * href against the generated route tree — four of these pointed at routes that
 * did not exist and nothing noticed (#603).
 */
export const NAV_ITEMS: NavItem[] = [
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
    label: 'Promotions',
    href: '/admin/promotions',
    icon: Percent,
  },
  {
    label: 'Gift Cards',
    href: '/admin/gift-cards',
    icon: Gift,
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
    // Customer photo submissions waiting on a human (#605). The queue and its
    // API shipped without a door: typing the URL was the only way in, so
    // submissions piled up unseen. Operational, so it sits with Reviews and
    // AI Moderation rather than under Settings — and stays out of
    // CONTENT_MANAGER_ALLOWED_PREFIXES, matching requireAdmin on the API.
    label: 'Approvals',
    href: '/admin/approvals',
    icon: ClipboardCheck,
  },
  {
    label: 'Returns',
    href: '/admin/returns',
    icon: RotateCcw,
  },
  {
    // The supplier directory (#618). Operational, so it sits in the primary
    // list beside Orders and Returns rather than under Settings — a vendor is
    // someone we send work to, not a catalogue axis like a frame.
    //
    // This entry and `admin-nav.ts` are edited together, always: route access
    // and visible navigation are driven by the same module, and #603 exists
    // because that pairing was bypassed. `/admin/vendors` stays OUT of
    // CONTENT_MANAGER_ALLOWED_PREFIXES — payables and vendor cost are admin
    // data, matching requireAdmin on the API.
    label: 'Vendors',
    href: '/admin/vendors',
    icon: Factory,
  },
  {
    // The production queue (#620) — what has been sent out to be made, and
    // what came back. It sits directly under Vendors because the two are read
    // together: a job names a vendor and a vendor's open-job count is a link
    // into this queue.
    //
    // Edited in the same commit as `admin-nav.ts`, always — route access and
    // visible navigation come from that one module, and #603 exists because
    // the pairing was bypassed. `/admin/production` stays OUT of
    // CONTENT_MANAGER_ALLOWED_PREFIXES: a job carries what we pay a supplier,
    // matching requireAdmin on the API.
    label: 'Production',
    href: '/admin/production',
    icon: Hammer,
  },
  // `AI Generations` -> /admin/ai-generations was dropped rather than repointed
  // (#603): the screen it meant is /admin/ai-moderation, already listed above,
  // so repointing would have left two entries for one screen.
  //
  // `Analytics` -> /admin/analytics was dropped too — no route, no API, and the
  // analytics-dashboard feature has not started. It comes back with the screen.
  {
    label: 'Customers',
    href: '/admin/customers',
    icon: Users,
  },
  {
    // The free-shipping threshold (#570). It belongs in the primary list
    // rather than under Settings: it is a number customers are shown on every
    // page, not a preference.
    label: 'Shipping',
    href: '/admin/shipping',
    icon: Truck,
  },
]

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    // Admin and super-admin only at the API (rows carry customer emails), so
    // a content-manager who follows this link gets a 403 rather than data.
    // It is listed anyway: hiding the audit log from the people it audits is
    // the wrong instinct, and the enforcement is server-side regardless.
    label: 'Audit Log',
    href: '/admin/audit-log',
    icon: ScrollText,
  },
  {
    label: 'Collections',
    href: '/admin/collections',
    icon: ImageIcon,
  },
  {
    // Here rather than in the primary list: a frame is a catalogue axis like a
    // collection, not an operational surface like Orders.
    label: 'Frames',
    href: '/admin/frames',
    icon: Frame,
  },
  // `Categories` -> /admin/categories and `Settings` -> /admin/settings both
  // 404'd and were removed (#603). Categories does not come back without a
  // categories model: product taxonomy here is collections, and `category`
  // exists only as `frameCategoryEnum` on frames.
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
    // The reload below discards the query cache, but not the cart the store
    // persisted to localStorage — which would rehydrate under whoever signs in
    // next (#511).
    clearLocalCart()
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
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-medium text-white">
                M
              </div>
              <span className="text-lg font-medium text-foreground">chobii.art</span>
            </a>
          )}
          {isCollapsed && (
            <a href="/admin" className="flex w-full items-center justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-medium text-white">
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
                Catalog
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
      <span className="text-lg font-medium text-foreground">{title}</span>
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
