/**
 * Pending-row crop control tests (#369)
 *
 * Photographic types get a square pan/zoom crop viewport; `main` is matted
 * and never cropped, so it shows a matted preview instead.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImageCropControl } from '~/components/admin/ImageCropControl'

const noop = vi.fn()

describe('ImageCropControl', () => {
  it('shows a square crop viewport for photographic types', () => {
    render(
      <ImageCropControl
        type="room-mockup"
        imageUrl="blob:mock"
        crop={undefined}
        onCropChange={noop}
      />
    )
    expect(screen.getByTestId('crop-viewport')).toBeInTheDocument()
    expect(screen.queryByTestId('matted-preview')).not.toBeInTheDocument()
  })

  it('shows a zoom slider for photographic types', () => {
    render(
      <ImageCropControl
        type="detail"
        imageUrl="blob:mock"
        crop={undefined}
        onCropChange={noop}
      />
    )
    expect(screen.getByLabelText(/zoom/i)).toBeInTheDocument()
  })

  it('shows a matted preview and no crop control for type main', () => {
    render(
      <ImageCropControl
        type="main"
        imageUrl="blob:mock"
        crop={undefined}
        onCropChange={noop}
      />
    )
    expect(screen.getByTestId('matted-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('crop-viewport')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/zoom/i)).not.toBeInTheDocument()
  })
})
