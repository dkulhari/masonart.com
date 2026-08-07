/**
 * ProductCardMedia tests
 *
 * The square media box and the hover interaction. The structural assertions
 * here are the important ones: exactly ONE in-flow image (which defines the box
 * height) and every hover slide absolutely positioned (so it cannot). That is
 * the mechanism the whole grid alignment rests on, so it is pinned by tests
 * rather than left to convention.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ProductImage } from '@chobii/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}))

const { ProductCardMedia } = await import('~/components/product/ProductCardMedia')

const img = (i: number): ProductImage => ({
  id: `i${i}`,
  url: `/img${i}.webp`,
  altText: `alt ${i}`,
  type: i === 0 ? 'main' : 'room-mockup',
  sortOrder: i,
  width: 1500,
  height: 1500,
  originalKey: `originals/o${i}`,
})

const many = (n: number) => Array.from({ length: n }, (_, i) => img(i))

const mediaBox = (c: HTMLElement) =>
  c.querySelector('[data-testid="media-box"]') as HTMLElement

describe('ProductCardMedia — structure', () => {
  it('renders exactly one in-flow image, carrying the ratio', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    const inFlow = container.querySelectorAll('img:not(.absolute)')
    expect(inFlow).toHaveLength(1)
    expect(inFlow[0]!.className).toContain('aspect-square')
  })

  it('renders hover slides absolutely so they cannot affect height', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    const abs = container.querySelectorAll('img.absolute')
    expect(abs).toHaveLength(3)
    abs.forEach((el) => expect(el.className).toContain('inset-0'))
  })

  it('uses the main image as the in-flow one regardless of array order', () => {
    const shuffled = [img(2), img(0), img(1)] // img(0) is type 'main'
    const { container } = render(
      <ProductCardMedia images={shuffled} slug="s" title="t" />
    )
    const inFlow = container.querySelector('img:not(.absolute)')!
    expect(inFlow.getAttribute('src')).toBe('/img0.webp')
  })

  it('sets width and height attributes on every image (CLS reservation)', () => {
    const { container } = render(<ProductCardMedia images={many(3)} slug="s" title="t" />)
    container.querySelectorAll('img').forEach((el) => {
      expect(el.getAttribute('width')).toBe('1500')
      expect(el.getAttribute('height')).toBe('1500')
    })
  })

  it('sets sizes on every image, avoiding the 100vw over-fetch', () => {
    const { container } = render(<ProductCardMedia images={many(3)} slug="s" title="t" />)
    container.querySelectorAll('img').forEach((el) => {
      expect(el.getAttribute('sizes')).toBeTruthy()
    })
  })

  it('gives the in-flow image the product alt text and hides the rest', () => {
    const { container } = render(<ProductCardMedia images={many(3)} slug="s" title="t" />)
    const inFlow = container.querySelector('img:not(.absolute)')!
    expect(inFlow.getAttribute('alt')).toBe('alt 0')
    container.querySelectorAll('img.absolute').forEach((el) => {
      expect(el.getAttribute('alt')).toBe('')
      expect(el.getAttribute('aria-hidden')).toBe('true')
    })
  })
})

describe('ProductCardMedia — art framing', () => {
  /**
   * The mat is baked into the pixels, so a 3:1 panorama and a square both
   * arrive as 1500x1500 and the card drew them at wildly different optical
   * weights. `artBox` is the measurement that lets it re-frame them; the
   * mechanism is clip-path + transform precisely because neither can move the
   * box, so the row-alignment contract above is untouched.
   */
  const boxed = (i: number, box: { x: number; y: number; w: number; h: number }) => ({
    ...img(i),
    artBox: box,
  })

  it('frames an image that carries a box', () => {
    const { container } = render(
      <ProductCardMedia
        images={[boxed(0, { x: 0.06, y: 0.27, w: 0.88, h: 0.45 })]}
        slug="s"
        title="t"
      />
    )
    const el = container.querySelector('img') as HTMLImageElement
    expect(el.style.clipPath).toContain('inset(')
    expect(el.style.transform).toContain('scale(')
    expect(el.style.transformOrigin).toBe('0 0')
  })

  it('leaves an un-measured image exactly as it was', () => {
    const { container } = render(
      <ProductCardMedia images={many(1)} slug="s" title="t" />
    )
    const el = container.querySelector('img') as HTMLImageElement
    expect(el.style.clipPath).toBe('')
    expect(el.style.transform).toBe('')
  })

  it('frames each hover slide on its own box, not the primary one', () => {
    // A room mockup and the artwork hanging in it are not the same shape;
    // framing them together would make the hover jump.
    const { container } = render(
      <ProductCardMedia
        images={[
          boxed(0, { x: 0.06, y: 0.27, w: 0.88, h: 0.45 }),
          boxed(1, { x: 0.27, y: 0.06, w: 0.46, h: 0.88 }),
        ]}
        slug="s"
        title="t"
      />
    )
    const [primary, slide] = [...container.querySelectorAll('img')]
    expect(primary!.style.transform).not.toBe(slide!.style.transform)
  })

  it('never lets framing reach the layout box', () => {
    // Only paint-time properties. Anything that sizes or positions the element
    // would break the grid's row alignment.
    const { container } = render(
      <ProductCardMedia
        images={[boxed(0, { x: 0.06, y: 0.27, w: 0.88, h: 0.45 })]}
        slug="s"
        title="t"
      />
    )
    const style = (container.querySelector('img') as HTMLImageElement).style
    for (const property of ['width', 'height', 'position', 'top', 'left', 'margin']) {
      expect(style.getPropertyValue(property)).toBe('')
    }
  })
})

