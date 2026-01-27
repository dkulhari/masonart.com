/**
 * TanStack Query Hooks for Reviews
 *
 * Provides data fetching hooks for product review operations with
 * automatic caching, background refetching, and type safety.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import type { ReviewData } from '~/components/reviews/ReviewCard'
import type { ReviewStats } from '~/components/reviews/ReviewSummary'

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for reviews
 * Enables granular cache invalidation
 */
export const reviewKeys = {
  all: ['reviews'] as const,
  lists: () => [...reviewKeys.all, 'list'] as const,
  list: (productId: string, filters?: ReviewFilters) =>
    [...reviewKeys.lists(), productId, filters] as const,
  stats: (productId: string) => [...reviewKeys.all, 'stats', productId] as const,
}

// ============================================================================
// Types
// ============================================================================

export interface ReviewFilters {
  rating?: number | null
  sortBy?: 'newest' | 'oldest' | 'highest' | 'lowest'
  page?: number
  limit?: number
}

export interface ReviewListResponse {
  reviews: ReviewData[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface ReviewStatsResponse {
  averageRating: number
  totalReviews: number
  distribution: Array<{
    rating: number
    count: number
    percentage: number
  }>
}

export interface CreateReviewData {
  rating: number
  title?: string
  content: string
}

// ============================================================================
// API Functions
// ============================================================================

const API_BASE = '/api'

/**
 * Fetch reviews for a product
 */
async function fetchReviews(
  productId: string,
  filters?: ReviewFilters
): Promise<ReviewListResponse> {
  const params = new URLSearchParams()
  if (filters?.rating) params.set('rating', String(filters.rating))
  if (filters?.sortBy) params.set('sortBy', filters.sortBy)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.limit) params.set('limit', String(filters.limit))

  const queryString = params.toString()
  const url = `${API_BASE}/products/${productId}/reviews${queryString ? `?${queryString}` : ''}`

  const response = await fetch(url, {
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error('Failed to fetch reviews')
  }

  return response.json()
}

/**
 * Fetch review stats for a product
 */
async function fetchReviewStats(productId: string): Promise<ReviewStatsResponse> {
  const response = await fetch(`${API_BASE}/products/${productId}/reviews/stats`, {
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error('Failed to fetch review stats')
  }

  return response.json()
}

/**
 * Create a new review
 */
async function createReview(
  productId: string,
  data: CreateReviewData
): Promise<ReviewData> {
  const response = await fetch(`${API_BASE}/products/${productId}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || 'Failed to create review')
  }

  return response.json()
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch reviews for a product
 */
export function useReviews(
  productId: string,
  filters?: ReviewFilters,
  options?: Omit<UseQueryOptions<ReviewListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: reviewKeys.list(productId, filters),
    queryFn: () => fetchReviews(productId, filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Hook to fetch review stats for a product
 */
export function useReviewStats(
  productId: string,
  options?: Omit<UseQueryOptions<ReviewStatsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: reviewKeys.stats(productId),
    queryFn: () => fetchReviewStats(productId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to create a new review
 */
export function useCreateReview(productId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateReviewData) => createReview(productId, data),
    onSuccess: () => {
      // Invalidate reviews list and stats to refetch
      queryClient.invalidateQueries({ queryKey: reviewKeys.lists() })
      queryClient.invalidateQueries({ queryKey: reviewKeys.stats(productId) })
    },
  })
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert API stats response to ReviewStats type
 */
export function toReviewStats(response: ReviewStatsResponse): ReviewStats {
  return {
    averageRating: response.averageRating,
    totalReviews: response.totalReviews,
    distribution: response.distribution.map((d) => ({
      rating: d.rating,
      count: d.count,
      percentage: d.percentage,
    })),
  }
}
