/**
 * Review media in the admin moderation queue (#490).
 *
 * The moderation queue is the one surface that sees media at EVERY
 * `processingStatus`. The public surfaces filter to `ready` because a
 * half-transcoded tile looks like a broken store; here the opposite is true —
 * a transcode that has been stuck for hours, or one that failed outright, has
 * to be visible to the person deciding whether the review is publishable.
 *
 * Four failures this pins down:
 *
 * 1. **Media is invisible.** An admin cannot moderate a photo they never see,
 *    so an approved review can ship an attachment nobody looked at.
 * 2. **A stuck or failed transcode is silent.** `processing` must read as
 *    pending work (and must NOT offer a play control for a file that has no
 *    playable rendition yet); `failed` must show its `processingError`.
 * 3. **Deleting uses `window.confirm`.** The native dialog blocks the browser
 *    automation harness entirely — the affordance has to be inline DOM.
 * 4. **Deleting an attachment moderates the review.** Removing one photo must
 *    not PATCH the parent review; its pending/approved state is untouched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ReviewMediaStrip,
  type AdminReviewMedia,
} from '~/routes/admin/reviews'

const src = readFileSync(
  join(process.cwd(), 'app/routes/admin/reviews.tsx'),
  'utf8'
)

// ---------------------------------------------------------------------------
// Fixtures — shaped exactly like the admin payload from #483
// ---------------------------------------------------------------------------

const REVIEW_ID = '11111111-1111-4111-8111-111111111111'

function media(overrides: Partial<AdminReviewMedia> = {}): AdminReviewMedia {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    reviewId: REVIEW_ID,
    mediaType: 'image',
    url: 'https://cdn.test/reviews/photo.webp',
    thumbnailUrl: 'https://cdn.test/reviews/photo-thumb.webp',
    posterUrl: null,
    durationSeconds: null,
    width: 1200,
    height: 900,
    sizeBytes: 240_000,
    sortOrder: 0,
    processingStatus: 'ready',
    processingError: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

const readyPhoto = media({ id: 'media-ready-photo', sortOrder: 0 })

const readyVideo = media({
  id: 'media-ready-video',
  mediaType: 'video',
  url: 'https://cdn.test/reviews/clip.mp4',
  thumbnailUrl: 'https://cdn.test/reviews/clip-thumb.webp',
  posterUrl: 'https://cdn.test/reviews/clip-poster.webp',
  durationSeconds: 12,
  sortOrder: 1,
})

const processingVideo = media({
  id: 'media-processing',
  mediaType: 'video',
  url: 'https://cdn.test/reviews/pending.mp4',
  thumbnailUrl: null,
  posterUrl: null,
  processingStatus: 'processing',
  sortOrder: 2,
})

const failedVideo = media({
  id: 'media-failed',
  mediaType: 'video',
  url: 'https://cdn.test/reviews/broken.mov',
  thumbnailUrl: null,
  posterUrl: null,
  processingStatus: 'failed',
  processingError: 'ffmpeg exited with code 1: moov atom not found',
  sortOrder: 3,
})

const allMedia = [readyPhoto, readyVideo, processingVideo, failedVideo]

// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>
let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  })
  vi.stubGlobal('fetch', fetchMock)

  // A native dialog would hang the automation harness, so the assertion is
  // not "it was answered" but "it was never opened".
  confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => {
    throw new Error('window.confirm must not be used for review media deletion')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  confirmSpy.mockRestore()
  vi.restoreAllMocks()
})

const items = () => screen.getAllByTestId(/^review-media-item-/)
const itemFor = (id: string) =>
  screen.getByTestId('review-media-item-' + id)

describe('rendering a review’s attachments', () => {
  it('renders one tile per attachment', () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={allMedia} />)
    expect(items()).toHaveLength(4)
  })

  it('renders nothing at all when a review has no media', () => {
    const { container } = render(
      <ReviewMediaStrip reviewId={REVIEW_ID} media={[]} />
    )
    // An empty strip on every text-only review would be pure noise in a table.
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a ready photo as a thumbnail', () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[readyPhoto]} />)
    const img = within(itemFor(readyPhoto.id)).getByRole('img')
    expect(img).toHaveAttribute('src', readyPhoto.thumbnailUrl)
  })

  it('falls back to the full-size url when a photo has no thumbnail', () => {
    const noThumb = media({ id: 'media-no-thumb', thumbnailUrl: null })
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[noThumb]} />)
    expect(within(itemFor(noThumb.id)).getByRole('img')).toHaveAttribute(
      'src',
      noThumb.url
    )
  })

  it('gives a ready video a playable control with its poster', () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[readyVideo]} />)
    const player = within(itemFor(readyVideo.id)).getByTestId(
      'review-media-player'
    )
    expect(player.tagName).toBe('VIDEO')
    expect(player).toHaveAttribute('controls')
    expect(player).toHaveAttribute('src', readyVideo.url)
    expect(player).toHaveAttribute('poster', readyVideo.posterUrl)
  })

  it('labels each tile with its processing status', () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={allMedia} />)
    expect(itemFor(readyPhoto.id)).toHaveAttribute(
      'data-processing-status',
      'ready'
    )
    expect(itemFor(processingVideo.id)).toHaveAttribute(
      'data-processing-status',
      'processing'
    )
    expect(itemFor(failedVideo.id)).toHaveAttribute(
      'data-processing-status',
      'failed'
    )
  })
})

describe('a transcode that has not finished', () => {
  it('shows a spinner for a processing attachment', () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[processingVideo]} />)
    const tile = itemFor(processingVideo.id)
    expect(within(tile).getByTestId('review-media-spinner')).toBeInTheDocument()
    expect(within(tile).getByText(/processing/i)).toBeInTheDocument()
  })

  it('offers no play control while processing', () => {
    // There is no playable rendition yet; a dead <video> reads as a bug.
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[processingVideo]} />)
    expect(
      within(itemFor(processingVideo.id)).queryByTestId('review-media-player')
    ).not.toBeInTheDocument()
  })
})

describe('a transcode that failed', () => {
  it('shows the processingError text verbatim', () => {
    // "Something went wrong" tells the admin nothing; the ffmpeg message is
    // the whole reason this field is carried to the client.
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[failedVideo]} />)
    expect(
      within(itemFor(failedVideo.id)).getByText(
        failedVideo.processingError as string
      )
    ).toBeInTheDocument()
  })

  it('offers no play control for a failed attachment', () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[failedVideo]} />)
    expect(
      within(itemFor(failedVideo.id)).queryByTestId('review-media-player')
    ).not.toBeInTheDocument()
  })

  it('still offers delete, since a failed upload is exactly what gets cleaned up', () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[failedVideo]} />)
    expect(
      within(itemFor(failedVideo.id)).getByTestId('review-media-delete')
    ).toBeInTheDocument()
  })
})

describe('deleting one attachment', () => {
  it('does not fire the request on the first click', () => {
    // Destructive and irreversible — it removes the R2 objects.
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[readyPhoto]} />)
    fireEvent.click(
      within(itemFor(readyPhoto.id)).getByTestId('review-media-delete')
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reveals an inline confirm affordance instead of a native dialog', () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[readyPhoto]} />)
    const tile = itemFor(readyPhoto.id)
    expect(
      within(tile).queryByTestId('review-media-confirm-delete')
    ).not.toBeInTheDocument()

    fireEvent.click(within(tile).getByTestId('review-media-delete'))

    expect(
      within(tile).getByTestId('review-media-confirm-delete')
    ).toBeInTheDocument()
    expect(
      within(tile).getByTestId('review-media-cancel-delete')
    ).toBeInTheDocument()
    // The spy throws if it is ever called — this asserts it never was.
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('backs out cleanly when the confirm is cancelled', async () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[readyPhoto]} />)
    const tile = itemFor(readyPhoto.id)
    fireEvent.click(within(tile).getByTestId('review-media-delete'))
    fireEvent.click(within(tile).getByTestId('review-media-cancel-delete'))

    expect(
      within(tile).queryByTestId('review-media-confirm-delete')
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(itemFor(readyPhoto.id)).toBeInTheDocument()
  })

  it('calls the per-media endpoint with DELETE and credentials on confirm', async () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[readyPhoto]} />)
    const tile = itemFor(readyPhoto.id)
    fireEvent.click(within(tile).getByTestId('review-media-delete'))
    fireEvent.click(within(tile).getByTestId('review-media-confirm-delete'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(
      `/api/admin/reviews/${REVIEW_ID}/media/${readyPhoto.id}`
    )
    expect(init.method).toBe('DELETE')
    expect(init.credentials).toBe('include')
  })

  it('removes only the deleted tile from the strip', async () => {
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={allMedia} />)
    fireEvent.click(
      within(itemFor(readyVideo.id)).getByTestId('review-media-delete')
    )
    fireEvent.click(
      within(itemFor(readyVideo.id)).getByTestId('review-media-confirm-delete')
    )

    await waitFor(() =>
      expect(
        screen.queryByTestId('review-media-item-' + readyVideo.id)
      ).not.toBeInTheDocument()
    )
    expect(items()).toHaveLength(3)
    expect(itemFor(readyPhoto.id)).toBeInTheDocument()
    expect(itemFor(processingVideo.id)).toBeInTheDocument()
    expect(itemFor(failedVideo.id)).toBeInTheDocument()
  })

  it('never touches the parent review, so its moderation status is unchanged', async () => {
    const onDeleted = vi.fn()
    render(
      <ReviewMediaStrip
        reviewId={REVIEW_ID}
        media={[readyPhoto]}
        onDeleted={onDeleted}
      />
    )
    const tile = itemFor(readyPhoto.id)
    fireEvent.click(within(tile).getByTestId('review-media-delete'))
    fireEvent.click(within(tile).getByTestId('review-media-confirm-delete'))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(readyPhoto.id))

    // Exactly one request, and it is the media DELETE. A PATCH to
    // /api/admin/reviews/:id — or a re-moderation refetch — would show here.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).not.toBe('PATCH')
    }
  })

  it('keeps the tile and surfaces an error when the endpoint rejects', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to delete review media' }),
    })
    render(<ReviewMediaStrip reviewId={REVIEW_ID} media={[readyPhoto]} />)
    const tile = itemFor(readyPhoto.id)
    fireEvent.click(within(tile).getByTestId('review-media-delete'))
    fireEvent.click(within(tile).getByTestId('review-media-confirm-delete'))

    await waitFor(() =>
      expect(
        within(itemFor(readyPhoto.id)).getByTestId('review-media-error')
      ).toBeInTheDocument()
    )
    // Optimistic removal would lie about an object that still exists in R2.
    expect(itemFor(readyPhoto.id)).toBeInTheDocument()
  })
})

describe('the moderation queue wires the strip in', () => {
  it('renders the strip for each review row', () => {
    expect(src).toContain('<ReviewMediaStrip')
  })

  it('carries media through on the review payload', () => {
    expect(src).toMatch(/media\??:\s*AdminReviewMedia\[\]/)
  })

  it('never uses window.confirm for media deletion', () => {
    // The page still confirms whole-review deletion the old way; what must not
    // appear is a native dialog anywhere in the media path.
    const start = src.indexOf('function ReviewMediaStrip')
    expect(start).toBeGreaterThan(-1)
    // Bound the slice to the component — the page below it still uses a native
    // confirm for whole-review deletion, which is not what this pins.
    const end = src.indexOf('\n// ====', start)
    expect(end).toBeGreaterThan(start)
    expect(src.slice(start, end)).not.toMatch(/\bconfirm\s*\(/)
  })
})
