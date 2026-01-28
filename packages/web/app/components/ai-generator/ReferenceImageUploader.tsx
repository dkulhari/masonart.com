/**
 * ReferenceImageUploader Component
 *
 * Reference image upload for AI generation (img2img).
 * Features:
 * - Drag and drop file upload
 * - Weight slider for style influence
 * - File validation and preview
 * - Cost indicator for reference image usage
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback, useRef } from 'react'
import {
  Image as ImageIcon,
  Upload,
  X,
  Info,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface ReferenceImageData {
  url: string
  file?: File
  weight: number
  expiresAt?: Date
}

export interface ReferenceImageUploaderProps {
  /** Current reference image data */
  referenceImage: ReferenceImageData | null
  /** Callback when reference image changes */
  onReferenceImageChange: (data: ReferenceImageData | null) => void
  /** Upload handler - returns URL after upload */
  onUpload?: (file: File, weight: number) => Promise<{ url: string; expiresAt: Date }>
  /** Whether upload is in progress */
  isUploading?: boolean
  /** Upload error message */
  error?: string
  /** Whether the component is disabled */
  disabled?: boolean
  /** Custom className */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_MB = 5
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

const WEIGHT_PRESETS = [
  { value: 0.2, label: 'Subtle', description: 'Light inspiration' },
  { value: 0.5, label: 'Balanced', description: 'Moderate influence' },
  { value: 0.8, label: 'Strong', description: 'Close to reference' },
]

const COST_MULTIPLIER = 1.2 // 20% more for img2img

// ============================================================================
// Component
// ============================================================================

/**
 * ReferenceImageUploader - Reference image upload for AI generation
 */
export function ReferenceImageUploader({
  referenceImage,
  onReferenceImageChange,
  onUpload,
  isUploading = false,
  error,
  disabled = false,
  className,
}: ReferenceImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displayError = error || localError

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Invalid file type. Please use JPEG, PNG, or WebP.'
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File too large. Maximum size is ${MAX_SIZE_MB}MB.`
    }
    return null
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setLocalError(null)

      // Validate file
      const validationError = validateFile(file)
      if (validationError) {
        setLocalError(validationError)
        return
      }

      // Create preview
      const objectUrl = URL.createObjectURL(file)
      setPreviewUrl(objectUrl)

      // Default weight
      const weight = 0.5

      if (onUpload) {
        try {
          const result = await onUpload(file, weight)
          onReferenceImageChange({
            url: result.url,
            file,
            weight,
            expiresAt: result.expiresAt,
          })
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : 'Upload failed')
          URL.revokeObjectURL(objectUrl)
          setPreviewUrl(null)
        }
      } else {
        // No upload handler, just use local preview
        onReferenceImageChange({
          url: objectUrl,
          file,
          weight,
        })
      }
    },
    [onUpload, onReferenceImageChange, validateFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)

      if (disabled || isUploading) return

      const file = e.dataTransfer.files[0]
      if (file) {
        handleFile(file)
      }
    },
    [disabled, isUploading, handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFile(file)
      }
      // Reset input
      e.target.value = ''
    },
    [handleFile]
  )

  const handleRemove = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setLocalError(null)
    onReferenceImageChange(null)
  }, [previewUrl, onReferenceImageChange])

  const handleWeightChange = useCallback(
    (weight: number) => {
      if (referenceImage) {
        onReferenceImageChange({
          ...referenceImage,
          weight,
        })
      }
    },
    [referenceImage, onReferenceImageChange]
  )

  const currentPreviewUrl = referenceImage?.url || previewUrl

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Reference Image
          </span>
          <span className="text-xs text-muted-foreground">(Optional)</span>
        </div>
        {referenceImage && (
          <span className="text-xs text-amber-600">
            +{Math.round((COST_MULTIPLIER - 1) * 100)}% cost
          </span>
        )}
      </div>

      {/* Upload Area or Preview */}
      {!currentPreviewUrl ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors',
            'cursor-pointer hover:border-primary hover:bg-primary/5',
            isDragging && 'border-primary bg-primary/10',
            disabled && 'cursor-not-allowed opacity-50',
            displayError && 'border-destructive',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            onChange={handleFileInputChange}
            disabled={disabled || isUploading}
            className="hidden"
          />

          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <span className="text-sm font-medium text-foreground">
                  Drop image here or click to upload
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPEG, PNG, WebP up to {MAX_SIZE_MB}MB
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Image Preview */}
          <div className="relative">
            <img
              src={currentPreviewUrl}
              alt="Reference"
              className="max-h-48 w-full rounded-lg border border-border object-contain"
            />
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || isUploading}
              className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-foreground hover:bg-background disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </div>

          {/* Weight Slider */}
          {referenceImage && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  Style Influence
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(referenceImage.weight * 100)}%
                </span>
              </div>

              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={referenceImage.weight}
                onChange={(e) => handleWeightChange(parseFloat(e.target.value))}
                disabled={disabled}
                className="w-full accent-primary disabled:opacity-50"
              />

              {/* Weight Presets */}
              <div className="flex justify-between gap-2">
                {WEIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleWeightChange(preset.value)}
                    disabled={disabled}
                    className={cn(
                      'flex flex-col items-center rounded-md border px-3 py-1.5 text-center transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      Math.abs(referenceImage.weight - preset.value) < 0.1
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-muted-foreground'
                    )}
                  >
                    <span className="text-[10px] font-medium">{preset.label}</span>
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground">
                Low = loose inspiration · High = closer to reference
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {displayError && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {displayError}
        </div>
      )}

      {/* Info Note */}
      {!referenceImage && !displayError && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            Upload an image to guide the AI. The generated result will be influenced by the reference.
          </span>
        </div>
      )}
    </div>
  )
}

export default ReferenceImageUploader
