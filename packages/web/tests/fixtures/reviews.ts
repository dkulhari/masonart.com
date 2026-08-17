/**
 * Review cards as `useReviewCards` hands them to the grid.
 *
 * Three shapes, because the rule both suites pin is that all three land on the
 * same surface: a review with a photo, a review with a clip, and a review with
 * nothing attached are one card each, not a media wall plus a written list.
 *
 * @see packages/web/tests/components/reviews/ReviewGrid.test.tsx
 * @see packages/web/tests/routes/posters-review-section.test.tsx
 */

import type { ReviewCardData } from '~/components/reviews/ReviewGridCard'

export const PRODUCT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

export function makeReview(
  id: string,
  overrides: Partial<ReviewCardData> = {}
): ReviewCardData {
  return {
    id,
    rating: 5,
    title: null,
    content: `Body of ${id}`,
    createdAt: '2026-08-04T09:30:00.000Z',
    author: { id: `user-${id}`, name: `Author ${id}` },
    verified: true,
    itemType: {
      sizeLabel: '24"Hx 20"W/ 61x 51 CM',
      frameName: 'Stretch+Black Frame',
      frameType: 'stretched',
    },
    product: {
      id: 'prod-1',
      title: 'Kyoto Rain',
      slug: 'kyoto-rain',
      sku: 'KR001',
      imageUrl: 'https://cdn.test/kyoto.webp',
    },
    media: [],
    ...overrides,
  }
}

/** A review with a photo — used to live on the media wall. */
export const WITH_PHOTO = makeReview('rev-photo', {
  media: [
    {
      id: 'media-photo',
      reviewId: 'rev-photo',
      mediaType: 'image',
      url: 'https://cdn.test/photo.jpg',
      thumbnailUrl: 'https://cdn.test/photo-thumb.jpg',
      posterUrl: null,
      durationSeconds: null,
      width: 800,
      height: 1000,
      sortOrder: 0,
    },
  ],
})

/** A clip — same surface as the photo and the prose, not a third one. */
export const WITH_CLIP = makeReview('rev-clip', {
  media: [
    {
      id: 'media-clip',
      reviewId: 'rev-clip',
      mediaType: 'video',
      url: 'https://cdn.test/clip.mp4',
      thumbnailUrl: null,
      posterUrl: 'https://cdn.test/clip-poster.jpg',
      durationSeconds: 12,
      width: 1080,
      height: 1920,
      sortOrder: 0,
    },
  ],
})

/** A review with no attachment — used to live in the written list below. */
export const WITHOUT_MEDIA = makeReview('rev-text')

/** One page of cards, in the envelope `useReviewCards` returns. */
export function cardsPage(
  items: ReviewCardData[],
  overrides: Record<string, unknown> = {}
) {
  return {
    data: {
      items,
      total: items.length,
      page: 1,
      pageSize: 24,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...overrides,
    },
    isLoading: false,
    isError: false,
  }
}
