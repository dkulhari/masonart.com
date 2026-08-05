import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

/**
 * Both hooks are mocked at the module boundary so the wall can be tested
 * without a QueryClientProvider. `vi.hoisted` because vi.mock's factory is
 * lifted above the imports and cannot close over anything declared normally.
 */
const mediaFeedMock = vi.hoisted(() => vi.fn())
const reviewsMock = vi.hoisted(() => vi.fn())

vi.mock('~/hooks/useReviews', () => ({
  useReviewMediaFeed: (...args: unknown[]) => mediaFeedMock(...args),
  useReviews: (...args: unknown[]) => reviewsMock(...args),
}))

import { ReviewMediaWall } from '~/components/product/ReviewMediaWall'

const PRODUCT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

const PHOTO = {
  id: 'media-photo',
  reviewId: 'review-photo',
  mediaType: 'image' as const,
  url: 'https://cdn.test/photo.jpg',
  thumbnailUrl: 'https://cdn.test/photo-thumb.jpg',
  posterUrl: null,
  durationSeconds: null,
  width: 1200,
  height: 1200,
  sortOrder: 0,
  productId: PRODUCT_ID,
  rating: 5,
  reviewCreatedAt: '2026-07-01T10:00:00.000Z',
}

const CLIP = {
  id: 'media-clip',
  reviewId: 'review-clip',
  mediaType: 'video' as const,
  url: 'https://cdn.test/clip.mp4',
  thumbnailUrl: null,
  posterUrl: 'https://cdn.test/clip-poster.jpg',
  durationSeconds: 12,
  width: 1080,
  height: 1920,
  sortOrder: 0,
  productId: PRODUCT_ID,
  rating: 4,
  reviewCreatedAt: '2026-06-20T10:00:00.000Z',
}

const REVIEWS = [
  {
    id: 'review-photo',
    rating: 5,
    title: 'Looks unreal above the sofa',
    content: 'The paper is heavier than I expected and the colours are exact.',
    author: { id: 'u1', name: 'Asha' },
    createdAt: '2026-07-01T10:00:00.000Z',
  },
  {
    id: 'review-clip',
    rating: 4,
    title: 'Unboxing clip',
    content: 'Packaging held up through two flights of stairs.',
    author: { id: 'u2', name: 'Ravi' },
    createdAt: '2026-06-20T10:00:00.000Z',
  },
]

function setFeed(items: unknown[]) {
  mediaFeedMock.mockReturnValue({ data: items, isLoading: false, error: null })
}

beforeEach(() => {
  mediaFeedMock.mockReset()
  reviewsMock.mockReset()
  setFeed([PHOTO, CLIP])
  reviewsMock.mockReturnValue({
    data: { reviews: REVIEWS, total: REVIEWS.length },
    isLoading: false,
    error: null,
  })
})

