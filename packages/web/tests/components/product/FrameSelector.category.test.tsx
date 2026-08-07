/**
 * The frame panel groups on the column, not on a guess.
 *
 * `frameCategoryLabel` inferred the rung from the type string, which worked
 * only because all seven types were seeded in code and known in advance. An
 * admin-created moulding would land correctly by accident; an admin-created
 * FORMAT would land in "Framed" and nothing anywhere would say so. These tests
 * are written so that the second case fails loudly if the inference ever comes
 * back.
 */

import { describe, it, expect } from 'vitest'
import {
  frameGroupLabel,
  type FrameOptionData,
} from '~/components/product/FrameSelector'

const frame = (over: Partial<FrameOptionData>): FrameOptionData => ({
  id: 'f',
  type: 'gold',
  category: 'framed',
  name: 'Frame',
  description: '',
  imageUrl: '/frames/gold.png',
  pricing: { priceModifier: '1.40', priceAddition: '0.00' },
  isAvailable: true,
  ...over,
})

describe('frameGroupLabel', () => {
  it('reads the axis off the column', () => {
    expect(
      frameGroupLabel([
        frame({ type: 'rolled', category: 'rolled' }),
        frame({ type: 'frameless', category: 'frameless' }),
        frame({ type: 'gold', category: 'framed' }),
      ])
    ).toBe('Rolled Canvas/Frameless/Framed')
  })

  it('groups an admin-created FORMAT as a format, not as a moulding', () => {
    // The case the old inference got wrong with nothing to signal it: an
    // unfamiliar type that is nonetheless a format.
    expect(
      frameGroupLabel([
        frame({ type: 'stretch-maple', category: 'framed' }),
        frame({ type: 'rolled-matte', category: 'rolled' }),
      ])
    ).toBe('Framed/Rolled Canvas')
  })

  it('does not consult the type string at all', () => {
    // A row whose type says one thing and whose category says another must
    // follow the category. If this passes only because the type happens to
    // agree, the inference is still in there.
    expect(frameGroupLabel([frame({ type: 'rolled', category: 'framed' })])).toBe(
      'Framed'
    )
  })

  it('deduplicates and keeps first-appearance order', () => {
    expect(
      frameGroupLabel([
        frame({ category: 'framed' }),
        frame({ category: 'rolled' }),
        frame({ category: 'framed' }),
      ])
    ).toBe('Framed/Rolled Canvas')
  })

  it('returns an empty label for no frames rather than throwing', () => {
    expect(frameGroupLabel([])).toBe('')
  })
})

describe('the module', () => {
  it('no longer exports the inference', async () => {
    const mod = await import('~/components/product/FrameSelector')
    expect('frameCategoryLabel' in mod).toBe(false)
  })

  it('accepts anything carrying a category, so the quickview can share it', () => {
    // The quickview's frame shape is its own (QuickviewFrame), not
    // FrameOptionData. Taking the narrower structural type is what lets one
    // helper serve both panels instead of two copies drifting apart.
    expect(frameGroupLabel([{ category: 'rolled' }, { category: 'framed' }])).toBe(
      'Rolled Canvas/Framed'
    )
  })
})

describe('the quickview', () => {
  it('derives its axis heading rather than hardcoding it', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(process.cwd(), 'app/components/product/ChooseOptions.tsx'),
      'utf8'
    )

    /**
     * It used to print the literal "Rolled Canvas/Frameless/Framed:". Harmless
     * while the catalogue was seeded in code and always had all three rungs —
     * but an admin can now archive every rolled frame, at which point that
     * heading promises an option the panel does not offer, while the PDP
     * (which derives it) correctly reads "Frameless/Framed".
     */
    expect(src).not.toContain('Rolled Canvas/Frameless/Framed:')
    expect(src).toContain('frameGroupLabel')
  })
})
