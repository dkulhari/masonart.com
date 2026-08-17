/**
 * Admin Layout Route - chobii.art E-commerce Platform
 *
 * Protected layout route that wraps all admin pages with:
 * - Role-based access control (admin only)
 * - Admin sidebar navigation
 * - Responsive layout for mobile/desktop
 *
 * This is the parent route for all /admin/* routes.
 * Uses beforeLoad for SSR-level auth protection (like _authed.tsx).
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from 'react'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import { cn } from '~/lib/utils'
import { isContentManagerPathAllowed } from '~/lib/admin-nav'
import { AdminSidebar, MobileAdminHeader } from '~/components/admin/AdminSidebar'

// ============================================================================
// Types
// ============================================================================

interface User {
  id: string
  name: string
  email: string
  image?: string
  role?: string
}

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ context, location }) => {
    // Check if user is authenticated using session from root context
    if (!context.session?.user) {
      // Not logged in - redirect to login with redirect param
      throw redirect({
        to: '/auth/login',
        search: {
          redirect: location.href,
        },
      })
    }

    /*
     * Same narrowing the component does below, and for the same reason: Better
     * Auth's inferred session user has no `role`, the field comes from the
     * additionalFields config. Doing it here too means the authorization
     * decision is made against a declared shape rather than an untyped read
     * (#626).
     */
    const sessionUser = context.session.user as User
    const userRole = sessionUser.role?.toLowerCase()
    const isAdminRole = userRole === 'admin' || userRole === 'super-admin'
    const isContentManagerRole = userRole === 'content-manager'

    // Only admin, super-admin, and content-manager may enter the admin panel
    if (!isAdminRole && !isContentManagerRole) {
      // User is authenticated but not authorized - return flag for component
      return {
        user: context.session.user,
        isUnauthorized: true,
      }
    }

    // Content-managers only get the catalog sections; the dashboard and all
    // other sections stay admin-only
    if (isContentManagerRole) {
      const path = location.pathname.replace(/\/+$/, '') || '/admin'
      if (path === '/admin') {
        // No dashboard for content-managers - land on products
        throw redirect({
          to: '/admin/products',
          search: {
            page: 1,
            pageSize: 20,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          },
        })
      }
      if (!isContentManagerPathAllowed(path)) {
        return {
          user: context.session.user,
          isUnauthorized: true,
        }
      }
    }

    // User is authorized for this section - pass to component
    return {
      user: context.session.user,
      isUnauthorized: false,
    }
  },
  head: () => ({
    meta: [
      { title: 'Admin Panel | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminLayout,
})

// ============================================================================
// Admin Layout Component
// ============================================================================

function AdminLayout() {
  const context = Route.useRouteContext()
  const { isUnauthorized } = context
  // Better Auth's inferred session user has no `role`; the field is added by
  // the additionalFields config, so narrow to the local shape once here
  // instead of reaching for `user.role` untyped at each use site.
  const user = context.user as User | undefined
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // Unauthorized state (non-admin user)
  if (isUnauthorized) {
    return <UnauthorizedScreen />
  }

  // Authorized admin user
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Admin Sidebar */}
      <AdminSidebar
        user={
          user
            ? {
                name: user.name,
                email: user.email,
                image: user.image,
                role: user.role,
              }
            : undefined
        }
        collapsed={isSidebarCollapsed}
        onCollapsedChange={setIsSidebarCollapsed}
      />

      {/* Mobile Header */}
      <MobileAdminHeader role={user?.role} />

      {/* Main Content Area */}
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          // Desktop: offset tracks the sidebar's collapse state
          isSidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-64',
          // Mobile: add top padding for fixed header
          'pt-16 md:pt-0'
        )}
      >
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

// ============================================================================
// Unauthorized Screen Component
// ============================================================================

function UnauthorizedScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="mt-6 text-2xl font-medium text-foreground">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">
          You don&apos;t have permission to access the admin panel. Please contact
          your administrator if you believe this is a mistake.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Go to Homepage
          </a>
          <a
            href="/account"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            My Account
          </a>
        </div>
      </div>
    </div>
  )
}

export default AdminLayout
