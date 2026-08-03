/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BRAND_NAME, BRAND_TAGLINE } from '@chobii/shared'
import type * as React from 'react'
import { Header } from '~/components/layout/Header'
import { Footer } from '~/components/layout/Footer'
import globalsCss from '~/styles/globals.css?url'
import type { Session } from '~/lib/auth-client'

/**
 * Create a QueryClient with SSR-friendly defaults
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000, // 1 minute
      },
    },
  })
}

// Browser-only singleton QueryClient
let browserQueryClient: QueryClient | undefined = undefined

/**
 * Get or create QueryClient
 * - Server: Always create new client (to avoid sharing state between requests)
 * - Browser: Use singleton (to preserve cache across navigations)
 */
function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient()
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  }
}

/**
 * Router context interface containing authenticated user session
 */
interface RouterContext {
  session: Session | null
}

/**
 * Server function to fetch the user session
 * This runs on the server where we have access to cookies
 */
const fetchSession = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const request = getRequest()
    if (!request) {
      return null
    }

    // Make server-side request to the auth API with cookies.
    // ?? not ||: an explicitly-set value must always win (cc #96).
    const apiUrl = process.env.VITE_API_URL ?? 'http://localhost:3000'
    const response = await fetch(`${apiUrl}/api/auth/get-session`, {
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    })

    if (!response.ok) {
      return null
    }

    const session = await response.json()
    return session as Session
  } catch (error) {
    console.error('Failed to fetch session:', error)
    return null
  }
})

/**
 * Root route configuration for the chobii.art e-commerce application.
 * Sets up global SEO metadata, stylesheets, and the main layout structure.
 * Fetches user session server-side for SSR optimization.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await fetchSession()
    return { session }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: `${BRAND_NAME} | ${BRAND_TAGLINE}`,
      },
      {
        name: 'description',
        content: `Discover premium posters and custom frames at ${BRAND_NAME}. Create unique AI-generated art or choose from our curated collection of wall art for your space.`,
      },
      {
        property: 'og:title',
        content: `${BRAND_NAME} | ${BRAND_TAGLINE}`,
      },
      {
        property: 'og:description',
        content: `Discover premium posters and custom frames at ${BRAND_NAME}. Create unique AI-generated art or choose from our curated collection.`,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:site_name',
        content: BRAND_NAME,
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: `${BRAND_NAME} | ${BRAND_TAGLINE}`,
      },
      {
        name: 'twitter:description',
        content:
          'Discover premium posters and custom frames. Create unique AI-generated art for your space.',
      },
      {
        // Colours the mobile browser chrome. Follows --primary; leaving it
        // orange put a strip of the retired palette above every page.
        name: 'theme-color',
        content: '#171717',
      },
    ],
    links: [
      { rel: 'stylesheet', href: globalsCss },

      /**
       * Poppins + Urbanist, measured from mesonart.com. Both are free Google
       * Fonts, so this matches rather than approximates.
       *
       * Only the weights actually in use are requested — Poppins 300/400/500
       * (body / buttons / product titles) and Urbanist 300/500 (headings).
       * mesonart's own page declares far more and leaves most `unloaded`.
       *
       * display=swap so text paints in the fallback immediately rather than
       * blocking on the webfont.
       */
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href:
          'https://fonts.googleapis.com/css2' +
          '?family=Poppins:wght@300;400;500' +
          '&family=Urbanist:wght@300;500' +
          '&display=swap',
      },

      { rel: 'icon', href: '/favicon.ico' },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
})

/**
 * Root component that renders the main application layout.
 * Wraps all child routes with QueryClientProvider and the consistent header/footer.
 */
function RootComponent() {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </QueryClientProvider>
  )
}

/**
 * Root document wrapper that provides the HTML structure.
 * Includes Head content, scripts, and the main layout structure.
 */
function RootDocument({ children }: { children: React.ReactNode }) {
  // Admin has its own chrome (fixed sidebar + mobile header); the storefront
  // Header/Footer there duplicated navigation and sat underneath the sidebar
  const { location } = useRouterState()
  const isAdminRoute = location.pathname.startsWith('/admin')

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {/* Keyboard/screen-reader shortcut past the navigation (#246) —
            visually hidden until focused */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <div className="relative flex min-h-screen flex-col">
          {!isAdminRoute && <Header />}
          <main id="main-content" tabIndex={-1} className="flex-1">
            {children}
          </main>
          {!isAdminRoute && <Footer />}
        </div>
        <Scripts />
      </body>
    </html>
  )
}

/**
 * 404 Not Found component.
 * Displayed when a route is not found.
 * Note: This renders inside the root component's Outlet, so we don't wrap in RootDocument.
 */
function NotFoundComponent() {
  return (
    <div className="container-wide flex flex-col items-center justify-center py-20">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="mt-4 text-lg text-muted-foreground">Page not found</p>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <a
        href="/"
        className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Go Home
      </a>
    </div>
  )
}

/**
 * Error boundary component.
 * Displayed when an error occurs during rendering.
 * Note: This renders inside the root component's Outlet, so we don't wrap in RootDocument.
 */
function ErrorComponent({ error }: { error: Error }) {
  return (
    <div className="container-wide flex flex-col items-center justify-center py-20">
      <h1 className="text-4xl font-bold text-destructive">Error</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Something went wrong
      </p>
      <pre className="mt-4 max-w-lg overflow-auto rounded-md bg-muted p-4 text-sm">
        {error.message}
      </pre>
      <a
        href="/"
        className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Go Home
      </a>
    </div>
  )
}
