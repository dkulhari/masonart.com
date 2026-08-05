/**
 * The shared review media viewer.
 *
 * These assertions used to live in `ReviewMediaWall.test.tsx` — they were
 * written against the PDP media wall, but every one of them is about the
 * lightbox, which the wall only mounted. Retiring the wall (#498) would have
 * dropped the focus trap, the Escape handler, the arrow keys and the
 * "not a native <dialog>" rule from the suite entirely while the component
 * itself carried on being rendered by the masonry grid. They live here now,
 * against the component that actually owns the behaviour.
 *
 * The `preload="none"` rule is asserted in three places on purpose — here, in
 * ReviewGridCard's tests, and it was in the wall's. Opening the viewer is not
 * the same as pressing play, and arrowing through a wall would otherwise fetch
 * every clip it passed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'

import { ReviewMediaLightbox } from '~/components/reviews/ReviewMediaLightbox'

// ============================================================================
// Fixtures
// ============================================================================

const PHOTO = {
  id: 'media-photo',
  mediaType: 'image' as const,
  url: 'https://cdn.test/photo.jpg',
  thumbnailUrl: 'https://cdn.test/photo-thumb.jpg',
  posterUrl: null,
}

const CLIP = {
  id: 'media-clip',
  mediaType: 'video' as const,
  url: 'https://cdn.test/clip.mp4',
  thumbnailUrl: null,
  posterUrl: 'https://cdn.test/clip-poster.jpg',
}

const CAPTION = {
  id: 'review-photo',
  title: 'Looks unreal above the sofa',
  content: 'The paper is heavier than I expected and the colours are exact.',
  author: { name: 'Asha' },
  createdAt: '2026-07-01T10:00:00.000Z',
}

const onPrev = vi.fn()
const onNext = vi.fn()
const onClose = vi.fn()

function renderLightbox(overrides: Record<string, unknown> = {}) {
  return render(
    <ReviewMediaLightbox
      item={PHOTO}
      rating={5}
      caption={CAPTION}
      fallbackDate={CAPTION.createdAt}
      position={1}
      total={2}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      {...overrides}
    />
  )
}

beforeEach(() => {
  onPrev.mockReset()
  onNext.mockReset()
  onClose.mockReset()
})

// ============================================================================
// Shape
// ============================================================================

describe('ReviewMediaLightbox — shape', () => {
  it('is a labelled modal dialog showing the media and its review', () => {
    renderLightbox()

    const lightbox = screen.getByTestId('review-media-lightbox')
    expect(lightbox.getAttribute('role')).toBe('dialog')
    expect(lightbox.getAttribute('aria-modal')).toBe('true')

    expect(
      within(lightbox).getByTestId('review-media-full').getAttribute('src')
    ).toBe(PHOTO.url)
    expect(lightbox.textContent).toContain('Looks unreal above the sofa')
    expect(lightbox.textContent).toContain(
      'The paper is heavier than I expected and the colours are exact.'
    )
    expect(lightbox.textContent).toContain('1 / 2')
  })

  it('does not use a native dialog element', () => {
    // A native <dialog> opened modally puts the page in the top layer and
    // blocks the automation harness the e2e suite drives, so the overlay is a
    // portal we control end to end.
    renderLightbox()

    expect(document.querySelector('dialog')).toBeNull()
  })

  it('never preloads a clip it has merely opened', () => {
    renderLightbox({ item: CLIP })

    const video = screen.getByTestId('review-media-video')
    expect(video.getAttribute('preload')).toBe('none')
    expect(video.getAttribute('autoplay')).toBeNull()
    expect((video as HTMLVideoElement).autoplay).toBe(false)
    expect(video.getAttribute('poster')).toBe(CLIP.posterUrl)
  })
})

// ============================================================================
// Focus
// ============================================================================

describe('ReviewMediaLightbox — focus', () => {
  it('moves focus into the overlay when it opens', () => {
    renderLightbox()

    const lightbox = screen.getByTestId('review-media-lightbox')
    expect(lightbox.contains(document.activeElement)).toBe(true)
  })

  it('keeps Tab inside the overlay', () => {
    renderLightbox()

    const lightbox = screen.getByTestId('review-media-lightbox')
    const focusable = Array.from(
      lightbox.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])'
      )
    )
    expect(focusable.length).toBeGreaterThan(1)

    focusable[focusable.length - 1]!.focus()
    fireEvent.keyDown(lightbox, { key: 'Tab' })
    expect(document.activeElement).toBe(focusable[0])

    fireEvent.keyDown(lightbox, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(focusable[focusable.length - 1])
  })
})

// ============================================================================
// Keys
// ============================================================================

describe('ReviewMediaLightbox — keys', () => {
  it('walks the wall with the arrow keys without closing', () => {
    renderLightbox()

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    renderLightbox()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on the labelled close button', () => {
    renderLightbox()

    fireEvent.click(screen.getByRole('button', { name: /Close viewer/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
