/**
 * Admin Approval Detail Page - chobi.art E-commerce Platform
 *
 * Production photo approval detail page with:
 * - Photo upload functionality
 * - Customer comments timeline
 * - Admin response form
 * - Approval status management
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Upload,
  Camera,
  CheckCircle2,
  Clock,
  MessageSquare,
  Timer,
  Send,
  X,
  ExternalLink,
  Package,
  Trash2,
} from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'

// ============================================================================
// Route Configuration
// ============================================================================

const searchParamsSchema = z.object({
  action: z.enum(['upload']).optional(),
})

export const Route = createFileRoute('/admin/approvals/$id')({
  validateSearch: (search) => searchParamsSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Approval Details | Admin | chobi.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminApprovalDetailPage,
})

// ============================================================================
// Types
// ============================================================================

interface ApprovalPhoto {
  id: string
  url: string
  thumbnailUrl: string | null
  sortOrder: number
  uploadedAt: string
}

interface ApprovalComment {
  id: string
  authorType: 'admin' | 'customer'
  authorId: string | null
  comment: string
  createdAt: string
}

interface ApprovalOrder {
  id: string
  orderNumber: string
  status: string
  shippingAddress: {
    fullName?: string
    phone?: string
  } | null
}

interface ApprovalDetail {
  id: string
  orderId: string
  orderItemId: string
  status: 'pending_upload' | 'pending_approval' | 'changes_requested' | 'approved' | 'expired'
  approvalToken: string
  deadlineAt: string | null
  approvedAt: string | null
  reminderSentAt: string | null
  createdAt: string
  updatedAt: string
  photos: ApprovalPhoto[]
  comments: ApprovalComment[]
  order: ApprovalOrder | null
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchApproval(id: string): Promise<ApprovalDetail> {
  const response = await fetch(`${getApiUrl()}/api/admin/approvals/${id}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Approval not found')
    }
    const errorData = await response.json() as { error?: string }
    throw new Error(errorData.error || 'Failed to fetch approval')
  }

  const data = await response.json() as { data: ApprovalDetail }
  return data.data
}

async function uploadPhotos(
  approvalId: string,
  photos: { url: string; thumbnailUrl?: string; sortOrder: number }[],
  sendNotification: boolean
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/approvals/${approvalId}/photos`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos, sendNotification }),
  })

  if (!response.ok) {
    const errorData = await response.json() as { error?: string }
    throw new Error(errorData.error || 'Failed to upload photos')
  }
}

async function deletePhotos(approvalId: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/approvals/${approvalId}/photos`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    const errorData = await response.json() as { error?: string }
    throw new Error(errorData.error || 'Failed to delete photos')
  }
}

async function addComment(approvalId: string, comment: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/approvals/${approvalId}/comments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  })

  if (!response.ok) {
    const errorData = await response.json() as { error?: string }
    throw new Error(errorData.error || 'Failed to add comment')
  }
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const statusColors: Record<string, string> = {
    pending_upload: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    pending_approval: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    changes_requested: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    expired: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  }

  const statusLabels: Record<string, string> = {
    pending_upload: 'Pending Upload',
    pending_approval: 'Pending Approval',
    changes_requested: 'Changes Requested',
    approved: 'Approved',
    expired: 'Expired',
  }

  const statusIcons: Record<string, React.ReactNode> = {
    pending_upload: <Camera className="h-4 w-4" />,
    pending_approval: <Clock className="h-4 w-4" />,
    changes_requested: <MessageSquare className="h-4 w-4" />,
    approved: <CheckCircle2 className="h-4 w-4" />,
    expired: <Timer className="h-4 w-4" />,
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium', statusColors[status])}>
      {statusIcons[status]}
      {statusLabels[status]}
    </span>
  )
}

// ============================================================================
// Photo Upload Section
// ============================================================================

function PhotoUploadSection({
  approval,
  onUpload,
  onDelete,
  loading,
}: {
  approval: ApprovalDetail
  onUpload: (photos: { url: string }[], notify: boolean) => Promise<void>
  onDelete: () => Promise<void>
  loading: boolean
}) {
  const [urls, setUrls] = useState<string[]>([''])
  const [sendNotification, setSendNotification] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleAddUrl = () => {
    setUrls([...urls, ''])
  }

  const handleRemoveUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index))
  }

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls]
    newUrls[index] = value
    setUrls(newUrls)
  }

  const handleUpload = async () => {
    const validUrls = urls.filter((url) => url.trim())
    if (validUrls.length === 0) return

    setUploading(true)
    try {
      await onUpload(
        validUrls.map((url, i) => ({ url, sortOrder: i })),
        sendNotification
      )
      setUrls([''])
    } catch (err) {
      // Error handled by parent
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete all photos? This action cannot be undone.')) {
      return
    }
    setDeleting(true)
    try {
      await onDelete()
    } catch (err) {
      // Error handled by parent
    } finally {
      setDeleting(false)
    }
  }

  const canUpload = approval.status === 'pending_upload' || approval.status === 'changes_requested'

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
        <Camera className="h-5 w-5" />
        Production Photos
      </h2>

      {/* Existing Photos */}
      {approval.photos.length > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {approval.photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <img
                  src={photo.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <a
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <ExternalLink className="h-6 w-6 text-white" />
                </a>
              </div>
            ))}
          </div>
          {canUpload && (
            <button
              onClick={handleDelete}
              disabled={deleting || loading}
              className="mt-4 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting...' : 'Delete All & Re-upload'}
            </button>
          )}
        </div>
      )}

      {/* Upload Form */}
      {canUpload && approval.photos.length === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter the URLs of the production photos to upload.
          </p>

          {urls.map((url, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(index, e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              {urls.length > 1 && (
                <button
                  onClick={() => handleRemoveUrl(index)}
                  className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}

          <button
            onClick={handleAddUrl}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            + Add another photo
          </button>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sendNotification"
              checked={sendNotification}
              onChange={(e) => setSendNotification(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="sendNotification" className="text-sm text-gray-600 dark:text-gray-400">
              Send notification email to customer
            </label>
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading || loading || urls.every((u) => !u.trim())}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading...' : 'Upload Photos'}
          </button>
        </div>
      )}

      {/* Upload not allowed message */}
      {!canUpload && approval.photos.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Photos cannot be uploaded in the current status.
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Comments Section
// ============================================================================

function CommentsSection({
  approval,
  onAddComment,
  loading,
}: {
  approval: ApprovalDetail
  onAddComment: (comment: string) => Promise<void>
  loading: boolean
}) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return

    setSubmitting(true)
    try {
      await onAddComment(comment.trim())
      setComment('')
    } catch (err) {
      // Error handled by parent
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
        <MessageSquare className="h-5 w-5" />
        Comments
      </h2>

      {/* Comments Timeline */}
      <div className="mb-6 space-y-4">
        {approval.comments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No comments yet.
          </p>
        ) : (
          approval.comments.map((c) => (
            <div
              key={c.id}
              className={cn(
                'rounded-lg p-4',
                c.authorType === 'admin'
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'bg-gray-50 dark:bg-gray-700/50'
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    c.authorType === 'admin'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
                      : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                  )}
                >
                  {c.authorType === 'admin' ? 'Admin' : 'Customer'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(c.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {c.comment}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a response to the customer..."
          rows={3}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        <button
          type="submit"
          disabled={submitting || loading || !comment.trim()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {submitting ? 'Sending...' : 'Send Response'}
        </button>
      </form>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function AdminApprovalDetailPage() {
  const params = Route.useParams() as { id: string }
  // Note: Route.useSearch() available for ?action=upload to auto-open upload form

  const [approval, setApproval] = useState<ApprovalDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadApproval = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchApproval(params.id)
      setApproval(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approval')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadApproval()
  }, [loadApproval])

  const handleUploadPhotos = async (photos: { url: string }[], notify: boolean) => {
    try {
      await uploadPhotos(params.id, photos.map((p, i) => ({ ...p, sortOrder: i })), notify)
      await loadApproval()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photos')
      throw err
    }
  }

  const handleDeletePhotos = async () => {
    try {
      await deletePhotos(params.id)
      await loadApproval()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete photos')
      throw err
    }
  }

  const handleAddComment = async (comment: string) => {
    try {
      await addComment(params.id, comment)
      await loadApproval()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment')
      throw err
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getDeadlineInfo = () => {
    if (!approval?.deadlineAt) return null
    const deadline = new Date(approval.deadlineAt)
    const now = new Date()
    const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)

    if (hoursLeft < 0) return { text: 'Deadline passed', className: 'text-red-600' }
    if (hoursLeft < 24) return { text: `${Math.round(hoursLeft)} hours left`, className: 'text-orange-600' }
    return { text: `${Math.round(hoursLeft / 24)} days left`, className: 'text-gray-600' }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/admin/approvals"
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </a>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Approval Details
              </h1>
              {approval?.order && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Order #{approval.order.orderNumber}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={loadApproval}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && !approval ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : approval ? (
          <div className="space-y-6">
            {/* Status & Info Card */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <StatusBadge status={approval.status} />
                  {getDeadlineInfo() && approval.status !== 'approved' && approval.status !== 'expired' && (
                    <p className={cn('mt-2 flex items-center gap-1 text-sm', getDeadlineInfo()?.className)}>
                      <Timer className="h-4 w-4" />
                      {getDeadlineInfo()?.text}
                    </p>
                  )}
                </div>
                <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                  <p>Created: {formatDate(approval.createdAt)}</p>
                  {approval.approvedAt && (
                    <p className="text-green-600">Approved: {formatDate(approval.approvedAt)}</p>
                  )}
                </div>
              </div>

              {/* Item Info */}
              {approval.order && (
                <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                  <div className="flex items-start gap-4">
                    <Package className="h-5 w-5 text-gray-400" />
                    <div>
                      <a
                        href={`/admin/orders/${approval.order.id}`}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Order #{approval.order.orderNumber}
                      </a>
                      {approval.order.shippingAddress?.fullName && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {approval.order.shippingAddress.fullName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Photo Upload Section */}
            <PhotoUploadSection
              approval={approval}
              onUpload={handleUploadPhotos}
              onDelete={handleDeletePhotos}
              loading={loading}
            />

            {/* Comments Section */}
            <CommentsSection
              approval={approval}
              onAddComment={handleAddComment}
              loading={loading}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
