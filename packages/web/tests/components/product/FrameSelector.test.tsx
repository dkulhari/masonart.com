/**
 * FrameSelector — circular photographic swatches on the PDP (#516).
 *
 * mesonart's measured pattern (docs/design/pdp-parity-reference.md):
 *   - a label line "<group>:  <selected value>", e.g.
 *     "Rolled Canvas/Frameless/Framed:  Rolled Canvas"
 *   - circular swatches showing the frame's own photo
 *   - the selected swatch carries a solid dark ring, the rest a light one,
 *     plus a non-colour cue (a check badge) since a ring colour alone is not
 *     an accessible selection indicator
 *
 * With one deliberate divergence, covered here: the reference prints nothing
 * on a swatch, which leaves seven unlabelled circles and no way to compare
 * cost. Ours prints the name and the price uplift on every swatch, and a
 * caption naming the figure the uplift is added to.
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
  formatFrameUplift,
  type FrameOptionData,
} from '~/components/product/FrameSelector'

const frame = (overrides: Partial<FrameOptionData>): FrameOptionData => ({
  id: overrides.id ?? 'f-id',
  type: overrides.type ?? 'rolled',
  name: overrides.name ?? 'Rolled Canvas',
  description: overrides.description ?? 'Shipped in a tube',
  material: overrides.material,
  imageUrl: overrides.imageUrl,
  // The frame row's own columns, the shape `frameAddition` reads (#566).
  pricing: overrides.pricing ?? { priceModifier: '1.00', priceAddition: '0.00' },
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
    pricing: { priceModifier: '1.33', priceAddition: '0.00' },
    imageUrl: '/frames/frameless.jpg',
  }),
  frame({
    id: 'f-gold',
    type: 'gold',
    name: 'Stretch + Gold Frame',
    pricing: { priceModifier: '1.40', priceAddition: '0.00' },
    imageUrl: '/frames/gold.png',
  }),
  frame({
    id: 'f-silver',
    type: 'silver',
    name: 'Stretch + Silver Frame',
    pricing: { priceModifier: '1.40', priceAddition: '0.00' },
    imageUrl: '/frames/silver.png',
  }),
  frame({
    id: 'f-black',
    type: 'black',
    name: 'Stretch + Black Frame',
    pricing: { priceModifier: '1.40', priceAddition: '0.00' },
    // A placeholder is what old seed data shipped; it must never reach a
    // swatch img src.
    imageUrl: 'https://placehold.co/100x100/1a1a1a/ffffff?text=Black',
  }),
  frame({
    id: 'f-white',
    type: 'white',
    name: 'Stretch + White Frame',
    pricing: { priceModifier: '1.40', priceAddition: '0.00' },
    imageUrl: '/frames/white.jpg',
  }),
  frame({
    id: 'f-wood',
    type: 'wood',
    name: 'Stretch + Wood Frame',
    pricing: { priceModifier: '1.40', priceAddition: '0.00' },
    imageUrl: undefined,
  }),
]

describe('formatFrameUplift', () => {
  it('prices the modifier as a proportion of the base price', () => {
    expect(formatFrameUplift(2000, { priceModifier: '1.40' })).toContain('800.00')
  })

  it('reads "Included" for a frame that adds nothing', () => {
    expect(
      formatFrameUplift(2000, { priceModifier: '1.00', priceAddition: '0.00' })
    ).toBe('Included')
  })

  it('formats a non-zero uplift with a leading +', () => {
    expect(formatFrameUplift(2000, { priceModifier: '1.40' })).toMatch(/^\+/)
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

describe('the price basis caption', () => {
  it('names the figure the uplifts are added to when nothing is selected', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const basis = screen.getByTestId('frame-price-basis').textContent ?? ''
    expect(basis).toMatch(/added to/i)
    expect(basis).toContain('2,000.00')
  })

  it('ties the ringed frame to its own number once one is chosen', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId="f-gold"
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const basis = screen.getByTestId('frame-price-basis').textContent ?? ''
    expect(basis).toContain('Stretch + Gold Frame')
    // The uplift and the base it applies to, both spelled out — so "+₹800.00"
    // on the swatch cannot be read as the price of the frame outright.
    expect(basis).toContain('800.00')
    expect(basis).toContain('2,000.00')
  })

  it('says the zero-modifier choice costs nothing extra', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId="f-rolled"
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const basis = screen.getByTestId('frame-price-basis').textContent ?? ''
    expect(basis).toContain('Rolled Canvas')
    expect(basis).toMatch(/included/i)
  })
})

describe('the grid', () => {
  it('lays the swatches out in fixed columns, not a free-wrapping row', () => {
    // Seven options free-flowing at swatch width wrap five-then-two and leave
    // a three-cell hole; fixed columns keep the names in aligned stacks.
    const { container } = render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const grid = container.querySelector('.grid-cols-4')
    expect(grid).not.toBeNull()
    expect(grid!.querySelectorAll('button').length).toBe(7)
  })

  it('sizes each swatch off its cell so a 390px panel shrinks it, not overflows', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const swatch = screen.getByRole('button', { name: /Stretch \+ Gold Frame/ })
    const circle = swatch.querySelector('.rounded-full')!
    expect(circle.className).toContain('w-full')
    expect(circle.className).toContain('max-w-[104px]')
  })
})

describe('the swatches', () => {
  it('renders one circular swatch per available frame, each named', () => {
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
      // The photographic part is still a circle; the button around it now also
      // holds two lines of type.
      expect(swatch.querySelector('.rounded-full')).not.toBeNull()
    }
  })

  it('prints each frame\'s name in visible text, not only to screen readers', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    for (const f of SEVEN_FRAMES) {
      const escaped = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const swatch = screen.getByRole('button', { name: new RegExp(escaped) })
      const visible = Array.from(swatch.querySelectorAll('span')).filter(
        (el) => !el.className.includes('sr-only')
      )
      expect(visible.some((el) => el.textContent === f.name)).toBe(true)
    }
  })

  it('prints each frame\'s price uplift in visible text', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    // 40% of 2000 = 800, so the moulding swatches read "+₹800.00" — an uplift
    // with a leading +, never a bare figure that could pass for a total.
    const gold = screen.getByRole('button', { name: /Stretch \+ Gold Frame/ })
    const uplift = formatFrameUplift(2000, { priceModifier: '1.40' })
    expect(uplift).toContain('800')
    expect(
      Array.from(gold.querySelectorAll('span')).some(
        (el) => el.textContent === uplift && !el.className.includes('sr-only')
      )
    ).toBe(true)
  })

  it('reads "Included" on the zero-modifier swatch rather than blank or +0', () => {
    render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const rolled = screen.getByRole('button', { name: /Rolled Canvas/ })
    expect(rolled.textContent).toContain('Included')
    expect(rolled.textContent).not.toContain('+₹0')
  })

  it('hides no price behind an sr-only node — one string serves both', () => {
    const { container } = render(
      <FrameSelector
        frames={SEVEN_FRAMES}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    expect(container.querySelectorAll('.sr-only').length).toBe(0)
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

/**
 * The flat `priceAddition` column reaches the swatch (#566).
 *
 * A frame row carries two price columns: `priceModifier` (1.40 = "the piece
 * plus 40%") and `priceAddition`, a flat sum on top. The server charges both —
 * `frameAddition` in `@chobii/shared` is `round(unitPrice * rate) + addition` —
 * and so does the quickview. The PDP used to convert `priceModifier` into a
 * percentage on the way in and drop `priceAddition` on the floor, so a frame
 * carrying both would be quoted low here and charged correctly at checkout.
 *
 * Every seeded frame has `priceAddition` at "0.00" today, which is exactly why
 * this needs a test rather than a look: nothing about the drop fails, until an
 * admin sets a flat addition on one row.
 */
