/**
 * ChooseOptions — size, frame and add-to-cart without leaving the grid (#420).
 *
 * mesonart ships one `<button is="hover-button" aria-controls="Quickview-...">
 * Choose options</button>` per card, opening a panel where the purchase is
 * completed in place.
 *
 * The decision on this ticket was to keep our eye decorative — the whole media
 * box already navigates to the product page — and add the labelled control
 * beside it. So this suite asserts a real, named, focusable button, not an icon
 * that a screen reader has to guess at.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ProductImage } from '@chobii/shared'

const getBySlug = vi.fn()

vi.mock('~/lib/api', () => ({
  productsApi: {
    getBySlug: (slug: string) => getBySlug(slug),
  },
}))

/**
 * jsdom here exposes a `localStorage` object whose `setItem` is undefined, and
 * the cart is a zustand `persist` store that writes on every mutation. The
 * storage getter is resolved once when the store module is evaluated, so this
 * has to be stubbed BEFORE the import below, not in `beforeEach`.
 */
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value)
  },
  removeItem: (key: string) => {
    memory.delete(key)
  },
  clear: () => memory.clear(),
})

const { ChooseOptions } = await import('~/components/product/ChooseOptions')
const { useCartStore } = await import('~/stores/cart')

const image: ProductImage = {
  id: 'i0',
  url: '/blush.webp',
  altText: 'Blush Hour',
  type: 'main',
  sortOrder: 0,
  width: 1500,
  height: 1500,
  originalKey: 'o0',
}

const product = {
  id: 'p1',
  title: 'Blush Hour',
  slug: 'blush-hour',
  basePrice: '1999.00',
  images: [image],
  orientation: 'portrait' as const,
}

/** What GET /api/products/:slug returns — the shape routes/posters/$slug.tsx reads. */
const apiProduct = {
  id: 'p1',
  sku: 'SKU-1',
  title: 'Blush Hour',
  slug: 'blush-hour',
  description: '',
  images: [image],
  orientation: 'portrait',
  variants: [
    {
      id: 'v-16x20',
      sizeId: 'portrait-landscape-16x20',
      sizeLabel: '16" x 20"',
      widthInches: 16,
      heightInches: 20,
      price: '1999.00',
      stockQuantity: 10,
      isInStock: true,
    },
    {
      id: 'v-24x36',
      sizeId: 'portrait-landscape-24x36',
      sizeLabel: '24" x 36"',
      widthInches: 24,
      heightInches: 36,
      price: '3499.00',
      stockQuantity: 4,
      isInStock: true,
    },
  ],
  frames: [
    {
      id: 'f-black',
      type: 'black',
      name: 'Classic Black',
      description: 'Matte black wood',
      priceModifier: 'fixed',
      priceAddition: '499.00',
    },
  ],
}

const open = async () => {
  const trigger = screen.getByRole('button', { name: /choose options/i })
  fireEvent.click(trigger)
  await screen.findByRole('dialog')
  return trigger
}

beforeEach(() => {
  getBySlug.mockReset()
  getBySlug.mockResolvedValue(apiProduct)
  useCartStore.setState({ items: [] })
})

describe('the trigger', () => {
  it('is a labelled button, not a bare icon', () => {
    render(<ChooseOptions product={product} />)

    const trigger = screen.getByRole('button', { name: /choose options/i })
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('aria-hidden')).toBeNull()
  })

  it('stays reachable by keyboard, so hover is not the only way in', () => {
    render(<ChooseOptions product={product} />)
    const trigger = screen.getByRole('button', { name: /choose options/i })

    // `pointer-events-none` and a negative tabindex are how the decorative eye
    // beside it is kept out of the way. Neither may apply here. Matched on the
    // bare utility — the Button base carries `disabled:pointer-events-none`,
    // which is a different thing and fine.
    expect(trigger.className).not.toMatch(/(^|\s)pointer-events-none(\s|$)/)
    expect(trigger.getAttribute('tabindex')).not.toBe('-1')

    trigger.focus()
    expect(document.activeElement).toBe(trigger)
  })

  it('says whether the panel is open', async () => {
    render(<ChooseOptions product={product} />)
    const trigger = screen.getByRole('button', { name: /choose options/i })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await open()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('opens nothing until it is pressed', () => {
    render(<ChooseOptions product={product} />)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(getBySlug).not.toHaveBeenCalled()
  })
})

describe('the panel', () => {
  it('is a modal dialog named after the product', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain('Blush Hour')
  })

  it('loads the real variants and frames for the slug', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    expect(getBySlug).toHaveBeenCalledWith('blush-hour')

    // Real variant ids matter: the cart carries variantId through to checkout,
    // so a ladder synthesised on the client would not resolve at order time.
    await screen.findByText('16" x 20"')
    await screen.findByText('24" x 36"')
    await screen.findByText('Classic Black')
  })

  it('fetches once across repeated opens', async () => {
    render(<ChooseOptions product={product} />)
    const trigger = await open()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(trigger)
    await screen.findByRole('dialog')

    expect(getBySlug).toHaveBeenCalledTimes(1)
  })

  it('preselects the first available size', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    const total = await screen.findByTestId('choose-options-total')
    expect(total.textContent).toContain('1,999')
  })

  it('adds the frame price to the total', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    fireEvent.click(await screen.findByRole('button', { name: 'Classic Black' }))

    // 1999 + 499
    await waitFor(() =>
      expect(screen.getByTestId('choose-options-total').textContent).toContain(
        '2,498'
      )
    )
  })
})

describe('adding to cart', () => {
  it('carries the chosen variant and frame into the cart', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    fireEvent.click(await screen.findByRole('button', { name: '24" x 36"' }))
    fireEvent.click(screen.getByRole('button', { name: 'Classic Black' }))
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))

    const item = useCartStore.getState().items[0]!
    expect(item.variantId).toBe('v-24x36')
    expect(item.frameId).toBe('f-black')
    expect(item.productSlug).toBe('blush-hour')
    expect(item.unitPrice).toBe(3499)
    expect(item.framePrice).toBe(499)
    expect(item.sizeLabel).toBe('24" x 36"')
  })

  it('closes and hands focus back to the trigger', async () => {
    render(<ChooseOptions product={product} />)
    const trigger = await open()

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
})

describe('getting out', () => {
  it('closes on Escape and restores focus', async () => {
    render(<ChooseOptions product={product} />)
    const trigger = await open()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on the close button and restores focus', async () => {
    render(<ChooseOptions product={product} />)
    const trigger = await open()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('leaves nothing in the cart when it is dismissed', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useCartStore.getState().items).toHaveLength(0)
  })
})

describe('when the fetch fails', () => {
  it('says so instead of offering an empty panel', async () => {
    getBySlug.mockRejectedValue(new Error('boom'))
    render(<ChooseOptions product={product} />)
    await open()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull()
  })
})
