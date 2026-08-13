import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// The drawer renders TanStack Links, which need a router context this test
// has no use for. Stub them as plain anchors.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: Record<string, unknown>) => (
    <a {...(props as object)}>{children as React.ReactNode}</a>
  ),
}))

import { SearchDrawer } from '~/components/layout/SearchDrawer'
import { STYLE_OPTIONS } from '@chobii/shared'

const src = readFileSync(
  join(process.cwd(), 'app/components/layout/SearchDrawer.tsx'),
  'utf8'
)

const results = (titles: string[]) => ({
  items: titles.map((title, i) => ({
    id: `p${i}`,
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    basePrice: '999.00',
    images: [],
  })),
  total: titles.length,
})

function stubSearch(body: unknown, delayMs = 0) {
  const spy = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: true, json: async () => body }),
          delayMs
        )
      )
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('open and close', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SearchDrawer isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a labelled dialog when open', () => {
    render(<SearchDrawer isOpen onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toMatch(/search/i)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<SearchDrawer isOpen onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('locks body scroll while open', () => {
    const { unmount } = render(<SearchDrawer isOpen onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('empty state', () => {
  it('offers real style shortcuts rather than invented recommendations', () => {
    // Theirs shows "recommendations". We have no signal to base those on, and
    // inventing one is the personalisation flavour of the same dark pattern
    // the analysis rules out elsewhere.
    render(<SearchDrawer isOpen onClose={() => {}} />)
    expect(screen.getByText(STYLE_OPTIONS[0]!.label)).toBeTruthy()
  })
})

describe('querying', () => {
  it('debounces rather than firing per keystroke', async () => {
    const spy = stubSearch(results(['Alpha']))
    render(<SearchDrawer isOpen onClose={() => {}} />)

    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.change(input, { target: { value: 'ab' } })
    fireEvent.change(input, { target: { value: 'abs' } })

    expect(spy).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('renders the results', async () => {
    stubSearch(results(['Cosmic Harmony']))
    render(<SearchDrawer isOpen onClose={() => {}} />)

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'cosmic' },
    })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(screen.getByText('Cosmic Harmony')).toBeTruthy()
    })
  })

  it('says so plainly when nothing matches', async () => {
    stubSearch(results([]))
    render(<SearchDrawer isOpen onClose={() => {}} />)

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'zzzz' },
    })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(screen.getByText(/no products match/i)).toBeTruthy()
    })
  })
})

describe('the panel', () => {
  // The shell is the facet sheet's, hung from the top edge: same scrim, same
  // 20px sheet radius on the page-facing corners, same 600ms drawer curve,
  // same 60px gap left to the far edge. It used to be a square, motionless
  // slab on a bg-black/50 scrim nobody else in the app uses.
  it('descends from the top on the drawer curve', () => {
    render(<SearchDrawer isOpen onClose={() => {}} />)
    const panel = screen.getByTestId('search-drawer')
    expect(panel.className).toContain('top-0')
    expect(panel.className).toContain('animate-drawer-in-top')
    expect(panel.className).toContain('rounded-b-[var(--drawer-radius-sheet)]')
    expect(panel.className).toContain('lg:max-h-[calc(100%-60px)]')
  })

  it('travels the facet sheet’s distance on the phone, so it moves at its speed', () => {
    // Both animations are 0.6s var(--ease-drawer). A content-tall panel covers
    // a third of the sheet's distance in that time and reads as a crawl beside
    // it, so the phone panel takes the sheet's height — as mesonart's own
    // search panel does (`100vh - 60px`, measured).
    render(<SearchDrawer isOpen onClose={() => {}} />)
    expect(screen.getByTestId('search-drawer').className).toContain(
      'h-[calc(100%-60px)]'
    )
  })

  it('dims the page with the drawers’ own scrim', () => {
    render(<SearchDrawer isOpen onClose={() => {}} />)
    const scrim = screen.getByTestId('search-scrim')
    expect(scrim.className).toContain('bg-foreground/70')
    expect(scrim.className).toContain('animate-drawer-backdrop-in')
    expect(scrim.className).not.toContain('bg-black/50')
  })

  it('closes from the scrim', () => {
    const onClose = vi.fn()
    render(<SearchDrawer isOpen onClose={onClose} />)
    fireEvent.click(screen.getByTestId('search-scrim'))
    expect(onClose).toHaveBeenCalled()
  })

  it('draws the cart drawer’s close cursor over the scrim', () => {
    // The whole scrim IS the close control, so the pointer says so — the same
    // follower the cart drawer and the Quickview carry (#420).
    render(<SearchDrawer isOpen onClose={() => {}} />)
    const scrim = screen.getByTestId('search-scrim')
    expect(scrim.className).toContain('cursor-none')
    expect(screen.queryByTestId('search-drawer-cursor')).toBeNull()

    fireEvent.mouseMove(scrim, { clientX: 120, clientY: 300 })
    const follower = screen.getByTestId('search-drawer-cursor')
    expect(follower.style.left).toBe('120px')
    expect(follower.style.top).toBe('300px')

    // Off the scrim — including onto the panel — and the follower goes with it,
    // or a real pointer and a drawn one are on screen at once.
    fireEvent.mouseLeave(scrim)
    expect(screen.queryByTestId('search-drawer-cursor')).toBeNull()
  })

  it('closes on the drawers’ outline circle, not a bare icon box', () => {
    const onClose = vi.fn()
    render(<SearchDrawer isOpen onClose={onClose} />)
    const close = screen.getByLabelText('Close search')
    expect(close.className).toContain('rounded-full')
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the field at 16px so iOS does not zoom the page on focus', () => {
    render(<SearchDrawer isOpen onClose={() => {}} />)
    expect(screen.getByRole('searchbox').className).toContain('text-base')
  })
})

describe('the source guards', () => {
  it('cancels stale requests', () => {
    // Typing "abstract" is eight keystrokes. Without cancellation the last
    // response is not necessarily the last request, and results flicker
    // between queries.
    expect(src).toMatch(/AbortController|requestId|sequence/)
  })

  it('builds its empty state from the shared vocabulary', () => {
    expect(src).toContain('STYLE_OPTIONS')
  })

  it('honours the token guard', () => {
    expect(src).not.toContain('font-bold')
    expect(src).not.toMatch(/\b(bg|text|border|from|to)-brand-/)
  })
})

describe('header wiring', () => {
  const header = readFileSync(
    join(process.cwd(), 'app/components/layout/Header.tsx'),
    'utf8'
  )

  it('the header opens the drawer', () => {
    expect(header).toContain('SearchDrawer')
    expect(header).toMatch(/aria-label="Search"/)
  })

  it('does not hijack "/" while the user is typing elsewhere', () => {
    // The shortcut listener lives in the header, so this is asserted there.
    expect(header).toMatch(/INPUT|TEXTAREA|isContentEditable/)
  })

  it('the drawer is a SIBLING of header, not a child', () => {
    // The header sets backdrop-blur, which establishes a containing block and
    // collapses a nested fixed overlay to zero height — the #348 bug.
    const headerClose = header.indexOf('</header>')
    const drawer = header.indexOf('<SearchDrawer')
    expect(drawer).toBeGreaterThan(headerClose)
  })
})
