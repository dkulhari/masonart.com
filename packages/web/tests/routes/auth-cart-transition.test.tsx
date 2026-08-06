/**
 * The cart across an authentication change (#511 final review, finding 3).
 *
 * `mergeGuestCartOnAuth` is mounted on `cartApp`, so a guest cart is folded
 * into the account's on a request to `/api/cart` and on nothing else. `CartSync`
 * is mounted at the root and survives client-side navigation, and
 * `useServerCart` holds its answer for a minute — so a visitor who fills a cart
 * as a guest, bounces off `requireAuth` at checkout, signs in and is
 * `navigate()`d straight back issues no cart request at all between those two
 * moments. The guest cookie is never consumed, the merge never runs, and
 * `POST /api/orders` answers "No active cart found" with the customer's items
 * sitting in the database the whole time — the original bug, reintroduced
 * through the login form.
 *
 * The other direction leaks: signing out left both the persisted store and
 * `cartKeys.detail()` populated, so the next person to sign in on the same
 * browser was shown the previous user's items and total.
 *
 * These tests assert the transition, not the transport: that each entry point
 * marks the server cart stale (which is what makes the next read go to the wire
 * and run the merge), and that signing out leaves neither copy behind.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

// ============================================================================
// Router mock — navigation is the thing that DOESN'T refetch, so it is spied
// ============================================================================

const router = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  context: { user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' } },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useRouteContext: () => router.context,
  }),
  useNavigate: () => router.navigate,
  useSearch: () => router.search,
  useRouter: () => ({ state: { location: { pathname: '/admin/products' } } }),
  Link: ({ children, ...rest }: { children?: ReactNode }) => (
    <a {...rest}>{children}</a>
  ),
}))

const authClient = vi.hoisted(() => ({
  signInEmail: vi.fn(async () => ({ error: null })),
  signInSocial: vi.fn(async () => ({ error: null })),
  signUpEmail: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({})),
}))

vi.mock('~/lib/auth-client', () => ({
  signIn: {
    email: (...args: unknown[]) => authClient.signInEmail(...args),
    social: (...args: unknown[]) => authClient.signInSocial(...args),
  },
  signUp: { email: (...args: unknown[]) => authClient.signUpEmail(...args) },
  signOut: (...args: unknown[]) => authClient.signOut(...args),
}))

vi.mock('~/lib/api', () => ({
  ordersApi: { list: vi.fn(async () => ({ items: [] })) },
}))

import { cartKeys } from '~/hooks/useCart'
import { useCartStore } from '~/stores/cart'
import { LoginPage } from '~/routes/auth/login'
import { RegisterPage } from '~/routes/auth/register'
import { AccountDashboardPage } from '~/routes/_authed/account/index'
import { AdminSidebar } from '~/components/admin/AdminSidebar'

// ============================================================================
// Helpers
// ============================================================================

const GUEST_CART = {
  id: 'cart-1',
  itemCount: 1,
  subtotal: '2000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [],
}

let queryClient!: QueryClient

/** The cart a guest already had on screen when they hit the login form. */
function seedCartCache() {
  queryClient.setQueryData(cartKeys.detail(), GUEST_CART)
  // Not stale yet: `useServerCart` holds its answer for a minute, which is the
  // whole reason a navigate() alone changes nothing.
  expect(queryClient.getQueryState(cartKeys.detail())?.isInvalidated).toBe(false)
}

function cartIsStale(): boolean {
  return Boolean(queryClient.getQueryState(cartKeys.detail())?.isInvalidated)
}

function renderWithQuery(ui: ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  router.search = {}
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  useCartStore.setState({ items: [], isDrawerOpen: false, syncError: null })
})

afterEach(() => {
  cleanup()
})

// ============================================================================
// Signing in
// ============================================================================

