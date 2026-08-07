/**
 * Shop by Room — mesonart's split band (#532).
 *
 * One full-width rounded band, split down the middle. The left half is a
 * lifestyle photograph with the room's name and a Shop Collection link laid
 * over it; the right half is a sand panel headed "Shop by Room" listing the
 * rooms in large light type, each with its product count as a raised
 * superscript and the active row underlined. Hovering (or tabbing to) a room
 * swaps the photograph. Mobile stacks the photo over the list.
 *
 * Measured off mesonart.com on 2026-08-06 at 1440x900 and 390x844:
 *
 *  - band inset by the page gutter, 12px radius (23 device px at 2x), clipped;
 *  - panel fill rgb(219 216 194) — EXACTLY our `--band-strong`, so
 *    `bg-band-strong` is the token rather than a new literal;
 *  - the split lands at 45.25% of the band and the photo is a perfect square,
 *    which is what sets the band's height. Their panel content is not centred
 *    in it; it starts 96px down and ends where it ends;
 *  - room rows: 40px type on a 52px line, ~28px cap height, near-black
 *    (#1d1d1d, our `foreground`), light weight;
 *  - counts: ~16px, ink top level with the name's cap top — which is what a
 *    plain `<sup>` at 0.4em does, since `vertical-align: super` raises by
 *    about a third of the parent size (13.3px against the 13.5px measured);
 *  - the underline runs under name AND count, so it belongs to the whole link;
 *  - panel padding 64px left, 96px top; heading 20px; overlay title 44px,
 *    centred over the photo with its cap 32px from the band's top edge.
 *
 * ## WHERE THE ROOMS COME FROM, AND WHERE THEY GO
 *
 * There is no rooms table. `ROOM_OPTIONS` in `@chobii/shared` is the room
 * vocabulary — the same one the facet sidebar renders, the API's zod validates
 * and the seed assigns — so the labels here are not typed out and the ids are
 * ones the catalogue can actually be filtered by. What this file owns is only
 * what belongs to THIS surface: which seven of the twelve rooms their band
 * shows, and in what order. It is a designed set rather than a top-seven, so
 * it does not reshuffle as the catalogue changes.
 *
 * Links go to `/posters?rooms=<id>`, our catalogue grid with one facet
 * applied — the same destination the All Art mega panel's Room column uses.
 * There is no per-room collection row to link at; the seed builds collections
 * per style plus "new" and "best-selling".
 *
 * The search object is handed to `<Link>` rather than spelled into an href.
 * `router.tsx` overrides TanStack's search serialisation, and a hand-built
 * query string that disagrees with the route's `validateSearch` throws inside
 * it — which error-boundaries the target to a blank page instead of degrading
 * to an unfiltered grid.
 *
 * ## THE COUNTS ARE REAL, OR THEY ARE ABSENT
 *
 * `GET /api/products/facets` already returns a per-room count over active
 * products — the same numbers the collection sidebar prints. A room the call
 * does not carry a count for renders with no superscript at all, and if the
 * call fails the whole band renders without them. Nothing here computes,
 * estimates or rounds: their band says 3895 against Living Room and ours says
 * 6, because six is how many we have.
 *
 * ## THE PHOTOGRAPHY IS A PLACEHOLDER — #544
 *
 * We own no interior photography; `public/images/` holds four category
 * graphics and seven frame swatches. Until we shoot our own, the band runs on
 * mesonart's, checked out into the git-ignored `public/dev-reference/` tree.
 * They are not ours and must not reach production — #544 blocks go-live on
 * replacing them.
 *
 * Every path goes through ROOM_PHOTOS below and nowhere else, so that swap is
 * one object literal rather than a hunt through JSX.
 *
 * ## READS CLIENT-SIDE
 *
 * The counts query only. The home route's loader is a server function and this
 * component may not touch it — the route file belongs to the integration step
 * — so the band fetches the same way CustomerReviewsSection does, and paints
 * its type and photography immediately either way.
 *
 * `productsApi` rather than a relative fetch: there is no Vite proxy for
 * `/api`, so a relative request from the dev server never reaches the API.
 *
 * Photographs mount on first hover and never unmount. All seven at once is
 * ~2MB of interior JPEG for a band where six of them sit at `opacity: 0`;
 * one at a time means a blank flash on every hover. This costs one load per
 * room the visitor is actually curious about, and every swap after the first
 * is instant.
 */

