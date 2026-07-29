/**
 * Non-HTML Accept guard for the SSR entry (#268).
 *
 * TanStack Start's router branch rejects Accept headers that list neither
 * text/html nor the wildcard type with a JSON 500 (start-server-core
 * createStartHandler → executeRouter). We mirror its predicate in server.tsx
 * and answer 406 instead.
 *
 * The predicate must NOT be applied to server-function RPCs: upstream returns
 * from the `/_serverFn/*` branch before executeRouter runs, and the client
 * fetcher sends `accept: application/x-tss-framed, application/x-ndjson,
 * application/json` (start-client-core serverFnFetcher). 406'ing those breaks
 * every client-side navigation whose route calls a GET server fn — e.g. the
 * root route's fetchSession, which is how /account failed.
 */

/** TanStack Start's default server-fn base (TSS_SERVER_FN_BASE); unset in vite.config. */
const SERVER_FN_BASE = '/_serverFn'

/** Header the client fetcher stamps on every server-fn RPC. */
const SERVER_FN_HEADER = 'x-tsr-serverFn'

/** True when the request is a server-function RPC rather than a page request. */
function isServerFnRequest(request: Request): boolean {
  if (request.headers.get(SERVER_FN_HEADER)) return true
  try {
    return new URL(request.url).pathname.startsWith(SERVER_FN_BASE)
  } catch {
    return false
  }
}

/**
 * True when the request is a page request that cannot accept HTML, and so
 * should be answered with 406 instead of falling through to a 500.
 */
export function shouldRejectNonHtmlRequest(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  if (isServerFnRequest(request)) return false

  const acceptParts = (request.headers.get('Accept') || '*/*').split(',')
  return !['*/*', 'text/html'].some((mimeType) =>
    acceptParts.some((part) => part.trim().startsWith(mimeType)),
  )
}
