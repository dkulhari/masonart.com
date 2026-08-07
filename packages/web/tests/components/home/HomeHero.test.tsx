/**
 * The home page's hero band (#529).
 *
 * What is worth pinning here is not that an image renders. It is the five
 * decisions the band would be wrong without:
 *
 *   1. ONE TABLE OWNS EVERY IMAGE PATH. The photography under
 *      `public/dev-reference/` is mesonart's, git-ignored, and #544 blocks
 *      go-live on replacing it. If a path is ever written inline in the JSX,
 *      that swap becomes a hunt instead of an edit, so the source file is
 *      asserted to contain no second reference to the directory.
 *
 *   2. A MISSING PLACEHOLDER HIDES THE BAND. The directory is git-ignored, so a
 *      clone that has not run the fetch script has no images at all. That must
 *      render nothing, not a row of broken-image glyphs above the fold.
 *
 *   3. THE ENDS ARE CLONED. The bar peeks a slide at BOTH edges while showing
 *      its first, which `scrollLeft: 0` on a plain scroller cannot do. The
 *      track therefore renders `[last, ...slides, first]`, and the clones are
 *      hidden from assistive tech so the same photograph is not announced
 *      three times.
 *
 *   4. ONE CTA FOR THE WHOLE BAND. The pill sits above the track, not inside
 *      every slide, so N slides do not put N links with the same accessible
 *      name on the page.
 *
 *   5. THE MEASURED GEOMETRY. The peek is not positioned anywhere — it is
 *      `inset - gap`, which is 20-20=0 on the phone and 48-30=18 on the
 *      desktop, exactly as measured off the bar. Those four numbers ARE the
 *      parity claim, so they are pinned here rather than left to a screenshot.
 *
 * Links are stubbed as anchors so `to` is assertable, the same way the
 * orientation-chip test does it.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: Record<string, unknown>) => (
    <a href={String(to)} {...(props as object)}>
      {children as React.ReactNode}
    </a>
  ),
}))

import {
  HomeHero,
  HERO_SLIDES,
  HERO_IMAGE_BASE,
  type HeroSlide,
} from '~/components/home/HomeHero'

const src = readFileSync(
  join(process.cwd(), 'app/components/home/HomeHero.tsx'),
  'utf8'
)

const TWO: HeroSlide[] = [
  { id: 'a', desktopSrc: '/a-wide.jpg', mobileSrc: '/a-tall.jpg', alt: 'A' },
  { id: 'b', desktopSrc: '/b-wide.jpg', mobileSrc: '/b-tall.jpg', alt: 'B' },
]

// ============================================================================
// The slide table
// ============================================================================

describe('the slide table', () => {
  it('gives every slide both a wide and a tall crop', () => {
    expect(HERO_SLIDES.length).toBeGreaterThan(0)

    for (const slide of HERO_SLIDES) {
      expect(slide.desktopSrc).toContain(HERO_IMAGE_BASE)
      expect(slide.mobileSrc).toContain(HERO_IMAGE_BASE)
      expect(slide.desktopSrc).not.toBe(slide.mobileSrc)
      expect(slide.alt.length).toBeGreaterThan(0)
    }
  })

  /**
   * The placeholders are mesonart's photographs. Ticket #544 replaces them, and
   * that replacement has to be an edit to `HERO_SLIDES` and nothing else.
   */
  it('is the only place the placeholder directory is named', () => {
    const literal = '/dev-reference/hero'
    const mentions = src.split(literal).length - 1

    // Exactly one runtime mention: the `HERO_IMAGE_BASE` assignment. Anything
    // higher means a path was written inline in the JSX.
    const inCode = src
      .split('\n')
      .filter((line) => line.includes(literal) && !line.trimStart().startsWith('*'))

    expect(mentions).toBeGreaterThan(0)
    expect(inCode).toHaveLength(1)
    expect(inCode[0]).toContain('HERO_IMAGE_BASE')
  })

  it('does not print a discount or a campaign of its own', () => {
    // The words on the placeholder are pixels inside mesonart's JPEG. This
    // component must never render copy that claims a promotion we are not
    // running — the sale surfaces own that, and they read a real row.
    const { container } = render(<HomeHero slides={TWO} />)

    expect(container.textContent).not.toMatch(/%|off\b|sale/i)
    expect(src.includes('promotions/active')).toBe(false)
  })
})

// ============================================================================
// The band
// ============================================================================

