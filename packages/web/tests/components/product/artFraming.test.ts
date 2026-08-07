/**
 * artFraming — equal ink area, capped by the plate's corner radius.
 *
 * The invariants are asserted rather than a table of expected strings: that
 * every piece the cap does not bind carries the SAME COVERAGE, that the cap is
 * the only thing that can break that and it breaks it in one direction only,
 * that two pieces of the same shape are identical, that nothing ever leaves the
 * plate, and that a box we cannot trust is refused outright — a bad box would
 * blow one fragment up to 40x and put it on a card, which is far worse than the
 * un-normalised picture it replaced.
 *
 * The aspect ratios below are the real ones, measured off the dev catalogue's
 * own masters: 1.96:1 (desert-bloom), 1.02:1 (wabi-sabi-study), 0.53:1
 * (mountain-majesty), 0.51:1 (cosmic-harmony, once its baked-in wall is
 * excluded).
 */

import { describe, it, expect } from 'vitest'
import type { ImageArtBox } from '@chobii/shared'
import {
  ART_AREA,
  ART_MAX_SIDE,
  artTargetSize,
  frameArt,
  isUsableArtBox,
} from '~/components/product/artFraming'

/** A centred box of the given aspect, matted at 88% of its longest side. */
const matted = (aspect: number): ImageArtBox => {
  const w = aspect >= 1 ? 0.88 : 0.88 * aspect
  const h = aspect >= 1 ? 0.88 / aspect : 0.88
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

const CATALOGUE_ASPECTS = [1.96, 1.34, 1.02, 0.8, 0.53, 0.51]

/** `translate(a%, b%) scale(s)` -> [a, b, s], all in plate fractions. */
function readTransform(transform: string): [number, number, number] {
  const m = transform.match(
    /translate\((-?[\d.]+)%,\s*(-?[\d.]+)%\)\s*scale\(([\d.]+)\)/
  )
  if (!m) throw new Error(`unreadable transform: ${transform}`)
  return [Number(m[1]) / 100, Number(m[2]) / 100, Number(m[3])]
}

/** `inset(t r b l)` -> the box it keeps, in image fractions. */
function readClip(clipPath: string): ImageArtBox {
  const nums = [...clipPath.matchAll(/(-?[\d.]+)%/g)].map((m) => Number(m[1]) / 100)
  const [top, right, bottom, left] = nums as [number, number, number, number]
  return { x: left, y: top, w: 1 - left - right, h: 1 - top - bottom }
}

/** Coverage of the plate, as a fraction, for a piece of this aspect. */
const coverage = (aspect: number): number => {
  const { width, height } = artTargetSize(aspect)
  return width * height
}

/** The shortness r = short/long that the cap starts binding at. */
const R_CAPPED = ART_AREA / (ART_MAX_SIDE * ART_MAX_SIDE)

describe('artTargetSize', () => {
  it('gives every uncapped shape exactly the same coverage', () => {
    // The whole rule, and the third blind A/B's finding as an assertion: "the
    // square painting fills 79% of its tile while the landscape and the two
    // portraits fill only ~41%". Landscape and portrait of the same shortness
    // are included, since a rule that only worked one way round would pass a
    // portrait-only list.
    for (const aspect of [1, 1.02, 1.1, 1.2, 0.9, 0.85, 1 / 1.2]) {
      expect(coverage(aspect)).toBeCloseTo(ART_AREA, 9)
    }
  })

  it('only ever falls SHORT of the target area, never over', () => {
    // The cap is a ceiling on the long side, so a capped piece is smaller than
    // equal area would make it. Nothing may exceed the target: that direction
    // would be the 1.93x spread again.
    for (const aspect of [4, 2.5, 1.96, 1.34, 1.02, 1, 0.8, 0.53, 0.51, 0.25]) {
      expect(coverage(aspect)).toBeLessThanOrEqual(ART_AREA + 1e-9)
    }
  })

  it('caps only the pieces too elongated to reach the area', () => {
    // 0.790. Above it the piece carries the full target area; below it the
    // corner-radius cap binds and coverage falls away as maxSide^2 * r.
    expect(R_CAPPED).toBeCloseTo(0.79, 2)
    for (const aspect of [1 / 0.85, 0.85, 0.9, 1]) {
      expect(coverage(aspect)).toBeCloseTo(ART_AREA, 9)
    }
    // 0.75 and 1.34 are the dev catalogue's second-biggest cluster and they are
    // on the cap now, which is the point: coverage falls off CONTINUOUSLY with
    // shape rather than splitting the row into "full" and "2:1".
    for (const aspect of [1.96, 2.08, 1 / 1.96, 0.51, 0.75, 1.34]) {
      const r = aspect >= 1 ? 1 / aspect : aspect
      expect(coverage(aspect)).toBeCloseTo(ART_MAX_SIDE * ART_MAX_SIDE * r, 9)
      expect(Math.max(...Object.values(artTargetSize(aspect)))).toBeCloseTo(
        ART_MAX_SIDE,
        9
      )
    }
  })

  it('draws the near-square at the reference’s own measured 64%', () => {
    // THE PIN, and the reason this file exists in its current form.
    //
    // Measured off scratchpad/shots/bar-desktop-full.png — the reference home
    // page at a 1440x900 viewport, deviceScaleFactor 2 — by ink bounding box
    // inside each 322px plate, ink threshold 20 (re-run at 8 and 45, moves
    // <1pt). The reference draws its 1.02:1 piece at 261x255 / 64.2% in its
    // Best Seller band and at 261x256 / 64.4% in a second, mixed-aspect band
    // further down the same page. The same shape at the same scale twice.
    //
    // Round 3 mis-read a fourth card in that band as 88% coverage (it is
    // 233x311 in a 322px plate = 70%), inferred a 1.35x spread target from the
    // bad figure, and set ART_AREA = 0.554, which shipped our near-square at
    // 242x236 / 55%. If ART_AREA drifts off the measured 64% again, it fails
    // HERE, against the number that was actually measured, rather than in a
    // blind A/B three rounds later.
    const PLATE = 321
    const { width, height } = artTargetSize(1.022)
    expect(coverage(1.022) * 100).toBeCloseTo(64, 0)
    expect(Math.round(width * PLATE)).toBe(260)
    expect(Math.round(height * PLATE)).toBe(254)
  })

  it('lands the row’s coverage spread where the reference’s mixed row is', () => {
    // The spread is an OUTPUT of ART_AREA, never the thing tuned — that
    // inversion is what round 3 got wrong. The reference's Best Seller band is
    // NOT a useful target for it: its four aspects are 1.02/1.02/0.81/0.75, so
    // it spreads only 1.12x for free. Its second band holds genuinely mixed
    // stock — 0.77/1.02/1.96/0.49, very like ours — and spreads 1.55x.
    const row = [1.022, 1.976, 0.508, 0.52]
    const spread = (xs: number[]): number => Math.max(...xs) / Math.min(...xs)
    expect(spread(row.map(coverage))).toBeCloseTo(1.55, 1)

    // The reference's own mixed stock, run through our rule, stays close to the
    // 1.55x it actually measures. It cannot match exactly: the reference mats
    // its elongated pieces at 3-10px because they are canvases on plaster,
    // where ART_MAX_SIDE holds ours at 16px to keep the plate's corner radius
    // off a straight gilt frame edge.
    expect(Math.abs(spread([0.77, 1.02, 1.96, 0.49].map(coverage)) - 1.55)).toBeLessThan(0.1)
  })

  it('gives two pieces of the same shape the same size', () => {
    // The second blind A/B's finding, as an assertion: "cards 3 and 4 are the
    // same 0.52 portrait aspect yet render 115px and 157px wide".
    for (const aspect of CATALOGUE_ASPECTS) {
      expect(artTargetSize(aspect)).toEqual(artTargetSize(aspect))
      const nudged = artTargetSize(aspect * 1.0000001)
      expect(nudged.width).toBeCloseTo(artTargetSize(aspect).width, 5)
    }
  })

  it('preserves the aspect ratio exactly', () => {
    for (const aspect of CATALOGUE_ASPECTS) {
      const { width, height } = artTargetSize(aspect)
      expect(width / height).toBeCloseTo(aspect, 6)
    }
  })

  it('never lets a piece pass the cap on either axis', () => {
    for (const aspect of [4, 1.96, 1, 0.53, 0.25]) {
      const { width, height } = artTargetSize(aspect)
      expect(width).toBeLessThanOrEqual(ART_MAX_SIDE + 1e-9)
      expect(height).toBeLessThanOrEqual(ART_MAX_SIDE + 1e-9)
    }
  })

  it('keeps every mat clear of the plate’s corner radius', () => {
    // 15.16px radius on a 321px plate. Our artwork is photographed FRAMED, so a
    // mat thinner than the radius runs the plate's curve through a straight
    // gilt edge. The cap is what guarantees the floor; assert the floor, not
    // the cap, so the reason survives a change of constant.
    const PLATE = 321
    const RADIUS = 15.16
    for (const aspect of [4, 1.96, 1.02, 1, 0.8, 0.53, 0.25]) {
      const { width, height } = artTargetSize(aspect)
      const minMat = (PLATE * (1 - Math.max(width, height))) / 2
      expect(minMat).toBeGreaterThan(RADIUS)
    }
  })

  it('never shrinks a near-square below the reference’s own near-square', () => {
    // The reference draws its 1.02:1 canvases at 261 of a 322px plate = 81% of
    // the long side. Ours is 260 of 321 = 81%. Mean coverage is the one axis
    // the reference unambiguously wins (67.6% to our 47.1%, and the gap is our
    // 2:1 stock, not the rule), so shrinking the lead artwork to buy an evener
    // row gives ground on the axis already lost.
    expect(artTargetSize(1.02).width).toBeGreaterThan(0.79)
  })
})

describe('isUsableArtBox', () => {
  it('accepts a real measurement', () => {
    expect(isUsableArtBox(matted(1.96))).toBe(true)
  })

  it('refuses a missing box', () => {
    expect(isUsableArtBox(undefined)).toBe(false)
  })

  it('refuses a box that leaves the master', () => {
    expect(isUsableArtBox({ x: 0.5, y: 0, w: 0.8, h: 0.5 })).toBe(false)
    expect(isUsableArtBox({ x: -0.1, y: 0, w: 0.5, h: 0.5 })).toBe(false)
  })

  it('refuses a box too small to be artwork', () => {
    expect(isUsableArtBox({ x: 0.5, y: 0.5, w: 0.01, h: 0.4 })).toBe(false)
  })

  it('refuses NaN, which is what a bad divide produces', () => {
    expect(isUsableArtBox({ x: 0, y: 0, w: Number.NaN, h: 0.5 })).toBe(false)
  })
})

describe('frameArt', () => {
  it('leaves an un-measured image completely alone', () => {
    // The whole fallback: no artBox, no style, the card draws what it always did.
    expect(frameArt(undefined)).toBeUndefined()
    expect(frameArt({ x: 0, y: 0, w: 2, h: 2 })).toBeUndefined()
  })

  it('clips to exactly the art box, so no baked mat survives', () => {
    for (const aspect of CATALOGUE_ASPECTS) {
      const box = matted(aspect)
      const kept = readClip(frameArt(box)!.clipPath as string)
      expect(kept.x).toBeCloseTo(box.x, 3)
      expect(kept.y).toBeCloseTo(box.y, 3)
      expect(kept.w).toBeCloseTo(box.w, 3)
      expect(kept.h).toBeCloseTo(box.h, 3)
    }
  })

  it('lands the art on its target rect, centred on the plate', () => {
    for (const aspect of CATALOGUE_ASPECTS) {
      const box = matted(aspect)
      const [tx, ty, scale] = readTransform(frameArt(box)!.transform as string)
      const { width, height } = artTargetSize(aspect)

      // Where the art's own edges end up, in plate fractions.
      const left = tx + scale * box.x
      const top = ty + scale * box.y
      expect(scale * box.w).toBeCloseTo(width, 6)
      expect(scale * box.h).toBeCloseTo(height, 6)
      // Centred: the air above equals the air below, as the bar's row is.
      expect(left).toBeCloseTo((1 - width) / 2, 6)
      expect(top).toBeCloseTo((1 - height) / 2, 6)
    }
  })

  it('never pushes art off the plate', () => {
    for (const aspect of [4, 1.96, 1, 0.53, 0.25]) {
      const box = matted(aspect)
      const [tx, ty, scale] = readTransform(frameArt(box)!.transform as string)
      expect(tx + scale * box.x).toBeGreaterThanOrEqual(0)
      expect(ty + scale * box.y).toBeGreaterThanOrEqual(0)
      expect(tx + scale * (box.x + box.w)).toBeLessThanOrEqual(1 + 1e-9)
      expect(ty + scale * (box.y + box.h)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('pins the transform origin, without which every number above is wrong', () => {
    expect(frameArt(matted(1))!.transformOrigin).toBe('0 0')
  })
})
