/**
 * Admin — create a frame.
 *
 * Thin over `POST /api/admin/frames`. The one thing it does not do is
 * paraphrase the failure: a 409 arrives naming the slug that is taken, and
 * that name is the only part the admin can act on.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getApiUrl } from '~/lib/utils'
import { FrameForm } from './FrameForm'

export const Route = createFileRoute('/admin/frames/new')({
  head: () => ({
    meta: [
      { title: 'New frame | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: NewFramePage,
})

function NewFramePage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const create = async (payload: Record<string, unknown>) => {
    setIsSaving(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/frames`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) {
        // Verbatim: a 409 names the taken slug, and that is the actionable part.
        throw new Error(body.error ?? 'Failed to create the frame')
      }
      setError(null)
      void navigate({ to: '/admin/frames' })
    } catch (createError) {
      setError((createError as Error).message)
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
        <h1 className="text-2xl font-medium">New frame</h1>
      </div>

      <FrameForm
        onSubmit={create}
        submitError={error}
        submitLabel="Create frame"
        isSaving={isSaving}
      />
    </div>
  )
}
