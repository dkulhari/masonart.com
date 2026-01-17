/**
 * StyleSelector Component
 *
 * Style preset and aspect ratio selection for AI poster generation.
 * Features:
 * - Visual style preset cards with descriptions
 * - Aspect ratio selection with visual indicators
 * - Category filtering for styles
 * - Premium style indicators
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import {
  Palette,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Maximize2,
  Check,
  Crown,
} from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type StylePreset =
  | 'wabi-sabi'
  | 'abstract-expression'
  | 'botanical'
  | 'geometric-modern'
  | 'vintage-poster'
  | 'pop-art'
  | 'watercolor'
  | 'photography'
  | 'line-art'
  | 'typography'

export type AspectRatio = 'square' | 'portrait' | 'landscape' | 'panoramic'

export type StyleCategory = 'all' | 'artistic' | 'photographic' | 'illustrative' | 'decorative'

export interface StylePresetConfig {
  id: StylePreset
  name: string
  description: string
  category: StyleCategory
  isPremium: boolean
  thumbnailColor: string // Placeholder color for style preview
}

export interface AspectRatioConfig {
  id: AspectRatio
  name: string
  ratio: string
  description: string
  icon: React.ReactNode
}

export interface StyleSelectorProps {
  /** Selected style preset */
  selectedStyle: StylePreset
  /** Callback when style changes */
  onStyleChange: (style: StylePreset) => void
  /** Selected aspect ratio */
  selectedAspectRatio: AspectRatio
  /** Callback when aspect ratio changes */
  onAspectRatioChange: (ratio: AspectRatio) => void
  /** Whether user has access to premium styles */
  hasPremiumAccess?: boolean
  /** Whether the selector is disabled */
  disabled?: boolean
  /** Custom className */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

const STYLE_PRESETS: StylePresetConfig[] = [
  {
    id: 'wabi-sabi',
    name: 'Wabi-Sabi',
    description: 'Minimalist, organic aesthetics embracing imperfection',
    category: 'artistic',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-stone-300 to-stone-500',
  },
  {
    id: 'abstract-expression',
    name: 'Abstract Expression',
    description: 'Bold brushstrokes and emotional intensity',
    category: 'artistic',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-red-400 via-yellow-400 to-blue-500',
  },
  {
    id: 'botanical',
    name: 'Botanical',
    description: 'Elegant floral and plant illustrations',
    category: 'illustrative',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-green-300 to-emerald-600',
  },
  {
    id: 'geometric-modern',
    name: 'Geometric Modern',
    description: 'Clean lines and geometric shapes',
    category: 'decorative',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-blue-400 to-purple-500',
  },
  {
    id: 'vintage-poster',
    name: 'Vintage Poster',
    description: 'Nostalgic retro designs with classic aesthetics',
    category: 'decorative',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-amber-300 to-orange-600',
  },
  {
    id: 'pop-art',
    name: 'Pop Art',
    description: 'Bold colors and graphic imagery',
    category: 'artistic',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-pink-400 via-yellow-400 to-cyan-400',
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    description: 'Soft, flowing artistic washes',
    category: 'artistic',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-sky-200 via-pink-200 to-violet-200',
  },
  {
    id: 'photography',
    name: 'Photography',
    description: 'Photorealistic imagery with professional quality',
    category: 'photographic',
    isPremium: true,
    thumbnailColor: 'bg-gradient-to-br from-gray-700 to-gray-900',
  },
  {
    id: 'line-art',
    name: 'Line Art',
    description: 'Minimalist single-stroke aesthetics',
    category: 'illustrative',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-white to-gray-200',
  },
  {
    id: 'typography',
    name: 'Typography',
    description: 'Text-focused artistic designs',
    category: 'decorative',
    isPremium: false,
    thumbnailColor: 'bg-gradient-to-br from-slate-800 to-slate-950',
  },
]

