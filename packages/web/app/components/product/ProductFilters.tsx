/**
 * ProductFilters Component
 *
 * Filter panel for product listings with support for styles, subjects,
 * colors, orientation, rooms, and price range filtering.
 * Supports both desktop sidebar and mobile sheet layouts.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import {
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type Orientation = 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
export type SortOption = 'createdAt' | 'updatedAt' | 'title' | 'basePrice' | 'featuredOrder'
export type SortOrder = 'asc' | 'desc'

export interface FilterState {
  styles: string[]
  subjects: string[]
  colors: string[]
  rooms: string[]
  orientation?: Orientation
  priceMin?: number
  priceMax?: number
  isAiGenerated?: boolean
  isFeatured?: boolean
  sortBy?: SortOption
  sortOrder?: SortOrder
}

export interface FilterOption {
  id: string
  name: string
  description?: string
  hex?: string
}

export interface ProductFiltersProps {
  /** Current filter state */
  filters: FilterState
  /** Callback when filters change */
  onFiltersChange: (filters: FilterState) => void
  /** Available style options */
  styleOptions?: FilterOption[]
  /** Available subject options */
  subjectOptions?: FilterOption[]
  /** Available color options */
  colorOptions?: FilterOption[]
  /** Available room options */
  roomOptions?: FilterOption[]
  /** Whether to show in mobile mode */
  isMobile?: boolean
  /** Callback to close mobile filters */
  onClose?: () => void
  /** Custom className */
  className?: string
}

// ============================================================================
// Default Filter Options
// ============================================================================

const DEFAULT_STYLE_OPTIONS: FilterOption[] = [
  { id: 'wabi-sabi', name: 'Wabi-Sabi' },
  { id: 'minimalist', name: 'Minimalist' },
  { id: 'abstract', name: 'Abstract' },
  { id: 'modern-contemporary', name: 'Modern Contemporary' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'retro', name: 'Retro' },
  { id: 'pop-art', name: 'Pop Art' },
  { id: 'bohemian', name: 'Bohemian' },
  { id: 'photographic', name: 'Photographic' },
  { id: 'typography', name: 'Typography' },
]

const DEFAULT_SUBJECT_OPTIONS: FilterOption[] = [
  { id: 'nature-landscape', name: 'Nature & Landscape' },
  { id: 'flowers-botanical', name: 'Flowers & Botanical' },
  { id: 'animals', name: 'Animals' },
  { id: 'abstract-geometric', name: 'Abstract & Geometric' },
  { id: 'people-portraits', name: 'People & Portraits' },
  { id: 'city-architecture', name: 'City & Architecture' },
  { id: 'sea-ocean', name: 'Sea & Ocean' },
  { id: 'mountains', name: 'Mountains' },
  { id: 'motivational', name: 'Motivational' },
]

const DEFAULT_COLOR_OPTIONS: FilterOption[] = [
  { id: 'black', name: 'Black', hex: '#000000' },
  { id: 'white', name: 'White', hex: '#FFFFFF' },
  { id: 'beige', name: 'Beige', hex: '#F5F5DC' },
  { id: 'neutral', name: 'Neutral', hex: '#D3D3D3' },
  { id: 'blue', name: 'Blue', hex: '#4169E1' },
  { id: 'green', name: 'Green', hex: '#228B22' },
  { id: 'gold', name: 'Gold', hex: '#FFD700' },
  { id: 'pink', name: 'Pink', hex: '#FF69B4' },
  { id: 'red', name: 'Red', hex: '#DC143C' },
  { id: 'grey', name: 'Grey', hex: '#808080' },
  { id: 'black-white', name: 'Black & White', hex: '#000000' },
  { id: 'colorful', name: 'Colorful', hex: '#FF6B6B' },
  { id: 'earth-tones', name: 'Earth Tones', hex: '#8B4513' },
]

const DEFAULT_ROOM_OPTIONS: FilterOption[] = [
  { id: 'living-room', name: 'Living Room' },
  { id: 'bedroom', name: 'Bedroom' },
  { id: 'office', name: 'Office' },
  { id: 'kitchen-dining', name: 'Kitchen & Dining' },
  { id: 'kids-room', name: 'Kids Room' },
  { id: 'bathroom', name: 'Bathroom' },
  { id: 'entryway', name: 'Entryway' },
]

