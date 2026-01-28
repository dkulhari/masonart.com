/**
 * GenerationResults Component
 *
 * Displays AI generation results including:
 * - Loading/progress state during generation
 * - Generated images grid
 * - Image selection for cart
 * - Error states
 * - Empty state for first-time users
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import {
  Loader2,
  Check,
  AlertCircle,
  ShoppingCart,
  Download,
  Share2,
  Heart,
  Sparkles,
  RefreshCw,
  ImageIcon,
  ZoomIn,
  Maximize2,
  ChevronDown,
} from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type GenerationStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type UpscaleMultiplier = 2 | 4

export interface UpscaleInfo {
  multiplier: UpscaleMultiplier
  upscaledImageUrl?: string
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
}

export interface GeneratedImage {
  id: string
  imageUrl: string
  thumbnailUrl?: string
  isSelected?: boolean
  seed?: number
  upscale?: UpscaleInfo
}

export interface Generation {
  id: string
  promptText: string
  stylePreset: string
  aspectRatio: string
  status: GenerationStatus
  images: GeneratedImage[]
  selectedImageId?: string
  selectedImageUrl?: string
  errorMessage?: string
  processingTimeMs?: number
  createdAt: string
  completedAt?: string
}

export interface UpscaleCost {
  multiplier: UpscaleMultiplier
  cost: number
  estimatedTimeSeconds: number
}

export interface GenerationResultsProps {
  /** Current generation being processed or viewed */
  currentGeneration?: Generation | null
  /** Whether generation is in progress */
  isGenerating?: boolean
  /** Progress percentage (0-100) */
  progress?: number
  /** Progress status message */
  progressMessage?: string
  /** Callback when user selects an image */
  onSelectImage?: (generationId: string, imageId: string) => void
  /** Callback when user wants to add selected image to cart */
  onAddToCart?: (generation: Generation) => void
  /** Callback when user wants to retry failed generation */
  onRetry?: () => void
  /** Callback when user wants to generate variations */
  onGenerateVariations?: (generation: Generation) => void
  /** Callback when user wants to upscale an image */
  onUpscale?: (generationId: string, imageId: string, multiplier: UpscaleMultiplier) => void
  /** Whether an upscale is in progress for an image */
  isImageUpscaling?: (generationId: string, imageId: string) => boolean
  /** Get upscale job info for an image */
  getUpscaleJob?: (generationId: string, imageId: string) => { status: string; progress: number } | undefined
  /** Available upscale costs */
  upscaleCosts?: UpscaleCost[]
  /** User's wallet balance */
  walletBalance?: number
  /** Custom className */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * GenerationResults - Displays AI generation results
 */
const DEFAULT_UPSCALE_COSTS: UpscaleCost[] = [
  { multiplier: 2, cost: 5, estimatedTimeSeconds: 15 },
  { multiplier: 4, cost: 10, estimatedTimeSeconds: 30 },
]

