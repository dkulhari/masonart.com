/**
 * Checkout Page - MasonArt E-commerce Platform
 *
 * Multi-step checkout flow with address form, delivery options,
 * order summary, and payment integration.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useEffect, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ShoppingCart,
  MapPin,
  Truck,
  CreditCard,
  ChevronRight,
  ArrowLeft,
  Check,
  AlertCircle,
} from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import {
  useCartItems,
  useCartSubtotal,
  useIsCartEmpty,
} from '~/stores/cart'
import { AddressForm, type AddressFormData, type AddressFormErrors, SavedAddressSelector, type SavedAddress } from '~/components/checkout/AddressForm'
import { OrderSummary } from '~/components/checkout/OrderSummary'
import { PaymentButton } from '~/components/checkout/PaymentButton'
import { ShippingSelector, type SelectedShippingOption } from '~/components/checkout/ShippingSelector'
import type { OrderInput } from '~/lib/api'
import { addressesApi } from '~/lib/api'
import { useSession } from '~/lib/auth-client'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/checkout/')({
  head: () => ({
    meta: [
      { title: 'Checkout | MasonArt' },
      {
        name: 'description',
        content: 'Complete your order. Secure checkout with multiple payment options.',
      },
      { name: 'robots', content: 'noindex' }, // Don't index checkout pages
    ],
  }),
  component: CheckoutPage,
})

// ============================================================================
// Types
// ============================================================================

type CheckoutStep = 'shipping' | 'delivery' | 'payment' | 'review'

// ============================================================================
// Constants
// ============================================================================

const CHECKOUT_STEPS: { id: CheckoutStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'shipping', label: 'Shipping', icon: MapPin },
  { id: 'delivery', label: 'Delivery', icon: Truck },
  { id: 'payment', label: 'Payment', icon: CreditCard },
]

// ============================================================================
// Main Component
// ============================================================================

function CheckoutPage() {
  const items = useCartItems()
  const subtotal = useCartSubtotal()
  const isEmpty = useIsCartEmpty()
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user

  // Checkout state
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('shipping')
  const [shippingAddress, setShippingAddress] = useState<AddressFormData | null>(null)
  const [isAddressValid, setIsAddressValid] = useState(false)
  const [selectedShippingOption, setSelectedShippingOption] = useState<SelectedShippingOption | null>(null)
  const [customerNotes, setCustomerNotes] = useState('')

  // Saved addresses state
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null)
  const [showNewAddressForm, setShowNewAddressForm] = useState(false)

  // Fetch saved addresses when logged in
  useEffect(() => {
    if (!isLoggedIn) return
    addressesApi.list().then((response) => {
      const mapped: SavedAddress[] = response.addresses.map((a) => ({
        id: a.id,
        fullName: a.fullName,
        phone: a.phone,
        addressLine1: a.addressLine1,
        addressLine2: a.addressLine2 || undefined,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        isDefault: a.isDefault,
      }))
      setSavedAddresses(mapped)
      // Auto-select default address
      const defaultAddr = mapped.find((a) => a.isDefault)
      if (defaultAddr && !shippingAddress) {
        handleSavedAddressSelect(defaultAddr)
      }
    }).catch(() => {
      // Silently fail - user can still enter address manually
    })
  }, [isLoggedIn])

  // Handle selecting a saved address
  const handleSavedAddressSelect = useCallback((address: SavedAddress) => {
    setSelectedSavedAddressId(address.id)
    setShowNewAddressForm(false)
    const formData: AddressFormData = {
      fullName: address.fullName,
      email: session?.user?.email || '',
      phone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || '',
      landmark: '',
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      countryCode: 'IN',
      saveAddress: false,
    }
    setShippingAddress(formData)
    setIsAddressValid(true)
  }, [session?.user?.email])

  // Handle "Add New Address" from selector
  const handleAddNewAddress = useCallback(() => {
    setSelectedSavedAddressId(null)
    setShowNewAddressForm(true)
    setShippingAddress(null)
    setIsAddressValid(false)
  }, [])

  // Pricing calculations - use actual shipping cost from selected option
  const shippingCost = selectedShippingOption?.finalCost ?? 0
  const total = subtotal + shippingCost

  // Handle address change
  const handleAddressChange = (data: AddressFormData) => {
    setShippingAddress(data)
  }

  // Handle validation change
  const handleValidationChange = (isValid: boolean, _errors: AddressFormErrors) => {
    setIsAddressValid(isValid)
    // Errors are handled at the form level
  }

  // Navigate to next step
  const goToNextStep = () => {
    const stepIndex = CHECKOUT_STEPS.findIndex((s) => s.id === currentStep)
    const nextStep = CHECKOUT_STEPS[stepIndex + 1]
    if (stepIndex < CHECKOUT_STEPS.length - 1 && nextStep) {
      setCurrentStep(nextStep.id)
    }
    // Payment is handled by PaymentButton component
  }

  // Navigate to previous step
  const goToPreviousStep = () => {
    const stepIndex = CHECKOUT_STEPS.findIndex((s) => s.id === currentStep)
    const prevStep = CHECKOUT_STEPS[stepIndex - 1]
    if (stepIndex > 0 && prevStep) {
      setCurrentStep(prevStep.id)
    }
  }

  // Check if can proceed to next step
  const canProceedFromCurrentStep = (): boolean => {
    switch (currentStep) {
      case 'shipping':
        return isAddressValid && shippingAddress !== null
      case 'delivery':
        return selectedShippingOption !== null
      case 'payment':
        return true // Will be validated by payment provider
      default:
        return false
    }
  }

  // Build order data for payment
  const buildOrderData = (): OrderInput | null => {
    if (!shippingAddress) return null

    return {
      shippingAddress: {
        fullName: shippingAddress.fullName,
        phone: shippingAddress.phone,
        addressLine1: shippingAddress.addressLine1,
        addressLine2: shippingAddress.addressLine2 || undefined,
        landmark: shippingAddress.landmark || undefined,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postalCode: shippingAddress.postalCode,
        countryCode: shippingAddress.countryCode || 'IN',
      },
      // Pass selected shipping option ID - API will handle the mapping
      shippingOptionId: selectedShippingOption?.id,
      customerNotes: customerNotes || undefined,
    }
  }

  // Handle payment success
  const handlePaymentSuccess = (_orderId: string, orderNumber: string) => {
    // Redirect to order confirmation page
    window.location.href = `/orders/${orderNumber}?success=true`
  }

  // Handle payment error
  const handlePaymentError = (_error: string) => {
    // Error is displayed by PaymentButton component
    // Could add additional error handling here if needed
  }

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep])

  // Empty cart state
  if (isEmpty) {
    return <EmptyCartState />
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Page Header */}
        <div className="mb-8">
          <a
            href="/cart"
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Cart
          </a>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Checkout
          </h1>
        </div>

        {/* Progress Steps */}
        <CheckoutSteps currentStep={currentStep} onStepClick={setCurrentStep} />

        {/* Main Content */}
        <div className="mt-8 grid gap-8 lg:grid-cols-3 lg:gap-12">
          {/* Left Column - Form */}
          <div className="lg:col-span-2">
            {/* Shipping Step */}
            {currentStep === 'shipping' && (
              <div className="space-y-6">
                {/* Saved Address Selector (for logged-in users with addresses) */}
                {isLoggedIn && savedAddresses.length > 0 && (
                  <SavedAddressSelector
                    addresses={savedAddresses}
                    selectedId={selectedSavedAddressId}
                    onSelect={handleSavedAddressSelect}
                    onAddNew={handleAddNewAddress}
                  />
                )}

                {/* Show address form when: guest, no saved addresses, or adding new */}
                {(!isLoggedIn || savedAddresses.length === 0 || showNewAddressForm) && (
                  <AddressForm
                    initialData={shippingAddress || undefined}
                    onChange={handleAddressChange}
                    onValidationChange={handleValidationChange}
                    isLoggedIn={isLoggedIn}
                    title="Shipping Address"
                  />
                )}

                {/* Customer Notes */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="mb-4 text-base font-semibold text-foreground">
                    Order Notes <span className="text-muted-foreground font-normal">(Optional)</span>
                  </h3>
                  <textarea
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder="Any special instructions for your order? (e.g., gift wrapping, delivery time preference)"
                    rows={3}
                    maxLength={500}
                    className={cn(
                      'w-full resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                      'hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2'
                    )}
                  />
                  <p className="mt-1 text-xs text-muted-foreground text-right">
                    {customerNotes.length}/500
                  </p>
                </div>

                {/* Continue Button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={goToNextStep}
                    disabled={!canProceedFromCurrentStep()}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                      canProceedFromCurrentStep()
                        ? 'bg-brand-500 text-white hover:bg-brand-600'
                        : 'cursor-not-allowed bg-muted text-muted-foreground'
                    )}
                  >
                    Continue to Delivery
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Delivery Step */}
            {currentStep === 'delivery' && (
              <div className="space-y-6">
                {/* Delivery Options */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-foreground">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <Truck className="h-5 w-5" />
                    </div>
                    Delivery Options
                  </h2>

                  <ShippingSelector
                    cartTotal={subtotal}
                    selectedOptionId={selectedShippingOption?.id ?? null}
                    onSelect={setSelectedShippingOption}
                    postalCode={shippingAddress?.postalCode}
                  />
                </div>

                {/* Shipping Address Summary */}
                {shippingAddress && (
                  <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-foreground">Shipping To</h3>
                      <button
                        type="button"
                        onClick={() => setCurrentStep('shipping')}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">{shippingAddress.fullName}</p>
                      <p>{shippingAddress.addressLine1}</p>
                      {shippingAddress.addressLine2 && <p>{shippingAddress.addressLine2}</p>}
                      <p>
                        {shippingAddress.city}, {shippingAddress.state} - {shippingAddress.postalCode}
                      </p>
                      <p className="mt-1">{shippingAddress.phone}</p>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={goToPreviousStep}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={goToNextStep}
                    disabled={!canProceedFromCurrentStep()}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                      canProceedFromCurrentStep()
                        ? 'bg-brand-500 text-white hover:bg-brand-600'
                        : 'cursor-not-allowed bg-muted text-muted-foreground'
                    )}
                  >
                    Continue to Payment
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Payment Step */}
            {currentStep === 'payment' && (
              <div className="space-y-6">
                {/* Payment Section - Placeholder for Razorpay */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-foreground">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    Payment
                  </h2>

                  {/* Order Review Summary */}
                  <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
                    <h3 className="mb-3 text-sm font-medium text-foreground">Order Summary</h3>

                    {/* Shipping Address */}
                    {shippingAddress && (
                      <div className="mb-3 border-b border-border pb-3">
                        <p className="text-xs text-muted-foreground">Shipping to:</p>
                        <p className="text-sm text-foreground">
                          {shippingAddress.fullName}, {shippingAddress.city}, {shippingAddress.state}
                        </p>
                      </div>
                    )}

                    {/* Delivery Method */}
                    {selectedShippingOption && (
                      <div className="mb-3 border-b border-border pb-3">
                        <p className="text-xs text-muted-foreground">Delivery:</p>
                        <p className="text-sm text-foreground">
                          {selectedShippingOption.name} ({selectedShippingOption.carrier})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedShippingOption.estimatedDaysMin === selectedShippingOption.estimatedDaysMax
                            ? `${selectedShippingOption.estimatedDaysMin} business days`
                            : `${selectedShippingOption.estimatedDaysMin}-${selectedShippingOption.estimatedDaysMax} business days`}
                        </p>
                      </div>
                    )}

                    {/* Total */}
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-foreground">Total Amount</span>
                      <span className="text-lg font-bold text-foreground">{formatPrice(total)}</span>
                    </div>
                  </div>

                  {/* Payment Button */}
                  {(() => {
                    const orderData = buildOrderData()
                    if (!orderData) {
                      return (
                        <div className="rounded-lg border border-dashed border-red-300 bg-red-50/50 p-8 text-center">
                          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-500" />
                          <p className="text-sm font-medium text-foreground">
                            Missing shipping information
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Please complete the shipping address form first.
                          </p>
                        </div>
                      )
                    }

                    return (
                      <PaymentButton
                        orderData={orderData}
                        totalAmount={total}
                        customerPhone={shippingAddress?.phone}
                        onSuccess={handlePaymentSuccess}
                        onError={handlePaymentError}
                        disabled={!isAddressValid}
                      />
                    )
                  })()}
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={goToPreviousStep}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <OrderSummary
                items={items}
                subtotal={subtotal}
                shippingCost={shippingCost}
                showItems={true}
                canProceed={false} // Hide checkout button in summary (using step navigation)
                className="mb-6"
              />

              {/* Security Notice */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-brand-500" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Secure Checkout</p>
                    <p className="mt-1">
                      Your payment information is encrypted and secure. We never store your card details.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Checkout Steps Component
// ============================================================================

interface CheckoutStepsProps {
  currentStep: CheckoutStep
  onStepClick: (step: CheckoutStep) => void
}

function CheckoutSteps({ currentStep, onStepClick }: CheckoutStepsProps) {
  const currentIndex = CHECKOUT_STEPS.findIndex((s) => s.id === currentStep)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        {CHECKOUT_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex
          const isClickable = index <= currentIndex

          return (
            <div key={step.id} className="flex flex-1 items-center">
              {/* Step Circle */}
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
                  isClickable && !isCurrent && 'hover:bg-muted',
                  !isClickable && 'cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    isCompleted && 'bg-green-500 text-white',
                    isCurrent && 'bg-brand-500 text-white',
                    !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <step.icon className="h-4 w-4" />
                  )}
                </div>
                <span
                  className={cn(
                    'hidden text-sm font-medium sm:block',
                    isCurrent && 'text-foreground',
                    isCompleted && 'text-green-600',
                    !isCompleted && !isCurrent && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </button>

              {/* Connector Line */}
              {index < CHECKOUT_STEPS.length - 1 && (
                <div className="mx-2 flex-1">
                  <div
                    className={cn(
                      'h-0.5 rounded-full transition-colors',
                      isCompleted ? 'bg-green-500' : 'bg-muted'
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Empty Cart State
// ============================================================================

function EmptyCartState() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-16">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <ShoppingCart className="h-10 w-10 text-muted-foreground" />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-foreground">Your cart is empty</h1>
          <p className="mb-8 text-muted-foreground">
            Add some items to your cart before proceeding to checkout.
          </p>

          <a
            href="/posters"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Browse Posters
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  )
}
