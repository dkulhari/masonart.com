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
 * Two things past that single-write description, both from #511 fix round 1:
 *
 * 1. Two writes can be in flight at once — a second click before the first's
 *    PATCH returns, an add and a remove on the same still-pending line — and
 *    an older write's rollback or re-projection resolving after a newer one
 *    has already applied its own must be dropped, not applied on top. See
 *    `beginWrite`/`isCurrent`.
 * 2. `removeItem` on a line the server has not acknowledged yet cannot send a
 *    DELETE — there is no id — but the `addItem` that minted the id is
 *    typically still in flight, and letting it finish unattended re-projects
 *    the row it just created right back into view. See `pendingAdds`.
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

/**
 * Every write bumps this before it touches the store, and checks it again
 * before applying whatever it learns. Only the most recently issued write is
 * ever allowed to call `restore` or `replaceFromServer`; an older write's
 * answer — success or failure — is simply dropped once something newer has
 * started, because the newer write owns reconciling state from here and
 * nothing issued after it will come along to override it in turn.
 *
 * Module-level rather than per-hook-instance: every mounted consumer of
 * `useCartActions` writes to the same store, so the arbitration has to be
 * global too, not scoped to whichever component happened to call the hook.
 */
let writeSequence = 0;

function beginWrite(): number {
  writeSequence += 1;
  return writeSequence;
}

function isCurrent(sequence: number): boolean {
  return sequence === writeSequence;
}

/**
 * `pendingId -> the server id that add resolves to, or null if the add failed.`
 *
 * `addItem` registers an entry when it mints a pending id and resolves it
 * once the POST answers. `removeItem` on that same pending id awaits it
 * rather than skipping the server call outright: if the add lands, the row it
 * created is deleted too; if the add failed, there is nothing to delete.
 */
const pendingAdds = new Map<string, Promise<string | null>>();

function withResolver<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Fetches the cart directly with `cartApi.get()` rather than through
 * `queryClient.fetchQuery`, and pushes the result into the cache by hand.
 *
 * `fetchQuery` does not issue a new request when one is already in flight for
 * the same key: `Query#fetch`, in @tanstack/query-core 5.90's source, returns
 * the active retryer's promise whenever `state.fetchStatus !== 'idle'` unless
 * `fetchOptions.cancelRefetch` is set — and the public `fetchQuery(options)`
 * signature never sets it, so there is no way to ask it for a fresh request
 * through that API. Two overlapping writes would then both resolve to
 * whichever payload was already in flight, which can predate the second
 * write's own PATCH or DELETE — settling the cart on a state older than what
 * was just sent, permanently, until something unrelated refetches. Calling
 * `cartApi.get()` directly guarantees this write's own re-projection reflects
 * what the server holds right now; `setQueryData` still populates the cache
 * so the cart page's `useServerCart` sees it without a second request.
 */
async function fetchCart(queryClient: QueryClient): Promise<ServerCartPayload> {
  const cart = (await cartApi.get()) as ServerCartPayload;
  queryClient.setQueryData(cartKeys.detail(), cart);
  return cart;
}

/**
 * Re-projects the server cart onto the store, but only for the write that is
 * still current.
 *
 * Checked twice: once before `fetchCart` — a write already superseded has no
 * reason to make the request at all — and once more after it resolves, since
 * a write that was current when it started can go stale while its own
 * request is still in flight, and its answer must not land on top of
 * whatever the write that superseded it has already applied.
 */
async function applyIfCurrent(
  sequence: number,
  queryClient: QueryClient
): Promise<void> {
  if (!isCurrent(sequence)) return;
  const cart = await fetchCart(queryClient);
  if (!isCurrent(sequence)) return;
  useCartStore.getState().replaceFromServer(cart);
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
      const sequence = beginWrite();
      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      const pendingId = store.addItemLocal(input);
      const { promise: resolved, resolve: resolvePending } =
        withResolver<string | null>();
      pendingAdds.set(pendingId, resolved);

      try {
        const response = (await cartApi.addItem({
          productId: input.productId,
          variantId: input.variantId,
          frameId: input.frameId ?? null,
          quantity: input.quantity ?? 1,
          customizations: input.customizations,
          isAiGenerated: input.isAiGenerated ?? false,
          aiDetails: input.aiDetails,
        })) as { item?: { id?: string } } | undefined;
        resolvePending(response?.item?.id ?? null);

        await applyIfCurrent(sequence, queryClient);
      } catch (error) {
        resolvePending(null);
        if (!isCurrent(sequence)) return;
        useCartStore.getState().restore(snapshot);
        useCartStore.getState().setSyncError(readError(error));
      } finally {
        pendingAdds.delete(pendingId);
      }
    },
    [queryClient]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const sequence = beginWrite();
      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      store.removeItemLocal(id);

      let targetId = id;
      if (isPending(id)) {
        // The add that minted this id may still be in flight; wait for it
        // rather than skipping the server entirely, or its own success puts
        // the row it creates right back into the cart the customer just
        // removed it from.
        const pending = pendingAdds.get(id);
        const serverId = pending ? await pending : null;
        if (!serverId) return; // The add never landed — nothing to delete.
        targetId = serverId;
      }

      try {
        await cartApi.removeItem(targetId);
        await applyIfCurrent(sequence, queryClient);
      } catch (error) {
        if (!isCurrent(sequence)) return;
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

      const sequence = beginWrite();
      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      store.updateQuantityLocal(id, quantity);

      if (isPending(id)) return;

      try {
        await cartApi.updateItem(id, { quantity });
        await applyIfCurrent(sequence, queryClient);
      } catch (error) {
        if (!isCurrent(sequence)) return;
        useCartStore.getState().restore(snapshot);
        useCartStore.getState().setSyncError(readError(error));
      }
    },
    [queryClient, removeItem]
  );

  const clearCart = useCallback(async () => {
    const sequence = beginWrite();
    const store = useCartStore.getState();
    const snapshot: CartItem[] = store.items;

    store.clearLocal();

    try {
      await cartApi.clear();
      await applyIfCurrent(sequence, queryClient);
    } catch (error) {
      if (!isCurrent(sequence)) return;
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
