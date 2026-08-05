/**
 * Turn the wishlist into a curated collection.
 *
 * ## Why the wishlist
 *
 * Browsing the store and clicking hearts already IS a product picker — it has
 * search, the filter rail, and the artwork at full size. What it lacked was an
 * export. #473 shipped the manual-collection form with a textarea of raw
 * UUIDs, noting that as a limitation; this is the thing that retires it.
 *
 * The ORDER is what makes it worth doing. `curated-collections` gave manual
 * collections an ordered membership because ordering is the one thing a rule
 * cannot express, and #502 made the wishlist rearrangeable. An admin now
 * hearts pieces, drags them into the order they want, and presses one button.
 *
 * ## Staff only
 *
 * Product ids are not secret — they sit in the DOM and in every API response.
 * Gating this is about not putting internal identifiers in front of every
 * shopper, not about exposure.
 *
 * ## One staging slot
 *
 * This is the admin's PERSONAL wishlist. Curating a second collection means
 * clearing the first, and staged items sit alongside anything they genuinely
 * saved. Said out loud in the UI rather than left to be discovered halfway
 * through.
 *
 * ## The destination is chosen at save time
 *
 * The wishlist remembers NOTHING about where its contents came from. An admin
 * can load collection A (#507), rearrange, and save over collection B — that
 * is legitimate rather than a mistake to guard against, and carrying a
 * "staging context" around to prevent it would be more state for less freedom.
 */

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardCopy, FolderPlus, Save } from 'lucide-react'
import { getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'

/** Roles that may author catalogue content — the gate `/api/admin/collections` uses. */
const STAFF_ROLES = ['content-manager', 'admin', 'super-admin']

/** Just enough of a collection to pick one and warn about it. */
interface AdminCollectionOption {
  id: string
  title: string
  kind: 'rule' | 'manual'
  count: number
}

export interface WishlistStagingBarProps {
  /** The viewer's role, or null when signed out. */
  role: string | null | undefined
  /** Saved ids, in the order they are displayed. */
  productIds: string[]
}

export function WishlistStagingBar({
  role,
  productIds,
}: WishlistStagingBarProps) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  /** Set when the clipboard API is unavailable and the ids need showing instead. */
  const [fallbackText, setFallbackText] = useState<string | null>(null)

  /**
   * The save flow. `null` = closed; otherwise which destination is being
   * chosen. Deliberately transient: nothing about it survives a reload,
   * because the wishlist does not remember what it is staging for.
   */
  const [mode, setMode] = useState<'choose' | 'overwrite' | null>(null)
  const [collections, setCollections] = useState<AdminCollectionOption[]>([])
  const [targetId, setTargetId] = useState('')
  const [confirming, setConfirming] = useState(false)

  if (!role || !STAFF_ROLES.includes(role.toLowerCase())) return null

  const isEmpty = productIds.length === 0
  const asText = productIds.join('\n')

  const copy = async () => {
    setError(null)
    try {
      /**
       * `navigator.clipboard` is absent on insecure origins and in some
       * browsers. A copy button that silently does nothing is worse than no
       * button, so the ids get shown in a selectable field instead.
       */
      if (!navigator.clipboard?.writeText) {
        setFallbackText(asText)
        return
      }
      await navigator.clipboard.writeText(asText)
      setFallbackText(null)
    } catch {
      setFallbackText(asText)
    }
  }

  /**
   * Manual collections only.
   *
   * `GET /api/admin/collections` returns every row with its `kind`, so the
   * filter is client-side. Offering a rule collection would be offering an
   * operation the API refuses — its rule IS its membership.
   */
  const openOverwrite = async () => {
    setMode('overwrite')
    setError(null)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/collections`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Could not load the collections')
      const body = (await response.json()) as {
        collections: AdminCollectionOption[]
      }
      setCollections(body.collections.filter((c) => c.kind === 'manual'))
    } catch (loadError) {
      setError((loadError as Error).message)
    }
  }

  const target = collections.find((c) => c.id === targetId)

  const overwrite = async () => {
    if (!target) return
    setIsSaving(true)
    setError(null)

    try {
      /**
       * REPLACES the membership — #468's endpoint takes the whole ordered
       * array in one transaction. It does not merge, which is why the confirm
       * above says what is currently there.
       */
      const response = await fetch(
        `${getApiUrl()}/api/admin/collections/${target.id}/products`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds }),
        }
      )
      if (!response.ok) {
        throw new Error(`Could not save over ${target.title}`)
      }

      setConfirming(false)
      setMode(null)
      navigate({ to: '/admin/collections/$id', params: { id: target.id } })
    } catch (saveError) {
      setError((saveError as Error).message)
      setConfirming(false)
    } finally {
      setIsSaving(false)
    }
  }

  const createCollection = async () => {
    setIsSaving(true)
    setError(null)

    try {
      /**
       * Created untitled and unpublished, then the admin is dropped on the
       * edit form. Asking for a title in a prompt here would be a worse
       * version of the form that already exists.
       */
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
      const response = await fetch(`${getApiUrl()}/api/admin/collections`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: `staged-${stamp}`,
          title: `Staged collection ${stamp}`,
          kind: 'manual',
          isActive: false,
          showInDiscover: false,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error ?? 'Could not create the collection')
      }

      const id = body.collection?.id
      if (!id) throw new Error('The collection was created without an id')

      // Membership is its own endpoint because the order is its own payload.
      const members = await fetch(
        `${getApiUrl()}/api/admin/collections/${id}/products`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds }),
        }
      )
      if (!members.ok) {
        throw new Error('Created, but the product list did not save')
      }

      navigate({ to: '/admin/collections/$id', params: { id } })
    } catch (createError) {
      setError((createError as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      data-testid="wishlist-staging-bar"
      className="mb-8 rounded-lg border border-border bg-muted/40 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {productIds.length} {productIds.length === 1 ? 'item' : 'items'} —
            staging for a collection
          </p>
          <p className="text-xs text-muted-foreground">
            This is your own wishlist, so there is one staging slot: curating
            another collection means clearing this list first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copy}
            disabled={isEmpty}
          >
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy IDs
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setMode('choose')}
            disabled={isEmpty || isSaving}
          >
            <Save className="mr-2 h-4 w-4" />
            Save as collection
          </Button>
        </div>
      </div>

      {mode === 'choose' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-4 py-3">
          <span className="text-sm">Save these {productIds.length} in order to:</span>
          <Button
            type="button"
            size="sm"
            onClick={createCollection}
            disabled={isSaving}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            {isSaving ? 'Creating…' : 'New collection'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={openOverwrite}>
            Overwrite an existing one
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMode(null)}
          >
            Cancel
          </Button>
        </div>
      )}

      {mode === 'overwrite' && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-background px-4 py-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Collection to overwrite</span>
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Choose one…</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.title} ({collection.count})
                </option>
              ))}
            </select>
          </label>

          {collections.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No hand-picked collections yet — create one instead.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={!target || isSaving}
            >
              Overwrite
            </Button>
            {/* "Back", not "Cancel": the confirm dialog below has its own
                Cancel, and two identically-labelled buttons in one panel is
                ambiguous to read and impossible to target. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setMode(null)
                setConfirming(false)
              }}
            >
              Back
            </Button>
          </div>

          {confirming && target && (
            <div
              role="alertdialog"
              aria-label="Confirm overwrite"
              className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
            >
              <p className="font-medium">
                Replace everything in “{target.title}”?
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                It currently holds {target.count} product
                {target.count === 1 ? '' : 's'}. All of them are removed and
                these {productIds.length} take their place, in this order. This
                does not merge.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={overwrite}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Replace its products'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {fallbackText !== null && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted-foreground">
            Clipboard unavailable — select and copy:
          </p>
          <textarea
            readOnly
            value={fallbackText}
            rows={Math.min(productIds.length, 8)}
            aria-label="Product IDs"
            className="w-full rounded-lg border border-border bg-background p-2 font-mono text-xs"
          />
        </div>
      )}
    </div>
  )
}

export default WishlistStagingBar
