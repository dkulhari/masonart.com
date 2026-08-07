/**
 * WishlistButton — the heart.
 *
 * One control, two states. Used on the product card and on the PDP, where it
 * replaces a button that had carried `aria-label="Add to wishlist"` and no
 * handler since the detail page was written.
 *
 * The heart is MONOCHROME. A red heart is the obvious instinct and the wrong
 * one here: `--sale` is reserved for sale prices, and
 * tests/styles/storefront-token-compliance.test.ts fails the build on anything
 * reaching outside the palette.
 */

import { Heart } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '~/lib/utils'
import {
  useIsWishlisted,
  useWishlistActions,
  useWishlistStore,
} from '~/stores/wishlist'

export interface WishlistButtonProps {
  productId: string
  /** `card` is the compact overlay-free variant; `detail` matches the PDP row. */
  variant?: 'card' | 'detail'
  className?: string
}

export function WishlistButton({
  productId,
  variant = 'card',
  className,
}: WishlistButtonProps) {
  const isSaved = useIsWishlisted(productId)
  const { load, toggle } = useWishlistActions()
  const isLoaded = useWishlistStore((state) => state.isLoaded)

  // One load for the whole page — the store no-ops after the first call, so
  // 24 cards mounting produce one request, not 24.
  useEffect(() => {
    if (!isLoaded) void load()
  }, [isLoaded, load])

  return (
    <button
      type="button"
      onClick={(event) => {
        // On the card this sits inside a link region; without this the click
        // navigates to the PDP instead of saving.
        event.preventDefault()
        event.stopPropagation()
        void toggle(productId)
      }}
      aria-label={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={isSaved}
      className={cn(
        'flex items-center justify-center transition-colors',
        variant === 'detail'
          ? 'rounded-pill border border-border p-3 hover:bg-muted'
          : // --card-meta rather than --muted-foreground: a warm neutral at
            // 5.4:1 on white where the slate was 4.76:1. MORE legible, not
            // less — the reference's own heart is rgb(219 216 194), 1.3:1,
            // and being readable is a thing this card wins on.
            'h-8 w-8 rounded-full text-[hsl(var(--card-meta))] hover:text-foreground',
        className
      )}
    >
      <Heart
        className={cn(
          variant === 'detail' ? 'h-5 w-5' : 'h-4 w-4',
          isSaved && 'fill-foreground text-foreground'
        )}
      />
    </button>
  )
}

export default WishlistButton
