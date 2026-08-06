/**
 * ShareRow tests (ticket #520)
 *
 * The share button in ProductDetail.tsx today has no onClick at all — these
 * tests pin real behaviour: Web Share API when present, copy-link plus
 * network intents always available regardless, and a "Need help?" link that
 * goes somewhere real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ShareRow } from '~/components/product/ShareRow'

const TITLE = 'Rainy Day Compassion'
const URL = 'https://chobii.art/posters/rainy-day-compassion'

function defineNavigatorProp(name: string, value: unknown) {
  Object.defineProperty(navigator, name, {
    value,
    configurable: true,
    writable: true,
  })
}

function deleteNavigatorProp(name: string) {
  // @ts-expect-error - test cleanup on a property we defined ourselves
  delete navigator[name]
}

beforeEach(() => {
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  deleteNavigatorProp('share')
  deleteNavigatorProp('clipboard')
})

describe('ShareRow', () => {
  it('renders the Share: label and Need help? link', () => {
    render(<ShareRow title={TITLE} url={URL} />)
    expect(screen.getByText('Share:')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Need help\?/ })).toBeTruthy()
  })

  it('points "Need help?" at the real contact route', () => {
    render(<ShareRow title={TITLE} url={URL} />)
    expect(screen.getByRole('link', { name: /Need help\?/ }).getAttribute('href')).toBe(
      '/contact'
    )
  })

  it('renders one glyph button per share affordance', () => {
    render(<ShareRow title={TITLE} url={URL} />)
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share on Facebook' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share on X' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share on LinkedIn' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
  })

  describe('the primary Share glyph', () => {
    it('uses the Web Share API when the browser has it', async () => {
      const share = vi.fn().mockResolvedValue(undefined)
      defineNavigatorProp('share', share)

      render(<ShareRow title={TITLE} url={URL} />)
      fireEvent.click(screen.getByRole('button', { name: 'Share' }))

      await waitFor(() => expect(share).toHaveBeenCalledWith({ title: TITLE, url: URL }))
    })

    it('falls back to copy-link when the browser has no Web Share API', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      defineNavigatorProp('clipboard', { writeText })

      render(<ShareRow title={TITLE} url={URL} />)
      fireEvent.click(screen.getByRole('button', { name: 'Share' }))

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL))
    })

    it('does not fall back to copy-link when the user just dismisses the native sheet', async () => {
      const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' })
      const share = vi.fn().mockRejectedValue(abortError)
      const writeText = vi.fn().mockResolvedValue(undefined)
      defineNavigatorProp('share', share)
      defineNavigatorProp('clipboard', { writeText })

      render(<ShareRow title={TITLE} url={URL} />)
      fireEvent.click(screen.getByRole('button', { name: 'Share' }))

      await waitFor(() => expect(share).toHaveBeenCalled())
      expect(writeText).not.toHaveBeenCalled()
    })
  })

  describe('copy link', () => {
    it('copies the share URL to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      defineNavigatorProp('clipboard', { writeText })

      render(<ShareRow title={TITLE} url={URL} />)
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL))
    })

    it('confirms the copy for screen readers', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      defineNavigatorProp('clipboard', { writeText })

      render(<ShareRow title={TITLE} url={URL} />)
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe('Link copied to clipboard')
      )
    })
  })

  describe('network intents', () => {
    it('opens the Facebook share intent with the URL encoded', () => {
      render(<ShareRow title={TITLE} url={URL} />)
      fireEvent.click(screen.getByRole('button', { name: 'Share on Facebook' }))

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(URL)}`),
        '_blank',
        expect.stringContaining('noopener')
      )
    })

    it('opens the X share intent with the URL and title encoded', () => {
      render(<ShareRow title={TITLE} url={URL} />)
      fireEvent.click(screen.getByRole('button', { name: 'Share on X' }))

      const [href] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
      expect(href).toContain('twitter.com/intent/tweet')
      expect(href).toContain(encodeURIComponent(URL))
      expect(href).toContain(encodeURIComponent(TITLE))
    })

    it('opens the LinkedIn share intent with the URL encoded', () => {
      render(<ShareRow title={TITLE} url={URL} />)
      fireEvent.click(screen.getByRole('button', { name: 'Share on LinkedIn' }))

      const [href] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
      expect(href).toContain('linkedin.com/sharing/share-offsite')
      expect(href).toContain(encodeURIComponent(URL))
    })
  })

  it('defaults the share URL to the current page when `url` is omitted', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    defineNavigatorProp('clipboard', { writeText })

    render(<ShareRow title={TITLE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href))
  })
})
