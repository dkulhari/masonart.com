/**
 * Product Types for chobii.art Platform
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
  | 'wabi-sabi'
  | 'minimalist'
  | 'abstract'
  | 'modern-contemporary'
  | 'vintage'
  | 'retro'
  | 'pop-art'
  | 'bohemian'
  | 'surrealist'
  | 'photographic'
  | 'typography'
  | 'quotes'
  | 'texture-art';

/**
 * Poster subject categories
 */
export type PosterSubject =
  | 'nature-landscape'
  | 'flowers-botanical'
  | 'animals'
  | 'abstract-geometric'
  | 'people-portraits'
  | 'city-architecture'
  | 'sea-ocean'
  | 'mountains'
  | 'motivational'
  | 'ai-generated';

/**
 * Product color options
 */
export type ProductColor =
  | 'black'
  | 'white'
  | 'beige'
  | 'neutral'
  | 'blue'
  | 'green'
  | 'gold'
  | 'pink'
  | 'red'
  | 'grey'
  | 'black-white'
  | 'colorful'
  | 'multi'
  | 'earth-tones';

/**
 * Poster orientation types
 */
export type PosterOrientation =
  | 'square'
  | 'portrait'
  | 'landscape'
  | 'panoramic'
  | 'round'
  | 'circular'
  | 'diptych'
  | 'triptych';

/**
 * Room suggestion categories
 */
export type RoomType =
  | 'living-room'
  | 'bedroom'
  | 'office'
  | 'kitchen-dining'
  | 'kids-room'
  | 'bathroom'
  | 'entryway';

/**
 * Price tier levels
 */
export type PriceTier = 1 | 2 | 3 | 4;

/**
 * Frame type options
 */
export type FrameType =
  | 'poster-only'
  | 'stretched-canvas'
  | 'black-frame'
  | 'white-frame'
  | 'natural-wood-frame'
  | 'dark-wood-frame'
  | 'gold-frame'
  | 'silver-frame'
  | 'floating-frame';

/**
 * Mat/mount options for framed products
 */
export type MatOption =
  | 'no-mat'
  | 'white-mat'
  | 'off-white-mat'
  | 'black-mat'
  | 'double-mat';

/**
 * Glass/acrylic options for framed products
 */
export type GlassOption =
  | 'standard-glass'
  | 'non-glare-glass'
  | 'acrylic'
  | 'plexiglass'
  | 'museum-glass';

/**
 * Product status for inventory management
 */
export type ProductStatus =
  | 'draft'
  | 'active'
  | 'out-of-stock'
  | 'discontinued'
  | 'coming-soon';

/**
 * Collection types
 */
export type CollectionType =
  | 'new-arrivals'
  | 'best-sellers'
  | 'staff-picks'
  | 'seasonal'
  | 'sale'
  | 'ai-generated-gallery';

// ============================================================================
// Size Types
// ============================================================================

/**
 * Unit of measurement for sizes
 */
export type SizeUnit = 'inches' | 'cm';

/**
 * Size category based on orientation
 */
export type SizeCategory = 'square' | 'portrait-landscape' | 'panoramic';

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
  /**
   * Both units inline (e.g. `36" × 48" / 91 × 122 cm`).
   *
   * mesonart prints every size this way rather than offering a unit toggle,
   * so the list is scannable in either system at once. This is what gets
   * written to `product_variants.size_label`.
   */
  displayLabelDual: string;
}

// ============================================================================
// Frame Types
// ============================================================================

/**
 * Price modifier configuration
 */
