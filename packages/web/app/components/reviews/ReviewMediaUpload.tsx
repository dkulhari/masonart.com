/**
 * ReviewMediaUpload Component
 *
 * Staging area for the photos and videos attached to a review. Controlled: the
 * parent owns the array, this owns the picker, the previews and the gate.
 *
 * The limits below mirror REVIEW_MEDIA_LIMITS in packages/api/src/lib/storage.ts
 * and MAX_MEDIA_PER_REVIEW in packages/api/src/routes/review-media.ts. Checking
 * here is a courtesy, not a security boundary — it saves a presign round trip
 * and a 200MB upload that was always going to be refused. The server stays the
 * real gate, which matters most for duration: a browser reports whatever the
 * container header claims.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, Loader2, RotateCw, X } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Limits — keep in step with the server
// ============================================================================

/** A review may carry at most this many photos and videos, combined. */
export const MAX_REVIEW_MEDIA = 5

export const REVIEW_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const REVIEW_VIDEO_MAX_BYTES = 200 * 1024 * 1024
export const REVIEW_VIDEO_MAX_SECONDS = 60

export const REVIEW_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const REVIEW_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/** The `accept` attribute — a hint to the file dialog, never a check. */
export const REVIEW_MEDIA_ACCEPT = [
  ...REVIEW_IMAGE_TYPES,
  ...REVIEW_VIDEO_TYPES,
].join(',')

// ============================================================================
// Types
// ============================================================================

export type ReviewMediaKind = 'image' | 'video'

/**
 * `ready` — staged, not yet sent (the review does not exist yet)
 * `uploading` / `uploaded` / `failed` — after the review has been created
 */
export type ReviewMediaStatus = 'ready' | 'uploading' | 'uploaded' | 'failed'

export interface ReviewMediaItem {
  id: string
  file: File
  kind: ReviewMediaKind
  /** Object URL for the local preview. Revoked when the item goes away. */
  previewUrl: string
  status: ReviewMediaStatus
  progress: number
  error?: string
}

