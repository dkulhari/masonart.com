/**
 * Tests for the SSR entry's non-HTML Accept guard (#268).
 *
 * The guard mirrors TanStack Start's own predicate, but must only apply where
 * upstream applies it — inside the router branch. Server-function RPCs return
 * earlier upstream and advertise `accept: application/x-tss-framed, ...`, so
 * 406'ing them breaks every client-side navigation that calls a GET server fn.
 */

import { describe, it, expect } from 'vitest'
import { shouldRejectNonHtmlRequest } from '~/lib/html-accept'

const TSS_RPC_ACCEPT = 'application/x-tss-framed, application/x-ndjson, application/json'
const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'

function req(url: string, init?: RequestInit) {
  return new Request(new URL(url, 'https://chobii.art').toString(), init)
}

describe('shouldRejectNonHtmlRequest', () => {
  it('accepts a browser document request', () => {
    expect(shouldRejectNonHtmlRequest(req('/account', { headers: { Accept: BROWSER_ACCEPT } }))).toBe(
      false,
    )
  })

  it('accepts a request with no Accept header', () => {
    expect(shouldRejectNonHtmlRequest(req('/account'))).toBe(false)
  })

  it('rejects a page request that cannot take HTML', () => {
    expect(
      shouldRejectNonHtmlRequest(req('/account', { headers: { Accept: 'application/json' } })),
    ).toBe(true)
  })

  it('ignores non-GET/HEAD methods', () => {
    expect(
      shouldRejectNonHtmlRequest(
        req('/account', { method: 'POST', headers: { Accept: 'application/json' } }),
      ),
    ).toBe(false)
  })

  it('accepts GET server-function RPCs despite their non-HTML Accept', () => {
    expect(
      shouldRejectNonHtmlRequest(
        req('/_serverFn/fetchSession', {
          headers: { accept: TSS_RPC_ACCEPT, 'x-tsr-serverFn': 'true' },
        }),
      ),
    ).toBe(false)
  })

  it('accepts server-function RPCs identified only by their marker header', () => {
    expect(
      shouldRejectNonHtmlRequest(
        req('/some/base/fetchSession', {
          headers: { accept: TSS_RPC_ACCEPT, 'x-tsr-serverFn': 'true' },
        }),
      ),
    ).toBe(false)
  })

  it('accepts server-function RPCs identified only by their path', () => {
    expect(
      shouldRejectNonHtmlRequest(req('/_serverFn/fetchSession', { headers: { accept: TSS_RPC_ACCEPT } })),
    ).toBe(false)
  })
})
