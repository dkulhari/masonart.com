/**
 * Cart Store Tests
 *
 * Comprehensive test suite for the Zustand cart store.
 * Tests all cart operations including add, update, remove, clear,
 * optimistic updates, error handling, and totals calculation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useCartStore, CartItem } from '../../src/stores/cart';
import * as cartApi from '../../src/lib/api';

// Mock the API module
vi.mock('../../src/lib/api', () => ({
  cart: {
    get: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
}));

describe('Cart Store', () => {
  // Reset store and mocks before each test
  beforeEach(() => {
    // Reset store to initial state
    useCartStore.setState({
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
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Store Initialization', () => {
    it('should have correct initial state', () => {
      const state = useCartStore.getState();

      expect(state.items).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.isInitialized).toBe(false);
      expect(state.itemCount).toBe(0);
      expect(state.totals).toEqual({
        subtotal: 0,
        tax: 0,
        shipping: 0,
        discount: 0,
        total: 0,
        itemCount: 0,
      });
    });

    it('should expose all required actions', () => {
      const state = useCartStore.getState();

      expect(typeof state.fetchCart).toBe('function');
      expect(typeof state.addItem).toBe('function');
      expect(typeof state.updateItem).toBe('function');
      expect(typeof state.removeItem).toBe('function');
      expect(typeof state.clearCart).toBe('function');
      expect(typeof state.calculateTotals).toBe('function');
    });

    it('should expose internal actions', () => {
      const state = useCartStore.getState();

      expect(typeof state.setItems).toBe('function');
      expect(typeof state.setLoading).toBe('function');
      expect(typeof state.setError).toBe('function');
    });
  });

  describe('fetchCart', () => {
    it('should fetch cart items from backend', async () => {
      const mockItems: CartItem[] = [
        {
          id: '1',
          productId: 'prod-1',
          variantId: 'var-1',
          quantity: 2,
          product: {
            id: 'prod-1',
            title: 'Abstract Art',
            sku: 'ABS-001',
            images: ['image1.jpg'],
            slug: 'abstract-art',
          },
          variant: {
            id: 'var-1',
            sizeLabel: '12" × 18"',
            price: 1200,
            stock: 10,
          },
        },
      ];

      (cartApi.cart.get as any).mockResolvedValue(mockItems);

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      const state = useCartStore.getState();

      expect(state.items).toEqual(mockItems);
      expect(state.isInitialized).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.itemCount).toBe(2);
    });

    it('should set loading state during fetch', async () => {
      (cartApi.cart.get as any).mockImplementation(() => {
        const state = useCartStore.getState();
        expect(state.isLoading).toBe(true);
        return Promise.resolve([]);
      });

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      const state = useCartStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should handle fetch errors', async () => {
      const error = new Error('Network error');
      (cartApi.cart.get as any).mockRejectedValue(error);

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      const state = useCartStore.getState();

      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
      expect(state.isInitialized).toBe(true);
    });

    it('should calculate totals after fetching', async () => {
      const mockItems: CartItem[] = [
        {
          id: '1',
          productId: 'prod-1',
          variantId: 'var-1',
          quantity: 2,
          variant: {
            id: 'var-1',
            sizeLabel: '12" × 18"',
            price: 1000,
            stock: 10,
          },
        },
      ];

      (cartApi.cart.get as any).mockResolvedValue(mockItems);

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      const state = useCartStore.getState();

      // 2 items × 1000 = 2000 subtotal
      // 2000 × 0.18 = 360 tax
      // Total = 2360
      expect(state.totals.subtotal).toBe(2000);
      expect(state.totals.tax).toBe(360);
      expect(state.totals.total).toBe(2360);
    });
  });

  describe('addItem', () => {
    it('should add item to cart', async () => {
      const newItem = {
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 1,
      };

      const addedItem: CartItem = {
        id: 'cart-item-1',
        ...newItem,
        variant: {
          id: 'var-1',
          sizeLabel: '12" × 18"',
          price: 1200,
          stock: 10,
        },
      };

      (cartApi.cart.add as any).mockResolvedValue(addedItem);

      const { addItem } = useCartStore.getState();
      await addItem(newItem);

      const state = useCartStore.getState();

      expect(state.items).toHaveLength(1);
      expect(state.items[0]).toEqual(addedItem);
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should perform optimistic update when adding', async () => {
      const newItem = {
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 1,
      };

      (cartApi.cart.add as any).mockImplementation(async () => {
        // Check that optimistic item was added
        const state = useCartStore.getState();
        expect(state.items).toHaveLength(1);
        expect(state.items[0].productId).toBe('prod-1');

        return {
          id: 'cart-item-1',
          ...newItem,
        };
      });

      const { addItem } = useCartStore.getState();
      await addItem(newItem);
    });

    it('should add item with frame customization', async () => {
      const newItem = {
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 1,
        frameId: 'frame-1',
      };

      const addedItem: CartItem = {
        id: 'cart-item-1',
        ...newItem,
        variant: {
          id: 'var-1',
          sizeLabel: '12" × 18"',
          price: 1200,
          stock: 10,
        },
        frame: {
          id: 'frame-1',
          name: 'Oak Frame',
          material: 'oak',
          priceModifier: 500,
        },
      };

      (cartApi.cart.add as any).mockResolvedValue(addedItem);

      const { addItem } = useCartStore.getState();
      await addItem(newItem);

      const state = useCartStore.getState();

      expect(state.items[0].frameId).toBe('frame-1');
      expect(state.items[0].frame).toBeDefined();
      // Item total should include frame price: (1200 + 500) × 1 = 1700
      expect(state.totals.subtotal).toBe(1700);
    });

    it('should add item with upload URL', async () => {
      const newItem = {
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 1,
        uploadUrl: 'https://cdn.example.com/upload.jpg',
      };

      const addedItem: CartItem = {
        id: 'cart-item-1',
        ...newItem,
        variant: {
          id: 'var-1',
          sizeLabel: '12" × 18"',
          price: 1200,
          stock: 10,
        },
      };

      (cartApi.cart.add as any).mockResolvedValue(addedItem);

      const { addItem } = useCartStore.getState();
      await addItem(newItem);

      const state = useCartStore.getState();

      expect(state.items[0].uploadUrl).toBe('https://cdn.example.com/upload.jpg');
    });

    it('should rollback on add error', async () => {
      const newItem = {
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 1,
      };

      (cartApi.cart.add as any).mockRejectedValue(new Error('Out of stock'));

      const { addItem } = useCartStore.getState();

      await expect(addItem(newItem)).rejects.toThrow('Out of stock');

      const state = useCartStore.getState();

      // Should rollback to empty cart
      expect(state.items).toHaveLength(0);
      expect(state.error).toBe('Out of stock');
      expect(state.isLoading).toBe(false);
    });

    it('should update item count and totals after adding', async () => {
      const newItem = {
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 3,
      };

      const addedItem: CartItem = {
        id: 'cart-item-1',
        ...newItem,
        variant: {
          id: 'var-1',
          sizeLabel: '12" × 18"',
          price: 1000,
          stock: 10,
        },
      };

      (cartApi.cart.add as any).mockResolvedValue(addedItem);

      const { addItem } = useCartStore.getState();
      await addItem(newItem);

      const state = useCartStore.getState();

      expect(state.itemCount).toBe(3);
      expect(state.totals.subtotal).toBe(3000);
      expect(state.totals.tax).toBe(540); // 18% of 3000
      expect(state.totals.total).toBe(3540);
    });
  });

  describe('updateItem', () => {
    beforeEach(() => {
      // Set up cart with an item
      useCartStore.setState({
        items: [
          {
            id: 'cart-item-1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 2,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
        ],
      });
    });

    it('should update item quantity', async () => {
      const updatedItem: CartItem = {
        id: 'cart-item-1',
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 5,
        variant: {
          id: 'var-1',
          sizeLabel: '12" × 18"',
          price: 1000,
          stock: 10,
        },
      };

      (cartApi.cart.update as any).mockResolvedValue(updatedItem);

      const { updateItem } = useCartStore.getState();
      await updateItem('cart-item-1', { quantity: 5 });

      const state = useCartStore.getState();

      expect(state.items[0].quantity).toBe(5);
      expect(state.itemCount).toBe(5);
      expect(state.error).toBeNull();
    });

    it('should update item frame', async () => {
      const updatedItem: CartItem = {
        id: 'cart-item-1',
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 2,
        frameId: 'frame-1',
        variant: {
          id: 'var-1',
          sizeLabel: '12" × 18"',
          price: 1000,
          stock: 10,
        },
        frame: {
          id: 'frame-1',
          name: 'Oak Frame',
          material: 'oak',
          priceModifier: 300,
        },
      };

      (cartApi.cart.update as any).mockResolvedValue(updatedItem);

      const { updateItem } = useCartStore.getState();
      await updateItem('cart-item-1', { frameId: 'frame-1' });

      const state = useCartStore.getState();

      expect(state.items[0].frameId).toBe('frame-1');
      expect(state.items[0].frame).toBeDefined();
      // Subtotal should include frame: (1000 + 300) × 2 = 2600
      expect(state.totals.subtotal).toBe(2600);
    });

    it('should perform optimistic update', async () => {
      (cartApi.cart.update as any).mockImplementation(async () => {
        // Check that optimistic update was applied
        const state = useCartStore.getState();
        expect(state.items[0].quantity).toBe(10);

        return {
          id: 'cart-item-1',
          productId: 'prod-1',
          variantId: 'var-1',
          quantity: 10,
          variant: {
            id: 'var-1',
            sizeLabel: '12" × 18"',
            price: 1000,
            stock: 10,
          },
        };
      });

      const { updateItem } = useCartStore.getState();
      await updateItem('cart-item-1', { quantity: 10 });
    });

    it('should rollback on update error', async () => {
      (cartApi.cart.update as any).mockRejectedValue(new Error('Invalid quantity'));

      const { updateItem } = useCartStore.getState();

      await expect(updateItem('cart-item-1', { quantity: 100 })).rejects.toThrow('Invalid quantity');

      const state = useCartStore.getState();

      // Should rollback to original quantity
      expect(state.items[0].quantity).toBe(2);
      expect(state.error).toBe('Invalid quantity');
      expect(state.isLoading).toBe(false);
    });

    it('should recalculate totals after update', async () => {
      const updatedItem: CartItem = {
        id: 'cart-item-1',
        productId: 'prod-1',
        variantId: 'var-1',
        quantity: 4,
        variant: {
          id: 'var-1',
          sizeLabel: '12" × 18"',
          price: 1000,
          stock: 10,
        },
      };

      (cartApi.cart.update as any).mockResolvedValue(updatedItem);

      const { updateItem } = useCartStore.getState();
      await updateItem('cart-item-1', { quantity: 4 });

      const state = useCartStore.getState();

      expect(state.totals.subtotal).toBe(4000);
      expect(state.totals.tax).toBe(720); // 18% of 4000
      expect(state.totals.total).toBe(4720);
    });
  });

  describe('removeItem', () => {
    beforeEach(() => {
      // Set up cart with two items
      useCartStore.setState({
        items: [
          {
            id: 'cart-item-1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 2,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
          {
            id: 'cart-item-2',
            productId: 'prod-2',
            variantId: 'var-2',
            quantity: 1,
            variant: {
              id: 'var-2',
              sizeLabel: '18" × 24"',
              price: 1500,
              stock: 5,
            },
          },
        ],
      });
    });

    it('should remove item from cart', async () => {
      (cartApi.cart.remove as any).mockResolvedValue(undefined);

      const { removeItem } = useCartStore.getState();
      await removeItem('cart-item-1');

      const state = useCartStore.getState();

      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('cart-item-2');
      expect(state.error).toBeNull();
    });

    it('should perform optimistic removal', async () => {
      (cartApi.cart.remove as any).mockImplementation(async () => {
        // Check that item was optimistically removed
        const state = useCartStore.getState();
        expect(state.items).toHaveLength(1);
        expect(state.items[0].id).toBe('cart-item-2');
      });

      const { removeItem } = useCartStore.getState();
      await removeItem('cart-item-1');
    });

    it('should rollback on remove error', async () => {
      (cartApi.cart.remove as any).mockRejectedValue(new Error('Item not found'));

      const { removeItem } = useCartStore.getState();

      await expect(removeItem('cart-item-1')).rejects.toThrow('Item not found');

      const state = useCartStore.getState();

      // Should rollback - both items still present
      expect(state.items).toHaveLength(2);
      expect(state.error).toBe('Item not found');
      expect(state.isLoading).toBe(false);
    });

    it('should recalculate totals after removal', async () => {
      (cartApi.cart.remove as any).mockResolvedValue(undefined);

      const { removeItem } = useCartStore.getState();
      await removeItem('cart-item-1');

      const state = useCartStore.getState();

      // Only item-2 remains: 1500 × 1 = 1500
      expect(state.totals.subtotal).toBe(1500);
      expect(state.totals.tax).toBe(270); // 18% of 1500
      expect(state.totals.total).toBe(1770);
      expect(state.itemCount).toBe(1);
    });
  });

  describe('clearCart', () => {
    beforeEach(() => {
      // Set up cart with items
      useCartStore.setState({
        items: [
          {
            id: 'cart-item-1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 2,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
        ],
      });
    });

    it('should clear all items from cart', async () => {
      (cartApi.cart.clear as any).mockResolvedValue(undefined);

      const { clearCart } = useCartStore.getState();
      await clearCart();

      const state = useCartStore.getState();

      expect(state.items).toHaveLength(0);
      expect(state.itemCount).toBe(0);
      expect(state.error).toBeNull();
    });

    it('should perform optimistic clear', async () => {
      (cartApi.cart.clear as any).mockImplementation(async () => {
        // Check that cart was optimistically cleared
        const state = useCartStore.getState();
        expect(state.items).toHaveLength(0);
      });

      const { clearCart } = useCartStore.getState();
      await clearCart();
    });

    it('should rollback on clear error', async () => {
      (cartApi.cart.clear as any).mockRejectedValue(new Error('Server error'));

      const { clearCart } = useCartStore.getState();

      await expect(clearCart()).rejects.toThrow('Server error');

      const state = useCartStore.getState();

      // Should rollback - item still present
      expect(state.items).toHaveLength(1);
      expect(state.error).toBe('Server error');
      expect(state.isLoading).toBe(false);
    });

    it('should reset totals to zero', async () => {
      (cartApi.cart.clear as any).mockResolvedValue(undefined);

      const { clearCart } = useCartStore.getState();
      await clearCart();

      const state = useCartStore.getState();

      expect(state.totals).toEqual({
        subtotal: 0,
        tax: 0,
        shipping: 0,
        discount: 0,
        total: 0,
        itemCount: 0,
      });
    });
  });

  describe('calculateTotals', () => {
    it('should calculate totals for empty cart', () => {
      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      expect(totals).toEqual({
        subtotal: 0,
        tax: 0,
        shipping: 0,
        discount: 0,
        total: 0,
        itemCount: 0,
      });
    });

    it('should calculate subtotal from variant prices', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 2,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      expect(totals.subtotal).toBe(2000);
    });

    it('should include frame price in subtotal', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 1,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
            frame: {
              id: 'frame-1',
              name: 'Oak Frame',
              material: 'oak',
              priceModifier: 500,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      // (1000 + 500) × 1 = 1500
      expect(totals.subtotal).toBe(1500);
    });

    it('should calculate 18% GST tax', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 1,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      expect(totals.tax).toBe(180); // 18% of 1000
    });

    it('should include free shipping (0)', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 1,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      expect(totals.shipping).toBe(0);
    });

    it('should calculate total correctly', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 2,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      // Subtotal: 2000
      // Tax: 360 (18%)
      // Shipping: 0
      // Total: 2360
      expect(totals.total).toBe(2360);
    });

    it('should calculate item count', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 2,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
          {
            id: '2',
            productId: 'prod-2',
            variantId: 'var-2',
            quantity: 3,
            variant: {
              id: 'var-2',
              sizeLabel: '18" × 24"',
              price: 1500,
              stock: 5,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      expect(totals.itemCount).toBe(5);
    });

    it('should handle multiple items with frames', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 1,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
            frame: {
              id: 'frame-1',
              name: 'Oak Frame',
              material: 'oak',
              priceModifier: 300,
            },
          },
          {
            id: '2',
            productId: 'prod-2',
            variantId: 'var-2',
            quantity: 2,
            variant: {
              id: 'var-2',
              sizeLabel: '18" × 24"',
              price: 1500,
              stock: 5,
            },
            frame: {
              id: 'frame-2',
              name: 'Metal Frame',
              material: 'metal',
              priceModifier: 500,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      // Item 1: (1000 + 300) × 1 = 1300
      // Item 2: (1500 + 500) × 2 = 4000
      // Subtotal: 5300
      // Tax: 954 (18%)
      // Total: 6254
      expect(totals.subtotal).toBe(5300);
      expect(totals.tax).toBe(954);
      expect(totals.total).toBe(6254);
    });
  });

  describe('Internal Actions', () => {
    it('should set items directly with setItems', () => {
      const items: CartItem[] = [
        {
          id: '1',
          productId: 'prod-1',
          variantId: 'var-1',
          quantity: 2,
          variant: {
            id: 'var-1',
            sizeLabel: '12" × 18"',
            price: 1000,
            stock: 10,
          },
        },
      ];

      const { setItems } = useCartStore.getState();
      setItems(items);

      const state = useCartStore.getState();

      expect(state.items).toEqual(items);
      expect(state.itemCount).toBe(2);
      expect(state.totals.subtotal).toBe(2000);
    });

    it('should set loading state with setLoading', () => {
      const { setLoading } = useCartStore.getState();
      setLoading(true);

      let state = useCartStore.getState();
      expect(state.isLoading).toBe(true);

      setLoading(false);
      state = useCartStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should set error with setError', () => {
      const { setError } = useCartStore.getState();
      setError('Test error');

      let state = useCartStore.getState();
      expect(state.error).toBe('Test error');

      setError(null);
      state = useCartStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle item without variant gracefully', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 2,
            // No variant provided
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      // Should default to 0 if no variant price
      expect(totals.subtotal).toBe(0);
    });

    it('should handle item without frame gracefully', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 1,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
            // No frame
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      // Should only include variant price
      expect(totals.subtotal).toBe(1000);
    });

    it('should handle zero quantity', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 0,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 10,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      expect(totals.subtotal).toBe(0);
      expect(totals.itemCount).toBe(0);
    });

    it('should handle large quantities', () => {
      useCartStore.setState({
        items: [
          {
            id: '1',
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 100,
            variant: {
              id: 'var-1',
              sizeLabel: '12" × 18"',
              price: 1000,
              stock: 100,
            },
          },
        ],
      });

      const { calculateTotals } = useCartStore.getState();
      const totals = calculateTotals();

      expect(totals.subtotal).toBe(100000);
      expect(totals.tax).toBe(18000);
      expect(totals.total).toBe(118000);
    });
  });

  describe('Loading States', () => {
    it('should set loading to true when fetching cart', async () => {
      let loadingDuringFetch = false;

      (cartApi.cart.get as any).mockImplementation(async () => {
        loadingDuringFetch = useCartStore.getState().isLoading;
        return [];
      });

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      expect(loadingDuringFetch).toBe(true);
    });

    it('should set loading to false after successful fetch', async () => {
      (cartApi.cart.get as any).mockResolvedValue([]);

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      const state = useCartStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should set loading to false after failed fetch', async () => {
      (cartApi.cart.get as any).mockRejectedValue(new Error('Error'));

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      const state = useCartStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should clear error on successful operation', async () => {
      // Set initial error
      useCartStore.setState({ error: 'Previous error' });

      (cartApi.cart.get as any).mockResolvedValue([]);

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      const state = useCartStore.getState();
      expect(state.error).toBeNull();
    });

    it('should preserve previous items on error', async () => {
      const initialItems: CartItem[] = [
        {
          id: '1',
          productId: 'prod-1',
          variantId: 'var-1',
          quantity: 1,
          variant: {
            id: 'var-1',
            sizeLabel: '12" × 18"',
            price: 1000,
            stock: 10,
          },
        },
      ];

      useCartStore.setState({ items: initialItems });

      (cartApi.cart.add as any).mockRejectedValue(new Error('Add failed'));

      const { addItem } = useCartStore.getState();

      await expect(
        addItem({
          productId: 'prod-2',
          variantId: 'var-2',
          quantity: 1,
        })
      ).rejects.toThrow('Add failed');

      const state = useCartStore.getState();
      expect(state.items).toEqual(initialItems);
    });

    it('should handle API errors with custom messages', async () => {
      const error = { message: 'Custom error message' };
      (cartApi.cart.get as any).mockRejectedValue(error);

      const { fetchCart } = useCartStore.getState();
      await fetchCart();

      const state = useCartStore.getState();
      expect(state.error).toBe('Custom error message');
    });

    it('should handle errors without message property', async () => {
      (cartApi.cart.add as any).mockRejectedValue('String error');

      const { addItem } = useCartStore.getState();

      await expect(
        addItem({
          productId: 'prod-1',
          variantId: 'var-1',
          quantity: 1,
        })
      ).rejects.toBe('String error');

      const state = useCartStore.getState();
      expect(state.error).toBe('Failed to add item to cart');
    });
  });

  describe('Performance', () => {
    it('should handle rapid state updates', async () => {
      const items: CartItem[] = [
        {
          id: '1',
          productId: 'prod-1',
          variantId: 'var-1',
          quantity: 1,
          variant: {
            id: 'var-1',
            sizeLabel: '12" × 18"',
            price: 1000,
            stock: 10,
          },
        },
      ];

      const { setItems } = useCartStore.getState();

      // Rapid updates
      for (let i = 0; i < 100; i++) {
        setItems(items);
      }

      const state = useCartStore.getState();
      expect(state.items).toEqual(items);
    });

    it('should calculate totals efficiently for large carts', () => {
      const items: CartItem[] = Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        productId: `prod-${i}`,
        variantId: `var-${i}`,
        quantity: 1,
        variant: {
          id: `var-${i}`,
          sizeLabel: '12" × 18"',
          price: 1000,
          stock: 10,
        },
      }));

      const { setItems } = useCartStore.getState();
      const start = performance.now();
      setItems(items);
      const end = performance.now();

      const state = useCartStore.getState();

      expect(state.items).toHaveLength(100);
      expect(state.itemCount).toBe(100);
      expect(end - start).toBeLessThan(100); // Should complete in less than 100ms
    });
  });
});
