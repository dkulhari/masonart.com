import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Guards the edge security headers that traefik attaches to every SSR
 * response (docker/docker-compose.prod.yml, `chobii-web-headers` middleware).
 *
 * The web server itself sets no headers — app/server.tsx is the real server
 * entry and only handles static assets and the 406 branch — so this compose
 * file is the single source of truth for CSP. Nothing else in the repo can
 * catch a policy that forgets a host the app actually loads from, which is
 * why these assertions read the app source and cross-check it against the
 * policy rather than only pinning a literal string.
 *
 * #264 added HSTS / frame options / nosniff / referrer / permissions.
 * #344 added CSP: Report-Only first, then enforcing.
 */
describe('SSR edge security headers (#264, #344)', () => {
  const cwd = process.cwd()
  const isInWebDir = cwd.endsWith('packages/web') || cwd.endsWith('packages\\web')
  const repoRoot = isInWebDir ? join(cwd, '..', '..') : cwd

  const composePath = join(repoRoot, 'docker', 'docker-compose.prod.yml')
  const compose = readFileSync(composePath, 'utf8')

  const LABEL_PREFIX =
    'traefik.http.middlewares.chobii-web-headers.headers.customResponseHeaders.'

  /** Read one traefik customResponseHeaders label value out of the compose file. */
  function headerValue(headerName: string): string | undefined {
    const line = compose
      .split('\n')
      .find((l) => l.trim().startsWith(`${LABEL_PREFIX}${headerName}:`))
    if (!line) return undefined
    const raw = line.slice(line.indexOf(':', line.indexOf(LABEL_PREFIX)) + 1).trim()
    return raw.replace(/^"(.*)"$/, '$1')
  }

  /** Split a CSP into `{ directive: [sources] }`. */
  function parseCsp(policy: string): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const part of policy.split(';')) {
      const tokens = part.trim().split(/\s+/).filter(Boolean)
      if (tokens.length === 0) continue
      out[tokens[0]] = tokens.slice(1)
    }
    return out
  }

  describe('Content-Security-Policy', () => {
    it('is enforced, not Report-Only', () => {
      expect(headerValue('Content-Security-Policy-Report-Only')).toBeUndefined()
      expect(headerValue('Content-Security-Policy')).toBeDefined()
    })

    const csp = parseCsp(headerValue('Content-Security-Policy') ?? '')

    it('locks the default and kills plugin/base/form escapes', () => {
      expect(csp['default-src']).toEqual(["'self'"])
      expect(csp['object-src']).toEqual(["'none'"])
      expect(csp['base-uri']).toEqual(["'self'"])
      expect(csp['form-action']).toEqual(["'self'"])
    })

    it('forbids framing the site, matching X-Frame-Options', () => {
      // frame-ancestors is what modern browsers honour; X-Frame-Options is the
      // legacy fallback. They must agree or the pair is a lie.
      expect(csp['frame-ancestors']).toBeDefined()
      expect(csp['frame-ancestors']).toEqual(["'none'"])
      expect(compose).toContain('customFrameOptionsValue: DENY')
    })

    it('allows SSR hydration inline scripts but never eval', () => {
      // TanStack Start streams an inline hydration script; a static traefik
      // header cannot carry a per-response nonce, so 'unsafe-inline' stays.
      expect(csp['script-src']).toContain("'unsafe-inline'")
      expect(csp['script-src']).not.toContain("'unsafe-eval'")
      expect(JSON.stringify(csp)).not.toContain("'unsafe-eval'")
    })

    it('allows the Razorpay checkout script, frame and API origins', () => {
      expect(csp['script-src']).toContain('https://checkout.razorpay.com')
      expect(csp['frame-src']).toContain('https://api.razorpay.com')
      expect(csp['frame-src']).toContain('https://checkout.razorpay.com')
      expect(csp['connect-src']).toContain('https://api.razorpay.com')
      expect(csp['connect-src']).toContain('https://lumberjack.razorpay.com')
    })

    it('allows blob: images for local upload previews', () => {
      // ReferenceImageUploader, admin ProductForm and lib/product-images.ts all
      // render URL.createObjectURL(file) into an <img>.
      expect(csp['img-src']).toContain('blob:')
      expect(csp['img-src']).toContain('data:')
      expect(csp['img-src']).toContain("'self'")
    })

    it('allows the product image CDN', () => {
      expect(csp['img-src']).toContain('https://cdn.chobii.art')
    })

    it('covers every external host the document head loads', () => {
      // The head is the one place the app hard-codes third-party origins.
      // If a link/preconnect is added without widening the policy, the
      // resource is blocked in production — catch that here, not in prod.
      const rootRoute = readFileSync(
        join(repoRoot, 'packages', 'web', 'app', 'routes', '__root.tsx'),
        'utf8'
      )
      const hosts = new Set(
        [...rootRoute.matchAll(/href:\s*\n?\s*'(https:\/\/[a-z0-9.-]+)/gi)].map((m) => m[1])
      )
      // Sanity: the fixture must actually find something, or the test is vacuous.
      expect(hosts.size).toBeGreaterThan(0)

      const allSources = Object.values(csp).flat().join(' ')
      for (const host of hosts) {
        expect(allSources, `${host} is loaded by __root.tsx but absent from the CSP`).toContain(
          host
        )
      }
    })

    it('allows Google Fonts stylesheets and font files', () => {
      expect(csp['style-src']).toContain('https://fonts.googleapis.com')
      expect(csp['font-src']).toContain('https://fonts.gstatic.com')
    })
  })

  describe('headers from #264', () => {
    it('still sets HSTS, nosniff and referrer policy', () => {
      expect(compose).toContain('headers.stsSeconds: "15552000"')
      expect(compose).toContain('headers.stsIncludeSubdomains: "true"')
      expect(compose).toContain('headers.forceSTSHeader: "true"')
      expect(compose).toContain('headers.contentTypeNosniff: "true"')
      expect(compose).toContain('headers.referrerPolicy: strict-origin-when-cross-origin')
    })

    it('still sets Permissions-Policy', () => {
      expect(headerValue('Permissions-Policy')).toBe(
        'camera=(), microphone=(), geolocation=()'
      )
    })
  })

  describe('single source of truth', () => {
    it('has no orphaned app-level CSP that could contradict the edge', () => {
      // app/ssr.tsx used to define a second, stricter CSP that was never wired
      // into the build (app/server.tsx is the entry). Removed in #344 so the
      // policy lives in exactly one place.
      expect(existsSync(join(repoRoot, 'packages', 'web', 'app', 'ssr.tsx'))).toBe(false)
      const serverEntry = readFileSync(
        join(repoRoot, 'packages', 'web', 'app', 'server.tsx'),
        'utf8'
      )
      expect(serverEntry).not.toContain('Content-Security-Policy')
    })
  })
})
