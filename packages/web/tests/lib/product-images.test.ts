/**
 * product-images helper tests (#368)
 *
 * Pure logic behind the admin media rows: type exclusivity (exactly one
 * `main`), drag reordering with contiguous sortOrder, and the low-resolution
 * source warning threshold.
 */

import { describe, it, expect } from 'vitest'
import {
  MIN_SOURCE_LONG_EDGE,
  PRODUCT_IMAGE_TYPE_OPTIONS,
  isLowResSource,
  reorderImages,
  applyImageType,
  renumberImages,
} from '~/lib/product-images'

const img = (id: string, type: string, sortOrder: number) => ({
  id,
  type: type as never,
  sortOrder,
})

describe('PRODUCT_IMAGE_TYPE_OPTIONS', () => {
  it('offers exactly the five contract types from the ticket', () => {
    expect(PRODUCT_IMAGE_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      'main',
      'room-mockup',
      'detail',
      'texture',
      'frame-preview',
    ])
  })
})

describe('isLowResSource', () => {
  it('warns when the long edge is under 1200px', () => {
    expect(isLowResSource(1199, 800)).toBe(true)
    expect(isLowResSource(800, 1199)).toBe(true)
  })

  it('does not warn at or above 1200px on the long edge', () => {
    expect(isLowResSource(1200, 600)).toBe(false)
    expect(isLowResSource(600, 1200)).toBe(false)
    expect(isLowResSource(3000, 2000)).toBe(false)
  })

  it('exposes the threshold constant', () => {
    expect(MIN_SOURCE_LONG_EDGE).toBe(1200)
  })
})

describe('reorderImages', () => {
  it('moves an item and renumbers sortOrder contiguously from 0', () => {
    const images = [img('a', 'main', 0), img('b', 'detail', 1), img('c', 'texture', 2)]
    const result = reorderImages(images, 2, 0)
    expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b'])
    expect(result.map((i) => i.sortOrder)).toEqual([0, 1, 2])
  })

  it('moves an item forward', () => {
    const images = [img('a', 'main', 0), img('b', 'detail', 1), img('c', 'texture', 2)]
    const result = reorderImages(images, 0, 2)
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a'])
    expect(result.map((i) => i.sortOrder)).toEqual([0, 1, 2])
  })

  it('renumbers contiguously even when input sortOrders had gaps', () => {
    const images = [img('a', 'main', 0), img('b', 'detail', 5), img('c', 'texture', 9)]
    const result = reorderImages(images, 1, 2)
    expect(result.map((i) => i.sortOrder)).toEqual([0, 1, 2])
  })

  it('is a no-op returning renumbered copy for equal indices', () => {
    const images = [img('a', 'main', 3), img('b', 'detail', 7)]
    const result = reorderImages(images, 1, 1)
    expect(result.map((i) => i.id)).toEqual(['a', 'b'])
    expect(result.map((i) => i.sortOrder)).toEqual([0, 1])
  })

  it('does not mutate the input array', () => {
    const images = [img('a', 'main', 0), img('b', 'detail', 1)]
    reorderImages(images, 0, 1)
    expect(images.map((i) => i.id)).toEqual(['a', 'b'])
    expect(images[0].sortOrder).toBe(0)
  })
})

describe('applyImageType', () => {
  it('selecting main on a second row demotes the previous main to detail', () => {
    const images = [img('a', 'main', 0), img('b', 'room-mockup', 1)]
    const result = applyImageType(images, 'b', 'main')
    expect(result.find((i) => i.id === 'a')?.type).toBe('detail')
    expect(result.find((i) => i.id === 'b')?.type).toBe('main')
    expect(result.filter((i) => i.type === 'main')).toHaveLength(1)
  })

  it('changing to a non-main type leaves other rows untouched', () => {
    const images = [img('a', 'main', 0), img('b', 'detail', 1)]
    const result = applyImageType(images, 'b', 'texture')
    expect(result.find((i) => i.id === 'a')?.type).toBe('main')
    expect(result.find((i) => i.id === 'b')?.type).toBe('texture')
  })

  it('keeps main when re-selecting main on the current main row', () => {
    const images = [img('a', 'main', 0), img('b', 'detail', 1)]
    const result = applyImageType(images, 'a', 'main')
    expect(result.find((i) => i.id === 'a')?.type).toBe('main')
    expect(result.filter((i) => i.type === 'main')).toHaveLength(1)
  })
})

describe('renumberImages', () => {
  it('rewrites sortOrder to array position', () => {
    const images = [img('a', 'main', 4), img('b', 'detail', 2)]
    expect(renumberImages(images).map((i) => i.sortOrder)).toEqual([0, 1])
  })
})