export interface PriceModifier {
  /** Type of modifier: percentage or fixed amount */
  type: 'percentage' | 'fixed';
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
 * Mat colour baked into product artwork by sharp at upload time.
 *
 * IMPORTANT: this MUST stay in sync with the `--mat` CSS token. Both are
 * visible — the CSS token while the image loads, the baked pixels afterwards —
 * so a mismatch makes every card flash one colour then settle to another.
 * Changing this value requires reprocessing every product image.
 *
 * Value measured from mesonart.com's `--color-placeholder`.
 */
export const MAT_COLOR = { r: 250, g: 250, b: 250 } as const;

/** Square master size for every stored product image. */
export const MAT_CANVAS = 1500;

/**
 * Artwork occupies this fraction of the longest side, leaving a visible mat.
 *
 * Plain `fit: 'contain'` would give square art a 0% mat, so square products
 * would bleed to the card edge while portrait products floated — inconsistent
 * across a row. The inset guarantees a minimum 6% margin on every product.
 */
export const MAT_ART_INSET = 0.88;

/**
 * Image type for product images.
 *
 * Determines how the upload pipeline squares the image:
 * - `main` is matted (contained at MAT_ART_INSET, never cropped)
 * - every other type is cropped to a human-chosen window and fills the frame
 */
export type ProductImageType =
  | 'main'
  | 'detail'
  | 'texture'
  | 'room-mockup'
  | 'frame-preview'
  | '360-view';

/**
 * A crop window, normalised 0..1 against the ORIGINAL upload.
 *
 * Normalised rather than pixel coordinates so it survives any future re-encode
 * or resize of the source.
 */
export interface ImageCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A responsive variant of a product image.
 */
export interface ImageVariant {
  name: string;
  width: number;
  url: string;
}

/**
 * Product image definition.
 *
 * CONTRACT: `width === height`, always. The product grid's row alignment
 * depends on it — the in-flow card image declares `aspect-square`, and any
 * non-square asset would either be silently cropped or double-matted. The
 * upload pipeline enforces this; the card asserts it in development.
 */
export interface ProductImage {
  /** Unique identifier */
  id: string;
  /** Processed square WebP URL */
  url: string;
  /** Thumbnail URL */
  thumbnailUrl?: string;
  /** Alt text for accessibility and SEO */
  altText: string;
  /** Image type */
  type: ProductImageType;
  /** Sort order; `images[0]` after sorting is the `main` image */
  sortOrder: number;
  /** Width in pixels. Always equal to `height`. */
  width: number;
  /** Height in pixels. Always equal to `width`. */
  height: number;
  /** Responsive variants, all sharing the same square ratio */
  variants?: ImageVariant[];
  /** Human-chosen crop window. Absent for `main`, which is matted, never cropped. */
  crop?: ImageCrop;
  /** Storage key of the unprocessed upload. Load-bearing: required to revise a crop. */
  originalKey: string;
}

/**
 * Guard for the square contract. Used by the card in development to surface a
 * bad asset loudly rather than letting `object-contain` quietly double-mat it.
 */
export const isSquare = (
  img: Pick<ProductImage, 'width' | 'height'>
): boolean => img.width === img.height;

/**
 * Images in display order: `main` first, then the rest by `sortOrder`.
 *
 * Callers should not sort by hand — the card relies on `images[0]` being the
 * in-flow image that sets the media box height.
 */
export function sortedImages<T extends Pick<ProductImage, 'type' | 'sortOrder'>>(
  images: readonly T[]
): T[] {
  return [...images].sort((a, b) => {
    if (a.type === 'main' && b.type !== 'main') return -1;
    if (b.type === 'main' && a.type !== 'main') return 1;
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * The primary image for a product.
 *
 * Replaces the old `images.find(i => i.isPrimary) || images[0]` idiom, which
 * was repeated across seven call-sites with subtly different fallbacks.
 * Prefers `type: 'main'`, then the lowest `sortOrder`, then the first entry.
 */
export function mainImage<T extends Pick<ProductImage, 'type' | 'sortOrder'>>(
  images: readonly T[] | null | undefined
): T | undefined {
  if (!images?.length) return undefined;
  return sortedImages(images)[0];
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
  artist?: Pick<Artist, 'id' | 'name' | 'slug' | 'profileImageUrl'>;

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
  artist?: Pick<Artist, 'id' | 'name' | 'slug'>;
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
  | 'createdAt'
  | 'updatedAt'
  | 'title'
  | 'minPrice'
  | 'maxPrice'
  | 'rating'
  | 'popularity';

export type SortDirection = 'asc' | 'desc';

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
