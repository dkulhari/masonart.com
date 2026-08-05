/**
 * Admin — curated collections.
 *
 * The sidebar has linked here since before the route existed; this is what
 * makes the link land somewhere.
 *
 * ## Ordering is edited here, not on the form
 *
 * The Discover order is a property of the SET, not of any one collection.
 * Putting "position 3" on a collection's own form invites two collections
 * claiming position 3, and there is nowhere sensible to resolve that. The
 * arrows below reorder the list and post the whole array to
 * `PUT /api/admin/collections/discover-order`, which rewrites every row in one
 * transaction (#468) so the rail is never observable half-reordered.
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { getApiUrl } from '~/lib/utils'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/Button'

export const Route = createFileRoute('/admin/collections/')({
  head: () => ({
    meta: [
      { title: 'Collections | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminCollectionsPage,
})

interface AdminCollection {
  id: string
  slug: string
  title: string
  subtitle: string | null
  kind: 'rule' | 'manual'
  rule: Record<string, unknown> | null
  imageUrl: string | null
  isActive: boolean
  showInDiscover: boolean
  discoverOrder: number | null
  sortOrder: number
  count: number
}

function AdminCollectionsPage() {
  const [collections, setCollections] = useState<AdminCollection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/collections`, {
        // Without this every request is a 401 — the session cookie is the
        // only thing the role gate reads.
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to load collections')
      const body = (await response.json()) as { collections: AdminCollection[] }
      setCollections(body.collections)
      setError(null)
    } catch (loadError) {
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Reorder locally, then post the whole list.
   *
   * Optimistic on purpose: the arrows are the only affordance and waiting a
   * round trip per click makes reordering ten collections feel broken. A
   * failure reloads from the server, so the list cannot silently disagree with
   * what was saved.
   */
  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      const inRail = collections.filter((c) => c.showInDiscover)
      const target = index + direction
      if (target < 0 || target >= inRail.length) return

      const reordered = [...inRail]
      const [moved] = reordered.splice(index, 1)
      if (!moved) return
      reordered.splice(target, 0, moved)

      setCollections((current) => [
        ...reordered,
        ...current.filter((c) => !c.showInDiscover),
      ])

      setIsSaving(true)
      try {
        const response = await fetch(
          `${getApiUrl()}/api/admin/collections/discover-order`,
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            // The whole ordered array. The endpoint replaces, it does not patch.
            body: JSON.stringify({ collectionIds: reordered.map((c) => c.id) }),
          }
        )
        if (!response.ok) throw new Error('Failed to save the order')
      } catch (saveError) {
        setError((saveError as Error).message)
        await load()
      } finally {
        setIsSaving(false)
      }
    },
    [collections, load]
  )

  const toggle = useCallback(
    async (collection: AdminCollection, field: 'isActive' | 'showInDiscover') => {
      setIsSaving(true)
      try {
        const response = await fetch(
          `${getApiUrl()}/api/admin/collections/${collection.id}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: !collection[field] }),
          }
        )
        if (!response.ok) throw new Error('Failed to update the collection')
        await load()
      } catch (saveError) {
        setError((saveError as Error).message)
      } finally {
        setIsSaving(false)
      }
    },
    [load]
  )

  const remove = useCallback(
    async (collection: AdminCollection) => {
      /**
       * Confirm first. DELETE cascades `collection_products`, so a manual
       * collection's curation goes with it — cheap to recreate, not cheap to
       * re-curate.
       */
      const confirmed = window.confirm(
        `Delete “${collection.title}”? ${
          collection.kind === 'manual'
            ? 'Its hand-picked product list will be deleted too. '
            : ''
        }This cannot be undone.`
      )
      if (!confirmed) return

      setIsSaving(true)
      try {
        const response = await fetch(
          `${getApiUrl()}/api/admin/collections/${collection.id}`,
          { method: 'DELETE', credentials: 'include' }
        )
        if (!response.ok) throw new Error('Failed to delete the collection')
        await load()
      } catch (deleteError) {
        setError((deleteError as Error).message)
      } finally {
        setIsSaving(false)
      }
    },
    [load]
  )

  const inRail = collections.filter((c) => c.showInDiscover)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Destinations shoppers can browse. A collection is either a saved
            filter or a hand-picked list.
          </p>
        </div>
        <Link to="/admin/collections/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New collection
          </Button>
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading collections…</p>
      ) : collections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="mb-1 font-medium">No collections yet</p>
          <p className="mb-6 text-sm text-muted-foreground">
            Create your first one to give shoppers somewhere to land from the
            Discover rail.
          </p>
          <Link to="/admin/collections/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New collection
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" data-testid="admin-collections-table">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Collection</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Products</th>
                <th className="px-4 py-3 font-medium">Live</th>
                <th className="px-4 py-3 font-medium">In rail</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((collection) => {
                const railIndex = inRail.findIndex((c) => c.id === collection.id)

                return (
                  <tr
                    key={collection.id}
                    className={cn(
                      'border-b border-border last:border-0',
                      !collection.isActive && 'opacity-60'
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{collection.title}</div>
                      <div className="text-xs text-muted-foreground">
                        /collections/{collection.slug}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                        {collection.kind === 'manual' ? 'Hand-picked' : 'Rule'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {/*
                        What the collection resolves to right now. Zero is the
                        number worth noticing — a rule matching nothing renders
                        an empty page, and the storefront hides the chip.
                      */}
                      <span
                        className={cn(
                          collection.count === 0 && 'text-destructive'
                        )}
                      >
                        {collection.count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggle(collection, 'isActive')}
                        disabled={isSaving}
                        aria-label={
                          collection.isActive
                            ? `Unpublish ${collection.title}`
                            : `Publish ${collection.title}`
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {collection.isActive ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={collection.showInDiscover}
                        onChange={() => toggle(collection, 'showInDiscover')}
                        disabled={isSaving}
                        aria-label={`Show ${collection.title} in the Discover rail`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {collection.showInDiscover ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => move(railIndex, -1)}
                            disabled={isSaving || railIndex <= 0}
                            aria-label={`Move ${collection.title} earlier`}
                            className="disabled:opacity-30"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(railIndex, 1)}
                            disabled={isSaving || railIndex >= inRail.length - 1}
                            aria-label={`Move ${collection.title} later`}
                            className="disabled:opacity-30"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to="/admin/collections/$id"
                          params={{ id: collection.id }}
                          aria-label={`Edit ${collection.title}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(collection)}
                          disabled={isSaving}
                          aria-label={`Delete ${collection.title}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
