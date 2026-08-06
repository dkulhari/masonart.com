/**
 * Puts the server's cart into the store, once per visit and after every
 * refetch.
 *
 * The store persists to localStorage for first paint, but the server cart is
 * what checkout reads (#511), so what is on screen has to come from there as
 * soon as it is known. Renders nothing; it is a subscription, not UI.
 *
 * Mounted at the root rather than per route, so a customer who lands on the
 * PDP and adds from there is already working against the real cart.
 *
 * Deduplication: replaceFromServer is idempotent in the store — if the new
 * items equal the current items, array identity is preserved to avoid
 * re-renders. This is important because the same payload can arrive via
 * multiple paths (applyIfCurrent's setQueryData, direct call, or stale
 * cache hits). See stores/cart.ts for the implementation.
 */

import { useEffect } from 'react'

import { useServerCart } from '~/hooks/useCart'
import { useCartStore } from '~/stores/cart'

export function CartSync(): null {
  const { data, error } = useServerCart()
  const replaceFromServer = useCartStore((state) => state.replaceFromServer)
  const setSyncError = useCartStore((state) => state.setSyncError)

  useEffect(() => {
    // Project successful fetches into the store
    if (data) replaceFromServer(data)

    // Handle fetch errors. If the query is in an error state, signal it.
    // A successful fetch (even if it returns empty) clears the error because
    // replaceFromServer always sets syncError: null.
    if (error) {
      setSyncError('Could not load your cart. Please try again.')
    }
  }, [data, error, replaceFromServer, setSyncError])

  return null
}
