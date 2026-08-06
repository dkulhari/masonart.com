/**
 * Issuing a gift card by hand.
 *
 * The whole UX risk sits in one place: only the hash of a code is stored, so
 * the code shown after issuing cannot be retrieved, resent, or looked up. An
 * admin who closes this without copying it has to disable the card and issue
 * a replacement. The screen has to say so, plainly, next to the code.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { IssueGiftCardDialog } from '~/components/admin/IssueGiftCardDialog'

const onIssue = vi.fn()
const onClose = vi.fn()

beforeEach(() => {
  onIssue.mockReset()
  onClose.mockReset()
  onIssue.mockResolvedValue({
    success: true,
    code: '7QF3-A8K2-M4NP-XR59',
    giftCardId: 'card-1',
  })
})

function renderDialog() {
  return render(<IssueGiftCardDialog onIssue={onIssue} onClose={onClose} />)
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('IssueGiftCardDialog', () => {
  it('requires a reason before issuing', async () => {
    renderDialog()

    fill(/amount/i, '1000')
    fireEvent.click(screen.getByRole('button', { name: /issue card/i }))

    await waitFor(() => {
      expect(screen.getByText(/say why/i)).toBeInTheDocument()
    })
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('sends the amount in paise with its reason', async () => {
    renderDialog()

    fill(/amount/i, '1000')
    fill(/reason/i, 'goodwill for a delayed order')
    fireEvent.click(screen.getByRole('button', { name: /issue card/i }))

    await waitFor(() =>
      expect(onIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          amountPaise: 100_000,
          reason: 'goodwill for a delayed order',
        }),
      ),
    )
  })

  it('shows the code once, with a warning it cannot be retrieved', async () => {
    renderDialog()

    fill(/amount/i, '1000')
    fill(/reason/i, 'goodwill')
    fireEvent.click(screen.getByRole('button', { name: /issue card/i }))

    await waitFor(() => {
      expect(screen.getByText('7QF3-A8K2-M4NP-XR59')).toBeInTheDocument()
    })

    // Plainly, next to the code — not in a tooltip.
    expect(screen.getByText(/cannot show it again/i)).toBeInTheDocument()
  })

  it('hides the form once the card exists', async () => {
    renderDialog()

    fill(/amount/i, '1000')
    fill(/reason/i, 'goodwill')
    fireEvent.click(screen.getByRole('button', { name: /issue card/i }))

    await waitFor(() =>
      expect(screen.getByText('7QF3-A8K2-M4NP-XR59')).toBeInTheDocument(),
    )

    // Issuing twice by mistake creates a second card and a second liability.
    expect(
      screen.queryByRole('button', { name: /issue card/i }),
    ).not.toBeInTheDocument()
  })

  it('surfaces a failure without clearing the form', async () => {
    onIssue.mockResolvedValue({ success: false, error: 'Amount out of range' })
    renderDialog()

    fill(/amount/i, '1')
    fill(/reason/i, 'goodwill')
    fireEvent.click(screen.getByRole('button', { name: /issue card/i }))

    await waitFor(() => {
      expect(screen.getByText('Amount out of range')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/reason/i)).toHaveValue('goodwill')
  })
})
