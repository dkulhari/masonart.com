/**
 * TanStack Query Hooks for Cart (Server-Side Cart)
 *
 * Provides data fetching and mutation hooks for cart operations
 * with optimistic updates for a smooth user experience.
 *
 * Note: This works alongside the Zustand cart store (client-side).
 * - Zustand store: Used for immediate UI updates and offline support
 * - TanStack Query: Used for syncing with server and handling auth users
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";
import {
  cartApi,
  type CartItemInput,
  type CartItemUpdate,
} from "~/lib/api";

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for cart
 */
export const cartKeys = {
  all: ["cart"] as const,
  detail: () => [...cartKeys.all, "detail"] as const,
  items: () => [...cartKeys.all, "items"] as const,
};

// ============================================================================
// Types
// ============================================================================

/**
 * Cart item from server
 */
export interface ServerCartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId: string;
  frameId: string | null;
  quantity: number;
  unitPrice: string;
  framePrice: string;
  totalPrice: string;
  customizations: CartItemCustomizations | null;
  isAiGenerated: boolean;
  aiGenerationId: string | null;
  aiDetails: AIDetails | null;
  savedForLater: boolean;
  reservedUntil: string | null;
  addedAt: string;
  updatedAt: string;
  // Populated from relations
  product?: {
    id: string;
    title: string;
    slug: string;
    images: Array<{ url: string; thumbnailUrl?: string }>;
  };
  variant?: {
    id: string;
    sizeLabel: string;
    widthInches: number;
    heightInches: number;
    price: string;
  };
  frame?: {
    id: string;
    name: string;
    type: string;
    priceModifier: string;
  };
}

/**
 * Cart customizations
 */
export interface CartItemCustomizations {
  matWidth?: number;
  matColor?: string;
  mountingStyle?: string;
  glazingType?: string;
  notes?: string;
}

/**
 * AI generation details
 */
export interface AIDetails {
  generationId: string;
  prompt: string;
  stylePreset?: string;
  thumbnailUrl?: string;
}

/**
 * Cart from server
 */
export interface ServerCart {
  id: string;
  userId: string | null;
  guestSessionId: string | null;
  itemCount: number;
  subtotal: string;
  couponCode: string | null;
  discountAmount: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  items: ServerCartItem[];
}

/**
 * Cart operation result
 */
export interface CartOperationResult {
  success: boolean;
  message: string;
  cart?: ServerCart;
  item?: ServerCartItem;
}

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
  options?: Omit<UseQueryOptions<ServerCart, Error>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: cartKeys.detail(),
    queryFn: () => cartApi.get() as Promise<ServerCart>,
    staleTime: 1000 * 60, // 1 minute
    retry: 1, // Don't retry too many times for cart
    ...options,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to add an item to cart with optimistic updates
 *
 * @example
 * ```tsx
 * const addToCart = useAddToCart();
 *
 * const handleAddToCart = () => {
 *   addToCart.mutate({
 *     productId: product.id,
 *     variantId: selectedVariant.id,
 *     frameId: selectedFrame?.id ?? null,
 *     quantity: 1,
 *   });
 * };
 * ```
 */
export function useAddToCart(
  options?: Omit<
    UseMutationOptions<CartOperationResult, Error, CartItemInput, CartMutationContext>,
    "mutationFn" | "onMutate" | "onError" | "onSettled"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CartItemInput) =>
      cartApi.addItem(data) as Promise<CartOperationResult>,

    // Optimistic update
    onMutate: async (newItem) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cartKeys.detail() });

      // Snapshot previous value
      const previousCart = queryClient.getQueryData<ServerCart>(
        cartKeys.detail()
      );

      // Optimistically update cache
      if (previousCart) {
        const optimisticItem: ServerCartItem = {
          id: `temp-${Date.now()}`,
          cartId: previousCart.id,
          productId: newItem.productId,
          variantId: newItem.variantId,
          frameId: newItem.frameId ?? null,
          quantity: newItem.quantity ?? 1,
          unitPrice: "0",
          framePrice: "0",
          totalPrice: "0",
          customizations: newItem.customizations ?? null,
          isAiGenerated: newItem.isAiGenerated ?? false,
          aiGenerationId: newItem.aiGenerationId ?? null,
          aiDetails: newItem.aiDetails ?? null,
          savedForLater: false,
          reservedUntil: null,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        queryClient.setQueryData<ServerCart>(cartKeys.detail(), {
          ...previousCart,
          itemCount: previousCart.itemCount + (newItem.quantity ?? 1),
          items: [...previousCart.items, optimisticItem],
        });
      }

      return { previousCart };
    },

    // Rollback on error
    onError: (_err, _newItem, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(cartKeys.detail(), context.previousCart);
      }
    },

    // Refetch after success or error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.detail() });
    },

    ...options,
  });
}

/**
 * Hook to update a cart item (quantity, frame, etc.)
 *
 * @example
 * ```tsx
 * const updateCartItem = useUpdateCartItem();
 *
 * const handleQuantityChange = (itemId: string, quantity: number) => {
 *   updateCartItem.mutate({ id: itemId, data: { quantity } });
 * };
 * ```
 */
