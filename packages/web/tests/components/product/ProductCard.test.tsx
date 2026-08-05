/**
 * ProductCard tests
 *
 * Covers the two defects this ticket resolves:
 *   D2 — the bordered wrapper was content-height while the <a> stretched, so
 *        cards in a row ended at different heights. Fixed by deletion: the
 *        matted image IS the card, so there is no box left to be ragged.
 *   D3 — the skeleton hardcoded aspect-[2/3] regardless of the card's ratio,
 *        guaranteeing a layout shift. Fixed by both importing MEDIA_RATIO.
 *
 * Several assertions read the source text. That is deliberate: the point of
 * this ticket is that certain code is GONE, and a rendering test cannot prove
 * absence of a prop or a lookup table.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProductImage } from '@chobii/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}))

const { ProductCard } = await import('~/components/product/ProductCard')
const { ProductCardSkeleton } = await import('~/components/product/ProductCardSkeleton')
const { MEDIA_RATIO } = await import('~/components/product/productCardTokens')

/**
 * Source with comments stripped.
 *
 * These files deliberately *document* what was deleted — the header of
 * ProductCard explains why ASPECT_RATIO_MAP and uniformAspectRatio are gone.
 * Asserting on raw text would therefore fail on the explanation itself, so we
 * assert on code only.
 */
const src = (f: string) =>
  readFileSync(join(process.cwd(), 'app/components/product', f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\/\/.*$/gm, '') // line comments
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments

const img = (i: number): ProductImage => ({
  id: `i${i}`,
  url: `/img${i}.webp`,
  altText: `alt ${i}`,
  type: i === 0 ? 'main' : 'room-mockup',
  sortOrder: i,
  width: 1500,
  height: 1500,
  originalKey: `o${i}`,
})

const product = {
  id: 'p1',
  title: 'Wabi-Sabi Wall Art #TX462',
  slug: 'wabi-sabi-tx462',
  basePrice: '28000.00',
  images: [img(0), img(1), img(2), img(3)],
  orientation: 'portrait' as const,
  styles: ['wabi-sabi', 'minimalist'],
}

describe('ratio machinery is gone', () => {
  it('ProductCard no longer defines ASPECT_RATIO_MAP', () => {
    expect(src('ProductCard.tsx')).not.toContain('ASPECT_RATIO_MAP')
  })

  it('ProductCard no longer accepts uniformAspectRatio', () => {
    expect(src('ProductCard.tsx')).not.toContain('uniformAspectRatio')
  })

  it('no hardcoded aspect- literal outside the tokens file', () => {
    for (const f of ['ProductCard.tsx', 'ProductCardSkeleton.tsx', 'ProductCardMedia.tsx']) {
      expect(src(f), `${f} should defer to MEDIA_RATIO`).not.toMatch(/aspect-\[/)
    }
  })

  it('the content-height bordered wrapper is gone (D2)', () => {
    const s = src('ProductCard.tsx')
    expect(s).not.toContain('border-border')
    expect(s).not.toContain('card-hover')
  })

  it('no longer branches on product.orientation for layout', () => {
    expect(src('ProductCard.tsx')).not.toContain('product.orientation')
  })
})

describe('ProductCard — rendering', () => {
  it('renders as a grid item that stretches', () => {
    const { container } = render(<ProductCard product={product} />)
    const root = container.firstElementChild!
    expect(root.tagName).toBe('LI')
    expect(root.className).toContain('flex')
    expect(root.className).toContain('flex-col')
  })

  it('exposes a stable test hook for the e2e alignment spec', () => {
    const { container } = render(<ProductCard product={product} />)
    expect(container.querySelector('[data-testid="product-card"]')).not.toBeNull()
  })

  it('renders the media box', () => {
    const { container } = render(<ProductCard product={product} />)
    expect(container.querySelector('[data-testid="media-box"]')).not.toBeNull()
  })

  it('renders the title as a focusable link', () => {
    // Two links carry the product name: the media box (aria-label, tabIndex -1)
    // and the title. Keyboard users must be able to reach the title one.
    const { container } = render(<ProductCard product={product} />)
    const titleLink = [...container.querySelectorAll('a')].find(
      (a) => a.textContent?.trim() === 'Wabi-Sabi Wall Art #TX462'
    )
    expect(titleLink).toBeDefined()
    expect(titleLink!.getAttribute('tabindex')).not.toBe('-1')
  })

  it('keeps the media link out of the tab order so the card has one stop', () => {
    const { container } = render(<ProductCard product={product} />)
    const media = container.querySelector('[data-testid="media-box"]')!
    expect(media.getAttribute('tabindex')).toBe('-1')
  })

  it('renders the price', () => {
    render(<ProductCard product={product} />)
    expect(screen.getByText(/28,000/)).toBeInTheDocument()
  })

  it('gives the content block grow, so it absorbs grid stretch slack', () => {
    const { container } = render(<ProductCard product={product} />)
    const content = container.querySelector('[data-testid="card-content"]')!
    expect(content.className).toContain('grow')
  })

  it('does NOT height-lock the title — alignment comes from grid stretch', () => {
    const { container } = render(<ProductCard product={product} />)
    const content = container.querySelector('[data-testid="card-content"]')!
    expect(content.className).not.toMatch(/min-h-/)
    expect(content.innerHTML).not.toMatch(/line-clamp-/)
  })

  it('still renders the featured badge', () => {
    render(<ProductCard product={{ ...product, isFeatured: true }} />)
    expect(screen.getByText('Featured')).toBeInTheDocument()
  })

  it('still renders the AI badge', () => {
    render(<ProductCard product={{ ...product, isAiGenerated: true }} />)
    expect(screen.getByText('AI')).toBeInTheDocument()
  })

  it('renders without images without throwing', () => {
    const { container } = render(<ProductCard product={{ ...product, images: [] }} />)
    expect(container.querySelector('[data-testid="product-card"]')).not.toBeNull()
  })
})

/**
 * #420 — the card gets a labelled purchase control beside the decorative eye.
 *
 * The decision on that ticket was to keep the eye as decoration on a media box
 * that already navigates to the product page, and add a named button for the
 * other destination.
 */
describe('ProductCard — Choose options', () => {
  it('offers exactly one labelled trigger per card', () => {
    render(<ProductCard product={product} />)
    expect(
      screen.getAllByRole('button', { name: /choose options/i })
    ).toHaveLength(1)
  })

  it('keeps it outside the media link, so the two do not nest', () => {
    const { container } = render(<ProductCard product={product} />)
    const media = container.querySelector('[data-testid="media-box"]')!
    const trigger = screen.getByRole('button', { name: /choose options/i })

    expect(media.contains(trigger)).toBe(false)
  })

  it('leaves the eye decorative', () => {
    const { container } = render(<ProductCard product={product} />)
    const eye = container.querySelector('[data-testid="quick-view"]')!

    expect(eye.getAttribute('aria-hidden')).toBe('true')
    expect(eye.className).toContain('pointer-events-none')
  })
})

describe('ProductCardSkeleton — D3', () => {
  it('reserves the same ratio as the real card', () => {
    const { container } = render(<ProductCardSkeleton />)
    expect(container.querySelector(`.${MEDIA_RATIO}`)).not.toBeNull()
  })

  it('imports the ratio rather than hardcoding it', () => {
    expect(src('ProductCardSkeleton.tsx')).toContain('MEDIA_RATIO')
  })

  it('renders as an li so it occupies a grid cell like a real card', () => {
    const { container } = render(<ProductCardSkeleton />)
    expect(container.firstElementChild!.tagName).toBe('LI')
  })
})
