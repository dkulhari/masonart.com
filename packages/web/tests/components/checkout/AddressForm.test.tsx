/**
 * AddressForm mobile-affordance tests (tickets #350, #355).
 *
 * The checkout shipping form shipped with no `autocomplete` attributes at all,
 * so browser and OS address autofill could not populate any field — mobile
 * users hand-typed name, email, phone, address, city, state and PIN. The auth
 * forms already declared their tokens correctly, so checkout was simply
 * missed, on the one form where autofill matters most for conversion.
 *
 * #355 covers the PIN code field, which offered a QWERTY keyboard for a
 * 6-digit numeric value.
 *
 * These assert attributes on the rendered markup, which is exactly what the
 * browser's autofill heuristics and mobile keyboard selection read.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AddressForm } from '~/components/checkout/AddressForm'

function renderForm() {
  return render(
    <AddressForm onChange={vi.fn()} onValidationChange={vi.fn()} />
  )
}

/** Field id -> the autocomplete token browsers expect for it. */
const EXPECTED_TOKENS: Array<[string, string]> = [
  ['fullName', 'name'],
  ['email', 'email'],
  ['phone', 'tel'],
  ['addressLine1', 'address-line1'],
  ['addressLine2', 'address-line2'],
  ['city', 'address-level2'],
  ['state', 'address-level1'],
  ['postalCode', 'postal-code'],
]

describe('AddressForm autofill affordances', () => {
  it.each(EXPECTED_TOKENS)(
    '#%s declares autocomplete="%s"',
    (id, token) => {
      const { container } = renderForm()
      const field = container.querySelector(`#${id}`)

      expect(field, `#${id} should exist in the form`).not.toBeNull()
      expect(field?.getAttribute('autocomplete')).toBe(token)
    }
  )

  it('leaves the whole form autofillable — no field missing a token', () => {
    const { container } = renderForm()

    const missing = EXPECTED_TOKENS.filter(
      ([id]) => !container.querySelector(`#${id}`)?.getAttribute('autocomplete')
    ).map(([id]) => id)

    expect(missing).toEqual([])
  })
})

describe('AddressForm mobile keyboards', () => {
  it('PIN code requests a numeric keypad', () => {
    const { container } = renderForm()
    const pin = container.querySelector('#postalCode')

    expect(pin?.getAttribute('inputmode')).toBe('numeric')
    expect(pin?.getAttribute('pattern')).toBe('[0-9]{6}')
  })

  it('PIN code stays type=text so leading zeros survive', () => {
    // type=number would strip a leading zero and add spinners — wrong tool
    // for a fixed-width numeric string like an Indian PIN.
    const { container } = renderForm()

    expect(container.querySelector('#postalCode')?.getAttribute('type')).toBe('text')
  })

  it('PIN code is capped at 6 characters', () => {
    const { container } = renderForm()

    expect(container.querySelector('#postalCode')?.getAttribute('maxlength')).toBe('6')
  })

  it('phone requests a numeric keypad', () => {
    const { container } = renderForm()

    expect(container.querySelector('#phone')?.getAttribute('inputmode')).toBe('numeric')
  })

  it('renders the fields the tokens are asserted against', () => {
    // Guard against a vacuous suite: if the form ever stops rendering, the
    // querySelector-based assertions above would need this to fail loudly.
    renderForm()

    expect(screen.getByLabelText(/full name/i)).toBeDefined()
    expect(screen.getByLabelText(/pin code/i)).toBeDefined()
  })
})
