/**
 * The frame form, behind both /admin/frames/new and /admin/frames/$id.
 *
 * ## It restates none of the bounds
 *
 * `validateFrame` runs the shared `updateFrameInputSchema` — the same schema
 * `POST /api/admin/frames` validates with. A second copy of "modifier is
 * between 1 and 5" here is how a screen and an endpoint end up disagreeing
 * about what a frame may hold, and the disagreement only ever surfaces as a
 * 400 the admin cannot explain.
 *
 * That is also why the modifier floor looks odd but is right: `frameAddition`
 * clamps anything below 1.00 to no markup, so a form accepting 0.5 would store
 * a discount the pricing formula silently discards.
 *
 * ## One image field
 *
 * The upload endpoint returns both `thumbnailUrl` and `imageUrl` from a single
 * file, because the variant ladder already contains a thumbnail and a card
 * size. A second input would be a second thing to keep in sync for no gain.
 */

import { useState } from 'react'
import type { FormEvent } from 'react'
import { updateFrameInputSchema } from '@chobii/shared'
import { getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'

export interface FrameFormValues {
  name: string
  type: string
  category: 'rolled' | 'frameless' | 'framed'
  description: string
  material: string
  color: string
  thickness: string
  priceModifier: string
  priceAddition: string
  imageUrl: string
  thumbnailUrl: string
  isActive: boolean
  sortOrder: string
}

const EMPTY: FrameFormValues = {
  name: '',
  type: '',
  category: 'framed',
  description: '',
  material: '',
  color: '',
  thickness: '',
  priceModifier: '1.00',
  priceAddition: '0.00',
  imageUrl: '',
  thumbnailUrl: '',
  isActive: true,
  sortOrder: '0',
}

const CATEGORY_OPTIONS = [
  { value: 'rolled', label: 'Rolled Canvas — shipped in a tube' },
  { value: 'frameless', label: 'Frameless — stretched, no moulding' },
  { value: 'framed', label: 'Framed — stretched and set in a moulding' },
] as const

/**
 * Per-field messages from the shared schema.
 *
 * Optional string fields are dropped when blank rather than sent as `''`,
 * which the schema would reject on `max`/format rules the admin never opted
 * into by leaving a box empty.
 */
export function validateFrame(
  input: Partial<Record<string, unknown>>
): Record<string, string> {
  const result = updateFrameInputSchema.safeParse(input)
  if (result.success) return {}

  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && !errors[field]) {
      errors[field] = issue.message
    }
  }
  return errors
}

/** Blank optional fields are omitted, not sent as empty strings. */
function toPayload(values: FrameFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: values.name,
    type: values.type,
    category: values.category,
    priceModifier: values.priceModifier,
    priceAddition: values.priceAddition,
    isActive: values.isActive,
    sortOrder: Number(values.sortOrder) || 0,
  }
  for (const key of [
    'description',
    'material',
    'color',
    'thickness',
    'imageUrl',
    'thumbnailUrl',
  ] as const) {
    if (values[key].trim()) payload[key] = values[key].trim()
  }
  return payload
}

interface FrameFormProps {
  initial?: Partial<FrameFormValues>
  submitError?: string | null
  submitLabel?: string
  isSaving?: boolean
  onSubmit: (payload: Record<string, unknown>) => void
}

