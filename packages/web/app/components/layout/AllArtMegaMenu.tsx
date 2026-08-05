import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  COLOR_OPTIONS,
  ORIENTATION_OPTIONS,
  STYLE_OPTIONS,
  SUBJECT_OPTIONS,
  type FacetOption,
} from '@chobii/shared'
import { CATEGORY_TILES } from '~/lib/homeCategories'
import { cn } from '~/lib/utils'

/**
 * All Art opens the whole filter vocabulary (#476).
 *
 * On mesonart the first entry of the styles row is not a link to a
 * collection, it is the door to every facet at once: five columns of options
 * and a promo column, dropped as a full-width sheet under the nav.
 *
 * Measured from mesonart.com/collections/artworks on 2026-08-05:
 *
 *  - a `<details>` whose `<summary>` carries `data-link` — hover opens it,
 *    a click still navigates. Ours keeps both: the trigger is a real `<Link>`.
 *  - the sheet grows downward over 500ms on `cubic-bezier(0.6, 0, 0.4, 1)`,
 *    which is their `padding 0.5s` on the panel container.
 *  - `grid-template-columns: 4fr 1fr`, gap 24px — link block, then promos.
 *  - options are 14px muted with an underline that wipes in on
 *    `cubic-bezier(0.3, 1, 0.3, 1)`; headings are 16px/500 at -0.4px tracking,
 *    and the first two are links carrying a chevron.
 *
 * WHY HOVER, given #416 said no
 *
 * The sort pill deliberately refused hover-open — a hover-opened menu has no
 * touch or keyboard story. This one opens on hover anyway, by owner decision
 * on 2026-08-05, because it is the mesonart behaviour being bought. The costs
 * are bounded on purpose: the trigger stays a link, so the same destination is
 * one click away; the panel is desktop-only (its whole row is `hidden
 * md:block`), so no touch device ever needs it; and Escape and outside-press
 * close it rather than trapping a pointer inside.
 *
 * WHERE THE SCRIM ISN'T
 *
 * The dimming layer is NOT rendered here. This component lives inside the
 * nav-rows block, which carries a transform for its reveal — and a transform
 * establishes a containing block for fixed descendants, which is what
 * collapsed a full-screen overlay to zero height in #348. `Header` renders
 * the scrim as a sibling of `<header>`; this component just reports its open
 * state upward through `onOpenChange`.
 *
 * The panel is `absolute`, so it contributes nothing to the height
 * `useChromeOffset` publishes. In flow it would push `--chrome-offset` down by
 * its own ~700px and drag the collection toolbar with it on every hover
 * (#401 / #421).
 */

interface MegaLink {
  id: string
  label: string
  search: Record<string, unknown>
}

interface MegaColumn {
  /** Also the column's test id suffix. */
  key: string
  heading: string
  /**
   * Headings 1 and 2 are destinations in their own right and carry a chevron,
   * as theirs do. The rest are labels for a group with no page of its own.
   */
  headingSearch?: Record<string, unknown>
  links: readonly MegaLink[]
}

/**
 * The two row-1 entries that are a sort, not a page — the same pair `Header`
 * uses, so the nav and this panel cannot disagree about what either word means.
 */
const BEST_SELLERS_SEARCH = { sortBy: 'salesCount', sortOrder: 'desc' }
const NEW_IN_SEARCH = { sortBy: 'createdAt', sortOrder: 'desc' }

/** One vocabulary, one parameter. */
const facetLinks = (
  options: readonly FacetOption[],
  param: string
): readonly MegaLink[] =>
  options.map((option) => ({
    id: option.id,
    label: option.label,
    search: { [param]: option.id },
  }))

const MEGA_COLUMNS: readonly MegaColumn[] = [
  {
    /**
     * Theirs lists eight monthly drops (New Art-202607 …). We have no timed
     * collection entity, so this column carries the real entry points
     * instead — inventing eight drops would be furniture.
     */
    key: 'all-artwork',
    heading: 'All Artwork',
    headingSearch: {},
    links: [
      // A bare `/posters`: passing `search` wholesale clears whatever facets
      // were active, which is what a top-level entry should do.
      { id: 'all', label: 'All Art', search: {} },
      { id: 'new-in', label: 'New In', search: NEW_IN_SEARCH },
      { id: 'best-sellers', label: 'Best Sellers', search: BEST_SELLERS_SEARCH },
    ],
  },
  {
    key: 'style',
    heading: 'Style',
    headingSearch: {},
    links: facetLinks(STYLE_OPTIONS, 'styles'),
  },
  {
    key: 'subject',
    heading: 'Subject',
    links: facetLinks(SUBJECT_OPTIONS, 'subjects'),
  },
  {
    // Single-valued on the route, unlike the comma lists either side of it.
    key: 'orientation',
    heading: 'Orientation',
    links: facetLinks(ORIENTATION_OPTIONS, 'orientation'),
  },
  {
    key: 'color',
    heading: 'Color',
    links: facetLinks(COLOR_OPTIONS, 'colors'),
  },
]

