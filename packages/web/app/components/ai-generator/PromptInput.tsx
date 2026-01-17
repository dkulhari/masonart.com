/**
 * PromptInput Component
 *
 * Text input component for AI poster generation prompts.
 * Features:
 * - Multiline textarea with character count
 * - Validation and error display
 * - Optional negative prompt input
 * - Prompt suggestions/examples
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import { Sparkles, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface PromptInputProps {
  /** Current prompt value */
  prompt: string
  /** Callback when prompt changes */
  onPromptChange: (prompt: string) => void
  /** Optional negative prompt value */
  negativePrompt?: string
  /** Callback when negative prompt changes */
  onNegativePromptChange?: (negativePrompt: string) => void
  /** Maximum character count */
  maxLength?: number
  /** Placeholder text */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Custom className */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_LENGTH = 500
const NEGATIVE_PROMPT_MAX_LENGTH = 300

const EXAMPLE_PROMPTS = [
  'A serene Japanese garden with cherry blossoms, morning mist',
  'Abstract geometric shapes in warm earth tones, minimalist',
  'Vintage travel poster of the Swiss Alps, retro style',
  'Botanical illustration of wildflowers, watercolor effect',
  'Modern city skyline at golden hour, photography style',
  'Ocean waves crashing on rocky shore, dramatic lighting',
]

// ============================================================================
// Component
// ============================================================================

/**
 * PromptInput - Text input for AI generation prompts
 */
export function PromptInput({
  prompt,
  onPromptChange,
  negativePrompt = '',
  onNegativePromptChange,
  maxLength = DEFAULT_MAX_LENGTH,
  placeholder = 'Describe the poster you want to create...',
  disabled = false,
  className,
}: PromptInputProps) {
  const [showNegativePrompt, setShowNegativePrompt] = useState(!!negativePrompt)
  const [showExamples, setShowExamples] = useState(false)

  const characterCount = prompt.length
  const isNearLimit = characterCount > maxLength * 0.8
  const isOverLimit = characterCount > maxLength

  const negativeCharacterCount = negativePrompt.length
  const isNegativeOverLimit = negativeCharacterCount > NEGATIVE_PROMPT_MAX_LENGTH

  const handleExampleClick = useCallback(
    (example: string) => {
      onPromptChange(example)
      setShowExamples(false)
    },
    [onPromptChange]
  )

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Main Prompt Input */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="prompt-input"
            className="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Your Prompt
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExamples(!showExamples)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Examples
              {showExamples ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            id="prompt-input"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={4}
            className={cn(
              'w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm transition-colors',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isOverLimit
                ? 'border-destructive focus:ring-destructive'
                : 'border-border'
            )}
          />
          <div
            className={cn(
              'absolute bottom-2 right-3 text-xs',
              isOverLimit
                ? 'text-destructive'
                : isNearLimit
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
            )}
          >
            {characterCount}/{maxLength}
          </div>
        </div>

        {isOverLimit && (
          <p className="text-xs text-destructive">
            Prompt exceeds maximum length of {maxLength} characters
          </p>
        )}

        {/* Example Prompts */}
        {showExamples && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Click an example to use it:
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((example, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleExampleClick(example)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs transition-colors hover:border-primary hover:bg-primary/5"
                >
                  {example.length > 50 ? `${example.slice(0, 50)}...` : example}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Negative Prompt Toggle and Input */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowNegativePrompt(!showNegativePrompt)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {showNegativePrompt ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Advanced: Negative Prompt
          <span className="text-xs">(optional)</span>
        </button>

        {showNegativePrompt && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <textarea
                id="negative-prompt-input"
                value={negativePrompt}
                onChange={(e) => onNegativePromptChange?.(e.target.value)}
                placeholder="Describe what you want to avoid (e.g., blurry, low quality, text)..."
                disabled={disabled}
                rows={2}
                className={cn(
                  'w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm transition-colors',
                  'placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isNegativeOverLimit
                    ? 'border-destructive focus:ring-destructive'
                    : 'border-border'
                )}
              />
              <div
                className={cn(
                  'absolute bottom-2 right-3 text-xs',
                  isNegativeOverLimit
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                )}
              >
                {negativeCharacterCount}/{NEGATIVE_PROMPT_MAX_LENGTH}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Specify elements you don&apos;t want in your poster. Style-specific negative
              prompts are automatically added based on your chosen style.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default PromptInput
