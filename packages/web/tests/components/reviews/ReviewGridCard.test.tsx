/**
 * The fused review card — one card holds the media AND the words.
 *
 * mesonart's Loox wall has no media-only tile and no separate written list:
 * every review is the same card, and a review without a photo is that card
 * with the media slot omitted. These tests exist to keep that fusion, because
 * the previous attempt split it in two.
 *
 * Card anatomy, top to bottom (docs/design/mesonart/mesonart-reviews-page-loox.png):
 *
 *   media slot → author + Verified → date → stars → body → "Item type:" →
 *   product chip
 *
 * Two rules here are load-bearing rather than cosmetic:
 *
 *  - The media slot reserves its aspect ratio BEFORE the image decodes. A
 *    slot that sizes itself to the decoded image reflows every card below it
 *    in the same masonry column as the photos land.
 *  - A video tile costs one poster frame: `preload="none"`, a poster, never
 *    `autoPlay`. Carried over from #488's media wall — the assertion moves
 *    with the component, it does not retire with it.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import {
  ReviewGridCard,
  composeItemType,
  type ReviewCardData,
} from '~/components/reviews/ReviewGridCard'

// ============================================================================
// Fixtures
// ============================================================================

const PHOTO = {
  id: 'media-photo',
  reviewId: 'rev-1',
  mediaType: 'image' as const,
  url: 'https://cdn.test/photo.jpg',
  thumbnailUrl: 'https://cdn.test/photo-thumb.jpg',
  posterUrl: null,
  durationSeconds: null,
  width: 800,
  height: 1000,
  sortOrder: 0,
}

const SECOND_PHOTO = { ...PHOTO, id: 'media-photo-2', sortOrder: 1 }
const THIRD_PHOTO = { ...PHOTO, id: 'media-photo-3', sortOrder: 2 }

const CLIP = {
  id: 'media-clip',
  reviewId: 'rev-1',
  mediaType: 'video' as const,
  url: 'https://cdn.test/clip.mp4',
  thumbnailUrl: null,
  posterUrl: 'https://cdn.test/clip-poster.jpg',
  durationSeconds: 12,
  width: 1080,
  height: 1920,
  sortOrder: 0,
}

function makeReview(overrides: Partial<ReviewCardData> = {}): ReviewCardData {
  return {
    id: 'rev-1',
    rating: 5,
    title: null,
    content: 'Very good, I am happy with my purchase — the transaction was handled professionally.',
    createdAt: '2026-08-04T09:30:00.000Z',
    author: { id: 'user-1', name: 'Marc H.' },
    verified: true,
    itemType: {
      sizeLabel: '40"Hx 30"W/ 102 x 76 CM',
      frameName: 'Stretch+Black Frame',
      frameType: 'stretched',
    },
    product: {
      id: 'prod-1',
      title: 'Contemporary Minimalist Art',
      slug: 'contemporary-minimalist-art',
      sku: 'MA089',
      imageUrl: 'https://cdn.test/ma089.webp',
    },
    media: [PHOTO],
    ...overrides,
  }
}

/** The product chip renders a <Link>, so the card needs a router around it. */
function renderCard(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> })
  const productRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posters/$slug',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([productRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // The provider mounts asynchronously, so assertions below are `findBy*`.
  return render(<RouterProvider router={router} />)
}

// ============================================================================
// One card, media and text fused
// ============================================================================

describe('ReviewGridCard — media and text in one card', () => {
  it('renders the media, the author, the badge, the date, the stars, the body, the item type and the product chip', async () => {
    renderCard(<ReviewGridCard review={makeReview()} />)

    const card = await screen.findByTestId('review-grid-card')

    // Media slot
    expect(within(card).getByTestId('review-card-media')).toBeTruthy()
    expect(
      within(card).getByTestId('review-card-photo').getAttribute('src')
    ).toBe(PHOTO.thumbnailUrl)

    // Author + Verified
    expect(within(card).getByTestId('review-card-author').textContent).toContain(
      'Marc H.'
    )
    expect(within(card).getByTestId('review-card-verified')).toBeTruthy()

    // Date
    expect(
      within(card).getByTestId('review-card-date').getAttribute('datetime')
    ).toBe('2026-08-04T09:30:00.000Z')

    // Stars
    expect(within(card).getByTestId('review-card-stars')).toBeTruthy()

    // Body
    expect(within(card).getByTestId('review-card-body').textContent).toContain(
      'Very good, I am happy with my purchase'
    )

    // Item type
    const itemType = within(card).getByTestId('review-card-item-type')
    expect(itemType.textContent).toContain('Item type:')
    expect(itemType.textContent).toContain('40"Hx 30"W/ 102 x 76 CM')
    expect(itemType.textContent).toContain('Stretch+Black Frame')

    // Product chip
    const chip = within(card).getByTestId('review-card-product')
    expect(chip.textContent).toContain('Contemporary Minimalist Art')
    expect(chip.textContent).toContain('#MA089')
    expect(chip.getAttribute('href')).toContain('contemporary-minimalist-art')
  })

  it('renders a review with no media as the same card with the media slot omitted', async () => {
    renderCard(<ReviewGridCard review={makeReview({ media: [] })} />)

    const card = await screen.findByTestId('review-grid-card')

    // The whole point of the rebuild: this is not a different component.
    expect(within(card).queryByTestId('review-card-media')).toBeNull()
    expect(within(card).getByTestId('review-card-author').textContent).toContain(
      'Marc H.'
    )
    expect(within(card).getByTestId('review-card-body')).toBeTruthy()
    expect(within(card).getByTestId('review-card-product')).toBeTruthy()
  })
})

