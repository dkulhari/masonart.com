/**
 * TanStack Query Hooks for Products
 *
 * Provides data fetching hooks for product-related operations with
 * automatic caching, background refetching, and type safety.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseInfiniteQueryOptions,
} from "@tanstack/react-query";
import {
  productsApi,
  toFeaturedProducts,
  type ProductFilters,
  type ProductSearchParams,
  type FeaturedProductsParams,
} from "~/lib/api";

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for products
 * Enables granular cache invalidation
 */
export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (filters?: ProductFilters) => [...productKeys.lists(), filters] as const,
  search: (params: ProductSearchParams) =>
    [...productKeys.all, "search", params] as const,
  featured: (params?: FeaturedProductsParams) =>
    [...productKeys.all, "featured", params] as const,
  details: () => [...productKeys.all, "detail"] as const,
  detail: (slug: string) => [...productKeys.details(), slug] as const,
  variants: (slug: string) => [...productKeys.detail(slug), "variants"] as const,
  frames: () => [...productKeys.all, "frames"] as const,
  byIds: (ids: string[]) => [...productKeys.all, "byIds", ids] as const,
};

// ============================================================================
// Types
// ============================================================================

/**
 * Product list item from API response
 */
export interface ProductListItem {
  id: string;
  sku: string;
  title: string;
  slug: string;
  description: string | null;
  basePrice: string;
  styles: string[] | null;
  subjects: string[] | null;
  colors: string[] | null;
  orientation: string;
  status: string;
  featuredOrder: number | null;
  createdAt: string;
  updatedAt: string;
  images: ProductImage[];
  minPrice: string;
  maxPrice: string;
  variantCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

/**
 * Product image type
 */
import type { ProductImage } from '@chobii/shared';
export type { ProductImage };

/**
 * Product variant type
 */
export interface ProductVariant {
  id: string;
  productId: string;
  sizeLabel: string;
  widthInches: number;
  heightInches: number;
  price: string;
  stockQuantity: number;
  createdAt: string;
}

/**
 * Frame option type
 */
export interface FrameOption {
  id: string;
  name: string;
  type: string;
  material: string | null;
  priceModifier: string;
  imageUrl: string | null;
  isActive: boolean;
}

/**
 * Full product details from API
 */
export interface ProductDetail extends ProductListItem {
  variants: ProductVariant[];
  frames: FrameOption[];
}

/**
 * Products list response
 */
export interface ProductsListResponse {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  fromCache?: boolean;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch paginated products with filters
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useProducts({
 *   styles: 'minimalist,wabi-sabi',
 *   priceMin: 1000,
 *   priceMax: 5000,
 *   page: 1,
 *   pageSize: 24,
 * });
 * ```
 */
export function useProducts(
  filters?: ProductFilters,
  options?: Omit<
    UseQueryOptions<ProductsListResponse, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: productKeys.list(filters),
    queryFn: () => productsApi.list(filters) as Promise<ProductsListResponse>,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options,
  });
}

/**
 * Hook for infinite scrolling product list
 *
 * @example
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useInfiniteProducts({ styles: 'minimalist' });
 *
 * // Flatten pages for rendering
 * const products = data?.pages.flatMap(page => page.items) ?? [];
 * ```
 */
export function useInfiniteProducts(
  filters?: Omit<ProductFilters, "page">,
  options?: Omit<
    UseInfiniteQueryOptions<ProductsListResponse, Error>,
    "queryKey" | "queryFn" | "getNextPageParam" | "initialPageParam"
  >
) {
  return useInfiniteQuery({
    queryKey: [...productKeys.list(filters), "infinite"] as const,
    queryFn: ({ pageParam }) =>
      productsApi.list({
        ...filters,
        page: pageParam as number,
      }) as Promise<ProductsListResponse>,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options,
  });
}

/**
 * Hook to search products by query string
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useProductSearch({
 *   q: 'mountain landscape',
 *   page: 1,
 *   pageSize: 24,
 * });
 * ```
 */
export function useProductSearch(
  params: ProductSearchParams,
  options?: Omit<
    UseQueryOptions<ProductsListResponse, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: productKeys.search(params),
    queryFn: () => productsApi.search(params) as Promise<ProductsListResponse>,
    enabled: !!params.q && params.q.length >= 2,
    staleTime: 1000 * 60 * 2, // 2 minutes
    ...options,
  });
}