describe('signing in re-reads the cart', () => {
  function fillEmailForm() {
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Password123' },
    })
  }

  it('marks the server cart stale after an email sign-in', async () => {
    renderWithQuery(<LoginPage />)
    seedCartCache()

    fillEmailForm()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    })

    await waitFor(() => expect(authClient.signInEmail).toHaveBeenCalled())
    // Without this the next read is served from a cache that predates the
    // session, so nothing ever asks /api/cart and the guest cart is never
    // merged into the account's.
    expect(cartIsStale()).toBe(true)
    expect(router.navigate).toHaveBeenCalled()
  })

  it('leaves the cart alone when the credentials are refused', async () => {
    authClient.signInEmail.mockResolvedValueOnce({
      error: { message: 'Invalid email or password' },
    } as never)
    renderWithQuery(<LoginPage />)
    seedCartCache()

    fillEmailForm()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    })

    // No session, no transition. Re-reading here would be harmless but wrong
    // for the same reason the fix is right: the trigger is the session
    // changing, not the form being submitted.
    expect(cartIsStale()).toBe(false)
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('marks the server cart stale after a phone OTP sign-in', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ success: true, sessionId: 's1', isExistingUser: true }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    renderWithQuery(<LoginPage />)
    seedCartCache()

    fireEvent.click(screen.getByRole('button', { name: /^phone$/i }))
    fireEvent.change(screen.getByLabelText('Phone Number'), {
      target: { value: '9876543210' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send otp/i }))
    })

    fireEvent.change(await screen.findByLabelText('Enter OTP'), {
      target: { value: '123456' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /verify & sign in/i }))
    })

    // The OTP path establishes the session through its own endpoint rather
    // than through better-auth's client, so it is a separate place to forget.
    expect(cartIsStale()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('marks the server cart stale before handing off to Google', async () => {
    renderWithQuery(<LoginPage />)
    seedCartCache()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    })

    expect(authClient.signInSocial).toHaveBeenCalled()
    expect(cartIsStale()).toBe(true)
  })

  it('marks the server cart stale after registering', async () => {
    renderWithQuery(<RegisterPage />)
    seedCartCache()

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Ada Lovelace' },
    })
    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'Password123' },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'Password123' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    })

    await waitFor(() => expect(authClient.signUpEmail).toHaveBeenCalled())
    expect(cartIsStale()).toBe(true)
  })
})

// ============================================================================
// Signing out
// ============================================================================

describe('signing out takes the cart with it', () => {
  const someonesCart = [
    {
      id: 'line-1',
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: null,
      quantity: 1,
      productTitle: 'Blue Hour',
      productSlug: 'blue-hour',
      thumbnailUrl: '',
      sizeLabel: '24x36 inches',
      widthInches: 24,
      heightInches: 36,
      unitPrice: 2000,
      framePrice: 0,
      isAiGenerated: false,
      addedAt: '2026-08-06T06:00:00.000Z',
    },
  ]

  it('clears both copies when the account page signs out', async () => {
    useCartStore.setState({ items: someonesCart })
    renderWithQuery(<AccountDashboardPage />)
    queryClient.setQueryData(cartKeys.detail(), GUEST_CART)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    })

    // The next person to sign in on this browser must not be shown the
    // previous account's items — nor be able to send a DELETE for a row they
    // do not own and get a 404 they cannot act on.
    expect(useCartStore.getState().items).toEqual([])
    expect(queryClient.getQueryData(cartKeys.detail())).toBeUndefined()
  })

  it('clears the persisted cart when the admin sidebar signs out', async () => {
    useCartStore.setState({ items: someonesCart })
    const location = { href: '/admin/products' }
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    })

    renderWithQuery(<AdminSidebar user={{ name: 'Ada', email: 'a@b.c', role: 'admin' }} collapsed={false} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    })

    // This one leaves through a full document load, which discards the query
    // cache on its own — but not localStorage, which rehydrates the store
    // under whoever signs in next.
    expect(useCartStore.getState().items).toEqual([])
    expect(location.href).toBe('/')
  })
})
