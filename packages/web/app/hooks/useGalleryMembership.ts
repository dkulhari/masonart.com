/**
 * useGalleryMembership — is the viewer in the gallery? (#443)
 *
 * One hook, one answer. Every surface that shows a locked price reads it from
 * here instead of deriving membership itself, so a banner, the cart and the
 * sale page can never disagree about who the viewer is.
 *
 * ## Where the answer comes from
 *
 * The root route resolves the session in `beforeLoad` and hands it down the
 * router context (`__root.tsx`), which means membership is already known when
 * the server renders the page — the same read `Header.tsx` and `wishlist.tsx`
 * do. That is deliberate and load-bearing: better-auth's own `useSession()`
 * starts at `{ data: null, isPending: true }` and only settles after a client
 * round trip, so a hook built on it would paint an unlocked price and then
 * lock it a beat later. `galleryMember` still travels as a better-auth
 * additional field (#439); the root route just fetches the session early
 * enough for SSR to see it.
 *
 * ## What this hook does NOT do
 *
 * It decides whether a saving reads as *locked*. It never decides what the
 * saving *is* — those numbers come resolved from the API, and a second price
 * calculation living on the client would be a second source of truth.
 */

import { useCallback, useState } from 'react'
import { useRouteContext } from '@tanstack/react-router'

import { getApiUrl } from '~/lib/utils'

/**
 * Mirrors the enum `POST /api/gallery/join` validates against (#440). A source
 * outside this list is rejected with a 400, so the type keeps the mistake at
 * compile time rather than in a toast.
 */
export const JOIN_SOURCES = [
  'banner',
  'rail',
  'cart',
  'registration',
  'sale-page',
] as const

export type JoinSource = (typeof JOIN_SOURCES)[number]

export interface GalleryMembership {
  /** True when the viewer's saving should read as unlocked. */
  isMember: boolean
  /**
   * A `join()` is in flight.
   *
   * Membership itself is never "loading" — the server resolved it before the
   * first paint — so this only ever describes the write.
   */
  isLoading: boolean
  /** Opt in. Resolves to the membership state after the call, never throws. */
  join: (source: JoinSource) => Promise<boolean>
}

interface SessionShape {
  user?: { galleryMember?: boolean | null } | null
}

export function useGalleryMembership(): GalleryMembership {
  const { session } = useRouteContext({ from: '__root__' }) as {
    session?: SessionShape | null
  }

  /**
   * Optimistic flip. The router context keeps the value it was loaded with
   * until the next navigation revalidates it, so without this the price the
   * viewer just unlocked would stay locked on the page they unlocked it from.
   * It only ever turns membership on — it cannot mask a session that already
   * says the viewer is a member.
   */
  const [joined, setJoined] = useState(false)
  const [isJoining, setIsJoining] = useState(false)

  const isMember = Boolean(session?.user?.galleryMember) || joined

  const join = useCallback(async (source: JoinSource) => {
    setIsJoining(true)
    try {
      // Absolute base: the API is a separate origin in dev and there is no
      // Vite `/api` proxy in this repo, so a bare `/api/...` would hit the web
      // server. `credentials: 'include'` is what carries the better-auth
      // cookie — the endpoint is authenticated.
      const response = await fetch(`${getApiUrl()}/api/gallery/join`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })

      if (!response.ok) return false

      // The endpoint is idempotent and answers with the stored state, so trust
      // its `galleryMember` rather than assuming the call changed anything.
      const result = (await response
        .json()
        .catch(() => null)) as { galleryMember?: boolean } | null
      const member = result?.galleryMember ?? true

      if (member) setJoined(true)
      return member
    } catch {
      // Offline, aborted, CORS. The viewer stays where they were; the caller
      // decides whether that deserves a message.
      return false
    } finally {
      setIsJoining(false)
    }
  }, [])

  return { isMember, isLoading: isJoining, join }
}
