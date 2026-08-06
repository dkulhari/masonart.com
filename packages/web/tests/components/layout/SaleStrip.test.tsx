/**
 * SaleStrip — the beige band above the announcement bar (#434).
 *
 * Four things are under test, and each one is a way a sale strip goes wrong.
 *
 * 1. **No promotion, no strip.** A strip that survives its promotion is a lie
 *    with a timer on it. Null payload, non-ok response, network failure and an
 *    explicit `promotion={null}` all have to render nothing at all — not an
 *    empty band, not a skeleton.
 *
 * 2. **Every number comes from the row.** The fixtures deliberately run at 25%
 *    and 15%, never mesonart's figure, and one assertion reads the component's
 *    own source with the comments stripped to prove no percentage is baked in.
 *    A literal in the markup would keep advertising a depth nobody configured.
 *
 * 3. **The deadline is already resolved.** `GET /api/promotions/active` (#432)
 *    ships a `deadline` and deliberately never ships `endsAt`, so these tests
 *    only ever hand the component an instant to count towards. If the component
 *    ever needs a window length or a jitter to render, that is the bug.
 *
 * 4. **Zero is a normal state.** The rolling window can run out mid-session
 *    while the sale is still live. Reaching it must drop the timer and keep the
 *    headline — never a negative clock, never a crash. The next navigation
 *    picks up a freshly minted deadline from the server.
 *
 * Placement is asserted too: `bg-band`, and NOT sticky. The header owns
 * `sticky top-0` and the collection toolbar sits at `top-16` on that
 * assumption, so a sticky strip would shift the toolbar on every collection
 * page.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

import { getApiUrl } from '~/lib/utils'
import {
  SaleStrip,
  formatRemaining,
  type ActivePromotion,
} from '~/components/layout/SaleStrip'

// ============================================================================
// Fixtures
// ============================================================================

const API = getApiUrl()
const ACTIVE_URL = `${API}/api/promotions/active`

/** The clock every test runs against, so the deadlines below are exact. */
const NOW = new Date('2026-08-06T09:00:00.000Z')

/** Deliberately not mesonart's depth — the number must come from here. */
const promotion: ActivePromotion = {
  promotionId: '11111111-1111-4111-8111-111111111111',
  headline: 'WINTER SALE: DEALS STILL GOING 25% OFF',
  percentOff: 25,
  membersOnly: true,
  // 01 : 02 : 03 from NOW.
  deadline: '2026-08-06T10:02:03.000Z',
}

const shallowerPromotion: ActivePromotion = {
  promotionId: '22222222-2222-4222-8222-222222222222',
  headline: 'SPRING REFRESH: 15% OFF EVERY PRINT',
  percentOff: 15,
  membersOnly: false,
  deadline: '2026-08-06T09:00:30.000Z',
}

/**
 * Resolved from the cwd, not `import.meta.url` — vite rewrites that to an http
 * URL in jsdom and `readFileSync` rejects anything that is not `file:`.
 */
const SOURCE_PATH = [
  resolve(process.cwd(), 'app/components/layout/SaleStrip.tsx'),
  resolve(process.cwd(), 'packages/web/app/components/layout/SaleStrip.tsx'),
].find(existsSync)

const SOURCE = readFileSync(SOURCE_PATH!, 'utf8')

