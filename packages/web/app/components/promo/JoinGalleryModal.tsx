/**
 * JoinGalleryModal — the offer, and the one field it asks for (#444).
 *
 * The sale is account-gated (design §8, D4): the price is visible everywhere,
 * but it unlocks when the visitor joins the gallery. This is the dialog that
 * asks. The banner (#445) and the rail tab (#446) both open it, and each passes
 * the surface it opened from so `joinSource` records where the member came
 * from.
 *
 * ## Why it owns no numbers
 *
 * The headline and the depth come from `GET /api/promotions/active` (#432).
 * Nothing here is written down: a literal "40% OFF" in this file would keep
 * advertising a sale after it was disabled, after its depth changed, and after
 * it ended, with nothing failing to say so. No promotion means no modal — the
 * component renders `null` rather than an offer with a blank where the number
 * should be.
 *
 * The payload can be handed in by whichever surface already has it (the banner
 * fetched it to decide whether to appear at all); the fetch is the fallback for
 * callers that do not.
 *
 * ## Why exactly one field
 *
 * Minimal-field capture converts best (design §2, researched 2026-08-05), and a
 * discount-carrying popup converts around 7.65% against 5.10% without one. Each
 * extra field on this dialog is a member we do not get, so a name box, a phone
 * box or a marketing checkbox is a measurable cost rather than a layout
 * preference. `tests/components/promo/JoinGalleryModal.test.tsx` counts the
 * fields so adding one is a conversation.
 *
 * ## Why the session comes from the router context
 *
 * `useRouteContext({ from: '__root__' })`, not better-auth's `useSession()` —
 * the same reasoning as `useGalleryMembership` (#443). `useSession()` starts
 * `{ data: null, isPending: true }` and settles after a client round trip, so a
 * signed-in visitor would be shown the guest path (an empty field, a trip to
 * registration they do not need) for the first beat after the modal opens.
 *
 * ## Why failures stay on screen
 *
 * `join()` resolves false rather than throwing (#443), which makes it very easy
 * to close the dialog on a join that never happened and leave the viewer with a
 * price that disagrees with their account. The error is component state, shown
 * in the dialog: `window.alert` is unstyled, blocks the page, and cannot be
 * asserted on.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { Loader2, X } from 'lucide-react'

import { Button } from '~/components/ui/Button'
import {
  useGalleryMembership,
  type JoinSource,
} from '~/hooks/useGalleryMembership'
import { cn, getApiUrl, isValidEmail } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

/**
 * The allowlisted payload `GET /api/promotions/active` returns (#432), or
 * `null` when nothing is running. Note there is no `endsAt` — the real end date
 * stays server-side and the countdown ships as an already-resolved `deadline`.
 */
export interface ActivePromotion {
  promotionId: string
  headline: string
  /** Null for a fixed-amount promotion, which has no percentage to quote. */
  percentOff: number | null
  membersOnly: boolean
  deadline: string
}

export interface JoinGalleryModalProps {
  /** Whether the dialog is open. Closed means no promotion lookup either. */
  open: boolean
  /** Dismissal, and success for a signed-in visitor. */
  onClose: () => void
  /** The surface that opened this, recorded as the member's `joinSource`. */
  source: JoinSource
  /**
   * The active promotion, when the caller already has it. Omit to let the
   * dialog fetch it; pass `null` to say explicitly that none is running.
   */
  promotion?: ActivePromotion | null
}

interface SessionShape {
  user?: { email?: string | null } | null
}

// ============================================================================
// Copy
// ============================================================================

const GENERIC_FAILURE =
  'We could not add you to the gallery just now. Please try again.'

const INVALID_EMAIL = 'Enter an email address so we know where to send it.'

// ============================================================================
// Component
// ============================================================================

export function JoinGalleryModal({
  open,
  onClose,
  source,
  promotion,
}: JoinGalleryModalProps) {
  const { session } = useRouteContext({ from: '__root__' }) as {
    session?: SessionShape | null
  }
  const navigate = useNavigate()
  const { join } = useGalleryMembership()

  const signedInEmail = session?.user?.email ?? ''
  const isSignedIn = Boolean(session?.user)

  const [fetched, setFetched] = useState<ActivePromotion | null>(null)
  const [email, setEmail] = useState(signedInEmail)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // An explicit `promotion` prop wins, including an explicit `null`; only an
  // omitted prop falls through to the lookup.
  const active = promotion !== undefined ? promotion : fetched

  /**
   * Resolve the promotion when the caller did not supply one. Guarded on
   * `open` so a mounted-but-closed dialog costs nothing, and on the abort flag
   * so a dismissal mid-flight cannot set state on an unmounted tree.
   */
  useEffect(() => {
    if (!open || promotion !== undefined) return

    let cancelled = false

    void (async () => {
      try {
        // Absolute base: there is no Vite `/api` proxy here and the API is a
        // separate origin in dev, so a bare `/api/...` would hit the web
        // server. Credentials carry the countdown cookie (#432) — without it
        // every open re-mints the visitor's window.
        const response = await fetch(`${getApiUrl()}/api/promotions/active`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const body = (await response.json()) as ActivePromotion | null
        if (!cancelled) setFetched(body ?? null)
      } catch {
        // A sale is decoration. A failed lookup reads as "no sale running"
        // rather than taking the surface that mounted this down with it.
        if (!cancelled) setFetched(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, promotion])

  /** Adopt the signed-in address as it resolves, unless the visitor typed. */
  useEffect(() => {
    if (signedInEmail) setEmail(signedInEmail)
  }, [signedInEmail])

  /** A fresh open is a fresh attempt — do not reopen onto a stale error. */
  useEffect(() => {
    if (open) setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const address = email.trim()
      if (!isValidEmail(address)) {
        setError(INVALID_EMAIL)
        return
      }

      setError(null)

      if (!isSignedIn) {
        // The join endpoint is authenticated, so a guest cannot join from
        // here. The intent rides the URL to registration (#441), which is what
        // survives the auth round trip — component state does not.
        navigate({
          href: `/auth/register?join=gallery&email=${encodeURIComponent(address)}`,
        })
        return
      }

      setIsSubmitting(true)
      try {
        const joined = await join(source)
        if (!joined) {
          // Closing here would leave the viewer believing they have a price
          // their account does not carry.
          setError(GENERIC_FAILURE)
          return
        }
        onClose()
      } finally {
        setIsSubmitting(false)
      }
    },
    [email, isSignedIn, navigate, join, source, onClose],
  )

  if (!open || !active) return null

  const depth =
    active.percentOff !== null
      ? `Join the gallery and ${active.percentOff}% comes off every print in the sale.`
      : 'Join the gallery and the sale price is yours at checkout.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          'relative z-10 mx-4 w-full max-w-md',
          'rounded-xl bg-card p-6 shadow-xl',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-gallery-headline"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <p
          id="join-gallery-headline"
          className="pr-8 text-xl font-semibold uppercase tracking-wide text-foreground"
        >
          {active.headline}
        </p>

        <p className="mt-3 text-sm text-muted-foreground">{depth}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3" noValidate>
          <label
            htmlFor="join-gallery-email"
            className="block text-sm font-medium text-foreground"
          >
            Email address
          </label>
          <input
            id="join-gallery-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (error) setError(null)
            }}
            className="h-12 w-full rounded-md border border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="pill"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Join the gallery
          </Button>
        </form>
      </div>
    </div>
  )
}

export default JoinGalleryModal
