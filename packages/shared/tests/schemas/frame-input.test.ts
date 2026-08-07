/**
 * What an admin may store on a frame.
 *
 * The bounds are not arbitrary. `frameAddition` clamps a modifier below 1.00
 * to zero markup, so a form that accepted 0.5 would store a number the pricing
 * formula silently ignores — the admin would set a discount and get no change.
 * The floor is asserted against the clamp rather than hardcoded twice.
 */

import { describe, it, expect } from 'bun:test'
import {
  createFrameInputSchema,
  updateFrameInputSchema,
  frameCategorySchema,
} from '../../src/schemas/product'
import { frameAddition } from '../../src/constants/frames'

const valid = {
  name: 'Stretch + Maple Frame',
  type: 'stretch-maple',
  category: 'framed' as const,
  priceModifier: '1.40',
  priceAddition: '0.00',
  isActive: true,
  sortOrder: 7,
}

describe('createFrameInputSchema', () => {
  it('accepts a well-formed frame', () => {
    expect(createFrameInputSchema.safeParse(valid).success).toBe(true)
  })

  it('requires a slug type, not a display name', () => {
    expect(
      createFrameInputSchema.safeParse({ ...valid, type: 'Stretch Maple' })
        .success
    ).toBe(false)
    expect(
      createFrameInputSchema.safeParse({ ...valid, type: 'stretch-maple' })
        .success
    ).toBe(true)
  })

  it('rejects a category outside the three rungs', () => {
    expect(
      createFrameInputSchema.safeParse({ ...valid, category: 'floating' })
        .success
    ).toBe(false)
  })
})

describe('price bounds', () => {
  it('rejects a modifier the pricing formula would silently ignore', () => {
    // frameAddition clamps below 1.00 to no markup at all.
    expect(
      frameAddition(2000, { priceModifier: '0.5', priceAddition: '0' })
    ).toBe(0)
    expect(
      createFrameInputSchema.safeParse({ ...valid, priceModifier: '0.5' })
        .success
    ).toBe(false)
  })

  it('accepts the no-markup floor', () => {
    expect(
      createFrameInputSchema.safeParse({ ...valid, priceModifier: '1.00' })
        .success
    ).toBe(true)
  })

  it('rejects an implausible multiplier', () => {
    expect(
      createFrameInputSchema.safeParse({ ...valid, priceModifier: '9.00' })
        .success
    ).toBe(false)
  })

  it('accepts a flat addition and rejects a negative one', () => {
    expect(
      createFrameInputSchema.safeParse({ ...valid, priceAddition: '250.00' })
        .success
    ).toBe(true)
    expect(
      createFrameInputSchema.safeParse({ ...valid, priceAddition: '-1.00' })
        .success
    ).toBe(false)
  })

  it('rejects an addition wider than decimal(10,2)', () => {
    expect(
      createFrameInputSchema.safeParse({ ...valid, priceAddition: '100000.00' })
        .success
    ).toBe(false)
  })

  it('rejects more precision than the column can hold', () => {
    expect(
      createFrameInputSchema.safeParse({ ...valid, priceAddition: '10.005' })
        .success
    ).toBe(false)
  })
})

describe('updateFrameInputSchema', () => {
  it('is the create schema, partial — a price edit need not resend the name', () => {
    expect(
      updateFrameInputSchema.safeParse({ priceModifier: '1.60' }).success
    ).toBe(true)
  })

  it('still enforces the bounds on the fields it is given', () => {
    expect(
      updateFrameInputSchema.safeParse({ priceModifier: '0.5' }).success
    ).toBe(false)
  })
})

describe('frameCategorySchema', () => {
  it('is the three rungs and nothing else', () => {
    expect(frameCategorySchema.options).toEqual([
      'rolled',
      'frameless',
      'framed',
    ])
  })
})
