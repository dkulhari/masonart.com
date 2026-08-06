/**
 * Tests for useCart Query Hooks
 *
 * `useServerCart` is the one server read left (#511) — every write goes
 * through `useCartActions` now, so this file only covers the read hook, the
 * query-key factory, and the cache helpers around it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock the API module before importing hooks
vi.mock('~/lib/api', () => ({
  cartApi: {
    get: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  getApiUrl: vi.fn(() => 'http://localhost:3000'),
}));

// Import after mock
import {
  useServerCart,
  useServerCartItemCount,
  useServerCartSubtotal,
  cartKeys,
  invalidateCart,
  setCartData,
  getCachedCart,
} from '~/hooks/useCart';
import { cartApi } from '~/lib/api';
import type { ServerCartPayload } from '~/lib/cart-projection';

// Test utilities
const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

// Mock data — shaped exactly as GET /api/cart resolves it via
// `~/lib/cart-projection`'s ServerCartPayload, not the fictional shape the
// deleted mutation hooks assumed (that one said `addedAt`; the column is
// `created_at`).
const mockCartItem: ServerCartPayload['items'][number] = {
  id: 'item-1',
  productId: 'prod-1',
  variantId: 'var-1',
  frameId: null,
  quantity: 2,
  unitPrice: '1500.00',
  framePrice: '0',
  lineTotal: '3000.00',
  customizations: null,
  isAiGenerated: false,
  aiDetails: null,
  isSavedForLater: false,
  createdAt: '2024-01-01T00:00:00Z',
  product: {
    id: 'prod-1',
    title: 'Ocean Waves Abstract',
    slug: 'ocean-waves-abstract',
    images: [{ url: 'https://cdn.example.com/ocean-waves.jpg' }],
  },
  variant: {
    id: 'var-1',
    sizeLabel: '12" x 18"',
    widthInches: 12,
    heightInches: 18,
    price: '1500.00',
  },
};

const mockCart: ServerCartPayload = {
  id: 'cart-1',
  itemCount: 2,
  subtotal: '3000.00',
  items: [mockCartItem],
  savedForLater: [],
  savingTotal: '0.00',
};

describe('useCart Hooks - Query Keys', () => {
  it('should generate correct all cart key', () => {
    expect(cartKeys.all).toEqual(['cart']);
  });

  it('should generate correct detail key', () => {
    expect(cartKeys.detail()).toEqual(['cart', 'detail']);
  });

  it('should generate correct items key', () => {
    expect(cartKeys.items()).toEqual(['cart', 'items']);
  });
});

describe('useServerCart Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch cart successfully', async () => {
    (cartApi.get as any).mockResolvedValueOnce(mockCart);

    const { result } = renderHook(() => useServerCart(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockCart);
    expect(cartApi.get).toHaveBeenCalled();
  });

  it('should handle fetch error', async () => {
    const error = new Error('Failed to fetch cart');
    (cartApi.get as any).mockRejectedValue(error);

    const { result } = renderHook(
      () => useServerCart({ retry: false }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    }, { timeout: 2000 });

    expect(result.current.error?.message).toBe('Failed to fetch cart');
  });

  it('should use stale time of 1 minute', async () => {
    (cartApi.get as any).mockResolvedValueOnce(mockCart);

    const { result } = renderHook(() => useServerCart(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.isStale).toBe(false);
  });

  it('should retry only once on failure', async () => {
    const error = new Error('Network error');
    (cartApi.get as any).mockRejectedValue(error);

    const customQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          gcTime: 0,
        },
      },
    });

    const { result } = renderHook(() => useServerCart(), {
      wrapper: createWrapper(customQueryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    }, { timeout: 5000 });

    customQueryClient.clear();
  });

  it('should support custom query options', async () => {
    (cartApi.get as any).mockResolvedValueOnce(mockCart);

    const { result } = renderHook(
      () =>
        useServerCart({
          enabled: true,
          staleTime: 5000,
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockCart);
  });

  it('should not fetch when disabled', async () => {
    const { result } = renderHook(
      () =>
        useServerCart({
          enabled: false,
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPending).toBe(true);
    expect(cartApi.get).not.toHaveBeenCalled();
  });

  it('should handle empty cart', async () => {
    const emptyCart: ServerCartPayload = {
      ...mockCart,
      items: [],
      itemCount: 0,
      subtotal: '0',
    };
    (cartApi.get as any).mockResolvedValueOnce(emptyCart);

    const { result } = renderHook(() => useServerCart(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.items).toHaveLength(0);
    expect(result.current.data?.itemCount).toBe(0);
  });

  it('should handle network timeout', async () => {
    const error = new Error('Request timeout');
    (cartApi.get as any).mockRejectedValue(error);

    const { result } = renderHook(
      () => useServerCart({ retry: false }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    }, { timeout: 2000 });

    expect(result.current.error?.message).toBe('Request timeout');
  });
});

describe('Utility Hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('useServerCartItemCount', () => {
    it('should return item count from cart', async () => {
      (cartApi.get as any).mockResolvedValueOnce(mockCart);

      const { result } = renderHook(() => useServerCartItemCount(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current).toBe(2);
      });
    });

    it('should return 0 when cart is not loaded', () => {
      const { result } = renderHook(
        () =>
          useServerCartItemCount(),
        {
          wrapper: createWrapper(queryClient),
        }
      );

      // Before cart is loaded
      expect(result.current).toBe(0);
    });
  });

  describe('useServerCartSubtotal', () => {
    it('should return subtotal from cart', async () => {
      (cartApi.get as any).mockResolvedValueOnce(mockCart);

      const { result } = renderHook(() => useServerCartSubtotal(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current).toBe('3000.00');
      });
    });

    it('should return "0" when cart is not loaded', () => {
      const { result } = renderHook(
        () =>
          useServerCartSubtotal(),
        {
          wrapper: createWrapper(queryClient),
        }
      );

      expect(result.current).toBe('0');
    });
  });
});

describe('Cache Helper Functions', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('invalidateCart', () => {
    it('should invalidate all cart caches', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await invalidateCart(queryClient);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cartKeys.all });
    });
  });

  describe('setCartData', () => {
    it('should set cart data directly', () => {
      setCartData(queryClient, mockCart);

      const cachedData = queryClient.getQueryData<ServerCartPayload>(cartKeys.detail());
      expect(cachedData).toEqual(mockCart);
    });

    it('should overwrite existing cart data', () => {
      const initialCart = { ...mockCart, itemCount: 5 };
      queryClient.setQueryData(cartKeys.detail(), initialCart);

      setCartData(queryClient, mockCart);

      const cachedData = queryClient.getQueryData<ServerCartPayload>(cartKeys.detail());
      expect(cachedData?.itemCount).toBe(2);
    });
  });

  describe('getCachedCart', () => {
    it('should return cached cart data', () => {
      queryClient.setQueryData(cartKeys.detail(), mockCart);

      const cachedData = getCachedCart(queryClient);
      expect(cachedData).toEqual(mockCart);
    });

    it('should return undefined when no cache', () => {
      const cachedData = getCachedCart(queryClient);
      expect(cachedData).toBeUndefined();
    });
  });
});