// ============================================================================
// Media slot
// ============================================================================

describe('ReviewGridCard — media slot', () => {
  it('reserves the media aspect ratio before the image decodes', async () => {
    renderCard(<ReviewGridCard review={makeReview()} />)

    const slot = await screen.findByTestId('review-card-media')

    // Reserved from the stored dimensions, so the column does not reflow when
    // the bytes land.
    expect(slot.style.aspectRatio).toBe('800 / 1000')
  })

  it('falls back to a fixed ratio when the media carries no dimensions', async () => {
    renderCard(
      <ReviewGridCard
        review={makeReview({ media: [{ ...PHOTO, width: null, height: null }] })}
      />
    )

    const slot = await screen.findByTestId('review-card-media')

    // Still a reserved box — an unmeasured photo must not collapse the slot.
    expect(slot.style.aspectRatio).toBeTruthy()
  })

  it('badges the extra attachments as +N', async () => {
    renderCard(
      <ReviewGridCard
        review={makeReview({ media: [PHOTO, SECOND_PHOTO, THIRD_PHOTO] })}
      />
    )

    const badge = await screen.findByTestId('review-card-media-count')
    expect(badge.textContent).toBe('+2')
  })

  it('shows no +N badge on a single attachment', async () => {
    renderCard(<ReviewGridCard review={makeReview()} />)

    await screen.findByTestId('review-grid-card')
    expect(screen.queryByTestId('review-card-media-count')).toBeNull()
  })

  it('never autoplays a clip and never preloads its bytes', async () => {
    // Carried over from #488. A masonry page can hold dozens of cards; clips
    // that preload themselves are tens of megabytes before anyone has asked
    // for a single one.
    renderCard(<ReviewGridCard review={makeReview({ media: [CLIP] })} />)

    const video = await screen.findByTestId('review-card-video')

    expect(video.getAttribute('autoplay')).toBeNull()
    expect((video as HTMLVideoElement).autoplay).toBe(false)
    expect(video.getAttribute('preload')).toBe('none')
    expect(video.getAttribute('poster')).toBe(CLIP.posterUrl)
  })

  it('overlays a play control on a clip and not on a photo', async () => {
    const { unmount } = renderCard(
      <ReviewGridCard review={makeReview({ media: [CLIP] })} />
    )
    expect(await screen.findByTestId('review-card-play')).toBeTruthy()
    unmount()

    renderCard(<ReviewGridCard review={makeReview()} />)
    await screen.findByTestId('review-card-photo')
    expect(screen.queryByTestId('review-card-play')).toBeNull()
  })

  it('hands the clicked attachment index back to the caller', async () => {
    const onOpenMedia = vi.fn()
    const review = makeReview({ media: [PHOTO, SECOND_PHOTO] })

    renderCard(<ReviewGridCard review={review} onOpenMedia={onOpenMedia} />)

    fireEvent.click(await screen.findByTestId('review-card-media-trigger'))

    expect(onOpenMedia).toHaveBeenCalledWith(review, 0)
  })
})

// ============================================================================
// Item type and Verified
// ============================================================================

describe('ReviewGridCard — item type and verification', () => {
  it('drops the item type line when the purchase snapshot is gone', async () => {
    renderCard(<ReviewGridCard review={makeReview({ itemType: null })} />)

    await screen.findByTestId('review-grid-card')
    expect(screen.queryByTestId('review-card-item-type')).toBeNull()
  })

  it('drops the Verified badge when the review is not verified', async () => {
    renderCard(<ReviewGridCard review={makeReview({ verified: false })} />)

    await screen.findByTestId('review-grid-card')
    expect(screen.queryByTestId('review-card-verified')).toBeNull()
  })

  it('drops the product chip when the review has no product to point at', async () => {
    renderCard(<ReviewGridCard review={makeReview({ product: null })} />)

    await screen.findByTestId('review-grid-card')
    expect(screen.queryByTestId('review-card-product')).toBeNull()
  })

  it('names an author-less review rather than leaving the line blank', async () => {
    renderCard(<ReviewGridCard review={makeReview({ author: null })} />)

    // The review outlives a deleted account.
    const author = await screen.findByTestId('review-card-author')
    expect(author.textContent?.trim().length).toBeGreaterThan(0)
  })
})

// ============================================================================
// composeItemType
// ============================================================================

describe('composeItemType', () => {
  it('joins the size and the frame the card shows them in', () => {
    expect(
      composeItemType({
        sizeLabel: '24"Hx 20"W/ 61x 51 CM',
        frameName: 'Stretch+Black Frame',
        frameType: 'stretched',
      })
    ).toBe('24"Hx 20"W/ 61x 51 CM / Stretch+Black Frame')
  })

  it('prints the size alone when nothing framed the piece', () => {
    expect(
      composeItemType({
        sizeLabel: '36"Hx 24"W/ 91 x 61 CM',
        frameName: null,
        frameType: null,
      })
    ).toBe('36"Hx 24"W/ 91 x 61 CM')
  })

  it('falls back to the frame type when the frame has no name', () => {
    expect(
      composeItemType({
        sizeLabel: '24"Hx 20"W/ 61x 51 CM',
        frameName: null,
        frameType: 'Frameless',
      })
    ).toBe('24"Hx 20"W/ 61x 51 CM / Frameless')
  })

  it('is null when there is nothing to say', () => {
    expect(
      composeItemType({ sizeLabel: null, frameName: null, frameType: null })
    ).toBeNull()
    expect(composeItemType(null)).toBeNull()
  })
})
