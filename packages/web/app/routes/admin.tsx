/**
 * Admin Layout Route - MasonArt E-commerce Platform
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

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import { cn } from '~/lib/utils'
import { AdminSidebar, MobileAdminHeader } from '~/components/admin/AdminSidebar'

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

    const userRole = context.session.user.role?.toLowerCase()

    // Check for admin or super-admin role
    if (userRole !== 'admin' && userRole !== 'super-admin') {
      // User is authenticated but not an admin - return flag for component
      return {
        user: context.session.user,
        isUnauthorized: true,
      }
    }

    // User is admin - pass to component
    return {
      user: context.session.user,
      isUnauthorized: false,
    }
  },
  head: () => ({
    meta: [
      { title: 'Admin Panel | MasonArt' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminLayout,
})

// ============================================================================
// Admin Layout Component
// ============================================================================

function AdminLayout() {
  const { user, isUnauthorized } = Route.useRouteContext()

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
      />

      {/* Mobile Header */}
      <MobileAdminHeader />

      {/* Main Content Area */}
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          // Desktop: offset for sidebar (default expanded width)
          'lg:ml-64',
          // Mobile: add top padding for fixed header
          'pt-16 lg:pt-0'
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
        <h1 className="mt-6 text-2xl font-bold text-foreground">Access Denied</h1>
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
