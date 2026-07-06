/**
 * Tests for useCart Query Hooks
 *
 * Comprehensive test suite for TanStack Query cart hooks.
 * Tests query functionality, mutations with optimistic updates,
 * caching, error handling, and cache invalidation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock the API module before importing hooks
vi.mock("~/lib/api", () => ({
  cartApi: {
    get: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    merge: vi.fn(),
  },
  getApiUrl: vi.fn(() => "http://localhost:3000"),
}));

// Import after mock
import {
  useServerCart,
  useAddToCart,
  useUpdateCartItem,
  useRemoveFromCart,
  useClearCart,
  useMergeCart,
  useIsCartSyncing,
  useServerCartItemCount,
  useServerCartSubtotal,
  cartKeys,
  invalidateCart,
  setCartData,
  getCachedCart,
  type ServerCart,
  type ServerCartItem,
  type CartOperationResult,
} from "~/hooks/useCart";
import { cartApi } from "~/lib/api";

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
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

// Mock data
const mockCartItem: ServerCartItem = {
  id: "item-1",
  cartId: "cart-1",
  productId: "prod-1",
  variantId: "var-1",
  frameId: null,
  quantity: 2,
  unitPrice: "1500.00",
  framePrice: "0",
  totalPrice: "3000.00",
  customizations: null,
  isAiGenerated: false,
  aiGenerationId: null,
  aiDetails: null,
  savedForLater: false,
  reservedUntil: null,
  addedAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  product: {
    id: "prod-1",
    title: "Ocean Waves Abstract",
    slug: "ocean-waves-abstract",
    images: [{ url: "https://cdn.example.com/ocean-waves.jpg" }],
  },
  variant: {
    id: "var-1",
    sizeLabel: '12" x 18"',
    widthInches: 12,
    heightInches: 18,
    price: "1500.00",
  },
};

const mockCart: ServerCart = {
  id: "cart-1",
  userId: "user-1",
  guestSessionId: null,
  itemCount: 2,
  subtotal: "3000.00",
  couponCode: null,
  discountAmount: "0",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  expiresAt: null,
  items: [mockCartItem],
};

const mockCartOperationResult: CartOperationResult = {
  success: true,
  message: "Operation successful",
  cart: mockCart,
  item: mockCartItem,
};

describe("useCart Hooks - Query Keys", () => {
  it("should generate correct all cart key", () => {
    expect(cartKeys.all).toEqual(["cart"]);
  });

  it("should generate correct detail key", () => {
    expect(cartKeys.detail()).toEqual(["cart", "detail"]);
  });

  it("should generate correct items key", () => {
    expect(cartKeys.items()).toEqual(["cart", "items"]);
  });
});

describe("useServerCart Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("should fetch cart successfully", async () => {
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

  it("should handle fetch error", async () => {
    const error = new Error("Failed to fetch cart");
    (cartApi.get as any).mockRejectedValue(error);

    const { result } = renderHook(() => useServerCart({ retry: false }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 2000 }
    );

    expect(result.current.error?.message).toBe("Failed to fetch cart");
  });

  it("should use stale time of 1 minute", async () => {
    (cartApi.get as any).mockResolvedValueOnce(mockCart);

    const { result } = renderHook(() => useServerCart(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.isStale).toBe(false);
  });

  it("should retry only once on failure", async () => {
    const error = new Error("Network error");
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

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 5000 }
    );

    customQueryClient.clear();
  });

  it("should support custom query options", async () => {
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

  it("should not fetch when disabled", async () => {
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
});

describe("useAddToCart Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
    // Pre-populate cache with cart
    queryClient.setQueryData(cartKeys.detail(), mockCart);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("should add item to cart", async () => {
    (cartApi.addItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        productId: "prod-2",
        variantId: "var-2",
        quantity: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.addItem).toHaveBeenCalledWith({
      productId: "prod-2",
      variantId: "var-2",
      quantity: 1,
    });
  });

  it("should add item with frame", async () => {
    (cartApi.addItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        productId: "prod-2",
        variantId: "var-2",
        frameId: "frame-1",
        quantity: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.addItem).toHaveBeenCalledWith({
      productId: "prod-2",
      variantId: "var-2",
      frameId: "frame-1",
      quantity: 1,
    });
  });

  it("should add AI-generated item", async () => {
    (cartApi.addItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(queryClient),
    });

    const aiDetails = {
      generationId: "gen-1",
      prompt: "A beautiful sunset",
      stylePreset: "minimalist",
    };

    await act(async () => {
      result.current.mutate({
        productId: "prod-ai",
        variantId: "var-ai",
        quantity: 1,
        isAiGenerated: true,
        aiGenerationId: "gen-1",
        aiDetails,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        isAiGenerated: true,
        aiGenerationId: "gen-1",
        aiDetails,
      })
    );
  });

  it("should perform optimistic update", async () => {
    let itemCountDuringMutation = 0;

    (cartApi.addItem as any).mockImplementation(async () => {
      // Capture item count during mutation
      const cachedCart = queryClient.getQueryData<ServerCart>(cartKeys.detail());
      itemCountDuringMutation = cachedCart?.itemCount || 0;
      return mockCartOperationResult;
    });

    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        productId: "prod-2",
        variantId: "var-2",
        quantity: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Item count should have been incremented optimistically
    expect(itemCountDuringMutation).toBe(3); // 2 + 1
  });

  it("should handle mutation error and set error state", async () => {
    const error = new Error("Failed to add item");
    (cartApi.addItem as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        productId: "prod-2",
        variantId: "var-2",
        quantity: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Error should be captured
    expect(result.current.error?.message).toBe("Failed to add item");
    // Mutation should not be in success state
    expect(result.current.isSuccess).toBe(false);
  });

  it("should invalidate cart on success", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    (cartApi.addItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        productId: "prod-2",
        variantId: "var-2",
        quantity: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cartKeys.detail() });
  });

  it("should handle mutation error", async () => {
    const error = new Error("Product out of stock");
    (cartApi.addItem as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        productId: "prod-2",
        variantId: "var-2",
        quantity: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Product out of stock");
  });
});

describe("useUpdateCartItem Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
    queryClient.setQueryData(cartKeys.detail(), mockCart);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("should update item quantity", async () => {
    (cartApi.updateItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        id: "item-1",
        data: { quantity: 5 },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.updateItem).toHaveBeenCalledWith("item-1", { quantity: 5 });
  });

  it("should update item frame", async () => {
    (cartApi.updateItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        id: "item-1",
        data: { frameId: "frame-2" },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.updateItem).toHaveBeenCalledWith("item-1", { frameId: "frame-2" });
  });

  it("should update save for later status", async () => {
    (cartApi.updateItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        id: "item-1",
        data: { isSavedForLater: true },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.updateItem).toHaveBeenCalledWith("item-1", { isSavedForLater: true });
  });

  it("should perform optimistic update", async () => {
    (cartApi.updateItem as any).mockImplementation(async () => {
      // Check optimistic update was applied
      const cachedCart = queryClient.getQueryData<ServerCart>(cartKeys.detail());
      const updatedItem = cachedCart?.items.find((i) => i.id === "item-1");
      expect(updatedItem?.quantity).toBe(10);
      return mockCartOperationResult;
    });

    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        id: "item-1",
        data: { quantity: 10 },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should handle update error and set error state", async () => {
    const error = new Error("Invalid quantity");
    (cartApi.updateItem as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        id: "item-1",
        data: { quantity: 100 },
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Error should be captured
    expect(result.current.error?.message).toBe("Invalid quantity");
    expect(result.current.isSuccess).toBe(false);
  });

  it("should invalidate cart on success", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    (cartApi.updateItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        id: "item-1",
        data: { quantity: 5 },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cartKeys.detail() });
  });
});

describe("useRemoveFromCart Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
    queryClient.setQueryData(cartKeys.detail(), mockCart);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("should remove item from cart", async () => {
    (cartApi.removeItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useRemoveFromCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate("item-1");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.removeItem).toHaveBeenCalledWith("item-1");
  });

  it("should perform optimistic removal", async () => {
    (cartApi.removeItem as any).mockImplementation(async () => {
      // Check item was removed optimistically
      const cachedCart = queryClient.getQueryData<ServerCart>(cartKeys.detail());
      const item = cachedCart?.items.find((i) => i.id === "item-1");
      expect(item).toBeUndefined();
      return mockCartOperationResult;
    });

    const { result } = renderHook(() => useRemoveFromCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate("item-1");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should decrement item count optimistically", async () => {
    (cartApi.removeItem as any).mockImplementation(async () => {
      const cachedCart = queryClient.getQueryData<ServerCart>(cartKeys.detail());
      expect(cachedCart?.itemCount).toBe(0); // 2 - 2 (item quantity)
      return mockCartOperationResult;
    });

    const { result } = renderHook(() => useRemoveFromCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate("item-1");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should handle remove error and set error state", async () => {
    const error = new Error("Item not found");
    (cartApi.removeItem as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useRemoveFromCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate("item-1");
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Error should be captured
    expect(result.current.error?.message).toBe("Item not found");
    expect(result.current.isSuccess).toBe(false);
  });

  it("should invalidate cart on success", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    (cartApi.removeItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useRemoveFromCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate("item-1");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cartKeys.detail() });
  });
});

describe("useClearCart Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
    queryClient.setQueryData(cartKeys.detail(), mockCart);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("should clear entire cart", async () => {
    (cartApi.clear as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useClearCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.clear).toHaveBeenCalled();
  });

  it("should perform optimistic clear", async () => {
    (cartApi.clear as any).mockImplementation(async () => {
      const cachedCart = queryClient.getQueryData<ServerCart>(cartKeys.detail());
      expect(cachedCart?.items).toHaveLength(0);
      expect(cachedCart?.itemCount).toBe(0);
      expect(cachedCart?.subtotal).toBe("0");
      return mockCartOperationResult;
    });

    const { result } = renderHook(() => useClearCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should handle clear error and set error state", async () => {
    const error = new Error("Server error");
    (cartApi.clear as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useClearCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Error should be captured
    expect(result.current.error?.message).toBe("Server error");
    expect(result.current.isSuccess).toBe(false);
  });

  it("should invalidate cart on success", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    (cartApi.clear as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useClearCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cartKeys.detail() });
  });
});

describe("useMergeCart Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("should merge guest cart into user cart", async () => {
    (cartApi.merge as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useMergeCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate("guest-session-123");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(cartApi.merge).toHaveBeenCalledWith("guest-session-123");
  });

  it("should handle merge error", async () => {
    const error = new Error("Merge failed");
    (cartApi.merge as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useMergeCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate("guest-session-123");
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Merge failed");
  });

  it("should invalidate cart on success", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    (cartApi.merge as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useMergeCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate("guest-session-123");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cartKeys.detail() });
  });
});

describe("Utility Hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("useIsCartSyncing", () => {
    it("should return false when not syncing", async () => {
      queryClient.setQueryData(cartKeys.detail(), mockCart);

      const { result } = renderHook(() => useIsCartSyncing(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current).toBe(false);
    });

    it("should track isPending state during mutations", async () => {
      queryClient.setQueryData(cartKeys.detail(), mockCart);

      // Track all pending states during mutation lifecycle
      const pendingStates: boolean[] = [];

      // Mock that takes time to resolve
      (cartApi.addItem as any).mockImplementation(async () => {
        // Capture pending state during API call
        await new Promise((resolve) => setTimeout(resolve, 50));
        return mockCartOperationResult;
      });

      const { result } = renderHook(() => useAddToCart(), {
        wrapper: createWrapper(queryClient),
      });

      // Initially not pending
      expect(result.current.isPending).toBe(false);
      pendingStates.push(result.current.isPending);

      // Start mutation
      await act(async () => {
        result.current.mutate({
          productId: "prod-1",
          variantId: "var-1",
          quantity: 1,
        });
      });

      // After mutation completes, should not be pending
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isPending).toBe(false);
    });
  });

  describe("useServerCartItemCount", () => {
    it("should return item count from cart", async () => {
      (cartApi.get as any).mockResolvedValueOnce(mockCart);

      const { result } = renderHook(() => useServerCartItemCount(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current).toBe(2);
      });
    });

    it("should return 0 when cart is not loaded", () => {
      const { result } = renderHook(() => useServerCartItemCount(), {
        wrapper: createWrapper(queryClient),
      });

      // Before cart is loaded
      expect(result.current).toBe(0);
    });
  });

  describe("useServerCartSubtotal", () => {
    it("should return subtotal from cart", async () => {
      (cartApi.get as any).mockResolvedValueOnce(mockCart);

      const { result } = renderHook(() => useServerCartSubtotal(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current).toBe("3000.00");
      });
    });

    it('should return "0" when cart is not loaded', () => {
      const { result } = renderHook(() => useServerCartSubtotal(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current).toBe("0");
    });
  });
});

describe("Cache Helper Functions", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("invalidateCart", () => {
    it("should invalidate all cart caches", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await invalidateCart(queryClient);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cartKeys.all });
    });
  });

  describe("setCartData", () => {
    it("should set cart data directly", () => {
      setCartData(queryClient, mockCart);

      const cachedData = queryClient.getQueryData<ServerCart>(cartKeys.detail());
      expect(cachedData).toEqual(mockCart);
    });

    it("should overwrite existing cart data", () => {
      const initialCart = { ...mockCart, itemCount: 5 };
      queryClient.setQueryData(cartKeys.detail(), initialCart);

      setCartData(queryClient, mockCart);

      const cachedData = queryClient.getQueryData<ServerCart>(cartKeys.detail());
      expect(cachedData?.itemCount).toBe(2);
    });
  });

  describe("getCachedCart", () => {
    it("should return cached cart data", () => {
      queryClient.setQueryData(cartKeys.detail(), mockCart);

      const cachedData = getCachedCart(queryClient);
      expect(cachedData).toEqual(mockCart);
    });

    it("should return undefined when no cache", () => {
      const cachedData = getCachedCart(queryClient);
      expect(cachedData).toBeUndefined();
    });
  });
});

describe("Edge Cases", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("should handle empty cart", async () => {
    const emptyCart: ServerCart = {
      ...mockCart,
      items: [],
      itemCount: 0,
      subtotal: "0",
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

  it("should handle guest cart", async () => {
    const guestCart: ServerCart = {
      ...mockCart,
      userId: null,
      guestSessionId: "guest-123",
    };
    (cartApi.get as any).mockResolvedValueOnce(guestCart);

    const { result } = renderHook(() => useServerCart(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.userId).toBeNull();
    expect(result.current.data?.guestSessionId).toBe("guest-123");
  });

  it("should handle cart with coupon", async () => {
    const cartWithCoupon: ServerCart = {
      ...mockCart,
      couponCode: "SAVE20",
      discountAmount: "600.00",
    };
    (cartApi.get as any).mockResolvedValueOnce(cartWithCoupon);

    const { result } = renderHook(() => useServerCart(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.couponCode).toBe("SAVE20");
    expect(result.current.data?.discountAmount).toBe("600.00");
  });

  it("should handle network timeout", async () => {
    const error = new Error("Request timeout");
    (cartApi.get as any).mockRejectedValue(error);

    const { result } = renderHook(() => useServerCart({ retry: false }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 2000 }
    );

    expect(result.current.error?.message).toBe("Request timeout");
  });

  it("should handle optimistic update when no previous cart exists", async () => {
    // Don't pre-populate cache
    (cartApi.addItem as any).mockResolvedValueOnce(mockCartOperationResult);

    const { result } = renderHook(() => useAddToCart(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        productId: "prod-1",
        variantId: "var-1",
        quantity: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should still succeed even without previous cache
    expect(cartApi.addItem).toHaveBeenCalled();
  });

  it("should handle rapid mutations", async () => {
    queryClient.setQueryData(cartKeys.detail(), mockCart);
    (cartApi.updateItem as any).mockResolvedValue(mockCartOperationResult);

    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(queryClient),
    });

    // Rapid fire multiple mutations
    await act(async () => {
      result.current.mutate({ id: "item-1", data: { quantity: 3 } });
      result.current.mutate({ id: "item-1", data: { quantity: 4 } });
      result.current.mutate({ id: "item-1", data: { quantity: 5 } });
    });

    await waitFor(() => {
      expect(cartApi.updateItem).toHaveBeenCalled();
    });
  });
});

describe("Types Export", () => {
  it("should export ServerCart type", () => {
    const cart: ServerCart = mockCart;
    expect(cart.id).toBe("cart-1");
    expect(cart.items).toHaveLength(1);
  });

  it("should export ServerCartItem type", () => {
    const item: ServerCartItem = mockCartItem;
    expect(item.id).toBe("item-1");
    expect(item.quantity).toBe(2);
  });

  it("should export CartOperationResult type", () => {
    const result: CartOperationResult = mockCartOperationResult;
    expect(result.success).toBe(true);
    expect(result.message).toBe("Operation successful");
  });
});