export interface ReviewMediaUploadProps {
  items: ReviewMediaItem[]
  onChange: (items: ReviewMediaItem[]) => void
  /** Retry a single failed upload. Absent means no retry affordance. */
  onRetry?: (item: ReviewMediaItem) => void
  maxFiles?: number
  disabled?: boolean
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

function kindOf(type: string): ReviewMediaKind | null {
  if (REVIEW_IMAGE_TYPES.includes(type)) return 'image'
  if (REVIEW_VIDEO_TYPES.includes(type)) return 'video'
  return null
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`
}

/**
 * Decode just enough of a video to read its length.
 *
 * There is no way to know a duration without handing the bytes to a decoder,
 * so: point a detached <video> at an object URL, wait for metadata, read
 * `duration`. Anything that fails — an unsupported codec, a browser that never
 * fires the event — resolves `null`, meaning "unknown". Unknown is allowed
 * through and left to the server rather than blocking a legitimate upload on a
 * probe that a browser quirk broke.
 */
function probeVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let settled = false

    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.onloadedmetadata = null
      video.onerror = null
      // Detach the source so the element does not hold the blob alive.
      video.removeAttribute('src')
      resolve(value)
    }

    // A probe that hangs must not hang the picker with it.
    const timer = setTimeout(() => finish(null), 10_000)

    video.onloadedmetadata = () => {
      const duration = video.duration
      finish(Number.isFinite(duration) ? duration : null)
    }
    video.onerror = () => finish(null)

    video.preload = 'metadata'
    video.src = url
  })
}

// ============================================================================
// Component
// ============================================================================

/**
 * ReviewMediaUpload - pick, preview and stage review media
 *
 * @example
 * <ReviewMediaUpload items={items} onChange={setItems} onRetry={retryUpload} />
 */
export function ReviewMediaUpload({
  items,
  onChange,
  onRetry,
  maxFiles = MAX_REVIEW_MEDIA,
  disabled = false,
  className,
}: ReviewMediaUploadProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [isChecking, setIsChecking] = useState(false)

  /**
   * Every object URL this component minted, so unmount can revoke the lot.
   * A ref, not state: the cleanup effect must run once, on unmount, and must
   * still see URLs created after the last render.
   */
  const createdUrls = useRef<Set<string>>(new Set())

  const createPreviewUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    createdUrls.current.add(url)
    return url
  }, [])

  const releasePreviewUrl = useCallback((url: string) => {
    if (!createdUrls.current.has(url)) return
    createdUrls.current.delete(url)
    URL.revokeObjectURL(url)
  }, [])

  // Leaking blob URLs pins the file in memory for the life of the document —
  // five 200MB videos is not a leak anyone gets to ignore.
  useEffect(() => {
    const urls = createdUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const handleFiles = useCallback(
    async (selected: File[]) => {
      if (selected.length === 0) return

      const nextErrors: string[] = []
      const accepted: ReviewMediaItem[] = []
      let slots = maxFiles - items.length

      setIsChecking(true)
      try {
        for (const file of selected) {
          if (slots <= 0) {
            nextErrors.push(
              `You can attach up to ${maxFiles} photos or videos per review.`
            )
            break
          }

          const kind = kindOf(file.type)
          if (!kind) {
            nextErrors.push(
              `${file.name} is not a supported photo or video. Use JPG, PNG, WebP, MP4, MOV or WebM.`
            )
            continue
          }

          if (kind === 'image') {
            if (file.size > REVIEW_IMAGE_MAX_BYTES) {
              nextErrors.push(
                `${file.name} is too large. Photos must be ${formatMb(
                  REVIEW_IMAGE_MAX_BYTES
                )} or smaller.`
              )
              continue
            }

            accepted.push({
              id: `${Date.now()}-${file.name}-${slots}`,
              file,
              kind,
              previewUrl: createPreviewUrl(file),
              status: 'ready',
              progress: 0,
            })
            slots -= 1
            continue
          }

          if (file.size > REVIEW_VIDEO_MAX_BYTES) {
            nextErrors.push(
              `${file.name} is too large. Videos must be ${formatMb(
                REVIEW_VIDEO_MAX_BYTES
              )} or smaller.`
            )
            continue
          }

          // Size passed, so the bytes are worth decoding for a length.
          const url = createPreviewUrl(file)
          const duration = await probeVideoDuration(url)

          if (duration !== null && duration > REVIEW_VIDEO_MAX_SECONDS) {
            releasePreviewUrl(url)
            nextErrors.push(
              `${file.name} is too long. Videos must be ${REVIEW_VIDEO_MAX_SECONDS} seconds or shorter.`
            )
            continue
          }

          accepted.push({
            id: `${Date.now()}-${file.name}-${slots}`,
            file,
            kind,
            previewUrl: url,
            status: 'ready',
            progress: 0,
          })
          slots -= 1
        }
      } finally {
        setIsChecking(false)
      }

      setErrors(nextErrors)
      if (accepted.length > 0) {
        onChange([...items, ...accepted])
      }
    },
    [createPreviewUrl, items, maxFiles, onChange, releasePreviewUrl]
  )

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    // Reset the input so re-picking the same file still fires a change event.
    event.target.value = ''
    void handleFiles(selected)
  }

  const handleRemove = (item: ReviewMediaItem) => {
    releasePreviewUrl(item.previewUrl)
    onChange(items.filter((existing) => existing.id !== item.id))
  }

  const remaining = maxFiles - items.length
  const atCapacity = remaining <= 0

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          Photos &amp; videos{' '}
          <span className="text-muted-foreground">(Optional)</span>
        </label>
        <span className="text-xs text-muted-foreground">
          {items.length}/{maxFiles}
        </span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        data-testid="review-media-input"
        type="file"
        multiple
        accept={REVIEW_MEDIA_ACCEPT}
        onChange={handleInputChange}
        disabled={disabled || atCapacity}
        className="sr-only"
      />

      {/* Thumbnail grid */}
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {items.map((item) => (
            <li
              key={item.id}
              className="relative overflow-hidden rounded-lg border border-border bg-muted"
            >
              <div className="aspect-square w-full">
                {item.kind === 'image' ? (
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={item.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    aria-label={item.file.name}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => handleRemove(item)}
                disabled={disabled || item.status === 'uploading'}
                aria-label={`Remove ${item.file.name}`}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>

              {/* A video is not live the moment the review is submitted. */}
              {item.kind === 'video' && (
                <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1 py-0.5 text-[10px] leading-tight text-white">
                  Processing after you submit
                </span>
              )}

              {item.status === 'uploading' && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1">
                  <div
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${item.file.name}`}
                    className="h-1 w-full overflow-hidden rounded bg-white/30"
                  >
                    <div
                      className="h-full bg-white transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {item.status === 'failed' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 p-1 text-center">
                  <p className="text-[10px] leading-tight text-white">
                    {item.error || 'Upload failed'}
                  </p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(item)}
                      aria-label={`Retry ${item.file.name}`}
                      className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-foreground"
                    >
                      <RotateCw className="h-2.5 w-2.5" />
                      Retry
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Picker */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || atCapacity || isChecking}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border border-dashed border-input px-4 py-2.5 text-sm font-medium text-foreground transition-colors',
          disabled || atCapacity || isChecking
            ? 'cursor-not-allowed text-muted-foreground'
            : 'hover:border-muted-foreground hover:bg-muted'
        )}
      >
        {isChecking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
        {atCapacity ? `Limit of ${maxFiles} reached` : 'Add photos or videos'}
      </button>

      <p className="text-xs text-muted-foreground">
        Up to {maxFiles} files. Photos {formatMb(REVIEW_IMAGE_MAX_BYTES)} max,
        videos {formatMb(REVIEW_VIDEO_MAX_BYTES)} and{' '}
        {REVIEW_VIDEO_MAX_SECONDS} seconds max.
      </p>

      {errors.length > 0 && (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2"
        >
          {errors.map((message) => (
            <p key={message} className="text-xs text-red-700">
              {message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Default Export
// ============================================================================

export default ReviewMediaUpload
