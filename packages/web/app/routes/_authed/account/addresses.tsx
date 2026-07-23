/**
 * Saved Addresses Page - chobii.art E-commerce Platform
 *
 * Allows users to manage their saved shipping/billing addresses.
 * Supports add, edit, delete, and set-default operations.
 *
 * Following patterns from notifications.tsx
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Star,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  X,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  addressesApi,
  type SavedAddressResponse,
  type AddressCreateInput,
  type AddressUpdateInput,
} from '~/lib/api'
import AddressForm, { type AddressFormData } from '~/components/checkout/AddressForm'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/_authed/account/addresses')({
  head: () => ({
    meta: [
      { title: 'Saved Addresses | chobii.art' },
      { name: 'description', content: 'Manage your saved shipping and billing addresses.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AddressesPage,
})

// ============================================================================
// Main Component
// ============================================================================

function AddressesPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<SavedAddressResponse[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingAddress, setEditingAddress] = useState<SavedAddressResponse | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<AddressFormData | null>(null)
  const [formValid, setFormValid] = useState(false)

  // Fetch addresses on mount
  useEffect(() => {
    fetchAddresses()
  }, [])

  const fetchAddresses = async () => {
    try {
      setIsLoading(true)
      const response = await addressesApi.list()
      setAddresses(response.addresses)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load addresses')
    } finally {
      setIsLoading(false)
    }
  }

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const handleAdd = useCallback(() => {
    setEditingAddress(null)
    setFormData(null)
    setFormValid(false)
    setShowForm(true)
    setError(null)
  }, [])

  const handleEdit = useCallback((address: SavedAddressResponse) => {
    setEditingAddress(address)
    setFormData(null)
    setFormValid(false)
    setShowForm(true)
    setError(null)
  }, [])

  const handleCancel = useCallback(() => {
    setShowForm(false)
    setEditingAddress(null)
    setFormData(null)
    setError(null)
  }, [])

  const handleFormChange = useCallback((data: AddressFormData) => {
    setFormData(data)
  }, [])

  const handleValidationChange = useCallback((isValid: boolean) => {
    setFormValid(isValid)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!formData || !formValid) return

    setIsSubmitting(true)
    setError(null)

    const addressInput: AddressCreateInput = {
      fullName: formData.fullName,
      phone: formData.phone.startsWith('+') ? formData.phone : `+91${formData.phone}`,
      addressLine1: formData.addressLine1,
      addressLine2: formData.addressLine2 || null,
      landmark: formData.landmark || null,
      city: formData.city,
      state: formData.state,
      postalCode: formData.postalCode,
      countryCode: formData.countryCode || 'IN',
    }

    try {
      if (editingAddress) {
        await addressesApi.update(editingAddress.id, addressInput as AddressUpdateInput)
        showSuccess('Address updated')
      } else {
        await addressesApi.create(addressInput)
        showSuccess('Address added')
      }
      setShowForm(false)
      setEditingAddress(null)
      await fetchAddresses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save address')
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, formValid, editingAddress])

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    setError(null)

    try {
      await addressesApi.remove(id)
      setAddresses((prev) => prev.filter((a) => a.id !== id))
      showSuccess('Address deleted')
      // Re-fetch to get updated default status
      await fetchAddresses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete address')
    } finally {
      setDeletingId(null)
    }
  }, [])

  const handleSetDefault = useCallback(async (id: string) => {
    setError(null)

    try {
      await addressesApi.setDefault(id)
      await fetchAddresses()
      showSuccess('Default address updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default address')
    }
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-8 lg:py-12">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-12 w-12 animate-spin text-brand-500" />
              <p className="mt-4 text-muted-foreground">Loading addresses...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Back Link */}
        <a
          href="/account"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </a>

        <div className="mx-auto max-w-2xl">
          {/* Page Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <MapPin className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Saved Addresses</h1>
                <p className="text-sm text-muted-foreground">
                  Manage your delivery addresses
                </p>
              </div>
            </div>
            {!showForm && (
              <button
                type="button"
                onClick={handleAdd}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                <Plus className="h-4 w-4" />
                Add Address
              </button>
            )}
          </div>

          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <div className="mb-6 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="font-semibold text-foreground">
                  {editingAddress ? 'Edit Address' : 'Add New Address'}
                </h2>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6">
                <AddressForm
                  initialData={
                    editingAddress
                      ? {
                          fullName: editingAddress.fullName,
                          phone: editingAddress.phone,
                          addressLine1: editingAddress.addressLine1,
                          addressLine2: editingAddress.addressLine2 || '',
                          landmark: editingAddress.landmark || '',
                          city: editingAddress.city,
                          state: editingAddress.state,
                          postalCode: editingAddress.postalCode,
                          countryCode: editingAddress.countryCode,
                        }
                      : undefined
                  }
                  onChange={handleFormChange}
                  onValidationChange={handleValidationChange}
                  isLoggedIn={false}
                />
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!formValid || isSubmitting}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                      formValid && !isSubmitting
                        ? 'bg-brand-500 text-white hover:bg-brand-600'
                        : 'cursor-not-allowed bg-muted text-muted-foreground'
                    )}
                  >
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingAddress ? 'Update Address' : 'Save Address'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Address List */}
          {addresses.length === 0 && !showForm ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <MapPin className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No saved addresses</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Add an address to speed up your checkout experience.
              </p>
              <button
                type="button"
                onClick={handleAdd}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Your First Address
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {addresses.map((address) => (
                <div
                  key={address.id}
                  className={cn(
                    'rounded-xl border bg-card p-6 transition-colors',
                    address.isDefault ? 'border-brand-300 bg-brand-50/30' : 'border-border'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{address.fullName}</span>
                        {address.isDefault && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                            <Star className="h-3 w-3" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {address.addressLine1}
                        {address.addressLine2 && `, ${address.addressLine2}`}
                      </p>
                      {address.landmark && (
                        <p className="text-sm text-muted-foreground">
                          Landmark: {address.landmark}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {address.city}, {address.state} - {address.postalCode}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{address.phone}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {!address.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(address.id)}
                          title="Set as default"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-brand-50 hover:text-brand-600 transition-colors"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEdit(address)}
                        title="Edit address"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(address.id)}
                        disabled={deletingId === address.id}
                        title="Delete address"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {deletingId === address.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info Card */}
          <div className="mt-8 rounded-xl border border-border bg-muted/30 p-6">
            <h3 className="text-sm font-semibold text-foreground">About Saved Addresses</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your saved addresses make checkout faster. Your default address will be
              automatically selected when you place an order. You can save up to 10 addresses.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AddressesPage
