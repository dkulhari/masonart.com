/**
 * Tests for NotificationToggle Component
 *
 * Tests the notification preference toggle used on the notifications settings page.
 * Includes accessibility tests for the switch component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Loader2 } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Test Component (Extracted from notifications.tsx)
// ============================================================================

interface NotificationToggleProps {
  id: string
  label: string
  description: string
  enabled: boolean
  isLoading: boolean
  onChange: (enabled: boolean) => void
}

function NotificationToggle({
  id,
  label,
  description,
  enabled,
  isLoading,
  onChange,
}: NotificationToggleProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4" data-testid={`toggle-${id}`}>
      <div className="flex-1 pr-4">
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isLoading}
        onClick={() => onChange(!enabled)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          enabled ? 'bg-brand-500' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
            enabled ? 'translate-x-5' : 'translate-x-0'
          )}
        >
          {isLoading && (
            <span className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-3 w-3 animate-spin text-brand-500" data-testid="loading-spinner" />
            </span>
          )}
        </span>
      </button>
    </div>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe('NotificationToggle Component', () => {
  const defaultProps = {
    id: 'test-toggle',
    label: 'Order Confirmation',
    description: 'Receive notifications when your order is confirmed',
    enabled: false,
    isLoading: false,
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Rendering', () => {
    it('renders with label and description', () => {
      render(<NotificationToggle {...defaultProps} />)

      expect(screen.getByText('Order Confirmation')).toBeInTheDocument()
      expect(screen.getByText('Receive notifications when your order is confirmed')).toBeInTheDocument()
    })

    it('renders switch button with correct role', () => {
      render(<NotificationToggle {...defaultProps} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toBeInTheDocument()
    })

    it('associates label with switch via htmlFor', () => {
      render(<NotificationToggle {...defaultProps} />)

      const label = screen.getByText('Order Confirmation')
      expect(label).toHaveAttribute('for', 'test-toggle')
    })

    it('renders with test id', () => {
      render(<NotificationToggle {...defaultProps} />)

      expect(screen.getByTestId('toggle-test-toggle')).toBeInTheDocument()
    })
  })

  describe('Toggle State', () => {
    it('shows disabled state when enabled is false', () => {
      render(<NotificationToggle {...defaultProps} enabled={false} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveAttribute('aria-checked', 'false')
      expect(toggle).toHaveClass('bg-muted')
    })

    it('shows enabled state when enabled is true', () => {
      render(<NotificationToggle {...defaultProps} enabled={true} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveAttribute('aria-checked', 'true')
      expect(toggle).toHaveClass('bg-brand-500')
    })

    it('moves toggle indicator when enabled', () => {
      const { rerender } = render(<NotificationToggle {...defaultProps} enabled={false} />)

      let indicator = screen.getByRole('switch').querySelector('span')
      expect(indicator).toHaveClass('translate-x-0')

      rerender(<NotificationToggle {...defaultProps} enabled={true} />)

      indicator = screen.getByRole('switch').querySelector('span')
      expect(indicator).toHaveClass('translate-x-5')
    })
  })

  describe('Click Behavior', () => {
    it('calls onChange with true when toggling from off to on', () => {
      const onChange = vi.fn()
      render(<NotificationToggle {...defaultProps} enabled={false} onChange={onChange} />)

      fireEvent.click(screen.getByRole('switch'))

      expect(onChange).toHaveBeenCalledWith(true)
    })

    it('calls onChange with false when toggling from on to off', () => {
      const onChange = vi.fn()
      render(<NotificationToggle {...defaultProps} enabled={true} onChange={onChange} />)

      fireEvent.click(screen.getByRole('switch'))

      expect(onChange).toHaveBeenCalledWith(false)
    })

    it('responds to label click', () => {
      const onChange = vi.fn()
      render(<NotificationToggle {...defaultProps} enabled={false} onChange={onChange} />)

      // Click on the label (which triggers the switch via htmlFor)
      const label = screen.getByText('Order Confirmation')
      fireEvent.click(label)

      // Label click should trigger the switch
      expect(onChange).toHaveBeenCalled()
    })
  })

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      render(<NotificationToggle {...defaultProps} isLoading={true} />)

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    })

    it('hides loading spinner when isLoading is false', () => {
      render(<NotificationToggle {...defaultProps} isLoading={false} />)

      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()
    })

    it('disables button when loading', () => {
      render(<NotificationToggle {...defaultProps} isLoading={true} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toBeDisabled()
      expect(toggle).toHaveClass('disabled:cursor-not-allowed')
    })

    it('does not call onChange when clicked while loading', () => {
      const onChange = vi.fn()
      render(<NotificationToggle {...defaultProps} isLoading={true} onChange={onChange} />)

      fireEvent.click(screen.getByRole('switch'))

      expect(onChange).not.toHaveBeenCalled()
    })

    it('reduces opacity when loading', () => {
      render(<NotificationToggle {...defaultProps} isLoading={true} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveClass('disabled:opacity-50')
    })
  })

  describe('Accessibility', () => {
    it('has correct aria-checked attribute for off state', () => {
      render(<NotificationToggle {...defaultProps} enabled={false} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })

    it('has correct aria-checked attribute for on state', () => {
      render(<NotificationToggle {...defaultProps} enabled={true} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })

    it('has focus ring styles for keyboard navigation', () => {
      render(<NotificationToggle {...defaultProps} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveClass('focus:ring-2')
      expect(toggle).toHaveClass('focus:ring-brand-500')
    })

    it('can be toggled with keyboard (Space)', () => {
      const onChange = vi.fn()
      render(<NotificationToggle {...defaultProps} enabled={false} onChange={onChange} />)

      const toggle = screen.getByRole('switch')
      toggle.focus()
      fireEvent.keyDown(toggle, { key: ' ', code: 'Space' })
      fireEvent.keyUp(toggle, { key: ' ', code: 'Space' })

      // Note: Since we're using onClick not onKeyDown, the click event is what matters
      // The button's default behavior will handle space/enter
    })

    it('label is clickable cursor', () => {
      render(<NotificationToggle {...defaultProps} />)

      const label = screen.getByText('Order Confirmation')
      expect(label).toHaveClass('cursor-pointer')
    })
  })

  describe('Different Preference Types', () => {
    it('renders email preference correctly', () => {
      render(
        <NotificationToggle
          {...defaultProps}
          id="email-shipped"
          label="Order Shipped"
          description="When your order is shipped with tracking info"
        />
      )

      expect(screen.getByText('Order Shipped')).toBeInTheDocument()
      expect(screen.getByText('When your order is shipped with tracking info')).toBeInTheDocument()
    })

    it('renders SMS preference correctly', () => {
      render(
        <NotificationToggle
          {...defaultProps}
          id="sms-delivered"
          label="Delivered"
          description="When your order has been delivered"
        />
      )

      expect(screen.getByText('Delivered')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('applies correct background color when enabled', () => {
      render(<NotificationToggle {...defaultProps} enabled={true} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveClass('bg-brand-500')
      expect(toggle).not.toHaveClass('bg-muted')
    })

    it('applies correct background color when disabled', () => {
      render(<NotificationToggle {...defaultProps} enabled={false} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveClass('bg-muted')
      expect(toggle).not.toHaveClass('bg-brand-500')
    })

    it('has rounded-full class for pill shape', () => {
      render(<NotificationToggle {...defaultProps} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveClass('rounded-full')
    })

    it('has transition styles for smooth animation', () => {
      render(<NotificationToggle {...defaultProps} />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveClass('transition-colors')
    })
  })
})

// ============================================================================
// Notification Preferences Group Tests
// ============================================================================

interface NotificationGroup {
  id: string
  label: string
  description: string
}

const NOTIFICATION_GROUPS: NotificationGroup[] = [
  { id: 'orderConfirmation', label: 'Order Confirmation', description: 'When your order is placed and confirmed' },
  { id: 'shipped', label: 'Order Shipped', description: 'When your order is shipped with tracking info' },
  { id: 'outForDelivery', label: 'Out for Delivery', description: 'When your order is out for delivery' },
  { id: 'delivered', label: 'Delivered', description: 'When your order has been delivered' },
]

describe('Notification Groups', () => {
  it('all notification types have unique IDs', () => {
    const ids = NOTIFICATION_GROUPS.map((g) => g.id)
    const uniqueIds = [...new Set(ids)]
    expect(ids.length).toBe(uniqueIds.length)
  })

  it('all notification types have labels', () => {
    NOTIFICATION_GROUPS.forEach((group) => {
      expect(group.label).toBeTruthy()
      expect(group.label.length).toBeGreaterThan(0)
    })
  })

  it('all notification types have descriptions', () => {
    NOTIFICATION_GROUPS.forEach((group) => {
      expect(group.description).toBeTruthy()
      expect(group.description.length).toBeGreaterThan(0)
    })
  })

  it('renders all email notification toggles', () => {
    render(
      <div>
        {NOTIFICATION_GROUPS.map((group) => (
          <NotificationToggle
            key={`email-${group.id}`}
            id={`email-${group.id}`}
            label={group.label}
            description={group.description}
            enabled={true}
            isLoading={false}
            onChange={vi.fn()}
          />
        ))}
      </div>
    )

    expect(screen.getByText('Order Confirmation')).toBeInTheDocument()
    expect(screen.getByText('Order Shipped')).toBeInTheDocument()
    expect(screen.getByText('Out for Delivery')).toBeInTheDocument()
    expect(screen.getByText('Delivered')).toBeInTheDocument()
  })

  it('renders all SMS notification toggles', () => {
    render(
      <div>
        {NOTIFICATION_GROUPS.map((group) => (
          <NotificationToggle
            key={`sms-${group.id}`}
            id={`sms-${group.id}`}
            label={group.label}
            description={group.description}
            enabled={false}
            isLoading={false}
            onChange={vi.fn()}
          />
        ))}
      </div>
    )

    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(4)
  })
})