describe('HomeHero', () => {
  it('renders nothing when there are no slides', () => {
    const { container } = render(<HomeHero slides={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('hides the whole band when a placeholder image fails to load', () => {
    const { container } = render(<HomeHero slides={TWO} />)

    fireEvent.error(screen.getAllByRole('img')[0])

    expect(container).toBeEmptyDOMElement()
  })

  it('renders one slide per entry, plus a clone at each end', () => {
    render(<HomeHero slides={TWO} />)

    expect(screen.getAllByTestId('home-hero-slide')).toHaveLength(2)
    expect(screen.getAllByTestId('home-hero-clone')).toHaveLength(2)
  })

  it('clones the last slide in front and the first behind', () => {
    render(<HomeHero slides={TWO} />)

    const clones = screen.getAllByTestId('home-hero-clone')
    expect(clones[0].querySelector('img')).toHaveAttribute('src', '/b-tall.jpg')
    expect(clones[1].querySelector('img')).toHaveAttribute('src', '/a-tall.jpg')
  })

  it('keeps the clones out of the accessibility tree', () => {
    render(<HomeHero slides={TWO} />)

    for (const clone of screen.getAllByTestId('home-hero-clone')) {
      expect(clone).toHaveAttribute('aria-hidden', 'true')
      expect(clone.querySelector('img')).toHaveAttribute('alt', '')
    }
    // One photograph, announced once.
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('does not clone a single slide, and drops the arrows with it', () => {
    render(<HomeHero slides={[TWO[0]]} />)

    expect(screen.queryAllByTestId('home-hero-clone')).toHaveLength(0)
    expect(screen.queryByLabelText('Next slide')).toBeNull()
  })

  it('serves a wide crop above the breakpoint and a tall one below', () => {
    render(<HomeHero slides={TWO} />)

    const slide = screen.getAllByTestId('home-hero-slide')[0]
    expect(slide.querySelector('source')).toHaveAttribute(
      'media',
      '(min-width: 768px)'
    )
    expect(slide.querySelector('source')).toHaveAttribute('srcset', '/a-wide.jpg')
    expect(slide.querySelector('img')).toHaveAttribute('src', '/a-tall.jpg')
  })

  it('gives the whole band one CTA, not one per slide', () => {
    render(<HomeHero slides={TWO} />)

    const cta = screen.getAllByTestId('home-hero-cta')
    expect(cta).toHaveLength(1)
    expect(cta[0]).toHaveAttribute('href', '/posters')
  })

  it('keeps the page an h1 even though the bar’s hero is pixels', () => {
    render(<HomeHero slides={TWO} />)

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('loads the two photographs on screen at rest eagerly', () => {
    render(<HomeHero slides={TWO} />)

    const images = Array.from(document.querySelectorAll('img'))
    expect(images[0]).toHaveAttribute('loading', 'eager')
    expect(images[1]).toHaveAttribute('loading', 'eager')
    expect(images[1]).toHaveAttribute('fetchpriority', 'high')
    expect(images[images.length - 1]).toHaveAttribute('loading', 'lazy')
  })
})

// ============================================================================
// The measured geometry
// ============================================================================

describe('the measured geometry', () => {
  it('carries the measured inset and gap, from which the peek falls out', () => {
    render(<HomeHero slides={TWO} />)

    const band = screen.getByTestId('home-hero')
    // 20 - 20 = 0px of peek on the phone: one full-bleed card, as measured.
    expect(band.className).toContain('[--hero-inset:20px]')
    expect(band.className).toContain('[--hero-gap:20px]')
    // 48 - 30 = 18px of peek at 1440, as measured.
    expect(band.className).toContain('md:[--hero-inset:48px]')
    expect(band.className).toContain('md:[--hero-gap:30px]')
  })

  it('sizes the slide off the track’s content box, never the viewport', () => {
    render(<HomeHero slides={TWO} />)

    // `w-full` inside a track already padded by the inset IS the slide width.
    // A `100vw` rule would include the scrollbar and overhang the page.
    expect(screen.getAllByTestId('home-hero-slide')[0].className).toContain(
      'w-full'
    )
    const track = screen.getByTestId('home-hero-track')
    expect(track.className).toContain('px-[var(--hero-inset)]')
    expect(track.className).toContain('[scroll-padding-inline:var(--hero-inset)]')
  })

  it('opens flush under the category rail — no band padding of its own', () => {
    render(<HomeHero slides={TWO} />)

    const band = screen.getByTestId('home-hero')
    expect(band.className).not.toMatch(/(^|\s)(py-|pt-|mt-)/)
  })

  /**
   * A CSS `scroll-behavior` default would animate the clone-to-twin jump, and
   * the seam is only invisible because that jump is instant.
   */
  it('leaves scroll behaviour to the code that knows which move it is', () => {
    render(<HomeHero slides={TWO} />)

    expect(screen.getByTestId('home-hero-track').className).not.toContain(
      'scroll-smooth'
    )
  })
})
