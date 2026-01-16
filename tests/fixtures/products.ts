/**
 * Test Fixtures for Products
 *
 * Provides reusable test data for product-related tests
 */

export interface ProductImage {
  url: string;
  alt: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sizeLabel: string;
  widthInches: number;
  heightInches: number;
  price: string;
  stockQuantity: number;
  createdAt: Date;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  slug: string;
  description: string;
  basePrice: string;
  styles: string[];
  subjects: string[];
  colors: string[];
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round';
  artistId?: string;
  images: ProductImage[];
  seoTitle: string;
  seoDescription: string;
  status: 'draft' | 'active' | 'archived';
  featuredOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Frame {
  id: string;
  name: string;
  type: string;
  material: string;
  priceModifier: string;
  imageUrl: string;
  isActive: boolean;
}

/**
 * Create a test product with optional overrides
 */
export function createProduct(overrides?: Partial<Product>): Product {
  const now = new Date();

  return {
    id: 'prod_1234567890',
    sku: 'TX234',
    title: 'Ocean Waves Abstract Poster',
    slug: 'ocean-waves-abstract-tx234',
    description: 'A serene minimalist abstract representation of ocean waves in calming blue and beige tones. Perfect for creating a peaceful atmosphere in your living space.',
    basePrice: '1499.00',
    styles: ['wabi-sabi', 'minimalist', 'abstract'],
    subjects: ['sea', 'abstract', 'nature'],
    colors: ['blue', 'beige', 'white'],
    orientation: 'landscape',
    artistId: 'artist_001',
    images: [
      {
        url: 'https://cdn.example.com/products/tx234-main.jpg',
        alt: 'Ocean Waves Abstract Poster - Main View',
        width: 2000,
        height: 1500,
        isPrimary: true,
      },
      {
        url: 'https://cdn.example.com/products/tx234-room.jpg',
        alt: 'Ocean Waves Abstract Poster - Room Setting',
        width: 2000,
        height: 1500,
        isPrimary: false,
      },
      {
        url: 'https://cdn.example.com/products/tx234-detail.jpg',
        alt: 'Ocean Waves Abstract Poster - Detail View',
        width: 2000,
        height: 1500,
        isPrimary: false,
      },
    ],
    seoTitle: 'Ocean Waves Abstract Poster - Modern Minimalist Wall Art',
    seoDescription: 'Transform your space with this serene ocean waves abstract poster. Minimalist design in calming blue tones. Available in multiple sizes with frame options.',
    status: 'active',
    featuredOrder: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a product variant with optional overrides
 */
export function createProductVariant(overrides?: Partial<ProductVariant>): ProductVariant {
  return {
    id: 'variant_1234567890',
    productId: 'prod_1234567890',
    sizeLabel: '24x32 inches',
    widthInches: 24,
    heightInches: 32,
    price: '2499.00',
    stockQuantity: 50,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a frame option with optional overrides
 */
export function createFrame(overrides?: Partial<Frame>): Frame {
  return {
    id: 'frame_001',
    name: 'Black Frame',
    type: 'black',
    material: 'Wood',
    priceModifier: '1.40',
    imageUrl: 'https://cdn.example.com/frames/black-frame.jpg',
    isActive: true,
    ...overrides,
  };
}

/**
 * Create multiple test products
 */
export function createProducts(count: number = 5): Product[] {
  const products: Product[] = [];

  const templates = [
    {
      sku: 'TX234',
      title: 'Ocean Waves Abstract Poster',
      slug: 'ocean-waves-abstract-tx234',
      styles: ['wabi-sabi', 'minimalist'],
      subjects: ['sea', 'abstract'],
      colors: ['blue', 'beige'],
      orientation: 'landscape' as const,
    },
    {
      sku: 'TX235',
      title: 'Mountain Peaks Minimalist',
      slug: 'mountain-peaks-minimalist-tx235',
      styles: ['minimalist', 'modern'],
      subjects: ['mountains', 'landscape'],
      colors: ['black', 'white', 'grey'],
      orientation: 'portrait' as const,
    },
    {
      sku: 'TX236',
      title: 'Botanical Line Art',
      slug: 'botanical-line-art-tx236',
      styles: ['botanical', 'line-art'],
      subjects: ['botanical', 'flowers'],
      colors: ['black', 'white'],
      orientation: 'square' as const,
    },
    {
      sku: 'TX237',
      title: 'Abstract Expression Bold',
      slug: 'abstract-expression-bold-tx237',
      styles: ['abstract', 'modern'],
      subjects: ['abstract', 'geometric'],
      colors: ['red', 'black', 'white'],
      orientation: 'square' as const,
    },
    {
      sku: 'TX238',
      title: 'Vintage Travel Poster Paris',
      slug: 'vintage-travel-poster-paris-tx238',
      styles: ['vintage', 'retro'],
      subjects: ['city', 'travel'],
      colors: ['beige', 'gold', 'black'],
      orientation: 'portrait' as const,
    },
  ];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    products.push(createProduct({
      id: `prod_${i.toString().padStart(10, '0')}`,
      ...template,
      basePrice: (1499 + i * 200).toFixed(2),
      featuredOrder: i + 1,
    }));
  }

  return products;
}

/**
 * Create multiple product variants for a product
 */
export function createProductVariants(productId: string): ProductVariant[] {
  const sizes = [
    { label: '12x16 inches', width: 12, height: 16, price: '1499.00' },
    { label: '16x20 inches', width: 16, height: 20, price: '1899.00' },
    { label: '18x24 inches', width: 18, height: 24, price: '2299.00' },
    { label: '24x32 inches', width: 24, height: 32, price: '2899.00' },
    { label: '30x40 inches', width: 30, height: 40, price: '3999.00' },
  ];

  return sizes.map((size, index) =>
    createProductVariant({
      id: `variant_${productId}_${index}`,
      productId,
      sizeLabel: size.label,
      widthInches: size.width,
      heightInches: size.height,
      price: size.price,
      stockQuantity: 50 - index * 5,
    })
  );
}

/**
 * Create multiple frame options
 */
export function createFrames(): Frame[] {
  const frameTypes = [
    { name: 'Black Frame', type: 'black', priceModifier: '1.40' },
    { name: 'White Frame', type: 'white', priceModifier: '1.40' },
    { name: 'Natural Wood Frame', type: 'wood-light', priceModifier: '1.45' },
    { name: 'Dark Wood Frame', type: 'wood-dark', priceModifier: '1.45' },
    { name: 'Gold Frame', type: 'gold', priceModifier: '1.50' },
    { name: 'Silver Frame', type: 'silver', priceModifier: '1.50' },
  ];

  return frameTypes.map((frame, index) =>
    createFrame({
      id: `frame_${String(index + 1).padStart(3, '0')}`,
      name: frame.name,
      type: frame.type,
      priceModifier: frame.priceModifier,
      imageUrl: `https://cdn.example.com/frames/${frame.type}.jpg`,
    })
  );
}

/**
 * Create an AI-generated product
 */
export function createAIGeneratedProduct(overrides?: Partial<Product>): Product {
  return createProduct({
    sku: 'AI-' + Date.now().toString().slice(-6),
    title: 'AI Generated Abstract Art',
    slug: `ai-generated-abstract-${Date.now().toString().slice(-6)}`,
    description: 'Unique AI-generated artwork created from custom prompt. One-of-a-kind design.',
    styles: ['abstract', 'modern', 'ai-generated'],
    subjects: ['abstract', 'custom'],
    colors: ['multi'],
    basePrice: '2499.00',
    ...overrides,
  });
}
