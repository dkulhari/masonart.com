/**
 * useUpscale Hook
 *
 * Manages image upscaling operations.
 * Features:
 * - Initiate upscale requests
 * - Poll for progress
 * - Cost estimation
 * - Error handling
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback, useRef, useEffect } from 'react'

// ============================================================================
// Types
// ============================================================================

export type UpscaleMultiplier = 2 | 4

export type UpscaleStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

export interface UpscaleResult {
  upscaledImageUrl: string
  originalDimensions: { width: number; height: number }
  newDimensions: { width: number; height: number }
  multiplier: UpscaleMultiplier
  processingTimeMs: number
}

export interface UpscaleJob {
  generationId: string
  imageId: string
  multiplier: UpscaleMultiplier
  status: UpscaleStatus
  progress: number
  result?: UpscaleResult
  error?: string
  startedAt: number
}

export interface UpscaleCostInfo {
  multiplier: UpscaleMultiplier
  cost: number
  estimatedTimeSeconds: number
}

export interface UseUpscaleOptions {
  /** API base URL */
  apiBaseUrl?: string
  /** Poll interval in ms */
  pollInterval?: number
  /** Callback when upscale completes */
  onComplete?: (result: UpscaleResult) => void
  /** Callback when upscale fails */
  onError?: (error: string) => void
}

export interface UseUpscaleReturn {
  /** Current upscale jobs */
  jobs: Map<string, UpscaleJob>
  /** Whether any upscale is in progress */
  isUpscaling: boolean
  /** Start an upscale operation */
  startUpscale: (generationId: string, imageId: string, multiplier: UpscaleMultiplier) => Promise<void>
  /** Cancel an upscale operation */
  cancelUpscale: (generationId: string, imageId: string) => void
  /** Get job for a specific image */
  getJob: (generationId: string, imageId: string) => UpscaleJob | undefined
  /** Check if image is being upscaled */
  isImageUpscaling: (generationId: string, imageId: string) => boolean
  /** Get upscale cost info */
  getCostInfo: () => UpscaleCostInfo[]
  /** Error message */
  error: string | null
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_POLL_INTERVAL = 2000 // 2 seconds
const UPSCALE_COSTS: UpscaleCostInfo[] = [
  { multiplier: 2, cost: 5, estimatedTimeSeconds: 15 },
  { multiplier: 4, cost: 10, estimatedTimeSeconds: 30 },
]

// ============================================================================
// Hook
// ============================================================================

/**
 * useUpscale - Manage image upscaling operations
 */
export function useUpscale({
  apiBaseUrl = '/api/ai',
  pollInterval = DEFAULT_POLL_INTERVAL,
  onComplete,
  onError,
}: UseUpscaleOptions = {}): UseUpscaleReturn {
  const [jobs, setJobs] = useState<Map<string, UpscaleJob>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const pollIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const getJobKey = (generationId: string, imageId: string) => `${generationId}-${imageId}`

  const updateJob = useCallback((key: string, updates: Partial<UpscaleJob>) => {
    setJobs((prev) => {
      const newMap = new Map(prev)
      const existing = newMap.get(key)
      if (existing) {
        newMap.set(key, { ...existing, ...updates })
      }
      return newMap
    })
  }, [])

  const stopPolling = useCallback((key: string) => {
    const interval = pollIntervalsRef.current.get(key)
    if (interval) {
      clearInterval(interval)
      pollIntervalsRef.current.delete(key)
    }
  }, [])

  const pollStatus = useCallback(
    async (key: string, generationId: string) => {
      try {
        const response = await fetch(`${apiBaseUrl}/generations/${generationId}/upscale-status`)

        if (!response.ok) {
          throw new Error('Failed to fetch upscale status')
        }

        const data = await response.json()

        if (data.status === 'completed' && data.upscaledImageUrl) {
          const result: UpscaleResult = {
            upscaledImageUrl: data.upscaledImageUrl,
            originalDimensions: data.originalDimensions || { width: 0, height: 0 },
            newDimensions: data.newDimensions || { width: 0, height: 0 },
            multiplier: data.multiplier || 2,
            processingTimeMs: data.processingTimeMs || 0,
          }

          updateJob(key, {
            status: 'completed',
            progress: 100,
            result,
          })

          stopPolling(key)
          onComplete?.(result)
        } else if (data.status === 'failed') {
          const errorMsg = data.error || 'Upscale failed'
          updateJob(key, {
            status: 'failed',
            error: errorMsg,
          })

          stopPolling(key)
          onError?.(errorMsg)
        } else {
          updateJob(key, {
            status: data.status || 'processing',
            progress: data.progress || 50,
          })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        updateJob(key, {
          status: 'failed',
          error: errorMsg,
        })
        stopPolling(key)
        onError?.(errorMsg)
      }
    },
    [apiBaseUrl, onComplete, onError, stopPolling, updateJob]
  )

  const startUpscale = useCallback(
    async (generationId: string, imageId: string, multiplier: UpscaleMultiplier) => {
      const key = getJobKey(generationId, imageId)
      setError(null)

      // Create initial job
      const job: UpscaleJob = {
        generationId,
        imageId,
        multiplier,
        status: 'pending',
        progress: 0,
        startedAt: Date.now(),
      }

      setJobs((prev) => {
        const newMap = new Map(prev)
        newMap.set(key, job)
        return newMap
      })

      try {
        const response = await fetch(`${apiBaseUrl}/generations/${generationId}/upscale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId, multiplier }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to start upscale')
        }

        updateJob(key, { status: 'processing', progress: 10 })

        // Start polling for status
        const interval = setInterval(() => {
          pollStatus(key, generationId)
        }, pollInterval)

        pollIntervalsRef.current.set(key, interval)

        // Initial poll
        await pollStatus(key, generationId)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMsg)
        updateJob(key, { status: 'failed', error: errorMsg })
        onError?.(errorMsg)
      }
    },
    [apiBaseUrl, pollInterval, pollStatus, updateJob, onError]
  )

  const cancelUpscale = useCallback(
    (generationId: string, imageId: string) => {
      const key = getJobKey(generationId, imageId)
      stopPolling(key)
      setJobs((prev) => {
        const newMap = new Map(prev)
        newMap.delete(key)
        return newMap
      })
    },
    [stopPolling]
  )

  const getJob = useCallback(
    (generationId: string, imageId: string) => {
      const key = getJobKey(generationId, imageId)
      return jobs.get(key)
    },
    [jobs]
  )

  const isImageUpscaling = useCallback(
    (generationId: string, imageId: string) => {
      const job = getJob(generationId, imageId)
      return job?.status === 'pending' || job?.status === 'processing'
    },
    [getJob]
  )

  const getCostInfo = useCallback(() => {
    return UPSCALE_COSTS
  }, [])

  const isUpscaling = Array.from(jobs.values()).some(
    (job) => job.status === 'pending' || job.status === 'processing'
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach((interval) => clearInterval(interval))
      pollIntervalsRef.current.clear()
    }
  }, [])

  return {
    jobs,
    isUpscaling,
    startUpscale,
    cancelUpscale,
    getJob,
    isImageUpscaling,
    getCostInfo,
    error,
  }
}

export default useUpscale
