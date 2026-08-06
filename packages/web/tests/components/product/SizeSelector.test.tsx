/**
 * SizeSelector tests (#515).
 *
 * mesonart's size control is one native `<select>` — 52px tall, 6px radius,
 * a barely-there `rgba(23,23,23,0.024)` fill — with a `Select a Size`
 * placeholder and options that fold inches and centimetres into one string
 * with no price: `24"H x 20"W/ 61H x 51W CM`. Ours used to render every
 * variant as a full-width bordered price card; these tests pin the dropdown
 * shape down so it cannot drift back to that.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SizeSelector,
  SizeSelectorCompact,
  SizeSelectorSkeleton,
  type SizeVariant,
} from '~/components/product/SizeSelector'

const src = () =>
  readFileSync(
    join(process.cwd(), 'app/components/product/SizeSelector.tsx'),
    'utf8'
  )

const variant = (overrides: Partial<SizeVariant> = {}): SizeVariant => ({
  id: 'v1',
  sizeId: 's1',
  sizeLabel: '24x20',
  widthInches: 20,
  heightInches: 24,
  price: '1999.00',
  stockQuantity: 10,
  isAvailable: true,
  ...overrides,
})

const variants: SizeVariant[] = [
  variant({ id: 'v1', widthInches: 20, heightInches: 24, price: '1999.00' }),
  variant({
    id: 'v2',
    widthInches: 30,
    heightInches: 40,
    price: '2999.00',
    sizeLabel: '40x30',
  }),
  variant({
    id: 'v3',
    widthInches: 12,
    heightInches: 16,
    price: '999.00',
    sizeLabel: '16x12',
    isAvailable: false,
    stockQuantity: 0,
  }),
]

describe('SizeSelector — dead toggle is gone, not stubbed', () => {
  it('no longer contains an inches/cm toggle button', () => {
    expect(src()).not.toContain('Show in cm')
    expect(src()).not.toContain('Show in inches')
  })

  it('no longer accepts a displayUnit prop', () => {
    expect(src()).not.toContain('displayUnit')
  })
})

describe('SizeSelector — a single dropdown, not a stacked list', () => {
  it('renders exactly one combobox', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
  })

  it('matches the measured 52px/6px-radius/full-width control', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    const select = screen.getByRole('combobox')
    expect(select.className).toContain('h-[52px]')
    expect(select.className).toContain('rounded-md')
    expect(select.className).toContain('w-full')
    expect(select.className).toContain('bg-foreground/[0.024]')
    expect(select.className).toContain('px-[26px]')
  })

  it('renders no per-option button cards', () => {
    const { container } = render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('gives the control an accessible name', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    expect(screen.getByRole('combobox', { name: /size/i })).toBeInTheDocument()
  })
})

describe('SizeSelector — placeholder', () => {
  it('the first option is the disabled "Select a Size" placeholder', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    const options = screen.getAllByRole('option') as HTMLOptionElement[]
    expect(options[0].textContent).toBe('Select a Size')
    expect(options[0].disabled).toBe(true)
    expect(options[0].value).toBe('')
  })

  it('shows the placeholder as selected when nothing is chosen yet', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    expect(screen.getByRole('combobox')).toHaveValue('')
  })
})

describe('SizeSelector — option labels', () => {
  it('folds inches and centimetres into one string with no price', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    // 20" wide x 24" tall -> 51W x 61H cm, height first on both sides of the slash.
    expect(
      screen.getByRole('option', { name: `24"H x 20"W/ 61H x 51W CM` })
    ).toBeInTheDocument()
  })

  it('never prints a price anywhere in an option', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    for (const option of screen.getAllByRole('option')) {
      expect(option.textContent).not.toMatch(/₹|Rs\.|\d,\d{3}/)
    }
  })
})

describe('SizeSelector — selection', () => {
  it('reflects the selected variant id as the control value', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId="v2"
        onVariantSelect={() => {}}
      />
    )
    expect(screen.getByRole('combobox')).toHaveValue('v2')
  })

  it('calls onVariantSelect with the matching variant object on change', () => {
    let selected: SizeVariant | null = null
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={(v) => {
          selected = v
        }}
      />
    )
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'v2' },
    })
    expect(selected).toEqual(variants[1])
  })
})

describe('SizeSelector — availability', () => {
  it('disables the out-of-stock option but keeps it listed by default', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    const outOfStock = screen.getByRole('option', {
      name: /16"H x 12"W.*Out of stock/,
    }) as HTMLOptionElement
    expect(outOfStock.disabled).toBe(true)
  })

  it('omits out-of-stock variants entirely when showOutOfStock is false', () => {
    render(
      <SizeSelector
        variants={variants}
        selectedVariantId={null}
        onVariantSelect={() => {}}
        showOutOfStock={false}
      />
    )
    // Placeholder + the two in-stock variants only.
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('shows a message when there are no sizes to display', () => {
    render(
      <SizeSelector
        variants={[]}
        selectedVariantId={null}
        onVariantSelect={() => {}}
      />
    )
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('No sizes available')).toBeInTheDocument()
  })
})

describe('SizeSelectorSkeleton', () => {
  it('renders a single 52px bar rather than three stacked cards', () => {
    const { container } = render(<SizeSelectorSkeleton />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
    const bar = container.firstElementChild!
    expect(bar.className).toContain('h-[52px]')
    expect(bar.className).toContain('animate-pulse')
  })
})

describe('SizeSelectorCompact', () => {
  it('still renders one chip per available variant', () => {
    render(
      <SizeSelectorCompact
        variants={variants}
        selectedVariantId="v1"
        onVariantSelect={() => {}}
      />
    )
    // Only the two available variants — v3 is out of stock.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('marks the selected chip pressed', () => {
    render(
      <SizeSelectorCompact
        variants={variants}
        selectedVariantId="v1"
        onVariantSelect={() => {}}
      />
    )
    const pressed = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed?.textContent).toContain('20')
  })
})
