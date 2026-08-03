import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayHeading } from '~/components/ui/DisplayHeading'

describe('DisplayHeading', () => {
  it('renders an h1 by default', () => {
    render(<DisplayHeading>Shop All Art</DisplayHeading>)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
  })

  it('renders an h2 when asked', () => {
    render(<DisplayHeading as="h2">Best Seller</DisplayHeading>)
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy()
  })

  it('keeps the whole sentence as the accessible name despite the split', () => {
    render(<DisplayHeading>Transform Your Space</DisplayHeading>)
    expect(
      screen.getByRole('heading', { name: 'Transform Your Space' })
    ).toBeTruthy()
  })

  it('preserves the whitespace between words so copy-paste is not mangled', () => {
    render(<DisplayHeading>Transform Your Space</DisplayHeading>)
    expect(screen.getByRole('heading').textContent).toBe('Transform Your Space')
  })

  it('wraps each word in its own span', () => {
    render(<DisplayHeading>Transform Your Space</DisplayHeading>)
    const spans = screen.getByRole('heading').querySelectorAll('span[data-word]')
    expect(spans.length).toBe(3)
    expect(spans[0].textContent).toBe('Transform')
    expect(spans[2].textContent).toBe('Space')
  })

  it('staggers the reveal per word', () => {
    render(<DisplayHeading>One Two Three</DisplayHeading>)
    const delays = Array.from(
      screen.getByRole('heading').querySelectorAll<HTMLElement>('span[data-word]')
    ).map((s) => s.style.animationDelay)
    expect(new Set(delays).size).toBe(3)
    expect(delays[0]).toBe('0ms')
  })

  it('uses the heading face at a light weight, never font-bold', () => {
    render(<DisplayHeading>Shop</DisplayHeading>)
    const cls = screen.getByRole('heading').className
    expect(cls).toContain('font-heading')
    expect(cls).toContain('font-light')
    expect(cls).not.toContain('font-bold')
  })

  it('collapses runs of whitespace to a single word boundary', () => {
    render(<DisplayHeading>{'Two   Words'}</DisplayHeading>)
    const spans = screen.getByRole('heading').querySelectorAll('span[data-word]')
    expect(spans.length).toBe(2)
  })

  it('merges caller className', () => {
    render(<DisplayHeading className="text-center">Shop</DisplayHeading>)
    expect(screen.getByRole('heading').className).toContain('text-center')
  })
})
