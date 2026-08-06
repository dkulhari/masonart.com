/**
 * Admin — author a sale promotion.
 *
 * One route for both jobs: `/admin/promotions/new` starts empty, any other id
 * loads that row. There is no `GET /:id` in #431 — the table is tiny and the
 * list already returns every column plus both membership sets — so editing
 * fetches the list and picks the row out of it.
 *
 * ## The rules come from `@chobii/shared`, not from here
 *
 * `createPromotionInputSchema` is what the API validates with. This form checks
 * the payload against that same schema before sending it, so the error the
 * admin sees is the error the server would have given. A hand-written copy of
 * "a percentage cannot exceed 100" drifts the first time the shared rule moves,
 * and the drift surfaces as a 400 nobody can explain.
 *
 * ## Both membership sets are loaded, and both are replaced
 *
 * PATCH clears and re-inserts the pinned and excluded sets wholesale. A form
 * that loads without them posts two empty arrays and quietly un-excludes every
 * product the admin took out of the sale.
 *
 * ## The countdown carries its own explanation
 *
 * §6 of the design is deliberate about what `rolling` is: a per-visitor timer
 * that re-mints, not a deadline. Whoever switches it on should read that in the
 * form, next to the control, rather than in a spec.
 */

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { ArrowLeft, X } from 'lucide-react'
import {
  createPromotionInputSchema,
  FACET_GROUPS,
  type FacetOption,
} from '@chobii/shared'
import { cn, getApiUrl } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import type { AdminPromotion } from './index'

