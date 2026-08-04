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
 * 2. **One fetch, not one per card.** The grid renders up to 24 cards. Each
 *    asking the server "am I saved?" is 24 requests; instead the ids load once
 *    and every card reads the set.
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

  load: () => Promise<void>;
  toggle: (productId: string) => Promise<void>;
}

export const useWishlistStore = create<WishlistStore>()((set, get) => ({
  ids: [],
  isLoaded: false,
  isPending: false,

  async load() {
    if (get().isLoaded) return;

    try {
      const { items } = await wishlistApi.list();
      set({ ids: items.map((item) => item.id), isLoaded: true });
    } catch {
      /**
       * A 401 is the ordinary case for a guest, not an error worth surfacing.
       * Mark loaded either way so the UI stops waiting and every heart renders
       * in its empty state.
       */
      set({ ids: [], isLoaded: true });
    }
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
