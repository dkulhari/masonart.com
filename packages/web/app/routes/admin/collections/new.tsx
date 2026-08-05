/**
 * Admin — create a collection.
 *
 * Thin: everything lives in CollectionForm, which the edit route renders too.
 * A second copy of the rule builder is how the two ends up disagreeing about
 * which facets exist.
 */

import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { CollectionForm } from '~/components/admin/CollectionForm'

export const Route = createFileRoute('/admin/collections/new')({
  head: () => ({
    meta: [
      { title: 'New collection | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: NewCollectionPage,
})

function NewCollectionPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <Link
        to="/admin/collections"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Collections
      </Link>

      <h1 className="text-2xl font-medium">New collection</h1>

      <CollectionForm
        onSaved={() => navigate({ to: '/admin/collections' })}
      />
    </div>
  )
}
