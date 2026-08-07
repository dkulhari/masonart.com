/**
 * /admin/shipping — the free-shipping threshold (#570).
 *
 * One setting, and it is a number the whole storefront repeats. The screen is
 * thin over `GET/PUT /api/admin/shipping-config`; what it adds is the context
 * an admin needs before moving a figure that customers are being shown:
 *
 *  - **What the number means.** It is measured on the NET, post-discount
 *    amount, with gift cards excluded (design §5) — the same rule
 *    `calculateShippingCost` charges by. Read as gross, ₹999 is a different
 *    setting than the one it actually is.
 *  - **Who set it and when.** The config table carries `createdBy`, and an
 *    admin looking at a value they did not choose should see whose decision
 *    they are about to overwrite.
 *  - **What is already scheduled.** The API deliberately does not clobber a row
 *    scheduled for a sale weekend, so the screen shows it: a new threshold with
 *    an expiry nobody remembers setting is how a pricing incident starts.
 *
 * Rupees throughout — the form posts what the table holds and what the copy
 * prints. `walletPricingConfig` stores paise; this one must not, and a
 * conversion anywhere in the chain is a 100x bug (see the API route header).
 *
 * Changing the value here changes the copy everywhere: the storefront reads it
 * through the root route (`app/lib/free-shipping.tsx`), so the banner, the PDP
 * badges, the policy pages and the cart all restate whatever is saved here.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, CalendarClock, Loader2, Truck } from 'lucide-react'
import {
  FREE_SHIPPING_THRESHOLD_WARN_ABOVE,
  freeShippingThresholdLabel,
} from '@chobii/shared'
import { cn, getApiUrl } from '~/lib/utils'

export const Route = createFileRoute('/admin/shipping')({
  head: () => ({
    meta: [
      { title: 'Shipping | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminShippingPage,
})

// ============================================================================
// Types — the GET payload, verbatim
// ============================================================================

export interface AdminShippingConfigRow {
  id: string
  value: number
  description: string | null
  effectiveFrom: string
  effectiveTo: string | null
  createdAt: string
  createdById: string | null
  createdByName: string | null
  createdByEmail: string | null
}

export interface AdminShippingConfig {
  key: string
  /** Whole rupees. Same unit as the table, the copy and the charge. */
  value: number
  /** `config` when a row is in force, `default` when the bundled constant is. */
  source: string
  defaultValue: number
  description: string | null
  effectiveFrom: string | null
  effectiveTo: string | null
  updatedAt: string | null
  updatedBy: { id: string; name: string | null; email: string } | null
  nextChangeAt: string | null
  scheduled: AdminShippingConfigRow[]
}

export interface ThresholdUpdate {
  /** Whole rupees, exactly as typed. No paise conversion anywhere. */
  value: number
  description?: string
  effectiveFrom?: string
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Rupees, whole, not negative.
 *
 * `0` is accepted deliberately: "everything ships free" is a real setting, and
 * #569 honours a configured 0 rather than falling back to ₹999. Rejecting it
 * here would make the form disagree with what the table may hold. It warns.
 *
 * Mirrors `updateThresholdSchema` in the API route, so an entry this accepts is
 * one the endpoint accepts — a form that validates more loosely turns into a
 * 400 the admin cannot explain.
 */
export function validateThreshold(input: string): {
  value?: number
  error?: string
} {
  const trimmed = input.trim()
  if (trimmed === '') return { error: 'Enter an amount in rupees.' }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return { error: 'Enter an amount in rupees, digits only.' }
  }
  if (!Number.isInteger(parsed)) {
    return { error: 'Whole rupees only — the threshold holds no paise.' }
  }
  if (parsed < 0) return { error: 'The threshold cannot be negative.' }

  return { value: parsed }
}

/**
 * What is worth saying about an otherwise valid value. Warnings only — the
 * ticket is explicit that an unusual threshold is not an invalid one.
 */
export function thresholdWarnings(value: number): string[] {
  const warnings: string[] = []

  if (value === 0) {
    warnings.push(
      'A threshold of ₹0 gives every order free shipping, including a single postcard.'
    )
  }
  if (value > FREE_SHIPPING_THRESHOLD_WARN_ABOVE) {
    warnings.push(
      `A threshold of ${freeShippingThresholdLabel(
        value
      )} is high enough that almost no basket will qualify for free shipping.`
    )
  }

  return warnings
}

// ============================================================================
// Presentation
// ============================================================================

