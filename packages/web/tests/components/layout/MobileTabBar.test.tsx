/**
 * The mobile bottom tab bar (#542).
 *
 * What this pins is the three things a later edit is most likely to break:
 * the six destinations and where each one goes, the fact that Menu and Search
 * drive the header's drawers rather than a second copy of that state, and the
 * two numbers that have to agree — the bar's height and the bottom padding the
 * page shell owes it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The bar is TanStack Links plus a `useRouteContext` lookup for the session.
 * Stub both: a real router would decide nothing this file is asking about, and
 * folding `search` into the href keeps the interesting assertion — where
 * Account goes when nobody is signed in — testable.
 */
let session: { user?: unknown } | null = null

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    // Router-only props. Left in, React warns about unknown DOM attributes.
    activeOptions: _activeOptions,
    activeProps: _activeProps,
    ...props
  }: Record<string, unknown>) => {
    const entries = Object.entries((search ?? {}) as Record<string, unknown>)
    const qs = new URLSearchParams(
      entries.map(([k, v]) => [k, String(v)])
    ).toString()
    return (
      <a href={qs ? `${to}?${qs}` : String(to)} {...(props as object)}>
        {children as React.ReactNode}
      </a>
    )
  },
  useRouteContext: () => ({ session }),
}))

const { MobileTabBar, MOBILE_TAB_BAR_PADDING_CLASS } = await import(
  '~/components/layout/MobileTabBar'
)
const { useCartStore } = await import('~/stores/cart')

const src = readFileSync(
  join(process.cwd(), 'app/components/layout/MobileTabBar.tsx'),
  'utf8'
)
const headerSrc = readFileSync(
  join(process.cwd(), 'app/components/layout/Header.tsx'),
  'utf8'
)
const rootSrc = readFileSync(join(process.cwd(), 'app/routes/__root.tsx'), 'utf8')

const bar = () => screen.getByTestId('mobile-tab-bar')

function renderBar(overrides: Partial<Parameters<typeof MobileTabBar>[0]> = {}) {
  const props = {
    onOpenMenu: vi.fn(),
    isMenuOpen: false,
    onOpenSearch: vi.fn(),
    ...overrides,
  }
  render(<MobileTabBar {...props} />)
  return props
}

beforeEach(() => {
  session = null
  useCartStore.setState({ isDrawerOpen: false })
})

describe('the six destinations', () => {
  it('renders exactly six, in the bar’s order', () => {
    renderBar()
    const labels = within(bar())
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(labels).toEqual([
      'Home',
      'Menu',
      'Search',
      'Shop',
      'Cart',
      'Account',
    ])
  })

  it('sends Home to / and Shop to the catalogue', () => {
    renderBar()
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe(
      '/'
    )
    expect(screen.getByRole('link', { name: 'Shop' }).getAttribute('href')).toBe(
      '/posters'
    )
  })

  it('gives every item a line icon over a label, not one or the other', () => {
    renderBar()
    for (const li of within(bar()).getAllByRole('listitem')) {
      expect(li.querySelector('svg')).toBeTruthy()
    }
  })
})

describe('Account respects auth state', () => {
  it('goes to /account when somebody is signed in', () => {
    session = { user: { id: 'u1' } }
    renderBar()
    expect(
      screen.getByRole('link', { name: 'Account' }).getAttribute('href')
    ).toBe('/account')
  })

  it('goes straight to sign-in, carrying the way back, when nobody is', () => {
    // /account is behind the _authed guard, which would bounce to the same
    // place — this spares the round trip rather than inventing a rule.
    session = null
    renderBar()
    expect(
      screen.getByRole('link', { name: 'Account' }).getAttribute('href')
    ).toBe('/auth/login?redirect=%2Faccount')
  })
})

describe('it drives the drawers that already exist', () => {
  it('asks the header to open its menu, and reports the state to a11y', () => {
    const { onOpenMenu } = renderBar({ isMenuOpen: true })
    const button = screen.getByRole('button', { name: /Menu/ })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(button)
    expect(onOpenMenu).toHaveBeenCalledTimes(1)
  })

  it('asks the header to open its search drawer', () => {
    const { onOpenSearch } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Search/ }))
    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('opens the cart through the store every other surface uses (#460)', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Cart/ }))
    expect(useCartStore.getState().isDrawerOpen).toBe(true)
  })

  it('owns no drawer state of its own', () => {
    // A second copy of either would let the header's Search and this one be
    // open at the same time.
    expect(src).not.toContain('useState')
    expect(src).not.toMatch(/import .*SearchDrawer/)
    expect(src).not.toMatch(/<SearchDrawer/)
  })
})

describe('it is mobile-only, and under every overlay', () => {
  it('hides from lg up', () => {
    renderBar()
    expect(bar().className).toContain('lg:hidden')
  })

  it('sits at z-30 — over the page, under every scrim and panel', () => {
    // Cart drawer, search drawer, mobile menu, mega-menu scrim and
    // JoinGalleryModal are all z-40/z-50. A bar at their layer would paint
    // over an open drawer and offer taps that go nowhere.
    renderBar()
    expect(bar().className).toContain('z-30')
    expect(bar().className).not.toMatch(/z-(40|50)/)
  })
})

describe('the height and the page padding are one number', () => {
  it('pads the page by the bar’s full height, and only on mobile', () => {
    // 61px row + 1px hairline = the 62px the bar measures, plus the notch.
    expect(MOBILE_TAB_BAR_PADDING_CLASS).toContain(
      'calc(3.875rem+env(safe-area-inset-bottom))'
    )
    expect(MOBILE_TAB_BAR_PADDING_CLASS).toContain('lg:pb-0')
    expect(src).toContain("h-[61px]")
  })

  it('carries the notch allowance on the bar as well as the padding', () => {
    expect(src).toContain('pb-[env(safe-area-inset-bottom)]')
  })

  it('is applied by the page shell rather than retyped there', () => {
    // Retyped, the two drift and the bar lands on the footer's last row.
    expect(rootSrc).toContain('MOBILE_TAB_BAR_PADDING_CLASS')
    expect(rootSrc).not.toContain('3.875rem')
  })
})

describe('it is mounted where the drawer state lives', () => {
  it('is rendered by the header, outside <header> itself (#348)', () => {
    // The header sets backdrop-blur, and a backdrop-filter is a containing
    // block for fixed descendants — nested, a `fixed bottom-0` bar pins to
    // the bottom of the 64px header instead of the viewport.
    expect(headerSrc).toContain('<MobileTabBar')
    expect(headerSrc.indexOf('<MobileTabBar')).toBeGreaterThan(
      headerSrc.indexOf('</header>')
    )
  })

  it('is handed the header’s own handlers', () => {
    const start = headerSrc.indexOf('<MobileTabBar')
    const tag = headerSrc.slice(start, headerSrc.indexOf('/>', start))
    expect(tag).toContain('onOpenMenu={toggleMobileMenu}')
    expect(tag).toContain('isMenuOpen={isMobileMenuOpen}')
    expect(tag).toContain('setIsSearchOpen(true)')
  })
})
