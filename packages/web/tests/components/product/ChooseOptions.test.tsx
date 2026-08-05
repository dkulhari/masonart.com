/**
 * ChooseOptions — size, frame and add-to-cart without leaving the grid (#420).
 *
 * THE MEASURED QUICKVIEW (mesonart, 1440x1000, headless Chromium, computed
 * boxes — re-measured after the first attempt was rejected as not looking like
 * theirs):
 *
 *   backdrop            rgba(23,23,23,0.7), no blur
 *   modal               x 48..1392, y 116..884 — 1344 x 768, two columns
 *     left              product image 671 x 768, carousel dots along the bottom
 *     right             content column x 780..1332 (552 wide)
 *       vendor          y 160, small
 *       title + price   y ~190; price right-aligned, 24px/300
 *       rating          y 232, 14px/300
 *       "Size <value>"  y 275 — label 300 weight, chosen value 500
 *       SELECT          y 312, 552 x 52, bg rgba(23,23,23,0.024), radius 6
 *       "Frame: <value>" y 384, same label/value pair
 *       swatches        60px circles on a 100px pitch, 5 per row
 *       stock line      y ~605
 *       CTA row         y 675, h 60 — quantity stepper + black pill, radius 60
 *       full details    footer link
 *
 *   card trigger        172 x 40, radius 60, WHITE pill, black label at
 *                       16px/400, centred over the foot of the image,
 *                       `md:opacity-0` + `pointer-events-auto`
 *
 * A native `<select>` is theirs and is also the right call for our 17-step
 * ladder: chips wrapped to five rows and buried the frame row below the fold.
 *
 * The decision recorded on the ticket was to keep our eye decorative — the
 * media box already navigates to the product page — and add the labelled
 * control beside it. So this suite asserts a real, named, focusable button.
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

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: any) => (
    <a
      href={
        typeof to === 'string' && params?.slug
          ? to.replace('$slug', params.slug)
          : String(to)
      }
      {...rest}
    >
      {children}
    </a>
  ),
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

const img = (i: number): ProductImage => ({
  id: `i${i}`,
  url: `/blush-${i}.webp`,
  altText: `Blush Hour ${i}`,
  type: i === 0 ? 'main' : 'room-mockup',
  sortOrder: i,
  width: 1500,
  height: 1500,
  originalKey: `o${i}`,
})

const product = {
  id: 'p1',
  title: 'Blush Hour',
  slug: 'blush-hour',
  basePrice: '1999.00',
  images: [img(0), img(1), img(2)],
  orientation: 'portrait' as const,
  averageRating: 4.5,
  reviewCount: 12,
}

/** What GET /api/products/:slug returns — the shape routes/posters/$slug.tsx reads. */
const apiProduct = {
  id: 'p1',
  sku: 'SKU-1',
  title: 'Blush Hour',
  slug: 'blush-hour',
  description: '',
  images: [img(0), img(1), img(2)],
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
      stockQuantity: 3,
      isInStock: true,
    },
  ],
  frames: [
    {
      id: 'f-rolled',
      type: 'rolled',
      name: 'Rolled Canvas',
      description: 'Shipped in a tube',
      color: 'N/A',
      priceAddition: '0.00',
      priceModifier: '1.00',
      thumbnailUrl: '/frames/rolled.png',
    },
    {
      id: 'f-frameless',
      type: 'frameless',
      name: 'Frameless',
      description: 'Stretched, no moulding',
      color: 'N/A',
      priceAddition: '0.00',
      priceModifier: '1.33',
      thumbnailUrl: null,
    },
    {
      id: 'f-black',
      type: 'black',
      name: 'Stretch + Black Frame',
      description: 'Matte black',
      color: 'Matte Black',
      priceAddition: '0.00',
      priceModifier: '1.40',
      // A placeholder is what the seed used to ship; it must not reach a swatch.
      thumbnailUrl: 'https://placehold.co/100x100/1a1a1a/ffffff?text=Black',
    },
    {
      id: 'f-gold',
      type: 'gold',
      name: 'Stretch + Gold Frame',
      description: 'Antique gold',
      color: 'Antique Gold',
      priceAddition: '0.00',
      priceModifier: '1.40',
      thumbnailUrl: '/frames/gold.webp',
    },
  ],
}

