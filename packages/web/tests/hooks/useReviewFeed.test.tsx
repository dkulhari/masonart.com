/**
 * Tests for the site-wide review feed client layer.
 *
 * Covers the two reads that are not product-scoped (`GET /api/reviews` and
 * `GET /api/reviews/media`), the two-step media upload, and the query keys the
 * feed surfaces hang off.
 *
 * `fetch` is stubbed rather than `~/lib/api`, because half of what is under
 * test here IS the request: the absolute `getApiUrl()` base (there is no Vite
 * `/api` proxy in this repo), and the fact that the presigned PUT goes straight
 * to R2 carrying no credentials and no header beyond Content-Type — an extra
 * header invalidates the signature.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { reviewsApi } from '~/lib/api';
import { getApiUrl } from '~/lib/utils';
import {
  reviewKeys,
  useReviewFeed,
  useReviewMediaFeed,
  useCreateReview,
  uploadReviewMedia,
} from '~/hooks/useReviews';

// ============================================================================
// Fixtures
// ============================================================================

const API = getApiUrl();

const mockMedia = {
  id: 'media-1',
  reviewId: 'review-1',
  mediaType: 'image' as const,
  url: 'https://cdn.example.com/reviews/review-1/media/a.jpg',
  thumbnailUrl: 'https://cdn.example.com/reviews/review-1/media/a.jpg',
  posterUrl: null,
  durationSeconds: null,
  width: 1200,
  height: 900,
  sortOrder: 0,
};

const mockFeedItem = {
  id: 'review-1',
  productId: 'product-1',
  rating: 5,
  title: 'Gorgeous print',
  content: 'The colours are exactly as shown on the product page.',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  author: { id: 'user-1', name: 'Asha' },
  product: {
    id: 'product-1',
    title: 'Ocean Waves',
    slug: 'ocean-waves',
    imageUrl: 'https://cdn.example.com/products/ocean-waves.jpg',
  },
  media: [mockMedia],
};

const mockFeedResponse = {
  items: [mockFeedItem],
  total: 37,
  page: 1,
  pageSize: 20,
  totalPages: 2,
  hasNextPage: true,
  hasPreviousPage: false,
};

const mockMediaFeedItem = {
  ...mockMedia,
  productId: 'product-1',
  rating: 5,
  reviewCreatedAt: '2026-07-01T00:00:00Z',
};

// ============================================================================
// Test utilities
// ============================================================================

const fetchMock = vi.fn();

/** A minimal Response stand-in — the client only reads ok/status/json. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================================
// reviewsApi.listAll
// ============================================================================

describe('reviewsApi.listAll', () => {
  it('requests the site-wide review list with pagination params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockFeedResponse));

    const result = await reviewsApi.listAll({ page: 2, pageSize: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/api/reviews?page=2&pageSize=5`);
    expect(init.method).toBe('GET');
    expect(result.total).toBe(37);
    expect(result.items[0].product.slug).toBe('ocean-waves');
    expect(result.items[0].media[0].url).toBe(mockMedia.url);
  });

  it('omits the query string entirely when no params are given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockFeedResponse));

    await reviewsApi.listAll();

    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/reviews`);
  });

  it('carries the sort order through', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockFeedResponse));

    await reviewsApi.listAll({ sortBy: 'highest' });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/reviews?sortBy=highest`);
  });

  it('rejects with a readable message on a non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'Failed to fetch reviews' }, 500)
    );

    await expect(reviewsApi.listAll()).rejects.toThrow('Failed to fetch reviews');
  });
});

// ============================================================================
// reviewsApi.mediaFeed
// ============================================================================

describe('reviewsApi.mediaFeed', () => {
  it('requests the flat media feed filtered by product', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [mockMediaFeedItem], total: 1 })
    );

    const items = await reviewsApi.mediaFeed({ productId: 'product-1' });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/api/reviews/media?productId=product-1`
    );
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe('product-1');
    expect(items[0].mediaType).toBe('image');
  });

  it('requests the unfiltered feed when no product is given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

    const items = await reviewsApi.mediaFeed();

    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/reviews/media`);
    expect(items).toEqual([]);
  });

  it('rejects with a readable message on a non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'Failed to fetch review media' }, 500)
    );

    await expect(reviewsApi.mediaFeed()).rejects.toThrow(
      'Failed to fetch review media'
    );
  });
});

// ============================================================================
// uploadReviewMedia
// ============================================================================

describe('uploadReviewMedia', () => {
  const presignPayload = {
    uploadUrl: 'https://r2.example.com/bucket/reviews/review-1/media/a.jpg?sig=abc',
    key: 'reviews/review-1/media/a.jpg',
    contentType: 'image/jpeg',
    mediaType: 'image' as const,
    maxBytes: 10485760,
    expiresInSeconds: 900,
  };

  const completePayload = {
    media: {
      id: 'media-1',
      reviewId: 'review-1',
      mediaType: 'image' as const,
      url: mockMedia.url,
      thumbnailUrl: mockMedia.url,
      posterUrl: null,
      sortOrder: 0,
      processingStatus: 'ready' as const,
    },
  };

  const makeFile = () =>
    new File(['some-bytes'], 'holiday photo.jpg', { type: 'image/jpeg' });

  it('presigns, PUTs to R2, then records the object', async () => {
    const file = makeFile();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(presignPayload))
      .mockResolvedValueOnce(jsonResponse({}, 200))
      .mockResolvedValueOnce(jsonResponse(completePayload, 201));

    const media = await uploadReviewMedia('review-1', file);

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [presignUrl, presignInit] = fetchMock.mock.calls[0];
    expect(presignUrl).toBe(`${API}/api/reviews/review-1/media/presign`);
    expect(presignInit.method).toBe('POST');
    expect(presignInit.credentials).toBe('include');
    expect(JSON.parse(presignInit.body)).toEqual({
      contentType: 'image/jpeg',
      sizeBytes: file.size,
      filename: 'holiday photo.jpg',
    });

    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe(presignPayload.uploadUrl);
    expect(putInit.method).toBe('PUT');
    expect(putInit.body).toBe(file);

    const [completeUrl, completeInit] = fetchMock.mock.calls[2];
    expect(completeUrl).toBe(`${API}/api/reviews/review-1/media/complete`);
    expect(completeInit.method).toBe('POST');
    expect(completeInit.credentials).toBe('include');
    expect(JSON.parse(completeInit.body)).toEqual({
      key: presignPayload.key,
      contentType: 'image/jpeg',
    });

    expect(media.id).toBe('media-1');
    expect(media.processingStatus).toBe('ready');
  });

  it('sends the R2 PUT with Content-Type only — no auth, no credentials', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(presignPayload))
      .mockResolvedValueOnce(jsonResponse({}, 200))
      .mockResolvedValueOnce(jsonResponse(completePayload, 201));

    await uploadReviewMedia('review-1', makeFile());

    const putInit = fetchMock.mock.calls[1][1];
    // The signature IS the auth. Any extra header, or a cookie ride-along,
    // breaks it — so the header bag must be exactly one entry.
    expect(putInit.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(putInit.credentials).toBeUndefined();
  });

  it('surfaces the presign error and never uploads', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'File is too large. The limit for image is 10MB.' },
        400
      )
    );

    await expect(uploadReviewMedia('review-1', makeFile())).rejects.toThrow(
      'File is too large. The limit for image is 10MB.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed R2 PUT and never completes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(presignPayload))
      .mockResolvedValueOnce(jsonResponse({}, 403));

    await expect(uploadReviewMedia('review-1', makeFile())).rejects.toThrow(
      /upload/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the complete error', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(presignPayload))
      .mockResolvedValueOnce(jsonResponse({}, 200))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'A review may have at most 5 photos or videos.' },
          409
        )
      );

    await expect(uploadReviewMedia('review-1', makeFile())).rejects.toThrow(
      'A review may have at most 5 photos or videos.'
    );
  });
});

// ============================================================================
// Query keys
// ============================================================================

describe('reviewKeys', () => {
  it('is stable for the same input', () => {
    expect(reviewKeys.mediaFeed('product-1')).toEqual(
      reviewKeys.mediaFeed('product-1')
    );
    expect(reviewKeys.feed(2, 20)).toEqual(reviewKeys.feed(2, 20));
  });

  it('distinguishes products, pages and page sizes', () => {
    expect(reviewKeys.mediaFeed('product-1')).not.toEqual(
      reviewKeys.mediaFeed('product-2')
    );
    expect(reviewKeys.mediaFeed()).not.toEqual(reviewKeys.mediaFeed('product-1'));
    expect(reviewKeys.feed(1, 20)).not.toEqual(reviewKeys.feed(2, 20));
    expect(reviewKeys.feed(1, 20)).not.toEqual(reviewKeys.feed(1, 10));
  });

  it('keeps the feed and media keys distinct but under the shared root', () => {
    expect(reviewKeys.feed(1, 20)).not.toEqual(reviewKeys.mediaFeed());
    expect(reviewKeys.feed(1, 20).slice(0, 1)).toEqual([...reviewKeys.all]);
    expect(reviewKeys.mediaFeed().slice(0, 1)).toEqual([...reviewKeys.all]);
    // Prefix keys — what invalidation targets.
    expect(reviewKeys.feed(1, 20).slice(0, 2)).toEqual([...reviewKeys.feeds()]);
    expect(reviewKeys.mediaFeed('product-1').slice(0, 2)).toEqual([
      ...reviewKeys.mediaFeeds(),
    ]);
  });
});

// ============================================================================
// Hooks
// ============================================================================

describe('useReviewFeed', () => {
  it('returns items and total from the payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockFeedResponse));
    const queryClient = createQueryClient();

    const { result } = renderHook(() => useReviewFeed(1), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.total).toBe(37);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/api/reviews?page=1&pageSize=20`
    );
  });

  it('honours an explicit page size', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockFeedResponse));
    const queryClient = createQueryClient();

    const { result } = renderHook(() => useReviewFeed(3, 6), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/api/reviews?page=3&pageSize=6`
    );
  });
});

describe('useReviewMediaFeed', () => {
  it('returns the tiles for a product', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [mockMediaFeedItem], total: 1 })
    );
    const queryClient = createQueryClient();

    const { result } = renderHook(() => useReviewMediaFeed('product-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe('media-1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/api/reviews/media?productId=product-1`
    );
  });
});

describe('useCreateReview', () => {
  it('invalidates the site-wide feed keys as well as the product ones', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'review-2' }, 201));
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateReview('product-1'), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({ rating: 5, content: 'Ten words of content here ok' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidated = invalidate.mock.calls.map(([args]) =>
      JSON.stringify(args?.queryKey)
    );

    expect(invalidated).toContain(JSON.stringify(reviewKeys.lists()));
    expect(invalidated).toContain(JSON.stringify(reviewKeys.stats('product-1')));
    expect(invalidated).toContain(JSON.stringify(reviewKeys.feeds()));
    expect(invalidated).toContain(JSON.stringify(reviewKeys.mediaFeeds()));
  });
});
