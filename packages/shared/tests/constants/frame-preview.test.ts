/**
 * The figures the admin frame form quotes against, and the upload guards the
 * frames endpoint shares with the products one.
 *
 * The reference prices are shared rather than inlined in the form because the
 * preview and this test both need them: a preview whose sample prices drift
 * from its test is a preview that asserts nothing.
 */

import { describe, it, expect } from 'bun:test'
import {
  FRAME_PREVIEW_REFERENCE_PRICES,
  ADMIN_IMAGE_MIME_TYPES,
  MAX_ADMIN_IMAGE_MB,
  frameAddition,
} from '../../src/index'

describe('FRAME_PREVIEW_REFERENCE_PRICES', () => {
  it('spans small to large, because a multiplier behaves differently across them', () => {
    expect(FRAME_PREVIEW_REFERENCE_PRICES).toEqual([1499, 4999, 14999])
  })

  it('is more than one price — one sample would hide what a multiplier does', () => {
    expect(FRAME_PREVIEW_REFERENCE_PRICES.length).toBeGreaterThan(1)
  })

  it('produces a visibly different uplift at each rung', () => {
    const frame = { priceModifier: '1.40', priceAddition: '0.00' }
    const uplifts = FRAME_PREVIEW_REFERENCE_PRICES.map((p) =>
      frameAddition(p, frame)
    )
    expect(new Set(uplifts).size).toBe(uplifts.length)
  })

  it('is ordered, so the form renders small to large without sorting', () => {
    const sorted = [...FRAME_PREVIEW_REFERENCE_PRICES].sort((a, b) => a - b)
    expect(FRAME_PREVIEW_REFERENCE_PRICES).toEqual(sorted)
  })
})

describe('admin image upload guards', () => {
  it('allows the three formats the product uploader already allows', () => {
    expect(ADMIN_IMAGE_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
  })

  it('keeps the existing 10MB ceiling', () => {
    expect(MAX_ADMIN_IMAGE_MB).toBe(10)
  })
})
