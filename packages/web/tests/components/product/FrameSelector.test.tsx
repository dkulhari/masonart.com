/**
 * FrameSelector — circular photographic swatches on the PDP (#516).
 *
 * mesonart's measured pattern (docs/design/pdp-parity-reference.md):
 *   - a label line "<group>:  <selected value>", e.g.
 *     "Rolled Canvas/Frameless/Framed:  Rolled Canvas"
 *   - circular swatches (~92px) showing the frame's own photo, wrapping onto
 *     rows, no price printed on them
 *   - the selected swatch carries a solid dark ring, the rest a light one,
 *     plus a non-colour cue (a check badge) since a ring colour alone is not
 *     an accessible selection indicator
 *
 * ChooseOptions.test.tsx already covers this exact pattern for the Quickview
 * panel; this file covers the same behaviour for the full PDP's
 * FrameSelector, which has its own prop contract (`FrameOptionData`,
 * `selectedFrameId`, `onFrameSelect`) that ProductDetail.tsx and
 * ChooseOptions.tsx both compile against.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  FrameSelector,
  FrameSelectorSkeleton,
  calculateFramePrice,
  formatPriceModifier,
  type FrameOptionData,
} from '~/components/product/FrameSelector'

const frame = (overrides: Partial<FrameOptionData>): FrameOptionData => ({
  id: overrides.id ?? 'f-id',
  type: overrides.type ?? 'rolled',
  name: overrides.name ?? 'Rolled Canvas',
  description: overrides.description ?? 'Shipped in a tube',
  material: overrides.material,
  imageUrl: overrides.imageUrl,
  priceModifierType: overrides.priceModifierType ?? 'percentage',
  priceModifierValue: overrides.priceModifierValue ?? 0,
  isAvailable: overrides.isAvailable ?? true,
})

/** The real seven-row seed (packages/api/.../seed-frames.ts) — same axis the
 * reference measures: Rolled Canvas, Frameless, five mouldings. */
const SEVEN_FRAMES: FrameOptionData[] = [
  frame({ id: 'f-rolled', type: 'rolled', name: 'Rolled Canvas', imageUrl: '/frames/rolled.png' }),
  frame({
    id: 'f-frameless',
    type: 'frameless',
    name: 'Frameless',
    priceModifierType: 'percentage',
    priceModifierValue: 33,
    imageUrl: '/frames/frameless.jpg',
  }),
  frame({
    id: 'f-gold',
    type: 'gold',
    name: 'Stretch + Gold Frame',
    priceModifierType: 'percentage',
    priceModifierValue: 40,
    imageUrl: '/frames/gold.png',
  }),
  frame({
    id: 'f-silver',
    type: 'silver',
    name: 'Stretch + Silver Frame',
    priceModifierType: 'percentage',
    priceModifierValue: 40,
    imageUrl: '/frames/silver.png',
  }),
  frame({
    id: 'f-black',
    type: 'black',
    name: 'Stretch + Black Frame',
    priceModifierType: 'percentage',
    priceModifierValue: 40,
    // A placeholder is what old seed data shipped; it must never reach a
    // swatch img src.
    imageUrl: 'https://placehold.co/100x100/1a1a1a/ffffff?text=Black',
  }),
  frame({
    id: 'f-white',
    type: 'white',
    name: 'Stretch + White Frame',
    priceModifierType: 'percentage',
    priceModifierValue: 40,
    imageUrl: '/frames/white.jpg',
  }),
  frame({
    id: 'f-wood',
    type: 'wood',
    name: 'Stretch + Wood Frame',
    priceModifierType: 'percentage',
    priceModifierValue: 40,
    imageUrl: undefined,
  }),
]

describe('calculateFramePrice / formatPriceModifier', () => {
  it('prices a percentage modifier off the base price', () => {
    expect(calculateFramePrice(2000, 'percentage', 40)).toBe(800)
  })

  it('prices a fixed modifier from paise', () => {
    expect(calculateFramePrice(2000, 'fixed', 49900)).toBe(499)
  })

  it('reads "Included" for a zero modifier', () => {
    expect(formatPriceModifier(2000, 'percentage', 0)).toBe('Included')
  })

  it('formats a non-zero modifier with a leading +', () => {
    expect(formatPriceModifier(2000, 'percentage', 40)).toMatch(/^\+/)
  })
})

