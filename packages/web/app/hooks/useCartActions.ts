/**
 * The cart's single write path (#511).
 *
 * The server cart is the one `POST /api/orders` reads, so it is the one that
 * decides. Each action applies its change locally first — the UI must not wait
 * on a round trip — then sends it, then replaces the local cart with whatever
 * the server says the cart now is. A rejection restores the snapshot and puts
 * the reason in `syncError`, so the two can never disagree about what checkout
 * will find.
 *
 * The refetch goes through `queryClient.fetchQuery` on `cartKeys.detail()`
 * rather than a bare `cartApi.get()`, so the cart page's `useServerCart` — the
 * one place sale savings are read from — sees the new payload without a second
 * request. The server has already dropped its cache: every mutation handler
 * ends in `updateCartTotals`, which calls `invalidateCartCache`.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { cartApi } from "~/lib/api";
import { cartKeys } from "~/hooks/useCart";
import type { ServerCartPayload } from "~/lib/cart-projection";
import { useCartStore, type AddToCartInput, type CartItem } from "~/stores/cart";

/** A line the server has not acknowledged yet cannot be addressed by id. */
function isPending(id: string): boolean {
  return id.startsWith("pending");
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "Could not update your cart";
}

function fetchCart(queryClient: QueryClient): Promise<ServerCartPayload> {
  return queryClient.fetchQuery({
    queryKey: cartKeys.detail(),
    queryFn: () => cartApi.get() as Promise<ServerCartPayload>,
    staleTime: 0,
  });
}

export interface CartActions {
  addItem: (input: AddToCartInput) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearCart: () => Promise<void>;
  /**
   * Empty the cart locally without a DELETE.
   *
   * For after a paid order: `routes/orders.ts` has already deleted the
   * purchased lines, and a DELETE here would be a wasted round trip that could
   * also take out anything added since.
   */
  resetLocalCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

export function useCartActions(): CartActions {
  const queryClient = useQueryClient();

  const addItem = useCallback(
    async (input: AddToCartInput) => {
      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      store.addItemLocal(input);

      try {
        await cartApi.addItem({
          productId: input.productId,
          variantId: input.variantId,
          frameId: input.frameId ?? null,
          quantity: input.quantity ?? 1,
          customizations: input.customizations,
          isAiGenerated: input.isAiGenerated ?? false,
          aiDetails: input.aiDetails,
        });

        useCartStore.getState().replaceFromServer(await fetchCart(queryClient));
      } catch (error) {
        useCartStore.getState().restore(snapshot);
        useCartStore.getState().setSyncError(readError(error));
      }
    },
    [queryClient]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      store.removeItemLocal(id);

      // A pending line has no server row to delete; dropping it locally is the
      // whole operation.
      if (isPending(id)) return;

      try {
        await cartApi.removeItem(id);
        useCartStore.getState().replaceFromServer(await fetchCart(queryClient));
      } catch (error) {
        useCartStore.getState().restore(snapshot);
        useCartStore.getState().setSyncError(readError(error));
      }
    },
    [queryClient]
  );

  const updateQuantity = useCallback(
    async (id: string, quantity: number) => {
      // The server's schema has no zero quantity; zero means remove.
      if (quantity <= 0) {
        await removeItem(id);
        return;
      }

      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      store.updateQuantityLocal(id, quantity);

      if (isPending(id)) return;

      try {
        await cartApi.updateItem(id, { quantity });
        useCartStore.getState().replaceFromServer(await fetchCart(queryClient));
      } catch (error) {
        useCartStore.getState().restore(snapshot);
        useCartStore.getState().setSyncError(readError(error));
      }
    },
    [queryClient, removeItem]
  );

  const clearCart = useCallback(async () => {
    const store = useCartStore.getState();
    const snapshot: CartItem[] = store.items;

    store.clearLocal();

    try {
      await cartApi.clear();
      useCartStore.getState().replaceFromServer(await fetchCart(queryClient));
    } catch (error) {
      useCartStore.getState().restore(snapshot);
      useCartStore.getState().setSyncError(readError(error));
    }
  }, [queryClient]);

  const resetLocalCart = useCallback(() => {
    useCartStore.getState().clearLocal();
    queryClient.invalidateQueries({ queryKey: cartKeys.detail() });
  }, [queryClient]);

  const openDrawer = useCartStore((state) => state.openDrawer);
  const closeDrawer = useCartStore((state) => state.closeDrawer);
  const toggleDrawer = useCartStore((state) => state.toggleDrawer);

  return useMemo(
    () => ({
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      resetLocalCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    }),
    [
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      resetLocalCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    ]
  );
}
