/**
 * Cart Store using Zustand
 *
 * This module provides a Zustand store for managing shopping cart state in the MasonArt frontend.
 * It handles cart items, quantities, customization options, and synchronizes with the backend API.
 *
 * Features:
 * - Add/update/remove cart items
 * - Calculate cart totals (subtotal, tax, shipping, total)
 * - Optimistic updates with automatic rollback on errors
 * - Loading and error states
 * - Integration with backend cart API
 * - Persistent cart across page reloads (syncs with backend)
 * - Support for product variants (sizes) and frames
 * - Support for photo upload URLs
 */

import { create } from 'zustand';
import { cart as cartApi } from '../lib/api';

/**
 * Cart item interface
 */
export interface CartItem {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  frameId?: string;
  uploadUrl?: string;

  // Populated from backend
  product?: {
    id: string;
    title: string;
    sku: string;
    images: string[];
    slug: string;
  };
  variant?: {
    id: string;
    sizeLabel: string;
    price: number;
    stock: number;
  };
  frame?: {
    id: string;
    name: string;
    material: string;
    priceModifier: number;
  };

  // Calculated fields
  itemTotal?: number;
}

/**
 * Cart totals interface
 */
export interface CartTotals {
  subtotal: number;
  tax: number; // 18% GST
  shipping: number; // Free shipping = 0
  discount: number;
  total: number;
  itemCount: number;
}

/**
 * Cart store state interface
 */
interface CartState {
  // State
  items: CartItem[];
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Computed
  totals: CartTotals;
  itemCount: number;

  // Actions
  fetchCart: () => Promise<void>;
  addItem: (item: {
    productId: string;
    variantId: string;
    quantity: number;
    frameId?: string;
    uploadUrl?: string;
  }) => Promise<void>;
  updateItem: (itemId: string, updates: {
    quantity?: number;
    frameId?: string;
  }) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  calculateTotals: () => CartTotals;

  // Internal
  setItems: (items: CartItem[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * Calculate cart totals from items
 */
function calculateCartTotals(items: CartItem[]): CartTotals {
  const subtotal = items.reduce((sum, item) => {
    const basePrice = item.variant?.price || 0;
    const framePrice = item.frame?.priceModifier || 0;
    const itemPrice = (basePrice + framePrice) * item.quantity;
    return sum + itemPrice;
  }, 0);

  const tax = subtotal * 0.18; // 18% GST
  const shipping = 0; // Free shipping
  const discount = 0; // No discount by default
  const total = subtotal + tax + shipping - discount;

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    subtotal,
    tax,
    shipping,
    discount,
    total,
    itemCount,
  };
}

/**
 * Cart Store
 */
export const useCartStore = create<CartState>((set, get) => ({
  // Initial state
  items: [],
  isLoading: false,
  error: null,
  isInitialized: false,
  totals: {
    subtotal: 0,
    tax: 0,
    shipping: 0,
    discount: 0,
    total: 0,
    itemCount: 0,
  },
  itemCount: 0,

  /**
   * Fetch cart from backend
   */
  fetchCart: async () => {
    set({ isLoading: true, error: null });

    try {
      const items = await cartApi.get();

      set({
        items,
        totals: calculateCartTotals(items),
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        isLoading: false,
        isInitialized: true,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch cart',
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  /**
   * Add item to cart (optimistic update)
   */
  addItem: async (item) => {
    const previousItems = get().items;

    // Optimistic update: Add placeholder item
    const optimisticItem: CartItem = {
      id: `temp-${Date.now()}`,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      frameId: item.frameId,
      uploadUrl: item.uploadUrl,
    };

    const newItems = [...previousItems, optimisticItem];
    set({
      items: newItems,
      totals: calculateCartTotals(newItems),
      itemCount: newItems.reduce((sum, i) => sum + i.quantity, 0),
      isLoading: true,
    });

    try {
      const addedItem = await cartApi.add(item);

      // Replace optimistic item with real item
      const updatedItems = get().items.map(i =>
        i.id === optimisticItem.id ? addedItem : i
      );

      set({
        items: updatedItems,
        totals: calculateCartTotals(updatedItems),
        itemCount: updatedItems.reduce((sum, i) => sum + i.quantity, 0),
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // Rollback on error
      set({
        items: previousItems,
        totals: calculateCartTotals(previousItems),
        itemCount: previousItems.reduce((sum, item) => sum + item.quantity, 0),
        error: error.message || 'Failed to add item to cart',
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * Update cart item (optimistic update)
   */
  updateItem: async (itemId, updates) => {
    const previousItems = get().items;

    // Optimistic update
    const updatedItems = previousItems.map(item =>
      item.id === itemId
        ? { ...item, ...updates }
        : item
    );

    set({
      items: updatedItems,
      totals: calculateCartTotals(updatedItems),
      itemCount: updatedItems.reduce((sum, item) => sum + item.quantity, 0),
      isLoading: true,
    });

    try {
      const updatedItem = await cartApi.update(itemId, updates);

      // Replace with actual item from backend
      const finalItems = get().items.map(item =>
        item.id === itemId ? updatedItem : item
      );

      set({
        items: finalItems,
        totals: calculateCartTotals(finalItems),
        itemCount: finalItems.reduce((sum, item) => sum + item.quantity, 0),
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // Rollback on error
      set({
        items: previousItems,
        totals: calculateCartTotals(previousItems),
        itemCount: previousItems.reduce((sum, item) => sum + item.quantity, 0),
        error: error.message || 'Failed to update item',
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * Remove item from cart (optimistic update)
   */
  removeItem: async (itemId) => {
    const previousItems = get().items;

    // Optimistic update
    const filteredItems = previousItems.filter(item => item.id !== itemId);

    set({
      items: filteredItems,
      totals: calculateCartTotals(filteredItems),
      itemCount: filteredItems.reduce((sum, item) => sum + item.quantity, 0),
      isLoading: true,
    });

    try {
      await cartApi.remove(itemId);

      set({
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // Rollback on error
      set({
        items: previousItems,
        totals: calculateCartTotals(previousItems),
        itemCount: previousItems.reduce((sum, item) => sum + item.quantity, 0),
        error: error.message || 'Failed to remove item',
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * Clear entire cart
   */
  clearCart: async () => {
    const previousItems = get().items;

    // Optimistic update
    set({
      items: [],
      totals: calculateCartTotals([]),
      itemCount: 0,
      isLoading: true,
    });

    try {
      await cartApi.clear();

      set({
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // Rollback on error
      set({
        items: previousItems,
        totals: calculateCartTotals(previousItems),
        itemCount: previousItems.reduce((sum, item) => sum + item.quantity, 0),
        error: error.message || 'Failed to clear cart',
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * Calculate totals (can be used manually or by external components)
   */
  calculateTotals: () => {
    const items = get().items;
    return calculateCartTotals(items);
  },

  /**
   * Internal: Set items directly
   */
  setItems: (items) => {
    set({
      items,
      totals: calculateCartTotals(items),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    });
  },

  /**
   * Internal: Set loading state
   */
  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  /**
   * Internal: Set error
   */
  setError: (error) => {
    set({ error });
  },
}));

export default useCartStore;
