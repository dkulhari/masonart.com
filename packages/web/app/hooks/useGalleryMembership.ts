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
 * ## Why the optimistic flip is a module signal and not component state
 *
 * The router context keeps the value it was loaded with until the next
 * navigation revalidates it, so a successful `join()` has to be remembered on
 * the client or the price the viewer just unlocked stays locked. That memory
 * used to be `useState` inside the hook, which made it *per instance*: the
 * modal that ran the join flipped, and every other consumer on the page — the
 * banner, the rail (#446), the cart — went on reading `isMember === false`
 * until the next navigation. The rail's version of that was visible: it
 * appeared offering a 40% discount to somebody who had just become a member.
 *
 * One signal, every reader. `useSyncExternalStore` is what makes the other
 * instances re-render when one of them joins.
 *
 * It is pinned to the identity that joined, so it can only ever unlock the
 * account that earned it: a sign-out (or a different user) drops back to
 * whatever the session says. And it only turns membership *on* — it cannot
 * mask a session that already says the viewer is a member.
 *
 * ## What this hook does NOT do
 *
 * It decides whether a saving reads as *locked*. It never decides what the
 * saving *is* — those numbers come resolved from the API, and a second price
 * calculation living on the client would be a second source of truth.
 */

import { useCallback, useState, useSyncExternalStore } from 'react'
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
  user?: { id?: string | null; galleryMember?: boolean | null } | null
}

// ============================================================================
// The shared optimistic signal — see the header
// ============================================================================

/**
 * Stands in for a user id when the session carries a user but no id. Any stable
 * value works: the point is that a signed-out session gets `null` instead, so
 * the flip can never survive a sign-out.
 */
const SIGNED_IN = 'signed-in-without-id'

/** Who the client believes joined, pending the next context revalidation. */
let joinedIdentity: string | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getJoinedIdentity(): string | null {
  return joinedIdentity
}

/**
 * The server has no optimistic state to report — nobody has joined during a
 * render that has not been sent yet. Returning a constant also keeps the SSR
 * snapshot stable, which `useSyncExternalStore` compares by identity.
 */
function getServerJoinedIdentity(): string | null {
  return null
}

function markJoined(identity: string | null): void {
  if (identity === null || joinedIdentity === identity) return

  joinedIdentity = identity
  for (const listener of listeners) listener()
}

/**
 * Drop the optimistic flip.
 *
 * Exists for tests, which share one module instance across cases where a real
 * page load would throw it away. Production never needs it: the signal is
 * pinned to an identity, so a sign-out already stops it applying.
 */
export function resetGalleryMembershipSignal(): void {
  joinedIdentity = null
  for (const listener of listeners) listener()
}

/** The identity the optimistic flip is pinned to; null when nobody is signed in. */
function identityOf(session: SessionShape | null | undefined): string | null {
  const user = session?.user
  if (!user) return null
  return user.id ?? SIGNED_IN
}

// ============================================================================
// Hook
// ============================================================================

export function useGalleryMembership(): GalleryMembership {
  const { session } = useRouteContext({ from: '__root__' }) as {
    session?: SessionShape | null
  }

  const identity = identityOf(session)
  const joinedId = useSyncExternalStore(
    subscribe,
    getJoinedIdentity,
    getServerJoinedIdentity,
  )
  const [isJoining, setIsJoining] = useState(false)

  const isMember =
    Boolean(session?.user?.galleryMember) ||
    (identity !== null && joinedId === identity)

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

      // Published to every consumer, not just this one. The surface that ran
      // the join is rarely the only one on screen that owes the viewer a
      // different answer a moment later.
      if (member) markJoined(identity)
      return member
    } catch {
      // Offline, aborted, CORS. The viewer stays where they were; the caller
      // decides whether that deserves a message.
      return false
    } finally {
      setIsJoining(false)
    }
  }, [identity])

  return { isMember, isLoading: isJoining, join }
}
