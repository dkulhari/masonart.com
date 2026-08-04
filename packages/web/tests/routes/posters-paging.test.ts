/**
 * Lazy-load paging on the collection grid.
 *
 * mesonart lazy-loads on scroll with no numbered pagination (analysis §1.3.7).
 *
 * Source-level for the same reason as the other posters suites: the route
 * calls createFileRoute and a server function at module scope.
 *
 * The three assertions that matter are not about the loading — they are about
 * what naive infinite scroll silently breaks: the shareable URL, keyboard
 * reachability, and the server-rendered first page.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(
  join(process.cwd(), 'app/routes/posters/index.tsx'),
  'utf8'
)

describe('lazy-load paging', () => {
  it('no longer renders numbered pagination', () => {
    expect(src).not.toContain('<Pagination')
  })

  it('renders pages 1..N rather than page N alone', () => {
    // `?page=2` must reproduce what the sharer was looking at — 48 cards, not
    // the second 24. The loader widens the request instead of the client
    // stitching pages, which is what broke the first attempt: navigating to
    // page 2 re-ran the loader and wiped the accumulated page 1.
    expect(src).toContain('PAGE_SIZE * requestedPage')
  })

  it('observes a sentinel to trigger the next page', () => {
    expect(src).toContain('IntersectionObserver')
  })
})

describe('what infinite scroll usually breaks', () => {
  it('keeps a real Load more button, not just a scroll observer', () => {
    // A pure observer is unreachable by keyboard and invisible to crawlers.
    // The button is the control; the observer merely activates it early.
    expect(src).toMatch(/Load more/i)
  })

  it('keeps the page param in the URL so the view stays shareable', () => {
    expect(src).toContain('page:')
    expect(src).toContain('replace: true')
  })

  it('still coerces page to a number in validateSearch', () => {
    // router.tsx overrides TanStack search serialisation, so every param
    // arrives as a string. Dropping the coercion error-boundaries the route
    // to a blank page.
    expect(src).toMatch(/page:\s*search\.page\s*\?\s*Number\(search\.page\)/)
  })

  it('still server-renders the first page', () => {
    // If the loader stopped returning products the page would be empty until
    // hydration — bad first paint and uncrawlable.
    expect(src).toContain('loader: async ({ deps })')
    expect(src).toContain('fetchPostersData')
  })
})
