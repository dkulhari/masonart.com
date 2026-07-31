/**
 * zoneFor tests
 *
 * The hover-scrub zone map. Thresholds are pinned against values measured
 * directly on mesonart.com, so this test is also a record of the reference
 * behaviour we are reproducing.
 */

import { describe, it, expect } from 'vitest'
import { zoneFor, MEDIA_RATIO, SIZES_ATTR } from '~/components/product/productCardTokens'

/** Stub element with a known box. */
const el = (left = 0, width = 100) =>
  ({ getBoundingClientRect: () => ({ left, width }) }) as unknown as HTMLElement

describe('zoneFor — 4 media (measured on mesonart)', () => {
  it.each([
    [0.02, 1],
    [0.1, 1],
    [0.2, 1],
    [0.35, 2],
    [0.5, 2],
    [0.65, 2],
    [0.8, 3],
    [0.98, 3],
  ])('cursor at %sx width selects slide %i', (frac, expected) => {
    expect(zoneFor(frac * 100, el(), 4)).toBe(expected)
  })

  it('never selects slide 0 while hovering', () => {
    for (let f = 0; f <= 1; f += 0.01) {
      expect(zoneFor(f * 100, el(), 4)).toBeGreaterThanOrEqual(1)
    }
  })

  it('never exceeds the last slide index', () => {
    for (let f = 0; f <= 1; f += 0.01) {
      expect(zoneFor(f * 100, el(), 4)).toBeLessThanOrEqual(3)
    }
  })
})

describe('zoneFor — 3 media', () => {
  it.each([
    [0.2, 1],
    [0.49, 1],
    [0.51, 2],
    [0.9, 2],
  ])('cursor at %sx width selects slide %i', (frac, expected) => {
    expect(zoneFor(frac * 100, el(), 3)).toBe(expected)
  })
})

describe('zoneFor — 2 media', () => {
  it('always selects slide 1 regardless of position', () => {
    for (const f of [0.01, 0.25, 0.5, 0.75, 0.99]) {
      expect(zoneFor(f * 100, el(), 2)).toBe(1)
    }
  })
})

describe('zoneFor — generalisation past mesonart', () => {
  it('handles 5+ media, where mesonart silently does nothing', () => {
    expect(zoneFor(0.05 * 100, el(), 6)).toBe(1)
    expect(zoneFor(0.99 * 100, el(), 6)).toBe(5)
  })

  it('covers every slide index across the width for 6 media', () => {
    const seen = new Set<number>()
    for (let f = 0; f <= 1; f += 0.005) seen.add(zoneFor(f * 100, el(), 6))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('zoneFor — edge cases', () => {
  it('returns 0 for a single image (no hover behaviour)', () => {
    expect(zoneFor(50, el(), 1)).toBe(0)
  })

  it('returns 0 for an empty media list', () => {
    expect(zoneFor(50, el(), 0)).toBe(0)
  })

  it('respects a non-zero element offset', () => {
    expect(zoneFor(500 + 10, el(500, 100), 4)).toBe(1)
    expect(zoneFor(500 + 50, el(500, 100), 4)).toBe(2)
    expect(zoneFor(500 + 90, el(500, 100), 4)).toBe(3)
  })

  it('clamps a cursor outside the box', () => {
    expect(zoneFor(-50, el(), 4)).toBe(1)
    expect(zoneFor(9999, el(), 4)).toBe(3)
  })

  it('does not divide by zero on an unmeasured element', () => {
    expect(zoneFor(50, el(0, 0), 4)).toBe(1)
  })
})

describe('tokens', () => {
  it('MEDIA_RATIO is the square invariant', () => {
    expect(MEDIA_RATIO).toBe('aspect-square')
  })

  it('SIZES_ATTR is set, so images are not over-fetched at 100vw', () => {
    expect(SIZES_ATTR).toContain('25vw')
    expect(SIZES_ATTR).toContain('50vw')
  })
})
