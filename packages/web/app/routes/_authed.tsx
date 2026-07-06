/**
 * Protected Routes Layout - MasonArt E-commerce Platform
 *
 * Layout route that guards all child routes requiring authentication.
 * Uses TanStack Router's beforeLoad hook to check auth state and redirect
 * unauthenticated users to the login page.
 *
 * Following patterns from TanStack Start + Better Auth documentation.
 */

import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

/**
 * Protected layout route
 *
 * All routes under /_authed/ will require authentication.
 * The session is already available in the route context from the root route.
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    // Check if user is authenticated using session from root context
    if (!context.session?.user) {
      // Redirect to login with the original destination as redirect param
      throw redirect({
        to: "/auth/login",
        search: {
          redirect: location.href,
        },
      });
    }

    // Pass user to child routes for convenience
    return {
      user: context.session.user,
    };
  },
  component: AuthedLayout,
});

/**
 * Authenticated layout component
 * Simply renders child routes - all auth checking is done in beforeLoad
 */
function AuthedLayout() {
  return <Outlet />;
}