/** Source with comments removed — prose may name the number, markup may not. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const fetchMock = vi.fn()

function serve(body: unknown) {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body })
}

/**
 * Flush the promotion lookup. Fake timers are running, so `waitFor` would sit
 * on a clock nobody is advancing — the fetch settles on microtasks instead,
 * and `fetch → json → setState` is three of them.
 */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function mount(ui: React.ReactElement) {
  const view = render(ui)
  await flush()
  return view
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  fetchMock.mockReset()
  serve(promotion)
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ============================================================================
// No promotion
// ============================================================================

describe('no active promotion', () => {
  it('renders nothing when the endpoint answers null', async () => {
    serve(null)
    const { container } = await mount(<SaleStrip />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when the lookup fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { container } = await mount(<SaleStrip />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when the endpoint errors', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    })
    const { container } = await mount(<SaleStrip />)
    expect(container.innerHTML).toBe('')
  })

  it('an explicit null promotion renders nothing and asks for nothing', async () => {
    const { container } = await mount(<SaleStrip promotion={null} />)
    expect(container.innerHTML).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Copy comes from the row
// ============================================================================

describe('copy comes from the promotion row', () => {
  it('prints the headline it was given', async () => {
    await mount(<SaleStrip />)
    expect(screen.getByText(promotion.headline)).toBeTruthy()
  })

  it('follows a different promotion to a different depth', async () => {
    serve(shallowerPromotion)
    const { container } = await mount(<SaleStrip />)
    expect(screen.getByText(shallowerPromotion.headline)).toBeTruthy()
    expect(container.textContent).toContain('15%')
    expect(container.textContent).not.toContain('25%')
  })

  it('never renders a depth the promotion did not name', async () => {
    const { container } = await mount(<SaleStrip />)
    expect(container.textContent).not.toMatch(/40\s*%/)
  })

  it('hardcodes no percentage in the markup', () => {
    // Comments are stripped first: the doc block may explain the rule, the
    // rendered output may not carry a number of its own.
    expect(CODE).not.toMatch(/\d+\s*%/)
    expect(CODE).not.toMatch(/%\s*off/i)
  })
})

// ============================================================================
// Countdown
// ============================================================================

describe('countdown', () => {
  it('counts towards the resolved deadline as HH : MM : SS', async () => {
    await mount(<SaleStrip />)
    expect(screen.getByText('01 : 02 : 03')).toBeTruthy()
  })

  it('ticks down once a second', async () => {
    await mount(<SaleStrip />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('01 : 02 : 02')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('01 : 01 : 59')).toBeTruthy()
  })

  it('carries hours past a day rather than wrapping them away', () => {
    // A `countdownMode: 'real'` promotion can end days out. Wrapping at 24
    // would understate how long is left, which is the one direction a
    // countdown must never round.
    expect(formatRemaining(30 * 3_600_000)?.display).toBe('30 : 00 : 00')
  })

  it('reaching zero drops the timer and keeps the headline', async () => {
    await mount(<SaleStrip />)
    expect(screen.getByText('01 : 02 : 03')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    })

    expect(screen.getByText(promotion.headline)).toBeTruthy()
    expect(screen.queryByTestId('sale-countdown')).toBeNull()
  })

  it('never shows a negative clock', async () => {
    const { container } = await mount(<SaleStrip />)
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    })
    expect(container.textContent).not.toContain('-')
  })

  it('a deadline already in the past renders the headline alone', async () => {
    serve({ ...promotion, deadline: '2026-08-06T08:59:00.000Z' })
    await mount(<SaleStrip />)
    expect(screen.getByText(promotion.headline)).toBeTruthy()
    expect(screen.queryByTestId('sale-countdown')).toBeNull()
  })

  it('an unparseable deadline renders the headline alone', async () => {
    serve({ ...promotion, deadline: 'not-a-date' })
    await mount(<SaleStrip />)
    expect(screen.getByText(promotion.headline)).toBeTruthy()
    expect(screen.queryByTestId('sale-countdown')).toBeNull()
  })

  it('reads out in units — bare digits are meaningless aloud', async () => {
    await mount(<SaleStrip />)
    const timer = screen.getByTestId('sale-countdown')
    expect(timer.getAttribute('aria-label')).toMatch(/hour/i)
    expect(timer.getAttribute('aria-label')).toMatch(/minute/i)
    expect(timer.getAttribute('aria-label')).toMatch(/second/i)
  })

  it('formatRemaining is null at and below zero', () => {
    expect(formatRemaining(0)).toBeNull()
    expect(formatRemaining(-1000)).toBeNull()
    expect(formatRemaining(Number.NaN)).toBeNull()
  })
})

// ============================================================================
// Placement
// ============================================================================

describe('placement and styling', () => {
  it('uses the existing beige band token', async () => {
    const { container } = await mount(<SaleStrip />)
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'bg-band'
    )
  })

  it('is NOT sticky', async () => {
    // The header is `sticky top-0` and the collection toolbar sits at `top-16`
    // assuming the header alone owns that offset. A sticky strip shifts the
    // toolbar on every collection page.
    const { container } = await mount(<SaleStrip />)
    const className = (container.firstElementChild as HTMLElement).className
    expect(className).not.toContain('sticky')
    expect(className).not.toContain('fixed')
  })
})

// ============================================================================
// The request
// ============================================================================

describe('the lookup', () => {
  it('goes to the API origin with the countdown cookie attached', async () => {
    await mount(<SaleStrip />)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(ACTIVE_URL)
    expect(init?.credentials).toBe('include')
  })

  it('asks once, not once per tick', async () => {
    await mount(<SaleStrip />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
