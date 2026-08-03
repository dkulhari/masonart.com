/**
 * Crop helper tests (#369)
 *
 * react-easy-crop emits a percentage rect from onCropComplete; the contract
 * stores a normalised 0..1 rect. These helpers do the conversion and build the
 * upload multipart body, which carries `crop` only for photographic types
 * (`main` is matted, never cropped).
 */

import { describe, it, expect } from 'vitest'
import { percentAreaToCropRect, buildUploadFormData } from '~/lib/product-images'
import type { PendingUpload } from '~/components/admin/ProductForm'

describe('percentAreaToCropRect', () => {
  it('divides react-easy-crop percentages by 100', () => {
    expect(
      percentAreaToCropRect({ x: 25, y: 10, width: 50, height: 50 })
    ).toEqual({ x: 0.25, y: 0.1, w: 0.5, h: 0.5 })
  })

  it('clamps values into 0..1 against float drift', () => {
    const rect = percentAreaToCropRect({ x: -0.2, y: 100.4, width: 100.2, height: 50 })
    expect(rect.x).toBe(0)
    expect(rect.y).toBe(1)
    expect(rect.w).toBe(1)
    expect(rect.h).toBe(0.5)
  })
})

const pending = (overrides: Partial<PendingUpload>): PendingUpload => ({
  localId: 'p1',
  file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
  previewUrl: 'blob:mock',
  width: 2000,
  height: 1400,
  type: 'room-mockup',
  altText: 'a room',
  ...overrides,
})

describe('buildUploadFormData', () => {
  it('includes crop as JSON for photographic types', () => {
    const body = buildUploadFormData(
      pending({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } }),
      3
    )
    expect(body.get('type')).toBe('room-mockup')
    expect(body.get('altText')).toBe('a room')
    expect(body.get('sortOrder')).toBe('3')
    expect(JSON.parse(body.get('crop') as string)).toEqual({
      x: 0.1,
      y: 0.2,
      w: 0.5,
      h: 0.5,
    })
    expect(body.get('file')).toBeInstanceOf(File)
  })

  it('omits crop for type main even if one was set', () => {
    const body = buildUploadFormData(
      pending({ type: 'main', crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } }),
      0
    )
    expect(body.get('crop')).toBeNull()
  })

  it('omits crop when none was chosen (backend defaults to centred square)', () => {
    const body = buildUploadFormData(pending({}), 1)
    expect(body.get('crop')).toBeNull()
  })
})
