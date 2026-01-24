/**
 * TanStack Router Configuration
 *
 * Configures the router with:
 * - Route tree from file-based routing
 * - Scroll restoration
 * - Default error handling
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/start/getting-started
 */

import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/**
 * Router context interface
 * This must match the context expected by createRootRouteWithContext
 */
interface RouterContext {
  session: {
    user: {
      id: string
      name: string
      email: string
      emailVerified: boolean
      createdAt: Date
      updatedAt: Date
      image?: string | null
    }
    session: {
      id: string
      expiresAt: Date
      token: string
      createdAt: Date
      updatedAt: Date
      userId: string
    }
  } | null
}

/**
 * Create and configure the router instance
 */
export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Provide initial context - session will be populated by root route's beforeLoad
    context: {
      session: null,
    } satisfies RouterContext,
  })

  return router
}

// New TanStack Start API requires getRouter export
export function getRouter() {
  return createRouter()
}

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
