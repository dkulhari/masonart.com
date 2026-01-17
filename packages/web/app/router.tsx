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
 * Create and configure the router instance
 */
export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
