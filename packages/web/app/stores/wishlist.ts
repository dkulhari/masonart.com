/**
 * Wishlist Store
 *
 * Holds the set of saved product ids for the signed-in user.
 *
 * TWO DELIBERATE DIFFERENCES FROM THE CART STORE
 *
 * 1. **No `persist` middleware.** The cart persists to localStorage because a
 *    guest cart is a real thing that must survive a reload. The wishlist is
 *    server-owned and auth-gated — persisting it would show a signed-out
 *    visitor, or the next user on a shared machine, the previous user's hearts.
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
}

export const useWishlistStore = create<WishlistStore>()((set, get) => ({
  ids: [],
  isLoaded: false,
  isPending: false,
  isAuthenticated: null,
  inFlight: null,

  async load() {
    // Unknown session or a known guest: `/api/wishlist` is auth-gated, so the
    // only possible answer is a 401 nobody acts on (#417).
    if (get().isAuthenticated !== true) return;
    if (get().isLoaded) return;

    // `isLoaded` only flips after the await, so it cannot dedupe callers that
    // arrive in the same tick — a 24-card grid cleared the guard 24 times.
    // The promise itself is the lock.
    const existing = get().inFlight;
    if (existing) return existing;

    const request = (async () => {
      try {
        const { items } = await wishlistApi.list();
        set({ ids: items.map((item) => item.id), isLoaded: true });
      } catch {
        /**
         * A session can lapse between the root route reading it and this
         * request; mark loaded either way so the UI stops waiting and every
         * heart renders in its empty state.
         */
        set({ ids: [], isLoaded: true });
      } finally {
        // Cleared on both paths — leaving a settled promise here wedges the
        // store for the rest of the session.
        set({ inFlight: null });
      }
    })();

    set({ inFlight: request });
    return request;
  },

  /**
   * Called from the root route, the one place that already has the session.
   * Keeping it out of the leaf components is deliberate: `WishlistButton` is
   * rendered bare in its own tests, with no router to read a context from.
   */
  setAuthenticated(isAuthenticated: boolean) {
    if (get().isAuthenticated === isAuthenticated) return;

    if (!isAuthenticated) {
      // A guest is "loaded" — there is nothing to fetch and nothing to wait for.
      set({ isAuthenticated: false, ids: [], isLoaded: true, inFlight: null });
      return;
    }

    set({ isAuthenticated: true });
    void get().load();
  },

  async toggle(productId: string) {
    const wasSaved = get().ids.includes(productId);
    const previous = get().ids;

    // Optimistic.
    set({
      ids: wasSaved
        ? previous.filter((id) => id !== productId)
        : [...previous, productId],
      isPending: true,
    });

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
}));

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
