import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button, buttonVariants } from '~/components/ui/Button'

describe('Button', () => {
  it('renders a button with its children', () => {
    render(<Button>Add to cart</Button>)
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeTruthy()
  })

  it('is a near-black pill by default, never orange and never rounded-lg', () => {
    render(<Button>Shop</Button>)
    const cls = screen.getByRole('button').className
    expect(cls).toContain('bg-primary')
    expect(cls).toContain('rounded-pill')
    expect(cls).not.toContain('bg-brand')
    expect(cls).not.toContain('rounded-lg')
  })

  it('carries the measured 2px button border', () => {
    render(<Button>Shop</Button>)
    expect(screen.getByRole('button').className).toContain('var(--border-button)')
  })

  it('uses the fluid button type scale', () => {
    render(<Button>Shop</Button>)
    expect(screen.getByRole('button').className).toContain('text-button')
  })

  it('outline variant is a transparent pill with a primary border', () => {
    render(<Button variant="outline">Shop All Art</Button>)
    const cls = screen.getByRole('button').className
    expect(cls).toContain('border-primary')
    expect(cls).toContain('text-primary')
    expect(cls).toContain('bg-transparent')
  })

  it('never renders font-bold (weight 700 is not loaded)', () => {
    for (const variant of ['solid', 'outline', 'ghost', 'link'] as const) {
      expect(buttonVariants({ variant })).not.toContain('font-bold')
    }
  })

  it('exposes buttonVariants so anchors and Links can share the styling', () => {
    expect(typeof buttonVariants).toBe('function')
    expect(buttonVariants({ variant: 'outline', size: 'lg' })).toContain(
      'rounded-pill'
    )
  })

  it('merges caller className without dropping variant classes', () => {
    render(<Button className="w-full">Shop</Button>)
    const cls = screen.getByRole('button').className
    expect(cls).toContain('w-full')
    expect(cls).toContain('rounded-pill')
  })

  it('lets the caller override a conflicting utility via tailwind-merge', () => {
    render(<Button className="rounded-none">Shop</Button>)
    const cls = screen.getByRole('button').className
    expect(cls).toContain('rounded-none')
    expect(cls).not.toContain('rounded-pill')
  })

  it('defaults to type="button" so it cannot accidentally submit a form', () => {
    render(<Button>Shop</Button>)
    expect((screen.getByRole('button') as HTMLButtonElement).type).toBe('button')
  })

  it('forwards disabled and an explicit type', () => {
    render(
      <Button disabled type="submit">
        Go
      </Button>
    )
    const el = screen.getByRole('button') as HTMLButtonElement
    expect(el.disabled).toBe(true)
    expect(el.type).toBe('submit')
  })

  it('forwards a ref to the underlying button', () => {
    let node: HTMLButtonElement | null = null
    render(<Button ref={(el) => (node = el)}>Shop</Button>)
    expect(node).toBeInstanceOf(HTMLButtonElement)
  })
})
