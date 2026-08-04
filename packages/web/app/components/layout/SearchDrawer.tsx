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
 */

import { Link } from '@tanstack/react-router'
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { STYLE_OPTIONS } from '@chobii/shared'
import { productsApi } from '~/lib/api'
import { cn, formatPrice } from '~/lib/utils'

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
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        className="fixed inset-x-0 top-0 z-50 max-h-[80vh] overflow-y-auto border-b border-border bg-background shadow-xl"
      >
        <div className="container-wide py-6">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              role="searchbox"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posters…"
              aria-label="Search products"
              className="h-11 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
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
      </div>
    </>
  )
}

export default SearchDrawer
