/**
 * ProductCardMedia
 *
 * The square media box and the hover interaction. This is the only stateful
 * part of the product card, which is why it lives in its own file.
 *
 * THE ALIGNMENT MECHANISM — do not change without reading
 * docs/superpowers/specs/2026-07-30-product-grid-alignment-design.md:
 *
 *   Exactly ONE image sits in normal flow, carrying MEDIA_RATIO. It *is* the
 *   media box's height. Every hover slide is `position:absolute; inset:0` and
 *   therefore cannot contribute height. Grid rows then align purely because CSS
 *   Grid sizes each row to its tallest item and stretches the rest — no
 *   min-height and no line-clamp are involved.
 *
 * Hover is positional, not time-based: cursor X picks the slide. Reproduced from
 * mesonart.com; see docs/research/mesonart-grid/README.md.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Eye } from 'lucide-react'
import { isSquare, sortedImages, type ProductImage } from '@chobii/shared'
import { cn } from '~/lib/utils'
import {
  MEDIA_RATIO,
  SIZES_ATTR,
  EASE_PRIMARY,
  EASE_FAST,
  zoneFor,
} from './productCardTokens'

export interface ProductCardMediaProps {
  images: ProductImage[]
  slug: string
  /** Product title, used as the media link's accessible name. */
  title: string
  className?: string
}

export function ProductCardMedia({
  images,
  slug,
  title,
  className,
}: ProductCardMediaProps) {
  /** 0 = at rest (primary visible); 1..n-1 = a hover slide. */
  const [active, setActive] = useState(0)

  const ordered = sortedImages(images)
  const primary = ordered[0]
  const hoverSlides = ordered.slice(1)

  // Enforce the square contract loudly in development. object-contain would
  // otherwise quietly double-mat a bad asset, and object-cover would crop it —
  // both hide a data bug rather than surfacing it.
  useEffect(() => {
    if (import.meta.env.PROD) return
    const bad = ordered.filter((i) => !isSquare(i))
    if (bad.length) {
      console.error(
        `[ProductCardMedia] ${bad.length} non-square image(s) for "${slug}". ` +
          'Every stored product image must satisfy width === height; the grid ' +
          'alignment depends on it. Offending ids: ' +
          bad.map((i) => `${i.id} (${i.width}x${i.height})`).join(', ')
      )
    }
  }, [ordered, slug])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Mouse only. A touch pointer firing this would swap the image and then
      // navigate, which reads as a glitch on tap.
      if (e.pointerType !== 'mouse') return
      if (hoverSlides.length === 0) return
      setActive(zoneFor(e.clientX, e.currentTarget, ordered.length))
    },
    [hoverSlides.length, ordered.length]
  )

  const onPointerLeave = useCallback(() => setActive(0), [])

  if (!primary) return null

  return (
    <Link
      to="/posters/$slug"
      params={{ slug }}
      aria-label={title}
      tabIndex={-1}
      data-testid="media-box"
      className={cn(
        'relative block overflow-hidden rounded-[var(--card-radius)] bg-mat',
        className
      )}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {/* IN FLOW — this element defines the media box height. Never absolute. */}
      <img
        src={primary.url}
        alt={primary.altText}
        width={primary.width}
        height={primary.height}
        loading="lazy"
        decoding="async"
        sizes={SIZES_ATTR}
        className={cn('block w-full object-contain', MEDIA_RATIO)}
      />

      {/* ABSOLUTE — hover slides. Cannot contribute height. Desktop only:
          mesonart ships these under display:none on mobile and still downloads
          four unused images per card, which we avoid by not rendering them. */}
      {hoverSlides.map((m, i) => (
        <img
          key={m.id}
          src={m.url}
          alt=""
          aria-hidden
          width={m.width}
          height={m.height}
          loading="lazy"
          decoding="async"
          sizes={SIZES_ATTR}
          className={cn(
            'absolute inset-0 hidden h-full w-full object-contain md:block',
            'motion-safe:transition-opacity motion-safe:duration-500',
            EASE_PRIMARY,
            active === i + 1 ? 'opacity-100' : 'opacity-0'
          )}
        />
      ))}

      {/* Quick-view: 48x48, radius 60px, white on backdrop-blur, inset 16px.
          Fades in on hover at --ease-fast. Kept reachable by focus, unlike
          mesonart, which sets Flickity accessibility:false. */}
      <span
        data-testid="quick-view"
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-4 top-4 z-20 hidden md:grid',
          'h-12 w-12 place-items-center rounded-[60px]',
          'bg-background/90 text-foreground backdrop-blur-[12px]',
          'opacity-0 motion-safe:transition-opacity motion-safe:duration-300',
          EASE_FAST,
          'group-hover/card:opacity-100'
        )}
      >
        <Eye className="h-5 w-5" />
      </span>

      {/* Dots: n-1 of them. Slide 0 is only reachable by leaving the card, so
          it gets no dot — mesonart achieves the same with
          `.flickity-page-dot:first-child { display: none }`.
          Decorative: every image is reachable on the product page, so these are
          indicators rather than controls. */}
      {hoverSlides.length > 1 && (
        <div
          data-testid="card-dots"
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-[-14px] left-1/2 z-10',
            'hidden h-6 -translate-x-1/2 translate-y-2 items-center gap-1.5',
            'rounded-full bg-background px-4 opacity-0 md:flex',
            'invisible motion-safe:transition-[opacity,visibility,transform]',
            'motion-safe:duration-500',
            EASE_PRIMARY,
            'group-hover/card:visible group-hover/card:translate-y-0 group-hover/card:opacity-100'
          )}
        >
          {hoverSlides.map((m, i) => (
            <span
              key={m.id}
              className={cn(
                'h-[5px] w-[5px] rounded-full motion-safe:transition-colors',
                EASE_PRIMARY,
                // Active dot is a ring, inactive are solid — measured on mesonart.
                active === i + 1
                  ? 'bg-transparent ring-2 ring-foreground'
                  : 'bg-foreground'
              )}
            />
          ))}
        </div>
      )}
    </Link>
  )
}

export default ProductCardMedia
