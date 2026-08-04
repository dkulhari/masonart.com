import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductRating } from '~/components/product/ProductRating'

describe('ProductRating', () => {
  it('renders nothing at all when the product has no reviews', () => {
    // Not five empty stars, not "0.0". A synthetic score reads as "rated
    // badly" rather than "not yet rated" — the fabricated-social-proof
    // problem the parity analysis rules out.
    const { container } = render(
      <ProductRating averageRating={null} reviewCount={0} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the count is zero even if an average leaks through', () => {
    const { container } = render(
      <ProductRating averageRating={0} reviewCount={0} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the review count in parentheses, as mesonart does', () => {
    render(<ProductRating averageRating={4.5} reviewCount={65} />)
    expect(screen.getByText('(65)')).toBeTruthy()
  })

  it('uses the rating token, never a hardcoded yellow', () => {
    const { container } = render(
      <ProductRating averageRating={4.5} reviewCount={12} />
    )
    const classes = Array.from(container.querySelectorAll('svg'))
      .map((svg) => svg.getAttribute('class') ?? '')
      .join(' ')
    expect(classes).toContain('text-rating')
    expect(classes).not.toContain('yellow')
  })

  it('fills whole stars up to the rounded average', () => {
    const { container } = render(
      <ProductRating averageRating={4} reviewCount={10} />
    )
    const filled = Array.from(container.querySelectorAll('svg')).filter((svg) =>
      (svg.getAttribute('class') ?? '').includes('fill-rating')
    )
    expect(filled).toHaveLength(4)
  })

  it('always renders five stars so the row does not change width', () => {
    const { container } = render(
      <ProductRating averageRating={2} reviewCount={3} />
    )
    expect(container.querySelectorAll('svg')).toHaveLength(5)
  })

  it('exposes the rating to assistive tech as text, not just shapes', () => {
    render(<ProductRating averageRating={4.5} reviewCount={65} />)
    expect(screen.getByLabelText(/4.5 out of 5.*65 review/i)).toBeTruthy()
  })
})
