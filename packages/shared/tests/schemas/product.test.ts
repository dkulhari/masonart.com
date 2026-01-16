/**
 * Product Schema Tests
 *
 * Comprehensive tests for product-related Zod schemas including:
 * - Product validation
 * - Product variant validation
 * - Product image validation
 * - Frame validation
 * - Product filter validation
 */

import { describe, it, expect } from 'vitest';
import {
  ProductSchema,
  ProductCreateSchema,
  ProductUpdateSchema,
  ProductVariantSchema,
  ProductVariantCreateSchema,
  ProductImageSchema,
  FrameSchema,
  FrameCreateSchema,
  ProductFilterSchema,
  ProductStatusSchema,
  ProductOrientationSchema,
} from '../../src/schemas/product.js';

describe('Product Image Schema', () => {
  it('should validate a valid product image', () => {
    const validImage = {
      url: 'https://cdn.example.com/image.jpg',
      alt: 'Product Image',
      width: 2000,
      height: 1500,
      isPrimary: true,
    };

    const result = ProductImageSchema.safeParse(validImage);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validImage);
    }
  });

  it('should reject invalid URL', () => {
    const invalidImage = {
      url: 'not-a-url',
      alt: 'Product Image',
      width: 2000,
      height: 1500,
      isPrimary: true,
    };

    const result = ProductImageSchema.safeParse(invalidImage);
    expect(result.success).toBe(false);
  });

  it('should reject missing alt text', () => {
    const invalidImage = {
      url: 'https://cdn.example.com/image.jpg',
      alt: '',
      width: 2000,
      height: 1500,
      isPrimary: true,
    };

    const result = ProductImageSchema.safeParse(invalidImage);
    expect(result.success).toBe(false);
  });

  it('should reject negative dimensions', () => {
    const invalidImage = {
      url: 'https://cdn.example.com/image.jpg',
      alt: 'Product Image',
      width: -100,
      height: 1500,
      isPrimary: true,
    };

    const result = ProductImageSchema.safeParse(invalidImage);
    expect(result.success).toBe(false);
  });

  it('should reject zero dimensions', () => {
    const invalidImage = {
      url: 'https://cdn.example.com/image.jpg',
      alt: 'Product Image',
      width: 0,
      height: 1500,
      isPrimary: true,
    };

    const result = ProductImageSchema.safeParse(invalidImage);
    expect(result.success).toBe(false);
  });

  it('should reject non-integer dimensions', () => {
    const invalidImage = {
      url: 'https://cdn.example.com/image.jpg',
      alt: 'Product Image',
      width: 100.5,
      height: 1500,
      isPrimary: true,
    };

    const result = ProductImageSchema.safeParse(invalidImage);
    expect(result.success).toBe(false);
  });

  it('should require isPrimary boolean', () => {
    const invalidImage = {
      url: 'https://cdn.example.com/image.jpg',
      alt: 'Product Image',
      width: 2000,
      height: 1500,
    };

    const result = ProductImageSchema.safeParse(invalidImage);
    expect(result.success).toBe(false);
  });
});

describe('Product Status Schema', () => {
  it('should accept valid statuses', () => {
    expect(ProductStatusSchema.safeParse('draft').success).toBe(true);
    expect(ProductStatusSchema.safeParse('active').success).toBe(true);
    expect(ProductStatusSchema.safeParse('archived').success).toBe(true);
  });

  it('should reject invalid statuses', () => {
    expect(ProductStatusSchema.safeParse('published').success).toBe(false);
    expect(ProductStatusSchema.safeParse('pending').success).toBe(false);
    expect(ProductStatusSchema.safeParse('').success).toBe(false);
  });
});

