/**
 * Wishlist Store
 *
 * Holds the set of saved product ids, for a guest as much as for a signed-in
 * user.
 *
 * TWO DELIBERATE DIFFERENCES FROM THE CART STORE
 *
 * 1. **Persisted, but only while signed out.** Saving must not require an
 *    account, so a guest's list lives in localStorage and survives a reload
 *    like a guest cart does. Signing in merges it into the account, and from
 *    that moment the persisted slice writes empty — the original reason this
 *    store had no `persist` at all was that a shared machine must never show
 *    the next visitor the previous user's hearts (#477).
 *
 * 2. **One fetch, not one per card — and none at all for a guest.** The grid
 *    renders up to 24 cards. Each asking the server "am I saved?" is 24
 *    requests; instead the ids load once, behind a shared in-flight promise,
 *    and every card reads the set. The load waits on `setAuthenticated` from
 *    the root route, so a signed-out visitor spends zero requests (#417).
 *
 * The toggle is optimistic with rollback: a heart that waits on a round-trip
 * before filling in reads as broken.
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { wishlistApi } from "~/lib/api";

// ============================================================================
// Store
// ============================================================================

interface WishlistStore {
  /** Product ids the user has saved. */
  ids: string[];
  /** Whether `load()` has completed at least once. */
  isLoaded: boolean;
  /** A toggle request is in flight. */
  isPending: boolean;
  /**
   * Tri-state, and the middle state is the point.
   *
   * `null` — nobody has reported yet. Leaf effects run before the root route's,
   * so this is what a heart sees on first paint; `load()` waits rather than
   * guessing.
   * `false` — guest. Never ask the server.
   * `true` — signed in. One load.
   */
  isAuthenticated: boolean | null;
  /** The single in-flight `load()`, shared by every caller in the same tick. */
  inFlight: Promise<void> | null;

  load: () => Promise<void>;
  setAuthenticated: (isAuthenticated: boolean) => void;
  toggle: (productId: string) => Promise<void>;
  /** Forget ids the catalogue no longer has. Guest lists only — see below. */
  dropMissing: (productIds: string[]) => void;
}

/** Exported so tests can read exactly what was written, not guess the key. */
export const WISHLIST_STORAGE_KEY = "chobii-wishlist-storage";

/** localStorage exists only in the browser; SSR gets a storage that forgets. */
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * Resolves once the persisted guest list is back in the store.
 *
 * Referenced lazily from inside `load()` — the store it reads is the one being
 * defined here, so it cannot run at module scope.
 */
