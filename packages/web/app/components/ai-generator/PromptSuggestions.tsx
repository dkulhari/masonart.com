/**
 * PromptSuggestions Component
 *
 * AI-powered prompt suggestions for poster generation.
 * Features:
 * - Style-based suggestions
 * - Click to insert into prompt
 * - Shuffle for new suggestions
 * - Popular/trending indicators
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import { Sparkles, RefreshCw, TrendingUp } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface PromptSuggestion {
  id: string
  text: string
  isPopular?: boolean
  tags?: string[]
}

export interface PromptSuggestionsProps {
  /** Current style preset for contextual suggestions */
  stylePreset?: string
  /** Suggestions to display */
  suggestions: PromptSuggestion[]
  /** Callback when suggestion is clicked */
  onSuggestionClick: (text: string) => void
  /** Callback to refresh/shuffle suggestions */
  onRefresh?: () => void
  /** Whether suggestions are loading */
  isLoading?: boolean
  /** Whether the component is disabled */
  disabled?: boolean
  /** Custom className */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

const MAX_VISIBLE_SUGGESTIONS = 6
const SKELETON_COUNT = 4

// ============================================================================
// Component
// ============================================================================

/**
 * PromptSuggestions - Clickable suggestion pills for prompt inspiration
 */
export function PromptSuggestions({
  stylePreset,
  suggestions,
  onSuggestionClick,
  onRefresh,
  isLoading = false,
  disabled = false,
  className,
}: PromptSuggestionsProps) {
  const [clickedId, setClickedId] = useState<string | null>(null)

  const visibleSuggestions = suggestions.slice(0, MAX_VISIBLE_SUGGESTIONS)

  const handleClick = useCallback(
    (suggestion: PromptSuggestion) => {
      if (disabled || isLoading) return

      setClickedId(suggestion.id)
      onSuggestionClick(suggestion.text)

      // Reset animation after delay
      setTimeout(() => setClickedId(null), 300)
    },
    [disabled, isLoading, onSuggestionClick]
  )

  const handleRefresh = useCallback(() => {
    if (disabled || isLoading || !onRefresh) return
    onRefresh()
  }, [disabled, isLoading, onRefresh])

  if (suggestions.length === 0 && !isLoading) {
    return null
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">
            Suggestions
            {stylePreset && (
              <span className="ml-1 text-primary">for {stylePreset}</span>
            )}
          </span>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={disabled || isLoading}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Get new suggestions"
          >
            <RefreshCw
              className={cn('h-3 w-3', isLoading && 'animate-spin')}
            />
            <span className="sr-only">Shuffle</span>
          </button>
        )}
      </div>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          // Skeleton loading state
          Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="h-7 animate-pulse rounded-full bg-muted"
              style={{ width: `${80 + Math.random() * 60}px` }}
            />
          ))
        ) : (
          visibleSuggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => handleClick(suggestion)}
              disabled={disabled}
              className={cn(
                'group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all',
                'hover:border-primary hover:bg-primary/5',
                'disabled:cursor-not-allowed disabled:opacity-50',
                clickedId === suggestion.id && 'scale-95 bg-primary/10',
                suggestion.isPopular
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-border bg-background'
              )}
            >
              {suggestion.isPopular && (
                <TrendingUp className="h-3 w-3 text-amber-600" />
              )}
              <span className="max-w-[200px] truncate">{suggestion.text}</span>
            </button>
          ))
        )}
      </div>

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground">
        Click a suggestion to add it to your prompt
      </p>
    </div>
  )
}

export default PromptSuggestions