describe('the flat priceAddition column (#566)', () => {
  const GILT: FrameOptionData = frame({
    id: 'f-gilt',
    type: 'gold',
    name: 'Hand-Gilt Frame',
    pricing: { priceModifier: '1.40', priceAddition: '150.00' },
    imageUrl: '/frames/gold.png',
  })

  /** A frame that costs a flat sum and no proportion at all. */
  const MOUNT: FrameOptionData = frame({
    id: 'f-mount',
    type: 'frameless',
    name: 'Mount Board',
    pricing: { priceModifier: '1.00', priceAddition: '400.00' },
  })

  it('adds the flat sum on top of the proportional markup', () => {
    // 40% of 2000 is 800; the row also charges a flat 150.
    expect(formatFrameUplift(2000, GILT.pricing)).toContain('950.00')
  })

  it('prints that combined figure on the swatch', () => {
    render(
      <FrameSelector
        frames={[GILT]}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const swatch = screen.getByRole('button', { name: /Hand-Gilt Frame/ })
    expect(swatch.textContent).toContain('950.00')
    // The percentage alone — what the page quoted before — must not survive.
    expect(swatch.textContent).not.toContain('800.00')
  })

  it('names the combined figure in the price basis caption', () => {
    render(
      <FrameSelector
        frames={[GILT]}
        selectedFrameId="f-gilt"
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const basis = screen.getByTestId('frame-price-basis').textContent ?? ''
    expect(basis).toContain('950.00')
    expect(basis).toContain('2,000.00')
  })

  it('does not read "Included" for a frame whose whole price is the flat column', () => {
    render(
      <FrameSelector
        frames={[MOUNT]}
        selectedFrameId={null}
        onFrameSelect={vi.fn()}
        basePrice={2000}
      />
    )

    const swatch = screen.getByRole('button', { name: /Mount Board/ })
    expect(swatch.textContent).not.toContain('Included')
    expect(swatch.textContent).toContain('400.00')
  })

  it('scales the proportional part with the size and leaves the flat part alone', () => {
    // Doubling the piece doubles the 800 and not the 150: 1600 + 150.
    expect(formatFrameUplift(4000, GILT.pricing)).toContain('1,750.00')
  })
})
