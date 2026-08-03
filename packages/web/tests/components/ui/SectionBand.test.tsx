import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SectionBand } from '~/components/ui/SectionBand'

describe('SectionBand', () => {
  it('renders a section wrapping its children in container-wide', () => {
    const { container } = render(<SectionBand>content</SectionBand>)
    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    expect(section!.querySelector('.container-wide')).not.toBeNull()
    expect(section!.textContent).toContain('content')
  })

  it('tone="beige" paints the measured band colour', () => {
    const { container } = render(<SectionBand tone="beige">x</SectionBand>)
    expect(container.querySelector('section')!.className).toContain('bg-band')
  })

  it('tone="sand" uses the stronger collections band', () => {
    const { container } = render(<SectionBand tone="sand">x</SectionBand>)
    expect(container.querySelector('section')!.className).toContain(
      'bg-band-strong'
    )
  })

  it('tone="ink" inverts to near-black with a light foreground', () => {
    const { container } = render(<SectionBand tone="ink">x</SectionBand>)
    const cls = container.querySelector('section')!.className
    expect(cls).toContain('bg-foreground')
    expect(cls).toContain('text-background')
  })

  it('defaults to plain with no band background and no gradient', () => {
    const { container } = render(<SectionBand>x</SectionBand>)
    const cls = container.querySelector('section')!.className
    expect(cls).not.toContain('bg-band')
    expect(cls).not.toContain('gradient')
  })

  it('merges caller className', () => {
    const { container } = render(<SectionBand className="pt-0">x</SectionBand>)
    expect(container.querySelector('section')!.className).toContain('pt-0')
  })

  it('forwards arbitrary section attributes such as id', () => {
    const { container } = render(<SectionBand id="why-us">x</SectionBand>)
    expect(container.querySelector('section')!.id).toBe('why-us')
  })
})