import { useCallback, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ROOM_OPTIONS } from '@chobii/shared'
import { productsApi } from '~/lib/api'
import { SectionBand } from '~/components/ui/SectionBand'
import { EASE_PRIMARY } from '~/components/product/productCardTokens'
import { cn } from '~/lib/utils'

const HEADING_ID = 'shop-by-room-heading'

/** The catalogue-wide counts describe the catalogue, not this URL. */
const STALE_MS = 5 * 60 * 1000

/** The photo is 45.25% of the band at lg and up; the panel takes the rest. */
const SIZES_ATTR = '(min-width: 1024px) 46vw, calc(100vw - 40px)'

/**
 * THE ONLY PLACE A ROOM PHOTOGRAPH IS NAMED.
 *
 * Development placeholders — mesonart's own photographs, served out of the
 * git-ignored `public/dev-reference/` tree and repopulated by
 * `scripts/dev/fetch-reference-imagery.sh`. Replacing them with ours is
 * editing this object; #544 blocks go-live until that happens.
 *
 * Keyed by facet id so a room without a photograph is a missing key rather
 * than a broken `<img>`; `resolveRoomCards` drops such a room outright.
 */
export const ROOM_PHOTOS: Readonly<Record<string, string>> = {
  'living-room': '/dev-reference/rooms/living-room.jpg',
  entryway: '/dev-reference/rooms/entryway.jpg',
  'executive-office': '/dev-reference/rooms/executive-office.jpg',
  bathroom: '/dev-reference/rooms/bathroom.jpg',
  'reading-nook': '/dev-reference/rooms/reading-nook.jpg',
  'dining-room': '/dev-reference/rooms/dining-room.jpg',
  'nursery-and-kids-room': '/dev-reference/rooms/nursery.jpg',
}

/** The placeholders are square, which is the ratio the band's photo half wants. */
const PHOTO_EDGE = 1600

/** Their running order, top to bottom. Ids are `ROOM_OPTIONS` values. */
export const ROOM_BAND_ORDER: readonly string[] = [
  'living-room',
  'entryway',
  'executive-office',
  'bathroom',
  'reading-nook',
  'dining-room',
  'nursery-and-kids-room',
]

// ============================================================================
// Resolution (pure)
// ============================================================================

/** Room labels by id, from the shared vocabulary. Never typed out here. */
const ROOM_LABELS = new Map(
  ROOM_OPTIONS.map((option) => [option.id, option.label])
)

/** Per-room product counts, keyed by facet value. */
export type RoomCounts = ReadonlyMap<string, number>

export interface RoomCard {
  /** Facet value. Also the `?rooms=` this row links at. */
  id: string
  label: string
  photo: string
  /** A real facet count. Absent when the facets call did not carry one. */
  count?: number
}

/**
 * The rows the band shows, in the curated order.
 *
 * A room is dropped when the shared vocabulary does not know its id — it could
 * not be filtered by, so it would be a caption rather than a link — or when
 * ROOM_PHOTOS has no photograph for it, on the same reasoning as
 * `visibleCategories`: a door with nothing behind it is not worth opening.
 */
export function resolveRoomCards(counts?: RoomCounts): RoomCard[] {
  const cards: RoomCard[] = []

  for (const id of ROOM_BAND_ORDER) {
    const label = ROOM_LABELS.get(id)
    const photo = ROOM_PHOTOS[id]
    if (!label || !photo) continue

    const count = counts?.get(id)
    cards.push(count === undefined ? { id, label, photo } : { id, label, photo, count })
  }

  return cards
}

// ============================================================================
// Band (presentational)
// ============================================================================

export interface ShopByRoomBandViewProps {
  rooms: readonly RoomCard[]
}