export function FrameForm({
  initial,
  submitError,
  submitLabel = 'Save frame',
  isSaving = false,
  onSubmit,
}: FrameFormProps) {
  const [values, setValues] = useState<FrameFormValues>({
    ...EMPTY,
    ...initial,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const set = <K extends keyof FrameFormValues>(
    key: K,
    value: FrameFormValues[K]
  ) => setValues((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const payload = toPayload(values)
    const found = validateFrame(payload)
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit(payload)
  }

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setIsUploading(true)
    setUploadError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch(
        `${getApiUrl()}/api/admin/frames/upload-image`,
        { method: 'POST', credentials: 'include', body }
      )
      const json = (await response.json()) as {
        error?: string
        imageUrl?: string
        thumbnailUrl?: string
      }
      if (!response.ok) throw new Error(json.error ?? 'Upload failed')

      // One upload, both columns.
      setValues((current) => ({
        ...current,
        imageUrl: json.imageUrl ?? '',
        thumbnailUrl: json.thumbnailUrl ?? '',
      }))
    } catch (error) {
      setUploadError((error as Error).message)
    } finally {
      setIsUploading(false)
    }
  }

  const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
  const errorText = 'mt-1 text-xs text-destructive'

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {submitError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {submitError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium" htmlFor="frame-name">
            Name
          </label>
          <input
            id="frame-name"
            className={field}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
          {errors.name && <p className={errorText}>{errors.name}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="frame-type">
            Type
          </label>
          <input
            id="frame-type"
            className={field}
            value={values.type}
            onChange={(e) => set('type', e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            A slug: lowercase letters, digits and hyphens. Must be unique.
          </p>
          {errors.type && <p className={errorText}>{errors.type}</p>}
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="frame-category"
          >
            Category
          </label>
          <select
            id="frame-category"
            className={field}
            value={values.category}
            onChange={(e) =>
              set('category', e.target.value as FrameFormValues['category'])
            }
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Which group this appears under on the product page.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="frame-description"
          >
            Description
          </label>
          <textarea
            id="frame-description"
            className={field}
            rows={2}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="frame-material"
          >
            Material
          </label>
          <input
            id="frame-material"
            className={field}
            value={values.material}
            onChange={(e) => set('material', e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="frame-color">
            Colour
          </label>
          <input
            id="frame-color"
            className={field}
            value={values.color}
            onChange={(e) => set('color', e.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="frame-thickness"
          >
            Thickness (inches)
          </label>
          <input
            id="frame-thickness"
            className={field}
            value={values.thickness}
            onChange={(e) => set('thickness', e.target.value)}
          />
          {errors.thickness && <p className={errorText}>{errors.thickness}</p>}
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="frame-sort-order"
          >
            Sort order
          </label>
          <input
            id="frame-sort-order"
            className={field}
            value={values.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value)}
          />
          {errors.sortOrder && <p className={errorText}>{errors.sortOrder}</p>}
        </div>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-2 text-sm font-medium">Pricing</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              htmlFor="frame-price-modifier"
            >
              Price multiplier
            </label>
            <input
              id="frame-price-modifier"
              className={field}
              value={values.priceModifier}
              onChange={(e) => set('priceModifier', e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              1.40 means the piece plus 40%. A frame scales with the size of the
              print, which is why this is a proportion and not a fee.
            </p>
            {errors.priceModifier && (
              <p className={errorText}>{errors.priceModifier}</p>
            )}
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-medium"
              htmlFor="frame-price-addition"
            >
              Flat addition
            </label>
            <input
              id="frame-price-addition"
              className={field}
              value={values.priceAddition}
              onChange={(e) => set('priceAddition', e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Rupees added on top of the multiplier, the same at every size.
            </p>
            {errors.priceAddition && (
              <p className={errorText}>{errors.priceAddition}</p>
            )}
          </div>
        </div>

        {/*
          The live price preview lands here (#591). It will call the shared
          `frameAddition` and quote this frame at three sizes of print, so the
          admin sees what the customer pays rather than a multiplier they have
          to do arithmetic on.
        */}
      </fieldset>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="frame-swatch">
          Swatch image
        </label>
        <input
          id="frame-swatch"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={field}
          onChange={(e) => void handleUpload(e.target.files?.[0])}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          One upload fills both the card and thumbnail images.
        </p>
        {isUploading && (
          <p className="mt-1 text-xs text-muted-foreground">Uploading…</p>
        )}
        {uploadError && <p className={errorText}>{uploadError}</p>}
        {values.thumbnailUrl && (
          <img
            src={values.thumbnailUrl}
            alt="Current swatch"
            className="mt-2 h-16 w-16 rounded object-cover"
          />
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={(e) => set('isActive', e.target.checked)}
        />
        Available to shoppers
      </label>

      <Button type="submit" disabled={isSaving || isUploading}>
        {isSaving ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