function formatInstant(iso: string | null): string {
  if (!iso) return 'unknown'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'unknown'

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * The form. Presentational on purpose — it takes the payload and an `onSave`,
 * so the validation and the warnings can be tested without a network.
 */
export function ShippingConfigForm({
  config,
  onSave,
  isSaving = false,
  serverError,
  serverWarnings = [],
}: {
  config: AdminShippingConfig
  onSave: (update: ThresholdUpdate) => void
  isSaving?: boolean
  serverError?: string | null
  serverWarnings?: string[]
}) {
  const [amount, setAmount] = useState(String(config.value))
  const [error, setError] = useState<string | null>(null)

  // A save that lands returns the row the server actually wrote; the field
  // follows it rather than keeping whatever was typed.
  useEffect(() => {
    setAmount(String(config.value))
  }, [config.value])

  const parsed = validateThreshold(amount)
  const warnings =
    parsed.value === undefined ? [] : thresholdWarnings(parsed.value)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const result = validateThreshold(amount)
    if (result.value === undefined) {
      setError(result.error ?? 'Enter an amount in rupees.')
      return
    }

    setError(null)
    onSave({ value: result.value })
  }

  return (
    <form
      data-testid="shipping-config-form"
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-6"
    >
      <div className="flex items-start gap-3">
        <Truck className="mt-1 h-5 w-5 text-foreground" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Free shipping threshold
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Orders at or above this amount ship free. It is measured on the net,
            post-discount amount — gift cards are tender and never count toward
            it. Every customer-facing mention of the figure follows this
            setting.
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-xs">
        <label
          htmlFor="free-shipping-threshold"
          className="block text-sm font-medium text-foreground"
        >
          Free-shipping threshold (₹)
        </label>
        <input
          id="free-shipping-threshold"
          name="free-shipping-threshold"
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value)
            setError(null)
          }}
          className={cn(
            'mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            error && 'border-destructive'
          )}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Whole rupees. Currently in force:{' '}
          {freeShippingThresholdLabel(config.value)}.
        </p>
      </div>

      {(error || serverError) && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error ?? serverError}
        </p>
      )}

      {(warnings.length > 0 || serverWarnings.length > 0) && (
        <ul
          data-testid="threshold-warnings"
          className="mt-4 space-y-2 rounded-lg bg-accent p-3 text-sm text-foreground"
        >
          {[...warnings, ...serverWarnings].map((warning) => (
            <li key={warning} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}

      <p
        data-testid="threshold-provenance"
        className="mt-4 text-xs text-muted-foreground"
      >
        {config.source === 'config' && config.updatedBy ? (
          <>
            Set by {config.updatedBy.name ?? config.updatedBy.email} on{' '}
            {formatInstant(config.updatedAt ?? config.effectiveFrom)}.
          </>
        ) : config.source === 'config' ? (
          <>
            Set on {formatInstant(config.updatedAt ?? config.effectiveFrom)} by
            an account that no longer exists.
          </>
        ) : (
          <>
            No value has been saved — the bundled default of{' '}
            {freeShippingThresholdLabel(config.defaultValue)} is in force.
          </>
        )}
      </p>

      {config.scheduled.length > 0 && (
        <div
          data-testid="threshold-scheduled"
          className="mt-4 rounded-lg border border-border p-3 text-sm"
        >
          <p className="flex items-center gap-2 font-medium text-foreground">
            <CalendarClock className="h-4 w-4" />
            Already scheduled
          </p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {config.scheduled.map((row) => (
              <li key={row.id}>
                {freeShippingThresholdLabel(row.value)} from{' '}
                {formatInstant(row.effectiveFrom)}
                {row.description ? ` — ${row.description}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Saving now does not remove these. They will replace the value above
            when their time comes.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/85 disabled:opacity-60"
      >
        {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save threshold
      </button>
    </form>
  )
}

// ============================================================================
// Route component
// ============================================================================

function AdminShippingPage() {
  const [config, setConfig] = useState<AdminShippingConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  async function load() {
    setIsLoading(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/shipping-config`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to load the shipping config')
      setConfig((await response.json()) as AdminShippingConfig)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleSave(update: ThresholdUpdate) {
    setIsSaving(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/shipping-config`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })

      const body = (await response.json()) as {
        error?: string
        warnings?: string[]
      }

      if (!response.ok) {
        setError(body.error ?? 'Failed to save the threshold')
        return
      }

      setError(null)
      setWarnings(body.warnings ?? [])
      // Re-read rather than trusting the echo: the value in force is whatever
      // the table resolves to now, which a scheduled row can differ from.
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unknown error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-foreground">Shipping</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        What the storefront promises and what checkout charges, from one
        setting.
      </p>

      <div className="mt-6 max-w-3xl">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : config ? (
          <ShippingConfigForm
            config={config}
            onSave={handleSave}
            isSaving={isSaving}
            serverError={error}
            serverWarnings={warnings}
          />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {error ?? 'The shipping config could not be loaded.'}
          </p>
        )}
      </div>
    </div>
  )
}
