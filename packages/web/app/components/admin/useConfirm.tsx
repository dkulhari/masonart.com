/**
 * `useConfirmDialog` — the promise-shaped replacement for `window.confirm` and
 * `window.prompt` on admin screens (#625).
 *
 * ## Why a hook that hands back a node, and not a provider
 *
 * The obvious design is `<ConfirmProvider>` in the admin layout plus a
 * context-reading `useConfirm()`. It was rejected: every admin route test in
 * this repo renders its screen component directly, never the layout, so a
 * context-required hook turns each of those into a render-time throw and makes
 * every future screen test carry a wrapper it has no other reason to know
 * about. A hook that owns its own state and returns the dialog to render keeps
 * each screen self-contained — the thing that broke here was global native
 * dialogs, so the fix should not introduce a global of its own.
 *
 * ## The call site
 *
 * ```tsx
 * const { confirmAction, dialog } = useConfirmDialog()
 * ...
 * if (!(await confirmAction({ title: 'Cancel order?', destructive: true }))) return
 * ...
 * return <>{dialog}...</>
 * ```
 *
 * `confirmAction` answers yes/no. `promptForValues` is the same dialog with
 * fields, resolving the collected values or `null` — that is what the two
 * `prompt()` calls on the orders screen became.
 *
 * Nothing here is named `confirm` or `prompt`: the source guard in
 * `tests/routes/admin/admin-native-dialogs.test.tsx` matches those names with a
 * word-boundary lookbehind that a property access would slip past, and a helper
 * called `confirm(` would make the guard's own callers look like offenders.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ConfirmDialog,
  type ConfirmDialogRequest,
  type ConfirmDialogResult,
} from '~/components/admin/ConfirmDialog'

export type ConfirmRequest = Omit<ConfirmDialogRequest, 'fields'>
export type PromptRequest = ConfirmDialogRequest & {
  fields: NonNullable<ConfirmDialogRequest['fields']>
}

interface Pending {
  request: ConfirmDialogRequest
  resolve: (result: ConfirmDialogResult) => void
}

export interface ConfirmDialogHandle {
  /** Yes/no. Resolves false on cancel, Escape, backdrop — every dismissal. */
  confirmAction: (request: ConfirmRequest) => Promise<boolean>
  /** Collects field values. Resolves null on any dismissal. */
  promptForValues: (request: PromptRequest) => Promise<Record<string, string> | null>
  /** Render this in the screen's tree. Null when no dialog is open. */
  dialog: ReactNode
}

export function useConfirmDialog(): ConfirmDialogHandle {
  const [pending, setPending] = useState<Pending | null>(null)

  /*
   * A dialog whose promise never settles hangs the caller's `await` forever —
   * a silently dead Delete button. If a second request arrives while one is
   * open (a double-click, a keyboard repeat), the first is resolved as
   * dismissed rather than dropped on the floor.
   */
  const pendingRef = useRef<Pending | null>(null)

  const open = useCallback(
    (request: ConfirmDialogRequest) =>
      new Promise<ConfirmDialogResult>((resolve) => {
        pendingRef.current?.resolve(null)
        const next = { request, resolve }
        pendingRef.current = next
        setPending(next)
      }),
    []
  )

  const settle = useCallback((result: ConfirmDialogResult) => {
    const current = pendingRef.current
    pendingRef.current = null
    setPending(null)
    current?.resolve(result)
  }, [])

  const confirmAction = useCallback(
    (request: ConfirmRequest) => open(request).then((result) => result !== null),
    [open]
  )

  const promptForValues = useCallback(
    (request: PromptRequest) => open(request),
    [open]
  )

  const dialog = useMemo(
    () =>
      pending ? (
        <ConfirmDialog key={pending.request.title} request={pending.request} onResolve={settle} />
      ) : null,
    [pending, settle]
  )

  return { confirmAction, promptForValues, dialog }
}
