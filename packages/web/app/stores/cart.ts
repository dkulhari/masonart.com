/**
 * Cart Store with localStorage Persistence
 *
 * Zustand store for managing shopping cart state on the client side.
 * Uses persist middleware for localStorage persistence across sessions.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { generateId } from "~/lib/utils";
import { toCartItems, type ServerCartPayload } from "~/lib/cart-projection";

// ============================================================================
// Types
// ============================================================================

/**
 * AI generation details for AI-generated products
 */
export interface AIGenerationDetails {
  generationId: string;
  prompt: string;
  stylePreset?: string;
  thumbnailUrl?: string;
}

/**
 * Product customizations
 */
export interface CartItemCustomizations {
  matWidth?: number;
  matColor?: string;
  mountingStyle?: string;
  glazingType?: string;
  notes?: string;
}

/**
 * Cart item with all necessary product information
 */
export interface CartItem {
  /** Unique cart item ID */
  id: string;
  /** Product ID */
  productId: string;
  /** Product variant ID (size) */
  variantId: string;
  /** Frame ID (optional) */
  frameId: string | null;
  /** Quantity */
  quantity: number;

  // Product details (denormalized for offline display)
  /** Product title */
  productTitle: string;
  /** Product slug for linking */
  productSlug: string;
  /** Product thumbnail URL */
  thumbnailUrl: string;

  // Variant details
  /** Size label (e.g., "24x24 inches") */
  sizeLabel: string;
  /** Width in inches */
  widthInches: number;
  /** Height in inches */
  heightInches: number;

  // Frame details (if selected)
  /** Frame name */
  frameName?: string;
  /** Frame type */
  frameType?: string;

  // Pricing (stored in smallest currency unit or as decimal)
  /** Unit price (variant base price) */
  unitPrice: number;
  /** Frame price (0 if no frame) */
  framePrice: number;

  // Customizations
  /** Custom options */
  customizations?: CartItemCustomizations;

  // AI generation info
  /** Whether this is an AI-generated product */
  isAiGenerated: boolean;
  /** AI generation details */
  aiDetails?: AIGenerationDetails;

  // Timestamps
  /** When the item was added to cart */
  addedAt: string;
}

/**
 * Input for adding an item to cart
 */
export interface AddToCartInput {
  productId: string;
  variantId: string;
  frameId?: string | null;
  quantity?: number;
  productTitle: string;
  productSlug: string;
  thumbnailUrl: string;
  sizeLabel: string;
  widthInches: number;
  heightInches: number;
  unitPrice: number;
  framePrice?: number;
  frameName?: string;
  frameType?: string;
  customizations?: CartItemCustomizations;
  isAiGenerated?: boolean;
  aiDetails?: AIGenerationDetails;
}

/**
 * Cart store state and actions
 */
interface CartStore {
  // State
  items: CartItem[];
  /** Whether the slide-out cart drawer is showing. Never persisted. */
  isDrawerOpen: boolean;
  /**
   * Why the last write did not reach the server, or null.
   *
   * The server cart is the one checkout reads, so a rejected write is rolled
   * back locally rather than kept — and the customer has to be told, or the
   * item they added silently is not there (#511).
   */
  syncError: string | null;

  // Drawer
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  /**
   * Local mutators. `useCartActions` owns these — it applies one optimistically,
   * calls the API, and either re-projects the server's answer or restores the
   * snapshot. A component calling them directly writes to a cart that checkout
   * will never see, which is the bug this whole change exists to close.
   */
  addItemLocal: (input: AddToCartInput) => string;
  updateQuantityLocal: (id: string, quantity: number) => void;
  removeItemLocal: (id: string) => void;
  clearLocal: () => void;
  restore: (items: CartItem[]) => void;
  replaceFromServer: (cart: ServerCartPayload) => void;
  setSyncError: (message: string | null) => void;

