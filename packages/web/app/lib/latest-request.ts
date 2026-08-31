import { useCallback, useRef } from 'react'

/**
 * A guard that tells a finished request whether it is still the current one.
 *
 * Every read on the admin production screens is fire-and-forget: the effect
 * starts a fetch and whichever response ARRIVES last wins, which is not the
 * same as the one that was asked for last. Double-click Next on the queue and
 * page 2 landing after page 3 leaves the URL at `page=3`, the table on page 2
 * and the footer reading "Page 2 of N", so pressing Next appears to do nothing.
 * The same shape puts the previous job's photographs on the job you just
 * opened, and lets a pre-save readiness response land after the post-save one
 * and put the old consolidator back on screen.
 *
 * Deliberately not an `AbortController`. Aborting cancels the request; this
 * cancels the WRITE, which is the part that was wrong — and it stays correct
 * for a response that was already in flight when the abort would have fired,
 * for a read with no signal to pass, and for one served from cache.
 *
 * ```ts
 * const claim = useLatestOnly()
 * const load = useCallback(async () => {
 *   const isCurrent = claim()
 *   const result = await read()
 *   if (!isCurrent()) return
 *   setData(result)
 * }, [claim, read])
 * ```
 *
 * Stable across renders, so it can sit in a `useCallback` dependency list
 * without re-creating the loader it guards.
 */
export function useLatestOnly(): () => () => boolean {
  const latest = useRef(0)

  return useCallback(() => {
    const mine = ++latest.current
    return () => mine === latest.current
  }, [])
}
