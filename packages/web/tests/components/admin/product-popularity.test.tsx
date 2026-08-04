/**
 * Admin surface for the popularity signal.
 *
 * The curator pin and the measurement are shown together on purpose. Pinning
 * a product lifts it in the Best-selling sort; it does not change what the
 * product sold. An admin who cannot see both cannot tell when they disagree,
 * and the pin quietly becomes a belief about sales.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const table = readFileSync(
  join(process.cwd(), 'app/components/admin/ProductsTable.tsx'),
  'utf8'
)

const form = readFileSync(
  join(process.cwd(), 'app/components/admin/ProductForm.tsx'),
  'utf8'
)

describe('ProductsTable', () => {
  it('carries unitsSold on the row type', () => {
    expect(table).toMatch(/unitsSold/)
  })

  it('renders a units-sold column', () => {
    expect(table).toMatch(/header:\s*'Units sold'/)
  })

  it('carries the pin beside it', () => {
    expect(table).toMatch(/isPopular/)
  })

  it('keeps the featured column it sits next to', () => {
    expect(table).toMatch(/accessorKey:\s*'isFeatured'/)
  })
})

describe('ProductForm', () => {
  it('carries isPopular in the form data', () => {
    expect(form).toMatch(/isPopular/)
  })

  it('carries popularOrder in the form data', () => {
    expect(form).toMatch(/popularOrder/)
  })

  it('defaults isPopular to false — a pin is a deliberate act', () => {
    expect(form).toMatch(/isPopular:\s*false/)
  })

  it('defaults popularOrder to null, not 0 — unpinned is not rank zero', () => {
    expect(form).toMatch(/popularOrder:\s*null/)
  })
})
