/**
 * What has to happen to the cart when the viewer changes (#511 final review,
 * finding 3).
 *
 * The cart is per-viewer on both sides of the wire — a persisted store in this
 * browser and a row in the database keyed to a user or a guest session — and
 * neither notices an authentication change on its own:
 *
 * - `mergeGuestCartOnAuth` is mounted on `cartApp`, so it runs on a request to
 *   `/api/cart` and nowhere else. `CartSync` is mounted at the root and stays
 *   mounted across client-side navigation, and `useServerCart` holds its answer
 *   for a minute, so signing in and being `navigate()`d back to checkout issues
 *   no cart request at all. The guest cookie is never consumed, the guest cart
 *   is never folded in, and `POST /api/orders` finds no cart for the new user:
 *   "No active cart found" — the exact failure this whole change exists to fix,
 *   with the customer's items sitting in the database the whole time.
 *
 * - Signing out clears neither, so the next person to sign in on this browser
 *   is shown the previous user's items and the previous user's total. Removing
 *   one sends a DELETE for a row they do not own, which comes back 404 as a
 *   sync error they have no way to act on.
 *
 * So: every transition invalidates the server cart, and signing out also drops
 * the local projection of it. One helper rather than a copy at each of the five
 * entry points, because the one that gets forgotten is the bug.
 *
 * `signIn.social` leaves through a full document load and comes back through
 * another, which rebuilds the query cache from nothing and remounts `CartSync`
 * anyway. It calls this too — a call site that opts out on a timing argument is
 * a call site that breaks quietly the day the timing changes.
 */

import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { cartKeys } from '~/hooks/useCart'
import { useCartStore } from '~/stores/cart'

/**
 * Drop this browser's copy of the cart.
 *
 * Separate from the hook, and callable without a query client, for the sign-out
 * that leaves through `window.location` rather than the router: a full document
 * load rebuilds the query cache from nothing, so there is nothing there to
 * invalidate — but the store persists to localStorage and would rehydrate under
 * whoever signs in next.
 */
export function clearLocalCart(): void {
  useCartStore.getState().clearLocal()
}

export interface CartAuthTransition {
  /**
   * A session was just established. Marks the server cart stale so the next
   * read goes to the wire — which is also what runs the guest-cart merge.
   *
   * The local store is deliberately NOT cleared: it is the guest's cart, it is
   * about to be merged into the account's, and emptying it here would blank the
   * drawer for as long as the refetch takes.
   */
  onSignedIn: () => void
  /**
   * The session is over. The previous user's cart must not outlive it in either
   * place — removed from the query cache rather than merely invalidated, so
   * nothing renders it while the replacement is on its way.
   */
  onSignedOut: () => void
}

export function useCartAuthTransition(): CartAuthTransition {
  const queryClient = useQueryClient()

  const onSignedIn = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: cartKeys.all })
  }, [queryClient])

  const onSignedOut = useCallback(() => {
    clearLocalCart()
    queryClient.removeQueries({ queryKey: cartKeys.all })
  }, [queryClient])

  return useMemo(
    () => ({ onSignedIn, onSignedOut }),
    [onSignedIn, onSignedOut]
  )
}
