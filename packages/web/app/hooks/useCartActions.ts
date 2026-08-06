/**
 * The cart's single write path (#511).
 *
 * The server cart is the one `POST /api/orders` reads, so it is the one that
 * decides. Each action applies its change locally first — the UI must not wait
 * on a round trip — then sends it, then replaces the local cart with whatever
 * the server says the cart now is. A rejection re-reads the cart and puts the
 * reason in `syncError`, so the two can never disagree about what checkout
 * will find: every path out of every action, success or failure, ends with the
 * store holding the server's rows rather than a locally-computed guess at them
 * (#511 final review, finding 2 — see `recoverFromServer`).
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
 * `queryClient.fetchQuery`.
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
 * what the server holds right now.
 *
 * Does not itself touch the query cache — see `applyIfCurrent`, the only
 * caller, for why that write has to wait behind the same currency check as
 * the store write rather than happening unconditionally here (#511 fix
 * round 2).
 */
async function fetchCart(): Promise<ServerCartPayload> {
  return (await cartApi.get()) as ServerCartPayload;
}

/**
 * Re-projects the server cart onto the store and the query cache, but only
 * for the write that is still current.
 *
 * Checked twice: once before `fetchCart` — a write already superseded has no
 * reason to make the request at all — and once more after it resolves, since
 * a write that was current when it started can go stale while its own
 * request is still in flight, and its answer must not land on top of
 * whatever the write that superseded it has already applied.
 *
 * Both writes — `setQueryData` and `replaceFromServer` — sit behind that
 * second check, not just the store one. `cartKeys.detail()` is not
 * decorative: `useServerCart` reads it for the cart page's `savingTotal` and
 * per-line discount figures, separately from the store-derived subtotal, and
 * `setQueryData` resets the query's staleness clock — so a cache write from a
 * superseded write left the wrong savings figure on screen for up to
 * `useServerCart`'s `staleTime` (60s) with nothing to correct it. Fix round 1
 * gated the store against exactly this and missed that the cache needed the
 * same gate (#511 fix round 2).
 */
async function applyIfCurrent(
  sequence: number,
  queryClient: QueryClient
): Promise<void> {
  if (!isCurrent(sequence)) return;
  const cart = await fetchCart();
  if (!isCurrent(sequence)) return;
  queryClient.setQueryData(cartKeys.detail(), cart);
  useCartStore.getState().replaceFromServer(cart);
}

/**
 * What a rejected write settles the cart on (#511 final review, finding 2).
 *
 * NOT the snapshot it captured before mutating. Two writes can overlap, and
 * `restore(snapshot)` is only correct if this write's optimistic mutation is
 * the only one the store has applied since — which is exactly what overlapping
 * means it is not. The snapshot a later write captured already contains the
 * earlier write's optimism, and the earlier write's own rollback is dropped as
 * superseded, so replaying a snapshot could leave a line the server never
 * accepted sitting in a cart the customer then takes to checkout: the store
 * says one item, `POST /api/orders` says "Cart is empty".
 *
 * Re-reading the cart instead makes the answer absolute rather than relative.
 * Whatever the store had accumulated — one failed write's optimism or three —
 * it is replaced by the rows order creation will actually read, so no amount of
 * interleaving can leave a phantom line behind. It also clears out stale
 * `pending*` ids, which is why removing or re-quantifying such a line is no
 * longer a silent no-op.
 *
 * Order matters: `replaceFromServer` clears `syncError` unconditionally, so the
 * message is set after it or it never survives. The customer is still told the
 * write failed — the cart just no longer lies to them about what is in it.
 *
 * If the re-read itself fails there is no authority to project, and the
 * fallback IS the snapshot: a failed write most likely left the server where it
 * was, so the pre-write state is the best available guess. That is a guess and
 * is labelled as one — the message says to reload — rather than being left to
 * look like a settled cart.
 */
async function recoverFromServer(
  sequence: number,
  queryClient: QueryClient,
  snapshot: CartItem[],
  message: string
): Promise<void> {
  if (!isCurrent(sequence)) return;

  try {
    const cart = await fetchCart();
    if (!isCurrent(sequence)) return;
    queryClient.setQueryData(cartKeys.detail(), cart);
    useCartStore.getState().replaceFromServer(cart);
    useCartStore.getState().setSyncError(message);
  } catch {
    if (!isCurrent(sequence)) return;
    useCartStore.getState().restore(snapshot);
    useCartStore
      .getState()
      .setSyncError(`${message}. We could not reach your cart to check what it holds — please reload before checking out`);
  }
}

