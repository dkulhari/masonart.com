/**
 * Admin — one vendor: identity, contacts, capabilities and the rate card.
 *
 * Four nested resources on one screen, each with its own endpoint. They are
 * reloaded from the server after every write rather than patched in place: the
 * rate routes rewrite rows the client did not send (a re-price closes the
 * incumbent, and a scheduled band caps the new row's `effectiveTo`), so an
 * optimistic local edit would show a card the server does not have.
 *
 * ## No native dialogs anywhere in this file
 *
 * Every destructive control is the two-step inline pattern from
 * `ReviewMediaStrip` (`routes/admin/reviews.tsx`). `window.confirm` blocks the
 * browser automation harness outright, which is why the nine admin files that
 * still use it have no E2E coverage on their destructive paths at all. See
 * `InlineConfirm` below.
 *
 * ## Effective dating is a field, not an advanced toggle
 *
 * `effectiveFrom` sits in the add-a-band form next to the amount, because
 * scheduling a price change is the ordinary case for a rate card, not the
 * exotic one. Leaving it blank means "now" — that is the API's default too.
 *
 * ## The 422 names the row
 *
 * `POST /rates` answers an overlapping band with 422 and a `conflict` object
 * identifying the existing row. That id is carried into the table and the
 * offending row is called out inline, because a banner saying "overlap" leaves
 * the admin hunting through a card for whichever band they collided with.
 *
 * ## Nothing here invents a number
 *
 * A failed load renders the error and stops. There is no zero rate, no dash
 * standing in for an amount, and no empty rate card shown for a vendor whose
 * card simply failed to fetch (#602, #606).
 */

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { ADMIN_VENDORS_SEARCH } from '~/lib/admin-nav'
import {
  VENDOR_CAPABILITY_KINDS,
  formatRupees,
  type VendorCapabilityKind,
  type VendorStatus,
} from './index'
import { VendorForm, type VendorFormValues, type vendorPayload } from './VendorForm'
import { VendorPayablesSection } from './$id.payables'

