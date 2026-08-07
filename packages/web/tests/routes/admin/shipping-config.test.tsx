/**
 * /admin/shipping — the free-shipping threshold, edited by a human (#570).
 *
 * The screen is thin over `GET/PUT /api/admin/shipping-config`, so what is
 * worth pinning is where being thin is not enough:
 *
 * 1. **0 is a legitimate setting.** "Everything ships free" is a real campaign
 *    and #569 goes out of its way to honour a configured 0 rather than fall
 *    back to ₹999. A form that rejects it would put the screen and the table in
 *    disagreement about what the setting may hold, so it warns instead.
 * 2. **An implausibly high value warns, never blocks.** The ticket asks for a
 *    warning; an admin running "free shipping on very large orders only" means
 *    it. The figure it warns above is the shared constant the API validates
 *    with, not a second copy.
 * 3. **Rupees, whole, no unit hop.** wallet-config stores paise. This value is
 *    the same figure the storefront prints, so the form posts exactly what the
 *    table holds — a conversion anywhere in that chain is a 100x pricing bug.
 * 4. **Provenance is on screen.** The config table carries `createdBy`, and an
 *    admin looking at a threshold they did not set needs to see who did and
 *    when before they change it back.
 * 5. **A scheduled change is visible.** The API deliberately does not clobber a
 *    row scheduled for a sale weekend. A screen that hides it would show a
 *    value that silently expires.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FREE_SHIPPING_THRESHOLD_WARN_ABOVE } from '@chobii/shared'
import {
  ShippingConfigForm,
  thresholdWarnings,
  validateThreshold,
  type AdminShippingConfig,
} from '~/routes/admin/shipping'

const sidebarSrc = readFileSync(
  join(process.cwd(), 'app/components/admin/AdminSidebar.tsx'),
  'utf8'
)

// ---------------------------------------------------------------------------
// Fixtures — shaped exactly like the GET payload
// ---------------------------------------------------------------------------

function config(
  overrides: Partial<AdminShippingConfig> = {}
): AdminShippingConfig {
  return {
    key: 'free_shipping_threshold',
    value: 999,
    source: 'config',
    defaultValue: 999,
    description: 'Net, post-discount rupee amount',
    effectiveFrom: '2026-08-01T00:00:00.000Z',
    effectiveTo: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedBy: {
      id: 'u1',
      name: 'Priya Nair',
      email: 'priya@chobii.art',
    },
    nextChangeAt: null,
    scheduled: [],
    ...overrides,
  }
}

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validateThreshold', () => {
  it('accepts a whole number of rupees', () => {
    expect(validateThreshold('1499')).toEqual({ value: 1499 })
  })

  it('accepts 0 — everything ships free is a real setting', () => {
    expect(validateThreshold('0')).toEqual({ value: 0 })
  })

  it('rejects a fraction: the table holds whole rupees', () => {
    expect(validateThreshold('999.50').error).toBeTruthy()
  })

  it('rejects a negative amount', () => {
    expect(validateThreshold('-1').error).toBeTruthy()
  })

  it('rejects a blank or non-numeric entry', () => {
    expect(validateThreshold('').error).toBeTruthy()
    expect(validateThreshold('free').error).toBeTruthy()
  })
})

describe('thresholdWarnings', () => {
  it('says nothing about an ordinary value', () => {
    expect(thresholdWarnings(1499)).toEqual([])
  })

  it('warns that 0 gives every order free shipping', () => {
    expect(thresholdWarnings(0).join(' ')).toMatch(/every order/i)
  })

  it('warns above the same figure the API validates against', () => {
    expect(thresholdWarnings(FREE_SHIPPING_THRESHOLD_WARN_ABOVE)).toEqual([])
    expect(
      thresholdWarnings(FREE_SHIPPING_THRESHOLD_WARN_ABOVE + 1).join(' ')
    ).toMatch(/almost no basket/i)
  })
})

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

describe('ShippingConfigForm', () => {
  it('shows the value in force, in rupees', () => {
    render(<ShippingConfigForm config={config()} onSave={vi.fn()} />)

    expect(
      (screen.getByLabelText(/free-shipping threshold/i) as HTMLInputElement)
        .value
    ).toBe('999')
  })

  it('names who last changed it, and when', () => {
    render(<ShippingConfigForm config={config()} onSave={vi.fn()} />)

    const provenance = screen.getByTestId('threshold-provenance').textContent
    expect(provenance).toContain('Priya Nair')
    expect(provenance).toMatch(/2026/)
  })

  it('says so when no row has been written and the bundled default is in force', () => {
    render(
      <ShippingConfigForm
        config={config({ source: 'default', updatedBy: null, updatedAt: null })}
        onSave={vi.fn()}
      />
    )

    expect(screen.getByTestId('threshold-provenance').textContent).toMatch(
      /default/i
    )
  })

  it('submits the entered rupees unchanged — no paise conversion', () => {
    const onSave = vi.fn()
    render(<ShippingConfigForm config={config()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText(/free-shipping threshold/i), {
      target: { value: '1499' },
    })
    fireEvent.submit(screen.getByTestId('shipping-config-form'))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1499 })
    )
  })

  it('refuses to submit an invalid amount and says why', () => {
    const onSave = vi.fn()
    render(<ShippingConfigForm config={config()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText(/free-shipping threshold/i), {
      target: { value: '999.50' },
    })
    fireEvent.submit(screen.getByTestId('shipping-config-form'))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBeTruthy()
  })

  it('warns about an implausibly high value but still submits it', () => {
    const onSave = vi.fn()
    render(<ShippingConfigForm config={config()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText(/free-shipping threshold/i), {
      target: { value: String(FREE_SHIPPING_THRESHOLD_WARN_ABOVE + 1) },
    })

    expect(screen.getByTestId('threshold-warnings').textContent).toMatch(
      /almost no basket/i
    )

    fireEvent.submit(screen.getByTestId('shipping-config-form'))
    expect(onSave).toHaveBeenCalled()
  })

  it('shows a scheduled change rather than letting it expire the new value silently', () => {
    render(
      <ShippingConfigForm
        config={config({
          scheduled: [
            {
              id: 'row2',
              value: 1,
              description: 'Diwali weekend',
              effectiveFrom: '2026-11-01T00:00:00.000Z',
              effectiveTo: null,
              createdAt: '2026-08-01T00:00:00.000Z',
              createdById: 'u1',
              createdByName: 'Priya Nair',
              createdByEmail: 'priya@chobii.art',
            },
          ],
        })}
        onSave={vi.fn()}
      />
    )

    const scheduled = screen.getByTestId('threshold-scheduled').textContent
    expect(scheduled).toContain('Diwali weekend')
    expect(scheduled).toMatch(/₹1\b/)
  })

  it('states what the threshold is measured against, so nobody reads it as gross', () => {
    render(<ShippingConfigForm config={config()} onSave={vi.fn()} />)

    // Net of discounts, gift cards excluded — design §5, and the rule the
    // server actually charges by.
    expect(document.body.textContent).toMatch(/net/i)
    expect(document.body.textContent).toMatch(/gift card/i)
  })
})

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('admin navigation', () => {
  it('registers the screen in the sidebar', () => {
    expect(sidebarSrc).toContain('/admin/shipping')
  })
})