describe('ProductCardMedia — LCP', () => {
  it('lazy-loads by default', () => {
    const { container } = render(<ProductCardMedia images={many(2)} slug="s" title="t" />)
    const primary = container.querySelector('img:not(.absolute)')!
    expect(primary.getAttribute('loading')).toBe('lazy')
    expect(primary.getAttribute('fetchpriority')).toBeNull()
  })

  it('loads the primary image eagerly when it is the LCP candidate', () => {
    const { container } = render(
      <ProductCardMedia images={many(3)} slug="s" title="t" priority />
    )
    const primary = container.querySelector('img:not(.absolute)')!
    expect(primary.getAttribute('loading')).toBe('eager')
    expect(primary.getAttribute('fetchpriority')).toBe('high')
  })

  it('keeps the hover slides lazy even then — only the visible one is urgent', () => {
    const { container } = render(
      <ProductCardMedia images={many(3)} slug="s" title="t" priority />
    )
    container.querySelectorAll('img.absolute').forEach((el) => {
      expect(el.getAttribute('loading')).toBe('lazy')
    })
  })
})

describe('ProductCardMedia — single image degrades cleanly', () => {
  it('renders no hover slides and no dots', () => {
    const { container } = render(<ProductCardMedia images={many(1)} slug="s" title="t" />)
    expect(container.querySelectorAll('img.absolute')).toHaveLength(0)
    expect(container.querySelector('[data-testid="card-dots"]')).toBeNull()
  })

  it('renders nothing at all for an empty media list', () => {
    const { container } = render(<ProductCardMedia images={[]} slug="s" title="t" />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })
})

describe('ProductCardMedia — dots', () => {
  it('renders n-1 dots, matching mesonart hiding the first', () => {
    render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    expect(screen.getByTestId('card-dots').children).toHaveLength(3)
  })

  it('renders no dots for two media (nothing to disambiguate)', () => {
    const { container } = render(<ProductCardMedia images={many(2)} slug="s" title="t" />)
    expect(container.querySelector('[data-testid="card-dots"]')).toBeNull()
  })

  it('marks dots decorative so they are not fake buttons', () => {
    render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    expect(screen.getByTestId('card-dots').getAttribute('aria-hidden')).toBe('true')
  })
})

describe('ProductCardMedia — dots must escape the rounded clip', () => {
  /**
   * Regression: the dots sit at bottom-[-14px], deliberately outside the image
   * box (measured on mesonart). The rounded corners need overflow-hidden, so if
   * that clip is on an ancestor of the dots they are silently cut off — which
   * is exactly what happened, and jsdom cannot catch it by layout.
   *
   * Asserted structurally instead: no overflow-hidden element may contain the
   * dots.
   */
  it('dots are not inside any overflow-hidden ancestor', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    const dots = container.querySelector('[data-testid="card-dots"]')!
    const clipped = [...container.querySelectorAll('.overflow-hidden')].filter((el) =>
      el.contains(dots)
    )
    expect(clipped).toHaveLength(0)
  })

  it('the images ARE inside the rounded clip, so corners still round', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    const clip = container.querySelector('.overflow-hidden')!
    expect(clip.className).toContain('rounded-')
    expect(clip.querySelectorAll('img').length).toBe(4)
  })

  it('the in-flow image still sets the height after the restructure', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    const inFlow = container.querySelectorAll('img:not(.absolute)')
    expect(inFlow).toHaveLength(1)
    expect(inFlow[0]!.className).toContain('aspect-square')
  })
})

describe('ProductCardMedia — hover', () => {
  it('activates a slide on mouse pointermove', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    fireEvent.pointerMove(mediaBox(container), { pointerType: 'mouse', clientX: 90 })
    expect(container.querySelectorAll('img.absolute.opacity-100')).toHaveLength(1)
  })

  it('resets to the primary image on pointerleave', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    const box = mediaBox(container)
    fireEvent.pointerMove(box, { pointerType: 'mouse', clientX: 90 })
    expect(container.querySelectorAll('img.absolute.opacity-100')).toHaveLength(1)
    fireEvent.pointerLeave(box)
    expect(container.querySelectorAll('img.absolute.opacity-100')).toHaveLength(0)
  })

  it('ignores touch pointers so a tap navigates instead of swapping', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    fireEvent.pointerMove(mediaBox(container), { pointerType: 'touch', clientX: 90 })
    expect(container.querySelectorAll('img.absolute.opacity-100')).toHaveLength(0)
  })

  it('ignores pen pointers as well', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    fireEvent.pointerMove(mediaBox(container), { pointerType: 'pen', clientX: 90 })
    expect(container.querySelectorAll('img.absolute.opacity-100')).toHaveLength(0)
  })

  it('only ever shows one hover slide at a time', () => {
    const { container } = render(<ProductCardMedia images={many(5)} slug="s" title="t" />)
    const box = mediaBox(container)
    for (const x of [5, 30, 60, 95]) {
      fireEvent.pointerMove(box, { pointerType: 'mouse', clientX: x })
      expect(container.querySelectorAll('img.absolute.opacity-100').length).toBeLessThanOrEqual(1)
    }
  })
})

describe('ProductCardMedia — accessibility', () => {
  it('takes the media link out of the tab order (the title link is focusable)', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    expect(mediaBox(container).getAttribute('tabindex')).toBe('-1')
  })

  it('labels the media link with the product title', () => {
    const { container } = render(
      <ProductCardMedia images={many(4)} slug="s" title="Wabi-Sabi #TX462" />
    )
    expect(mediaBox(container).getAttribute('aria-label')).toBe('Wabi-Sabi #TX462')
  })

  it('gates transitions behind motion-safe', () => {
    const { container } = render(<ProductCardMedia images={many(4)} slug="s" title="t" />)
    container.querySelectorAll('img.absolute').forEach((el) => {
      expect(el.className).toContain('motion-safe:')
    })
  })
})
