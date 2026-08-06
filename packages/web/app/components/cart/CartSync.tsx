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

import { useEffect } from 'react'

import { useServerCart } from '~/hooks/useCart'
import type { ServerCartPayload } from '~/lib/cart-projection'
import { useCartStore } from '~/stores/cart'

export function CartSync(): null {
  const { data } = useServerCart()
  const replaceFromServer = useCartStore((state) => state.replaceFromServer)

  useEffect(() => {
    if (data) replaceFromServer(data as unknown as ServerCartPayload)
  }, [data, replaceFromServer])

  return null
}