/**
 * Their promo column is two collection cards. Ours are curated tiles that
 * already pair a real photograph with a value the catalogue can be filtered
 * by — the same rule that kept the sale strip out of this feature: no
 * promotion entity exists, so nothing here may promise a discount.
 */
const PROMO_CARDS = CATEGORY_TILES.slice(0, 2)

/** Their underline wipe: 0 to full width on `cubic-bezier(0.3, 1, 0.3, 1)`. */
const UNDERLINE_WIPE =
  'bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-[position:0_100%] bg-no-repeat transition-[background-size,color] duration-500 ease-[cubic-bezier(0.3,1,0.3,1)] hover:bg-[length:100%_1px] hover:text-foreground motion-reduce:transition-none'

export function AllArtMegaMenu({
  onOpenChange,
  onNavigate,
}: {
  /** So `Header` can raise its scrim; see the note about #348 above. */
  onOpenChange?: (isOpen: boolean) => void
  onNavigate?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const setOpen = (next: boolean) => {
    setIsOpen(next)
    onOpenChange?.(next)
  }

  // Hover opens it; a panel that only closes by walking the pointer back
  // through it is a trap, so Escape and an outside press close it too.
  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const close = () => {
    setOpen(false)
    onNavigate?.()
  }

  return (
    <div
      ref={rootRef}
      data-testid="all-art-mega"
      data-open={isOpen}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        to="/posters"
        search={{}}
        onClick={close}
        data-testid="all-art-mega-trigger"
        aria-expanded={isOpen}
        className={cn(
          // Same weight of ink as the styles beside it; the panel itself is
          // the open cue, so the trigger no longer carries that with colour.
          'whitespace-nowrap text-nav text-foreground transition-colors',
          isOpen ? 'text-foreground' : 'hover:text-foreground/70'
        )}
      >
        All Art
      </Link>

      {/* The sheet.
       *
       * `grid-rows-[0fr]` to `[1fr]` grows it downward without a hardcoded
       * height, which is the shape of their `padding 0.5s` open. `invisible`
       * while closed is what drops every link inside out of the tab order,
       * the same way the nav rows themselves do (#421). */}
      <div
        data-testid="all-art-mega-panel"
        className={cn(
          'absolute left-0 top-full z-40 grid w-full overflow-hidden border-b border-border bg-background transition-[grid-template-rows,opacity] duration-500 motion-reduce:transition-none',
          isOpen
            ? 'grid-rows-[1fr] opacity-100'
            : 'invisible grid-rows-[0fr] opacity-0'
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.6, 0, 0.4, 1)' }}
      >
        <div className="min-h-0">
          <div className="container-wide grid grid-cols-[4fr_1fr] gap-6 pb-14 pt-3">
            <div className="grid grid-cols-5 gap-6">
              {MEGA_COLUMNS.map((column) => (
                <div key={column.key} data-testid={`all-art-column-${column.key}`}>
                  {column.headingSearch ? (
                    <Link
                      to="/posters"
                      search={column.headingSearch}
                      onClick={close}
                      data-testid="all-art-column-heading"
                      className="mb-8 flex items-center gap-1 text-base font-medium capitalize tracking-[-0.4px] text-foreground"
                    >
                      {column.heading}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <p
                      data-testid="all-art-column-heading"
                      className="mb-8 text-base font-medium capitalize tracking-[-0.4px] text-foreground"
                    >
                      {column.heading}
                    </p>
                  )}

                  <ul>
                    {column.links.map((link) => (
                      <li key={link.id}>
                        <Link
                          to="/posters"
                          search={link.search}
                          onClick={close}
                          className={cn(
                            'inline-block pb-2 text-sm leading-[21px] text-muted-foreground',
                            UNDERLINE_WIPE
                          )}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Promo column — a 4:3 card, then a square one, theirs' proportions. */}
            <div className="flex flex-col gap-6">
              {PROMO_CARDS.map((tile, index) => (
                <Link
                  key={tile.id}
                  to="/posters"
                  search={{ [tile.group]: tile.id }}
                  onClick={close}
                  data-testid="all-art-promo-card"
                  className="group block"
                >
                  <img
                    src={tile.image}
                    alt={tile.name}
                    loading="lazy"
                    className={cn(
                      'w-full rounded-sm object-cover',
                      index === 0 ? 'aspect-[4/3]' : 'aspect-square'
                    )}
                  />
                  <span className="mt-3 flex items-center justify-between gap-2 text-xl tracking-tight text-foreground">
                    {tile.name}
                    <ArrowRight
                      className="h-4 w-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.3,1,0.3,1)] group-hover:translate-x-1 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
