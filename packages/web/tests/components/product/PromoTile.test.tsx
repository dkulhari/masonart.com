/**
 * PromoTile — the occasional promo cell mesonart drops into its grid (§1.3.6).
 *
 * Theirs reads "Rated 4.9/5 by 9,000+ Users". Ours reads whatever the
 * catalogue's approved reviews actually say, or it does not render. Most of
 * this suite is about the second half of that sentence.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}))

const { PromoTile, MIN_PROMO_REVIEWS } = await import(
  '~/components/product/PromoTile'
)

describe('with enough real reviews', () => {
  it('shows the average', () => {
    render(<PromoTile averageRating={4.5} reviewCount={312} />)
    expect(screen.getByText(/4\.5/)).toBeTruthy()
  })

  it('shows the count', () => {
    render(<PromoTile averageRating={4.5} reviewCount={312} />)
    expect(screen.getByText(/312/)).toBeTruthy()
  })

  it('is a list item, because the grid is a list', () => {
    const { container } = render(<PromoTile averageRating={4.5} reviewCount={312} />)
    expect(container.querySelector('li')).toBeTruthy()
  })

  it('does not round the average up', () => {
    // 4.5 stays 4.5. Rounding it to 5 is the small lie that makes every other
    // number on the page unreliable.
    render(<PromoTile averageRating={4.5} reviewCount={312} />)
    expect(screen.getByText(/Rated 4\.5\/5/)).toBeTruthy()
    expect(screen.queryByText(/Rated 5\/5/)).toBeNull()
  })
})

describe('without enough real reviews', () => {
  it('renders nothing when nothing is approved', () => {
    const { container } = render(<PromoTile averageRating={null} reviewCount={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing below the threshold', () => {
    const { container } = render(
      <PromoTile averageRating={5} reviewCount={MIN_PROMO_REVIEWS - 1} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders at exactly the threshold', () => {
    const { container } = render(
      <PromoTile averageRating={4.2} reviewCount={MIN_PROMO_REVIEWS} />
    )
    expect(container).not.toBeEmptyDOMElement()
  })

  it('renders nothing when the average is missing but the count is not', () => {
    // Defensive: a null average with a positive count means the aggregate is
    // inconsistent, and a tile is not the place to find that out.
    const { container } = render(<PromoTile averageRating={null} reviewCount={500} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('threshold', () => {
  it('is high enough that one enthusiastic buyer cannot set it', () => {
    expect(MIN_PROMO_REVIEWS).toBeGreaterThanOrEqual(10)
  })
})