const open = async () => {
  const trigger = screen.getByRole('button', { name: /choose options/i })
  fireEvent.click(trigger)
  await screen.findByRole('dialog')
  return trigger
}

const ready = async () => {
  await screen.findByLabelText('Size')
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

  it('is a white pill at the foot of the image, the way theirs is', () => {
    render(<ChooseOptions product={product} />)
    const trigger = screen.getByRole('button', { name: /choose options/i })

    // 172x40 at radius 60 on a white fill, centred — not our full-bleed black
    // bar. `h-10` is their 40; `rounded-pill` is their 60.
    expect(trigger.className).toContain('h-10')
    expect(trigger.className).toContain('rounded-pill')
    expect(trigger.className).toContain('bg-background')
    expect(trigger.className).toContain('-translate-x-1/2')
    expect(trigger.className).not.toContain('inset-x-4')
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

  it('gives the artwork its own column, as theirs does', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    // Their panel is 1344x768 split down the middle: image left, buy box
    // right. A 448px centred card with a 64px thumbnail is a different thing.
    const media = screen.getByTestId('quickview-media')
    expect(media.querySelector('img')).not.toBeNull()
    expect(screen.getByRole('dialog').className).toMatch(/md:grid-cols-2/)
  })

  it('offers the other images as carousel dots', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    // Three images, so three dots — theirs runs one per slide along the foot
    // of the image.
    const dots = screen.getAllByRole('button', { name: /view image \d/i })
    expect(dots).toHaveLength(3)

    fireEvent.click(dots[2]!)
    expect(
      screen.getByTestId('quickview-media').querySelector('img')?.getAttribute('src')
    ).toBe('/blush-2.webp')
  })

  it('carries the rating row', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    expect(
      screen.getByLabelText(/Rated 4.5 out of 5 from 12 reviews/)
    ).toBeTruthy()
  })

  it('links out to the full product page', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    const link = screen.getByRole('link', { name: /view full details/i })
    expect(link.getAttribute('href')).toBe('/posters/blush-hour')
  })

  it('loads the real variants and frames for the slug', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    expect(getBySlug).toHaveBeenCalledWith('blush-hour')
    expect(screen.getByRole('button', { name: 'Stretch + Black Frame' })).toBeTruthy()
  })

  it('fetches once across repeated opens', async () => {
    render(<ChooseOptions product={product} />)
    const trigger = await open()
    await ready()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(trigger)
    await screen.findByRole('dialog')

    expect(getBySlug).toHaveBeenCalledTimes(1)
  })
})

describe('choosing a size', () => {
  it('is a select, not seventeen chips', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    const select = screen.getByLabelText('Size')
    expect(select.tagName).toBe('SELECT')
    expect(
      [...(select as HTMLSelectElement).options].map((o) => o.textContent)
    ).toEqual(['16" x 20"', '24" x 36"'])
  })

  it('preselects the first available size', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    expect((screen.getByLabelText('Size') as HTMLSelectElement).value).toBe(
      'v-16x20'
    )
  })

  it('names the chosen size beside the label, as theirs does', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    fireEvent.change(screen.getByLabelText('Size'), {
      target: { value: 'v-24x36' },
    })

    expect(screen.getByTestId('quickview-size-value').textContent).toBe(
      '24" x 36"'
    )
  })
})

