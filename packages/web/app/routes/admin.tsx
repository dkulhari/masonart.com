/**
 * Admin Layout Route - MasonArt E-commerce Platform
 *
 * Protected layout route that wraps all admin pages with:
 * - Role-based access control (admin only)
 * - Admin sidebar navigation
 * - Responsive layout for mobile/desktop
 *
 * This is the parent route for all /admin/* routes.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState } from 'react'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { Loader2, ShieldAlert } from 'lucide-react'
import { cn } from '~/lib/utils'
import { authApi } from '~/lib/api'
import { AdminSidebar, MobileAdminHeader } from '~/components/admin/AdminSidebar'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Admin Panel | MasonArt' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminLayout,
})

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

interface SessionResponse {
  user?: User
}

// ============================================================================
// Admin Layout Component
// ============================================================================

function AdminLayout() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUnauthorized, setIsUnauthorized] = useState(false)

  // Check authentication and admin role
  useEffect(() => {
    async function checkAuth() {
      try {
        const session: SessionResponse | null = await authApi.getSession()

        if (!session?.user) {
          // Not logged in - redirect to login
          navigate({
            to: '/auth/login',
            search: { redirect: '/admin' },
          })
          return
        }

        const userRole = session.user.role?.toLowerCase()

        // Check for admin or super-admin role
        if (userRole !== 'admin' && userRole !== 'super-admin') {
          setIsUnauthorized(true)
          setIsLoading(false)
          return
        }

        setUser(session.user)
        setIsLoading(false)
      } catch (error) {
        // Auth check failed - redirect to login
        navigate({
          to: '/auth/login',
          search: { redirect: '/admin' },
        })
      }
    }

    checkAuth()
  }, [navigate])

  // Loading state
  if (isLoading) {
    return <LoadingScreen />
  }

  // Unauthorized state
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
// Loading Screen Component
// ============================================================================

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-brand-500" />
        <p className="mt-4 text-muted-foreground">Loading admin panel...</p>
      </div>
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
