/**
 * The frame form.
 *
 * What is worth pinning here is where the form must NOT have its own opinion:
 *
 * 1. **Bounds come from the shared schema.** The API validates with
 *    createFrameInputSchema; a second copy of the numbers in the form is how
 *    the screen and the endpoint end up disagreeing about what may be stored.
 * 2. **One upload fills both image columns.** The variant ladder already has a
 *    thumbnail and a card size, so a second image field would be a second
 *    thing to keep in sync for no gain.
 * 3. **A taken slug is reported as itself.** The API answers 409 naming the
 *    slug; rendering "something went wrong" throws that away.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createFrameInputSchema } from '@chobii/shared'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: { children: React.ReactNode; to?: string }) => (
    <a href={props.to}>{children}</a>
  ),
}))

import { FrameForm, validateFrame } from '~/routes/admin/frames/FrameForm'

afterEach(cleanup)

const noop = () => {}

const renderForm = (props: Partial<Parameters<typeof FrameForm>[0]> = {}) =>
  render(<FrameForm onSubmit={noop} {...props} />)

describe('FrameForm fields', () => {
  it('offers every column an admin owns', () => {
    renderForm()

    for (const label of [
      /^name/i,
      /^type/i,
      /^category/i,
      /price multiplier/i,
      /flat addition/i,
      /sort order/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('has ONE image field — one upload fills both columns', () => {
    renderForm()

    expect(screen.queryByLabelText(/thumbnail/i)).toBeNull()
    expect(screen.getByLabelText(/swatch/i)).toBeInTheDocument()
  })

  it('states the slug constraint rather than letting the admin discover it', () => {
    renderForm()
    expect(screen.getByText(/lowercase|hyphen/i)).toBeInTheDocument()
  })

  it('offers exactly the three rungs', () => {
    renderForm()

    const select = screen.getByLabelText(/^category/i) as HTMLSelectElement
    const values = Array.from(select.options)
      .map((o) => o.value)
      .filter(Boolean)

    expect(values).toEqual(['rolled', 'frameless', 'framed'])
  })

  it('seeds its fields from an existing frame when editing', () => {
    renderForm({
      initial: {
        name: 'Stretch + Gold Frame',
        type: 'gold',
        category: 'framed',
        priceModifier: '1.40',
        priceAddition: '250.00',
      },
    })

    expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe(
      'Stretch + Gold Frame'
    )
    expect(
      (screen.getByLabelText(/flat addition/i) as HTMLInputElement).value
    ).toBe('250.00')
  })
})

describe('validation', () => {
  it('defers to the shared schema rather than restating the bounds', () => {
    // Whatever the schema rejects, the form must reject — asserted against the
    // schema itself, so the two cannot drift.
    const bad = { priceModifier: '0.5' }
    expect(createFrameInputSchema.partial().safeParse(bad).success).toBe(false)
    expect(validateFrame(bad).priceModifier).toBeTruthy()
  })

  it('accepts the no-markup floor', () => {
    expect(validateFrame({ priceModifier: '1.00' }).priceModifier).toBeFalsy()
  })

  it('rejects an implausible multiplier, matching the schema', () => {
    expect(createFrameInputSchema.partial().safeParse({ priceModifier: '9.00' }).success).toBe(
      false
    )
    expect(validateFrame({ priceModifier: '9.00' }).priceModifier).toBeTruthy()
  })

  it('rejects a display name in the type field', () => {
    expect(validateFrame({ type: 'Stretch Maple' }).type).toBeTruthy()
    expect(validateFrame({ type: 'stretch-maple' }).type).toBeFalsy()
  })

  it('rejects a negative flat addition', () => {
    expect(validateFrame({ priceAddition: '-1.00' }).priceAddition).toBeTruthy()
  })

  it('reports nothing for a wholly valid frame', () => {
    const errors = validateFrame({
      name: 'Stretch + Maple Frame',
      type: 'stretch-maple',
      category: 'framed',
      priceModifier: '1.40',
      priceAddition: '0.00',
    })
    expect(Object.keys(errors)).toHaveLength(0)
  })
})

describe('a taken slug', () => {
  it('is reported by name, not as a generic failure', () => {
    renderForm({ submitError: "Frame type 'gold' is already taken" })
    expect(screen.getByText(/'gold' is already taken/)).toBeInTheDocument()
  })
})
