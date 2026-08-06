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
 */

import { useEffect, useRef } from 'react'

import { useServerCart } from '~/hooks/useCart'
import type { ServerCartPayload } from '~/lib/cart-projection'
import { useCartStore } from '~/stores/cart'

export function CartSync(): null {
  const { data, error } = useServerCart()
  const replaceFromServer = useCartStore((state) => state.replaceFromServer)
  const setSyncError = useCartStore((state) => state.setSyncError)
  const lastProjectedRef = useRef<ServerCartPayload | null>(null)

  useEffect(() => {
    // Prevent double-projection when the same payload reference arrives
    // from both applyIfCurrent's setQueryData (which notifies this observer)
    // and its direct replaceFromServer call. Only project if the reference changed.
    if (data && data !== lastProjectedRef.current) {
      lastProjectedRef.current = data
      replaceFromServer(data as unknown as ServerCartPayload)
    }

    // Handle fetch errors. If the query is in an error state, signal it.
    // A successful fetch (even if it returns empty) clears the error because
    // replaceFromServer always sets syncError: null.
    if (error) {
      setSyncError('Could not load your cart. Please try again.')
    }
  }, [data, error, replaceFromServer, setSyncError])

  return null
}