export const Route = createFileRoute('/admin/promotions/$id')({
  head: () => ({
    meta: [
      { title: 'Promotion | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: PromotionEditorPage,
})

// ============================================================================
// Form values
// ============================================================================

export interface PromotionFormValues {
  name: string
  headline: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  scopeType: 'all' | 'filter' | 'products'
  scopeFilter: Record<string, unknown>
  productIds: string[]
  excludedProductIds: string[]
  membersOnly: boolean
  /** `datetime-local` shape — local wall clock, no zone. */
  startsAt: string
  /** Empty means open-ended. */
  endsAt: string
  isEnabled: boolean
  priority: number
  /** Null means unlimited. */
  perCustomerOrderLimit: number | null
  countdownMode: 'real' | 'rolling'
  rollingWindowMinutes: number
  rollingJitterMinutes: number
}

export const EMPTY_PROMOTION: PromotionFormValues = {
  name: '',
  headline: '',
  discountType: 'percentage',
  discountValue: 20,
  scopeType: 'all',
  scopeFilter: {},
  productIds: [],
  excludedProductIds: [],
  membersOnly: true,
  startsAt: '',
  endsAt: '',
  // Starts off. A promotion should be authored, read back, and then switched
  // on — not go live the instant somebody hits save.
  isEnabled: false,
  priority: 0,
  perCustomerOrderLimit: null,
  countdownMode: 'rolling',
  rollingWindowMinutes: 720,
  rollingJitterMinutes: 90,
}

/**
 * The only three filter axes the promotion scope accepts.
 *
 * `promotionScopeFilterSchema` is `.strict()`, so rendering the whole facet
 * vocabulary here would let an admin build a filter the API refuses. Derived
 * from `FACET_GROUPS` rather than hardcoded so the option lists cannot drift
 * from the storefront's.
 */
const PROMOTION_FILTER_AXES = ['styles', 'subjects', 'rooms'] as const

const PROMOTION_FACET_GROUPS = FACET_GROUPS.filter((group) =>
  (PROMOTION_FILTER_AXES as readonly string[]).includes(group.key)
)

// ============================================================================
// Datetime plumbing
// ============================================================================

/** An instant as `datetime-local` wants it: local wall clock, minute precision. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Back to an instant. Empty in, empty out — `new Date('').toISOString()`
 * throws, and an unset date has to reach the schema as a missing value rather
 * than as an exception thrown while building the payload.
 */
export function toIsoInstant(local: string): string {
  if (!local) return ''
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

// ============================================================================
// Mapping
// ============================================================================

export function fromAdminPromotion(
  promotion: AdminPromotion
): PromotionFormValues {
  return {
    name: promotion.name,
    headline: promotion.headline,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    scopeType: promotion.scopeType,
    scopeFilter: promotion.scopeFilter ?? {},
    // Both sets, because save replaces both.
    productIds: promotion.productIds ?? [],
    excludedProductIds: promotion.excludedProductIds ?? [],
    membersOnly: promotion.membersOnly,
    startsAt: toLocalInput(promotion.startsAt),
    endsAt: toLocalInput(promotion.endsAt),
    isEnabled: promotion.isEnabled,
    priority: promotion.priority,
    perCustomerOrderLimit: promotion.perCustomerOrderLimit,
    countdownMode: promotion.countdownMode,
    rollingWindowMinutes: promotion.rollingWindowMinutes,
    rollingJitterMinutes: promotion.rollingJitterMinutes,
  }
}

export function toPromotionPayload(values: PromotionFormValues) {
  /**
   * An empty object is not a filter. Sending `{}` would satisfy the API's
   * "filter scope needs a filter" check and then discount the whole catalogue,
   * which is what scope `all` is for.
   */
  const scopeFilter =
    values.scopeType === 'filter' &&
    Object.keys(values.scopeFilter).length > 0
      ? values.scopeFilter
      : undefined

  const endsAt = toIsoInstant(values.endsAt)

  return {
    name: values.name.trim(),
    headline: values.headline.trim(),
    discountType: values.discountType,
    discountValue: values.discountValue,
    scopeType: values.scopeType,
    ...(scopeFilter ? { scopeFilter } : {}),
    // Dropped unless the scope is what they are for — otherwise switching a
    // promotion to sitewide leaves pinned rows behind that mean nothing.
    productIds: values.scopeType === 'products' ? values.productIds : [],
    // Kept at every scope. Excluding the new arrivals from a sitewide sale is
    // the main reason exclusions exist.
    excludedProductIds: values.excludedProductIds,
    membersOnly: values.membersOnly,
    startsAt: toIsoInstant(values.startsAt),
    ...(endsAt ? { endsAt } : {}),
    isEnabled: values.isEnabled,
    priority: values.priority,
    ...(values.perCustomerOrderLimit
      ? { perCustomerOrderLimit: values.perCustomerOrderLimit }
      : {}),
    countdownMode: values.countdownMode,
    rollingWindowMinutes: values.rollingWindowMinutes,
    rollingJitterMinutes: values.rollingJitterMinutes,
  }
}

export type PromotionFormErrors = Record<string, string>

/**
 * The shared schema's verdict, keyed by field.
 *
 * Nested paths (`productIds.3`) collapse onto their top-level field, which is
 * where the control lives.
 */
export function validatePromotion(
  values: PromotionFormValues
): PromotionFormErrors {
  const result = createPromotionInputSchema.safeParse(
    toPromotionPayload(values)
  )
  if (result.success) return {}

  const errors: PromotionFormErrors = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!errors[key]) errors[key] = issue.message
  }
  return errors
}

// ============================================================================
// Product picker
// ============================================================================

interface PickerProduct {
  id: string
  title: string
  sku?: string | null
}

/**
 * Search-and-add over the admin product list.
 *
 * Chosen ids are resolved to titles one request each on mount. That is chatty
 * for a large set, and deliberately so: a promotion covering hundreds of
 * products should be a `filter` scope, not a hand-picked list.
 */
function ProductPicker({
  testId,
  label,
  hint,
  ids,
  onChange,
}: {
  testId: string
  label: string
  hint: string
  ids: string[]
  onChange: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickerProduct[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [isSearching, setIsSearching] = useState(false)

  const key = ids.join(',')

  useEffect(() => {
    const unresolved = key.split(',').filter(Boolean)
    if (unresolved.length === 0) return

    let cancelled = false
    void Promise.all(
      unresolved.map(async (id) => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/admin/products/${id}`,
            { credentials: 'include' }
          )
          if (!response.ok) return null
          const body = (await response.json()) as { id?: string; title?: string }
          return body?.title ? ([id, body.title] as const) : null
        } catch {
          return null
        }
      })
    ).then((pairs) => {
      if (cancelled) return
      const resolved = Object.fromEntries(
        pairs.filter((pair): pair is readonly [string, string] => pair !== null)
      )
      if (Object.keys(resolved).length > 0) {
        setTitles((current) => ({ ...resolved, ...current }))
      }
    })

    return () => {
      cancelled = true
    }
  }, [key])

  const runSearch = useCallback(async () => {
    if (!query.trim()) return
    setIsSearching(true)
    try {
      const response = await fetch(
        `${getApiUrl()}/api/admin/products?pageSize=8&search=${encodeURIComponent(
          query.trim()
        )}`,
        { credentials: 'include' }
      )
      if (!response.ok) throw new Error('search failed')
      const body = (await response.json()) as { items?: PickerProduct[] }
      const items = body.items ?? []
      setResults(items)
      setTitles((current) => ({
        ...current,
        ...Object.fromEntries(items.map((item) => [item.id, item.title])),
      }))
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [query])

  return (
    <div
      data-testid={testId}
      className="space-y-3 rounded-lg border border-border px-4 py-3"
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <div className="flex gap-2">
        <input
          className={inputClass}
          value={query}
          aria-label={`Search products for ${label}`}
          placeholder="Title or SKU"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter inside a picker must not submit the promotion.
            if (event.key === 'Enter') {
              event.preventDefault()
              void runSearch()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => void runSearch()}>
          {isSearching ? 'Searching…' : 'Search'}
        </Button>
      </div>

      {results.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {results.map((product) => {
            const added = ids.includes(product.id)
            return (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="truncate">{product.title}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={added}
                  onClick={() => onChange([...ids, product.id])}
                >
                  {added ? 'Added' : 'Add'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {ids.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing chosen yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
            >
              <span className={cn(!titles[id] && 'font-mono')}>
                {titles[id] ?? id}
              </span>
              <button
                type="button"
                aria-label={`Remove ${titles[id] ?? id}`}
                onClick={() => onChange(ids.filter((other) => other !== id))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================================================
// The form
// ============================================================================

export interface PromotionFormProps {
  initial?: Partial<PromotionFormValues>
  /** Present when editing — the PATCH target. */
  promotionId?: string
  onSaved: (id: string) => void
}

export function PromotionForm({
  initial,
  promotionId,
  onSaved,
}: PromotionFormProps) {
  const [values, setValues] = useState<PromotionFormValues>({
    ...EMPTY_PROMOTION,
    ...initial,
  })
  const [errors, setErrors] = useState<PromotionFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const set = useCallback(
    <K extends keyof PromotionFormValues>(
      field: K,
      value: PromotionFormValues[K]
    ) => {
      setValues((current) => ({ ...current, [field]: value }))
    },
    []
  )

  const toggleFacet = useCallback((groupKey: string, optionId: string) => {
    setValues((current) => {
      const scopeFilter = { ...current.scopeFilter }
      const existing = scopeFilter[groupKey]
      const chosen = Array.isArray(existing) ? (existing as string[]) : []
      const next = chosen.includes(optionId)
        ? chosen.filter((value) => value !== optionId)
        : [...chosen, optionId]
      if (next.length) scopeFilter[groupKey] = next
      else delete scopeFilter[groupKey]
      return { ...current, scopeFilter }
    })
  }, [])

  const problems = useMemo(() => Object.values(errors), [errors])

  const save = useCallback(async () => {
    const found = validatePromotion(values)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) return

    setIsSaving(true)
    try {
      const response = await fetch(
        promotionId
          ? `${getApiUrl()}/api/admin/promotions/${promotionId}`
          : `${getApiUrl()}/api/admin/promotions`,
        {
          method: promotionId ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toPromotionPayload(values)),
        }
      )

      const body = (await response.json().catch(() => null)) as
        | { id?: string; error?: string; message?: string; unknown?: string[] }
        | null

      if (!response.ok) {
        /**
         * The unknown-id 400 names the ids it rejected. Showing the bare
         * message instead would leave the admin re-reading a list of UUIDs
         * looking for the typo.
         */
        if (body?.unknown?.length) {
          throw new Error(
            `The API does not know these product ids: ${body.unknown.join(', ')}`
          )
        }
        throw new Error(
          body?.message ?? body?.error ?? 'Failed to save the promotion'
        )
      }

      onSaved(body?.id ?? promotionId ?? '')
    } catch (saveError) {
      setServerError((saveError as Error).message)
    } finally {
      setIsSaving(false)
    }
  }, [onSaved, promotionId, values])

  return (
    <form
      className="max-w-3xl space-y-8"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {(serverError || problems.length > 0) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {serverError ? (
            serverError
          ) : (
            <ul className="list-inside list-disc space-y-1">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="space-y-4">
        <Field label="Name" hint="Internal. Shoppers never see this.">
          <input
            className={inputClass}
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>
        <FieldError message={errors.name} />

        <Field
          label="Headline"
          hint="What the strip, the banner and the badges say. There is no hardcoded copy anywhere — this is the sale's only voice."
        >
          <input
            className={inputClass}
            value={values.headline}
            onChange={(event) => set('headline', event.target.value)}
          />
        </Field>
        <FieldError message={errors.headline} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">How deep</h2>

        <Field label="Discount type">
          <select
            className={inputClass}
            value={values.discountType}
            onChange={(event) =>
              set(
                'discountType',
                event.target.value as PromotionFormValues['discountType']
              )
            }
          >
            <option value="percentage">Percentage off</option>
            <option value="fixed">Flat amount off (₹)</option>
          </select>
        </Field>

        <Field
          label="Discount value"
          hint={
            values.discountType === 'percentage'
              ? 'Whole percent, 1 to 100.'
              : 'Whole rupees off each eligible item.'
          }
        >
          <input
            className={inputClass}
            type="number"
            min={1}
            value={values.discountValue}
            onChange={(event) =>
              set('discountValue', Number(event.target.value))
            }
          />
        </Field>
        <FieldError message={errors.discountValue} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">What it applies to</h2>

        <div className="flex flex-wrap gap-4">
          {(
            [
              ['all', 'Everything in the catalogue'],
              ['filter', 'Products matching a filter'],
              ['products', 'A hand-picked list'],
            ] as const
          ).map(([scope, label]) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="scopeType"
                checked={values.scopeType === scope}
                onChange={() => set('scopeType', scope)}
              />
              {label}
            </label>
          ))}
        </div>

        {values.scopeType === 'filter' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Only style, subject and room can scope a promotion — the API
              rejects any other axis.
            </p>
            {PROMOTION_FACET_GROUPS.map((group) => (
              <fieldset key={group.key} className="space-y-2">
                <legend className="text-sm font-medium">{group.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option: FacetOption) => {
                    const chosen = values.scopeFilter[group.key]
                    const selected =
                      Array.isArray(chosen) && chosen.includes(option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleFacet(group.key, option.id)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-sm transition-colors',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:bg-muted'
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.scopeFilter.isFeatured === true}
                onChange={(event) =>
                  setValues((current) => {
                    const scopeFilter = { ...current.scopeFilter }
                    if (event.target.checked) scopeFilter.isFeatured = true
                    else delete scopeFilter.isFeatured
                    return { ...current, scopeFilter }
                  })
                }
              />
              Featured pieces only
            </label>
            <FieldError message={errors.scopeFilter} />
          </div>
        )}

        {values.scopeType === 'products' && (
          <>
            <ProductPicker
              testId="picker-productIds"
              label="Products in the sale"
              hint="Only these are discounted."
              ids={values.productIds}
              onChange={(ids) => set('productIds', ids)}
            />
            <FieldError message={errors.productIds} />
          </>
        )}

        <ProductPicker
          testId="picker-excludedProductIds"
          label="Never discount these"
          hint="Kept out whatever the scope says. This is how new arrivals and limited editions stay full price during a sitewide sale."
          ids={values.excludedProductIds}
          onChange={(ids) => set('excludedProductIds', ids)}
        />
        <FieldError message={errors.excludedProductIds} />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.membersOnly}
            onChange={(event) => set('membersOnly', event.target.checked)}
          />
          Members only
        </label>
        <p className="text-xs text-muted-foreground">
          Non-members still see the sale price, locked, with an invitation to
          join. Unticking this charges everybody the sale price.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">When</h2>

        <Field label="Starts">
          <input
            className={inputClass}
            type="datetime-local"
            value={values.startsAt}
            onChange={(event) => set('startsAt', event.target.value)}
          />
        </Field>
        <FieldError message={errors.startsAt} />

        <Field label="Ends" hint="Leave empty for a sale with no end date.">
          <input
            className={inputClass}
            type="datetime-local"
            value={values.endsAt}
            onChange={(event) => set('endsAt', event.target.value)}
          />
        </Field>
        <FieldError message={errors.endsAt} />

        <Field
          label="Priority"
          hint="Higher wins when two promotions could both apply."
        >
          <input
            className={inputClass}
            type="number"
            value={values.priority}
            onChange={(event) => set('priority', Number(event.target.value))}
          />
        </Field>
        <FieldError message={errors.priority} />

        <Field
          label="Orders per customer"
          hint="Empty means unlimited."
        >
          <input
            className={inputClass}
            type="number"
            min={1}
            value={values.perCustomerOrderLimit ?? ''}
            onChange={(event) =>
              set(
                'perCustomerOrderLimit',
                event.target.value ? Number(event.target.value) : null
              )
            }
          />
        </Field>
        <FieldError message={errors.perCustomerOrderLimit} />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isEnabled}
            onChange={(event) => set('isEnabled', event.target.checked)}
          />
          Enabled
        </label>
        <p className="text-xs text-muted-foreground">
          Enabled plus inside the window is what makes a sale live. You can also
          flip this from the list.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Countdown</h2>

        <Field
          label="Countdown mode"
          hint={
            /*
             * §6, in the form rather than in a spec. Anyone switching this on
             * should know what they are switching on.
             */
            <span className="block rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground">
              <strong>Rolling is not a deadline.</strong> Every visitor gets
              their own clock — the window below, minus a random slice of the
              jitter — kept in a cookie. When it runs out, their next page load
              mints a fresh one and the sale carries on. Nothing ends at zero.
              <br />
              <strong>Real</strong> counts down to the end date above, the same
              clock for everyone, and the sale genuinely stops there. With no
              end date there is nothing to count down to.
            </span>
          }
        >
          <select
            className={inputClass}
            value={values.countdownMode}
            onChange={(event) =>
              set(
                'countdownMode',
                event.target.value as PromotionFormValues['countdownMode']
              )
            }
          >
            <option value="rolling">Rolling — a per-visitor timer</option>
            <option value="real">Real — counts down to the end date</option>
          </select>
        </Field>

        <Field
          label="Window (minutes)"
          hint="How long a freshly minted rolling timer runs. 720 is half a day."
        >
          <input
            className={inputClass}
            type="number"
            min={1}
            disabled={values.countdownMode === 'real'}
            value={values.rollingWindowMinutes}
            onChange={(event) =>
              set('rollingWindowMinutes', Number(event.target.value))
            }
          />
        </Field>
        <FieldError message={errors.rollingWindowMinutes} />

        <Field
          label="Jitter (minutes)"
          hint="Subtracted at random so two visitors never see the same clock."
        >
          <input
            className={inputClass}
            type="number"
            min={0}
            disabled={values.countdownMode === 'real'}
            value={values.rollingJitterMinutes}
            onChange={(event) =>
              set('rollingJitterMinutes', Number(event.target.value))
            }
          />
        </Field>
        <FieldError message={errors.rollingJitterMinutes} />
      </section>

      <Button type="submit" disabled={isSaving}>
        {isSaving
          ? 'Saving…'
          : promotionId
            ? 'Save changes'
            : 'Create promotion'}
      </Button>
    </form>
  )
}

// ============================================================================
// Page
// ============================================================================

function PromotionEditorPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [initial, setInitial] = useState<PromotionFormValues | null>(
    isNew ? EMPTY_PROMOTION : null
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    let cancelled = false

    // #431 exposes no GET /:id. The list is one small query and already carries
    // both membership sets, so the row comes out of it.
    fetch(`${getApiUrl()}/api/admin/promotions`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load the promotion')
        return (await response.json()) as AdminPromotion[]
      })
      .then((rows) => {
        if (cancelled) return
        const row = rows.find((candidate) => candidate.id === id)
        if (!row) throw new Error('That promotion no longer exists')
        setInitial(fromAdminPromotion(row))
      })
      .catch((loadError) => {
        if (!cancelled) setError((loadError as Error).message)
      })

    return () => {
      cancelled = true
    }
  }, [id, isNew])

  return (
    <div className="space-y-6">
      <Link
        to="/admin/promotions"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Promotions
      </Link>

      <h1 className="text-2xl font-medium">
        {isNew ? 'New promotion' : 'Edit promotion'}
      </h1>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {error}
        </div>
      )}

      {initial ? (
        <PromotionForm
          initial={initial}
          promotionId={isNew ? undefined : id}
          onSaved={() => navigate({ to: '/admin/promotions' })}
        />
      ) : (
        !error && <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  )
}

// ============================================================================
// Field furniture
// ============================================================================

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}

/**
 * Label above, hint below — the hint reached by `aria-describedby`, never
 * nested inside the `<label>`.
 *
 * Folding it into the label makes it part of the accessible name, so the
 * countdown selector would announce as "Countdown mode Rolling is not a
 * deadline. Every visitor…" every time focus lands, and could no longer be
 * found by its actual name.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: React.ReactElement<{ id?: string; 'aria-describedby'?: string }>
}) {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {cloneElement(children, {
        id,
        ...(hint ? { 'aria-describedby': hintId } : {}),
      })}
      {hint && (
        <div id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  )
}
