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
import { useShallow } from "zustand/react/shallow";
import { generateId } from "~/lib/utils";

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

  // Actions
  addItem: (input: AddToCartInput) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateFrame: (
    id: string,
    frameId: string | null,
    frameName?: string,
    frameType?: string,
    framePrice?: number
  ) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;

  // Computed values (as functions for Zustand v5 compatibility)
  getItemCount: () => number;
  getSubtotal: () => number;
  getItemTotal: (id: string) => number;
  findExistingItem: (
    productId: string,
    variantId: string,
    frameId: string | null
  ) => CartItem | undefined;
}

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Cart store with localStorage persistence
 *
 * @example
 * // In a component
 * import { useCartStore } from '~/stores/cart';
 *
 * function AddToCartButton({ product, variant, frame }) {
 *   const addItem = useCartStore((state) => state.addItem);
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

      // Add item to cart
      addItem: (input: AddToCartInput) =>
        set((state) => {
          // Check if item with same product, variant, and frame already exists
          const existing = state.items.find(
            (item) =>
              item.productId === input.productId &&
              item.variantId === input.variantId &&
              item.frameId === (input.frameId ?? null)
          );

          if (existing) {
            // Update quantity of existing item
            return {
              items: state.items.map((item) =>
                item.id === existing.id
                  ? {
                      ...item,
                      quantity: item.quantity + (input.quantity ?? 1),
                    }
                  : item
              ),
            };
          }

          // Add new item
          const newItem: CartItem = {
            id: generateId("cart"),
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

          return { items: [...state.items, newItem] };
        }),

      // Update item quantity
      updateQuantity: (id: string, quantity: number) =>
        set((state) => {
          // Remove item if quantity is 0 or less
          if (quantity <= 0) {
            return {
              items: state.items.filter((item) => item.id !== id),
            };
          }

          return {
            items: state.items.map((item) =>
              item.id === id ? { ...item, quantity } : item
            ),
          };
        }),

      // Update frame selection for an item
      updateFrame: (
        id: string,
        frameId: string | null,
        frameName?: string,
        frameType?: string,
        framePrice?: number
      ) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  frameId,
                  frameName: frameName ?? undefined,
                  frameType: frameType ?? undefined,
                  framePrice: framePrice ?? 0,
                }
              : item
          ),
        })),

      // Remove item from cart
      removeItem: (id: string) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      // Clear entire cart
      clearCart: () => set({ items: [] }),

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

      // Get total for a specific item
      getItemTotal: (id: string) => {
        const { items } = get();
        const item = items.find((i) => i.id === id);
        if (!item) return 0;
        return (item.unitPrice + item.framePrice) * item.quantity;
      },

      // Find existing item by product, variant, and frame
      findExistingItem: (
        productId: string,
        variantId: string,
        frameId: string | null
      ) => {
        const { items } = get();
        return items.find(
          (item) =>
            item.productId === productId &&
            item.variantId === variantId &&
            item.frameId === frameId
        );
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
const selectActions = (state: CartStore) => ({
  addItem: state.addItem,
  updateQuantity: state.updateQuantity,
  updateFrame: state.updateFrame,
  removeItem: state.removeItem,
  clearCart: state.clearCart,
});

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

/**
 * Hook to get cart actions
 * Uses shallow comparison since this returns an object
 */
export const useCartActions = () =>
  useCartStore(
    useShallow((state) => ({
      addItem: state.addItem,
      updateQuantity: state.updateQuantity,
      updateFrame: state.updateFrame,
      removeItem: state.removeItem,
      clearCart: state.clearCart,
    }))
  );

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
