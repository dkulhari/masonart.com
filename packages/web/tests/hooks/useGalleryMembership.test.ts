/**
 * useGalleryMembership — the one place a surface asks "is this viewer in the
 * gallery?" (#443).
 *
 * Two things are actually under test here, and neither is obvious:
 *
 * 1. **No first-paint flash.** The root route resolves the session in
 *    `beforeLoad` (`__root.tsx`), so membership is already known when the
 *    server renders. A hook that learned it from a client fetch — better-auth's
 *    `useSession()` included, which starts `{ data: null, isPending: true }` —
 *    would paint an unlocked price and then lock it. So the SSR assertions are
 *    real renders through `renderToStaticMarkup`, where effects never run: a
 *    fetch-based implementation cannot pass them.
 *
 * 2. **The hook decides presentation, not price.** Its surface is asserted key
 *    by key, so nobody can quietly grow a `memberPrice` onto it later. The
 *    numbers arrive resolved from the API.
 *
 * The session is mocked at `useRouteContext` rather than at `fetch`, because
 * the route context IS the SSR-safe source — stubbing `fetch` instead would
 * test the very round trip this hook exists to avoid. `fetch` is stubbed only
 * for `join()`, which is a genuine write.
 *
 * `getApiUrl()` builds the base rather than a bare `/api/...`: there is no Vite
 * `/api` proxy in this repo and the API is a separate origin in dev.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

import { getApiUrl } from '~/lib/utils'
import {
  JOIN_SOURCES,
  resetGalleryMembershipSignal,
  useGalleryMembership,
} from '~/hooks/useGalleryMembership'

// ============================================================================
// Session mock — stands in for the root route's beforeLoad result
// ============================================================================

type TestSession = {
  user?: { id?: string; galleryMember?: boolean | null } | null
} | null

const routeContext = vi.hoisted(() => ({
  value: { session: null as TestSession },
}))

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => routeContext.value,
}))

function setSession(session: TestSession) {
  routeContext.value = { session }
}

const guest: TestSession = null
const nonMember: TestSession = { user: { id: 'u-1', galleryMember: false } }
const member: TestSession = { user: { id: 'u-1', galleryMember: true } }

const API = getApiUrl()
const JOIN_URL = `${API}/api/gallery/join`

// ============================================================================
// fetch stub
// ============================================================================

const fetchMock = vi.fn()

function respondWith(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

beforeEach(() => {
  setSession(guest)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  // The optimistic flip is one shared signal so every surface flips together
  // (#446). A real page load throws it away; these cases share a module.
  resetGalleryMembershipSignal()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ============================================================================
// Reading membership off the session
// ============================================================================

describe('useGalleryMembership — reading the session', () => {
  it('reports a guest as not a member', () => {
    setSession(guest)

    const { result } = renderHook(() => useGalleryMembership())

    expect(result.current.isMember).toBe(false)
  })

  it('reads galleryMember from the session', () => {
    setSession(member)

    const { result } = renderHook(() => useGalleryMembership())

    expect(result.current.isMember).toBe(true)
  })

  it('reports a signed-in non-member as not a member', () => {
    setSession(nonMember)

    const { result } = renderHook(() => useGalleryMembership())

    expect(result.current.isMember).toBe(false)
  })

  it('treats an absent galleryMember field as not a member', () => {
    // An older session cookie minted before the additional field existed.
    setSession({ user: { id: 'u-1' } })

    const { result } = renderHook(() => useGalleryMembership())

    expect(result.current.isMember).toBe(false)
  })

  it('is not loading just because it is reading the session', () => {
    // Membership is never pending: the server resolved it in beforeLoad.
    setSession(member)

    const { result } = renderHook(() => useGalleryMembership())

    expect(result.current.isLoading).toBe(false)
  })
})

// ============================================================================
// First paint — the no-flash guarantee
// ============================================================================

describe('useGalleryMembership — first paint', () => {
  /** Records the value the hook returned on every render it went through. */
  function makeProbe(seen: boolean[]) {
    return function Probe() {
      const { isMember } = useGalleryMembership()
      seen.push(isMember)
      return React.createElement('span', null, isMember ? 'member' : 'guest')
    }
  }

  it('renders a member as a member on the server, before any effect runs', () => {
    setSession(member)
    const seen: boolean[] = []

    const html = renderToStaticMarkup(React.createElement(makeProbe(seen)))

    expect(html).toBe('<span>member</span>')
    expect(seen).toEqual([true])
  })

  it('renders a guest as a guest on the server', () => {
    setSession(guest)
    const seen: boolean[] = []

    const html = renderToStaticMarkup(React.createElement(makeProbe(seen)))

    expect(html).toBe('<span>guest</span>')
    expect(seen).toEqual([false])
  })

  it('does not flash the wrong state on first paint', async () => {
    // The real defect this guards: paint the unlocked price, then lock it a
    // beat later once a client fetch lands. So compare what the server sent
    // with every value the client produced — they must all be the one answer.
    setSession(member)

    const serverSeen: boolean[] = []
    const serverHtml = renderToStaticMarkup(
      React.createElement(makeProbe(serverSeen)),
    )

    const clientSeen: boolean[] = []
    const { container } = render(React.createElement(makeProbe(clientSeen)))
    // Flush anything the hook might have scheduled for after hydration.
    await act(async () => {})

    expect(container.innerHTML).toBe(serverHtml)
    expect(clientSeen[0]).toBe(serverSeen[0])
    expect(new Set([...serverSeen, ...clientSeen])).toEqual(new Set([true]))
  })

  it('does not flash the wrong state for a guest either', async () => {
    // The inverse mistake: assume "member" while a fetch is in flight and
    // briefly show a saving the viewer has not unlocked.
    setSession(guest)

    const clientSeen: boolean[] = []
    render(React.createElement(makeProbe(clientSeen)))
    await act(async () => {})

    expect(new Set(clientSeen)).toEqual(new Set([false]))
  })

  it('never fetches to discover membership', async () => {
    setSession(member)

    render(React.createElement(makeProbe([])))
    await act(async () => {})

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// join()
// ============================================================================

describe('useGalleryMembership — join()', () => {
  it('posts the source and flips state on success', async () => {
    setSession(nonMember)
    respondWith(200, { galleryMember: true, joinSource: 'banner' })

    const { result } = renderHook(() => useGalleryMembership())
    expect(result.current.isMember).toBe(false)

    let joined: boolean | undefined
    await act(async () => {
      joined = await result.current.join('banner')
    })

    expect(joined).toBe(true)
    expect(result.current.isMember).toBe(true)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(JOIN_URL)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ source: 'banner' })
  })

  it('sends credentials so better-auth sees the session', async () => {
    setSession(nonMember)
    respondWith(200, { galleryMember: true })

    const { result } = renderHook(() => useGalleryMembership())
    await act(async () => {
      await result.current.join('cart')
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.credentials).toBe('include')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('posts to the API origin rather than the web origin', async () => {
    // There is no Vite `/api` proxy here — a bare fetch('/api/gallery/join')
    // would hit the web server and 404 in dev.
    setSession(nonMember)
    respondWith(200, { galleryMember: true })

    const { result } = renderHook(() => useGalleryMembership())
    await act(async () => {
      await result.current.join('rail')
    })

    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/gallery/join`)
  })

  it('accepts every source the endpoint validates', async () => {
    setSession(nonMember)

    for (const source of JOIN_SOURCES) {
      fetchMock.mockReset()
      respondWith(200, { galleryMember: true })

      const { result } = renderHook(() => useGalleryMembership())
      await act(async () => {
        await result.current.join(source)
      })

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ source })
    }
  })

  it('leaves state untouched when join() fails', async () => {
    setSession(nonMember)
    respondWith(500, { error: 'Failed to join the gallery' })

    const { result } = renderHook(() => useGalleryMembership())

    let joined: boolean | undefined
    await act(async () => {
      joined = await result.current.join('banner')
    })

    expect(joined).toBe(false)
    expect(result.current.isMember).toBe(false)
  })

  it('leaves state untouched when the request throws', async () => {
    setSession(nonMember)
    fetchMock.mockRejectedValueOnce(new Error('offline'))

    const { result } = renderHook(() => useGalleryMembership())

    let joined: boolean | undefined
    await act(async () => {
      joined = await result.current.join('sale-page')
    })

    expect(joined).toBe(false)
    expect(result.current.isMember).toBe(false)
  })

  it('stays a member when the endpoint replies idempotently', async () => {
    // #440 returns the stored state for an existing member without writing.
    setSession(member)
    respondWith(200, { galleryMember: true })

    const { result } = renderHook(() => useGalleryMembership())
    await act(async () => {
      await result.current.join('registration')
    })

    expect(result.current.isMember).toBe(true)
  })

  it('reports the join in flight through isLoading', async () => {
    setSession(nonMember)
    let release: (() => void) | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ok: true, status: 200, json: async () => ({ galleryMember: true }) })
        }),
    )

    const { result } = renderHook(() => useGalleryMembership())
    expect(result.current.isLoading).toBe(false)

    let pending: Promise<boolean> | undefined
    act(() => {
      pending = result.current.join('banner')
    })
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      release?.()
      await pending
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isMember).toBe(true)
  })

  it('keeps a stable join reference across renders', () => {
    setSession(guest)

    const { result, rerender } = renderHook(() => useGalleryMembership())
    const first = result.current.join
    rerender()

    expect(result.current.join).toBe(first)
  })
})

// ============================================================================
// Surface — presentation only, never price
// ============================================================================

describe('useGalleryMembership — surface', () => {
  it('exposes exactly isMember, isLoading and join', () => {
    setSession(member)

    const { result } = renderHook(() => useGalleryMembership())

    expect(Object.keys(result.current).sort()).toEqual([
      'isLoading',
      'isMember',
      'join',
    ])
  })

  it('carries no price of its own', () => {
    // The saving is resolved by the API; this hook only decides whether it
    // reads as locked. Any number here would be a second source of truth.
    setSession(member)

    const { result } = renderHook(() => useGalleryMembership())

    for (const value of Object.values(result.current)) {
      expect(typeof value).not.toBe('number')
    }
  })
})
