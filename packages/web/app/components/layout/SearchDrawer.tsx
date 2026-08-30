/**
 * SearchDrawer.
 *
 * `GET /api/products/search` and `productsApi.search()` have both existed for
 * some time — what was missing was any way to reach them. mesonart lists a
 * search drawer among its global chrome (analysis §1.1); this is ours.
 *
 * THE EMPTY STATE IS DELIBERATELY NOT "RECOMMENDATIONS". Theirs shows
 * personalised suggestions; we have no signal to base any on, and inventing
 * one is the personalisation flavour of the same fabricated-social-proof
 * pattern the analysis rules out elsewhere. Real style shortcuts instead —
 * every one of them a filter that genuinely works.
 *
 * THE SHELL IS THE FACET SHEET'S, HUNG FROM THE OTHER EDGE.
 *
 * This used to be a bare full-bleed slab pinned to `top-0`: square corners, a
 * `bg-black/50` scrim nothing else on the site uses, no motion at all, and a
 * 36px icon-box close where every other panel in the app closes on the outline
 * circle. Measured on mesonart's own `SearchDrawer` at 414px, their panel is
 * the same drawer as their facet sheet — `border-radius: 20px 20px 0 0`,
 * overlay `rgba(23,23,23,0.7)` (our `bg-foreground/70`), `transform 0.6s
 * cubic-bezier(.7, 0, .2, 1)`, and a 60px gap left to the far edge so the page
 * behind it stays in sight. The field is 6px-radius, ~56px tall, on a barely
 * there `rgba(23,23,23,0.024)` fill.
 *
 * OUR ONE DEPARTURE, AND IT IS DELIBERATE: theirs rises from the BOTTOM; ours
 * descends from the TOP. Both of our search triggers — the header's magnifier
 * and the tab bar's Search — sit at the top of the screen on the pages that
 * carry them, and every mirrored value follows the flipped edge: the radius is
 * on the bottom corners, the cap leaves its 60px at the bottom, and the
 * decorative grab pill sits on the bottom rail rather than the top.
 */