export function GenerationResults({
  currentGeneration,
  isGenerating = false,
  progress = 0,
  progressMessage = 'Generating...',
  onSelectImage,
  onAddToCart,
  onRetry,
  onGenerateVariations,
  onUpscale,
  isImageUpscaling,
  getUpscaleJob,
  upscaleCosts = DEFAULT_UPSCALE_COSTS,
  walletBalance,
  className,
}: GenerationResultsProps) {
  const [selectedImageForPreview, setSelectedImageForPreview] = useState<GeneratedImage | null>(null)
  const [upscaleDropdownOpen, setUpscaleDropdownOpen] = useState<string | null>(null)

  const handleImageSelect = useCallback(
    (imageId: string) => {
      if (!currentGeneration || !onSelectImage) return
      onSelectImage(currentGeneration.id, imageId)
    },
    [currentGeneration, onSelectImage]
  )

  const handleAddToCart = useCallback(() => {
    if (!currentGeneration || !onAddToCart) return
    onAddToCart(currentGeneration)
  }, [currentGeneration, onAddToCart])

  const handleGenerateVariations = useCallback(() => {
    if (!currentGeneration || !onGenerateVariations) return
    onGenerateVariations(currentGeneration)
  }, [currentGeneration, onGenerateVariations])

  // Idle/Empty State
  if (!currentGeneration && !isGenerating) {
    return (
      <div className={cn('flex flex-col', className)}>
        <EmptyState />
      </div>
    )
  }

  // Loading/Generating State
  if (isGenerating || currentGeneration?.status === 'queued' || currentGeneration?.status === 'processing') {
    const generatingStatus = currentGeneration?.status === 'queued' ? 'queued' : 'processing'
    return (
      <div className={cn('flex flex-col', className)}>
        <GeneratingState
          progress={progress}
          message={progressMessage}
          status={generatingStatus}
        />
      </div>
    )
  }

  // Error State
  if (currentGeneration?.status === 'failed') {
    return (
      <div className={cn('flex flex-col', className)}>
        <ErrorState
          message={currentGeneration.errorMessage || 'Generation failed'}
          onRetry={onRetry}
        />
      </div>
    )
  }

  // Cancelled State
  if (currentGeneration?.status === 'cancelled') {
    return (
      <div className={cn('flex flex-col', className)}>
        <CancelledState onRetry={onRetry} />
      </div>
    )
  }

  // Completed State - Show Results
  const images = currentGeneration?.images || []
  const selectedImageId = currentGeneration?.selectedImageId
  const hasSelectedImage = !!selectedImageId

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Generated Results
          </h3>
          {currentGeneration?.processingTimeMs && (
            <span className="text-xs text-muted-foreground">
              Generated in {(currentGeneration.processingTimeMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        {currentGeneration && (
          <p className="text-xs text-muted-foreground">
            {currentGeneration.promptText.length > 100
              ? `${currentGeneration.promptText.slice(0, 100)}...`
              : currentGeneration.promptText}
          </p>
        )}
      </div>

      {/* Images Grid */}
      <div className="grid grid-cols-2 gap-4">
        {images.map((image) => {
          const isSelected = image.id === selectedImageId
          const imageIsUpscaling = isImageUpscaling?.(currentGeneration?.id || '', image.id) || false
          const upscaleJob = getUpscaleJob?.(currentGeneration?.id || '', image.id)
          const hasUpscaledVersion = image.upscale?.status === 'completed' && image.upscale?.upscaledImageUrl
          const isUpscaleDropdownOpen = upscaleDropdownOpen === image.id

          return (
            <div
              key={image.id}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-lg border transition-all',
                isSelected
                  ? 'border-primary ring-2 ring-primary ring-offset-2'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              {/* Image */}
              <img
                src={image.thumbnailUrl || image.imageUrl}
                alt={`Generated variation ${image.id}`}
                className="h-full w-full object-cover"
              />

              {/* Upscaling Overlay */}
              {imageIsUpscaling && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                  <span className="mt-2 text-sm font-medium text-white">Upscaling...</span>
                  {upscaleJob?.progress && (
                    <span className="mt-1 text-xs text-white/80">{upscaleJob.progress}%</span>
                  )}
                </div>
              )}

              {/* Selection Overlay */}
              {!imageIsUpscaling && (
                <div
                  className={cn(
                    'absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40',
                    isSelected && 'bg-black/20'
                  )}
                >
                  {/* Selection Check */}
                  {isSelected && (
                    <div className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                      <Check className="h-5 w-5" />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleImageSelect(image.id)}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition-colors',
                        'hover:bg-primary hover:text-primary-foreground',
                        isSelected && 'bg-primary text-primary-foreground'
                      )}
                      title={isSelected ? 'Selected' : 'Select this image'}
                    >
                      <Check className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedImageForPreview(image)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition-colors hover:bg-white"
                      title="Preview"
                    >
                      <ZoomIn className="h-5 w-5" />
                    </button>
                    {/* Upscale Button */}
                    {onUpscale && !hasUpscaledVersion && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setUpscaleDropdownOpen(isUpscaleDropdownOpen ? null : image.id)}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition-colors hover:bg-white"
                          title="Upscale image"
                        >
                          <Maximize2 className="h-5 w-5" />
                        </button>
                        {/* Upscale Dropdown */}
                        {isUpscaleDropdownOpen && (
                          <div className="absolute right-0 top-12 z-10 min-w-[160px] rounded-lg border border-border bg-background p-2 shadow-lg">
                            <p className="mb-2 px-2 text-[10px] font-medium text-muted-foreground uppercase">
                              Upscale to
                            </p>
                            {upscaleCosts.map((option) => {
                              const canAfford = walletBalance === undefined || walletBalance >= option.cost
                              return (
                                <button
                                  key={option.multiplier}
                                  type="button"
                                  onClick={() => {
                                    if (canAfford && currentGeneration) {
                                      onUpscale(currentGeneration.id, image.id, option.multiplier)
                                      setUpscaleDropdownOpen(null)
                                    }
                                  }}
                                  disabled={!canAfford}
                                  className={cn(
                                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                                    canAfford
                                      ? 'hover:bg-accent'
                                      : 'cursor-not-allowed opacity-50'
                                  )}
                                >
                                  <span className="font-medium">{option.multiplier}x</span>
                                  <span className="text-xs text-muted-foreground">
                                    {option.cost} credits
                                  </span>
                                </button>
                              )
                            })}
                            {walletBalance !== undefined && (
                              <div className="mt-2 border-t border-border pt-2">
                                <p className="px-2 text-[10px] text-muted-foreground">
                                  Balance: {walletBalance} credits
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Upscaled Badge */}
              {hasUpscaledVersion && (
                <div className="absolute right-2 top-2 rounded bg-green-600 px-2 py-0.5 text-[10px] font-medium text-white">
                  {image.upscale?.multiplier}x Upscaled
                </div>
              )}

              {/* Seed Badge */}
              {image.seed && (
                <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white">
                  Seed: {image.seed}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Wallet Balance Indicator */}
      {walletBalance !== undefined && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2">
          <span className="text-sm text-muted-foreground">Wallet Balance</span>
          <span className={cn(
            'text-sm font-medium',
            walletBalance < 5 ? 'text-amber-600' : 'text-foreground'
          )}>
            {walletBalance} credits
            {walletBalance < 5 && (
              <span className="ml-2 text-xs text-amber-600">(Low balance)</span>
            )}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleGenerateVariations}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
            New Variations
          </button>
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!hasSelectedImage}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors',
            hasSelectedImage
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'cursor-not-allowed bg-muted text-muted-foreground'
          )}
        >
          <ShoppingCart className="h-4 w-4" />
          {hasSelectedImage ? 'Add to Cart' : 'Select an image first'}
        </button>
      </div>

      {/* Preview Modal */}
      {selectedImageForPreview && (
        <ImagePreviewModal
          image={selectedImageForPreview}
          onClose={() => setSelectedImageForPreview(null)}
          onSelect={() => {
            handleImageSelect(selectedImageForPreview.id)
            setSelectedImageForPreview(null)
          }}
          onUpscale={onUpscale && currentGeneration ? (multiplier) => {
            onUpscale(currentGeneration.id, selectedImageForPreview.id, multiplier)
          } : undefined}
          upscaleCosts={upscaleCosts}
          walletBalance={walletBalance}
          isUpscaling={isImageUpscaling?.(currentGeneration?.id || '', selectedImageForPreview.id)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Empty State Component
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-8 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <ImageIcon className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        No generations yet
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Enter a prompt, choose your style and aspect ratio, then click Generate to
        create your custom poster.
      </p>
    </div>
  )
}

// ============================================================================
// Generating State Component
// ============================================================================

interface GeneratingStateProps {
  progress: number
  message: string
  status: 'queued' | 'processing'
}

function GeneratingState({ progress, message, status }: GeneratingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-8 py-16 text-center">
      <div className="mb-6 relative">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-medium text-primary">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <h3 className="mb-2 text-lg font-semibold text-foreground">
        {status === 'queued' ? 'In Queue' : 'Generating Your Poster'}
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>

      {/* Progress Bar */}
      <div className="w-full max-w-xs">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        This usually takes 15-30 seconds
      </p>
    </div>
  )
}

// ============================================================================
// Error State Component
// ============================================================================

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 px-8 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Generation Failed
      </h3>
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Cancelled State Component
// ============================================================================

interface CancelledStateProps {
  onRetry?: () => void
}

function CancelledState({ onRetry }: CancelledStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-8 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Generation Cancelled
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        The generation was cancelled before completion.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          Generate Again
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Image Preview Modal Component
// ============================================================================

interface ImagePreviewModalProps {
  image: GeneratedImage
  onClose: () => void
  onSelect: () => void
  onUpscale?: (multiplier: UpscaleMultiplier) => void
  upscaleCosts?: UpscaleCost[]
  walletBalance?: number
  isUpscaling?: boolean
}

function ImagePreviewModal({
  image,
  onClose,
  onSelect,
  onUpscale,
  upscaleCosts = DEFAULT_UPSCALE_COSTS,
  walletBalance,
  isUpscaling,
}: ImagePreviewModalProps) {
  const [showUpscaleOptions, setShowUpscaleOptions] = useState(false)
  const hasUpscaledVersion = image.upscale?.status === 'completed' && image.upscale?.upscaledImageUrl
  const displayUrl = hasUpscaledVersion ? image.upscale!.upscaledImageUrl! : image.imageUrl

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/80"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-4 z-50 flex items-center justify-center sm:inset-8"
        role="dialog"
        aria-modal="true"
      >
        <div className="relative max-h-full max-w-4xl overflow-hidden rounded-lg bg-background shadow-xl">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
            aria-label="Close preview"
          >
            <span className="text-2xl">&times;</span>
          </button>

          {/* Upscaled Badge */}
          {hasUpscaledVersion && (
            <div className="absolute left-4 top-4 z-10 rounded bg-green-600 px-3 py-1 text-sm font-medium text-white">
              {image.upscale?.multiplier}x Upscaled
            </div>
          )}

          {/* Upscaling Overlay */}
          {isUpscaling && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60">
              <Loader2 className="h-12 w-12 animate-spin text-white" />
              <span className="mt-3 text-lg font-medium text-white">Upscaling...</span>
            </div>
          )}

          {/* Image */}
          <img
            src={displayUrl}
            alt="Full size preview"
            className="max-h-[70vh] w-full object-contain"
          />

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-border p-4">
            <div className="flex gap-2">
              <a
                href={displayUrl}
                download={hasUpscaledVersion ? 'upscaled-image.png' : 'generated-image.png'}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <Download className="h-4 w-4" />
                {hasUpscaledVersion ? 'Download High-Res' : 'Download'}
              </a>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <Heart className="h-4 w-4" />
                Like
              </button>

              {/* Upscale Button */}
              {onUpscale && !hasUpscaledVersion && !isUpscaling && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowUpscaleOptions(!showUpscaleOptions)}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <Maximize2 className="h-4 w-4" />
                    Upscale
                    <ChevronDown className="h-3 w-3" />
                  </button>

                  {/* Upscale Dropdown */}
                  {showUpscaleOptions && (
                    <div className="absolute bottom-full left-0 mb-2 min-w-[180px] rounded-lg border border-border bg-background p-2 shadow-lg">
                      <p className="mb-2 px-2 text-[10px] font-medium text-muted-foreground uppercase">
                        Upscale to
                      </p>
                      {upscaleCosts.map((option) => {
                        const canAfford = walletBalance === undefined || walletBalance >= option.cost
                        return (
                          <button
                            key={option.multiplier}
                            type="button"
                            onClick={() => {
                              if (canAfford) {
                                onUpscale(option.multiplier)
                                setShowUpscaleOptions(false)
                              }
                            }}
                            disabled={!canAfford}
                            className={cn(
                              'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm',
                              canAfford
                                ? 'hover:bg-accent'
                                : 'cursor-not-allowed opacity-50'
                            )}
                          >
                            <div>
                              <span className="font-medium">{option.multiplier}x</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                (~{option.estimatedTimeSeconds}s)
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {option.cost} credits
                            </span>
                          </button>
                        )
                      })}
                      {walletBalance !== undefined && (
                        <div className="mt-2 border-t border-border pt-2">
                          <p className="px-2 text-xs text-muted-foreground">
                            Balance: {walletBalance} credits
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onSelect}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Check className="h-4 w-4" />
              Select This Image
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default GenerationResults
