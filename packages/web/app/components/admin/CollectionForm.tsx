/**
 * Authoring a collection.
 *
 * One form, two modes, because a collection resolves its members two ways:
 *
 * - **Rule** — a saved filter, re-resolved on every request, so the collection
 *   follows the catalogue as it grows. This is how `Latest Work` and
 *   `Best Sellers` exist at all: their rule is a sort with no facets, which no
 *   facet id can express.
 * - **Hand-picked** — an explicit ordered list. Order is the data; it is the
 *   one thing a rule cannot say.
 *
 * ## Everything comes from the shared vocabulary
 *
 * The rule builder renders `FACET_GROUPS` from `@chobii/shared` — the same list
 * the storefront sidebar, the API validator and the seed read. A hardcoded copy
 * here would restart exactly the drift #395 ended, and would let an admin save
 * a rule the API then rejects.
 *
 * ## The count preview
 *
 * A rule that matches nothing is the failure worth catching at authoring time
 * rather than on the storefront, where it shows up as a chip that quietly
 * disappears. The preview asks the API what the current rule resolves to before
 * anything is saved.
 */

import { cloneElement, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { FACET_GROUPS, type FacetOption } from '@chobii/shared'
import { getApiUrl } from '~/lib/utils'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/Button'
import { SORT_OPTIONS } from '~/components/product/CollectionToolbar'

export interface CollectionFormValues {
  slug: string
  title: string
  subtitle: string
  description: string
  kind: 'rule' | 'manual'
  rule: Record<string, unknown>
  productIds: string[]
  imageUrl: string
  isActive: boolean
  showInDiscover: boolean
  seoTitle: string
  seoDescription: string
}

export const EMPTY_COLLECTION: CollectionFormValues = {
  slug: '',
  title: '',
  subtitle: '',
  description: '',
  kind: 'rule',
  rule: {},
  productIds: [],
  imageUrl: '',
  isActive: true,
  showInDiscover: false,
  seoTitle: '',
  seoDescription: '',
}

/**
 * Suggest a slug from the title, but never overwrite one the admin typed.
 *
 * The slug is the URL. Silently rewriting it when somebody edits the title of a
 * published collection breaks every link to it.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface CollectionFormProps {
  initial?: Partial<CollectionFormValues>
  /** Present when editing — the id the count preview and save target. */
  collectionId?: string
  onSaved: (id: string) => void
}