/**
 * Hook to fetch featured products for homepage
 *
 * @example
 * ```tsx
 * const { data: featuredProducts } = useFeaturedProducts({ limit: 8 });
 * ```
 */
export function useFeaturedProducts(
  params?: FeaturedProductsParams,
  options?: Omit<
    UseQueryOptions<ProductListItem[], Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: productKeys.featured(params),
    // The endpoint returns an { items } envelope, not a bare array. The old
    // cast asserted otherwise, so consumers would have received an object
    // where they expected a list — same defect as the home page (#351).
    queryFn: async () =>
      toFeaturedProducts(await productsApi.featured<ProductListItem>(params)),
    staleTime: 1000 * 60 * 15, // 15 minutes
    ...options,
  });
}

/**
 * Hook to fetch a single product by slug
 *
 * @example
 * ```tsx
 * const { data: product, isLoading, error } = useProduct('ocean-waves-abstract');
 *
 * if (isLoading) return <Skeleton />;
 * if (!product) return <NotFound />;
 * ```
 */
export function useProduct(
  slug: string,
  options?: Omit<
    UseQueryOptions<ProductDetail | null, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: productKeys.detail(slug),
    queryFn: () => productsApi.getBySlug(slug) as Promise<ProductDetail | null>,
    enabled: !!slug,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options,
  });
}

/**
 * Hook to fetch product variants only
 *
 * @example
 * ```tsx
 * const { data: variants } = useProductVariants('ocean-waves-abstract');
 * ```
 */
export function useProductVariants(
  slug: string,
  options?: Omit<
    UseQueryOptions<ProductVariant[], Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: productKeys.variants(slug),
    queryFn: () => productsApi.getVariants(slug) as Promise<ProductVariant[]>,
    enabled: !!slug,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options,
  });
}

/**
 * Hook to fetch available frame options
 *
 * @example
 * ```tsx
 * const { data: frames } = useFrames();
 * ```
 */
export function useFrames(
  options?: Omit<UseQueryOptions<FrameOption[], Error>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: productKeys.frames(),
    queryFn: () => productsApi.getFrames() as Promise<FrameOption[]>,
    staleTime: 1000 * 60 * 60, // 1 hour (frames don't change often)
    ...options,
  });
}

/**
 * Hook to fetch multiple products by IDs
 *
 * @example
 * ```tsx
 * const { data: products } = useProductsByIds(['id1', 'id2', 'id3']);
 * ```
 */
export function useProductsByIds(
  ids: string[],
  options?: Omit<
    UseQueryOptions<ProductListItem[], Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: productKeys.byIds(ids),
    queryFn: () => productsApi.getByIds(ids) as Promise<ProductListItem[]>,
    enabled: ids.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options,
  });
}

// ============================================================================
// Prefetch Functions
// ============================================================================

/**
 * Prefetch products for a given filter set
 * Useful for hover prefetching or SSR hydration
 *
 * @example
 * ```tsx
 * const queryClient = useQueryClient();
 *
 * // On hover
 * const handleHover = () => {
 *   prefetchProducts(queryClient, { styles: 'minimalist' });
 * };
 * ```
 */
export async function prefetchProducts(
  queryClient: ReturnType<typeof useQueryClient>,
  filters?: ProductFilters
) {
  await queryClient.prefetchQuery({
    queryKey: productKeys.list(filters),
    queryFn: () => productsApi.list(filters),
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Prefetch a product detail page
 *
 * @example
 * ```tsx
 * // On link hover
 * <Link
 *   to={`/posters/${slug}`}
 *   onMouseEnter={() => prefetchProduct(queryClient, slug)}
 * >
 *   {title}
 * </Link>
 * ```
 */
export async function prefetchProduct(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string
) {
  await queryClient.prefetchQuery({
    queryKey: productKeys.detail(slug),
    queryFn: () => productsApi.getBySlug(slug),
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// Cache Invalidation Helpers
// ============================================================================

/**
 * Invalidate all product caches
 */
export function invalidateAllProducts(
  queryClient: ReturnType<typeof useQueryClient>
) {
  return queryClient.invalidateQueries({ queryKey: productKeys.all });
}

/**
 * Invalidate product list caches
 */
export function invalidateProductLists(
  queryClient: ReturnType<typeof useQueryClient>
) {
  return queryClient.invalidateQueries({ queryKey: productKeys.lists() });
}

/**
 * Invalidate a specific product cache
 */
export function invalidateProduct(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string
) {
  return queryClient.invalidateQueries({ queryKey: productKeys.detail(slug) });
}
