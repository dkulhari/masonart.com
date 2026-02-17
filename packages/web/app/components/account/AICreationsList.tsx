/**
 * AICreationsList Component
 *
 * Displays a list of user's AI-generated artwork with status indicators,
 * image previews, and navigation to view/manage each creation.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import {
  Sparkles,
  Clock,
  CheckCircle,
  Loader2,
  XCircle,
  ChevronRight,
  AlertCircle,
  Image,
  Eye,
  Heart,
  ShoppingCart,
  Trash2,
  ArrowRight,
  ImagePlus,
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
} from 'lucide-react'
import { cn, formatRelativeTime } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface AIGeneratedImage {
  id: string
  imageUrl: string
  thumbnailUrl?: string
  isSelected?: boolean
}

export interface AICreation {
  id: string
  promptText: string
  stylePreset: string
  aspectRatio: string
  status: AICreationStatus
  moderationStatus?: AIModerationStatus
  rejectionReason?: string | null
  rejectionCategory?: string | null
  images?: AIGeneratedImage[]
  variationCount?: number
  selectedImageId?: string | null
  selectedImageUrl?: string | null
  visibility?: 'private' | 'public' | 'unlisted'
  isPurchased?: boolean
  likesCount?: number
  viewsCount?: number
  processingTimeMs?: number | null
  errorMessage?: string | null
  createdAt: string
  completedAt?: string | null
}

export type AICreationStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AIModerationStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'flagged'

export interface AICreationsListProps {
  /** List of AI creations to display */
  creations: AICreation[]
  /** Whether the list is loading */
  isLoading?: boolean
  /** Error message if any */
  error?: string | null
  /** Show compact version (less details) */
  compact?: boolean
  /** Maximum number of creations to show (for dashboard preview) */
  limit?: number
  /** Callback when delete is clicked */
  onDelete?: (id: string) => void
  /** Callback when add to cart is clicked */
  onAddToCart?: (creation: AICreation) => void
  /** Optional className */
  className?: string
}

// ============================================================================
// Status Configuration
// ============================================================================

interface StatusConfig {
  label: string
  icon: typeof Sparkles
  color: string
  bgColor: string
}

