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
import {
  reviewsApi,
  type ReviewFeedResponse,
  type ReviewMediaFeedItem,
  type ReviewMediaType,
  type ReviewMediaProcessingStatus,
} from '~/lib/api'
import { getApiUrl } from '~/lib/utils'

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
  /** Prefix for every page of the site-wide feed — what invalidation targets. */
  feeds: () => [...reviewKeys.all, 'feed'] as const,
  feed: (page: number, pageSize: number) =>
    [...reviewKeys.feeds(), page, pageSize] as const,
  /** Prefix for every page of the masonry grid, filtered or not. */
  cardFeeds: () => [...reviewKeys.all, 'cards'] as const,
  /**
   * `'all'` rather than `undefined` for the unfiltered grid, for the same
   * reason `mediaFeed` does it: an undefined tail serialises to the same key
   * as a missing one, so /reviews and a PDP grid would collide.
   */
  cards: (productId: string | undefined, page: number, pageSize: number) =>
    [...reviewKeys.cardFeeds(), productId ?? 'all', page, pageSize] as const,
  /** Prefix for every media feed, filtered or not. */
  mediaFeeds: () => [...reviewKeys.all, 'media'] as const,
  /**
   * `'all'` rather than `undefined` for the unfiltered feed: an undefined tail
   * serialises to the same key as a missing one, so the site-wide strip and a
   * product wall could collide.
   */
  mediaFeed: (productId?: string) =>
    [...reviewKeys.mediaFeeds(), productId ?? 'all'] as const,
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
// Media Upload
// ============================================================================

/** What POST /api/reviews/:id/media/presign hands back. */
export interface ReviewMediaPresign {
  /** Short-lived, signed, and pointing at R2 — NOT at our API. */
  uploadUrl: string
  key: string
  contentType: string
  mediaType: ReviewMediaType
  maxBytes: number
  expiresInSeconds: number
}

/** The row `complete` created. A video arrives here still `processing`. */
export interface UploadedReviewMedia {
  id: string
  reviewId: string
  mediaType: ReviewMediaType
  url: string
  thumbnailUrl: string | null
  posterUrl: string | null
  sortOrder: number
  processingStatus: ReviewMediaProcessingStatus
}

/** Pull the API's `{ error }` out of a response, falling back to `fallback`. */
async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}) as { error?: string })
  return body?.error || fallback
}

/**
 * Attach one photo or video to a pending review.
 *
 * Three steps, because the bytes never touch our API: a review video is capped
 * at 200MB and routing that through Hono means holding a request open on the
 * box that also serves the storefront.
 *
 *   1. presign  — authorise the PUT, get back the url and the object key
 *   2. PUT      — straight to R2
 *   3. complete — tell the API which object landed
 *
 * The PUT carries no credentials and no header but Content-Type. The signature
 * IS the auth; a cookie ride-along or an extra header changes what R2 hashes
 * and the upload comes back 403. Content-Type must also match what was signed.
 */
export async function uploadReviewMedia(
  reviewId: string,
  file: File
): Promise<UploadedReviewMedia> {
  const presignResponse = await fetch(
    `${getApiUrl()}/api/reviews/${reviewId}/media/presign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        contentType: file.type,
        sizeBytes: file.size,
        filename: file.name,
      }),
    }
  )

  if (!presignResponse.ok) {
    throw new Error(
      await readError(presignResponse, 'Could not prepare the upload')
    )
  }

  const presign = (await presignResponse.json()) as ReviewMediaPresign

  const uploadResponse = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })

  if (!uploadResponse.ok) {
    // R2 answers in XML, so there is no `{ error }` to read here.
    throw new Error(`Upload failed (${uploadResponse.status})`)
  }

  const completeResponse = await fetch(
    `${getApiUrl()}/api/reviews/${reviewId}/media/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        key: presign.key,
        contentType: presign.contentType,
      }),
    }
  )

  if (!completeResponse.ok) {
    throw new Error(
      await readError(completeResponse, 'Could not save the upload')
    )
  }

  const { media } = (await completeResponse.json()) as {
    media: UploadedReviewMedia
  }

  return media
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

/**
 * One page of the site-wide review feed.
 *
 * Backs the /reviews page and the home strip. Distinct from `useReviews`,
 * which is scoped to a single product.
 */
export function useReviewFeed(
  page: number,
  pageSize = 20,
  options?: Omit<UseQueryOptions<ReviewFeedResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: reviewKeys.feed(page, pageSize),
    queryFn: () => reviewsApi.listAll({ page, pageSize }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * One page of review cards for the masonry grid — filtered to a product, or
 * not.
 *
 * The `productId` is the ONLY difference between the two deployments of the
 * grid: the PDP passes one, /reviews does not, exactly the way mesonart runs
 * the same Loox grid on both surfaces.
 *
 * Reads through `reviewsApi` rather than the relative-URL helpers at the top
 * of this module. There is no Vite proxy for `/api` in this repo, so a
 * relative request from the dev server never reaches the API — it passes in
 * jsdom and fails in the browser (#493).
 */
export function useReviewCards(
  productId: string | undefined,
  page: number,
  pageSize = 24,
  options?: Omit<UseQueryOptions<ReviewFeedResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: reviewKeys.cards(productId, page, pageSize),
    queryFn: () =>
      productId
        ? reviewsApi.listForProduct(productId, { page, pageSize })
        : reviewsApi.listAll({ page, pageSize }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Flat feed of customer photos and videos.
 *
 * Pass a productId for the PDP media wall; omit it for the site-wide strip.
 * The feed is capped server-side and does not paginate.
 */
export function useReviewMediaFeed(
  productId?: string,
  options?: Omit<
    UseQueryOptions<ReviewMediaFeedItem[]>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: reviewKeys.mediaFeed(productId),
    queryFn: () => reviewsApi.mediaFeed({ productId }),
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
      // A new review also moves the site-wide surfaces — the /reviews page and
      // the home strip read the same rows, and a review with photos changes
      // the media wall too. Prefix keys, so every page and every filter goes.
      queryClient.invalidateQueries({ queryKey: reviewKeys.feeds() })
      queryClient.invalidateQueries({ queryKey: reviewKeys.cardFeeds() })
      queryClient.invalidateQueries({ queryKey: reviewKeys.mediaFeeds() })
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