export const Route = createFileRoute('/admin/vendors/$id')({
  head: () => ({
    meta: [
      { title: 'Vendor | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: VendorDetailPage,
})

// ============================================================================
// Types — the API payloads, verbatim
// ============================================================================

export interface AdminVendor {
  id: string
  name: string
  status: VendorStatus
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminVendorContact {
  id: string
  vendorId: string
  name: string
  phone: string | null
  email: string | null
  contactRole: string | null
  isPrimary: boolean
}

export interface AdminVendorCapability {
  id: string
  vendorId: string
  kind: VendorCapabilityKind
  maxWidthInches: number | null
  maxHeightInches: number | null
  finishes: string[] | null
  statedTurnaroundDays: number | null
  notes: string | null
}

export interface AdminVendorRate {
  id: string
  vendorId: string
  kind: VendorCapabilityKind
  finish: string | null
  longestEdgeMinInches: number
  longestEdgeMaxInches: number
  /** decimal(10,2) INR as a string. Never paise. */
  amount: string
  effectiveFrom: string
  effectiveTo: string | null
}

/** The 422 body from POST/PATCH /rates. `conflict` is the row to point at. */
interface RateConflict {
  message: string
  conflictId: string | null
}

// ============================================================================
// Shared bits
// ============================================================================

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
    // Without this every request is a 401 — the session cookie is the only
    // thing requireAdmin reads.
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const error = new Error(
      (body.error as string | undefined) ?? `Request failed (${response.status})`
    ) as Error & { status: number; body: Record<string, unknown> }
    error.status = response.status
    error.body = body
    throw error
  }
  return body as T
}

/**
 * A destructive control that asks first, inline.
 *
 * The pattern is `ReviewMediaStrip`'s, and the reason is the one documented
 * there: a native browser dialog blocks the automation harness, so a path
 * guarded by one can never be covered end to end. No file under
 * `routes/admin/vendors/` opens one — the audit grep over this directory is
 * expected to return nothing at all, prose included.
 */
export function InlineConfirm({
  label,
  question,
  onConfirm,
  busy = false,
  testId,
}: {
  label: string
  question: string
  onConfirm: () => void | Promise<void>
  busy?: boolean
  testId: string
}) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={() => setArmed(true)}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
        {label}
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{question}</span>
      <button
        type="button"
        data-testid={`${testId}-confirm`}
        disabled={busy}
        onClick={async () => {
          await onConfirm()
          setArmed(false)
        }}
        className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? 'Working…' : 'Confirm'}
      </button>
      <button
        type="button"
        data-testid={`${testId}-cancel`}
        disabled={busy}
        onClick={() => setArmed(false)}
        className="rounded px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function ErrorNote({ message, testId }: { message: string; testId: string }) {
  return (
    <p
      role="alert"
      data-testid={testId}
      className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
    >
      {message}
    </p>
  )
}

const field =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground'

/** ISO instant → something an admin reads. Never a bare timestamp. */
function whenLabel(iso: string | null, fallback: string): string {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

/** `datetime-local` value ("YYYY-MM-DDTHH:mm") → an ISO instant, or undefined. */
function localInputToIso(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

// ============================================================================
// Contacts
// ============================================================================

const EMPTY_CONTACT = {
  name: '',
  phone: '',
  email: '',
  contactRole: '',
  isPrimary: false,
}

function ContactsSection({
  vendorId,
  contacts,
  onChanged,
}: {
  vendorId: string
  contacts: AdminVendorContact[]
  onChanged: () => Promise<void>
}) {
  const [draft, setDraft] = useState(EMPTY_CONTACT)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const add = async (event: FormEvent) => {
    event.preventDefault()
    setIsAdding(true)
    try {
      await callApi(`/api/admin/vendors/${vendorId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          phone: draft.phone.trim() || null,
          email: draft.email.trim() || null,
          contactRole: draft.contactRole.trim() || null,
          isPrimary: draft.isPrimary,
        }),
      })
      setDraft(EMPTY_CONTACT)
      setError(null)
      await onChanged()
    } catch (addError) {
      setError((addError as Error).message)
    } finally {
      setIsAdding(false)
    }
  }

  const remove = async (contactId: string) => {
    setBusyId(contactId)
    try {
      await callApi(`/api/admin/vendors/${vendorId}/contacts/${contactId}`, {
        method: 'DELETE',
      })
      setError(null)
      await onChanged()
    } catch (deleteError) {
      setError((deleteError as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Section
      title="Contacts"
      description="A shop has an owner, a production lead and a WhatsApp number, and they are rarely the same person."
    >
      {error && <ErrorNote message={error} testId="vendor-contacts-error" />}

      {contacts.length === 0 ? (
        <p
          data-testid="vendor-contacts-empty"
          className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
        >
          No contacts recorded yet.
        </p>
      ) : (
        <ul data-testid="vendor-contacts-list" className="divide-y divide-border">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              data-testid={`vendor-contact-${contact.id}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{contact.name}</span>
                {contact.isPrimary && (
                  <span className="ml-2 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
                    Primary
                  </span>
                )}
                <div className="text-muted-foreground">
                  {[contact.contactRole, contact.phone, contact.email]
                    .filter(Boolean)
                    .join(' · ') || 'No details recorded'}
                </div>
              </div>
              <InlineConfirm
                label="Remove"
                question={`Remove ${contact.name}?`}
                busy={busyId === contact.id}
                onConfirm={() => remove(contact.id)}
                testId={`vendor-contact-remove-${contact.id}`}
              />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-2 sm:grid-cols-4">
        <input
          required
          placeholder="Name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={field}
          data-testid="vendor-contact-name"
        />
        <input
          placeholder="Role"
          value={draft.contactRole}
          onChange={(e) => setDraft({ ...draft, contactRole: e.target.value })}
          className={field}
        />
        <input
          placeholder="Phone"
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          className={field}
        />
        <input
          type="email"
          placeholder="Email"
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          className={field}
        />
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input
            type="checkbox"
            checked={draft.isPrimary}
            onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })}
          />
          Primary contact
        </label>
        <Button type="submit" disabled={isAdding} data-testid="vendor-contact-add">
          <Plus className="mr-2 h-4 w-4" />
          {isAdding ? 'Adding…' : 'Add contact'}
        </Button>
      </form>
    </Section>
  )
}

// ============================================================================
// Capabilities
// ============================================================================

const EMPTY_CAPABILITY = {
  kind: 'print' as VendorCapabilityKind,
  maxWidthInches: '',
  maxHeightInches: '',
  finishes: '',
  statedTurnaroundDays: '',
  notes: '',
}

const numberOrNull = (value: string) => {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function CapabilitiesSection({
  vendorId,
  capabilities,
  onChanged,
}: {
  vendorId: string
  capabilities: AdminVendorCapability[]
  onChanged: () => Promise<void>
}) {
  const [draft, setDraft] = useState(EMPTY_CAPABILITY)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const add = async (event: FormEvent) => {
    event.preventDefault()
    setIsAdding(true)
    try {
      await callApi(`/api/admin/vendors/${vendorId}/capabilities`, {
        method: 'POST',
        body: JSON.stringify({
          kind: draft.kind,
          maxWidthInches: numberOrNull(draft.maxWidthInches),
          maxHeightInches: numberOrNull(draft.maxHeightInches),
          finishes: draft.finishes
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          statedTurnaroundDays: numberOrNull(draft.statedTurnaroundDays),
          notes: draft.notes.trim() || null,
        }),
      })
      setDraft(EMPTY_CAPABILITY)
      setError(null)
      await onChanged()
    } catch (addError) {
      setError((addError as Error).message)
    } finally {
      setIsAdding(false)
    }
  }

  const remove = async (capId: string) => {
    setBusyId(capId)
    try {
      await callApi(`/api/admin/vendors/${vendorId}/capabilities/${capId}`, {
        method: 'DELETE',
      })
      setError(null)
      await onChanged()
    } catch (deleteError) {
      setError((deleteError as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Section
      title="Capabilities"
      description="What this vendor can actually make. The size limits are what the assignment screen matches a job against."
    >
      {error && <ErrorNote message={error} testId="vendor-capabilities-error" />}

      {capabilities.length === 0 ? (
        <p
          data-testid="vendor-capabilities-empty"
          className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
        >
          No capabilities recorded — this vendor will not match any job.
        </p>
      ) : (
        <ul
          data-testid="vendor-capabilities-list"
          className="divide-y divide-border"
        >
          {capabilities.map((cap) => (
            <li
              key={cap.id}
              data-testid={`vendor-capability-${cap.id}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <span className="font-medium capitalize">{cap.kind}</span>
                <div className="text-muted-foreground">
                  {cap.maxWidthInches && cap.maxHeightInches
                    ? `Up to ${cap.maxWidthInches}×${cap.maxHeightInches}″`
                    : 'No size limit recorded'}
                  {cap.finishes && cap.finishes.length > 0
                    ? ` · ${cap.finishes.join(', ')}`
                    : ''}
                  {cap.statedTurnaroundDays
                    ? ` · ${cap.statedTurnaroundDays} day turnaround`
                    : ''}
                </div>
              </div>
              <InlineConfirm
                label="Remove"
                question={`Remove this ${cap.kind} capability?`}
                busy={busyId === cap.id}
                onConfirm={() => remove(cap.id)}
                testId={`vendor-capability-remove-${cap.id}`}
              />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-2 sm:grid-cols-4">
        <select
          value={draft.kind}
          onChange={(e) =>
            setDraft({ ...draft, kind: e.target.value as VendorCapabilityKind })
          }
          className={field}
          data-testid="vendor-capability-kind"
          aria-label="Capability kind"
        >
          {VENDOR_CAPABILITY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind === 'print' ? 'Print' : 'Frame'}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          placeholder="Max width (in)"
          value={draft.maxWidthInches}
          onChange={(e) => setDraft({ ...draft, maxWidthInches: e.target.value })}
          className={field}
          aria-label="Max width in inches"
        />
        <input
          type="number"
          min={1}
          placeholder="Max height (in)"
          value={draft.maxHeightInches}
          onChange={(e) => setDraft({ ...draft, maxHeightInches: e.target.value })}
          className={field}
          aria-label="Max height in inches"
        />
        <input
          type="number"
          min={1}
          placeholder="Turnaround (days)"
          value={draft.statedTurnaroundDays}
          onChange={(e) =>
            setDraft({ ...draft, statedTurnaroundDays: e.target.value })
          }
          className={field}
          aria-label="Stated turnaround in days"
        />
        <input
          placeholder="Finishes, comma separated"
          value={draft.finishes}
          onChange={(e) => setDraft({ ...draft, finishes: e.target.value })}
          className={cn(field, 'sm:col-span-3')}
          aria-label="Finishes"
        />
        <Button
          type="submit"
          disabled={isAdding}
          data-testid="vendor-capability-add"
        >
          <Plus className="mr-2 h-4 w-4" />
          {isAdding ? 'Adding…' : 'Add capability'}
        </Button>
      </form>
    </Section>
  )
}

// ============================================================================
// Rate card
// ============================================================================

const EMPTY_RATE = {
  kind: 'print' as VendorCapabilityKind,
  finish: '',
  longestEdgeMinInches: '',
  longestEdgeMaxInches: '',
  amount: '',
  effectiveFrom: '',
  effectiveTo: '',
}

function bandLabel(rate: AdminVendorRate): string {
  return `${rate.kind} ${rate.longestEdgeMinInches}–${rate.longestEdgeMaxInches}″${
    rate.finish ? ` (${rate.finish})` : ''
  }`
}

export function RateCardSection({
  vendorId,
  rates,
  includeExpired,
  onIncludeExpiredChange,
  onChanged,
  loadError,
  onRetry,
}: {
  vendorId: string
  rates: AdminVendorRate[]
  includeExpired: boolean
  onIncludeExpiredChange: (value: boolean) => void
  onChanged: () => Promise<void>
  loadError: string | null
  onRetry: () => void
}) {
  const [draft, setDraft] = useState(EMPTY_RATE)
  const [conflict, setConflict] = useState<RateConflict | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const add = async (event: FormEvent) => {
    event.preventDefault()
    setIsAdding(true)
    setConflict(null)
    setError(null)
    setWarnings([])
    try {
      const result = await callApi<{ warnings?: string[] }>(
        `/api/admin/vendors/${vendorId}/rates`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind: draft.kind,
            finish: draft.finish.trim() || null,
            longestEdgeMinInches: Number(draft.longestEdgeMinInches),
            longestEdgeMaxInches: Number(draft.longestEdgeMaxInches),
            amount: draft.amount.trim(),
            effectiveFrom: localInputToIso(draft.effectiveFrom),
            effectiveTo: localInputToIso(draft.effectiveTo) ?? null,
          }),
        }
      )
      setDraft(EMPTY_RATE)
      // A scheduled band that survived this write caps the new row. The API
      // says so; repeating it here is the only way the admin finds out.
      setWarnings(result.warnings ?? [])
      await onChanged()
    } catch (addError) {
      const err = addError as Error & {
        status?: number
        body?: { conflict?: { id?: string } }
      }
      if (err.status === 422 && err.body?.conflict?.id) {
        // The whole point of the 422: name the band, and point at its row.
        setConflict({ message: err.message, conflictId: err.body.conflict.id })
      } else {
        setError(err.message)
      }
    } finally {
      setIsAdding(false)
    }
  }

  const close = async (rateId: string) => {
    setBusyId(rateId)
    try {
      await callApi(`/api/admin/vendors/${vendorId}/rates/${rateId}/close`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setError(null)
      await onChanged()
    } catch (closeError) {
      setError((closeError as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Section
      title="Rate card"
      description="What we buy at, by size band. A band is inclusive of its lower edge and exclusive of its upper one."
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeExpired}
          onChange={(e) => onIncludeExpiredChange(e.target.checked)}
          data-testid="vendor-rates-include-expired"
        />
        Show closed and expired bands
      </label>

      {error && <ErrorNote message={error} testId="vendor-rates-error" />}

      {conflict && (
        <ErrorNote message={conflict.message} testId="vendor-rates-conflict" />
      )}

      {warnings.length > 0 && (
        <ul
          data-testid="vendor-rates-warnings"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {loadError ? (
        // The card failed to load. An empty rate table here would read as "this
        // vendor has no rates", which is a different and much worse claim.
        <div
          role="alert"
          data-testid="vendor-rates-load-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-center text-sm"
        >
          <AlertCircle
            className="mx-auto mb-2 h-5 w-5 text-destructive"
            aria-hidden="true"
          />
          <p className="mb-3">{loadError}</p>
          <p className="mb-4 text-muted-foreground">
            The rate card was not read. This is not the same as the vendor having
            no rates.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onRetry}
            data-testid="vendor-rates-retry"
          >
            Try again
          </Button>
        </div>
      ) : rates.length === 0 ? (
        <p
          data-testid="vendor-rates-empty"
          className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
        >
          No rate bands yet. A job cannot be costed against this vendor until
          there is one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" data-testid="vendor-rates-table">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Band</th>
                <th className="px-3 py-2 font-medium">Finish</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Effective from</th>
                <th className="px-3 py-2 font-medium">Until</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => {
                const isConflicting = conflict?.conflictId === rate.id
                const amount = formatRupees(rate.amount)
                const closed =
                  rate.effectiveTo !== null &&
                  new Date(rate.effectiveTo).getTime() <= Date.now()

                return (
                  <tr
                    key={rate.id}
                    data-testid={`vendor-rate-row-${rate.id}`}
                    data-conflicting={isConflicting ? 'true' : undefined}
                    className={cn(
                      'border-b border-border last:border-0',
                      closed && 'opacity-60',
                      isConflicting && 'bg-destructive/10'
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="capitalize">{rate.kind}</span>{' '}
                      {rate.longestEdgeMinInches}–{rate.longestEdgeMaxInches}″
                      {closed && (
                        <div className="text-xs text-muted-foreground">Closed</div>
                      )}
                      {isConflicting && (
                        <div
                          data-testid={`vendor-rate-conflict-${rate.id}`}
                          className="mt-1 text-xs font-medium text-destructive"
                        >
                          This is the band you collided with: {bandLabel(rate)},
                          effective {whenLabel(rate.effectiveFrom, 'unknown')}.
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{rate.finish ?? 'Any'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {/* Never a fallback zero — an unreadable amount says so. */}
                      {amount ?? (
                        <span className="text-destructive">Unavailable</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {whenLabel(rate.effectiveFrom, 'unknown')}
                    </td>
                    <td className="px-3 py-2">
                      {whenLabel(rate.effectiveTo, 'Open-ended')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!closed && (
                        <InlineConfirm
                          label="Close"
                          question="End this band now?"
                          busy={busyId === rate.id}
                          onConfirm={() => close(rate.id)}
                          testId={`vendor-rate-close-${rate.id}`}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add a band. `effectiveFrom` is a plain field beside the amount — a
          rate card without dates is a rate card that cannot record a rise. */}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Kind
          <select
            value={draft.kind}
            onChange={(e) =>
              setDraft({ ...draft, kind: e.target.value as VendorCapabilityKind })
            }
            className={field}
            data-testid="vendor-rate-kind"
          >
            {VENDOR_CAPABILITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === 'print' ? 'Print' : 'Frame'}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Finish (blank = any)
          <input
            value={draft.finish}
            onChange={(e) => setDraft({ ...draft, finish: e.target.value })}
            className={field}
            data-testid="vendor-rate-finish"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Amount (₹, rupees)
          <input
            required
            inputMode="decimal"
            placeholder="450.00"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            className={field}
            data-testid="vendor-rate-amount"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Longest edge from (in)
          <input
            required
            type="number"
            min={0}
            value={draft.longestEdgeMinInches}
            onChange={(e) =>
              setDraft({ ...draft, longestEdgeMinInches: e.target.value })
            }
            className={field}
            data-testid="vendor-rate-min"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Longest edge below (in)
          <input
            required
            type="number"
            min={1}
            value={draft.longestEdgeMaxInches}
            onChange={(e) =>
              setDraft({ ...draft, longestEdgeMaxInches: e.target.value })
            }
            className={field}
            data-testid="vendor-rate-max"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Effective from (blank = now)
          <input
            type="datetime-local"
            value={draft.effectiveFrom}
            onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })}
            className={field}
            data-testid="vendor-rate-effective-from"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Effective until (blank = open-ended)
          <input
            type="datetime-local"
            value={draft.effectiveTo}
            onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value })}
            className={field}
            data-testid="vendor-rate-effective-to"
          />
        </label>

        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={isAdding} data-testid="vendor-rate-add">
            <Plus className="mr-2 h-4 w-4" />
            {isAdding ? 'Saving…' : 'Add rate band'}
          </Button>
        </div>
      </form>
    </Section>
  )
}

// ============================================================================
// Page
// ============================================================================

interface VendorDetailPayload {
  vendor: AdminVendor
  contacts: AdminVendorContact[]
  capabilities: AdminVendorCapability[]
}

function toFormValues(vendor: AdminVendor): VendorFormValues {
  return {
    name: vendor.name,
    status: vendor.status,
    addressLine1: vendor.addressLine1 ?? '',
    addressLine2: vendor.addressLine2 ?? '',
    city: vendor.city ?? '',
    state: vendor.state ?? '',
    postalCode: vendor.postalCode ?? '',
    country: vendor.country ?? '',
    notes: vendor.notes ?? '',
  }
}

function DetailSkeleton() {
  return (
    <div data-testid="vendor-detail-skeleton" className="space-y-4" aria-busy="true">
      {['a', 'b', 'c'].map((key) => (
        <div
          key={key}
          className="h-40 animate-pulse rounded-lg bg-muted"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

function VendorDetailPage() {
  const { id } = Route.useParams()

  const [detail, setDetail] = useState<VendorDetailPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [tab, setTab] = useState<'details' | 'payables'>('details')

  const [rates, setRates] = useState<AdminVendorRate[]>([])
  const [ratesError, setRatesError] = useState<string | null>(null)
  const [includeExpired, setIncludeExpired] = useState(false)

  const loadDetail = useCallback(async () => {
    setIsLoading(true)
    try {
      const body = await callApi<VendorDetailPayload>(`/api/admin/vendors/${id}`)
      setDetail(body)
      setError(null)
    } catch (loadError) {
      // Dropped, not kept: a stale vendor card under a failure banner is a
      // number the admin will believe.
      setDetail(null)
      setError((loadError as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  const loadRates = useCallback(async () => {
    try {
      const body = await callApi<{ rates: AdminVendorRate[] }>(
        `/api/admin/vendors/${id}/rates?includeExpired=${includeExpired ? 'true' : 'false'}`
      )
      setRates(body.rates)
      setRatesError(null)
    } catch (loadError) {
      setRates([])
      setRatesError((loadError as Error).message)
    }
  }, [id, includeExpired])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    void loadRates()
  }, [loadRates])

  const save = async (payload: ReturnType<typeof vendorPayload>) => {
    setIsSaving(true)
    try {
      await callApi(`/api/admin/vendors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setSaveError(null)
      await loadDetail()
    } catch (patchError) {
      setSaveError((patchError as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/vendors"
          search={ADMIN_VENDORS_SEARCH}
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Vendors
        </Link>
        <h1 className="text-2xl font-medium">
          {detail?.vendor.name ?? 'Vendor'}
        </h1>
      </div>

      {error ? (
        <div
          role="alert"
          data-testid="vendor-detail-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
        >
          <AlertCircle
            className="mx-auto mb-3 h-6 w-6 text-destructive"
            aria-hidden="true"
          />
          <p className="mb-1 font-medium">{error}</p>
          <p className="mb-6 text-sm text-muted-foreground">
            Nothing about this vendor is shown, because nothing was read.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadDetail()}
            data-testid="vendor-detail-retry"
          >
            Try again
          </Button>
        </div>
      ) : isLoading || !detail ? (
        <DetailSkeleton />
      ) : (
        <>
          {/* Two tabs, not two routes: payables is a view of this vendor, and
              splitting it into a child route would make `$id` a layout that
              every one of these sections then hangs off an Outlet from. */}
          <nav
            data-testid="vendor-detail-tabs"
            className="flex gap-1 border-b border-border"
            aria-label="Vendor sections"
          >
            {(['details', 'payables'] as const).map((name) => (
              <button
                key={name}
                type="button"
                aria-current={tab === name ? 'page' : undefined}
                data-testid={`vendor-tab-${name}`}
                onClick={() => setTab(name)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize',
                  tab === name
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {name}
              </button>
            ))}
          </nav>

          {tab === 'payables' && <VendorPayablesSection vendorId={id} />}

          {tab === 'details' && (
        <>
          <Section
            title="Details"
            description="Who they are and whether they may be assigned work."
          >
            <VendorForm
              key={detail.vendor.updatedAt}
              initial={toFormValues(detail.vendor)}
              onSubmit={save}
              submitLabel="Save changes"
              submitError={saveError}
              isSaving={isSaving}
            />
          </Section>

          <ContactsSection
            vendorId={id}
            contacts={detail.contacts}
            onChanged={loadDetail}
          />

          <CapabilitiesSection
            vendorId={id}
            capabilities={detail.capabilities}
            onChanged={loadDetail}
          />

          <RateCardSection
            vendorId={id}
            rates={rates}
            includeExpired={includeExpired}
            onIncludeExpiredChange={setIncludeExpired}
            onChanged={loadRates}
            loadError={ratesError}
            onRetry={() => void loadRates()}
          />
        </>
          )}
        </>
      )}
    </div>
  )
}
