/**
 * Registration: the opt-in, and the intent that has to survive the redirect (#441).
 *
 * Three separate failures are pinned here, and each has already happened once
 * on this feature:
 *
 * 1. **The search schema silently ate the intent.** `/auth/register` validated
 *    `{ redirect }` only, so the `?join=gallery&email=…` the join modal sends
 *    (#444) was stripped on arrival and the offer dead-ended at an ordinary
 *    signup form. Widening it is not enough on its own — `app/router.tsx`
 *    overrides TanStack's search serialisation, so every value arrives as a
 *    STRING, and a schema that assumes otherwise throws inside `validateSearch`
 *    and error-boundaries the route to a blank page instead of failing loudly.
 *
 * 2. **A pre-ticked marketing box.** The opt-in is UNCHECKED for someone who
 *    arrived the ordinary way. Consent that was never given is not consent, and
 *    a default-on checkbox is exactly how a consent record becomes worthless.
 *    Arriving with `?join=gallery` is different: the visitor already said yes in
 *    the modal, so the box reflects the answer they gave.
 *
 * 3. **The intent held in component state.** Google sign-in is a full
 *    navigation to another origin and back; every piece of React state is gone
 *    by the time the session exists. The intent rides a short-lived cookie,
 *    which is what the API's `session.create` hook reads on the far side.
 *
 * @see packages/web/app/routes/auth/register.tsx
 * @see packages/api/src/services/gallery-membership.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

// ============================================================================
// Router mock — search is the input under test, navigation is spied
// ============================================================================

const router = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => router.navigate,
  useSearch: () => router.search,
}))

// ============================================================================
// Auth client mock — signup itself belongs to better-auth's own suite
// ============================================================================

const authClient = vi.hoisted(() => ({
  signUpEmail: vi.fn(async () => ({ error: null })),
  signInSocial: vi.fn(async () => ({ error: null })),
}))

vi.mock('~/lib/auth-client', () => ({
  signUp: { email: (...args: unknown[]) => authClient.signUpEmail(...args) },
  signIn: { social: (...args: unknown[]) => authClient.signInSocial(...args) },
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import {
  JOIN_INTENT_COOKIE,
  JOIN_INTENT_VALUE,
  clearJoinIntent,
  hasJoinIntent,
  setJoinIntent,
} from '~/lib/joinIntent'
import { RegisterPage, parseRegisterSearch } from '~/routes/auth/register'

// ============================================================================
// Helpers
// ============================================================================

/**
 * Registering is an auth transition, so the page tells the cart to re-read
 * itself from the server (#511) — which needs a query client in scope. Nothing
 * below asserts on it; this is the ambient provider the real app supplies from
 * `__root`.
 */
function renderAt(search: Record<string, unknown>) {
  router.search = search
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterPage />
    </QueryClientProvider>
  )
}

const optIn = () =>
  screen.getByTestId('gallery-opt-in') as HTMLInputElement

const VALID = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'Password123',
}

/** Fill the form far enough that submit is enabled. */
function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/full name/i), {
    target: { value: VALID.name },
  })
  fireEvent.change(screen.getByLabelText(/^email$/i), {
    target: { value: VALID.email },
  })
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: VALID.password },
  })
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: VALID.password },
  })
}

/** Google sign-in is async too, and the click leaves state behind it. */
async function clickGoogle() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }))
  })
}

/** Submitting starts an async signup; act() keeps React's warning honest. */
async function submitForm() {
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  router.search = {}
  clearJoinIntent()
})

afterEach(() => {
  cleanup()
  clearJoinIntent()
})

// ============================================================================
// validateSearch — the defect #444 walked into
// ============================================================================

describe('parseRegisterSearch', () => {
  it('carries the join intent the modal sends', () => {
    const parsed = parseRegisterSearch({
      join: 'gallery',
      email: 'ada@example.com',
    })
    expect(parsed.join).toBe('gallery')
    expect(parsed.email).toBe('ada@example.com')
  })

  it('still carries redirect', () => {
    expect(parseRegisterSearch({ redirect: '/sale' }).redirect).toBe('/sale')
  })

  it('keeps every value a string', () => {
    // router.tsx hands search through URLSearchParams, so everything arrives
    // as a string. Coercing to anything else here disagrees with the URL that
    // gets serialised back out.
    const parsed = parseRegisterSearch({ join: 'gallery', redirect: '/sale' })
    expect(typeof parsed.join).toBe('string')
    expect(typeof parsed.redirect).toBe('string')
  })

  it('coerces a non-string value rather than rejecting it', () => {
    // Nothing stops a link from carrying ?email=1. A throw here blank-pages
    // the route; a coercion lands the visitor on a working form.
    expect(parseRegisterSearch({ email: 1 as unknown }).email).toBe('1')
  })

  it('drops empty values instead of carrying blanks', () => {
    const parsed = parseRegisterSearch({ join: '', email: '', redirect: '' })
    expect(parsed.join).toBeUndefined()
    expect(parsed.email).toBeUndefined()
    expect(parsed.redirect).toBeUndefined()
  })

  it('leaves absent params absent', () => {
    expect(parseRegisterSearch({})).toEqual({})
  })

  it('ignores unknown params rather than passing them through', () => {
    expect(parseRegisterSearch({ utm_source: 'x' })).toEqual({})
  })

  it('never throws, whatever it is handed', () => {
    // A throw inside validateSearch error-boundaries the whole route.
    expect(() => parseRegisterSearch({ join: null as unknown })).not.toThrow()
    expect(() =>
      parseRegisterSearch({ redirect: { nested: true } as unknown })
    ).not.toThrow()
    expect(() => parseRegisterSearch({ email: [] as unknown })).not.toThrow()
  })
})