const ORIENTATION_OPTIONS: FilterOption[] = [
  { id: 'square', name: 'Square' },
  { id: 'portrait', name: 'Portrait' },
  { id: 'landscape', name: 'Landscape' },
  { id: 'panoramic', name: 'Panoramic' },
]

const SORT_OPTIONS = [
  { id: 'createdAt-desc', label: 'Newest First' },
  { id: 'createdAt-asc', label: 'Oldest First' },
  { id: 'basePrice-asc', label: 'Price: Low to High' },
  { id: 'basePrice-desc', label: 'Price: High to Low' },
  { id: 'title-asc', label: 'Name: A to Z' },
  { id: 'title-desc', label: 'Name: Z to A' },
]

// ============================================================================
// Component
// ============================================================================

/**
 * ProductFilters - Filter panel for product listings
 */
export function ProductFilters({
  filters,
  onFiltersChange,
  styleOptions = DEFAULT_STYLE_OPTIONS,
  subjectOptions = DEFAULT_SUBJECT_OPTIONS,
  colorOptions = DEFAULT_COLOR_OPTIONS,
  roomOptions = DEFAULT_ROOM_OPTIONS,
  isMobile = false,
  onClose,
  className,
}: ProductFiltersProps) {
  // Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['styles', 'subjects', 'orientation', 'sort'])
  )

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }, [])

  // Toggle a multi-select filter value
  const toggleMultiFilter = useCallback(
    (key: keyof FilterState, value: string) => {
      const currentValues = (filters[key] as string[]) || []
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value]
      onFiltersChange({
        ...filters,
        [key]: newValues,
      })
    },
    [filters, onFiltersChange]
  )

  // Set a single-select filter value
  const setSingleFilter = useCallback(
    (key: keyof FilterState, value: string | undefined) => {
      onFiltersChange({
        ...filters,
        [key]: value,
      })
    },
    [filters, onFiltersChange]
  )

  // Handle sort change
  const handleSortChange = useCallback(
    (sortId: string) => {
      const [sortBy, sortOrder] = sortId.split('-') as [SortOption, SortOrder]
      onFiltersChange({
        ...filters,
        sortBy,
        sortOrder,
      })
    },
    [filters, onFiltersChange]
  )

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    onFiltersChange({
      styles: [],
      subjects: [],
      colors: [],
      rooms: [],
      orientation: undefined,
      priceMin: undefined,
      priceMax: undefined,
      isAiGenerated: undefined,
      isFeatured: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
  }, [onFiltersChange])

  // Count active filters
  const activeFilterCount =
    filters.styles.length +
    filters.subjects.length +
    filters.colors.length +
    filters.rooms.length +
    (filters.orientation ? 1 : 0) +
    (filters.priceMin !== undefined ? 1 : 0) +
    (filters.priceMax !== undefined ? 1 : 0) +
    (filters.isAiGenerated !== undefined ? 1 : 0)

  const currentSortId = `${filters.sortBy || 'createdAt'}-${filters.sortOrder || 'desc'}`

  return (
    <div
      className={cn(
        'flex flex-col bg-background',
        isMobile && 'h-full',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Filters</h2>
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
          {isMobile && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
              aria-label="Close filters"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Sort Section */}
        <FilterSection
          title="Sort By"
          sectionKey="sort"
          isExpanded={expandedSections.has('sort')}
          onToggle={toggleSection}
        >
          <div className="space-y-1">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSortChange(option.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                  currentSortId === option.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent'
                )}
              >
                {option.label}
                {currentSortId === option.id && (
                  <Check className="h-4 w-4" />
                )}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Orientation Section */}
        <FilterSection
          title="Orientation"
          sectionKey="orientation"
          isExpanded={expandedSections.has('orientation')}
          onToggle={toggleSection}
        >
          <div className="flex flex-wrap gap-2">
            {ORIENTATION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  setSingleFilter(
                    'orientation',
                    filters.orientation === option.id ? undefined : option.id
                  )
                }
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  filters.orientation === option.id
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                {option.name}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Styles Section */}
        <FilterSection
          title="Style"
          sectionKey="styles"
          isExpanded={expandedSections.has('styles')}
          onToggle={toggleSection}
          activeCount={filters.styles.length}
        >
          <div className="space-y-1">
            {styleOptions.map((option) => (
              <FilterCheckbox
                key={option.id}
                id={`style-${option.id}`}
                label={option.name}
                checked={filters.styles.includes(option.id)}
                onChange={() => toggleMultiFilter('styles', option.id)}
              />
            ))}
          </div>
        </FilterSection>

        {/* Subjects Section */}
        <FilterSection
          title="Subject"
          sectionKey="subjects"
          isExpanded={expandedSections.has('subjects')}
          onToggle={toggleSection}
          activeCount={filters.subjects.length}
        >
          <div className="space-y-1">
            {subjectOptions.map((option) => (
              <FilterCheckbox
                key={option.id}
                id={`subject-${option.id}`}
                label={option.name}
                checked={filters.subjects.includes(option.id)}
                onChange={() => toggleMultiFilter('subjects', option.id)}
              />
            ))}
          </div>
        </FilterSection>

        {/* Colors Section */}
        <FilterSection
          title="Color"
          sectionKey="colors"
          isExpanded={expandedSections.has('colors')}
          onToggle={toggleSection}
          activeCount={filters.colors.length}
        >
          <div className="flex flex-wrap gap-2">
            {colorOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleMultiFilter('colors', option.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  filters.colors.includes(option.id)
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                {option.hex && (
                  <span
                    className="h-4 w-4 rounded-full border border-border"
                    style={{ backgroundColor: option.hex }}
                  />
                )}
                {option.name}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Rooms Section */}
        <FilterSection
          title="Room"
          sectionKey="rooms"
          isExpanded={expandedSections.has('rooms')}
          onToggle={toggleSection}
          activeCount={filters.rooms.length}
        >
          <div className="space-y-1">
            {roomOptions.map((option) => (
              <FilterCheckbox
                key={option.id}
                id={`room-${option.id}`}
                label={option.name}
                checked={filters.rooms.includes(option.id)}
                onChange={() => toggleMultiFilter('rooms', option.id)}
              />
            ))}
          </div>
        </FilterSection>

        {/* Special Filters */}
        <FilterSection
          title="Special"
          sectionKey="special"
          isExpanded={expandedSections.has('special')}
          onToggle={toggleSection}
        >
          <div className="space-y-1">
            <FilterCheckbox
              id="ai-generated"
              label="AI Generated"
              checked={filters.isAiGenerated === true}
              onChange={() =>
                setSingleFilter(
                  'isAiGenerated',
                  filters.isAiGenerated === true ? undefined : 'true' as unknown as string
                )
              }
            />
            <FilterCheckbox
              id="featured"
              label="Featured"
              checked={filters.isFeatured === true}
              onChange={() =>
                setSingleFilter(
                  'isFeatured',
                  filters.isFeatured === true ? undefined : 'true' as unknown as string
                )
              }
            />
          </div>
        </FilterSection>
      </div>

      {/* Mobile Apply Button */}
      {isMobile && (
        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Apply Filters
            {activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Filter Section Component
// ============================================================================

interface FilterSectionProps {
  title: string
  sectionKey: string
  isExpanded: boolean
  onToggle: (key: string) => void
  activeCount?: number
  children: React.ReactNode
}

function FilterSection({
  title,
  sectionKey,
  isExpanded,
  onToggle,
  activeCount,
  children,
}: FilterSectionProps) {
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {activeCount !== undefined && activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {activeCount}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isExpanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// ============================================================================
// Filter Checkbox Component
// ============================================================================

interface FilterCheckboxProps {
  id: string
  label: string
  checked: boolean
  onChange: () => void
}

function FilterCheckbox({ id, label, checked, onChange }: FilterCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
    >
      <div
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded border transition-colors',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/30'
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </div>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="text-sm">{label}</span>
    </label>
  )
}

// ============================================================================
// Mobile Filter Button Component
// ============================================================================

export interface MobileFilterButtonProps {
  activeCount?: number
  onClick: () => void
  className?: string
}

export function MobileFilterButton({
  activeCount = 0,
  onClick,
  className,
}: MobileFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
        className
      )}
    >
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {activeCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
          {activeCount}
        </span>
      )}
    </button>
  )
}

export default ProductFilters