describe('choosing a frame', () => {
  it('heads the row with their format axis, not the word "Frame"', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    // Ours is their ladder now: the print in a tube, the print stretched, or
    // the print stretched and framed. "Frame:" named only the last of those.
    expect(screen.getByTestId('quickview-frame-label').textContent).toContain(
      'Rolled Canvas/Frameless/Framed:'
    )
  })

  it('opens on the tube option, the cheapest way to buy the piece', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    expect(screen.getByTestId('quickview-frame-value').textContent).toBe(
      'Rolled Canvas'
    )
    expect(
      screen.getByRole('button', { name: /add to cart/i }).textContent
    ).toContain('1,999')
  })

  it('offers a swatch per frame, named', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    expect(screen.getByRole('button', { name: 'Rolled Canvas' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stretch + Black Frame' })).toBeTruthy()
  })

  /**
   * Theirs are photographs — a corner of each frame shot on white, circular
   * cropped, ringed and shadowed. Ours have to be OUR photographs, so the
   * swatch renders whatever the frame's own asset is and draws the corner
   * itself when there is no usable one.
   *
   * The seed currently ships placehold.co URLs, which would put a grey
   * "Black+Frame" placard on the panel — worse than the drawing.
   */
  it('uses the frame photograph when the data carries a real one', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    const swatch = screen.getByRole('button', { name: 'Stretch + Gold Frame' })
    expect(swatch.querySelector('img')?.getAttribute('src')).toBe(
      '/frames/gold.webp'
    )
  })

  it('draws the corner when the asset is a placeholder', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    const swatch = screen.getByRole('button', { name: 'Stretch + Black Frame' })
    expect(swatch.querySelector('img')).toBeNull()
    expect(swatch.querySelector('[data-testid="frame-corner"]')).not.toBeNull()
  })

  it('draws the format when there is no photograph of it', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    const swatch = screen.getByRole('button', { name: 'Frameless' })
    expect(swatch.querySelector('img')).toBeNull()
    expect(swatch.querySelector('[data-testid="frame-corner"]')).not.toBeNull()
  })

  it('uses the photograph for the tube option', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    expect(
      screen
        .getByRole('button', { name: 'Rolled Canvas' })
        .querySelector('img')
        ?.getAttribute('src')
    ).toBe('/frames/rolled.png')
  })

  it('names each swatch in a pill, the way theirs does on hover', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    const swatch = screen.getByRole('button', { name: 'Stretch + Gold Frame' })
    const pill = swatch.querySelector('[data-testid="frame-name"]')

    expect(pill?.textContent).toBe('Stretch + Gold Frame')
    // Decorative duplicate — the button already carries the name.
    expect(pill?.getAttribute('aria-hidden')).toBe('true')
  })

  it('marks the chosen one as pressed and names it beside the label', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    const black = screen.getByRole('button', { name: 'Stretch + Black Frame' })
    fireEvent.click(black)

    expect(black.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('quickview-frame-value').textContent).toBe(
      'Stretch + Black Frame'
    )
  })
})

describe('the price on the button', () => {
  it('quotes the total on the CTA, the way theirs does', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    const cta = screen.getByRole('button', { name: /add to cart/i })
    expect(cta.textContent).toContain('1,999')

    fireEvent.click(screen.getByRole('button', { name: 'Stretch + Black Frame' }))
    await waitFor(() => expect(cta.textContent).toContain('2,799'))
  })

  /**
   * A moulding for a 12x16 and one for a 60x80 are not the same amount of
   * timber. Theirs scale hard — measured across three sizes of one piece:
   *
   *   24x24  $260 rolled  $460 frameless (+77%)  $480 framed (+85%)
   *   40x40  $585         $990           (+69%)  $1,030      (+76%)
   *   72x72  $1,625       $3,020         (+86%)  $3,100      (+91%)
   *
   * So the frame is a multiplier on the piece, not a flat fee. Ours keeps that
   * shape at our own magnitude: +33% stretched, +40% framed.
   */
  it('scales the frame with the size, rather than charging a flat fee', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'Stretch + Black Frame' }))
    const cta = screen.getByRole('button', { name: /add to cart/i })

    // 1999 + 40%
    await waitFor(() => expect(cta.textContent).toContain('2,799'))

    fireEvent.change(screen.getByLabelText('Size'), {
      target: { value: 'v-24x36' },
    })

    // 3499 + 40% — the addition grew with the piece, it did not stay at 800.
    await waitFor(() => expect(cta.textContent).toContain('4,899'))
  })

  it('charges the stretched format less than the framed one', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    const cta = screen.getByRole('button', { name: /add to cart/i })

    fireEvent.click(screen.getByRole('button', { name: 'Frameless' }))
    // 1999 + 33%
    await waitFor(() => expect(cta.textContent).toContain('2,659'))
  })

  it('multiplies by the quantity', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }))

    const cta = screen.getByRole('button', { name: /add to cart/i })
    await waitFor(() => expect(cta.textContent).toContain('3,998'))
  })
})