describe('Product Orientation Schema', () => {
  it('should accept valid orientations', () => {
    expect(ProductOrientationSchema.safeParse('square').success).toBe(true);
    expect(ProductOrientationSchema.safeParse('portrait').success).toBe(true);
    expect(ProductOrientationSchema.safeParse('landscape').success).toBe(true);
    expect(ProductOrientationSchema.safeParse('panoramic').success).toBe(true);
    expect(ProductOrientationSchema.safeParse('round').success).toBe(true);
  });

  it('should reject invalid orientations', () => {
    expect(ProductOrientationSchema.safeParse('vertical').success).toBe(false);
    expect(ProductOrientationSchema.safeParse('horizontal').success).toBe(false);
    expect(ProductOrientationSchema.safeParse('').success).toBe(false);
  });
});

describe('Product Schema', () => {
  const validProduct = {
    id: 'prod_1234567890',
    sku: 'TX234',
    title: 'Ocean Waves Abstract Poster',
    slug: 'ocean-waves-abstract-tx234',
    description: 'A serene minimalist abstract representation of ocean waves in calming blue and beige tones.',
    basePrice: '1499.00',
    styles: ['wabi-sabi', 'minimalist', 'abstract'],
    subjects: ['sea', 'abstract', 'nature'],
    colors: ['blue', 'beige', 'white'],
    orientation: 'landscape' as const,
    artistId: 'artist_001',
    images: [
      {
        url: 'https://cdn.example.com/products/tx234-main.jpg',
        alt: 'Ocean Waves Abstract Poster - Main View',
        width: 2000,
        height: 1500,
        isPrimary: true,
      },
    ],
    seoTitle: 'Ocean Waves Abstract Poster - Modern Minimalist Wall Art',
    seoDescription: 'Transform your space with this serene ocean waves abstract poster.',
    status: 'active' as const,
    featuredOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should validate a complete valid product', () => {
    const result = ProductSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it('should validate product without optional fields', () => {
    const { artistId, featuredOrder, ...requiredFields } = validProduct;
    const result = ProductSchema.safeParse(requiredFields);
    expect(result.success).toBe(true);
  });

  describe('Product ID validation', () => {
    it('should reject empty product ID', () => {
      const invalid = { ...validProduct, id: '' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing product ID', () => {
      const { id, ...invalid } = validProduct;
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('SKU validation', () => {
    it('should accept valid SKU formats', () => {
      const validSKUs = ['TX234', 'AI-123456', 'POSTER-001', 'ABC123'];
      validSKUs.forEach(sku => {
        const product = { ...validProduct, sku };
        const result = ProductSchema.safeParse(product);
        expect(result.success).toBe(true);
      });
    });

    it('should reject lowercase SKU', () => {
      const invalid = { ...validProduct, sku: 'tx234' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject SKU with spaces', () => {
      const invalid = { ...validProduct, sku: 'TX 234' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject SKU with special characters', () => {
      const invalid = { ...validProduct, sku: 'TX@234' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty SKU', () => {
      const invalid = { ...validProduct, sku: '' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Title validation', () => {
    it('should accept titles up to 200 characters', () => {
      const longTitle = 'A'.repeat(200);
      const product = { ...validProduct, title: longTitle };
      const result = ProductSchema.safeParse(product);
      expect(result.success).toBe(true);
    });

    it('should reject titles over 200 characters', () => {
      const tooLongTitle = 'A'.repeat(201);
      const product = { ...validProduct, title: tooLongTitle };
      const result = ProductSchema.safeParse(product);
      expect(result.success).toBe(false);
    });

    it('should reject empty title', () => {
      const invalid = { ...validProduct, title: '' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Slug validation', () => {
    it('should accept valid slug formats', () => {
      const validSlugs = [
        'ocean-waves-abstract-tx234',
        'simple-poster',
        'poster-123',
        'a-very-long-slug-with-many-words',
      ];
      validSlugs.forEach(slug => {
        const product = { ...validProduct, slug };
        const result = ProductSchema.safeParse(product);
        expect(result.success).toBe(true);
      });
    });

    it('should reject slug with uppercase letters', () => {
      const invalid = { ...validProduct, slug: 'Ocean-Waves' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject slug with spaces', () => {
      const invalid = { ...validProduct, slug: 'ocean waves' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject slug with underscores', () => {
      const invalid = { ...validProduct, slug: 'ocean_waves' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty slug', () => {
      const invalid = { ...validProduct, slug: '' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Description validation', () => {
    it('should accept descriptions between 10 and 2000 characters', () => {
      const minDesc = 'A'.repeat(10);
      const maxDesc = 'A'.repeat(2000);

      expect(ProductSchema.safeParse({ ...validProduct, description: minDesc }).success).toBe(true);
      expect(ProductSchema.safeParse({ ...validProduct, description: maxDesc }).success).toBe(true);
    });

    it('should reject descriptions under 10 characters', () => {
      const invalid = { ...validProduct, description: 'Short' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject descriptions over 2000 characters', () => {
      const tooLong = 'A'.repeat(2001);
      const invalid = { ...validProduct, description: tooLong };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Price validation', () => {
    it('should accept valid price formats', () => {
      const validPrices = ['0.00', '10.99', '1499.00', '9999.99', '99999.00'];
      validPrices.forEach(price => {
        const product = { ...validProduct, basePrice: price };
        const result = ProductSchema.safeParse(product);
        expect(result.success).toBe(true);
      });
    });

    it('should reject price without decimal places', () => {
      const invalid = { ...validProduct, basePrice: '1499' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject price with one decimal place', () => {
      const invalid = { ...validProduct, basePrice: '1499.0' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject price with three decimal places', () => {
      const invalid = { ...validProduct, basePrice: '1499.000' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject price with currency symbol', () => {
      const invalid = { ...validProduct, basePrice: '$1499.00' };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Styles, Subjects, and Colors validation', () => {
    it('should require at least one style', () => {
      const invalid = { ...validProduct, styles: [] };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should accept up to 10 styles', () => {
      const styles = Array(10).fill('style');
      const product = { ...validProduct, styles };
      const result = ProductSchema.safeParse(product);
      expect(result.success).toBe(true);
    });

    it('should reject more than 10 styles', () => {
      const styles = Array(11).fill('style');
      const invalid = { ...validProduct, styles };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should require at least one subject', () => {
      const invalid = { ...validProduct, subjects: [] };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should require at least one color', () => {
      const invalid = { ...validProduct, colors: [] };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty strings in arrays', () => {
      const invalid = { ...validProduct, styles: ['valid', ''] };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Images validation', () => {
    it('should require at least one image', () => {
      const invalid = { ...validProduct, images: [] };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should accept up to 10 images', () => {
      const images = Array(10).fill({
        url: 'https://cdn.example.com/image.jpg',
        alt: 'Image',
        width: 2000,
        height: 1500,
        isPrimary: false,
      });
      const product = { ...validProduct, images };
      const result = ProductSchema.safeParse(product);
      expect(result.success).toBe(true);
    });

    it('should reject more than 10 images', () => {
      const images = Array(11).fill({
        url: 'https://cdn.example.com/image.jpg',
        alt: 'Image',
        width: 2000,
        height: 1500,
        isPrimary: false,
      });
      const invalid = { ...validProduct, images };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate all images in array', () => {
      const images = [
        {
          url: 'https://cdn.example.com/image.jpg',
          alt: 'Image 1',
          width: 2000,
          height: 1500,
          isPrimary: true,
        },
        {
          url: 'not-a-url',
          alt: 'Image 2',
          width: 2000,
          height: 1500,
          isPrimary: false,
        },
      ];
      const invalid = { ...validProduct, images };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('SEO validation', () => {
    it('should accept SEO title up to 70 characters', () => {
      const seoTitle = 'A'.repeat(70);
      const product = { ...validProduct, seoTitle };
      const result = ProductSchema.safeParse(product);
      expect(result.success).toBe(true);
    });

    it('should reject SEO title over 70 characters', () => {
      const seoTitle = 'A'.repeat(71);
      const invalid = { ...validProduct, seoTitle };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should accept SEO description up to 160 characters', () => {
      const seoDescription = 'A'.repeat(160);
      const product = { ...validProduct, seoDescription };
      const result = ProductSchema.safeParse(product);
      expect(result.success).toBe(true);
    });

    it('should reject SEO description over 160 characters', () => {
      const seoDescription = 'A'.repeat(161);
      const invalid = { ...validProduct, seoDescription };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty SEO fields', () => {
      expect(ProductSchema.safeParse({ ...validProduct, seoTitle: '' }).success).toBe(false);
      expect(ProductSchema.safeParse({ ...validProduct, seoDescription: '' }).success).toBe(false);
    });
  });

  describe('Featured order validation', () => {
    it('should accept positive integers', () => {
      const validOrders = [1, 5, 10, 100, 999];
      validOrders.forEach(order => {
        const product = { ...validProduct, featuredOrder: order };
        const result = ProductSchema.safeParse(product);
        expect(result.success).toBe(true);
      });
    });

    it('should reject zero', () => {
      const invalid = { ...validProduct, featuredOrder: 0 };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject negative numbers', () => {
      const invalid = { ...validProduct, featuredOrder: -1 };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject non-integers', () => {
      const invalid = { ...validProduct, featuredOrder: 1.5 };
      const result = ProductSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

describe('Product Create Schema', () => {
  it('should accept product data without id, createdAt, updatedAt', () => {
    const productCreate = {
      sku: 'TX234',
      title: 'Ocean Waves Abstract Poster',
      slug: 'ocean-waves-abstract-tx234',
      description: 'A serene minimalist abstract representation.',
      basePrice: '1499.00',
      styles: ['wabi-sabi'],
      subjects: ['sea'],
      colors: ['blue'],
      orientation: 'landscape' as const,
      images: [
        {
          url: 'https://cdn.example.com/image.jpg',
          alt: 'Image',
          width: 2000,
          height: 1500,
          isPrimary: true,
        },
      ],
      seoTitle: 'Ocean Waves',
      seoDescription: 'Beautiful ocean waves poster',
      status: 'active' as const,
    };

    const result = ProductCreateSchema.safeParse(productCreate);
    expect(result.success).toBe(true);
  });

  it('should reject if id is present', () => {
    const invalid = {
      id: 'prod_123',
      sku: 'TX234',
      title: 'Ocean Waves',
      slug: 'ocean-waves',
      description: 'A serene minimalist abstract representation.',
      basePrice: '1499.00',
      styles: ['wabi-sabi'],
      subjects: ['sea'],
      colors: ['blue'],
      orientation: 'landscape' as const,
      images: [
        {
          url: 'https://cdn.example.com/image.jpg',
          alt: 'Image',
          width: 2000,
          height: 1500,
          isPrimary: true,
        },
      ],
      seoTitle: 'Ocean Waves',
      seoDescription: 'Beautiful ocean waves poster',
      status: 'active' as const,
    };

    const result = ProductCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('Product Update Schema', () => {
  it('should require id field', () => {
    const update = { title: 'New Title' };
    const result = ProductUpdateSchema.safeParse(update);
    expect(result.success).toBe(false);
  });

  it('should accept partial updates with id', () => {
    const update = {
      id: 'prod_123',
      title: 'New Title',
      basePrice: '1999.00',
    };
    const result = ProductUpdateSchema.safeParse(update);
    expect(result.success).toBe(true);
  });

  it('should validate partial fields', () => {
    const invalidUpdate = {
      id: 'prod_123',
      sku: 'invalid lowercase',
    };
    const result = ProductUpdateSchema.safeParse(invalidUpdate);
    expect(result.success).toBe(false);
  });
});

describe('Product Variant Schema', () => {
  const validVariant = {
    id: 'variant_123',
    productId: 'prod_123',
    sizeLabel: '24x32 inches',
    widthInches: 24,
    heightInches: 32,
    price: '2499.00',
    stockQuantity: 50,
    createdAt: new Date(),
  };

  it('should validate a complete valid variant', () => {
    const result = ProductVariantSchema.safeParse(validVariant);
    expect(result.success).toBe(true);
  });

  describe('Size label validation', () => {
    it('should accept valid size formats', () => {
      const validLabels = [
        '12x16 inches',
        '24x32 inches',
        '30x40 cm',
        '50x70 cm',
      ];
      validLabels.forEach(sizeLabel => {
        const variant = { ...validVariant, sizeLabel };
        const result = ProductVariantSchema.safeParse(variant);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid size formats', () => {
      const invalidLabels = [
        '12 x 16 inches',
        '12x16',
        '12x16in',
        'small',
        '12x16"',
      ];
      invalidLabels.forEach(sizeLabel => {
        const variant = { ...validVariant, sizeLabel };
        const result = ProductVariantSchema.safeParse(variant);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Dimensions validation', () => {
    it('should reject zero dimensions', () => {
      expect(ProductVariantSchema.safeParse({ ...validVariant, widthInches: 0 }).success).toBe(false);
      expect(ProductVariantSchema.safeParse({ ...validVariant, heightInches: 0 }).success).toBe(false);
    });

    it('should reject negative dimensions', () => {
      expect(ProductVariantSchema.safeParse({ ...validVariant, widthInches: -10 }).success).toBe(false);
      expect(ProductVariantSchema.safeParse({ ...validVariant, heightInches: -10 }).success).toBe(false);
    });
  });

  describe('Stock quantity validation', () => {
    it('should accept zero stock', () => {
      const variant = { ...validVariant, stockQuantity: 0 };
      const result = ProductVariantSchema.safeParse(variant);
      expect(result.success).toBe(true);
    });

    it('should reject negative stock', () => {
      const variant = { ...validVariant, stockQuantity: -1 };
      const result = ProductVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer stock', () => {
      const variant = { ...validVariant, stockQuantity: 10.5 };
      const result = ProductVariantSchema.safeParse(variant);
      expect(result.success).toBe(false);
    });
  });
});

describe('Product Variant Create Schema', () => {
  it('should accept variant data without id and createdAt', () => {
    const variantCreate = {
      productId: 'prod_123',
      sizeLabel: '24x32 inches',
      widthInches: 24,
      heightInches: 32,
      price: '2499.00',
      stockQuantity: 50,
    };

    const result = ProductVariantCreateSchema.safeParse(variantCreate);
    expect(result.success).toBe(true);
  });
});

describe('Frame Schema', () => {
  const validFrame = {
    id: 'frame_001',
    name: 'Black Frame',
    type: 'black',
    material: 'Wood',
    priceModifier: '1.40',
    imageUrl: 'https://cdn.example.com/frames/black.jpg',
    isActive: true,
  };

  it('should validate a complete valid frame', () => {
    const result = FrameSchema.safeParse(validFrame);
    expect(result.success).toBe(true);
  });

  describe('Frame type validation', () => {
    it('should accept valid frame types', () => {
      const validTypes = ['black', 'white', 'wood-light', 'wood-dark', 'gold', 'silver'];
      validTypes.forEach(type => {
        const frame = { ...validFrame, type };
        const result = FrameSchema.safeParse(frame);
        expect(result.success).toBe(true);
      });
    });

    it('should reject frame types with uppercase', () => {
      const invalid = { ...validFrame, type: 'Black' };
      const result = FrameSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject frame types with spaces', () => {
      const invalid = { ...validFrame, type: 'wood light' };
      const result = FrameSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Frame name validation', () => {
    it('should accept names up to 100 characters', () => {
      const name = 'A'.repeat(100);
      const frame = { ...validFrame, name };
      const result = FrameSchema.safeParse(frame);
      expect(result.success).toBe(true);
    });

    it('should reject names over 100 characters', () => {
      const name = 'A'.repeat(101);
      const invalid = { ...validFrame, name };
      const result = FrameSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const invalid = { ...validFrame, name: '' };
      const result = FrameSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Price modifier validation', () => {
    it('should accept valid price modifiers', () => {
      const validModifiers = ['1.00', '1.40', '1.50', '2.00', '0.50'];
      validModifiers.forEach(priceModifier => {
        const frame = { ...validFrame, priceModifier };
        const result = FrameSchema.safeParse(frame);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid formats', () => {
      const invalidModifiers = ['1', '1.4', '1.400', '40%', 'x1.40'];
      invalidModifiers.forEach(priceModifier => {
        const frame = { ...validFrame, priceModifier };
        const result = FrameSchema.safeParse(frame);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Image URL validation', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'https://cdn.example.com/frame.jpg',
        'http://example.com/image.png',
        'https://example.com/path/to/image.webp',
      ];
      validUrls.forEach(imageUrl => {
        const frame = { ...validFrame, imageUrl };
        const result = FrameSchema.safeParse(frame);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid URLs', () => {
      const invalid = { ...validFrame, imageUrl: 'not-a-url' };
      const result = FrameSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

describe('Frame Create Schema', () => {
  it('should accept frame data without id', () => {
    const frameCreate = {
      name: 'Black Frame',
      type: 'black',
      material: 'Wood',
      priceModifier: '1.40',
      imageUrl: 'https://cdn.example.com/frame.jpg',
      isActive: true,
    };

    const result = FrameCreateSchema.safeParse(frameCreate);
    expect(result.success).toBe(true);
  });
});

describe('Product Filter Schema', () => {
  it('should accept empty filter', () => {
    const result = ProductFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial filters', () => {
    const filters = [
      { styles: ['minimalist'] },
      { subjects: ['nature', 'abstract'] },
      { colors: ['blue'] },
      { orientation: 'landscape' as const },
      { status: 'active' as const },
      { minPrice: '100.00' },
      { maxPrice: '5000.00' },
      { search: 'ocean' },
      { limit: 20 },
      { offset: 40 },
    ];

    filters.forEach(filter => {
      const result = ProductFilterSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });
  });

  it('should accept combined filters', () => {
    const filter = {
      styles: ['minimalist', 'abstract'],
      subjects: ['nature'],
      colors: ['blue', 'white'],
      orientation: 'landscape' as const,
      status: 'active' as const,
      minPrice: '1000.00',
      maxPrice: '5000.00',
      search: 'ocean waves',
      limit: 50,
      offset: 0,
    };

    const result = ProductFilterSchema.safeParse(filter);
    expect(result.success).toBe(true);
  });

  describe('Price filter validation', () => {
    it('should accept valid price formats', () => {
      const filter = { minPrice: '100.00', maxPrice: '5000.00' };
      const result = ProductFilterSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    it('should reject invalid price formats', () => {
      const invalidFilters = [
        { minPrice: '100' },
        { maxPrice: '5000.0' },
        { minPrice: '$100.00' },
      ];

      invalidFilters.forEach(filter => {
        const result = ProductFilterSchema.safeParse(filter);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Pagination validation', () => {
    it('should accept valid limit values', () => {
      const validLimits = [1, 10, 50, 100];
      validLimits.forEach(limit => {
        const result = ProductFilterSchema.safeParse({ limit });
        expect(result.success).toBe(true);
      });
    });

    it('should reject limit over 100', () => {
      const result = ProductFilterSchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should reject zero or negative limit', () => {
      expect(ProductFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(ProductFilterSchema.safeParse({ limit: -1 }).success).toBe(false);
    });

    it('should reject non-integer limit', () => {
      const result = ProductFilterSchema.safeParse({ limit: 10.5 });
      expect(result.success).toBe(false);
    });

    it('should accept zero offset', () => {
      const result = ProductFilterSchema.safeParse({ offset: 0 });
      expect(result.success).toBe(true);
    });

    it('should reject negative offset', () => {
      const result = ProductFilterSchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('Enum filter validation', () => {
    it('should reject invalid orientation', () => {
      const result = ProductFilterSchema.safeParse({ orientation: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const result = ProductFilterSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });
  });
});