const STATUS_CONFIG: Record<AICreationStatus, StatusConfig> = {
  queued: {
    label: 'In Queue',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  processing: {
    label: 'Generating',
    icon: Loader2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
}

const MODERATION_STATUS_CONFIG: Record<AIModerationStatus, StatusConfig> = {
  pending_review: {
    label: 'Pending Review',
    icon: Shield,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  approved: {
    label: 'Approved',
    icon: ShieldCheck,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  rejected: {
    label: 'Rejected',
    icon: ShieldX,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  flagged: {
    label: 'Under Review',
    icon: ShieldAlert,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
}

// ============================================================================
// Style Preset Formatting
// ============================================================================

const formatStylePreset = (preset: string): string => {
  return preset
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const formatAspectRatio = (ratio: string): string => {
  const ratioMap: Record<string, string> = {
    square: '1:1',
    portrait: '2:3',
    landscape: '3:2',
    panoramic: '16:9',
  }
  return ratioMap[ratio] || ratio
}

// ============================================================================
// AICreationsList Component
// ============================================================================

/**
 * AICreationsList - Displays a list of user's AI-generated artwork
 *
 * @example
 * <AICreationsList
 *   creations={creations}
 *   isLoading={isLoading}
 *   error={error}
 * />
 */
export function AICreationsList({
  creations,
  isLoading = false,
  error = null,
  compact = false,
  limit,
  onDelete,
  onAddToCart,
  className,
}: AICreationsListProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2', className)}>
        {Array.from({ length: limit || 4 }).map((_, i) => (
          <AICreationCardSkeleton key={i} compact={compact} />
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-200 bg-red-50 p-6 text-center', className)}>
        <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-semibold text-red-900">Unable to load creations</h3>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </div>
    )
  }

  // Empty state
  if (creations.length === 0) {
    return <EmptyCreationsState className={className} />
  }

  // Apply limit if specified
  const displayCreations = limit ? creations.slice(0, limit) : creations

  return (
    <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2', className)}>
      {displayCreations.map((creation) => (
        <AICreationCard
          key={creation.id}
          creation={creation}
          compact={compact}
          onDelete={onDelete}
          onAddToCart={onAddToCart}
        />
      ))}
    </div>
  )
}

// ============================================================================
// AICreationCard Component
// ============================================================================

interface AICreationCardProps {
  creation: AICreation
  compact?: boolean
  onDelete?: (id: string) => void
  onAddToCart?: (creation: AICreation) => void
}

function AICreationCard({
  creation,
  compact = false,
  onDelete,
  onAddToCart,
}: AICreationCardProps) {
  const statusConfig = STATUS_CONFIG[creation.status] || STATUS_CONFIG.completed
  const StatusIcon = statusConfig.icon
  const isAnimated = creation.status === 'processing'

  // Moderation status (only relevant for completed creations)
  const moderationStatus = creation.moderationStatus || 'pending_review'
  const moderationConfig = MODERATION_STATUS_CONFIG[moderationStatus]
  const ModerationIcon = moderationConfig.icon
  const isApproved = moderationStatus === 'approved'
  const isRejected = moderationStatus === 'rejected'
  const showModerationBadge = creation.status === 'completed' && moderationStatus !== 'approved'

  // Get display image - selected image or first from array
  const firstImage = creation.images?.[0]
  const displayImage = creation.selectedImageUrl ||
    (firstImage ? firstImage.thumbnailUrl || firstImage.imageUrl : null)

  const imageCount = creation.images?.length || creation.variationCount || 0

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-brand-300 hover:shadow-md',
        compact ? 'flex gap-3 p-3' : 'flex flex-col'
      )}
    >
      {/* Image Preview */}
      <a
        href={`/account/ai-creations/${creation.id}`}
        className={cn(
          'relative shrink-0 overflow-hidden bg-muted',
          compact
            ? 'h-20 w-20 rounded-lg'
            : 'aspect-square w-full'
        )}
      >
        {displayImage ? (
          <img
            src={displayImage}
            alt={creation.promptText}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {creation.status === 'queued' || creation.status === 'processing' ? (
              <Loader2 className={cn('h-8 w-8 text-brand-500', isAnimated && 'animate-spin')} />
            ) : (
              <Image className="h-8 w-8 text-muted-foreground/50" />
            )}
          </div>
        )}

        {/* Image count badge */}
        {!compact && imageCount > 1 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white">
            <Image className="h-3 w-3" />
            {imageCount}
          </div>
        )}

        {/* Status overlay for non-completed */}
        {!compact && creation.status !== 'completed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
                statusConfig.bgColor,
                statusConfig.color
              )}
            >
              <StatusIcon className={cn('h-4 w-4', isAnimated && 'animate-spin')} />
              {statusConfig.label}
            </div>
          </div>
        )}

        {/* Moderation status badge for completed but non-approved */}
        {!compact && showModerationBadge && (
          <div className="absolute left-2 top-2">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm',
                moderationConfig.bgColor,
                moderationConfig.color
              )}
            >
              <ModerationIcon className="h-3.5 w-3.5" />
              {moderationConfig.label}
            </div>
          </div>
        )}
      </a>

      {/* Content */}
      <div className={cn('flex flex-1 flex-col', compact ? '' : 'p-4')}>
        {/* Status Badge (compact only) */}
        {compact && (
          <div className="mb-1 flex flex-wrap gap-1">
            <div
              className={cn(
                'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                statusConfig.bgColor,
                statusConfig.color
              )}
            >
              <StatusIcon className={cn('h-3 w-3', isAnimated && 'animate-spin')} />
              {statusConfig.label}
            </div>
            {/* Moderation badge for completed items */}
            {creation.status === 'completed' && moderationStatus !== 'approved' && (
              <div
                className={cn(
                  'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  moderationConfig.bgColor,
                  moderationConfig.color
                )}
              >
                <ModerationIcon className="h-3 w-3" />
                {moderationConfig.label}
              </div>
            )}
          </div>
        )}

        {/* Prompt Text */}
        <a
          href={`/account/ai-creations/${creation.id}`}
          className={cn(
            'font-medium text-foreground hover:text-brand-600',
            compact ? 'text-sm line-clamp-2' : 'line-clamp-2'
          )}
        >
          {creation.promptText}
        </a>

        {/* Metadata */}
        <div className={cn('mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground', compact && 'mt-auto')}>
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
            {formatStylePreset(creation.stylePreset)}
          </span>
          {!compact && (
            <span className="rounded bg-muted px-1.5 py-0.5">
              {formatAspectRatio(creation.aspectRatio)}
            </span>
          )}
        </div>

        {/* Date & Stats (non-compact) */}
        {!compact && (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(creation.createdAt)}
            </span>
            <div className="flex items-center gap-3">
              {creation.visibility === 'public' && (
                <>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" />
                    {creation.viewsCount || 0}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="h-3.5 w-3.5" />
                    {creation.likesCount || 0}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Rejection reason (if rejected) */}
        {!compact && isRejected && creation.rejectionReason && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-xs font-medium text-red-800">Content Not Approved</p>
                <p className="mt-0.5 text-xs text-red-700">{creation.rejectionReason}</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions (non-compact) */}
        {!compact && creation.status === 'completed' && (
          <div className="mt-3 flex items-center gap-2">
            {/* Add to Cart - disabled if not approved */}
            {onAddToCart && !creation.isPurchased && !isRejected && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  if (isApproved) {
                    onAddToCart(creation)
                  }
                }}
                disabled={!isApproved}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isApproved
                    ? 'bg-brand-500 text-white hover:bg-brand-600'
                    : 'cursor-not-allowed bg-gray-100 text-gray-400'
                )}
                title={!isApproved ? 'Awaiting moderation approval' : undefined}
              >
                <ShoppingCart className="h-4 w-4" />
                {isApproved ? 'Add to Cart' : 'Pending Approval'}
              </button>
            )}
            {creation.isPurchased && (
              <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-700">
                <CheckCircle className="h-4 w-4" />
                Purchased
              </span>
            )}
            {/* Rejected items show a different message */}
            {isRejected && !creation.isPurchased && (
              <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700">
                <ShieldX className="h-4 w-4" />
                Not Available
              </span>
            )}
            {onDelete && !creation.isPurchased && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  onDelete(creation.id)
                }}
                className="flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                title="Delete creation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* View Details Link (compact) */}
        {compact && (
          <a
            href={`/account/ai-creations/${creation.id}`}
            className="mt-1 flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            View Details
            <ChevronRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// AICreationCardSkeleton Component
// ============================================================================

interface AICreationCardSkeletonProps {
  compact?: boolean
}

export function AICreationCardSkeleton({ compact = false }: AICreationCardSkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse overflow-hidden rounded-xl border border-border bg-card',
        compact ? 'flex gap-3 p-3' : 'flex flex-col'
      )}
    >
      {/* Image placeholder */}
      <div
        className={cn(
          'shrink-0 bg-muted',
          compact ? 'h-20 w-20 rounded-lg' : 'aspect-square w-full'
        )}
      />

      {/* Content placeholder */}
      <div className={cn('flex flex-1 flex-col', compact ? '' : 'p-4')}>
        {compact && <div className="mb-1 h-4 w-16 rounded bg-muted" />}
        <div className="h-5 w-3/4 rounded bg-muted" />
        <div className="mt-1 h-4 w-1/2 rounded bg-muted" />
        <div className="mt-2 flex items-center gap-2">
          <div className="h-5 w-20 rounded bg-muted" />
          {!compact && <div className="h-5 w-12 rounded bg-muted" />}
        </div>
        {!compact && (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div className="h-3 w-8 rounded bg-muted" />
              <div className="h-3 w-8 rounded bg-muted" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// EmptyCreationsState Component
// ============================================================================

interface EmptyCreationsStateProps {
  className?: string
}

function EmptyCreationsState({ className }: EmptyCreationsStateProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-8 text-center', className)}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-pink-100">
        <Sparkles className="h-8 w-8 text-purple-600" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">No AI creations yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Create unique posters with our AI generator and they&apos;ll appear here.
      </p>
      <a
        href="/create"
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:from-purple-600 hover:to-pink-600"
      >
        <ImagePlus className="h-4 w-4" />
        Create Your First Poster
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  )
}

// ============================================================================
// Exports
// ============================================================================

export default AICreationsList
