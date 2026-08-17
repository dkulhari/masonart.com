/**
 * The admin confirmation dialog — the one modal that replaced sixteen native
 * ones (#625).
 *
 * ## Why this exists at all
 *
 * Nine admin screens called `window.confirm` / `window.prompt` for their
 * destructive actions. A native dialog blocks the page's event loop, so the
 * browser automation harness freezes the moment a run clicks Delete, Cancel or
 * Refund — every destructive admin flow was untestable end-to-end. `reviews.tsx`
 * carried a comment about exactly that hazard and then called `confirm()` three
 * times anyway, which is how a rule written in prose loses to a rule written as
 * a failing test (see `tests/routes/admin/admin-native-dialogs.test.tsx`).
 *
 * ## Why one component and not nine inline ones
 *
 * Focus trapping, focus restoration, Escape, backdrop, scroll lock and
 * `aria-modal` are each easy to get subtly wrong. Nine copies means nine
 * chances. This is the single place they are got right.
 *
 * ## The two shapes
 *
 * A confirmation answers yes/no. The two `prompt()` call sites needed a value
 * back, so the same dialog takes `fields` and resolves the collected values.
 * That is deliberately not a second component: the chrome, the focus behaviour
 * and the dismissal semantics are identical, and only the body differs.
 *
 * Resolution is uniform: the values object on submit, `null` on every kind of
 * dismissal. `useConfirm` narrows that to a boolean for the yes/no callers.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '~/lib/utils'

export interface ConfirmDialogField {
  /** Key this field's value lands under in the resolved object. */
  name: string
  label: string
  type: 'select' | 'textarea' | 'text'
  /** Required for `select`; ignored otherwise. */
  options?: Array<{ value: string; label: string }>
  required?: boolean
  placeholder?: string
  defaultValue?: string
}

export interface ConfirmDialogRequest {
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for actions that destroy or cannot be undone. */
  destructive?: boolean
  fields?: ConfirmDialogField[]
}

export type ConfirmDialogResult = Record<string, string> | null

interface ConfirmDialogProps {
  request: ConfirmDialogRequest
  /** Called exactly once: the field values on submit, `null` on dismissal. */
  onResolve: (result: ConfirmDialogResult) => void
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ConfirmDialog({ request, onResolve }: ConfirmDialogProps) {
  const titleId = useId()
  const bodyId = useId()
  const fieldIdPrefix = useId()

  const panelRef = useRef<HTMLDivElement>(null)
  /*
   * Captured on mount rather than read on unmount: by the time the dialog is
   * closing, the element that opened it is no longer the active one, and an
   * admin who cancels a delete belongs back on the Delete button they came
   * from, not at the top of the document.
   */
  const openerRef = useRef<Element | null>(null)

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (request.fields ?? []).map((field) => [
        field.name,
        field.defaultValue ?? (field.type === 'select' ? (field.options?.[0]?.value ?? '') : ''),
      ])
    )
  )
  const [missing, setMissing] = useState<string | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement

    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    firstFocusable?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = overflow
      const opener = openerRef.current
      if (opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus()
      }
    }
  }, [])

  const dismiss = useCallback(() => onResolve(null), [onResolve])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      dismiss()
      return
    }

    if (event.key !== 'Tab') return

    /*
     * The trap. Without it, Tab walks out of the modal and onto the page
     * behind it, which is still rendered and still clickable to a screen
     * reader — the thing `aria-modal` claims is not true.
     */
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    const unfilled = (request.fields ?? []).find(
      (field) => field.required && !values[field.name]?.trim()
    )

    if (unfilled) {
      // Inline, not a second dialog — the whole point of this component.
      setMissing(`${unfilled.label} is required.`)
      return
    }

    onResolve(values)
  }

  const confirmLabel = request.confirmLabel ?? 'Confirm'
  const cancelLabel = request.cancelLabel ?? 'Cancel'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        data-testid="confirm-dialog-backdrop"
        aria-hidden="true"
        onClick={dismiss}
        className="absolute inset-0 bg-black/50"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={request.body ? bodyId : undefined}
        onKeyDown={handleKeyDown}
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          {request.title}
        </h2>

        {request.body && (
          <div id={bodyId} className="mt-2 text-sm text-muted-foreground">
            {request.body}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {(request.fields ?? []).map((field) => {
            const fieldId = `${fieldIdPrefix}-${field.name}`
            const shared = {
              id: fieldId,
              value: values[field.name] ?? '',
              onChange: (
                event: React.ChangeEvent<
                  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
                >
              ) => {
                setMissing(null)
                setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
              },
              className:
                'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            }

            return (
              <div key={field.name} className="mt-4">
                <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
                  {field.label}
                </label>

                {field.type === 'select' && (
                  <select {...shared}>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}

                {field.type === 'textarea' && (
                  <textarea {...shared} rows={3} placeholder={field.placeholder} />
                )}

                {field.type === 'text' && (
                  <input {...shared} type="text" placeholder={field.placeholder} />
                )}
              </div>
            )
          })}

          {missing && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {missing}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className={cn(
                'h-10 rounded-lg px-4 text-sm font-medium text-white transition-colors',
                request.destructive
                  ? 'bg-destructive hover:bg-destructive/90'
                  : 'bg-brand-600 hover:bg-brand-700'
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
