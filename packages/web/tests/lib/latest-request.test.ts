/**
 * The guard behind every "last response wins" bug on the production screens.
 *
 * @see packages/web/app/lib/latest-request.ts
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLatestOnly } from '~/lib/latest-request'

describe('useLatestOnly', () => {
  it('lets a lone request through', () => {
    const { result } = renderHook(() => useLatestOnly())

    const isCurrent = result.current()
    expect(isCurrent()).toBe(true)
  })

  it('refuses the earlier of two requests, whichever finishes first', () => {
    const { result } = renderHook(() => useLatestOnly())

    const first = result.current()
    const second = result.current()

    // The order they FINISH in is the whole problem: the stale one is stale
    // whether it lands before or after the fresh one.
    expect(first()).toBe(false)
    expect(second()).toBe(true)
    expect(first()).toBe(false)
  })

  it('keeps refusing every superseded request, not just the last one', () => {
    const { result } = renderHook(() => useLatestOnly())

    const claims = [result.current(), result.current(), result.current()]

    expect(claims.map((isCurrent) => isCurrent())).toEqual([false, false, true])
  })

  it('is stable across renders, so it can guard a memoised loader', () => {
    const { result, rerender } = renderHook(() => useLatestOnly())
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it('remembers across renders which request is current', () => {
    const { result, rerender } = renderHook(() => useLatestOnly())

    const stale = result.current()
    rerender()
    const fresh = result.current()

    expect(stale()).toBe(false)
    expect(fresh()).toBe(true)
  })
})
