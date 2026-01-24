/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import type * as React from 'react'
import { Header } from '~/components/layout/Header'
import { Footer } from '~/components/layout/Footer'
import globalsCss from '~/styles/globals.css?url'
import type { Session } from '~/lib/auth-client'

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

    // Make server-side request to the auth API with cookies
    const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000'
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
 * Root route configuration for the MasonArt e-commerce application.
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
        title: 'MasonArt | Premium Posters & Frames',
      },
      {
        name: 'description',
        content:
          'Discover premium posters and custom frames at MasonArt. Create unique AI-generated art or choose from our curated collection of wall art for your space.',
      },
      {
        property: 'og:title',
        content: 'MasonArt | Premium Posters & Frames',
      },
      {
        property: 'og:description',
        content:
          'Discover premium posters and custom frames at MasonArt. Create unique AI-generated art or choose from our curated collection.',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:site_name',
        content: 'MasonArt',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'MasonArt | Premium Posters & Frames',
      },
      {
        name: 'twitter:description',
        content:
          'Discover premium posters and custom frames. Create unique AI-generated art for your space.',
      },
      {
        name: 'theme-color',
        content: '#f97316',
      },
    ],
    links: [
      { rel: 'stylesheet', href: globalsCss },
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
 * Wraps all child routes with the consistent header and footer.
 */
function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

/**
 * Root document wrapper that provides the HTML structure.
 * Includes Head content, scripts, and the main layout structure.
 */
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="relative flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
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
