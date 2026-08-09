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
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  FREE_SHIPPING_THRESHOLD,
} from '@chobii/shared'
import { useEffect } from 'react'
import type * as React from 'react'
import { FreeShippingThresholdProvider } from '~/lib/free-shipping'
import { AnnouncementBar } from '~/components/layout/AnnouncementBar'
import { SaleStrip } from '~/components/layout/SaleStrip'
import { Header } from '~/components/layout/Header'
import { MOBILE_TAB_BAR_PADDING_CLASS } from '~/components/layout/MobileTabBar'
import { Footer } from '~/components/layout/Footer'
import { CartSync } from '~/components/cart/CartSync'
import { CartDrawer } from '~/components/cart/CartDrawer'
import { ReviewToast } from '~/components/reviews/ReviewToast'
import { SaleBanner } from '~/components/promo/SaleBanner'
import { OfferRail } from '~/components/promo/OfferRail'
import { buttonVariants } from '~/components/ui/Button'
import { cn } from '~/lib/utils'
import { useWishlistStore } from '~/stores/wishlist'
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
  /**
   * The free-shipping threshold in force, in whole rupees (#570).
   *
   * Here, and nowhere else. Ten customer-facing surfaces state this number and
   * the cart charges by it; fetching it per surface would be ten requests for
   * one figure and ten chances for them to disagree.
   */
  freeShippingThreshold: number
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
 * Server function for the free-shipping threshold (#570).
 *
 * One call per document, on the server, resolved before the first paint. The
 * API answers this from Redis and never throws; if the fetch itself fails we
 * return the bundled constant, which is also the value the API falls back to —
 * so a storefront that could not reach the API still prints the figure the
 * server would charge by rather than a zero or a blank.
 */
const fetchFreeShippingThreshold = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      // ?? not ||: an explicitly-set value must always win (cc #96).
      const apiUrl = process.env.VITE_API_URL ?? 'http://localhost:3000'
      const response = await fetch(`${apiUrl}/api/shipping/config`)

      if (!response.ok) return FREE_SHIPPING_THRESHOLD

      const body = (await response.json()) as {
        freeShippingThreshold?: number
      }
      return typeof body.freeShippingThreshold === 'number'
        ? body.freeShippingThreshold
        : FREE_SHIPPING_THRESHOLD
    } catch (error) {
      console.error('Failed to fetch free shipping threshold:', error)
      return FREE_SHIPPING_THRESHOLD
    }
  }
)

/**
 * Root route configuration for the chobii.art e-commerce application.
 * Sets up global SEO metadata, stylesheets, and the main layout structure.
 * Fetches user session server-side for SSR optimization.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    // In parallel: neither depends on the other, and this runs before the
    // first paint of every document.
    const [session, freeShippingThreshold] = await Promise.all([
      fetchSession(),
      fetchFreeShippingThreshold(),
    ])
    return { session, freeShippingThreshold }
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

  // The root route is the only place that already knows the session, so it is
  // the only place that should tell the wishlist store. Without this the store
  // fetched an auth-gated endpoint blind — six 401s per guest page load (#417).
  const { session, freeShippingThreshold } = Route.useRouteContext()
  const setWishlistAuthenticated = useWishlistStore(
    (state) => state.setAuthenticated
  )

  useEffect(() => {
    setWishlistAuthenticated(Boolean(session?.user))
  }, [session, setWishlistAuthenticated])

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        Read from the router context once, here, and published to every
        surface that states the figure (#570). The alternative — each surface
        calling `useRouteContext` for itself — is the same value ten times and
        ten components that can only be tested by standing up a router.
      */}
      <FreeShippingThresholdProvider value={freeShippingThreshold}>
        <RootDocument>
          <Outlet />
        </RootDocument>
      </FreeShippingThresholdProvider>
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
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-pill focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        {/* The bottom tab bar is `fixed`, so it reserves no space of its own
            and would otherwise cover the last band of every page — the
            footer's bottom row first. The padding is the bar's own constant,
            imported rather than retyped, and goes on the shell rather than on
            <main> so it sits BELOW the footer. `min-h-screen` is a border-box
            minimum, so this adds no scroll to a short page. Admin has no
            Header, so no bar and no padding. */}
        <div
          className={cn(
            'relative flex min-h-screen flex-col overflow-x-hidden max-w-full',
            !isAdminRoute && MOBILE_TAB_BAR_PADDING_CLASS
          )}
        >
          {/* Above the announcement bar, and self-suppressing: it renders
              nothing at all unless a promotion row is actually active (#434) */}
          {!isAdminRoute && <SaleStrip />}
          {!isAdminRoute && <AnnouncementBar />}
          {!isAdminRoute && <Header />}
          <main id="main-content" tabIndex={-1} className="flex-1">
            {children}
          </main>
          {!isAdminRoute && <Footer />}
        </div>
        {/* Mounted once at the root so any surface can open the cart (#460) */}
        {!isAdminRoute && <CartSync />}
        {!isAdminRoute && <CartDrawer />}
        {/**
         * After the outlet, so it paints above page content, and before the
         * drawer, which owns the higher z-index. Mounted once here rather than
         * per route so it fetches one page for the whole visit and survives
         * navigation. It suppresses ITSELF on /checkout and /admin — the check
         * lives in the component, ahead of its data hook, so a suppressed route
         * makes no request at all. Do not add a second gate here; one rule, one
         * place, one test.
         */}
        <ReviewToast />
        {/**
         * The join offer (#445). Mounted once here so the promotion is looked
         * up once for the whole visit and the "once per session" rule is not
         * re-decided on every navigation. It renders nothing on the server pass
         * and nothing at all unless a promotion is active and the viewer is not
         * already a member — the frequency rules live in the component, with
         * the rail (#446) reading the same store. Do not add a second gate
         * here.
         */}
        {!isAdminRoute && <SaleBanner />}
        {/**
         * The way back to a dismissed offer (#446). Mounted here rather than
         * per route because it is the recovery path for the whole visit — a
         * per-page mount would reset it on every navigation. It reads the same
         * store the banner writes and decides nothing itself, so there is no
         * gate to add here beyond the admin one.
         */}
        {!isAdminRoute && <OfferRail />}
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
      <h1 className="text-4xl text-foreground">404</h1>
      <p className="mt-4 text-lg text-muted-foreground">Page not found</p>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <a href="/" className={cn(buttonVariants(), 'mt-8')}>
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
      <h1 className="text-4xl text-destructive">Error</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Something went wrong
      </p>
      <pre className="mt-4 max-w-lg overflow-auto rounded-md bg-muted p-4 text-sm">
        {error.message}
      </pre>
      <a href="/" className={cn(buttonVariants(), 'mt-8')}>
        Go Home
      </a>
    </div>
  )
}