const ASPECT_RATIOS: AspectRatioConfig[] = [
  {
    id: 'square',
    name: 'Square',
    ratio: '1:1',
    description: 'Perfect for Instagram',
    icon: <Square className="h-5 w-5" />,
  },
  {
    id: 'portrait',
    name: 'Portrait',
    ratio: '2:3',
    description: 'Standard poster format',
    icon: <RectangleVertical className="h-5 w-5" />,
  },
  {
    id: 'landscape',
    name: 'Landscape',
    ratio: '3:2',
    description: 'Wide format',
    icon: <RectangleHorizontal className="h-5 w-5" />,
  },
  {
    id: 'panoramic',
    name: 'Panoramic',
    ratio: '16:9',
    description: 'Ultra-wide format',
    icon: <Maximize2 className="h-5 w-5" />,
  },
]

const CATEGORIES: { id: StyleCategory; label: string }[] = [
  { id: 'all', label: 'All Styles' },
  { id: 'artistic', label: 'Artistic' },
  { id: 'photographic', label: 'Photographic' },
  { id: 'illustrative', label: 'Illustrative' },
  { id: 'decorative', label: 'Decorative' },
]

// ============================================================================
// Component
// ============================================================================

/**
 * StyleSelector - Style preset and aspect ratio selection
 */
export function StyleSelector({
  selectedStyle,
  onStyleChange,
  selectedAspectRatio,
  onAspectRatioChange,
  hasPremiumAccess = false,
  disabled = false,
  className,
}: StyleSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<StyleCategory>('all')

  const filteredStyles =
    selectedCategory === 'all'
      ? STYLE_PRESETS
      : STYLE_PRESETS.filter((style) => style.category === selectedCategory)

  const handleStyleClick = useCallback(
    (style: StylePresetConfig) => {
      if (disabled) return
      if (style.isPremium && !hasPremiumAccess) {
        // Could show upgrade modal here
        return
      }
      onStyleChange(style.id)
    },
    [disabled, hasPremiumAccess, onStyleChange]
  )

  const handleAspectRatioClick = useCallback(
    (ratio: AspectRatio) => {
      if (disabled) return
      onAspectRatioChange(ratio)
    },
    [disabled, onAspectRatioChange]
  )

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Style Presets Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Style Preset</h3>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              disabled={disabled}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                selectedCategory === category.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              {category.label}
            </button>
          ))}
        </div>

        {/* Style Cards Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredStyles.map((style) => {
            const isSelected = selectedStyle === style.id
            const isLocked = style.isPremium && !hasPremiumAccess

            return (
              <button
                key={style.id}
                type="button"
                onClick={() => handleStyleClick(style)}
                disabled={disabled}
                className={cn(
                  'group relative flex flex-col overflow-hidden rounded-lg border transition-all',
                  'disabled:cursor-not-allowed',
                  isSelected
                    ? 'border-primary ring-2 ring-primary ring-offset-2'
                    : 'border-border hover:border-muted-foreground',
                  isLocked && 'opacity-75'
                )}
              >
                {/* Style Preview */}
                <div
                  className={cn(
                    'aspect-square w-full',
                    style.thumbnailColor
                  )}
                >
                  {/* Selection Check */}
                  {isSelected && (
                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </div>
                  )}

                  {/* Premium Badge */}
                  {style.isPremium && (
                    <div className="absolute left-2 top-2">
                      <div className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-medium text-white">
                        <Crown className="h-3 w-3" />
                        PRO
                      </div>
                    </div>
                  )}

                  {/* Locked Overlay */}
                  {isLocked && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <div className="text-xs font-medium text-white">
                        Upgrade to unlock
                      </div>
                    </div>
                  )}
                </div>

                {/* Style Info */}
                <div className="flex flex-col gap-0.5 p-2">
                  <span className="text-xs font-medium text-foreground">
                    {style.name}
                  </span>
                  <span className="line-clamp-2 text-[10px] text-muted-foreground">
                    {style.description}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Aspect Ratio Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-medium text-foreground">Aspect Ratio</h3>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ASPECT_RATIOS.map((ratio) => {
            const isSelected = selectedAspectRatio === ratio.id

            return (
              <button
                key={ratio.id}
                type="button"
                onClick={() => handleAspectRatioClick(ratio.id)}
                disabled={disabled}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 transition-all',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <div
                  className={cn(
                    'text-muted-foreground transition-colors',
                    isSelected && 'text-primary'
                  )}
                >
                  {ratio.icon}
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {ratio.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ratio.ratio}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default StyleSelector