// ============================================================================
// The opt-in checkbox
// ============================================================================

describe('the registration opt-in', () => {
  it('is unchecked for someone who arrived the ordinary way', () => {
    renderAt({})
    expect(optIn().checked).toBe(false)
  })

  it('shows no unlock panel without the intent', () => {
    renderAt({})
    expect(screen.queryByTestId('gallery-join-unlock')).toBeNull()
  })

  it('is pre-checked when the visitor already said yes in the modal', () => {
    renderAt({ join: 'gallery' })
    expect(optIn().checked).toBe(true)
  })

  it('spells out what joining unlocks when the intent is present', () => {
    renderAt({ join: 'gallery', email: 'ada@example.com' })
    const panel = screen.getByTestId('gallery-join-unlock')
    expect(panel.textContent).toMatch(/member/i)
    expect(panel.textContent).toMatch(/price/i)
  })

  it('ignores a join value that is not the gallery', () => {
    renderAt({ join: 'something-else' })
    expect(optIn().checked).toBe(false)
    expect(screen.queryByTestId('gallery-join-unlock')).toBeNull()
  })

  it('prefills the email the modal already collected', () => {
    renderAt({ join: 'gallery', email: 'ada@example.com' })
    expect((screen.getByLabelText(/^email$/i) as HTMLInputElement).value).toBe(
      'ada@example.com'
    )
  })
})

// ============================================================================
// The intent has to outlive the page
// ============================================================================

describe('the intent cookie', () => {
  it('is set on arrival with the intent, before anything is submitted', () => {
    // The visitor may take the "Sign in" link instead of registering. The
    // cookie is what makes that path join them too.
    renderAt({ join: 'gallery' })
    expect(hasJoinIntent()).toBe(true)
  })

  it('is absent for an ordinary arrival', () => {
    renderAt({})
    expect(hasJoinIntent()).toBe(false)
  })

  it('tracks the checkbox, so unticking withdraws the intent', () => {
    renderAt({ join: 'gallery' })
    expect(hasJoinIntent()).toBe(true)

    fireEvent.click(optIn())
    expect(optIn().checked).toBe(false)
    expect(hasJoinIntent()).toBe(false)

    fireEvent.click(optIn())
    expect(hasJoinIntent()).toBe(true)
  })

  it('is set by ticking the box on an ordinary registration', () => {
    renderAt({})
    fireEvent.click(optIn())
    expect(hasJoinIntent()).toBe(true)
  })

  it('survives the Google round trip by being a cookie, not state', async () => {
    renderAt({ join: 'gallery' })

    await clickGoogle()
    expect(authClient.signInSocial).toHaveBeenCalled()

    // The cookie is still there for the callback to read — the component that
    // held the checkbox is about to be destroyed by a cross-origin navigation.
    expect(hasJoinIntent()).toBe(true)
  })

  it('is still set when the email signup navigates away to sign in', async () => {
    renderAt({ join: 'gallery', redirect: '/sale' })
    fillValidForm()
    await submitForm()

    expect(authClient.signUpEmail).toHaveBeenCalled()
    expect(hasJoinIntent()).toBe(true)
  })
})

// ============================================================================
// Returning the visitor where they were
// ============================================================================

describe('where the visitor lands afterwards', () => {
  it('carries redirect through the email signup handoff', async () => {
    renderAt({ join: 'gallery', redirect: '/sale' })
    fillValidForm()
    await submitForm()

    expect(router.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/auth/login',
        search: expect.objectContaining({ redirect: '/sale' }),
      })
    )
  })

  it('hands the same destination to the Google callback', async () => {
    renderAt({ join: 'gallery', redirect: '/sale' })
    await clickGoogle()

    expect(authClient.signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: '/sale' })
    )
  })

  it('keeps the intent on the sign-in link for a visitor who already has an account', () => {
    renderAt({ join: 'gallery', email: 'ada@example.com' })
    const signIn = screen.getByRole('link', { name: /sign in/i })
    expect(signIn.getAttribute('href')).toContain('/auth/login')
  })
})

// ============================================================================
// The cookie module itself
// ============================================================================

describe('joinIntent', () => {
  it('round-trips', () => {
    expect(hasJoinIntent()).toBe(false)
    setJoinIntent()
    expect(hasJoinIntent()).toBe(true)
    expect(document.cookie).toContain(`${JOIN_INTENT_COOKIE}=${JOIN_INTENT_VALUE}`)
    clearJoinIntent()
    expect(hasJoinIntent()).toBe(false)
  })

  it('is short-lived, so an abandoned intent does not join someone months later', () => {
    // Asserted through the written attributes because jsdom will not expire it
    // for us; the value is what the browser enforces.
    const writes: string[] = []
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'cookie'
    )
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: (value: string) => writes.push(value),
    })
    try {
      setJoinIntent()
    } finally {
      delete (document as unknown as Record<string, unknown>).cookie
      if (descriptor) Object.defineProperty(Document.prototype, 'cookie', descriptor)
    }

    expect(writes[0]).toMatch(/max-age=(\d+)/i)
    const maxAge = Number(/max-age=(\d+)/i.exec(writes[0])?.[1])
    expect(maxAge).toBeGreaterThan(0)
    expect(maxAge).toBeLessThanOrEqual(60 * 60)
    expect(writes[0]).toMatch(/path=\//i)
    expect(writes[0]).toMatch(/samesite=lax/i)
  })
})