export function CollectionForm({
  initial,
  collectionId,
  onSaved,
}: CollectionFormProps) {
  const [values, setValues] = useState<CollectionFormValues>({
    ...EMPTY_COLLECTION,
    ...initial,
  })
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const [pendingKind, setPendingKind] = useState<'rule' | 'manual' | null>(null)

  const set = useCallback(
    <K extends keyof CollectionFormValues>(
      key: K,
      value: CollectionFormValues[K]
    ) => {
      setValues((current) => ({ ...current, [key]: value }))
    },
    []
  )

  /**
   * Live count for the current rule.
   *
   * Runs against the product list rather than the collection endpoint — the
   * collection does not exist yet when creating one, and the rule is the same
   * filter payload either way.
   */
  const ruleQuery = useMemo(() => {
    const query = new URLSearchParams({ page: '1', pageSize: '1' })
    for (const [key, value] of Object.entries(values.rule)) {
      if (Array.isArray(value)) {
        if (value.length) query.set(key, value.join(','))
      } else if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value))
      }
    }
    return query.toString()
  }, [values.rule])

  useEffect(() => {
    if (values.kind !== 'rule') {
      setPreview(null)
      return
    }
    let cancelled = false
    fetch(`${getApiUrl()}/api/products?${ruleQuery}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled) setPreview(body?.total ?? null)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [ruleQuery, values.kind])

  const toggleFacet = useCallback((groupKey: string, optionId: string) => {
    setValues((current) => {
      const rule = { ...current.rule }
      const existing = rule[groupKey]

      if (Array.isArray(existing)) {
        const next = existing.includes(optionId)
          ? existing.filter((v) => v !== optionId)
          : [...existing, optionId]
        if (next.length) rule[groupKey] = next
        else delete rule[groupKey]
      } else {
        rule[groupKey] = [optionId]
      }

      return { ...current, rule }
    })
  }, [])

  const setScalarFacet = useCallback((groupKey: string, optionId: string) => {
    setValues((current) => {
      const rule = { ...current.rule }
      if (rule[groupKey] === optionId) delete rule[groupKey]
      else rule[groupKey] = optionId
      return { ...current, rule }
    })
  }, [])

  /**
   * Switching kind discards the other side's data — but not until save.
   *
   * Warning first, and the data stays in state meanwhile, so an admin who
   * clicks the wrong radio can click back without losing a rule they spent
   * five minutes building.
   */
  const requestKind = useCallback(
    (kind: 'rule' | 'manual') => {
      if (kind === values.kind) return
      const hasRule = Object.keys(values.rule).length > 0
      const hasMembers = values.productIds.length > 0
      if ((kind === 'manual' && hasRule) || (kind === 'rule' && hasMembers)) {
        setPendingKind(kind)
        return
      }
      set('kind', kind)
    },
    [set, values.kind, values.rule, values.productIds]
  )

  const save = useCallback(async () => {
    setIsSaving(true)
    setError(null)

    const payload: Record<string, unknown> = {
      slug: values.slug || slugify(values.title),
      title: values.title,
      subtitle: values.subtitle || null,
      description: values.description || null,
      kind: values.kind,
      // The schema refuses a manual collection carrying a rule, and vice versa.
      rule: values.kind === 'rule' ? values.rule : null,
      imageUrl: values.imageUrl || null,
      isActive: values.isActive,
      showInDiscover: values.showInDiscover,
      seoTitle: values.seoTitle || null,
      seoDescription: values.seoDescription || null,
    }

    try {
      const response = await fetch(
        collectionId
          ? `${getApiUrl()}/api/admin/collections/${collectionId}`
          : `${getApiUrl()}/api/admin/collections`,
        {
          method: collectionId ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        /**
         * 409 names the slug that collided. Surfacing the generic message
         * instead would leave the admin guessing which field to change.
         */
        if (response.status === 409) {
          throw new Error(
            `The slug “${body.slug ?? values.slug}” is already taken. Pick another.`
          )
        }
        throw new Error(body.error ?? 'Failed to save the collection')
      }

      const id = body.collection?.id ?? collectionId

      // Membership is a separate endpoint — the order is its own payload.
      if (values.kind === 'manual' && id) {
        const members = await fetch(
          `${getApiUrl()}/api/admin/collections/${id}/products`,
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds: values.productIds }),
          }
        )
        if (!members.ok) throw new Error('Saved, but the product list did not')
      }

      onSaved(id)
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setIsSaving(false)
    }
  }, [collectionId, onSaved, values])

  return (
    <form
      className="max-w-3xl space-y-8"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {error}
        </div>
      )}

      <section className="space-y-4">
        <Field label="Title">
          <input
            className={inputClass}
            value={values.title}
            onChange={(event) => {
              const title = event.target.value
              setValues((current) => ({
                ...current,
                title,
                // Suggested, never imposed: once the admin edits the slug it
                // is theirs, because it is the URL.
                slug: slugTouched ? current.slug : slugify(title),
              }))
            }}
            required
          />
        </Field>

        <Field label="Slug" hint="The URL: /collections/…">
          <input
            className={inputClass}
            value={values.slug}
            onChange={(event) => {
              setSlugTouched(true)
              set('slug', event.target.value)
            }}
            required
          />
        </Field>

        <Field label="Subtitle">
          <input
            className={inputClass}
            value={values.subtitle}
            onChange={(event) => set('subtitle', event.target.value)}
          />
        </Field>

        <Field label="Description">
          <textarea
            className={cn(inputClass, 'min-h-24')}
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </Field>

        <Field
          label="Image URL"
          hint="Leave empty to borrow the artwork of a piece in the collection."
        >
          <input
            className={inputClass}
            value={values.imageUrl}
            onChange={(event) => set('imageUrl', event.target.value)}
          />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Membership</h2>

        <div className="flex gap-4">
          {(['rule', 'manual'] as const).map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="kind"
                checked={values.kind === kind}
                onChange={() => requestKind(kind)}
              />
              {kind === 'rule' ? 'Saved filter' : 'Hand-picked'}
            </label>
          ))}
        </div>

        {pendingKind && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
          >
            Switching to{' '}
            {pendingKind === 'manual' ? 'hand-picked' : 'a saved filter'} will
            discard the {pendingKind === 'manual' ? 'filter' : 'product list'}{' '}
            when you save.
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  set('kind', pendingKind)
                  setPendingKind(null)
                }}
              >
                Switch anyway
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPendingKind(null)}
              >
                Keep it
              </Button>
            </div>
          </div>
        )}

        {values.kind === 'rule' ? (
          <div className="space-y-6">
            <div className="rounded-lg border border-border px-4 py-3 text-sm">
              {/*
                A rule that matches nothing renders an empty page and its chip
                vanishes from the rail. Better found here.
              */}
              {preview === null ? (
                <span className="text-muted-foreground">Counting…</span>
              ) : preview === 0 ? (
                <span className="text-destructive">
                  This filter matches no products right now.
                </span>
              ) : (
                <span>
                  Matches <strong>{preview}</strong>{' '}
                  {preview === 1 ? 'product' : 'products'} right now.
                </span>
              )}
            </div>

            <Field label="Default sort" hint="What a shopper sees before they choose.">
              <select
                className={inputClass}
                value={`${values.rule.sortBy ?? 'createdAt'}-${values.rule.sortOrder ?? 'desc'}`}
                onChange={(event) => {
                  const [sortBy, sortOrder] = event.target.value.split('-')
                  setValues((current) => ({
                    ...current,
                    rule: { ...current.rule, sortBy, sortOrder },
                  }))
                }}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            {/*
              Straight from the shared vocabulary. A hardcoded list here would
              let an admin save a rule the API rejects.
            */}
            {FACET_GROUPS.map((group) => (
              <fieldset key={group.key} className="space-y-2">
                <legend className="text-sm font-medium">{group.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option: FacetOption) => {
                    const current = values.rule[group.key]
                    const selected = group.multi
                      ? Array.isArray(current) && current.includes(option.id)
                      : current === option.id

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          group.multi
                            ? toggleFacet(group.key, option.id)
                            : setScalarFacet(group.key, option.id)
                        }
                        aria-pressed={selected}
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
          </div>
        ) : (
          <Field
            label="Product IDs, in order"
            hint="One per line. The order here is the order shoppers see."
          >
            <textarea
              className={cn(inputClass, 'min-h-32 font-mono text-xs')}
              value={values.productIds.join('\n')}
              onChange={(event) =>
                set(
                  'productIds',
                  event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                )
              }
            />
          </Field>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Visibility</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => set('isActive', event.target.checked)}
          />
          Published
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.showInDiscover}
            onChange={(event) => set('showInDiscover', event.target.checked)}
          />
          Show in the Discover rail
        </label>
        <p className="text-xs text-muted-foreground">
          Where it sits in the rail is set on the collections list — the order
          belongs to the rail, not to any one collection.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">SEO</h2>
        <Field label="SEO title" hint="Falls back to the title.">
          <input
            className={inputClass}
            value={values.seoTitle}
            onChange={(event) => set('seoTitle', event.target.value)}
          />
        </Field>
        <Field label="SEO description" hint="Falls back to the description.">
          <textarea
            className={cn(inputClass, 'min-h-20')}
            value={values.seoDescription}
            onChange={(event) => set('seoDescription', event.target.value)}
          />
        </Field>
      </section>

      <Button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving…' : collectionId ? 'Save changes' : 'Create collection'}
      </Button>
    </form>
  )
}

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'

/**
 * Label above, hint below — but the hint is a DESCRIPTION, not part of the
 * name.
 *
 * Nesting the hint inside the `<label>` folds it into the accessible name, so
 * the Slug field announces as "Slug The URL: /collections/…". Screen-reader
 * users hear the whole sentence every time focus lands, and the field can no
 * longer be found by its actual name. `aria-describedby` is where a hint goes.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
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
        <span id={hintId} className="block text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  )
}

export default CollectionForm
