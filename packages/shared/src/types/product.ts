/**
 * Product Types for MasonArt Platform
 *
 * Defines all product-related types including posters, frames, sizes,
 * and product attributes based on the requirements specification.
 */

// ============================================================================
// Enums & Literal Types
// ============================================================================

/**
 * Poster style categories
 */
export type PosterStyle =
  | "wabi-sabi"
  | "minimalist"
  | "abstract"
  | "modern-contemporary"
  | "vintage"
  | "retro"
  | "pop-art"
  | "bohemian"
  | "surrealist"
  | "photographic"
  | "typography"
  | "quotes"
  | "texture-art";

/**
 * Poster subject categories
 */
export type PosterSubject =
  | "nature-landscape"
  | "flowers-botanical"
  | "animals"
  | "abstract-geometric"
  | "people-portraits"
  | "city-architecture"
  | "sea-ocean"
  | "mountains"
  | "motivational"
  | "ai-generated";

/**
 * Product color options
 */
export type ProductColor =
  | "black"
  | "white"
  | "beige"
  | "neutral"
  | "blue"
  | "green"
  | "gold"
  | "pink"
  | "red"
  | "grey"
  | "black-white"
  | "colorful"
  | "multi"
  | "earth-tones";

/**
 * Poster orientation types
 */
export type PosterOrientation =
  | "square"
  | "portrait"
  | "landscape"
  | "panoramic"
  | "round"
  | "circular"
  | "diptych"
  | "triptych";

/**
 * Room suggestion categories
 */
export type RoomType =
  | "living-room"
  | "bedroom"
  | "office"
  | "kitchen-dining"
  | "kids-room"
  | "bathroom"
  | "entryway";

/**
 * Price tier levels
 */
export type PriceTier = 1 | 2 | 3 | 4;

/**
 * Frame type options
 */
export type FrameType =
  | "poster-only"
  | "stretched-canvas"
  | "black-frame"
  | "white-frame"
  | "natural-wood-frame"
  | "dark-wood-frame"
  | "gold-frame"
  | "silver-frame"
  | "floating-frame";

/**
 * Mat/mount options for framed products
 */
export type MatOption = "no-mat" | "white-mat" | "off-white-mat" | "black-mat" | "double-mat";

/**
 * Glass/acrylic options for framed products
 */
export type GlassOption =
  | "standard-glass"
  | "non-glare-glass"
  | "acrylic"
  | "plexiglass"
  | "museum-glass";

/**
 * Product status for inventory management
 */
export type ProductStatus = "draft" | "active" | "out-of-stock" | "discontinued" | "coming-soon";

/**
 * Collection types
 */
export type CollectionType =
  | "new-arrivals"
  | "best-sellers"
  | "staff-picks"
  | "seasonal"
  | "sale"
  | "ai-generated-gallery";

// ============================================================================
// Size Types
// ============================================================================

/**
 * Unit of measurement for sizes
 */
export type SizeUnit = "inches" | "cm";

/**
 * Size category based on orientation
 */
export type SizeCategory = "square" | "portrait-landscape" | "panoramic";

/**
 * Product size definition
 */
export interface ProductSize {
  /** Unique identifier for the size */
  id: string;
  /** Width in inches */
  widthInches: number;
  /** Height in inches */
  heightInches: number;
  /** Width in centimeters */
  widthCm: number;
  /** Height in centimeters */
  heightCm: number;
  /** Price tier for this size */
  priceTier: PriceTier;
  /** Size category */
  category: SizeCategory;
  /** Display label (e.g., "12\" × 12\"") */
  displayLabel: string;
  /** Display label in metric (e.g., "30 × 30 cm") */
  displayLabelMetric: string;
}

// ============================================================================
// Frame Types
// ============================================================================

/**
 * Price modifier configuration
 */
export interface PriceModifier {
  /** Type of modifier: percentage or fixed amount */
  type: "percentage" | "fixed";
  /** Value of the modifier */
  value: number;
  /** Currency for fixed modifiers */
  currency?: string;
}

/**
 * Frame option definition
 */
export interface FrameOption {
  /** Unique identifier */
  id: string;
  /** Frame type */
  type: FrameType;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Price modifier */
  priceModifier: PriceModifier;
  /** Available colors for this frame type */
  availableColors?: string[];
  /** Material description */
  material?: string;
  /** Compatible size IDs */
  compatibleSizes?: string[];
  /** Whether this is currently available */
  isAvailable: boolean;
}

