/**
 * Address Form Component - chobi.art E-commerce Platform
 *
 * Form for entering shipping and billing addresses during checkout.
 * Includes validation for Indian addresses (phone, postal code).
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from 'react'
import { MapPin, User, Phone, Building2, Home, ChevronDown, Check } from 'lucide-react'
import { cn, isValidEmail, isValidPhone, isValidPostalCode } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface AddressFormData {
  fullName: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  landmark: string
  city: string
  state: string
  postalCode: string
  countryCode: string
  saveAddress: boolean
}

export interface AddressFormErrors {
  fullName?: string
  email?: string
  phone?: string
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
}

interface AddressFormProps {
  /** Initial form data */
  initialData?: Partial<AddressFormData>
  /** Callback when form data changes */
  onChange: (data: AddressFormData) => void
  /** Callback when form validation changes */
  onValidationChange: (isValid: boolean, errors: AddressFormErrors) => void
  /** Whether user is logged in (shows save address option) */
  isLoggedIn?: boolean
  /** Class name for styling */
  className?: string
  /** Title for the form section */
  title?: string
}

// ============================================================================
// Indian States Data
// ============================================================================

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  // Union Territories
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
]

// ============================================================================
// Main Component
// ============================================================================

export function AddressForm({
  initialData,
  onChange,
  onValidationChange,
  isLoggedIn = false,
  className,
  title = 'Shipping Address',
}: AddressFormProps) {
  const [formData, setFormData] = useState<AddressFormData>({
    fullName: initialData?.fullName ?? '',
    email: initialData?.email ?? '',
    phone: initialData?.phone ?? '',
    addressLine1: initialData?.addressLine1 ?? '',
    addressLine2: initialData?.addressLine2 ?? '',
    landmark: initialData?.landmark ?? '',
    city: initialData?.city ?? '',
    state: initialData?.state ?? '',
    postalCode: initialData?.postalCode ?? '',
    countryCode: initialData?.countryCode ?? 'IN',
    saveAddress: initialData?.saveAddress ?? false,
  })

  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<AddressFormErrors>({})

  // Validate form data
  const validateForm = (data: AddressFormData): AddressFormErrors => {
    const newErrors: AddressFormErrors = {}

    if (!data.fullName.trim()) {
      newErrors.fullName = 'Full name is required'
    } else if (data.fullName.trim().length < 2) {
      newErrors.fullName = 'Name must be at least 2 characters'
    }

    if (!data.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!isValidEmail(data.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!data.phone.trim()) {
      newErrors.phone = 'Phone number is required'
    } else if (!isValidPhone(data.phone)) {
      newErrors.phone = 'Please enter a valid 10-digit phone number'
    }

    if (!data.addressLine1.trim()) {
      newErrors.addressLine1 = 'Address is required'
    } else if (data.addressLine1.trim().length < 5) {
      newErrors.addressLine1 = 'Please enter a complete address'
    }

    if (!data.city.trim()) {
      newErrors.city = 'City is required'
    }

    if (!data.state) {
      newErrors.state = 'State is required'
    }

    if (!data.postalCode.trim()) {
      newErrors.postalCode = 'PIN code is required'
    } else if (!isValidPostalCode(data.postalCode)) {
      newErrors.postalCode = 'Please enter a valid 6-digit PIN code'
    }

    return newErrors
  }

  // Handle field change
  const handleChange = (field: keyof AddressFormData, value: string | boolean) => {
    const newData = { ...formData, [field]: value }
    setFormData(newData)
    onChange(newData)

    // Validate after change
    const newErrors = validateForm(newData)
    setErrors(newErrors)
    onValidationChange(Object.keys(newErrors).length === 0, newErrors)
  }

  // Handle field blur
  const handleBlur = (field: keyof AddressFormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    // Re-validate on blur
    const newErrors = validateForm(formData)
    setErrors(newErrors)
    onValidationChange(Object.keys(newErrors).length === 0, newErrors)
  }

  // Get field error (only show if touched)
  const getFieldError = (field: keyof AddressFormErrors) => {
    return touched[field] ? errors[field] : undefined
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card p-6', className)}>
      {/* Section Title */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <MapPin className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-foreground">
            Full Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              id="fullName"
              value={formData.fullName}
              onChange={(e) => handleChange('fullName', e.target.value)}
              onBlur={() => handleBlur('fullName')}
              placeholder="Enter your full name"
              className={cn(
                'w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                getFieldError('fullName')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-input hover:border-brand-300'
              )}
            />
          </div>
          {getFieldError('fullName') && (
            <p className="mt-1 text-xs text-red-500">{getFieldError('fullName')}</p>
          )}
        </div>

        {/* Email and Phone - Side by Side on larger screens */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Email */}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              placeholder="your@email.com"
              className={cn(
                'w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                getFieldError('email')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-input hover:border-brand-300'
              )}
            />
            {getFieldError('email') && (
              <p className="mt-1 text-xs text-red-500">{getFieldError('email')}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-foreground">
              Phone <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                onBlur={() => handleBlur('phone')}
                placeholder="10-digit mobile number"
                className={cn(
                  'w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                  getFieldError('phone')
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-input hover:border-brand-300'
                )}
              />
            </div>
            {getFieldError('phone') && (
              <p className="mt-1 text-xs text-red-500">{getFieldError('phone')}</p>
            )}
          </div>
        </div>

        {/* Address Line 1 */}
        <div>
          <label htmlFor="addressLine1" className="mb-1.5 block text-sm font-medium text-foreground">
            Address <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Home className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <textarea
              id="addressLine1"
              value={formData.addressLine1}
              onChange={(e) => handleChange('addressLine1', e.target.value)}
              onBlur={() => handleBlur('addressLine1')}
              placeholder="House/Flat No., Building Name, Street"
              rows={2}
              className={cn(
                'w-full resize-none rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                getFieldError('addressLine1')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-input hover:border-brand-300'
              )}
            />
          </div>
          {getFieldError('addressLine1') && (
            <p className="mt-1 text-xs text-red-500">{getFieldError('addressLine1')}</p>
          )}
        </div>

        {/* Address Line 2 and Landmark */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Address Line 2 */}
          <div>
            <label htmlFor="addressLine2" className="mb-1.5 block text-sm font-medium text-foreground">
              Address Line 2 <span className="text-muted-foreground">(Optional)</span>
            </label>
            <input
              type="text"
              id="addressLine2"
              value={formData.addressLine2}
              onChange={(e) => handleChange('addressLine2', e.target.value)}
              placeholder="Area, Sector, Locality"
              className={cn(
                'w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                'hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2'
              )}
            />
          </div>

          {/* Landmark */}
          <div>
            <label htmlFor="landmark" className="mb-1.5 block text-sm font-medium text-foreground">
              Landmark <span className="text-muted-foreground">(Optional)</span>
            </label>
            <input
              type="text"
              id="landmark"
              value={formData.landmark}
              onChange={(e) => handleChange('landmark', e.target.value)}
              placeholder="Near famous place or shop"
              className={cn(
                'w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                'hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2'
              )}
            />
          </div>
        </div>

        {/* City, State, PIN Code */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* City */}
          <div>
            <label htmlFor="city" className="mb-1.5 block text-sm font-medium text-foreground">
              City <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                id="city"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                onBlur={() => handleBlur('city')}
                placeholder="City"
                className={cn(
                  'w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                  getFieldError('city')
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-input hover:border-brand-300'
                )}
              />
            </div>
            {getFieldError('city') && (
              <p className="mt-1 text-xs text-red-500">{getFieldError('city')}</p>
            )}
          </div>

          {/* State */}
          <div>
            <label htmlFor="state" className="mb-1.5 block text-sm font-medium text-foreground">
              State <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                id="state"
                value={formData.state}
                onChange={(e) => handleChange('state', e.target.value)}
                onBlur={() => handleBlur('state')}
                className={cn(
                  'w-full appearance-none rounded-lg border bg-background py-2.5 pl-4 pr-10 text-sm text-foreground transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                  !formData.state && 'text-muted-foreground',
                  getFieldError('state')
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-input hover:border-brand-300'
                )}
              >
                <option value="">Select State</option>
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            {getFieldError('state') && (
              <p className="mt-1 text-xs text-red-500">{getFieldError('state')}</p>
            )}
          </div>

          {/* PIN Code */}
          <div>
            <label htmlFor="postalCode" className="mb-1.5 block text-sm font-medium text-foreground">
              PIN Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="postalCode"
              value={formData.postalCode}
              onChange={(e) => handleChange('postalCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
              onBlur={() => handleBlur('postalCode')}
              placeholder="6-digit PIN"
              maxLength={6}
              className={cn(
                'w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                getFieldError('postalCode')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-input hover:border-brand-300'
              )}
            />
            {getFieldError('postalCode') && (
              <p className="mt-1 text-xs text-red-500">{getFieldError('postalCode')}</p>
            )}
          </div>
        </div>

        {/* Save Address Checkbox (only for logged in users) */}
        {isLoggedIn && (
          <div className="pt-2">
            <label className="flex cursor-pointer items-center gap-3">
              <div
                role="checkbox"
                aria-checked={formData.saveAddress}
                tabIndex={0}
                onClick={() => handleChange('saveAddress', !formData.saveAddress)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleChange('saveAddress', !formData.saveAddress)
                  }
                }}
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                  formData.saveAddress
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-input bg-background hover:border-brand-300'
                )}
              >
                {formData.saveAddress && <Check className="h-3.5 w-3.5" />}
              </div>
              <span className="text-sm text-foreground">Save this address for future orders</span>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Saved Address Selector
// ============================================================================

export interface SavedAddress {
  id: string
  fullName: string
  phone: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  isDefault: boolean
}

interface SavedAddressSelectorProps {
  addresses: SavedAddress[]
  selectedId: string | null
  onSelect: (address: SavedAddress) => void
  onAddNew: () => void
  className?: string
}

export function SavedAddressSelector({
  addresses,
  selectedId,
  onSelect,
  onAddNew,
  className,
}: SavedAddressSelectorProps) {
  if (addresses.length === 0) {
    return null
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card p-6', className)}>
      <h3 className="mb-4 text-base font-semibold text-foreground">Saved Addresses</h3>

      <div className="space-y-3">
        {addresses.map((address) => (
          <button
            key={address.id}
            type="button"
            onClick={() => onSelect(address)}
            className={cn(
              'w-full rounded-lg border p-4 text-left transition-colors',
              selectedId === address.id
                ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                : 'border-border bg-background hover:border-brand-300'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{address.fullName}</span>
                  {address.isDefault && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Default
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {address.addressLine1}
                  {address.addressLine2 && `, ${address.addressLine2}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {address.city}, {address.state} - {address.postalCode}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{address.phone}</p>
              </div>

              <div
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors',
                  selectedId === address.id
                    ? 'border-brand-500 bg-brand-500'
                    : 'border-muted-foreground/30 bg-transparent'
                )}
              >
                {selectedId === address.id && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddNew}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-brand-300 py-3 text-sm font-medium text-brand-600 transition-colors hover:border-brand-500 hover:bg-brand-50"
      >
        <MapPin className="h-4 w-4" />
        Add New Address
      </button>
    </div>
  )
}

export default AddressForm