export function useUpdateCartItem(
  options?: Omit<
    UseMutationOptions<
      CartOperationResult,
      Error,
      { id: string; data: CartItemUpdate },
      CartMutationContext
    >,
    "mutationFn" | "onMutate" | "onError" | "onSettled"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CartItemUpdate }) =>
      cartApi.updateItem(id, data) as Promise<CartOperationResult>,

    // Optimistic update
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: cartKeys.detail() });

      const previousCart = queryClient.getQueryData<ServerCart>(
        cartKeys.detail()
      );

      if (previousCart) {
        queryClient.setQueryData<ServerCart>(cartKeys.detail(), {
          ...previousCart,
          items: previousCart.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  quantity: data.quantity ?? item.quantity,
                  frameId: data.frameId !== undefined ? data.frameId : item.frameId,
                  customizations: data.customizations ?? item.customizations,
                  savedForLater:
                    data.isSavedForLater !== undefined
                      ? data.isSavedForLater
                      : item.savedForLater,
                  updatedAt: new Date().toISOString(),
                }
              : item
          ),
        });
      }

      return { previousCart };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(cartKeys.detail(), context.previousCart);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.detail() });
    },

    ...options,
  });
}

/**
 * Hook to remove an item from cart
 *
 * @example
 * ```tsx
 * const removeFromCart = useRemoveFromCart();
 *
 * const handleRemove = (itemId: string) => {
 *   removeFromCart.mutate(itemId);
 * };
 * ```
 */
export function useRemoveFromCart(
  options?: Omit<
    UseMutationOptions<CartOperationResult, Error, string, CartMutationContext>,
    "mutationFn" | "onMutate" | "onError" | "onSettled"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      cartApi.removeItem(id) as Promise<CartOperationResult>,

    // Optimistic update
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: cartKeys.detail() });

      const previousCart = queryClient.getQueryData<ServerCart>(
        cartKeys.detail()
      );

      if (previousCart) {
        const removedItem = previousCart.items.find((item) => item.id === id);
        queryClient.setQueryData<ServerCart>(cartKeys.detail(), {
          ...previousCart,
          itemCount: previousCart.itemCount - (removedItem?.quantity ?? 0),
          items: previousCart.items.filter((item) => item.id !== id),
        });
      }

      return { previousCart };
    },

    onError: (_err, _id, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(cartKeys.detail(), context.previousCart);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.detail() });
    },

    ...options,
  });
}

/**
 * Hook to clear the entire cart
 *
 * @example
 * ```tsx
 * const clearCart = useClearCart();
 *
 * const handleClearCart = () => {
 *   if (confirm('Clear all items from cart?')) {
 *     clearCart.mutate();
 *   }
 * };
 * ```
 */
export function useClearCart(
  options?: Omit<
    UseMutationOptions<CartOperationResult, Error, void, CartMutationContext>,
    "mutationFn" | "onMutate" | "onError" | "onSettled"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cartApi.clear() as Promise<CartOperationResult>,

    // Optimistic update
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: cartKeys.detail() });

      const previousCart = queryClient.getQueryData<ServerCart>(
        cartKeys.detail()
      );

      if (previousCart) {
        queryClient.setQueryData<ServerCart>(cartKeys.detail(), {
          ...previousCart,
          itemCount: 0,
          subtotal: "0",
          items: [],
        });
      }

      return { previousCart };
    },

    onError: (_err, _void, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(cartKeys.detail(), context.previousCart);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.detail() });
    },

    ...options,
  });
}

/**
 * Hook to merge guest cart into user cart after login
 *
 * @example
 * ```tsx
 * const mergeCart = useMergeCart();
 *
 * // After successful login
 * useEffect(() => {
 *   if (isAuthenticated && guestSessionId) {
 *     mergeCart.mutate(guestSessionId);
 *   }
 * }, [isAuthenticated]);
 * ```
 */
export function useMergeCart(
  options?: Omit<
    UseMutationOptions<CartOperationResult, Error, string>,
    "mutationFn" | "onSettled"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (guestSessionId: string) =>
      cartApi.merge(guestSessionId) as Promise<CartOperationResult>,

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cartKeys.detail() });
    },

    ...options,
  });
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Mutation context for optimistic updates
 */
interface CartMutationContext {
  previousCart?: ServerCart;
}

// ============================================================================
// Cache Invalidation Helpers
// ============================================================================

/**
 * Invalidate all cart caches
 */
export function invalidateCart(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: cartKeys.all });
}

/**
 * Set cart data directly (useful for SSR hydration)
 */
export function setCartData(
  queryClient: ReturnType<typeof useQueryClient>,
  cart: ServerCart
) {
  queryClient.setQueryData(cartKeys.detail(), cart);
}

/**
 * Get cached cart data
 */
export function getCachedCart(
  queryClient: ReturnType<typeof useQueryClient>
): ServerCart | undefined {
  return queryClient.getQueryData(cartKeys.detail());
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to check if cart is syncing with server
 */
export function useIsCartSyncing() {
  const { isFetching } = useServerCart({ enabled: false });
  const addToCart = useAddToCart();
  const updateCartItem = useUpdateCartItem();
  const removeFromCart = useRemoveFromCart();
  const clearCart = useClearCart();

  return (
    isFetching ||
    addToCart.isPending ||
    updateCartItem.isPending ||
    removeFromCart.isPending ||
    clearCart.isPending
  );
}

/**
 * Hook to get server cart item count
 */
export function useServerCartItemCount() {
  const { data: cart } = useServerCart();
  return cart?.itemCount ?? 0;
}

/**
 * Hook to get server cart subtotal
 */
export function useServerCartSubtotal() {
  const { data: cart } = useServerCart();
  return cart?.subtotal ?? "0";
}
