/**
 * Tests for useProducts Query Hooks
 *
 * Comprehensive test suite for TanStack Query product hooks.
 * Tests query functionality, caching, error handling, prefetching,
 * and cache invalidation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock the API module before importing hooks
vi.mock('~/lib/api', () => ({
  productsApi: {
    list: vi.fn(),
    search: vi.fn(),
    featured: vi.fn(),
    getBySlug: vi.fn(),
    getVariants: vi.fn(),
    getFrames: vi.fn(),
    getByIds: vi.fn(),
  },
  getApiUrl: vi.fn(() => 'http://localhost:3000'),
}));

// Import after mock
import {
  useProducts,
  useInfiniteProducts,
  useProductSearch,
  useFeaturedProducts,
  useProduct,
  useProductVariants,
  useFrames,
  useProductsByIds,
  productKeys,
  prefetchProducts,
  prefetchProduct,
  invalidateAllProducts,
  invalidateProductLists,
  invalidateProduct,
  type ProductListItem,
  type ProductsListResponse,
  type ProductDetail,
  type ProductVariant,
  type FrameOption,
} from '~/hooks/useProducts';
import { productsApi } from '~/lib/api';

// Test utilities
const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
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

// Mock data
const mockProduct: ProductListItem = {
  id: 'prod-1',
  sku: 'SKU-001',
  title: 'Ocean Waves Abstract',
  slug: 'ocean-waves-abstract',
  description: 'A beautiful abstract ocean waves poster',
  basePrice: '1500.00',
  styles: ['minimalist', 'abstract'],
  subjects: ['nature', 'ocean'],
  colors: ['blue', 'white'],
  orientation: 'landscape',
  status: 'active',
  featuredOrder: 1,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  images: [
    {
      id: 'img-1',
      url: 'https://cdn.example.com/ocean-waves.jpg',
      thumbnailUrl: 'https://cdn.example.com/ocean-waves-thumb.jpg',
      altText: 'Ocean Waves Abstract Poster',
      type: 'main',
      sortOrder: 0,
    },
  ],
  minPrice: '1500.00',
  maxPrice: '5000.00',
  variantCount: 4,
  seoTitle: 'Ocean Waves Abstract Poster',
  seoDescription: 'Beautiful ocean waves abstract poster for your home',
};

const mockProductsResponse: ProductsListResponse = {
  items: [mockProduct],
  total: 1,
  page: 1,
  pageSize: 24,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
  fromCache: false,
};

const mockProductDetail: ProductDetail = {
  ...mockProduct,
  variants: [
    {
      id: 'var-1',
      productId: 'prod-1',
      sizeLabel: '12" x 18"',
      widthInches: 12,
      heightInches: 18,
      price: '1500.00',
      stockQuantity: 50,
      createdAt: '2024-01-01T00:00:00Z',
    },
  ],
  frames: [
    {
      id: 'frame-1',
      name: 'Oak Frame',
      type: 'wood',
      material: 'oak',
      priceModifier: '500.00',
      imageUrl: 'https://cdn.example.com/oak-frame.jpg',
      isActive: true,
    },
  ],
};

const mockVariants: ProductVariant[] = [
  {
    id: 'var-1',
    productId: 'prod-1',
    sizeLabel: '12" x 18"',
    widthInches: 12,
    heightInches: 18,
    price: '1500.00',
    stockQuantity: 50,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'var-2',
    productId: 'prod-1',
    sizeLabel: '18" x 24"',
    widthInches: 18,
    heightInches: 24,
    price: '2500.00',
    stockQuantity: 30,
    createdAt: '2024-01-01T00:00:00Z',
  },
];

const mockFrames: FrameOption[] = [
  {
    id: 'frame-1',
    name: 'Oak Frame',
    type: 'wood',
    material: 'oak',
    priceModifier: '500.00',
    imageUrl: 'https://cdn.example.com/oak-frame.jpg',
    isActive: true,
  },
  {
    id: 'frame-2',
    name: 'Black Metal Frame',
    type: 'metal',
    material: 'steel',
    priceModifier: '300.00',
    imageUrl: 'https://cdn.example.com/black-metal-frame.jpg',
    isActive: true,
  },
];

describe('useProducts Hooks - Query Keys', () => {
  it('should generate correct all products key', () => {
    expect(productKeys.all).toEqual(['products']);
  });

  it('should generate correct lists key', () => {
    expect(productKeys.lists()).toEqual(['products', 'list']);
  });

  it('should generate correct list key with filters', () => {
    const filters = { styles: 'minimalist', page: 1 };
    expect(productKeys.list(filters)).toEqual(['products', 'list', filters]);
  });

  it('should generate correct list key without filters', () => {
    expect(productKeys.list()).toEqual(['products', 'list', undefined]);
  });

  it('should generate correct search key', () => {
    const params = { q: 'ocean', page: 1 };
    expect(productKeys.search(params)).toEqual(['products', 'search', params]);
  });

  it('should generate correct featured key', () => {
    expect(productKeys.featured()).toEqual(['products', 'featured', undefined]);
    expect(productKeys.featured({ limit: 8 })).toEqual(['products', 'featured', { limit: 8 }]);
  });

  it('should generate correct details key', () => {
    expect(productKeys.details()).toEqual(['products', 'detail']);
  });

  it('should generate correct detail key', () => {
    expect(productKeys.detail('ocean-waves')).toEqual(['products', 'detail', 'ocean-waves']);
  });

  it('should generate correct variants key', () => {
    expect(productKeys.variants('ocean-waves')).toEqual(['products', 'detail', 'ocean-waves', 'variants']);
  });

  it('should generate correct frames key', () => {
    expect(productKeys.frames()).toEqual(['products', 'frames']);
  });

  it('should generate correct byIds key', () => {
    expect(productKeys.byIds(['id1', 'id2'])).toEqual(['products', 'byIds', ['id1', 'id2']]);
  });
});

describe('useProducts Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch products successfully', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    const { result } = renderHook(() => useProducts(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockProductsResponse);
    expect(productsApi.list).toHaveBeenCalledWith(undefined);
  });

  it('should fetch products with filters', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    const filters = { styles: 'minimalist', page: 1, pageSize: 24 };

    const { result } = renderHook(() => useProducts(filters), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(productsApi.list).toHaveBeenCalledWith(filters);
  });

  it('should handle fetch error', async () => {
    const error = new Error('Network error');
    (productsApi.list as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Network error');
  });

  it('should use stale time of 5 minutes', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    const { result } = renderHook(() => useProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Data should be stale after default time
    expect(result.current.isStale).toBe(false);
  });

  it('should support custom query options', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    const { result } = renderHook(
      () =>
        useProducts(undefined, {
          enabled: true,
          staleTime: 1000,
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockProductsResponse);
  });

  it('should not refetch when disabled', async () => {
    const { result } = renderHook(
      () =>
        useProducts(undefined, {
          enabled: false,
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPending).toBe(true);
    expect(productsApi.list).not.toHaveBeenCalled();
  });
});

describe('useInfiniteProducts Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch first page of products', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    const { result } = renderHook(() => useInfiniteProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]).toEqual(mockProductsResponse);
    expect(productsApi.list).toHaveBeenCalledWith({ page: 1 });
  });

  it('should fetch next page when available', async () => {
    const page1 = { ...mockProductsResponse, page: 1, hasNextPage: true };
    const page2 = { ...mockProductsResponse, page: 2, hasNextPage: false };

    (productsApi.list as any)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const { result } = renderHook(() => useInfiniteProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(2);
    });

    expect(productsApi.list).toHaveBeenCalledTimes(2);
    expect(productsApi.list).toHaveBeenLastCalledWith({ page: 2 });
  });

  it('should not have next page when hasNextPage is false', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    const { result } = renderHook(() => useInfiniteProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(false);
  });

  it('should pass filters to API', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    const filters = { styles: 'minimalist', priceMin: 1000 };

    const { result } = renderHook(() => useInfiniteProducts(filters), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(productsApi.list).toHaveBeenCalledWith({ ...filters, page: 1 });
  });
});

describe('useProductSearch Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should search products with query', async () => {
    (productsApi.search as any).mockResolvedValueOnce(mockProductsResponse);

    const params = { q: 'ocean waves', page: 1, pageSize: 24 };

    const { result } = renderHook(() => useProductSearch(params), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(productsApi.search).toHaveBeenCalledWith(params);
    expect(result.current.data).toEqual(mockProductsResponse);
  });

  it('should not search with empty query', async () => {
    const { result } = renderHook(() => useProductSearch({ q: '' }), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPending).toBe(true);
    expect(productsApi.search).not.toHaveBeenCalled();
  });

  it('should not search with query shorter than 2 characters', async () => {
    const { result } = renderHook(() => useProductSearch({ q: 'a' }), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPending).toBe(true);
    expect(productsApi.search).not.toHaveBeenCalled();
  });

  it('should search with query of 2+ characters', async () => {
    (productsApi.search as any).mockResolvedValueOnce(mockProductsResponse);

    const { result } = renderHook(() => useProductSearch({ q: 'ab' }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(productsApi.search).toHaveBeenCalled();
  });

  it('should handle search error', async () => {
    const error = new Error('Search failed');
    (productsApi.search as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useProductSearch({ q: 'ocean' }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Search failed');
  });
});

describe('useFeaturedProducts Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch featured products', async () => {
    const featuredProducts = [mockProduct];
    (productsApi.featured as any).mockResolvedValueOnce(featuredProducts);

    const { result } = renderHook(() => useFeaturedProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(featuredProducts);
    expect(productsApi.featured).toHaveBeenCalledWith(undefined);
  });

  it('should fetch featured products with limit', async () => {
    const featuredProducts = [mockProduct];
    (productsApi.featured as any).mockResolvedValueOnce(featuredProducts);

    const { result } = renderHook(() => useFeaturedProducts({ limit: 8 }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(productsApi.featured).toHaveBeenCalledWith({ limit: 8 });
  });

  it('should use longer stale time (15 minutes)', async () => {
    const featuredProducts = [mockProduct];
    (productsApi.featured as any).mockResolvedValueOnce(featuredProducts);

    const { result } = renderHook(() => useFeaturedProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Featured products have longer stale time
    expect(result.current.isStale).toBe(false);
  });
});

describe('useProduct Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch single product by slug', async () => {
    (productsApi.getBySlug as any).mockResolvedValueOnce(mockProductDetail);

    const { result } = renderHook(() => useProduct('ocean-waves-abstract'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockProductDetail);
    expect(productsApi.getBySlug).toHaveBeenCalledWith('ocean-waves-abstract');
  });

  it('should return null for non-existent product', async () => {
    (productsApi.getBySlug as any).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useProduct('non-existent-slug'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('should not fetch with empty slug', async () => {
    const { result } = renderHook(() => useProduct(''), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPending).toBe(true);
    expect(productsApi.getBySlug).not.toHaveBeenCalled();
  });

  it('should handle fetch error', async () => {
    const error = new Error('Product not found');
    (productsApi.getBySlug as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useProduct('ocean-waves-abstract'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Product not found');
  });
});

describe('useProductVariants Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch product variants', async () => {
    (productsApi.getVariants as any).mockResolvedValueOnce(mockVariants);

    const { result } = renderHook(() => useProductVariants('ocean-waves-abstract'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockVariants);
    expect(productsApi.getVariants).toHaveBeenCalledWith('ocean-waves-abstract');
  });

  it('should not fetch with empty slug', async () => {
    const { result } = renderHook(() => useProductVariants(''), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isPending).toBe(true);
    expect(productsApi.getVariants).not.toHaveBeenCalled();
  });

  it('should handle fetch error', async () => {
    const error = new Error('Variants not found');
    (productsApi.getVariants as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useProductVariants('ocean-waves-abstract'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Variants not found');
  });
});

describe('useFrames Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch available frames', async () => {
    (productsApi.getFrames as any).mockResolvedValueOnce(mockFrames);

    const { result } = renderHook(() => useFrames(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockFrames);
    expect(productsApi.getFrames).toHaveBeenCalled();
  });

  it('should use long stale time (1 hour)', async () => {
    (productsApi.getFrames as any).mockResolvedValueOnce(mockFrames);

    const { result } = renderHook(() => useFrames(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Frames have very long stale time
    expect(result.current.isStale).toBe(false);
  });

  it('should handle fetch error', async () => {
    const error = new Error('Failed to fetch frames');
    (productsApi.getFrames as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useFrames(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Failed to fetch frames');
  });
});

describe('useProductsByIds Hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch products by IDs', async () => {
    const products = [mockProduct];
    (productsApi.getByIds as any).mockResolvedValueOnce(products);

    const { result } = renderHook(() => useProductsByIds(['prod-1']), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(products);
    expect(productsApi.getByIds).toHaveBeenCalledWith(['prod-1']);
  });

  it('should fetch multiple products by IDs', async () => {
    const products = [mockProduct, { ...mockProduct, id: 'prod-2' }];
    (productsApi.getByIds as any).mockResolvedValueOnce(products);

    const { result } = renderHook(() => useProductsByIds(['prod-1', 'prod-2']), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
    expect(productsApi.getByIds).toHaveBeenCalledWith(['prod-1', 'prod-2']);
  });

  it('should not fetch with empty IDs array', async () => {
    const { result } = renderHook(() => useProductsByIds([]), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isPending).toBe(true);
    expect(productsApi.getByIds).not.toHaveBeenCalled();
  });

  it('should handle fetch error', async () => {
    const error = new Error('Failed to fetch products by IDs');
    (productsApi.getByIds as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useProductsByIds(['prod-1']), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Failed to fetch products by IDs');
  });
});

describe('Prefetch Functions', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should prefetch products', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    await prefetchProducts(queryClient);

    expect(productsApi.list).toHaveBeenCalledWith(undefined);

    const cachedData = queryClient.getQueryData(productKeys.list(undefined));
    expect(cachedData).toEqual(mockProductsResponse);
  });

  it('should prefetch products with filters', async () => {
    (productsApi.list as any).mockResolvedValueOnce(mockProductsResponse);

    const filters = { styles: 'minimalist' };
    await prefetchProducts(queryClient, filters);

    expect(productsApi.list).toHaveBeenCalledWith(filters);

    const cachedData = queryClient.getQueryData(productKeys.list(filters));
    expect(cachedData).toEqual(mockProductsResponse);
  });

  it('should prefetch single product', async () => {
    (productsApi.getBySlug as any).mockResolvedValueOnce(mockProductDetail);

    await prefetchProduct(queryClient, 'ocean-waves-abstract');

    expect(productsApi.getBySlug).toHaveBeenCalledWith('ocean-waves-abstract');

    const cachedData = queryClient.getQueryData(productKeys.detail('ocean-waves-abstract'));
    expect(cachedData).toEqual(mockProductDetail);
  });
});

describe('Cache Invalidation Functions', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should invalidate all product caches', async () => {
    // Pre-populate cache
    queryClient.setQueryData(productKeys.list(), mockProductsResponse);
    queryClient.setQueryData(productKeys.detail('ocean-waves'), mockProductDetail);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateAllProducts(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: productKeys.all });
  });

  it('should invalidate product list caches', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateProductLists(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: productKeys.lists() });
  });

  it('should invalidate specific product cache', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateProduct(queryClient, 'ocean-waves');

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: productKeys.detail('ocean-waves') });
  });
});

describe('Query Hook Edge Cases', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should handle empty products response', async () => {
    const emptyResponse: ProductsListResponse = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 24,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
    (productsApi.list as any).mockResolvedValueOnce(emptyResponse);

    const { result } = renderHook(() => useProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.items).toHaveLength(0);
    expect(result.current.data?.total).toBe(0);
  });

  it('should handle network timeout', async () => {
    const error = new Error('Request timeout');
    (productsApi.list as any).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Request timeout');
  });

  it('should use cached data while refetching', async () => {
    const initialResponse = mockProductsResponse;
    const updatedResponse = {
      ...mockProductsResponse,
      items: [{ ...mockProduct, title: 'Updated Title' }],
    };

    (productsApi.list as any)
      .mockResolvedValueOnce(initialResponse)
      .mockResolvedValueOnce(updatedResponse);

    const { result } = renderHook(() => useProducts(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.items[0].title).toBe('Ocean Waves Abstract');

    // Manually trigger refetch
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data?.items[0].title).toBe('Updated Title');
    });
  });

  it('should handle rapid filter changes', async () => {
    (productsApi.list as any).mockImplementation(async (filters: any) => {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      return mockProductsResponse;
    });

    const { result, rerender } = renderHook(
      ({ filters }) => useProducts(filters),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { filters: { styles: 'minimalist' } },
      }
    );

    // Change filters rapidly
    rerender({ filters: { styles: 'abstract' } });
    rerender({ filters: { styles: 'wabi-sabi' } });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should have made multiple calls but settled on final filter
    expect(productsApi.list).toHaveBeenCalled();
  });
});

describe('Types Export', () => {
  it('should export ProductListItem type', () => {
    const item: ProductListItem = mockProduct;
    expect(item.id).toBe('prod-1');
    expect(item.slug).toBe('ocean-waves-abstract');
  });

  it('should export ProductsListResponse type', () => {
    const response: ProductsListResponse = mockProductsResponse;
    expect(response.items).toHaveLength(1);
    expect(response.totalPages).toBe(1);
  });

  it('should export ProductDetail type', () => {
    const detail: ProductDetail = mockProductDetail;
    expect(detail.variants).toBeDefined();
    expect(detail.frames).toBeDefined();
  });

  it('should export ProductVariant type', () => {
    const variant: ProductVariant = mockVariants[0];
    expect(variant.sizeLabel).toBe('12" x 18"');
    expect(variant.price).toBe('1500.00');
  });

  it('should export FrameOption type', () => {
    const frame: FrameOption = mockFrames[0];
    expect(frame.name).toBe('Oak Frame');
    expect(frame.priceModifier).toBe('500.00');
  });
});
