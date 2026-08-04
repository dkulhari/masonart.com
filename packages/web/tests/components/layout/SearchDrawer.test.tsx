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
