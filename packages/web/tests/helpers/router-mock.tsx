/**
 * A `@tanstack/react-router` stand-in for component tests that render a route
 * module directly.
 *
 * `createFileRoute` hands the config straight back rather than registering a
 * route, and `Link` degrades to a plain anchor, so a route component can be
 * rendered without a router context around it.
 *
 * ```tsx
 * vi.mock('@tanstack/react-router', async () =>
 *   (await import('../../helpers/router-mock')).tanstackRouterMock()
 * )
 * ```
 *
 * @see packages/web/tests/routes/admin/dashboard-order-stats.test.tsx
 * @see packages/web/tests/routes/admin/dashboard-product-stats.test.tsx
 */

import type { ReactNode } from 'react'

export function tanstackRouterMock() {
  return {
    createFileRoute: () => (config: unknown) => config,
    Link: ({ children, ...props }: { children: ReactNode; to?: string }) => (
      <a href={props.to}>{children}</a>
    ),
  }
}
