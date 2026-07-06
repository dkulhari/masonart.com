/**
 * ProductGrid Component
 *
 * Responsive grid layout for displaying products with various column configurations.
 * Includes loading state with skeletons and empty state handling.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Palette } from "lucide-react";
import { cn } from "~/lib/utils";
import { ProductCard, ProductCardSkeleton, type ProductCardData } from "./ProductCard";

// ============================================================================
// Types
// ============================================================================

export interface ProductGridProps {
  /** Array of products to display */
  products: ProductCardData[];
  /** Number of columns on different breakpoints */
  columns?: {
    default?: 2;
    sm?: 2 | 3;
    md?: 3 | 4;
    lg?: 4 | 5 | 6;
  };
  /** Gap between cards */
  gap?: "sm" | "md" | "lg";
  /** Whether to show loading state */
  isLoading?: boolean;
  /** Number of skeleton cards to show when loading */
  skeletonCount?: number;
  /** Custom empty state component */
  emptyState?: React.ReactNode;
  /** Custom className */
  className?: string;
  /** Card size variant */
  cardSize?: "sm" | "md" | "lg";
  /** Override aspect ratio for uniform card alignment */
  uniformAspectRatio?:
    | "aspect-square"
    | "aspect-[3/4]"
    | "aspect-[2/3]"
    | "aspect-[3/2]"
    | "aspect-video";
}

// ============================================================================
// Grid Column Classes
// ============================================================================

const GRID_COLUMN_CLASSES = {
  default: {
    2: "grid-cols-2",
  },
  sm: {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
  },
  md: {
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
  },
  lg: {
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  },
};

const GAP_CLASSES = {
  sm: "gap-3 sm:gap-4",
  md: "gap-4 sm:gap-6",
  lg: "gap-6 sm:gap-8",
};

// ============================================================================
// Component
// ============================================================================

/**
 * ProductGrid - Responsive grid layout for products
 *
 * @example
 * <ProductGrid
 *   products={products}
 *   columns={{ default: 2, sm: 2, md: 3, lg: 4 }}
 *   gap="md"
 * />
 */
export function ProductGrid({
  products,
  columns = { default: 2, sm: 2, md: 3, lg: 4 },
  gap = "md",
  isLoading = false,
  skeletonCount = 8,
  emptyState,
  className,
  cardSize = "md",
  uniformAspectRatio,
}: ProductGridProps) {
  // Build grid column classes
  const gridClasses = cn(
    "grid",
    columns.default && GRID_COLUMN_CLASSES.default[columns.default],
    columns.sm && GRID_COLUMN_CLASSES.sm[columns.sm],
    columns.md && GRID_COLUMN_CLASSES.md[columns.md],
    columns.lg && GRID_COLUMN_CLASSES.lg[columns.lg],
    GAP_CLASSES[gap],
    className
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={gridClasses}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <ProductCardSkeleton key={`skeleton-${index}`} />
        ))}
      </div>
    );
  }

  // Empty state
  if (products.length === 0) {
    return emptyState || <ProductGridEmptyState />;
  }

  // Render products
  return (
    <div className={gridClasses}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          size={cardSize}
          uniformAspectRatio={uniformAspectRatio}
        />
      ))}
    </div>
  );
}

/**
 * Default empty state component for the product grid
 */
export function ProductGridEmptyState({
  title = "No products found",
  description = "Try adjusting your filters or search criteria to find what you're looking for.",
  showCreateLink = false,
}: {
  title?: string;
  description?: string;
  showCreateLink?: boolean;
}) {
  return (
    <div className="col-span-full rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-12 text-center">
      <Palette className="mx-auto h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-muted-foreground">{description}</p>
      {showCreateLink && (
        <a
          href="/create"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Create your own with AI instead
        </a>
      )}
    </div>
  );
}

export default ProductGrid;