/**
 * Mat option definition
 */
export interface MatOptionConfig {
  /** Unique identifier */
  id: string;
  /** Mat option type */
  type: MatOption;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Border width in inches */
  borderWidth: number;
  /** Price modifier */
  priceModifier: PriceModifier;
  /** Whether this is available */
  isAvailable: boolean;
}

/**
 * Glass option definition
 */
export interface GlassOptionConfig {
  /** Unique identifier */
  id: string;
  /** Glass option type */
  type: GlassOption;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Price modifier */
  priceModifier: PriceModifier;
  /** Whether UV protection is included */
  hasUVProtection: boolean;
  /** Whether anti-reflective coating is included */
  isAntiReflective: boolean;
  /** Whether this is available */
  isAvailable: boolean;
}

// ============================================================================
// Artist Types
// ============================================================================

/**
 * Artist social media links
 */
export interface ArtistSocialLinks {
  website?: string;
  instagram?: string;
  twitter?: string;
  behance?: string;
  dribbble?: string;
}

/**
 * Artist profile
 */
export interface Artist {
  /** Unique identifier */
  id: string;
  /** Artist name */
  name: string;
  /** URL slug for artist page */
  slug: string;
  /** Artist bio */
  bio: string;
  /** Profile image URL */
  profileImageUrl?: string;
  /** Social media links */
  socialLinks?: ArtistSocialLinks;
  /** Featured work IDs */
  featuredWorkIds?: string[];
  /** Whether the artist is currently active */
  isActive: boolean;
  /** When the artist profile was created */
  createdAt: Date;
  /** When the artist profile was last updated */
  updatedAt: Date;
}

// ============================================================================
// Product Image Types
// ============================================================================

/**
 * Image type for product images
 */
export type ProductImageType =
  | "main"
  | "detail"
  | "texture"
  | "room-mockup"
  | "frame-preview"
  | "360-view";

/**
 * Product image definition
 */
export interface ProductImage {
  /** Unique identifier */
  id: string;
  /** Image URL */
  url: string;
  /** Thumbnail URL */
  thumbnailUrl?: string;
  /** Alt text for accessibility and SEO */
  altText: string;
  /** Image type */
  type: ProductImageType;
  /** Sort order */
  sortOrder: number;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
}

// ============================================================================
// Product Types
// ============================================================================

/**
 * Product SEO metadata
 */
export interface ProductSEO {
  /** SEO-optimized title (50-60 chars) */
  title: string;
  /** Meta description (150-160 chars) */
  description: string;
  /** SEO keywords/tags */
  keywords: string[];
  /** Canonical URL */
  canonicalUrl?: string;
}

/**
 * Product variant (size + price combination)
 */
export interface ProductVariant {
  /** Unique identifier */
  id: string;
  /** Product ID this variant belongs to */
  productId: string;
  /** Size ID */
  sizeId: string;
  /** Size details */
  size: ProductSize;
  /** Base price for this variant (in smallest currency unit, e.g., paise) */
  basePrice: number;
  /** Compare at price for showing discounts */
  compareAtPrice?: number;
  /** Stock quantity (-1 for unlimited/made-to-order) */
  stockQuantity: number;
  /** SKU for this variant */
  sku: string;
  /** Whether this variant is available */
  isAvailable: boolean;
}

/**
 * Product aggregate rating
 */
export interface ProductRating {
  /** Average rating (1-5) */
  averageRating: number;
  /** Total number of reviews */
  reviewCount: number;
}

/**
 * Complete product definition
 */
export interface Product {
  /** Unique identifier */
  id: string;
  /** Stock Keeping Unit */
  sku: string;
  /** Product title */
  title: string;
  /** URL slug */
  slug: string;
  /** Rich text description */
  description: string;
  /** Short description for previews */
  shortDescription?: string;

  // Categorization
  /** Styles (multi-select) */
  styles: PosterStyle[];
  /** Subjects (multi-select) */
  subjects: PosterSubject[];
  /** Primary color */
  primaryColor: ProductColor;
  /** Secondary colors */
  secondaryColors: ProductColor[];
  /** Orientation */
  orientation: PosterOrientation;
  /** Suggested rooms */
  roomSuggestions: RoomType[];
  /** Custom tags for SEO and filtering */
  tags: string[];

