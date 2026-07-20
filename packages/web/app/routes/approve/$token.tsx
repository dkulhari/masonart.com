/**
 * Token-Based Production Approval Page - MasonArt E-commerce Platform
 *
 * Allows customers to review production photos and approve for shipping.
 * Features full-screen photo gallery with zoom and timeline display.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  ZoomIn,
  ZoomOut,
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  Package,
  Timer,
  Send,
  AlertTriangle,
} from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/approve/$token')({
  head: () => ({
    meta: [
      { title: 'Review Your Production Photos | MasonArt' },
      { name: 'description', content: 'Review and approve your custom poster production photos.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ApprovalPage,
})

// ============================================================================
// Types
// ============================================================================

type ApprovalStatus = 'pending_upload' | 'pending_approval' | 'changes_requested' | 'approved' | 'expired'

interface ApprovalPhoto {
  id: string
  url: string
  thumbnailUrl?: string
}

interface ApprovalComment {
  id: string
  authorType: 'admin' | 'customer'
  comment: string
  createdAt: string
}

interface ApprovalData {
  id: string
  status: ApprovalStatus
  deadlineAt?: string | null
  approvedAt?: string | null
  photos: ApprovalPhoto[]
  comments: ApprovalComment[]
  order?: {
    orderNumber: string
    status: string
  } | null
  orderItem?: {
    title?: string
    sizeLabel?: string
  } | null
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchApproval(token: string): Promise<ApprovalData> {
  const response = await fetch(`${getApiUrl()}/api/approvals/${token}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const error = await response.json() as { error?: string }
    throw new Error(error.error || 'Failed to load approval')
  }

  const result = await response.json() as { success: boolean; data: ApprovalData }
  return result.data
}

async function submitChangeRequest(token: string, comment: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/approvals/${token}/changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  })

  if (!response.ok) {
    const error = await response.json() as { error?: string }
    throw new Error(error.error || 'Failed to submit change request')
  }
}

async function approveProduction(token: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/approvals/${token}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const error = await response.json() as { error?: string }
    throw new Error(error.error || 'Failed to approve')
  }
}

// ============================================================================
// Status Configuration
// ============================================================================

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; color: string; bgColor: string }> = {
  pending_upload: {
    label: 'Awaiting Photos',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  pending_approval: {
    label: 'Ready for Review',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  changes_requested: {
    label: 'Changes Requested',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  approved: {
    label: 'Approved',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  expired: {
    label: 'Expired',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
}

// ============================================================================
// Photo Gallery Modal
// ============================================================================

interface GalleryModalProps {
  photos: ApprovalPhoto[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

function GalleryModal({ photos, currentIndex, onClose, onNavigate }: GalleryModalProps) {
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const lastPositionRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const currentPhoto = photos[currentIndex]

  if (!currentPhoto) return null

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 4))
  const handleZoomOut = () => {
    setZoom((z) => {
      const newZoom = Math.max(z - 0.5, 1)
      if (newZoom === 1) setPosition({ x: 0, y: 0 })
      return newZoom
    })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true)
      lastPositionRef.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - lastPositionRef.current.x,
        y: e.clientY - lastPositionRef.current.y,
      })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (zoom > 1 && e.touches.length === 1 && touch) {
      setIsDragging(true)
      lastPositionRef.current = {
        x: touch.clientX - position.x,
        y: touch.clientY - position.y,
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (isDragging && zoom > 1 && e.touches.length === 1 && touch) {
      setPosition({
        x: touch.clientX - lastPositionRef.current.x,
        y: touch.clientY - lastPositionRef.current.y,
      })
    }
  }

  const handleTouchEnd = () => setIsDragging(false)

  // Reset zoom when changing photos
  useEffect(() => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }, [currentIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1)
      if (e.key === 'ArrowRight' && currentIndex < photos.length - 1) onNavigate(currentIndex + 1)
      if (e.key === '+' || e.key === '=') handleZoomIn()
      if (e.key === '-') handleZoomOut()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, photos.length, onClose, onNavigate])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-4 py-2">
        <button
          onClick={handleZoomOut}
          disabled={zoom <= 1}
          className="rounded-full p-1 text-white transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <span className="min-w-[3rem] text-center text-sm text-white">{Math.round(zoom * 100)}%</span>
        <button
          onClick={handleZoomIn}
          disabled={zoom >= 4}
          className="rounded-full p-1 text-white transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation arrows */}
      {photos.length > 1 && (
        <>
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={currentIndex === photos.length - 1}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        </>
      )}

      {/* Photo counter */}
      {photos.length > 1 && (
        <div className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
          {currentIndex + 1} / {photos.length}
        </div>
      )}

      {/* Main image */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          src={currentPhoto.url}
          alt={`Production photo ${currentIndex + 1}`}
          className="h-full w-full object-contain transition-transform duration-100"
          style={{
            transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
          }}
          draggable={false}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Comments Timeline
// ============================================================================

interface CommentsTimelineProps {
  comments: ApprovalComment[]
}

function CommentsTimeline({ comments }: CommentsTimelineProps) {
  if (comments.length === 0) return null

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <MessageSquare className="h-5 w-5" />
        Conversation
      </h3>
      <div className="space-y-3">
        {comments.map((comment) => {
          const isAdmin = comment.authorType === 'admin'
          return (
            <div
              key={comment.id}
              className={cn(
                'rounded-lg p-4',
                isAdmin ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isAdmin ? 'text-blue-700' : 'text-gray-700'
                  )}
                >
                  {isAdmin ? 'MasonArt Team' : 'You'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{comment.comment}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function ApprovalPage() {
  const params = Route.useParams() as { token: string }

  const [approval, setApproval] = useState<ApprovalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null)
  const [changeComment, setChangeComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showChangeForm, setShowChangeForm] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadApproval = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchApproval(params.token)
      setApproval(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approval')
    } finally {
      setLoading(false)
    }
  }, [params.token])

  useEffect(() => {
    loadApproval()
  }, [loadApproval])

  const handleRequestChanges = async () => {
    if (!changeComment.trim()) return

    setIsSubmitting(true)
    setError(null)
    try {
      await submitChangeRequest(params.token, changeComment)
      setChangeComment('')
      setShowChangeForm(false)
      setSuccessMessage('Change request submitted successfully!')
      await loadApproval()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit change request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApprove = async () => {
    if (!window.confirm('Are you sure you want to approve these photos? Your order will proceed to shipping.')) {
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await approveProduction(params.token)
      setSuccessMessage('Approved! Your order will proceed to shipping.')
      await loadApproval()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getDeadlineInfo = () => {
    if (!approval?.deadlineAt) return null

    const deadline = new Date(approval.deadlineAt)
    const now = new Date()
    const hoursRemaining = Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60))

    if (hoursRemaining <= 0) {
      return { text: 'Deadline passed', urgent: true }
    }

    if (hoursRemaining <= 24) {
      return { text: `${Math.ceil(hoursRemaining)} hours remaining`, urgent: true }
    }

    const days = Math.ceil(hoursRemaining / 24)
    return { text: `${days} days remaining`, urgent: false }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-brand-500" />
          <p className="mt-4 text-muted-foreground">Loading approval...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !approval) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <AlertCircle className="mx-auto h-16 w-16 text-red-500" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Unable to Load</h1>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <button
            onClick={loadApproval}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-600"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!approval) return null

  const statusConfig = STATUS_CONFIG[approval.status]
  const deadlineInfo = getDeadlineInfo()
  const canTakeAction = approval.status === 'pending_approval' || approval.status === 'changes_requested'
  const isApproved = approval.status === 'approved'
  const isExpired = approval.status === 'expired'
  const isPendingUpload = approval.status === 'pending_upload'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Camera className="h-6 w-6 text-brand-500" />
                <h1 className="text-xl font-bold text-foreground sm:text-2xl">
                  Production Photo Review
                </h1>
              </div>
              {approval.order && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Order #{approval.order.orderNumber}
                  {approval.orderItem?.title && ` - ${approval.orderItem.title}`}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                  statusConfig.bgColor,
                  statusConfig.color
                )}
              >
                {isApproved && <CheckCircle2 className="h-4 w-4" />}
                {isPendingUpload && <Clock className="h-4 w-4" />}
                {statusConfig.label}
              </span>
              {deadlineInfo && !isApproved && !isExpired && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm',
                    deadlineInfo.urgent
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-700'
                  )}
                >
                  <Timer className="h-4 w-4" />
                  {deadlineInfo.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Success message */}
        {successMessage && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <p>{successMessage}</p>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-auto text-sm font-medium underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-sm font-medium underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Pending Upload State */}
        {isPendingUpload && (
          <div className="rounded-xl border border-border bg-white p-8 text-center">
            <Clock className="mx-auto h-16 w-16 text-gray-400" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">
              Waiting for Production Photos
            </h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              Your custom poster is being produced. Once our team uploads the production photos,
              you&apos;ll be able to review and approve them here.
            </p>
          </div>
        )}

        {/* Photos Grid */}
        {approval.photos.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Production Photos</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {approval.photos.map((photo, index) => (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhotoIndex(index)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <img
                    src={photo.thumbnailUrl || photo.url}
                    alt={`Production photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                    <ZoomIn className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Click on a photo to view it in full size with zoom capability.
            </p>
          </div>
        )}

        {/* Comments Timeline */}
        {approval.comments.length > 0 && (
          <div className="mt-8">
            <CommentsTimeline comments={approval.comments} />
          </div>
        )}

        {/* Action Section */}
        {canTakeAction && (
          <div className="mt-8 space-y-6">
            {/* Approved state */}
            {isApproved && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
                <h2 className="mt-3 text-lg font-semibold text-green-800">
                  Photos Approved!
                </h2>
                <p className="mt-1 text-green-700">
                  Your order is now proceeding to shipping.
                </p>
              </div>
            )}

            {/* Change Request Form */}
            {showChangeForm ? (
              <div className="rounded-xl border border-border bg-white p-6">
                <h3 className="mb-4 text-lg font-semibold text-foreground">
                  Request Changes
                </h3>
                <textarea
                  value={changeComment}
                  onChange={(e) => setChangeComment(e.target.value)}
                  placeholder="Please describe the changes you'd like..."
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={handleRequestChanges}
                    disabled={isSubmitting || !changeComment.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                    Submit Request
                  </button>
                  <button
                    onClick={() => {
                      setShowChangeForm(false)
                      setChangeComment('')
                    }}
                    disabled={isSubmitting}
                    className="rounded-lg border border-border px-6 py-3 font-medium text-foreground transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Ready to approve?</h3>
                  <p className="text-sm text-muted-foreground">
                    Review the photos above and approve when you&apos;re satisfied.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => setShowChangeForm(true)}
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-6 py-3 font-medium text-orange-700 transition-colors hover:bg-orange-100"
                  >
                    <AlertTriangle className="h-5 w-5" />
                    Request Changes
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}
                    Approve & Ship
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expired State */}
        {isExpired && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-600" />
            <h2 className="mt-3 text-lg font-semibold text-red-800">
              Approval Deadline Passed
            </h2>
            <p className="mt-1 text-red-700">
              The approval deadline has passed. Your order will proceed to shipping with the current photos.
            </p>
          </div>
        )}

        {/* Already Approved State */}
        {isApproved && (
          <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h2 className="mt-3 text-lg font-semibold text-green-800">
              Photos Approved!
            </h2>
            <p className="mt-1 text-green-700">
              Your order is now proceeding to shipping. Thank you!
            </p>
            {approval.approvedAt && (
              <p className="mt-2 text-sm text-green-600">
                Approved on {new Date(approval.approvedAt).toLocaleString('en-IN', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })}
              </p>
            )}
          </div>
        )}

        {/* Order Info Footer */}
        {approval.orderItem && (
          <div className="mt-8 rounded-xl border border-border bg-white p-6">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">{approval.orderItem.title}</p>
                {approval.orderItem.sizeLabel && (
                  <p className="text-sm text-muted-foreground">Size: {approval.orderItem.sizeLabel}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Full-screen Gallery Modal */}
      {selectedPhotoIndex !== null && (
        <GalleryModal
          photos={approval.photos}
          currentIndex={selectedPhotoIndex}
          onClose={() => setSelectedPhotoIndex(null)}
          onNavigate={setSelectedPhotoIndex}
        />
      )}
    </div>
  )
}

export default ApprovalPage
