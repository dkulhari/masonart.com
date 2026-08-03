/**
 * `cn` has to be taught our custom Tailwind scales.
 *
 * Both cases below failed silently before extendTailwindMerge: the class did
 * not error, it just vanished (or failed to displace the one it should have),
 * and the component rendered at the wrong size or radius.
 */

import { describe, it, expect } from 'vitest'
import { cn } from '~/lib/utils'

describe('cn — custom scale awareness', () => {
  it('treats text-button as a font size, not a colour', () => {
    // Before: text-primary-foreground cancelled text-button.
    expect(cn('text-button', 'text-primary-foreground')).toContain('text-button')
  })

  it('lets one custom font size displace another', () => {
    expect(cn('text-button', 'text-product')).toBe('text-product')
  })

  it('treats rounded-pill as a border radius', () => {
    expect(cn('rounded-pill', 'rounded-none')).toBe('rounded-none')
  })

  it('still merges stock scales', () => {
    expect(cn('px-4 py-2', 'px-2')).toBe('py-2 px-2')
  })
})
