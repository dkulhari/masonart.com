/**
 * ShareRow
 *
 * `Share:` plus social glyphs on the left, `Need help?` on the right (ticket
 * #520, docs/design/pdp-parity-reference.md). Replaces the share button in
 * ProductDetail.tsx, which renders `<Share2 />` with `aria-label="Share
 * product"` and no `onClick` at all — clicking it does nothing.
 *
 * Sharing is real:
 *   - The first glyph uses the Web Share API (`navigator.share`) when the
 *     browser has it — the OS-native share sheet, which is the best
 *     experience where it exists (mobile Safari/Chrome).
 *   - Where it doesn't (most desktop browsers), or if the user dismisses it
 *     with an error, that same glyph falls back to copying the link.
 *   - The remaining glyphs are the individual network intents (Facebook,
 *     X/Twitter, LinkedIn) plus a standalone copy-link button — these work
 *     everywhere, Web Share API or not, so the "fall back to copy-link plus
 *     the individual network intents" case in the ticket is always available,
 *     not just when Web Share is missing.
 *
 * "Need help?" points at /contact — a real route
 * (app/routes/contact.tsx) — found by grepping the routes for a support
 * page; chosen over /returns or /shipping because it is the general contact
 * page ("Email us anytime... orders, returns, framing questions, or anything
 * else"), which is what a PDP-level "stuck? talk to someone" link means to
 * reach.
 */

import { useState } from 'react'
import { Facebook, Twitter, Linkedin, Link2, Check, Share2, CircleHelp } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface ShareRowProps {
  /** Product title, used as the Web Share API / network-intent share text. */
  title: string
  /**
   * The URL to share. Defaults to the current page (`window.location.href`)
   * when omitted, so the row works with zero props on the client; pass it
   * explicitly for a canonical URL (no query string, etc.) or for SSR.
   */
  url?: string
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

function currentUrl(): string {
  return typeof window !== 'undefined' ? window.location.href : ''
}

function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Copies `text` to the clipboard, preferring the async Clipboard API and
 * falling back to the classic hidden-textarea + execCommand trick for
 * browsers (or test environments) that don't have `navigator.clipboard`.
 * Never throws — callers get a boolean.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy path below.
    }
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }

  return false
}

function openIntent(href: string): void {
  if (typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer,width=600,height=520')
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * ShareRow - "Share:" plus working share glyphs, and a "Need help?" link.
 *
 * @example
 * <ShareRow title={product.title} url={`https://chobii.art/posters/${product.slug}`} />
 */
export function ShareRow({ title, url, className }: ShareRowProps) {
  const [copied, setCopied] = useState(false)
  const shareUrl = url ?? currentUrl()

  async function handleCopyLink() {
    const ok = await copyToClipboard(shareUrl)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleNativeShare() {
    if (canUseWebShare()) {
      try {
        await navigator.share({ title, url: shareUrl })
        return
      } catch (error) {
        // AbortError is the user closing the native sheet — not a failure,
        // nothing to fall back to. Anything else (unsupported data, a flaky
        // share target) falls through to copy-link below.
        if (error instanceof Error && error.name === 'AbortError') return
      }
    }
    await handleCopyLink()
  }

  const encodedUrl = encodeURIComponent(shareUrl)
  const encodedTitle = encodeURIComponent(title)

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Share:</span>
        <div className="flex items-center gap-1.5">
          <ShareGlyphButton label="Share" onClick={handleNativeShare}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </ShareGlyphButton>
          <ShareGlyphButton
            label="Share on Facebook"
            onClick={() =>
              openIntent(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)
            }
          >
            <Facebook className="h-4 w-4" aria-hidden="true" />
          </ShareGlyphButton>
          <ShareGlyphButton
            label="Share on X"
            onClick={() =>
              openIntent(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`)
            }
          >
            <Twitter className="h-4 w-4" aria-hidden="true" />
          </ShareGlyphButton>
          <ShareGlyphButton
            label="Share on LinkedIn"
            onClick={() =>
              openIntent(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`)
            }
          >
            <Linkedin className="h-4 w-4" aria-hidden="true" />
          </ShareGlyphButton>
          <ShareGlyphButton label={copied ? 'Link copied' : 'Copy link'} onClick={handleCopyLink}>
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden="true" />
            )}
          </ShareGlyphButton>
        </div>
        {/* Announced for screen readers without stealing visual layout —
            the copied icon swap above is the sighted confirmation. */}
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? 'Link copied to clipboard' : ''}
        </span>
      </div>

      <a
        href="/contact"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
        Need help?
      </a>
    </div>
  )
}

function ShareGlyphButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}

export default ShareRow