  // Pricing & Variants
  /** Product variants (sizes with prices) */
  variants: ProductVariant[];
  /** Minimum price across all variants */
  minPrice: number;
  /** Maximum price across all variants */
  maxPrice: number;

  // Media
  /** Product images */
  images: ProductImage[];

  // Artist
  /** Artist ID */
  artistId?: string;
  /** Artist details (denormalized for display) */
  artist?: Pick<Artist, "id" | "name" | "slug" | "profileImageUrl">;

  // Related products
  /** Related product IDs */
  relatedProductIds: string[];

  // Status & SEO
  /** Product status */
  status: ProductStatus;
  /** SEO metadata */
  seo: ProductSEO;

  // Aggregate data
  /** Product rating */
  rating?: ProductRating;
  /** Whether this is a featured product */
  isFeatured: boolean;
  /** Whether this is an AI-generated product */
  isAIGenerated: boolean;

  // Timestamps
  /** When the product was created */
  createdAt: Date;
  /** When the product was last updated */
  updatedAt: Date;
  /** When the product was published */
  publishedAt?: Date;
}

/**
 * Product for listing pages (minimal data)
 */
export interface ProductListItem {
  id: string;
  sku: string;
  title: string;
  slug: string;
  shortDescription?: string;
  primaryColor: ProductColor;
  orientation: PosterOrientation;
  styles: PosterStyle[];
  mainImage: ProductImage;
  minPrice: number;
  maxPrice: number;
  rating?: ProductRating;
  isFeatured: boolean;
  isAIGenerated: boolean;
  artist?: Pick<Artist, "id" | "name" | "slug">;
}

/**
 * Product filter options
 */
export interface ProductFilters {
  styles?: PosterStyle[];
  subjects?: PosterSubject[];
  colors?: ProductColor[];
  orientations?: PosterOrientation[];
  rooms?: RoomType[];
  priceMin?: number;
  priceMax?: number;
  priceTiers?: PriceTier[];
  artistIds?: string[];
  isAIGenerated?: boolean;
  isFeatured?: boolean;
  status?: ProductStatus[];
  searchQuery?: string;
}

/**
 * Product sort options
 */
export type ProductSortField =
  | "createdAt"
  | "updatedAt"
  | "title"
  | "minPrice"
  | "maxPrice"
  | "rating"
  | "popularity";

export type SortDirection = "asc" | "desc";

export interface ProductSort {
  field: ProductSortField;
  direction: SortDirection;
}

/**
 * Paginated product response
 */
export interface PaginatedProducts {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ============================================================================
// Collection Types
// ============================================================================

/**
 * Product collection definition
 */
export interface Collection {
  /** Unique identifier */
  id: string;
  /** Collection name */
  name: string;
  /** URL slug */
  slug: string;
  /** Collection description */
  description: string;
  /** Collection type */
  type: CollectionType;
  /** Cover image URL */
  coverImageUrl?: string;
  /** Product IDs in this collection */
  productIds: string[];
  /** Whether collection is currently active */
  isActive: boolean;
  /** Sort order for display */
  sortOrder: number;
  /** SEO metadata */
  seo?: ProductSEO;
  /** When the collection was created */
  createdAt: Date;
  /** When the collection was last updated */
  updatedAt: Date;
}

// ============================================================================
// Cart & Order Item Types (Product-related)
// ============================================================================

/**
 * Selected product configuration for cart/order
 */
export interface ProductConfiguration {
  /** Product variant ID */
  variantId: string;
  /** Selected frame option ID */
  frameOptionId?: string;
  /** Selected mat option ID */
  matOptionId?: string;
  /** Selected glass option ID */
  glassOptionId?: string;
  /** Custom instructions */
  customInstructions?: string;
  /** Gift wrapping requested */
  isGiftWrapped?: boolean;
}

/**
 * Calculated price breakdown for a configured product
 */
export interface ProductPriceBreakdown {
  /** Base price of the variant */
  basePrice: number;
  /** Frame price addition */
  framePrice: number;
  /** Mat price addition */
  matPrice: number;
  /** Glass price addition */
  glassPrice: number;
  /** Gift wrap price addition */
  giftWrapPrice: number;
  /** Subtotal before discounts */
  subtotal: number;
  /** Discount amount */
  discount: number;
  /** Final total */
  total: number;
  /** Currency code */
  currency: string;
}