describe('quantity', () => {
  it('starts at one and will not go below it', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    expect(screen.getByTestId('quickview-quantity').textContent).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    expect(screen.getByTestId('quickview-quantity').textContent).toBe('1')
  })
})

describe('adding to cart', () => {
  it('carries the chosen variant, frame and quantity into the cart', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    fireEvent.change(screen.getByLabelText('Size'), {
      target: { value: 'v-24x36' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stretch + Black Frame' }))
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }))
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))

    const item = useCartStore.getState().items[0]!
    expect(item.variantId).toBe('v-24x36')
    expect(item.frameId).toBe('f-black')
    expect(item.productSlug).toBe('blush-hour')
    expect(item.unitPrice).toBe(3499)
    expect(item.framePrice).toBe(1400)
    expect(item.quantity).toBe(2)
    expect(item.sizeLabel).toBe('24" x 36"')
  })

  it('sends no frame id for the print-only option', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'Rolled Canvas' }))
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))
    expect(useCartStore.getState().items[0]!.framePrice).toBe(0)
  })

  it('closes and hands focus back to the trigger', async () => {
    render(<ChooseOptions product={product} />)
    const trigger = await open()
    await ready()

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
})

describe('getting out', () => {
  it('gives the close button the same wipe the toolbar pills have', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    // Not a hover tint — the circle-wipe off the `outline` variant, so it goes
    // black under the cursor exactly like Hide filters and Sort by.
    const close = screen.getByRole('button', { name: /close/i })
    expect(close.className).toContain('before:scale-0')
    expect(close.className).toContain('hover:before:scale-100')
    expect(close.className).toContain('hover:text-primary-foreground')
  })

  it('turns the pointer into a close control outside the panel', async () => {
    render(<ChooseOptions product={product} />)
    await open()

    // Theirs hides the native cursor over the backdrop and follows the pointer
    // with a round X. Anywhere off the panel IS the close button.
    const backdrop = screen.getByTestId('quickview-backdrop')
    expect(backdrop.className).toContain('cursor-none')

    fireEvent.mouseMove(backdrop, { clientX: 120, clientY: 240 })
    expect(screen.getByTestId('quickview-cursor')).toBeTruthy()
  })

  it('closes when the backdrop is clicked, and restores focus', async () => {
    render(<ChooseOptions product={product} />)
    const trigger = await open()

    fireEvent.click(screen.getByTestId('quickview-backdrop'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

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

describe('stock', () => {
  it('reports a genuinely low count, and says nothing otherwise', async () => {
    render(<ChooseOptions product={product} />)
    await open()
    await ready()

    // 16x20 has ten in stock — no line. Theirs shows "Hurry, only 1 item left"
    // and ours only ever repeats a real number.
    expect(screen.queryByTestId('quickview-stock')).toBeNull()

    fireEvent.change(screen.getByLabelText('Size'), {
      target: { value: 'v-24x36' },
    })
    expect(screen.getByTestId('quickview-stock').textContent).toContain('3')
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
