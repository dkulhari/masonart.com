/**
 * The shared admin confirmation dialog (#625).
 *
 * Nine admin screens each reached for `window.confirm` / `window.prompt`. Every
 * one of those calls blocks the page's event loop, which is why no destructive
 * admin flow could be driven end-to-end: the harness stalls on the dialog and
 * the run dies waiting for a human. `production/$id.tsx` states the rule the
 * newer screens were built to — no native dialogs — and this primitive is what
 * lets the older screens meet it without writing nine modals.
 *
 * Written once, so the parts that are easy to get wrong are got right once:
 * a promise that always settles (a dialog that resolves nothing hangs the
 * caller's `await` forever), Escape and backdrop as cancel, and focus returned
 * to whatever opened it — a keyboard admin who cancels a delete should land
 * back on the Delete button, not at the top of the document.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

import { useConfirmDialog } from '~/components/admin/useConfirm'

afterEach(cleanup)

const REQUEST = {
  title: 'Cancel order?',
  body: 'Order A-1 will be cancelled.',
  confirmLabel: 'Cancel order',
  destructive: true,
}

function Harness({ onResult }: { onResult: (value: boolean) => void }) {
  const { confirmAction, dialog } = useConfirmDialog()

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          onResult(await confirmAction(REQUEST))
        }}
      >
        trigger
      </button>
      {dialog}
    </>
  )
}

function renderHarness() {
  const results: boolean[] = []
  render(<Harness onResult={(value) => results.push(value)} />)

  const trigger = screen.getByRole('button', { name: 'trigger' })
  trigger.focus()
  fireEvent.click(trigger)

  return { results, trigger }
}

describe('ConfirmDialog', () => {
  it('asks in the page, with the caller’s own words', async () => {
    renderHarness()

    const dialog = await screen.findByRole('dialog')

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Cancel order?')
    expect(screen.getByText('Order A-1 will be cancelled.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('resolves true when the destructive action is confirmed', async () => {
    const { results } = renderHarness()

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }))

    await waitFor(() => expect(results).toEqual([true]))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('resolves false when dismissed, and hands focus back to the trigger', async () => {
    const { results, trigger } = renderHarness()

    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(results).toEqual([false]))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('resolves false from the cancel button too', async () => {
    const { results } = renderHarness()

    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }))

    await waitFor(() => expect(results).toEqual([false]))
  })

  it('moves focus into the dialog so a keyboard admin is not stranded', async () => {
    renderHarness()

    const dialog = await screen.findByRole('dialog')

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })
})