  // Computed values (as functions for Zustand v5 compatibility)
  getItemCount: () => number;
  getSubtotal: () => number;
}

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Cart store with localStorage persistence
 *
 * @example
 * // In a component
 * import { useCartActions } from '~/hooks/useCartActions';
 *
 * function AddToCartButton({ product, variant, frame }) {
 *   const { addItem } = useCartActions();
 *
 *   const handleAddToCart = () => {
 *     addItem({
 *       productId: product.id,
 *       variantId: variant.id,
 *       frameId: frame?.id ?? null,
 *       productTitle: product.title,
 *       productSlug: product.slug,
 *       thumbnailUrl: product.images[0]?.url ?? '',
 *       sizeLabel: variant.sizeLabel,
 *       widthInches: variant.widthInches,
 *       heightInches: variant.heightInches,
 *       unitPrice: variant.price,
 *       framePrice: frame?.price ?? 0,
 *       frameName: frame?.name,
 *       frameType: frame?.type,
 *       quantity: 1,
 *     });
 *   };
 *
 *   return <button onClick={handleAddToCart}>Add to Cart</button>;
 * }
 *
 * function CartIcon() {
 *   const itemCount = useCartStore((state) => state.getItemCount());
 *   return <span>{itemCount}</span>;
 * }
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      // Initial state
      items: [],
      isDrawerOpen: false,
      syncError: null,

      // Drawer visibility. It lives here rather than in a parent component so
      // any surface — header button, PDP, quickview — can open the cart
      // without prop-drilling through __root.
      openDrawer: () => set({ isDrawerOpen: true }),
      // Closing dismisses whatever alert was showing along with it — there is
      // no separate dismiss control, and leaving a stale rejection attached to
      // a drawer the customer already closed and reopened misattributes it to
      // whatever they do next (#511 fix round 1, finding 1).
      closeDrawer: () => set({ isDrawerOpen: false, syncError: null }),
      toggleDrawer: () =>
        set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

      addItemLocal: (input: AddToCartInput) => {
        // A placeholder id, replaced by the server's row id as soon as the
        // write lands. Prefixed so it is obvious in a snapshot that this line
        // has not been acknowledged yet.
        const pendingId = generateId("pending");

        set((state) => {
          const existing = state.items.find(
            (item) =>
              item.productId === input.productId &&
              item.variantId === input.variantId &&
              item.frameId === (input.frameId ?? null)
          );

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.id === existing.id
                  ? { ...item, quantity: item.quantity + (input.quantity ?? 1) }
                  : item
              ),
              // Adding always slides the cart open, the way mesonart's does.
              isDrawerOpen: true,
              syncError: null,
            };
          }

          const newItem: CartItem = {
            id: pendingId,
            productId: input.productId,
            variantId: input.variantId,
            frameId: input.frameId ?? null,
            quantity: input.quantity ?? 1,
            productTitle: input.productTitle,
            productSlug: input.productSlug,
            thumbnailUrl: input.thumbnailUrl,
            sizeLabel: input.sizeLabel,
            widthInches: input.widthInches,
            heightInches: input.heightInches,
            frameName: input.frameName,
            frameType: input.frameType,
            unitPrice: input.unitPrice,
            framePrice: input.framePrice ?? 0,
            customizations: input.customizations,
            isAiGenerated: input.isAiGenerated ?? false,
            aiDetails: input.aiDetails,
            addedAt: new Date().toISOString(),
          };

          return {
            items: [...state.items, newItem],
            isDrawerOpen: true,
            syncError: null,
          };
        });

        return pendingId;
      },

      updateQuantityLocal: (id: string, quantity: number) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((item) => item.id !== id) };
          }

          return {
            items: state.items.map((item) =>
              item.id === id ? { ...item, quantity } : item
            ),
          };
        }),

      removeItemLocal: (id: string) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      clearLocal: () => set({ items: [] }),

      restore: (items: CartItem[]) => set({ items }),

      /**
       * The server's cart, wholesale. Local ids, quantities and prices all
       * lose — the rows here are the rows order creation will read.
       *
       * Also clears `syncError` (#511 fix round 1, finding 1): every write
       * that reaches this — whichever one the hook's sequence guard decided
       * actually gets to apply — succeeded, so whatever the previous failure
       * said is no longer true. Without this, a rejected PATCH left its
       * message on screen through every write that came after it, until the
       * customer happened to add something (the only path that cleared it).
       */
      replaceFromServer: (cart: ServerCartPayload) =>
        set({ items: toCartItems(cart), syncError: null }),

      setSyncError: (message: string | null) => set({ syncError: message }),

      // Get total item count
      getItemCount: () => {
        const { items } = get();
        return items.reduce((sum, item) => sum + item.quantity, 0);
      },

      // Get cart subtotal
      getSubtotal: () => {
        const { items } = get();
        return items.reduce((sum, item) => {
          const itemTotal = (item.unitPrice + item.framePrice) * item.quantity;
          return sum + itemTotal;
        }, 0);
      },
    }),
    {
      name: "chobii-cart-storage",
      storage: createJSONStorage(() => {
        // Check if we're in a browser environment
        if (typeof window === "undefined") {
          // Return a no-op storage for SSR
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      // Only persist items, not computed functions
      partialize: (state) => ({ items: state.items }),
    }
  )
);

// ============================================================================
// Stable Selectors (defined outside hooks to prevent recreation)
// ============================================================================

const selectItems = (state: CartStore) => state.items;
const selectItemCount = (state: CartStore) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0);
const selectSubtotal = (state: CartStore) =>
  state.items.reduce(
    (sum, item) => sum + (item.unitPrice + item.framePrice) * item.quantity,
    0
  );
const selectIsEmpty = (state: CartStore) => state.items.length === 0;
const selectIsDrawerOpen = (state: CartStore) => state.isDrawerOpen;

// ============================================================================
// Selector Hooks (for optimized re-renders)
// ============================================================================

/**
 * Hook to get cart items
 */
export const useCartItems = () => useCartStore(selectItems);

/**
 * Hook to get cart item count
 * Uses stable selector to prevent unnecessary re-renders
 */
export const useCartItemCount = () => useCartStore(selectItemCount);

/**
 * Hook to get cart subtotal
 * Uses stable selector to prevent unnecessary re-renders
 */
export const useCartSubtotal = () => useCartStore(selectSubtotal);

const selectSyncError = (state: CartStore) => state.syncError;

/**
 * Hook to read why the last cart write failed, or null.
 */
export const useCartSyncError = () => useCartStore(selectSyncError);

/**
 * Hook to read whether the cart drawer is open
 */
export const useIsCartDrawerOpen = () => useCartStore(selectIsDrawerOpen);

/**
 * Hook to check if cart is empty
 */
export const useIsCartEmpty = () => useCartStore(selectIsEmpty);

/**
 * Hook to find if a specific product configuration exists in cart
 */
export const useIsInCart = (
  productId: string,
  variantId: string,
  frameId: string | null = null
) =>
  useCartStore((state) =>
    state.items.some(
      (item) =>
        item.productId === productId &&
        item.variantId === variantId &&
        item.frameId === frameId
    )
  );

// ============================================================================
// Hydration Hook for SSR
// ============================================================================

/**
 * Hook to check if we're on the client side after hydration
 * Use this to conditionally render cart-dependent content
 *
 * @returns boolean indicating if we're on client and ready to show cart data
 *
 * @example
 * function CartPage() {
 *   const isClient = useCartHydration();
 *   const items = useCartItems();
 *
 *   if (!isClient) {
 *     return <CartSkeleton />;
 *   }
 *
 *   return <Cart items={items} />;
 * }
 */
export const useCartHydration = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
};
