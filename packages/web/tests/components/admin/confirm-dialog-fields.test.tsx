/**
 * The dialog's prompt variant (#625) — what replaced the two `prompt()` calls
 * on the orders screen.
 *
 * Those two were not merely blocking; the status one was a correctness bug. It
 * asked the operator to TYPE an order status into a free-text native prompt and
 * then string-matched the answer against an eleven-value enum, so "shiped" was
 * a silent no-op with an error banner and no way to discover the spelling. A
 * select of the valid values cannot be mistyped, which is most of the point of
 * this variant.
 *
 * The refund reason is the other shape: free text that must not be empty,
 * because a refund with no recorded reason is an audit hole. Native `prompt()`
 * returns `''` for an empty submit and `null` for cancel, a distinction every
 * call site has to remember; here an empty required field simply cannot be
 * submitted.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

import { useConfirmDialog } from '~/components/admin/useConfirm'
import type { PromptRequest } from '~/components/admin/useConfirm'

afterEach(cleanup)

const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']

const STATUS_REQUEST: PromptRequest = {
  title: 'Update order status',
  confirmLabel: 'Update status',
  fields: [
    {
      name: 'status',
      label: 'New status',
      type: 'select',
      options: STATUSES.map((value) => ({ value, label: value })),
    },
  ],
}

const REFUND_REQUEST: PromptRequest = {
  title: 'Initiate refund',
  confirmLabel: 'Initiate refund',
  destructive: true,
  fields: [{ name: 'reason', label: 'Refund reason', type: 'textarea', required: true }],
}

function Harness({
  request,
  onResult,
}: {
  request: PromptRequest
  onResult: (value: Record<string, string> | null) => void
}) {
  const { promptForValues, dialog } = useConfirmDialog()

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          onResult(await promptForValues(request))
        }}
      >
        trigger
      </button>
      {dialog}
    </>
  )
}

function renderHarness(request: PromptRequest) {
  const results: Array<Record<string, string> | null> = []
  render(<Harness request={request} onResult={(value) => results.push(value)} />)
  fireEvent.click(screen.getByRole('button', { name: 'trigger' }))
  return results
}

describe('ConfirmDialog with fields', () => {
  it('offers the valid statuses as a select, so none can be mistyped', async () => {
    renderHarness(STATUS_REQUEST)

    const select = (await screen.findByLabelText('New status')) as HTMLSelectElement

    expect(select.tagName).toBe('SELECT')
    expect(Array.from(select.options).map((option) => option.value)).toEqual(STATUSES)
  })

  it('resolves the chosen value', async () => {
    const results = renderHarness(STATUS_REQUEST)

    fireEvent.change(await screen.findByLabelText('New status'), {
      target: { value: 'shipped' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }))

    await waitFor(() => expect(results).toEqual([{ status: 'shipped' }]))
  })

  it('defaults to the first option rather than resolving an empty status', async () => {
    const results = renderHarness(STATUS_REQUEST)

    fireEvent.click(await screen.findByRole('button', { name: 'Update status' }))

    await waitFor(() => expect(results).toEqual([{ status: 'pending' }]))
  })

  it('resolves null when the prompt is dismissed', async () => {
    const results = renderHarness(REFUND_REQUEST)

    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }))

    await waitFor(() => expect(results).toEqual([null]))
  })

  it('refuses to submit an empty required reason, and says so inline', async () => {
    const results = renderHarness(REFUND_REQUEST)

    fireEvent.click(await screen.findByRole('button', { name: 'Initiate refund' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Refund reason is required.')
    expect(results).toEqual([])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('submits once the reason is filled in', async () => {
    const results = renderHarness(REFUND_REQUEST)

    fireEvent.change(await screen.findByLabelText('Refund reason'), {
      target: { value: 'Damaged in transit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Initiate refund' }))

    await waitFor(() => expect(results).toEqual([{ reason: 'Damaged in transit' }]))
  })
})
