/**
 * Admin — the frame catalogue.
 *
 * Repricing a frame used to be a deploy: frames were seeded in code and
 * reached the storefront through one read-only endpoint. This is the screen
 * that ends that.
 *
 * ## Archived frames are listed, not hidden
 *
 * `GET /api/admin/frames` deliberately returns inactive rows, and this table
 * shows them dimmed with an Unarchive action. Filtering them out here would
 * make archiving a one-way door through the only UI that can archive — the
 * admin would have no way back to a frame they retired by mistake.
 *
 * ## No search params
 *
 * `router.tsx` overrides TanStack's search serialisation, so any
 * `validateSearch` schema added here would have to coerce numbers and split
 * comma-joined arrays or the route error-boundaries to a blank page. The
 * catalogue is seven rows; it does not need a query string.
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react'
import { getApiUrl, cn } from '~/lib/utils'
import { Button } from '~/components/ui/Button'

export const Route = createFileRoute('/admin/frames/')({
  head: () => ({
    meta: [
      { title: 'Frames | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminFramesPage,
})

export interface AdminFrame {
  id: string
  name: string
  type: string
  category: 'rolled' | 'frameless' | 'framed'
  priceModifier: string
  priceAddition: string
  thumbnailUrl: string | null
  isActive: boolean
  sortOrder: number
}

const CATEGORY_LABELS: Record<AdminFrame['category'], string> = {
  rolled: 'Rolled Canvas',
  frameless: 'Frameless',
  framed: 'Framed',
}

const rupees = (value: string) => {
  const amount = parseFloat(value)
  return Number.isFinite(amount)
    ? `₹${amount.toLocaleString('en-IN')}`
    : value
}

// ============================================================================
// Table
// ============================================================================

interface FramesTableProps {
  frames: AdminFrame[]
  onArchive: (frame: AdminFrame) => void
  onUnarchive: (frame: AdminFrame) => void
  isSaving?: boolean
}

export function FramesTable({
  frames,
  onArchive,
  onUnarchive,
  isSaving = false,
}: FramesTableProps) {
  if (frames.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <p className="mb-1 font-medium">No frames yet</p>
        <p className="mb-6 text-sm text-muted-foreground">
          A product page sells nothing without at least one format option.
        </p>
        <Link to="/admin/frames/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New frame
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-testid="admin-frames-table">
        <thead className="border-b border-border bg-muted/40 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Frame</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Groups under</th>
            <th className="px-4 py-3 font-medium">Multiplier</th>
            <th className="px-4 py-3 font-medium">Flat addition</th>
            <th className="px-4 py-3 font-medium">Order</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {frames.map((frame) => (
            <tr
              key={frame.id}
              className={cn(
                'border-b border-border last:border-0',
                // Dimming alone is invisible to a screen reader and to a
                // colourblind admin, so the row says so in words too.
                !frame.isActive && 'opacity-60'
              )}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {frame.thumbnailUrl && (
                    <img
                      src={frame.thumbnailUrl}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  )}
                  <div>
                    <div className="font-medium">{frame.name}</div>
                    {!frame.isActive && (
                      <div className="text-xs text-muted-foreground">
                        Archived
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs">{frame.type}</td>
              <td className="px-4 py-3">{CATEGORY_LABELS[frame.category]}</td>
              <td className="px-4 py-3">×{frame.priceModifier}</td>
              <td className="px-4 py-3">{rupees(frame.priceAddition)}</td>
              <td className="px-4 py-3">{frame.sortOrder}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    to="/admin/frames/$id"
                    params={{ id: frame.id }}
                    aria-label={`Edit ${frame.name}`}
                  >
                    <Button variant="ghost" size="sm">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  {frame.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => onArchive(frame)}
                    >
                      <Archive className="mr-1 h-4 w-4" />
                      Archive
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => onUnarchive(frame)}
                    >
                      <ArchiveRestore className="mr-1 h-4 w-4" />
                      Unarchive
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

function AdminFramesPage() {
  const [frames, setFrames] = useState<AdminFrame[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/frames`, {
        // Without this every request is a 401 — the session cookie is the
        // only thing the role gate reads.
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to load frames')
      const body = (await response.json()) as { frames: AdminFrame[] }
      setFrames(body.frames)
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

  const archive = useCallback(
    async (frame: AdminFrame) => {
      setIsSaving(true)
      try {
        const response = await fetch(
          `${getApiUrl()}/api/admin/frames/${frame.id}`,
          { method: 'DELETE', credentials: 'include' }
        )
        if (!response.ok) {
          /**
           * The API refuses to archive the last active frame. Its message
           * explains why; a generic failure would leave the admin retrying.
           */
          const body = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(body.error ?? 'Failed to archive the frame')
        }
        await load()
        setError(null)
      } catch (archiveError) {
        setError((archiveError as Error).message)
      } finally {
        setIsSaving(false)
      }
    },
    [load]
  )

  const unarchive = useCallback(
    async (frame: AdminFrame) => {
      setIsSaving(true)
      try {
        const response = await fetch(
          `${getApiUrl()}/api/admin/frames/${frame.id}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: true }),
          }
        )
        if (!response.ok) throw new Error('Failed to unarchive the frame')
        await load()
        setError(null)
      } catch (unarchiveError) {
        setError((unarchiveError as Error).message)
      } finally {
        setIsSaving(false)
      }
    },
    [load]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Frames</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The format options a shopper chooses between, and what each one
            adds to the price of a piece.
          </p>
        </div>
        <Link to="/admin/frames/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New frame
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
        <p className="text-sm text-muted-foreground">Loading frames…</p>
      ) : (
        <FramesTable
          frames={frames}
          onArchive={archive}
          onUnarchive={unarchive}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}