describe('ReviewMediaWall', () => {
  it('renders one tile per media item for the product', () => {
    render(<ReviewMediaWall productId={PRODUCT_ID} />)

    expect(screen.getAllByTestId('review-media-tile')).toHaveLength(2)
    expect(mediaFeedMock).toHaveBeenCalledWith(PRODUCT_ID)
  })

  it('renders photos as images and clips as posters with a play badge', () => {
    render(<ReviewMediaWall productId={PRODUCT_ID} />)

    const [photoTile, clipTile] = screen.getAllByTestId('review-media-tile')

    const image = photoTile.querySelector('img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toBe(PHOTO.thumbnailUrl)
    expect(image?.getAttribute('loading')).toBe('lazy')
    expect(within(photoTile).queryByTestId('review-media-play-badge')).toBeNull()

    const video = within(clipTile).getByTestId('review-media-video')
    expect(video.getAttribute('poster')).toBe(CLIP.posterUrl)
    expect(within(clipTile).getByTestId('review-media-play-badge')).toBeTruthy()
    expect(clipTile.textContent).toContain('0:12')
  })

  it('never autoplays a tile and never preloads its bytes', () => {
    // A dozen clips that autoplay or preload turns a product page into tens of
    // megabytes on a phone. `preload="none"` plus a poster frame means a tile
    // costs one image until someone actually asks for the video.
    render(<ReviewMediaWall productId={PRODUCT_ID} />)

    fireEvent.click(screen.getAllByTestId('review-media-tile')[1])

    const videos = Array.from(document.querySelectorAll('video'))
    expect(videos.length).toBeGreaterThan(0)

    for (const video of videos) {
      expect(video.getAttribute('autoplay')).toBeNull()
      expect((video as HTMLVideoElement).autoplay).toBe(false)
      expect(video.getAttribute('preload')).toBe('none')
      expect(video.getAttribute('poster')).toBeTruthy()
    }
  })

  it('renders nothing at all when the feed is empty', () => {
    setFeed([])

    const { container } = render(<ReviewMediaWall productId={PRODUCT_ID} />)

    // Not "an empty grid under a heading" — no heading either.
    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByTestId('review-media-tile')).toBeNull()
  })

  it('renders nothing while the feed is still loading', () => {
    mediaFeedMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    const { container } = render(<ReviewMediaWall productId={PRODUCT_ID} />)

    expect(container.innerHTML).toBe('')
  })

  it('opens a lightbox on the clicked item showing its review', () => {
    render(<ReviewMediaWall productId={PRODUCT_ID} />)

    expect(screen.queryByTestId('review-media-lightbox')).toBeNull()

    fireEvent.click(screen.getAllByTestId('review-media-tile')[0])

    const lightbox = screen.getByTestId('review-media-lightbox')
    expect(lightbox.getAttribute('role')).toBe('dialog')
    expect(lightbox.getAttribute('aria-modal')).toBe('true')
    expect(within(lightbox).getByTestId('review-media-full').getAttribute('src')).toBe(
      PHOTO.url
    )
    expect(lightbox.textContent).toContain('Looks unreal above the sofa')
    expect(lightbox.textContent).toContain(
      'The paper is heavier than I expected and the colours are exact.'
    )
  })

  it('does not use a native dialog element', () => {
    // A native <dialog> opened modally blocks the automation harness the e2e
    // suite drives, so the lightbox is a portal we control end to end.
    render(<ReviewMediaWall productId={PRODUCT_ID} />)
    fireEvent.click(screen.getAllByTestId('review-media-tile')[0])

    expect(document.querySelector('dialog')).toBeNull()
  })

  it('moves focus into the lightbox when it opens', () => {
    render(<ReviewMediaWall productId={PRODUCT_ID} />)

    fireEvent.click(screen.getAllByTestId('review-media-tile')[0])

    const lightbox = screen.getByTestId('review-media-lightbox')
    expect(lightbox.contains(document.activeElement)).toBe(true)
  })

  it('advances and rewinds with the arrow keys', () => {
    render(<ReviewMediaWall productId={PRODUCT_ID} />)

    fireEvent.click(screen.getAllByTestId('review-media-tile')[0])

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    let lightbox = screen.getByTestId('review-media-lightbox')
    expect(within(lightbox).getByTestId('review-media-video')).toBeTruthy()
    expect(lightbox.textContent).toContain('Unboxing clip')

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    lightbox = screen.getByTestId('review-media-lightbox')
    expect(within(lightbox).getByTestId('review-media-full').getAttribute('src')).toBe(
      PHOTO.url
    )
  })

  it('closes on Escape and returns focus to the tile that opened it', () => {
    render(<ReviewMediaWall productId={PRODUCT_ID} />)

    const tile = screen.getAllByTestId('review-media-tile')[0]
    fireEvent.click(tile)
    expect(screen.getByTestId('review-media-lightbox')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('review-media-lightbox')).toBeNull()
    expect(document.activeElement).toBe(tile)
  })

  it('keeps Tab inside the lightbox', () => {
    render(<ReviewMediaWall productId={PRODUCT_ID} />)
    fireEvent.click(screen.getAllByTestId('review-media-tile')[0])

    const lightbox = screen.getByTestId('review-media-lightbox')
    const focusable = Array.from(
      lightbox.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
    )
    expect(focusable.length).toBeGreaterThan(1)

    focusable[focusable.length - 1].focus()
    fireEvent.keyDown(lightbox, { key: 'Tab' })
    expect(document.activeElement).toBe(focusable[0])

    fireEvent.keyDown(lightbox, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(focusable[focusable.length - 1])
  })
})
