/**
 * The vendor identity form — name, status, address, notes.
 *
 * Shared by `new.tsx` and the top card of `$id.tsx` so the two cannot drift in
 * which fields exist or what they are called. The same trade `FrameForm.tsx`
 * makes, for the same reason.
 *
 * The field set is `createVendorSchema` in `routes/admin/vendors.ts`, verbatim.
 * Empty optional strings are sent as `null` rather than `""`: the columns are
 * nullable, and a row full of empty strings is indistinguishable from a row
 * someone filled in with spaces.
 */

import { useState, type FormEvent } from 'react'
import { Button } from '~/components/ui/Button'
import { VENDOR_STATUSES, type VendorStatus } from './index'

export interface VendorFormValues {
  name: string
  status: VendorStatus
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  notes: string
}

export const EMPTY_VENDOR: VendorFormValues = {
  name: '',
  status: 'active',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'IN',
  notes: '',
}

/** `""` means "not recorded", and the column is nullable, so send null. */
const orNull = (value: string) => {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function vendorPayload(values: VendorFormValues) {
  return {
    name: values.name.trim(),
    status: values.status,
    addressLine1: orNull(values.addressLine1),
    addressLine2: orNull(values.addressLine2),
    city: orNull(values.city),
    state: orNull(values.state),
    postalCode: orNull(values.postalCode),
    country: orNull(values.country),
    notes: orNull(values.notes),
  }
}

const STATUS_LABELS: Record<VendorStatus, string> = {
  active: 'Active — may be assigned work',
  inactive: 'Inactive — kept on file, not assigned',
  suspended: 'Suspended — do not assign',
}

const field =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground'

export interface VendorFormProps {
  initial?: VendorFormValues
  onSubmit: (payload: ReturnType<typeof vendorPayload>) => void | Promise<void>
  submitLabel: string
  submitError?: string | null
  isSaving?: boolean
}

export function VendorForm({
  initial = EMPTY_VENDOR,
  onSubmit,
  submitLabel,
  submitError = null,
  isSaving = false,
}: VendorFormProps) {
  const [values, setValues] = useState<VendorFormValues>(initial)

  const set = <K extends keyof VendorFormValues>(
    key: K,
    value: VendorFormValues[K]
  ) => setValues((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void onSubmit(vendorPayload(values))
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="vendor-form"
      className="space-y-4 rounded-lg border border-border p-4"
    >
      {submitError && (
        <div
          role="alert"
          data-testid="vendor-form-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {submitError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Vendor name
          <input
            required
            maxLength={200}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            className={field}
            data-testid="vendor-field-name"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Status
          <select
            value={values.status}
            onChange={(e) => set('status', e.target.value as VendorStatus)}
            className={field}
            data-testid="vendor-field-status"
          >
            {VENDOR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Address line 1
          <input
            maxLength={300}
            value={values.addressLine1}
            onChange={(e) => set('addressLine1', e.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Address line 2
          <input
            maxLength={300}
            value={values.addressLine2}
            onChange={(e) => set('addressLine2', e.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          City
          <input
            maxLength={120}
            value={values.city}
            onChange={(e) => set('city', e.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          State
          <input
            maxLength={120}
            value={values.state}
            onChange={(e) => set('state', e.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Postal code
          <input
            maxLength={20}
            value={values.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Country
          {/* Two letters — the API caps the column at 2 and rejects anything
              longer, so the input says so rather than letting a 500 say it. */}
          <input
            maxLength={2}
            placeholder="IN"
            value={values.country}
            onChange={(e) => set('country', e.target.value.toUpperCase())}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Notes
          <textarea
            maxLength={2000}
            rows={3}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground"
          />
        </label>
      </div>

      <Button type="submit" disabled={isSaving} data-testid="vendor-form-submit">
        {isSaving ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
