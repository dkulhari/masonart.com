/**
 * Load a collection's members into the wishlist, to rearrange them there.
 *
 * The inverse of staging. Without it, changing a curated collection's order
 * means retyping UUIDs into the textarea — the limitation #473 recorded and
 * #503 only half-solved by making creation easy.
 *
 * ## Destructive on purpose
 *
 * This replaces the admin's wishlist outright. That is the owner's call: a
 * staff account is a work account, and anyone who wants a real wishlist uses a
 * personal one. Deciding it is acceptable does not make it silent, though — the
 * warning names how many saved items go, and offers them for copying first so
 * a mistake is recoverable by hand.
 *
 * ## Rule collections do not get this
 *
 * Their rule IS their membership. There is no explicit list to load, and no
 * ordering to edit.
 *
 * ## No memory of where the products came from
 *
 * Load and save are independent. The wishlist does not remember this
 * collection, and saving asks — at that moment — whether the result is a new
 * collection or an overwrite of an existing one. So loading A, rearranging and
 * saving over B is legitimate rather than a mistake to guard against.
 */

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { useWishlistIds, useWishlistStore } from '~/stores/wishlist'
import { Button } from '~/components/ui/Button'

export interface LoadIntoWishlistProps {
  kind: 'rule' | 'manual'
  /** The collection's members, in position order. */
  productIds: string[]
}

export function LoadIntoWishlist({ kind, productIds }: LoadIntoWishlistProps) {
  const navigate = useNavigate()
  const current = useWishlistIds()
  const replaceAll = useWishlistStore((state) => state.replaceAll)

  const [isConfirming, setIsConfirming] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (kind !== 'manual') return null

  const load = async () => {
    setIsWorking(true)
    setError(null)
    try {
      await replaceAll(productIds)
      navigate({ to: '/wishlist' })
    } catch (loadError) {
      // Stay put and say so. Navigating away from a write that did not land
      // would leave the admin editing a list the server never accepted.
      setError((loadError as Error).message)
      setIsConfirming(false)
    } finally {
      setIsWorking(false)
    }
  }

  const copyCurrent = async () => {
    const text = current.join('\n')
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          // Nothing to lose means nothing to weigh — go straight there.
          current.length === 0 ? void load() : setIsConfirming(true)
        }
        disabled={productIds.length === 0 || isWorking}
      >
        <Download className="mr-2 h-4 w-4" />
        Load into wishlist
      </Button>

      {productIds.length === 0 && (
        <p className="text-xs text-muted-foreground">
          This collection has no products yet.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {isConfirming && (
        <div
          role="alertdialog"
          aria-label="Replace your wishlist"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <p className="font-medium">
            This replaces your wishlist — {current.length}{' '}
            {current.length === 1 ? 'item' : 'items'} will be removed.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {productIds.length} product
            {productIds.length === 1 ? '' : 's'} from this collection will take
            their place, in its current order. Copy the ids first if you want
            them back.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={load} disabled={isWorking}>
              {isWorking ? 'Loading…' : 'Replace my wishlist'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyCurrent}
            >
              {copied ? 'Copied' : 'Copy current ids'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsConfirming(false)}
              disabled={isWorking}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoadIntoWishlist
