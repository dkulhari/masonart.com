/**
 * SSR entry point — TanStack Start handler plus static-asset serving.
 *
 * In production the built server (dist/server/server.js) runs under Bun with
 * no CDN in front, so client assets (dist/client/*) must be served here.
 * In dev Vite serves assets itself and this branch never matches.
 * (Same pattern as customs-copilot; replaces the pre-1.168 serve.ts wrapper.)
 */

import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import path from 'node:path'
import { shouldRejectNonHtmlRequest } from '~/lib/html-accept'

declare const Bun: { file(path: string): { exists(): Promise<boolean> } } | undefined

const clientDir = path.join(import.meta.dirname ?? '.', '../client')

export default createServerEntry({
  async fetch(request) {
    const { pathname } = new URL(request.url)

    // Serve built client assets (hashed filenames → long cache)
    if (
      typeof Bun !== 'undefined' &&
      pathname !== '/' &&
      !pathname.includes('..') &&
      /\.[a-z0-9]+$/i.test(pathname)
    ) {
      const file = Bun.file(path.join(clientDir, pathname))
      if (await file.exists()) {
        return new Response(file as unknown as BodyInit, {
          headers: pathname.startsWith('/assets/')
            ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
            : undefined,
        })
      }
    }

    // #268: answer 406 for page requests that can't take HTML, which the
    // router branch would otherwise 500 on. Server-fn RPCs are exempt —
    // see app/lib/html-accept.ts.
    if (shouldRejectNonHtmlRequest(request)) {
      return new Response('Not Acceptable: this server serves text/html', {
        status: 406,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return handler.fetch(request)
  },
})