/**
 * The server id an optimistic line ended up with, or null if it has none.
 *
 * Null covers two cases that look the same from here: the add was refused, and
 * the add landed but under a write that has since been superseded, so its
 * bookkeeping entry is already gone. Neither can be addressed by id, and both
 * are settled the same way — by re-reading the cart.
 */
async function resolveServerId(pendingId: string): Promise<string | null> {
  const pending = pendingAdds.get(pendingId);
  return pending ? await pending : null;
}

/**
 * Take the server's answer for a write that could not be sent at all.
 *
 * Reached when a still-optimistic line turns out to have no server row to
 * address. Nothing failed, so there is no message to show — but the local
 * mutation has no way to reach the server either, and leaving it applied is
 * precisely the local-only cart this change exists to end.
 */
async function settle(
  sequence: number,
  queryClient: QueryClient,
  snapshot: CartItem[]
): Promise<void> {
  try {
    await applyIfCurrent(sequence, queryClient);
  } catch (error) {
    await recoverFromServer(sequence, queryClient, snapshot, readError(error));
  }
}

export interface CartActions {
  addItem: (input: AddToCartInput) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearCart: () => Promise<void>;
  /**
   * Re-read the cart and project it, without writing anything.
   *
   * For the moments where the server has changed the cart and this client has
   * no way to know: `ordersApi.create` empties the database cart before
   * Razorpay's modal even opens, so a customer who dismisses that modal is
   * looking at a checkout page still promising a basket the server has already
   * taken — and "Try Again" answers "Cart is empty", for good (#511 final
   * review, finding 4). Whether the cart should be consumed at order creation
   * or at payment verification is a separate question; this only stops the UI
   * insisting on an answer that is no longer true.
   */
  refreshCart: () => Promise<void>;
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
        await recoverFromServer(
          sequence,
          queryClient,
          snapshot,
          readError(error)
        );
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
        const serverId = await resolveServerId(id);
        if (!serverId) {
          // No row to delete under this id — but "no row" is a claim about the
          // server, and the last thing that spoke to the server here failed or
          // was superseded. Returning on the strength of local bookkeeping is
          // how a line the customer removed stayed in the database and got
          // charged; ask instead.
          await settle(sequence, queryClient, snapshot);
          return;
        }
        targetId = serverId;
      }

      try {
        await cartApi.removeItem(targetId);
        await applyIfCurrent(sequence, queryClient);
      } catch (error) {
        await recoverFromServer(
          sequence,
          queryClient,
          snapshot,
          readError(error)
        );
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

      let targetId = id;
      if (isPending(id)) {
        // Same reasoning as `removeItem`: the add that minted this id is
        // typically still in flight, so wait for the real id and patch that.
        // Returning here instead left the new quantity in the store and
        // nowhere else — permanently, with nothing on screen to say so, since
        // this write's own sequence number had already superseded the add's
        // re-projection.
        const serverId = await resolveServerId(id);
        if (!serverId) {
          await settle(sequence, queryClient, snapshot);
          return;
        }
        targetId = serverId;
      }

      try {
        await cartApi.updateItem(targetId, { quantity });
        await applyIfCurrent(sequence, queryClient);
      } catch (error) {
        await recoverFromServer(
          sequence,
          queryClient,
          snapshot,
          readError(error)
        );
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
      await recoverFromServer(sequence, queryClient, snapshot, readError(error));
    }
  }, [queryClient]);

  const refreshCart = useCallback(async () => {
    // Takes a sequence number like any write: it is about to replace the
    // store's contents, and a write still in flight must not land on top of
    // the answer it settles on.
    const sequence = beginWrite();

    try {
      await applyIfCurrent(sequence, queryClient);
    } catch (error) {
      if (!isCurrent(sequence)) return;
      // Nothing was written and nothing is rolled back — the projection simply
      // could not be refreshed, and saying so beats leaving a cart on screen
      // that may no longer exist.
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
      refreshCart,
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
      refreshCart,
      resetLocalCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    ]
  );
}