function whenRehydrated(): Promise<void> {
  if (useWishlistStore.persist.hasHydrated()) return Promise.resolve();

  return new Promise((resolve) => {
    const unsubscribe = useWishlistStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      ids: [],
      isLoaded: false,
      isPending: false,
      isAuthenticated: null,
      inFlight: null,

      async load() {
        // Unknown session: leaf effects run before the root route reports, and
        // guessing costs a 401 per mounted heart (#417). A known guest has
        // nothing to load — their list is already here, from localStorage.
        if (get().isAuthenticated !== true) return;
        if (get().isLoaded) return;

        // `isLoaded` only flips after the await, so it cannot dedupe callers
        // that arrive in the same tick — a 24-card grid cleared the guard 24
        // times. The promise itself is the lock.
        const existing = get().inFlight;
        if (existing) return existing;

        // Whatever is here was saved while signed out: `setAuthenticated` only
        // flips the flag once rehydration has finished, so by now the guest's
        // list is back.
        const local = get().ids;

        const request = (async () => {
          try {
            /**
             * Anything still in `ids` at this point was saved while signed
             * out, so signing in folds it into the account. With nothing local
             * — the usual case, a signed-in user opening a second page — this
             * stays a plain read rather than a write on every page load.
             */
            const { items } =
              local.length > 0
                ? await wishlistApi.merge(local)
                : await wishlistApi.list();
            set({ ids: items.map((item) => item.id), isLoaded: true });
          } catch {
            /**
             * A session can lapse between the root route reading it and this
             * request. Keep whatever was local rather than dropping saves on a
             * flaky sign-in — the next load merges again — and mark loaded so
             * the UI stops waiting.
             */
            set({ isLoaded: true });
          } finally {
            // Cleared on both paths — leaving a settled promise here wedges
            // the store for the rest of the session.
            set({ inFlight: null });
          }
        })();

        set({ inFlight: request });
        return request;
      },

      /**
       * Called from the root route, the one place that already has the session.
       * Keeping it out of the leaf components is deliberate: `WishlistButton`
       * is rendered bare in its own tests, with no router to read a context
       * from.
       */
      setAuthenticated(isAuthenticated: boolean) {
        if (get().isAuthenticated === isAuthenticated) return;

        if (!isAuthenticated) {
          const wasAuthenticated = get().isAuthenticated === true;
          set({
            isAuthenticated: false,
            /**
             * Signing OUT drops the list: what is on screen belongs to the
             * account, and keeping it would persist one user's hearts for the
             * next. Arriving as a guest (`null`) keeps the rehydrated local
             * list — that IS the guest's wishlist.
             */
            ...(wasAuthenticated ? { ids: [] } : {}),
            // A guest is "loaded": nothing to fetch, nothing to wait for.
            isLoaded: true,
            inFlight: null,
          });
          return;
        }

        /**
         * Do NOT flip the flag before the guest list is back. `partialize`
         * writes an empty list the moment this store counts as signed in, so
         * flipping first wipes the stored guest list while rehydration is
         * still reading it — the merge then sends nothing and the saves are
         * gone. Observed in the browser, not theorised.
         */
        void (async () => {
          await whenRehydrated();
          /**
           * `isLoaded` goes back to false: a guest counts as loaded because
           * there was nothing to wait for, and leaving it set sends the merge
           * straight into `load()`'s already-loaded guard.
           */
          set({ isAuthenticated: true, isLoaded: false });
          await get().load();
        })();
      },

      /**
       * A guest's ids outlive the catalogue: a product can be deleted, or the
       * whole database reseeded, long after it was saved. Those ids resolve to
       * nothing, so the header badge counts saves the page cannot show — which
       * is what made the page look broken (#494).
       *
       * Guest lists ONLY. A signed-in list came from the server, which already
       * filtered it to live products, so an empty answer there means the
       * request failed, not that the saves are dead — and deleting an
       * account's wishlist over a bad round-trip cannot be undone.
       */
      dropMissing(productIds: string[]) {
        if (get().isAuthenticated === true || productIds.length === 0) return;

        const dead = new Set(productIds);
        const remaining = get().ids.filter((id) => !dead.has(id));
        if (remaining.length !== get().ids.length) set({ ids: remaining });
      },

      async toggle(productId: string) {
        const wasSaved = get().ids.includes(productId);
        const previous = get().ids;
        const next = wasSaved
          ? previous.filter((id) => id !== productId)
          : [...previous, productId];

        // A guest's list is local and authoritative — nothing to send, and so
        // nothing that can fail and need rolling back.
        if (get().isAuthenticated !== true) {
          set({ ids: next, isLoaded: true });
          return;
        }

        // Optimistic.
        set({ ids: next, isPending: true });

        try {
          if (wasSaved) {
            await wishlistApi.remove(productId);
          } else {
            await wishlistApi.add(productId);
          }
        } catch {
          // Roll back to exactly what was there, rather than re-deriving it —
          // a concurrent load() could otherwise be undone.
          set({ ids: previous });
        } finally {
          set({ isPending: false });
        }
      },
    }),
    {
      name: WISHLIST_STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : noopStorage
      ),
      /**
       * Only the guest list is ever written. Once the account owns it the
       * persisted slice is empty, which also wipes what the guest had on the
       * next write — the merge has already put it on the server by then.
       */
      partialize: (state) => ({
        ids: state.isAuthenticated === true ? [] : state.ids,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

const selectIds = (state: WishlistStore) => state.ids;
const selectCount = (state: WishlistStore) => state.ids.length;

/** The saved id list. */
export const useWishlistIds = () => useWishlistStore(selectIds);

/** How many products are saved — for the header badge. */
export const useWishlistCount = () => useWishlistStore(selectCount);

/** Whether one product is saved. */
export const useIsWishlisted = (productId: string) =>
  useWishlistStore((state) => state.ids.includes(productId));

export const useWishlistActions = () =>
  useWishlistStore(
    useShallow((state) => ({
      load: state.load,
      toggle: state.toggle,
    }))
  );

/**
 * True once the client has mounted.
 *
 * Same shape and same reason as `useCartHydration`: the server cannot know
 * the saved count, so rendering it during SSR produces a hydration mismatch.
 * That is what #498 was for the cart badge.
 */
export const useWishlistHydration = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
};
