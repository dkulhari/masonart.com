/**
 * Wishlist Page - chobii.art
 *
 * PUBLIC, not under `_authed`. Saving does not require an account: a guest's
 * list lives in localStorage and merges into the account on sign-in (#477), so
 * bouncing a guest to the login page here would hide the very list they just
 * built. The signed-in and signed-out pages are the same page — the store
 * holds ids either way, and `WishlistContents` hydrates them through the
 * public by-ids endpoint.
 *
 * `noindex`: the content is per-visitor and empty for a crawler.
 */

import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { WishlistContents } from '~/components/wishlist/WishlistContents'
import { WishlistStagingBar } from '~/components/wishlist/WishlistStagingBar'
import { useWishlistIds } from '~/stores/wishlist'

export const Route = createFileRoute('/wishlist')({
  head: () => ({
    meta: [
      { title: 'Wishlist | chobii.art' },
      {
        name: 'description',
        content:
          'The posters you have saved at chobii.art. Save what you like without an account — signing in keeps the list with you.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: WishlistPage,
})

function WishlistPage() {
  /**
   * Session comes from the root route's beforeLoad, the same way the header
   * reads it for the staff entry.
   */
  const { session } = useRouteContext({ from: '__root__' }) as {
    session?: { user?: { role?: string } } | null
  }
  const productIds = useWishlistIds()

  return (
    <>
      <SectionBand tone="beige" className="py-10 sm:py-14">
        <div className="container-wide">
          <DisplayHeading className="text-foreground">Wishlist</DisplayHeading>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Everything you have saved, in one place. No account needed — sign in
            and it follows you to your next device.
          </p>
        </div>
      </SectionBand>

      <div className="container-wide py-8 lg:py-12">
        {/* Staff only — renders null for everyone else. */}
        <WishlistStagingBar
          role={session?.user?.role ?? null}
          productIds={productIds}
        />
        <WishlistContents />
      </div>
    </>
  )
}
