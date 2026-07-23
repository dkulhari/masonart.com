/**
 * ProductForm Component - chobi.art E-commerce Platform
 *
 * Form component for creating and editing products with:
 * - Basic info (title, SKU, slug, description)
 * - Pricing and status
 * - Taxonomy (styles, subjects, colors, rooms)
 * - Images management
 * - SEO fields
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useEffect } from 'react'
import {
  Save,
  Plus,
  Trash2,
  ImageIcon,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface ProductImage {
  id: string
  url: string
  alt?: string
  width?: number
  height?: number
  isPrimary?: boolean
  sortOrder?: number
}

export interface ProductVariant {
  id?: string
  sizeLabel: string
  widthInches: number
  heightInches: number
  widthCm?: number
  heightCm?: number
  price: string
  stockQuantity: number
  lowStockThreshold?: number
  isInStock: boolean
  variantSku?: string
  sortOrder?: number
  isActive: boolean
}

export interface ProductFormData {
  sku: string
  title: string
  slug: string
  description: string
  basePrice: string
  styles: string[]
  subjects: string[]
  colors: string[]
  rooms: string[]
  tags: string[]
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
  images: ProductImage[]
  seoTitle: string
  seoDescription: string
  status: 'draft' | 'active' | 'archived'
  isFeatured: boolean
  featuredOrder?: number | null
  isAiGenerated: boolean
  variants: ProductVariant[]
}

export interface ProductFormProps {
  initialData?: Partial<ProductFormData>
  isLoading?: boolean
  onSubmit: (data: ProductFormData) => Promise<void>
  onCancel: () => void
  isEditing?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const ORIENTATIONS = [
  { value: 'square', label: 'Square (1:1)' },
  { value: 'portrait', label: 'Portrait (2:3)' },
  { value: 'landscape', label: 'Landscape (3:2)' },
  { value: 'panoramic', label: 'Panoramic (16:9)' },
  { value: 'round', label: 'Round' },
] as const

const STYLES = [
  'wabi-sabi',
  'abstract-expression',
  'botanical',
  'geometric-modern',
  'vintage-poster',
  'pop-art',
  'watercolor',
  'photography',
  'line-art',
  'typography',
  'minimalist',
  'contemporary',
  'retro',
]

const SUBJECTS = [
  'nature',
  'abstract',
  'cityscape',
  'portrait',
  'still-life',
  'landscape',
  'animals',
  'architecture',
  'food',
  'fashion',
]

const COLORS = [
  'neutral',
  'warm',
  'cool',
  'vibrant',
  'muted',
  'monochrome',
  'earth-tones',
  'pastel',
  'bold',
  'black-white',
]

const ROOMS = [
  'living-room',
  'bedroom',
  'office',
  'kitchen',
  'bathroom',
  'hallway',
  'dining-room',
]

const DEFAULT_FORM_DATA: ProductFormData = {
  sku: '',
  title: '',
  slug: '',
  description: '',
  basePrice: '',
  styles: [],
  subjects: [],
  colors: [],
  rooms: [],
  tags: [],
  orientation: 'portrait',
  images: [],
  seoTitle: '',
  seoDescription: '',
  status: 'draft',
  isFeatured: false,
  featuredOrder: null,
  isAiGenerated: false,
  variants: [],
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ============================================================================
// Form Section Component
// ============================================================================

interface FormSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}

function FormSection({
  title,
  description,
  children,
  collapsible = false,
  defaultOpen = true,
}: FormSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (!collapsible) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        <div className="mt-4">{children}</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-6"
      >
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-border px-6 pb-6 pt-4">{children}</div>
      )}
    </div>
  )
}

// ============================================================================
// Multi-Select Component
// ============================================================================

interface MultiSelectProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option))
    } else {
      onChange([...selected, option])
    }
  }

  return (
    <div>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggleOption(option)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
              selected.includes(option)
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-border bg-background text-muted-foreground hover:border-brand-200 hover:bg-brand-50/50'
            )}
          >
            {option.replace(/-/g, ' ')}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Main ProductForm Component
// ============================================================================

export function ProductForm({
  initialData,
  isLoading = false,
  onSubmit,
  onCancel,
  isEditing = false,
}: ProductFormProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    ...DEFAULT_FORM_DATA,
    ...initialData,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [autoSlug, setAutoSlug] = useState(!isEditing)

  // Update slug when title changes (only if autoSlug is enabled)
  useEffect(() => {
    if (autoSlug && formData.title) {
      setFormData((prev) => ({
        ...prev,
        slug: generateSlug(prev.title),
      }))
    }
  }, [formData.title, autoSlug])

  // Form field handlers
  const updateField = <K extends keyof ProductFormData>(
    field: K,
    value: ProductFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const { [field]: _, ...rest } = prev
        return rest
      })
    }
  }

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU is required'
    }

    if (!formData.slug.trim()) {
      newErrors.slug = 'Slug is required'
    } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      newErrors.slug = 'Slug must be lowercase alphanumeric with hyphens'
    }

    if (!formData.basePrice.trim()) {
      newErrors.basePrice = 'Base price is required'
    } else if (!/^\d+(\.\d{1,2})?$/.test(formData.basePrice)) {
      newErrors.basePrice = 'Invalid price format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(formData)
    } catch (error) {
      // Error is handled by parent
    } finally {
      setIsSubmitting(false)
    }
  }

  // Add image placeholder (in a real app, this would open a file picker or modal)
  const addImagePlaceholder = () => {
    const newImage: ProductImage = {
      id: `temp-${Date.now()}`,
      url: '',
      alt: '',
      isPrimary: formData.images.length === 0,
      sortOrder: formData.images.length,
    }
    updateField('images', [...formData.images, newImage])
  }

  const updateImage = (id: string, updates: Partial<ProductImage>) => {
    updateField(
      'images',
      formData.images.map((img) => (img.id === id ? { ...img, ...updates } : img))
    )
  }

  const removeImage = (id: string) => {
    const newImages = formData.images.filter((img) => img.id !== id)
    // If we removed the primary image, set the first one as primary
    if (newImages.length > 0 && !newImages.some((img) => img.isPrimary)) {
      const firstImage = newImages[0]
      if (firstImage) {
        firstImage.isPrimary = true
      }
    }
    updateField('images', newImages)
  }

  const setPrimaryImage = (id: string) => {
    updateField(
      'images',
      formData.images.map((img) => ({ ...img, isPrimary: img.id === id }))
    )
  }

  // Add variant
  const addVariant = () => {
    const newVariant: ProductVariant = {
      sizeLabel: '',
      widthInches: 0,
      heightInches: 0,
      price: '',
      stockQuantity: 0,
      isInStock: true,
      isActive: true,
      sortOrder: formData.variants.length,
    }
    updateField('variants', [...formData.variants, newVariant])
  }

  const updateVariant = (index: number, updates: Partial<ProductVariant>) => {
    updateField(
      'variants',
      formData.variants.map((v, i) => (i === index ? { ...v, ...updates } : v))
    )
  }

  const removeVariant = (index: number) => {
    updateField(
      'variants',
      formData.variants.filter((_, i) => i !== index)
    )
  }

  if (isLoading) {
    return <ProductFormSkeleton />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <FormSection title="Basic Information" description="Product title, SKU, and description">
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="text-sm font-medium text-foreground">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="e.g., Abstract Mountain Sunrise"
              className={cn(
                'mt-1 w-full rounded-lg border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
                errors.title ? 'border-red-500' : 'border-border'
              )}
            />
            {errors.title && (
              <p className="mt-1 flex items-center gap-1 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                {errors.title}
              </p>
            )}
          </div>

          {/* SKU and Slug */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* SKU */}
            <div>
              <label htmlFor="sku" className="text-sm font-medium text-foreground">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="sku"
                value={formData.sku}
                onChange={(e) => updateField('sku', e.target.value.toUpperCase())}
                placeholder="e.g., POSTER-ABS-001"
                className={cn(
                  'mt-1 w-full rounded-lg border bg-background px-4 py-2.5 uppercase text-foreground placeholder:text-muted-foreground placeholder:normal-case focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
                  errors.sku ? 'border-red-500' : 'border-border'
                )}
              />
              {errors.sku && (
                <p className="mt-1 flex items-center gap-1 text-sm text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  {errors.sku}
                </p>
              )}
            </div>

            {/* Slug */}
            <div>
              <label htmlFor="slug" className="text-sm font-medium text-foreground">
                URL Slug <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => {
                    setAutoSlug(false)
                    updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                  }}
                  placeholder="abstract-mountain-sunrise"
                  className={cn(
                    'w-full rounded-lg border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
                    errors.slug ? 'border-red-500' : 'border-border'
                  )}
                />
                <button
                  type="button"
                  onClick={() => {
                    setAutoSlug(true)
                    updateField('slug', generateSlug(formData.title))
                  }}
                  className="flex-shrink-0 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"
                  title="Auto-generate from title"
                >
                  Auto
                </button>
              </div>
              {errors.slug && (
                <p className="mt-1 flex items-center gap-1 text-sm text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  {errors.slug}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="text-sm font-medium text-foreground">
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={4}
              placeholder="Describe the product..."
              className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
      </FormSection>

      {/* Pricing & Status */}
      <FormSection title="Pricing & Status" description="Set pricing and visibility">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Base Price */}
          <div>
            <label htmlFor="basePrice" className="text-sm font-medium text-foreground">
              Base Price (INR) <span className="text-red-500">*</span>
            </label>
            <div className="relative mt-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                ₹
              </span>
              <input
                type="text"
                id="basePrice"
                value={formData.basePrice}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '')
                  updateField('basePrice', value)
                }}
                placeholder="599.00"
                className={cn(
                  'w-full rounded-lg border bg-background py-2.5 pl-8 pr-4 text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
                  errors.basePrice ? 'border-red-500' : 'border-border'
                )}
              />
            </div>
            {errors.basePrice && (
              <p className="mt-1 flex items-center gap-1 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                {errors.basePrice}
              </p>
            )}
          </div>

          {/* Status */}
          <div>
            <label htmlFor="status" className="text-sm font-medium text-foreground">
              Status
            </label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => updateField('status', e.target.value as ProductFormData['status'])}
              className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Orientation */}
          <div>
            <label htmlFor="orientation" className="text-sm font-medium text-foreground">
              Orientation
            </label>
            <select
              id="orientation"
              value={formData.orientation}
              onChange={(e) => updateField('orientation', e.target.value as ProductFormData['orientation'])}
              className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {ORIENTATIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feature toggle */}
        <div className="mt-4 flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={formData.isFeatured}
              onChange={(e) => updateField('isFeatured', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm font-medium text-foreground">Featured product</span>
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={formData.isAiGenerated}
              onChange={(e) => updateField('isAiGenerated', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm font-medium text-foreground">AI Generated</span>
          </label>
        </div>
      </FormSection>

      {/* Taxonomy */}
      <FormSection
        title="Taxonomy"
        description="Categorize the product for filtering and discovery"
        collapsible
      >
        <div className="space-y-6">
          <MultiSelect
            label="Styles"
            options={STYLES}
            selected={formData.styles}
            onChange={(v) => updateField('styles', v)}
          />
          <MultiSelect
            label="Subjects"
            options={SUBJECTS}
            selected={formData.subjects}
            onChange={(v) => updateField('subjects', v)}
          />
          <MultiSelect
            label="Colors"
            options={COLORS}
            selected={formData.colors}
            onChange={(v) => updateField('colors', v)}
          />
          <MultiSelect
            label="Rooms"
            options={ROOMS}
            selected={formData.rooms}
            onChange={(v) => updateField('rooms', v)}
          />
        </div>
      </FormSection>

      {/* Images */}
      <FormSection
        title="Images"
        description="Upload product images (first image will be the primary)"
        collapsible
      >
        <div className="space-y-4">
          {/* Image list */}
          {formData.images.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {formData.images.map((image) => (
                <div
                  key={image.id}
                  className={cn(
                    'relative rounded-lg border-2 bg-muted/50 p-2',
                    image.isPrimary ? 'border-brand-500' : 'border-border'
                  )}
                >
                  {/* Image preview or URL input */}
                  {image.url ? (
                    <div className="relative aspect-[3/4] overflow-hidden rounded-md">
                      <img
                        src={image.url}
                        alt={image.alt || 'Product image'}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex aspect-[3/4] items-center justify-center rounded-md bg-muted">
                        <ImageIcon className="h-12 w-12 text-muted-foreground" />
                      </div>
                      <input
                        type="url"
                        placeholder="Image URL"
                        value={image.url}
                        onChange={(e) => updateImage(image.id, { url: e.target.value })}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>
                  )}

                  {/* Image controls */}
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPrimaryImage(image.id)}
                      className={cn(
                        'rounded px-2 py-1 text-xs font-medium',
                        image.isPrimary
                          ? 'bg-brand-500 text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      {image.isPrimary ? 'Primary' : 'Set Primary'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Alt text */}
                  <input
                    type="text"
                    placeholder="Alt text"
                    value={image.alt || ''}
                    onChange={(e) => updateImage(image.id, { alt: e.target.value })}
                    className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Add image button */}
          <button
            type="button"
            onClick={addImagePlaceholder}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-muted-foreground transition-colors hover:border-brand-200 hover:text-brand-500"
          >
            <Plus className="h-5 w-5" />
            Add Image
          </button>
        </div>
      </FormSection>

      {/* Variants */}
      <FormSection
        title="Size Variants"
        description="Add size options with pricing"
        collapsible
        defaultOpen={false}
      >
        <div className="space-y-4">
          {formData.variants.map((variant, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-muted/30 p-4"
            >
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-foreground">
                  Variant {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeVariant(index)}
                  className="rounded p-1 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="text-xs text-muted-foreground">Size Label</label>
                  <input
                    type="text"
                    value={variant.sizeLabel}
                    onChange={(e) => updateVariant(index, { sizeLabel: e.target.value })}
                    placeholder='e.g., 12"x16"'
                    className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Width (inches)</label>
                  <input
                    type="number"
                    value={variant.widthInches || ''}
                    onChange={(e) => updateVariant(index, { widthInches: parseInt(e.target.value) || 0 })}
                    className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Height (inches)</label>
                  <input
                    type="number"
                    value={variant.heightInches || ''}
                    onChange={(e) => updateVariant(index, { heightInches: parseInt(e.target.value) || 0 })}
                    className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Price (INR)</label>
                  <input
                    type="text"
                    value={variant.price}
                    onChange={(e) => updateVariant(index, { price: e.target.value.replace(/[^0-9.]/g, '') })}
                    placeholder="599.00"
                    className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={variant.isInStock}
                    onChange={(e) => updateVariant(index, { isInStock: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  In Stock
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={variant.isActive}
                    onChange={(e) => updateVariant(index, { isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Active
                </label>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addVariant}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:border-brand-200 hover:text-brand-500"
          >
            <Plus className="h-4 w-4" />
            Add Size Variant
          </button>
        </div>
      </FormSection>

      {/* SEO */}
      <FormSection
        title="SEO"
        description="Search engine optimization settings"
        collapsible
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="seoTitle" className="text-sm font-medium text-foreground">
              SEO Title
            </label>
            <input
              type="text"
              id="seoTitle"
              value={formData.seoTitle}
              onChange={(e) => updateField('seoTitle', e.target.value)}
              placeholder={formData.title || 'Product title for search engines'}
              maxLength={60}
              className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {formData.seoTitle.length}/60 characters
            </p>
          </div>

          <div>
            <label htmlFor="seoDescription" className="text-sm font-medium text-foreground">
              SEO Description
            </label>
            <textarea
              id="seoDescription"
              value={formData.seoDescription}
              onChange={(e) => updateField('seoDescription', e.target.value)}
              placeholder="Brief description for search engine results"
              maxLength={160}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {formData.seoDescription.length}/160 characters
            </p>
          </div>
        </div>
      </FormSection>

      {/* Form Actions */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex h-10 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isEditing ? 'Saving...' : 'Creating...'}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {isEditing ? 'Save Changes' : 'Create Product'}
            </>
          )}
        </button>
      </div>
    </form>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

export function ProductFormSkeleton() {
  return (
    <div className="space-y-6">
      {/* Basic Info skeleton */}
      <div className="animate-pulse rounded-xl border border-border bg-card p-6">
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="mt-4 space-y-4">
          <div className="h-10 rounded bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-10 rounded bg-muted" />
            <div className="h-10 rounded bg-muted" />
          </div>
          <div className="h-24 rounded bg-muted" />
        </div>
      </div>

      {/* Pricing skeleton */}
      <div className="animate-pulse rounded-xl border border-border bg-card p-6">
        <div className="h-6 w-32 rounded bg-muted" />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
        </div>
      </div>

      {/* Actions skeleton */}
      <div className="flex justify-end gap-3">
        <div className="h-10 w-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}

export default ProductForm
