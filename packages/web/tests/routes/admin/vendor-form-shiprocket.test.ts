/**
 * The Shiprocket pickup nickname survives the form's payload builder (#723).
 *
 * The nickname is whoever registered it in Shiprocket's own dashboard, so the
 * only correct treatment is to pass it through: inner spaces, mixed case and
 * punctuation all intact. Anything that normalises it produces a value that
 * looks right on this screen and matches nothing on their side, and the failure
 * lands as a rejected pickup at dispatch rather than here.
 *
 * The other half of this — that opening an existing vendor HYDRATES the field
 * rather than showing an empty box — is enforced by the compiler rather than by
 * a test here: `VendorFormValues` requires the key, so a `toFormValues` that
 * omits it does not build, and `packages/web` app code is typechecked. That
 * matters because the failure it prevents is #707's: an empty box saved back as
 * null silently wipes a value nobody touched.
 *
 * @see packages/web/app/routes/admin/vendors/VendorForm.tsx
 */

import { describe, it, expect } from 'vitest'

import { EMPTY_VENDOR, vendorPayload } from '~/routes/admin/vendors/VendorForm'

const NICKNAME = 'Chobii Warehouse #2 (Andheri East)'

describe('vendorPayload carries the pickup nickname', () => {
  it('passes a pasted nickname through unchanged', () => {
    const payload = vendorPayload({
      ...EMPTY_VENDOR,
      name: 'Chennai Print Works',
      shiprocketPickupLocation: NICKNAME,
    })

    expect(payload.shiprocketPickupLocation).toBe(NICKNAME)
  })

  it('trims the whitespace a paste drags in', () => {
    const payload = vendorPayload({
      ...EMPTY_VENDOR,
      name: 'Chennai Print Works',
      shiprocketPickupLocation: `  ${NICKNAME}\n`,
    })

    expect(payload.shiprocketPickupLocation).toBe(NICKNAME)
  })

  it('sends null, not "", for a vendor with no pickup location', () => {
    // An empty string satisfies `IS NOT NULL`, so "" would read as configured
    // to anything downstream that checks for one — the #670 property.
    const payload = vendorPayload({ ...EMPTY_VENDOR, name: 'New Framer' })

    expect(payload.shiprocketPickupLocation).toBeNull()
  })

  it('sends null when the admin clears a field that had a value', () => {
    const payload = vendorPayload({
      ...EMPTY_VENDOR,
      name: 'Chennai Print Works',
      shiprocketPickupLocation: '   ',
    })

    expect(payload.shiprocketPickupLocation).toBeNull()
  })

  it('starts empty on a new vendor', () => {
    expect(EMPTY_VENDOR.shiprocketPickupLocation).toBe('')
  })
})
