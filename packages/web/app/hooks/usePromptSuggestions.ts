/**
 * usePromptSuggestions Hook
 *
 * Fetches and manages AI prompt suggestions based on style preset.
 * Features:
 * - Style-based suggestion fetching
 * - Shuffle/refresh functionality
 * - Caching to reduce API calls
 * - Loading states
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { PromptSuggestion } from '~/components/ai-generator/PromptSuggestions'

// ============================================================================
// Types
// ============================================================================

interface UsePromptSuggestionsOptions {
  /** Current style preset */
  stylePreset?: string
  /** Number of suggestions to fetch */
  limit?: number
  /** Whether to auto-fetch on mount/style change */
  autoFetch?: boolean
  /** API base URL */
  apiBaseUrl?: string
}

interface UsePromptSuggestionsReturn {
  /** Current suggestions */
  suggestions: PromptSuggestion[]
  /** Whether suggestions are loading */
  isLoading: boolean
  /** Error if fetch failed */
  error: string | null
  /** Refresh/shuffle suggestions */
  refresh: () => void
  /** Record usage when suggestion is selected */
  recordUsage: (prompt: string) => void
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LIMIT = 6
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

// Simple in-memory cache
const suggestionsCache = new Map<string, { data: PromptSuggestion[]; timestamp: number }>()

// ============================================================================
// Hook
// ============================================================================

/**
 * usePromptSuggestions - Manage AI prompt suggestions
 */
export function usePromptSuggestions({
  stylePreset,
  limit = DEFAULT_LIMIT,
  autoFetch = true,
  apiBaseUrl = '/api/ai',
}: UsePromptSuggestionsOptions = {}): UsePromptSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)

  const getCacheKey = useCallback(
    (shuffle: boolean) => `${stylePreset || 'all'}-${limit}-${shuffle}`,
    [stylePreset, limit]
  )

  const fetchSuggestions = useCallback(
    async (shuffle: boolean = false) => {
      const fetchId = ++fetchIdRef.current

      // Check cache first (only for non-shuffle requests)
      if (!shuffle) {
        const cacheKey = getCacheKey(false)
        const cached = suggestionsCache.get(cacheKey)
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
          setSuggestions(cached.data)
          return
        }
      }

      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          limit: limit.toString(),
          shuffle: shuffle.toString(),
        })

        if (stylePreset) {
          params.set('stylePreset', stylePreset)
        }

        const response = await fetch(`${apiBaseUrl}/suggestions?${params}`)

        if (!response.ok) {
          throw new Error('Failed to fetch suggestions')
        }

        const data = await response.json()

        // Only update if this is still the latest request
        if (fetchId === fetchIdRef.current) {
          const formattedSuggestions: PromptSuggestion[] = (
            data.suggestions || []
          ).map((s: { prompt?: string; text?: string; isPopular?: boolean; tags?: string[] }, index: number) => ({
            id: `suggestion-${index}-${Date.now()}`,
            text: s.prompt || s.text || '',
            isPopular: s.isPopular || false,
            tags: s.tags || [],
          }))

          setSuggestions(formattedSuggestions)

          // Cache non-shuffle results
          if (!shuffle) {
            const cacheKey = getCacheKey(false)
            suggestionsCache.set(cacheKey, {
              data: formattedSuggestions,
              timestamp: Date.now(),
            })
          }
        }
      } catch (err) {
        if (fetchId === fetchIdRef.current) {
          setError(err instanceof Error ? err.message : 'Unknown error')
          setSuggestions([])
        }
      } finally {
        if (fetchId === fetchIdRef.current) {
          setIsLoading(false)
        }
      }
    },
    [stylePreset, limit, apiBaseUrl, getCacheKey]
  )

  const refresh = useCallback(() => {
    fetchSuggestions(true)
  }, [fetchSuggestions])

  const recordUsage = useCallback(
    async (prompt: string) => {
      try {
        await fetch(`${apiBaseUrl}/suggestions/record-usage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: prompt.substring(0, 500), // Truncate for safety
            stylePreset,
          }),
        })
      } catch {
        // Silent fail - usage tracking is non-critical
      }
    },
    [apiBaseUrl, stylePreset]
  )

  // Auto-fetch on mount and style change
  useEffect(() => {
    if (autoFetch) {
      fetchSuggestions(false)
    }
  }, [autoFetch, fetchSuggestions])

  return {
    suggestions,
    isLoading,
    error,
    refresh,
    recordUsage,
  }
}

export default usePromptSuggestions
