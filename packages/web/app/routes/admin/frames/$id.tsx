/**
 * Admin — edit a frame.
 *
 * Loads the row first, then seeds the form with it. A form that opened blank
 * and PATCHed what it held would blank every field the admin did not retype —
 * the endpoint writes only supplied keys, but an empty string is a supplied
 * key.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getApiUrl } from '~/lib/utils'
import { FrameForm, type FrameFormValues } from './FrameForm'

export const Route = createFileRoute('/admin/frames/$id')({
  head: () => ({
    meta: [
      { title: 'Edit frame | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: EditFramePage,
})

interface LoadedFrame {
  name: string
  type: string
  category: FrameFormValues['category']
  description: string | null
  material: string | null
  color: string | null
  thickness: string | null
  priceModifier: string
  priceAddition: string
  imageUrl: string | null
  thumbnailUrl: string | null
  isActive: boolean
  sortOrder: number
}

/** Nulls become empty strings; the form's inputs are controlled. */
function toFormValues(frame: LoadedFrame): Partial<FrameFormValues> {
  return {
    name: frame.name,
    type: frame.type,
    category: frame.category,
    description: frame.description ?? '',
    material: frame.material ?? '',
    color: frame.color ?? '',
    thickness: frame.thickness ?? '',
    priceModifier: frame.priceModifier,
    priceAddition: frame.priceAddition,
    imageUrl: frame.imageUrl ?? '',
    thumbnailUrl: frame.thumbnailUrl ?? '',
    isActive: frame.isActive,
    sortOrder: String(frame.sortOrder),
  }
}

function EditFramePage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [initial, setInitial] = useState<Partial<FrameFormValues> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/frames/${id}`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to load the frame')
      const body = (await response.json()) as { frame: LoadedFrame }
      setInitial(toFormValues(body.frame))
      setError(null)
    } catch (loadError) {
      setError((loadError as Error).message)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (payload: Record<string, unknown>) => {
    setIsSaving(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/frames/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) {
        // Verbatim: a 409 names the taken slug.
        throw new Error(body.error ?? 'Failed to save the frame')
      }
      setError(null)
      void navigate({ to: '/admin/frames' })
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/frames"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Frames
        </Link>
        <h1 className="text-2xl font-medium">Edit frame</h1>
      </div>

      {initial === null ? (
        error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            {error}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading frame…</p>
        )
      ) : (
        <FrameForm
          initial={initial}
          onSubmit={save}
          submitError={error}
          submitLabel="Save changes"
          isSaving={isSaving}
        />
      )}
    </div>
  )
}