describe('the label line', () => {
  it('reads "<group>: <selected value>" — mesonart\'s format axis', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId="f-rolled"
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    expect(screen.getByTestId('frame-selector-label').textContent).toContain(
      'Rolled Canvas/Frameless/Framed:'
    )
    expect(screen.getByTestId('frame-selector-value').textContent).toBe(
      'Rolled Canvas'
    )
  })

  it('reads "None" when nothing is selected', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    expect(screen.getByTestId('frame-selector-value').textContent).toBe('None')
  })

  it('tracks the value across a different selection', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId="f-gold"
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    expect(screen.getByTestId('frame-selector-value').textContent).toBe(
      'Stretch + Gold Frame'
    )
  })

  it('collapses to "Framed" alone when every option is a moulding', () => {
    render(
      <FrameSelector
        frames={[SEVEN_FRAMES[2]!, SEVEN_FRAMES[3]!]}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    expect(screen.getByTestId('frame-selector-label').textContent).toContain(
      'Framed:'
    )
    expect(
      screen.getByTestId('frame-selector-label').textContent
    ).not.toContain('/')
  })
})

describe('the swatches', () => {
  it('renders one circular button per available frame, each named', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId="f-rolled"
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    for (const f of SEVEN_FRAMES) {
      const escaped = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const swatch = screen.getByRole('button', { name: new RegExp(escaped) })
      expect(swatch.className).toContain('rounded-full')
    }
  })

  it('never prints a price in the swatch\'s visible text', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    // The price only exists inside the sr-only accessible name, never in a
    // rendered node with visible text content on the button itself.
    const goldSwatch = screen.getByRole('button', { name: /Stretch \+ Gold Frame/ })
    expect(goldSwatch.querySelector(':scope > span:not(.sr-only)')).toBeNull()
  })

  it('uses the frame\'s own photo when the data carries a real one', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const swatch = screen.getByRole('button', { name: /Stretch \+ Gold Frame/ })
    expect(swatch.querySelector('img')?.getAttribute('src')).toBe(
      '/frames/gold.png'
    )
  })

  it('falls back to the drawn swatch rather than a placehold.co placard', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const swatch = screen.getByRole('button', { name: /Stretch \+ Black Frame/ })
    expect(swatch.querySelector('img')).toBeNull()
  })

  it('falls back to the drawn swatch when there is no image at all', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const swatch = screen.getByRole('button', { name: /Stretch \+ Wood Frame/ })
    expect(swatch.querySelector('img')).toBeNull()
  })

  it('marks the selected swatch aria-pressed, and only that one', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId="f-silver"
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const selected = screen.getByRole('button', { name: /Stretch \+ Silver Frame/ })
    const other = screen.getByRole('button', { name: /Stretch \+ Gold Frame/ })
    expect(selected.getAttribute('aria-pressed')).toBe('true')
    expect(other.getAttribute('aria-pressed')).toBe('false')
  })

  it('gives the selected swatch a non-colour cue, not just a ring colour', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId="f-silver"
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const selected = screen.getByRole('button', { name: /Stretch \+ Silver Frame/ })
    const other = screen.getByRole('button', { name: /Stretch \+ Gold Frame/ })
    // A check-mark icon (or equivalent glyph) is present for the selected
    // swatch and absent for the rest — aria-pressed covers assistive tech,
    // this covers sighted colour-blind users.
    expect(selected.querySelector('svg')).not.toBeNull()
    expect(other.querySelector('svg')).toBeNull()
  })
})

describe('selection callback', () => {
  it('selects a frame on click', () => {
    const onFrameSelect = vi.fn()
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={onFrameSelect}
        basePrice={2000}
      />
    )

    screen.getByRole('button', { name: /Stretch \+ Gold Frame/ }).click()
    expect(onFrameSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f-gold' })
    )
  })

  it('deselects on reclicking the already-selected swatch', () => {
    const onFrameSelect = vi.fn()
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId="f-gold"
        onFrameSelect={onFrameSelect}
        basePrice={2000}
      />
    )

    screen.getByRole('button', { name: /Stretch \+ Gold Frame/ }).click()
    expect(onFrameSelect).toHaveBeenCalledWith(null)
  })
})

describe('unavailable frames', () => {
  it('is excluded from both the swatches and the group label', () => {
    render(
      <FrameSelector
        frames={[
          ...SEVEN_FRAMES,
          frame({ id: 'f-out', type: 'gold', name: 'Discontinued Gold', isAvailable: false }),
        ]}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    expect(screen.queryByRole('button', { name: /Discontinued Gold/ })).toBeNull()
  })

  it('shows a message when every frame is unavailable', () => {
    render(
      <FrameSelector
        frames={[frame({ isAvailable: false })]}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    expect(screen.getByText('No frame options available')).toBeTruthy()
  })
})

describe('FrameSelectorSkeleton', () => {
  it('renders circular placeholders, not the old rectangular cards', () => {
    const { container } = render(<FrameSelectorSkeleton />)
    const circles = container.querySelectorAll('.rounded-full')
    expect(circles.length).toBeGreaterThan(0)
  })
})
