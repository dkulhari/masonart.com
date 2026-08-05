/**
 * Admin — edit a collection.
 *
 * Loads the row, hands it to the same form the create route uses. Manual
 * membership is fetched separately because it lives in its own table and has
 * its own endpoint — the order is a payload of its own (#468).
 */

import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getApiUrl } from '~/lib/utils'
import {
  CollectionForm,
  type CollectionFormValues,
} from '~/components/admin/CollectionForm'
import { LoadIntoWishlist } from '~/components/admin/LoadIntoWishlist'

export const Route = createFileRoute('/admin/collections/$id')({
  head: () => ({
    meta: [
      { title: 'Edit collection | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: EditCollectionPage,
})

function EditCollectionPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [initial, setInitial] = useState<Partial<CollectionFormValues> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(`${getApiUrl()}/api/admin/collections/${id}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load the collection')
        return response.json()
      })
      .then((body) => {
        if (cancelled) return
        const c = body.collection
        setInitial({
          slug: c.slug,
          title: c.title,
          subtitle: c.subtitle ?? '',
          description: c.description ?? '',
          kind: c.kind,
          rule: c.rule ?? {},
          imageUrl: c.imageUrl ?? '',
          isActive: c.isActive,
          showInDiscover: c.showInDiscover,
          seoTitle: c.seoTitle ?? '',
          seoDescription: c.seoDescription ?? '',
          /**
           * The EXISTING members, not an empty array.
           *
           * The form replaces the member list on save, so loading without them
           * posts `[]` and wipes the curation. That is not hypothetical — it
           * deleted a collection's members the first time one was staged from
           * the wishlist.
           */
          productIds: c.productIds ?? [],
        })
      })
      .catch((loadError) => {
        if (!cancelled) setError((loadError as Error).message)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div className="space-y-6">
      <Link
        to="/admin/collections"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Collections
      </Link>

      <h1 className="text-2xl font-medium">Edit collection</h1>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {error}
        </div>
      )}

      {initial?.kind === 'manual' && (
        <div className="rounded-lg border border-border px-4 py-3">
          <p className="mb-1 text-sm font-medium">Reorder these products</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Load them into your wishlist, drag them into the order you want,
            then save back over this collection.
          </p>
          <LoadIntoWishlist
            kind="manual"
            productIds={initial.productIds ?? []}
          />
        </div>
      )}

      {initial ? (
        <CollectionForm
          initial={initial}
          collectionId={id}
          onSaved={() => navigate({ to: '/admin/collections' })}
        />
      ) : (
        !error && <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  )
}
