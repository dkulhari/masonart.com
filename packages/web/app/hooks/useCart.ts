/**
 * TanStack Query Hook for Cart (Server-Side Read)
 *
 * `useServerCart` is the one server read left (#511) — the store owns every
 * write, through `useCartActions`, and re-projects its own optimism onto
 * itself via `replaceFromServer`. This module used to also carry five
 * mutation hooks with their own optimistic-rollback layer against the query
 * cache, but nothing ever called them; keeping a second optimistic layer
 * beside the store's is how a cart starts disagreeing with itself. See #511.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { cartApi } from "~/lib/api";
import type { ServerCartPayload } from "~/lib/cart-projection";

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for cart
 */
export const cartKeys = {
  all: ["cart"] as const,
  detail: () => [...cartKeys.all, "detail"] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch the current server-side cart
 *
 * @example
 * ```tsx
 * const { data: cart, isLoading } = useServerCart();
 *
 * // Use for authenticated users to sync with server
 * if (cart) {
 *   console.log(`Server cart has ${cart.itemCount} items`);
 * }
 * ```
 */
export function useServerCart(
  options?: Omit<
    UseQueryOptions<ServerCartPayload, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: cartKeys.detail(),
    queryFn: () => cartApi.get() as Promise<ServerCartPayload>,
    staleTime: 1000 * 60, // 1 minute
    retry: 1, // Don't retry too many times for cart
    ...options,
  });
}