/**
 * The band itself — or nothing at all.
 *
 * Split from the connected component below so the resolver, the hover swap and
 * the count rule are all testable without a query client.
 */
export function ShopByRoomBandView({ rooms }: ShopByRoomBandViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [seen, setSeen] = useState<readonly string[]>([])

  const reveal = useCallback((id: string) => {
    setActiveId(id)
    setSeen((previous) => (previous.includes(id) ? previous : [...previous, id]))
  }, [])

  const active = rooms.find((room) => room.id === activeId) ?? rooms[0]

  /**
   * Mounted photographs: the first room, the active one, and every one already
   * looked at.
   *
   * The first room is pinned because it is the one in normal flow — see the
   * `aspect-square` note below — and because unmounting it the moment the
   * cursor lands on another row would re-download it on the way back, which is
   * the opposite of what mounting-on-hover is for.
   */
  const mounted = useMemo(() => {
    const first = rooms[0]
    if (!active || !first) return []
    const ids = new Set([first.id, active.id, ...seen])
    return rooms.filter((room) => ids.has(room.id))
  }, [rooms, active, seen])

  // A list with no photograph beside it is a different design, not this one.
  // After the hooks, so hook order cannot vary between renders.
  if (!active) return null

  return (
    <SectionBand aria-labelledby={HEADING_ID} data-testid="shop-by-room">
      <div className="overflow-hidden rounded-xl lg:flex">
        {/* ---------------------------------------------------------------
            The photograph, and the band's height.

            EXACTLY ONE image is in normal flow, and it carries
            `aspect-square`; every other is `absolute inset-0` and therefore
            cannot contribute height. That is the same mechanism
            ProductCardMedia uses, and here it is what makes the photo square
            and the panel stretch to it — the arrangement measured on theirs.
            `aspect-square` on the flex ITEM does not survive: `align-items:
            stretch` resolves the cross size first and the square is lost, so
            the band ends up as tall as its list and the photo is cropped.
        --------------------------------------------------------------- */}
        <div
          data-testid="shop-by-room-photo"
          data-room={active.id}
          className="relative w-full overflow-hidden bg-band-strong lg:w-[45.25%]"
        >
          {mounted.map((room, index) => (
            <img
              key={room.id}
              src={room.photo}
              sizes={SIZES_ATTR}
              /* Decorative: the room is named in the link's own text right on
                 top of it, so describing the picture would only make a screen
                 reader say "Living Room" twice. */
              alt=""
              aria-hidden="true"
              width={PHOTO_EDGE}
              height={PHOTO_EDGE}
              decoding="async"
              className={cn(
                'object-cover',
                index === 0
                  ? 'block aspect-square w-full'
                  : 'absolute inset-0 h-full w-full',
                'motion-safe:transition-opacity motion-safe:duration-500',
                EASE_PRIMARY,
                room.id === active.id ? 'opacity-100' : 'opacity-0'
              )}
            />
          ))}

          {/* Theirs runs white type straight onto the photograph and pays for
              it — "Shop Collection" lands on a blonde highlight and half of it
              disappears. A shallow scrim over the top costs nothing at this
              scale and makes the same two lines legible on any interior. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/25 via-black/8 to-transparent"
          />

          <Link
            to="/posters"
            search={{ rooms: active.id }}
            data-testid="shop-by-room-photo-link"
            /*
             * The scrim above handles a dark photograph; the shadow handles a
             * pale one. The bathroom and the reading nook are near-white walls
             * top to bottom, and deepening the scrim enough for those would
             * grey out the six that do not need it.
             */
            className="absolute inset-x-0 top-0 flex flex-col items-center px-6 pt-7 text-center text-white [text-shadow:0_1px_10px_rgb(0_0_0/0.45)]"
          >
            <span className="font-heading text-[28px] font-light leading-[1.15] tracking-tight lg:text-[34px] xl:text-[42px]">
              {active.label}
            </span>
            {/* The gap closes on the way down: theirs is 34px under a 28px
                title at 390 and 72px under a 42px one at 1440, which is a
                smaller gap and not just a smaller heading. */}
            <span className="mt-2 text-base font-light lg:mt-4 xl:mt-5">
              Shop Collection <span aria-hidden="true">&rarr;</span>
            </span>
          </Link>
        </div>

        {/* ---------------------------------------------------------------
            The list. Top-aligned in the sand panel, not centred.
        --------------------------------------------------------------- */}
        <div className="bg-band-strong px-4 pb-8 pt-8 lg:flex-1 lg:px-10 lg:pb-12 lg:pt-16 xl:px-16 xl:pb-16 xl:pt-24">
          <h2
            id={HEADING_ID}
            className="text-[15px] font-normal text-foreground xl:text-base"
          >
            Shop by Room
          </h2>

          <ul className="mt-5 xl:mt-7">
            {rooms.map((room) => {
              const isActive = room.id === active.id
              return (
                <li key={room.id}>
                  <Link
                    to="/posters"
                    search={{ rooms: room.id }}
                    data-testid="shop-by-room-link"
                    data-room={room.id}
                    data-active={isActive ? 'true' : undefined}
                    onMouseEnter={() => reveal(room.id)}
                    onFocus={() => reveal(room.id)}
                    className={cn(
                      'inline-block font-heading text-[26px] font-light leading-[42px] tracking-tight text-foreground',
                      'decoration-[1.5px] underline-offset-[6px]',
                      'lg:text-[32px] lg:leading-[46px] xl:text-[38px] xl:leading-[52px]',
                      isActive ? 'underline' : 'hover:underline'
                    )}
                  >
                    {room.label}
                    {room.count !== undefined && (
                      <>
                        {/*
                         * THE GAP IS TWO NON-BREAKING SPACES, NOT PADDING.
                         *
                         * The underline belongs to the whole link in their
                         * design — one rule under the name, the gap and the
                         * number. Chrome draws a link's decoration under a
                         * child inline's glyphs but not under that child's
                         * padding, and a margin is nobody's box at all, so
                         * either one leaves the rule visibly sawn in half.
                         * Characters are underlined like any other text, and
                         * two of them measure 19px at 38px and 14px at 26px,
                         * against the 19px and 15.5px measured on theirs.
                         */}
                        {'\u00a0\u00a0'}
                        {/*
                         * THE LIFT IS STATED, NOT INHERITED.
                         *
                         * Not a `<sup>`: theirs sits with the digits' tops
                         * level with the name's cap — a 12.6px lift on a 38px
                         * row — where `vertical-align: super` raises by
                         * whatever the font says, which in Urbanist is about
                         * 5px. So it is spelled out, in the count's own ems.
                         *
                         * `vertical-align` rather than a transform, for the
                         * same reason as the spaces: a transform would make
                         * this an atomic inline and break the rule. And
                         * `leading-none`, because a raised inline box that
                         * inherits the row's 52px line-height pushes the line
                         * box taller and the rows drift 5px apart.
                         */}
                        <span
                          data-testid="shop-by-room-count"
                          className="align-[0.79em] text-[0.42em] font-normal leading-none tracking-normal"
                        >
                          {room.count}
                          <span className="sr-only"> posters</span>
                        </span>
                      </>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </SectionBand>
  )
}

// ============================================================================
// Band (connected)
// ============================================================================

/**
 * What the home page mounts. Fetches the counts, then defers every rendering
 * decision — including whether to print a count at all — to the view above.
 */
export function ShopByRoomBand() {
  const { data: facets } = useQuery({
    queryKey: ['products', 'facets'] as const,
    queryFn: () => productsApi.facets(),
    staleTime: STALE_MS,
  })

  const counts = useMemo<RoomCounts | undefined>(() => {
    if (!facets?.rooms) return undefined
    return new Map(facets.rooms.map((row) => [row.value, row.count]))
  }, [facets])

  const rooms = useMemo(() => resolveRoomCards(counts), [counts])

  return <ShopByRoomBandView rooms={rooms} />
}

export default ShopByRoomBand