import { Link } from '@tanstack/react-router'
import { Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { STYLE_OPTIONS } from '@chobii/shared'
import { productsApi } from '~/lib/api'
import { cn, formatPrice } from '~/lib/utils'
import { Button } from '~/components/ui/Button'

/** Long enough to finish a word, short enough not to feel laggy. */
const DEBOUNCE_MS = 250

interface SearchResult {
  id: string
  title: string
  slug: string
  basePrice: string
}

export interface SearchDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function SearchDrawer({ isOpen, onClose }: SearchDrawerProps) {
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Where to draw the X that stands in for the pointer over the scrim. Null
  // whenever the pointer is not on it — including over the panel, which the
  // scrim's own mouseleave covers. Same follower the cart drawer and the
  // Quickview carry (#420).
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)

  /**
   * Monotonic request id.
   *
   * Typing "abstract" is eight keystrokes. Responses can arrive out of order,
   * so without this the LAST RESPONSE wins rather than the last REQUEST, and
   * the list flickers back to an older query's results.
   */
  const latestRequest = useRef(0)

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // Focus the field, not the panel — the point of opening is to type.
    inputRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      // Reopening must not paint the follower at last session's coordinates.
      setPointer(null)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const requestId = ++latestRequest.current

    const timer = setTimeout(async () => {
      try {
        const response = await productsApi.search({ q: trimmed, pageSize: 8 })
        // A newer keystroke has already fired; discard this one.
        if (requestId !== latestRequest.current) return
        setResults((response.items ?? []) as SearchResult[])
      } catch {
        if (requestId !== latestRequest.current) return
        setResults([])
      } finally {
        if (requestId === latestRequest.current) setIsSearching(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  if (!isOpen) return null

  return (
    <>
      {/*
        The cart, menu and facet drawers' scrim — tint, curve and 600ms all
        theirs, not a second opinion. This was `bg-black/50`, the only scrim in
        the app that was.

        `cursor: none` with a round X drawn under the pointer instead, as on
        the cart drawer and the Quickview (#420): the whole scrim IS the close
        control, so the pointer says so rather than leaving the shopper to
        guess that clicking outside works. Escape and the panel's own close
        button cover everyone this does not — the follower is a pointer
        affordance, never the only way out.
      */}
      <div
        data-testid="search-scrim"
        className="fixed inset-0 z-40 cursor-none bg-foreground/70 animate-drawer-backdrop-in"
        onClick={onClose}
        onMouseMove={(event) =>
          setPointer({ x: event.clientX, y: event.clientY })
        }
        onMouseLeave={() => setPointer(null)}
        aria-hidden="true"
      />

      {pointer && (
        <span
          data-testid="search-drawer-cursor"
          aria-hidden="true"
          style={{ left: pointer.x, top: pointer.y }}
          className={cn(
            'pointer-events-none fixed z-50 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2',
            'place-items-center rounded-full bg-background text-foreground shadow-[0_2px_10px_rgba(23,23,23,0.25)]'
          )}
        >
          <X className="h-4 w-4" />
        </span>
      )}

      <div
        data-testid="search-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        aria-labelledby={titleId}
        className={cn(
          'fixed inset-x-0 top-0 z-50 flex flex-col bg-background shadow-2xl',
          /*
           * Their height, mirrored: the panel stops 60px short of the FAR
           * edge, so the page it searches stays visible behind the overlay.
           *
           * A HEIGHT ON THE PHONE, NOT A CAP — and that is what makes it move
           * at the facet sheet's speed. Both slide their own height in the
           * same 600ms, so a content-tall panel (~230px against the sheet's
           * ~700px) covers a third of the distance in the same time and reads
           * as a crawl beside it. mesonart's own search panel measures the
           * full `100vh - 60px` for the same reason.
           *
           * Desktop keeps the cap: there is no facet sheet above `lg` to match
           * against, and a full-height overlay for eight style chips is a page
           * where a panel will do.
           */
          'h-[calc(100%-60px)] lg:h-auto lg:max-h-[calc(100%-60px)]',
          'overflow-hidden rounded-b-[var(--drawer-radius-sheet)]',
          'animate-drawer-in-top'
        )}
        /*
         * The panel must never scroll itself — `overflow-hidden` (there for
         * the rounded corners) still makes a scroll container, and focusing a
         * result far down the list makes the browser scroll every scrollable
         * ancestor to reveal it. The facet sheet went blank this way; snapping
         * back is the fix that works in every browser.
         */
        onScroll={(event) => {
          event.currentTarget.scrollTop = 0
          event.currentTarget.scrollLeft = 0
        }}
      >
        {/* Head. Title left, the cart and menu drawers' outline circle right —
            this was a bare 36px icon box, the mobile BAR's affordance borrowed
            onto a modal surface. */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4">
          <h2 id={titleId} className="text-lg">
            Search
          </h2>
          <Button
            variant="outline"
            onClick={onClose}
            className="h-12 w-12 shrink-0 rounded-full p-0"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* `min-h-0` so this actually shrinks: a flex child's default
            `min-height: auto` is its content, which is what would let a long
            result list push the grab rail off the panel instead of scrolling. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/*
            Their field, measured: ~56px tall, 6px radius, on a barely-there
            fill rather than a border. text-base is load-bearing — iOS zooms
            the whole page on focus for anything under 16px (see
            mobile-input-zoom.spec.ts).
          */}
          <div className="flex items-center gap-3 rounded-md bg-foreground/[0.03] px-5">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              role="searchbox"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posters…"
              aria-label="Search products"
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="mt-6">
            {results === null ? (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">
                  Browse by style
                </p>
                <div className="flex flex-wrap gap-2">
                  {STYLE_OPTIONS.map((style) => (
                    <Link
                      key={style.id}
                      to="/posters"
                      search={{ styles: style.id }}
                      onClick={onClose}
                      className="rounded-pill border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      {style.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : results.length === 0 && !isSearching ? (
              <p className="py-8 text-center text-muted-foreground">
                No products match “{query.trim()}”.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {results.map((result) => (
                  <li key={result.id}>
                    <Link
                      to="/posters/$slug"
                      params={{ slug: result.slug }}
                      onClick={onClose}
                      className={cn(
                        'flex items-center justify-between gap-4 py-3 transition-colors hover:bg-accent'
                      )}
                    >
                      <span className="text-sm font-medium">{result.title}</span>
                      <span className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatPrice(parseFloat(result.basePrice))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* The grab pill, on the page-facing edge — the top of their bottom
            sheet, the bottom of our top one. Decoration: neither drawer has a
            drag gesture, and announcing a grabber that does nothing is worse
            than silence. */}
        <div className="flex shrink-0 justify-center pb-3 pt-1">
          <div
            aria-hidden="true"
            className="h-1 w-10 rounded-full bg-border"
          />
        </div>
      </div>
    </>
  )
}

export default SearchDrawer
