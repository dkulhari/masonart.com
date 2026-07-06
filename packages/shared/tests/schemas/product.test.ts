/**
 * Product Schema Tests
 *
 * Comprehensive tests for product-related Zod schemas including:
 * - Enum schemas (styles, subjects, colors, orientations, etc.)
 * - Size and frame configuration schemas
 * - Product image and SEO schemas
 * - Product variant schemas
 * - Main product schema
 * - Product listing and filter schemas
 * - Collection and configuration schemas
 * - Input schemas for create/update operations
 */

import { describe, it, expect } from "vitest";
import {
  // Enum schemas
  posterStyleSchema,
  posterSubjectSchema,
  productColorSchema,
  posterOrientationSchema,
  roomTypeSchema,
  priceTierSchema,
  frameTypeSchema,
  matOptionSchema,
  glassOptionSchema,
  productStatusSchema,
  collectionTypeSchema,
  sizeUnitSchema,
  sizeCategorySchema,
  productImageTypeSchema,
  productSortFieldSchema,
  sortDirectionSchema,
  // Object schemas
  productSizeSchema,
  priceModifierSchema,
  frameOptionSchema,
  matOptionConfigSchema,
  glassOptionConfigSchema,
  artistSocialLinksSchema,
  artistSchema,
  productImageSchema,
  productSEOSchema,
  productVariantSchema,
  productRatingSchema,
  productSchema,
  productListItemSchema,
  productFiltersSchema,
  productSortSchema,
  paginatedProductsSchema,
  collectionSchema,
  productConfigurationSchema,
  productPriceBreakdownSchema,
  // Input schemas
  createProductInputSchema,
  updateProductInputSchema,
  createArtistInputSchema,
  updateArtistInputSchema,
  createCollectionInputSchema,
  updateCollectionInputSchema,
} from "../../src/schemas/product.js";

// ============================================================================
// Enum Schema Tests
// ============================================================================

describe("Poster Style Schema", () => {
  it("should accept all valid poster styles", () => {
    const validStyles = [
      "wabi-sabi",
      "minimalist",
      "abstract",
      "modern-contemporary",
      "vintage",
      "retro",
      "pop-art",
      "bohemian",
      "surrealist",
      "photographic",
      "typography",
      "quotes",
      "texture-art",
    ];

    validStyles.forEach((style) => {
      const result = posterStyleSchema.safeParse(style);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(style);
      }
    });
  });

  it("should reject invalid poster styles", () => {
    const invalidStyles = ["modern", "classic", "traditional", "", "MINIMALIST", 123];
    invalidStyles.forEach((style) => {
      expect(posterStyleSchema.safeParse(style).success).toBe(false);
    });
  });
});

describe("Poster Subject Schema", () => {
  it("should accept all valid poster subjects", () => {
    const validSubjects = [
      "nature-landscape",
      "flowers-botanical",
      "animals",
      "abstract-geometric",
      "people-portraits",
      "city-architecture",
      "sea-ocean",
      "mountains",
      "motivational",
      "ai-generated",
    ];

    validSubjects.forEach((subject) => {
      const result = posterSubjectSchema.safeParse(subject);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid poster subjects", () => {
    expect(posterSubjectSchema.safeParse("nature").success).toBe(false);
    expect(posterSubjectSchema.safeParse("landscape").success).toBe(false);
    expect(posterSubjectSchema.safeParse("").success).toBe(false);
  });
});

describe("Product Color Schema", () => {
  it("should accept all valid product colors", () => {
    const validColors = [
      "black",
      "white",
      "beige",
      "neutral",
      "blue",
      "green",
      "gold",
      "pink",
      "red",
      "grey",
      "black-white",
      "colorful",
      "multi",
      "earth-tones",
    ];

    validColors.forEach((color) => {
      const result = productColorSchema.safeParse(color);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid colors", () => {
    expect(productColorSchema.safeParse("purple").success).toBe(false);
    expect(productColorSchema.safeParse("orange").success).toBe(false);
    expect(productColorSchema.safeParse("").success).toBe(false);
  });
});

describe("Poster Orientation Schema", () => {
  it("should accept all valid orientations", () => {
    const validOrientations = [
      "square",
      "portrait",
      "landscape",
      "panoramic",
      "round",
      "circular",
      "diptych",
      "triptych",
    ];

    validOrientations.forEach((orientation) => {
      const result = posterOrientationSchema.safeParse(orientation);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid orientations", () => {
    expect(posterOrientationSchema.safeParse("vertical").success).toBe(false);
    expect(posterOrientationSchema.safeParse("horizontal").success).toBe(false);
    expect(posterOrientationSchema.safeParse("").success).toBe(false);
  });
});

describe("Room Type Schema", () => {
  it("should accept all valid room types", () => {
    const validRooms = [
      "living-room",
      "bedroom",
      "office",
      "kitchen-dining",
      "kids-room",
      "bathroom",
      "entryway",
    ];

    validRooms.forEach((room) => {
      const result = roomTypeSchema.safeParse(room);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid room types", () => {
    expect(roomTypeSchema.safeParse("garage").success).toBe(false);
    expect(roomTypeSchema.safeParse("living room").success).toBe(false);
    expect(roomTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("Price Tier Schema", () => {
  it("should accept valid price tiers (1-4)", () => {
    [1, 2, 3, 4].forEach((tier) => {
      const result = priceTierSchema.safeParse(tier);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid price tiers", () => {
    expect(priceTierSchema.safeParse(0).success).toBe(false);
    expect(priceTierSchema.safeParse(5).success).toBe(false);
    expect(priceTierSchema.safeParse(-1).success).toBe(false);
    expect(priceTierSchema.safeParse("1").success).toBe(false);
    expect(priceTierSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("Frame Type Schema", () => {
  it("should accept all valid frame types", () => {
    const validFrameTypes = [
      "poster-only",
      "stretched-canvas",
      "black-frame",
      "white-frame",
      "natural-wood-frame",
      "dark-wood-frame",
      "gold-frame",
      "silver-frame",
      "floating-frame",
    ];

    validFrameTypes.forEach((type) => {
      const result = frameTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid frame types", () => {
    expect(frameTypeSchema.safeParse("metal-frame").success).toBe(false);
    expect(frameTypeSchema.safeParse("black").success).toBe(false);
    expect(frameTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("Mat Option Schema", () => {
  it("should accept all valid mat options", () => {
    const validMatOptions = ["no-mat", "white-mat", "off-white-mat", "black-mat", "double-mat"];

    validMatOptions.forEach((option) => {
      const result = matOptionSchema.safeParse(option);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid mat options", () => {
    expect(matOptionSchema.safeParse("grey-mat").success).toBe(false);
    expect(matOptionSchema.safeParse("mat").success).toBe(false);
    expect(matOptionSchema.safeParse("").success).toBe(false);
  });
});

describe("Glass Option Schema", () => {
  it("should accept all valid glass options", () => {
    const validGlassOptions = [
      "standard-glass",
      "non-glare-glass",
      "acrylic",
      "plexiglass",
      "museum-glass",
    ];

    validGlassOptions.forEach((option) => {
      const result = glassOptionSchema.safeParse(option);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid glass options", () => {
    expect(glassOptionSchema.safeParse("tempered-glass").success).toBe(false);
    expect(glassOptionSchema.safeParse("glass").success).toBe(false);
    expect(glassOptionSchema.safeParse("").success).toBe(false);
  });
});

describe("Product Status Schema", () => {
  it("should accept all valid product statuses", () => {
    const validStatuses = ["draft", "active", "out-of-stock", "discontinued", "coming-soon"];

    validStatuses.forEach((status) => {
      const result = productStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid statuses", () => {
    expect(productStatusSchema.safeParse("published").success).toBe(false);
    expect(productStatusSchema.safeParse("pending").success).toBe(false);
    expect(productStatusSchema.safeParse("archived").success).toBe(false);
    expect(productStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("Collection Type Schema", () => {
  it("should accept all valid collection types", () => {
    const validTypes = [
      "new-arrivals",
      "best-sellers",
      "staff-picks",
      "seasonal",
      "sale",
      "ai-generated-gallery",
    ];

    validTypes.forEach((type) => {
      const result = collectionTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    });
  });

  it("should reject invalid collection types", () => {
    expect(collectionTypeSchema.safeParse("featured").success).toBe(false);
    expect(collectionTypeSchema.safeParse("popular").success).toBe(false);
    expect(collectionTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("Size Unit Schema", () => {
  it("should accept valid size units", () => {
    expect(sizeUnitSchema.safeParse("inches").success).toBe(true);
    expect(sizeUnitSchema.safeParse("cm").success).toBe(true);
  });

  it("should reject invalid size units", () => {
    expect(sizeUnitSchema.safeParse("mm").success).toBe(false);
    expect(sizeUnitSchema.safeParse("ft").success).toBe(false);
    expect(sizeUnitSchema.safeParse("").success).toBe(false);
  });
});

describe("Size Category Schema", () => {
  it("should accept valid size categories", () => {
    const validCategories = ["square", "portrait-landscape", "panoramic"];

    validCategories.forEach((category) => {
      expect(sizeCategorySchema.safeParse(category).success).toBe(true);
    });
  });

  it("should reject invalid size categories", () => {
    expect(sizeCategorySchema.safeParse("small").success).toBe(false);
    expect(sizeCategorySchema.safeParse("large").success).toBe(false);
    expect(sizeCategorySchema.safeParse("").success).toBe(false);
  });
});

describe("Product Image Type Schema", () => {
  it("should accept all valid image types", () => {
    const validTypes = ["main", "detail", "texture", "room-mockup", "frame-preview", "360-view"];

    validTypes.forEach((type) => {
      expect(productImageTypeSchema.safeParse(type).success).toBe(true);
    });
  });

  it("should reject invalid image types", () => {
    expect(productImageTypeSchema.safeParse("thumbnail").success).toBe(false);
    expect(productImageTypeSchema.safeParse("preview").success).toBe(false);
    expect(productImageTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("Product Sort Field Schema", () => {
  it("should accept all valid sort fields", () => {
    const validFields = [
      "createdAt",
      "updatedAt",
      "title",
      "minPrice",
      "maxPrice",
      "rating",
      "popularity",
    ];

    validFields.forEach((field) => {
      expect(productSortFieldSchema.safeParse(field).success).toBe(true);
    });
  });

  it("should reject invalid sort fields", () => {
    expect(productSortFieldSchema.safeParse("name").success).toBe(false);
    expect(productSortFieldSchema.safeParse("price").success).toBe(false);
    expect(productSortFieldSchema.safeParse("").success).toBe(false);
  });
});

describe("Sort Direction Schema", () => {
  it("should accept valid sort directions", () => {
    expect(sortDirectionSchema.safeParse("asc").success).toBe(true);
    expect(sortDirectionSchema.safeParse("desc").success).toBe(true);
  });

  it("should reject invalid sort directions", () => {
    expect(sortDirectionSchema.safeParse("ascending").success).toBe(false);
    expect(sortDirectionSchema.safeParse("descending").success).toBe(false);
    expect(sortDirectionSchema.safeParse("ASC").success).toBe(false);
    expect(sortDirectionSchema.safeParse("").success).toBe(false);
  });
});

// ============================================================================
// Object Schema Tests
// ============================================================================

describe("Product Size Schema", () => {
  const validSize = {
    id: "size-12x16",
    widthInches: 12,
    heightInches: 16,
    widthCm: 30.48,
    heightCm: 40.64,
    priceTier: 1 as const,
    category: "portrait-landscape" as const,
    displayLabel: "12x16 inches",
    displayLabelMetric: "30x41 cm",
  };

  it("should validate a complete valid size", () => {
    const result = productSizeSchema.safeParse(validSize);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validSize);
    }
  });

  it("should reject empty id", () => {
    const invalid = { ...validSize, id: "" };
    expect(productSizeSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject zero or negative dimensions", () => {
    expect(productSizeSchema.safeParse({ ...validSize, widthInches: 0 }).success).toBe(false);
    expect(productSizeSchema.safeParse({ ...validSize, widthInches: -1 }).success).toBe(false);
    expect(productSizeSchema.safeParse({ ...validSize, heightInches: 0 }).success).toBe(false);
    expect(productSizeSchema.safeParse({ ...validSize, heightCm: -5 }).success).toBe(false);
  });

  it("should reject empty display labels", () => {
    expect(productSizeSchema.safeParse({ ...validSize, displayLabel: "" }).success).toBe(false);
    expect(productSizeSchema.safeParse({ ...validSize, displayLabelMetric: "" }).success).toBe(
      false
    );
  });

  it("should reject invalid price tier", () => {
    expect(productSizeSchema.safeParse({ ...validSize, priceTier: 5 }).success).toBe(false);
    expect(productSizeSchema.safeParse({ ...validSize, priceTier: 0 }).success).toBe(false);
  });
});

describe("Price Modifier Schema", () => {
  it("should validate percentage modifier", () => {
    const modifier = { type: "percentage" as const, value: 15 };
    const result = priceModifierSchema.safeParse(modifier);
    expect(result.success).toBe(true);
  });

  it("should validate fixed modifier with currency", () => {
    const modifier = { type: "fixed" as const, value: 500, currency: "INR" };
    const result = priceModifierSchema.safeParse(modifier);
    expect(result.success).toBe(true);
  });

  it("should allow currency to be optional", () => {
    const modifier = { type: "fixed" as const, value: 500 };
    const result = priceModifierSchema.safeParse(modifier);
    expect(result.success).toBe(true);
  });

  it("should reject invalid type", () => {
    const invalid = { type: "absolute", value: 100 };
    expect(priceModifierSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Frame Option Schema", () => {
  const validFrameOption = {
    id: "frame-black-001",
    type: "black-frame" as const,
    name: "Classic Black Frame",
    description: "A timeless black wooden frame",
    priceModifier: { type: "percentage" as const, value: 40 },
    availableColors: ["matte-black", "glossy-black"],
    material: "Wood",
    compatibleSizes: ["size-12x16", "size-18x24"],
    isAvailable: true,
  };

  it("should validate a complete valid frame option", () => {
    const result = frameOptionSchema.safeParse(validFrameOption);
    expect(result.success).toBe(true);
  });

  it("should allow optional fields to be omitted", () => {
    const minimal = {
      id: "frame-001",
      type: "black-frame" as const,
      name: "Black Frame",
      description: "A black frame",
      priceModifier: { type: "fixed" as const, value: 500 },
      isAvailable: true,
    };
    const result = frameOptionSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("should reject empty id", () => {
    const invalid = { ...validFrameOption, id: "" };
    expect(frameOptionSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject empty name", () => {
    const invalid = { ...validFrameOption, name: "" };
    expect(frameOptionSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject invalid frame type", () => {
    const invalid = { ...validFrameOption, type: "invalid-frame" };
    expect(frameOptionSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Mat Option Config Schema", () => {
  const validMatConfig = {
    id: "mat-white-001",
    type: "white-mat" as const,
    name: "White Mat",
    description: "Classic white mat border",
    borderWidth: 2,
    priceModifier: { type: "fixed" as const, value: 200 },
    isAvailable: true,
  };

  it("should validate a complete valid mat option config", () => {
    const result = matOptionConfigSchema.safeParse(validMatConfig);
    expect(result.success).toBe(true);
  });

  it("should reject negative border width", () => {
    const invalid = { ...validMatConfig, borderWidth: -1 };
    expect(matOptionConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it("should allow zero border width", () => {
    const valid = { ...validMatConfig, borderWidth: 0 };
    expect(matOptionConfigSchema.safeParse(valid).success).toBe(true);
  });
});

describe("Glass Option Config Schema", () => {
  const validGlassConfig = {
    id: "glass-museum-001",
    type: "museum-glass" as const,
    name: "Museum Glass",
    description: "Premium museum-quality glass with UV protection",
    priceModifier: { type: "percentage" as const, value: 100 },
    hasUVProtection: true,
    isAntiReflective: true,
    isAvailable: true,
  };

  it("should validate a complete valid glass option config", () => {
    const result = glassOptionConfigSchema.safeParse(validGlassConfig);
    expect(result.success).toBe(true);
  });

  it("should require boolean UV protection field", () => {
    const invalid = { ...validGlassConfig, hasUVProtection: "yes" };
    expect(glassOptionConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it("should require boolean anti-reflective field", () => {
    const invalid = { ...validGlassConfig, isAntiReflective: "yes" };
    expect(glassOptionConfigSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Artist Social Links Schema", () => {
  it("should validate valid social links", () => {
    const links = {
      website: "https://artist.com",
      instagram: "artist_handle",
      twitter: "artist_twitter",
      behance: "https://behance.net/artist",
      dribbble: "https://dribbble.com/artist",
    };
    const result = artistSocialLinksSchema.safeParse(links);
    expect(result.success).toBe(true);
  });

  it("should allow partial social links", () => {
    const links = { instagram: "artist_handle" };
    const result = artistSocialLinksSchema.safeParse(links);
    expect(result.success).toBe(true);
  });

  it("should allow empty object", () => {
    const result = artistSocialLinksSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should reject invalid website URL", () => {
    const invalid = { website: "not-a-url" };
    expect(artistSocialLinksSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject invalid behance URL", () => {
    const invalid = { behance: "not-a-url" };
    expect(artistSocialLinksSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Artist Schema", () => {
  const validArtist = {
    id: "artist-001",
    name: "John Doe",
    slug: "john-doe",
    bio: "A talented artist specializing in minimalist art.",
    profileImageUrl: "https://cdn.example.com/artists/john.jpg",
    socialLinks: { instagram: "johndoe_art" },
    featuredWorkIds: ["product-001", "product-002"],
    isActive: true,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-06-01"),
  };

  it("should validate a complete valid artist", () => {
    const result = artistSchema.safeParse(validArtist);
    expect(result.success).toBe(true);
  });

  it("should coerce date strings to dates", () => {
    const artistWithStringDates = {
      ...validArtist,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    };
    const result = artistSchema.safeParse(artistWithStringDates);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
      expect(result.data.updatedAt).toBeInstanceOf(Date);
    }
  });

  it("should reject empty name", () => {
    const invalid = { ...validArtist, name: "" };
    expect(artistSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject name over 100 characters", () => {
    const invalid = { ...validArtist, name: "A".repeat(101) };
    expect(artistSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject invalid slug format", () => {
    const invalidSlugs = ["John Doe", "john_doe", "John-Doe", "JOHNDOE"];
    invalidSlugs.forEach((slug) => {
      expect(artistSchema.safeParse({ ...validArtist, slug }).success).toBe(false);
    });
  });

  it("should accept valid slug formats", () => {
    const validSlugs = ["john-doe", "artist-123", "a", "artist"];
    validSlugs.forEach((slug) => {
      expect(artistSchema.safeParse({ ...validArtist, slug }).success).toBe(true);
    });
  });

  it("should reject bio over 5000 characters", () => {
    const invalid = { ...validArtist, bio: "A".repeat(5001) };
    expect(artistSchema.safeParse(invalid).success).toBe(false);
  });

  it("should allow optional fields to be omitted", () => {
    const minimal = {
      id: "artist-001",
      name: "John Doe",
      slug: "john-doe",
      bio: "A talented artist.",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(artistSchema.safeParse(minimal).success).toBe(true);
  });
});

describe("Product Image Schema", () => {
  const validImage = {
    id: "img-001",
    url: "https://cdn.example.com/products/poster.jpg",
    thumbnailUrl: "https://cdn.example.com/products/poster-thumb.jpg",
    altText: "Ocean Waves Abstract Poster",
    type: "main" as const,
    sortOrder: 0,
    width: 2000,
    height: 1500,
  };

  it("should validate a complete valid image", () => {
    const result = productImageSchema.safeParse(validImage);
    expect(result.success).toBe(true);
  });

  it("should allow optional fields to be omitted", () => {
    const minimal = {
      id: "img-001",
      url: "https://cdn.example.com/products/poster.jpg",
      altText: "Ocean Waves Poster",
      type: "main" as const,
      sortOrder: 0,
    };
    expect(productImageSchema.safeParse(minimal).success).toBe(true);
  });

  it("should reject invalid URL", () => {
    const invalid = { ...validImage, url: "not-a-url" };
    expect(productImageSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject empty alt text", () => {
    const invalid = { ...validImage, altText: "" };
    expect(productImageSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject alt text over 500 characters", () => {
    const invalid = { ...validImage, altText: "A".repeat(501) };
    expect(productImageSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject negative sort order", () => {
    const invalid = { ...validImage, sortOrder: -1 };
    expect(productImageSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject non-integer sort order", () => {
    const invalid = { ...validImage, sortOrder: 1.5 };
    expect(productImageSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject zero or negative dimensions", () => {
    expect(productImageSchema.safeParse({ ...validImage, width: 0 }).success).toBe(false);
    expect(productImageSchema.safeParse({ ...validImage, width: -100 }).success).toBe(false);
    expect(productImageSchema.safeParse({ ...validImage, height: 0 }).success).toBe(false);
  });

  it("should reject non-integer dimensions", () => {
    expect(productImageSchema.safeParse({ ...validImage, width: 100.5 }).success).toBe(false);
    expect(productImageSchema.safeParse({ ...validImage, height: 200.5 }).success).toBe(false);
  });
});

describe("Product SEO Schema", () => {
  const validSEO = {
    title: "Ocean Waves Abstract Poster - Modern Minimalist Wall Art",
    description: "Transform your space with this serene ocean waves abstract poster.",
    keywords: ["ocean", "waves", "abstract", "minimalist"],
    canonicalUrl: "https://masonart.com/products/ocean-waves-poster",
  };

  it("should validate a complete valid SEO object", () => {
    const result = productSEOSchema.safeParse(validSEO);
    expect(result.success).toBe(true);
  });

  it("should reject title over 70 characters", () => {
    const invalid = { ...validSEO, title: "A".repeat(71) };
    expect(productSEOSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject description over 200 characters", () => {
    const invalid = { ...validSEO, description: "A".repeat(201) };
    expect(productSEOSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject empty title", () => {
    const invalid = { ...validSEO, title: "" };
    expect(productSEOSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject empty description", () => {
    const invalid = { ...validSEO, description: "" };
    expect(productSEOSchema.safeParse(invalid).success).toBe(false);
  });

  it("should default keywords to empty array", () => {
    const seoWithoutKeywords = {
      title: "Test Title",
      description: "Test description",
    };
    const result = productSEOSchema.safeParse(seoWithoutKeywords);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keywords).toEqual([]);
    }
  });

  it("should allow optional canonical URL", () => {
    const { canonicalUrl, ...withoutCanonical } = validSEO;
    expect(productSEOSchema.safeParse(withoutCanonical).success).toBe(true);
  });
});

describe("Product Variant Schema", () => {
  const validVariant = {
    id: "variant-001",
    productId: "prod-001",
    sizeId: "size-12x16",
    size: {
      id: "size-12x16",
      widthInches: 12,
      heightInches: 16,
      widthCm: 30.48,
      heightCm: 40.64,
      priceTier: 1 as const,
      category: "portrait-landscape" as const,
      displayLabel: "12x16 inches",
      displayLabelMetric: "30x41 cm",
    },
    basePrice: 149900,
    compareAtPrice: 179900,
    stockQuantity: 50,
    sku: "TX234-12x16",
    isAvailable: true,
  };

  it("should validate a complete valid variant", () => {
    const result = productVariantSchema.safeParse(validVariant);
    expect(result.success).toBe(true);
  });

  it("should reject empty ids", () => {
    expect(productVariantSchema.safeParse({ ...validVariant, id: "" }).success).toBe(false);
    expect(productVariantSchema.safeParse({ ...validVariant, productId: "" }).success).toBe(false);
    expect(productVariantSchema.safeParse({ ...validVariant, sizeId: "" }).success).toBe(false);
  });

  it("should reject negative base price", () => {
    const invalid = { ...validVariant, basePrice: -100 };
    expect(productVariantSchema.safeParse(invalid).success).toBe(false);
  });

  it("should allow -1 stock quantity for made-to-order", () => {
    const madeToOrder = { ...validVariant, stockQuantity: -1 };
    expect(productVariantSchema.safeParse(madeToOrder).success).toBe(true);
  });

  it("should reject stock quantity less than -1", () => {
    const invalid = { ...validVariant, stockQuantity: -2 };
    expect(productVariantSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject empty SKU", () => {
    const invalid = { ...validVariant, sku: "" };
    expect(productVariantSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject SKU over 50 characters", () => {
    const invalid = { ...validVariant, sku: "A".repeat(51) };
    expect(productVariantSchema.safeParse(invalid).success).toBe(false);
  });

  it("should allow optional compareAtPrice", () => {
    const { compareAtPrice, ...withoutCompare } = validVariant;
    expect(productVariantSchema.safeParse(withoutCompare).success).toBe(true);
  });
});

describe("Product Rating Schema", () => {
  it("should validate valid ratings", () => {
    const validRatings = [
      { averageRating: 0, reviewCount: 0 },
      { averageRating: 5, reviewCount: 100 },
      { averageRating: 4.5, reviewCount: 50 },
      { averageRating: 3.7, reviewCount: 25 },
    ];

    validRatings.forEach((rating) => {
      expect(productRatingSchema.safeParse(rating).success).toBe(true);
    });
  });

  it("should reject rating below 0", () => {
    const invalid = { averageRating: -1, reviewCount: 10 };
    expect(productRatingSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject rating above 5", () => {
    const invalid = { averageRating: 5.1, reviewCount: 10 };
    expect(productRatingSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject negative review count", () => {
    const invalid = { averageRating: 4.5, reviewCount: -1 };
    expect(productRatingSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject non-integer review count", () => {
    const invalid = { averageRating: 4.5, reviewCount: 10.5 };
    expect(productRatingSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Product Schema", () => {
  const validProduct = {
    id: "prod-001",
    sku: "TX234",
    title: "Ocean Waves Abstract Poster",
    slug: "ocean-waves-abstract-tx234",
    description: "A serene minimalist abstract representation of ocean waves.",
    shortDescription: "Beautiful ocean waves poster",
    styles: ["wabi-sabi" as const, "minimalist" as const],
    subjects: ["sea-ocean" as const, "abstract-geometric" as const],
    primaryColor: "blue" as const,
    secondaryColors: ["white" as const, "beige" as const],
    orientation: "landscape" as const,
    roomSuggestions: ["living-room" as const, "office" as const],
    tags: ["ocean", "waves", "abstract"],
    variants: [
      {
        id: "variant-001",
        productId: "prod-001",
        sizeId: "size-12x16",
        size: {
          id: "size-12x16",
          widthInches: 12,
          heightInches: 16,
          widthCm: 30.48,
          heightCm: 40.64,
          priceTier: 1 as const,
          category: "portrait-landscape" as const,
          displayLabel: "12x16 inches",
          displayLabelMetric: "30x41 cm",
        },
        basePrice: 149900,
        stockQuantity: 50,
        sku: "TX234-12x16",
        isAvailable: true,
      },
    ],
    minPrice: 149900,
    maxPrice: 299900,
    images: [
      {
        id: "img-001",
        url: "https://cdn.example.com/products/tx234-main.jpg",
        altText: "Ocean Waves Abstract Poster - Main View",
        type: "main" as const,
        sortOrder: 0,
      },
    ],
    artistId: "artist-001",
    artist: {
      id: "artist-001",
      name: "John Doe",
      slug: "john-doe",
      profileImageUrl: "https://cdn.example.com/artists/john.jpg",
    },
    relatedProductIds: ["prod-002", "prod-003"],
    status: "active" as const,
    seo: {
      title: "Ocean Waves Abstract Poster",
      description: "Transform your space with this ocean waves poster.",
      keywords: ["ocean", "waves"],
    },
    rating: { averageRating: 4.5, reviewCount: 25 },
    isFeatured: true,
    isAIGenerated: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-06-01"),
    publishedAt: new Date("2024-01-15"),
  };

  it("should validate a complete valid product", () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it("should reject empty id", () => {
    const invalid = { ...validProduct, id: "" };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject empty sku", () => {
    const invalid = { ...validProduct, sku: "" };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject sku over 50 characters", () => {
    const invalid = { ...validProduct, sku: "A".repeat(51) };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject title over 200 characters", () => {
    const invalid = { ...validProduct, title: "A".repeat(201) };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject invalid slug format", () => {
    const invalidSlugs = ["Ocean Waves", "ocean_waves", "OCEAN-WAVES"];
    invalidSlugs.forEach((slug) => {
      expect(productSchema.safeParse({ ...validProduct, slug }).success).toBe(false);
    });
  });

  it("should reject description over 10000 characters", () => {
    const invalid = { ...validProduct, description: "A".repeat(10001) };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should require at least one style", () => {
    const invalid = { ...validProduct, styles: [] };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should require at least one subject", () => {
    const invalid = { ...validProduct, subjects: [] };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should require at least one variant", () => {
    const invalid = { ...validProduct, variants: [] };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should require at least one image", () => {
    const invalid = { ...validProduct, images: [] };
    expect(productSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject negative prices", () => {
    expect(productSchema.safeParse({ ...validProduct, minPrice: -1 }).success).toBe(false);
    expect(productSchema.safeParse({ ...validProduct, maxPrice: -1 }).success).toBe(false);
  });

  it("should default arrays to empty", () => {
    const minimal = {
      ...validProduct,
      secondaryColors: undefined,
      roomSuggestions: undefined,
      tags: undefined,
      relatedProductIds: undefined,
    };
    const result = productSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secondaryColors).toEqual([]);
      expect(result.data.roomSuggestions).toEqual([]);
      expect(result.data.tags).toEqual([]);
      expect(result.data.relatedProductIds).toEqual([]);
    }
  });

  it("should default boolean fields to false", () => {
    const minimal = {
      ...validProduct,
      isFeatured: undefined,
      isAIGenerated: undefined,
    };
    const result = productSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isFeatured).toBe(false);
      expect(result.data.isAIGenerated).toBe(false);
    }
  });

  it("should coerce date strings to dates", () => {
    const productWithStringDates = {
      ...validProduct,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
      publishedAt: "2024-01-15T00:00:00.000Z",
    };
    const result = productSchema.safeParse(productWithStringDates);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
      expect(result.data.updatedAt).toBeInstanceOf(Date);
      expect(result.data.publishedAt).toBeInstanceOf(Date);
    }
  });
});

describe("Product List Item Schema", () => {
  const validListItem = {
    id: "prod-001",
    sku: "TX234",
    title: "Ocean Waves Abstract Poster",
    slug: "ocean-waves-abstract-tx234",
    shortDescription: "Beautiful ocean waves poster",
    primaryColor: "blue" as const,
    orientation: "landscape" as const,
    styles: ["wabi-sabi" as const, "minimalist" as const],
    mainImage: {
      id: "img-001",
      url: "https://cdn.example.com/products/tx234-main.jpg",
      altText: "Ocean Waves Abstract Poster",
      type: "main" as const,
      sortOrder: 0,
    },
    minPrice: 149900,
    maxPrice: 299900,
    rating: { averageRating: 4.5, reviewCount: 25 },
    isFeatured: true,
    isAIGenerated: false,
    artist: {
      id: "artist-001",
      name: "John Doe",
      slug: "john-doe",
    },
  };

  it("should validate a complete valid list item", () => {
    const result = productListItemSchema.safeParse(validListItem);
    expect(result.success).toBe(true);
  });

  it("should allow optional fields to be omitted", () => {
    const minimal = {
      id: "prod-001",
      sku: "TX234",
      title: "Ocean Waves Poster",
      slug: "ocean-waves-poster",
      primaryColor: "blue" as const,
      orientation: "landscape" as const,
      styles: ["minimalist" as const],
      mainImage: {
        id: "img-001",
        url: "https://cdn.example.com/image.jpg",
        altText: "Image",
        type: "main" as const,
        sortOrder: 0,
      },
      minPrice: 149900,
      maxPrice: 299900,
      isFeatured: false,
      isAIGenerated: false,
    };
    expect(productListItemSchema.safeParse(minimal).success).toBe(true);
  });
});

describe("Product Filters Schema", () => {
  it("should accept empty filters", () => {
    const result = productFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept single filter", () => {
    const filters = { styles: ["minimalist" as const] };
    expect(productFiltersSchema.safeParse(filters).success).toBe(true);
  });

  it("should accept multiple filters", () => {
    const filters = {
      styles: ["minimalist" as const, "abstract" as const],
      subjects: ["nature-landscape" as const],
      colors: ["blue" as const],
      orientations: ["landscape" as const],
      rooms: ["living-room" as const],
      priceMin: 10000,
      priceMax: 50000,
      priceTiers: [1 as const, 2 as const],
      artistIds: ["artist-001"],
      isAIGenerated: false,
      isFeatured: true,
      status: ["active" as const],
      searchQuery: "ocean waves",
    };
    expect(productFiltersSchema.safeParse(filters).success).toBe(true);
  });

  it("should reject negative price values", () => {
    expect(productFiltersSchema.safeParse({ priceMin: -1 }).success).toBe(false);
    expect(productFiltersSchema.safeParse({ priceMax: -1 }).success).toBe(false);
  });

  it("should reject invalid enum values in arrays", () => {
    expect(productFiltersSchema.safeParse({ styles: ["invalid-style"] }).success).toBe(false);
    expect(productFiltersSchema.safeParse({ status: ["invalid-status"] }).success).toBe(false);
  });
});

describe("Product Sort Schema", () => {
  it("should validate valid sort options", () => {
    const validSorts = [
      { field: "createdAt" as const, direction: "desc" as const },
      { field: "title" as const, direction: "asc" as const },
      { field: "minPrice" as const, direction: "asc" as const },
      { field: "rating" as const, direction: "desc" as const },
    ];

    validSorts.forEach((sort) => {
      expect(productSortSchema.safeParse(sort).success).toBe(true);
    });
  });

  it("should reject invalid field", () => {
    const invalid = { field: "name", direction: "asc" };
    expect(productSortSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject invalid direction", () => {
    const invalid = { field: "createdAt", direction: "ascending" };
    expect(productSortSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Paginated Products Schema", () => {
  const validPaginated = {
    items: [
      {
        id: "prod-001",
        sku: "TX234",
        title: "Ocean Waves Poster",
        slug: "ocean-waves-poster",
        primaryColor: "blue" as const,
        orientation: "landscape" as const,
        styles: ["minimalist" as const],
        mainImage: {
          id: "img-001",
          url: "https://cdn.example.com/image.jpg",
          altText: "Image",
          type: "main" as const,
          sortOrder: 0,
        },
        minPrice: 149900,
        maxPrice: 299900,
        isFeatured: false,
        isAIGenerated: false,
      },
    ],
    total: 100,
    page: 1,
    pageSize: 20,
    totalPages: 5,
    hasNextPage: true,
    hasPreviousPage: false,
  };

  it("should validate a complete valid paginated response", () => {
    const result = paginatedProductsSchema.safeParse(validPaginated);
    expect(result.success).toBe(true);
  });

  it("should accept empty items array", () => {
    const empty = {
      ...validPaginated,
      items: [],
      total: 0,
      totalPages: 0,
      hasNextPage: false,
    };
    expect(paginatedProductsSchema.safeParse(empty).success).toBe(true);
  });

  it("should reject negative total", () => {
    const invalid = { ...validPaginated, total: -1 };
    expect(paginatedProductsSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject zero or negative page", () => {
    expect(paginatedProductsSchema.safeParse({ ...validPaginated, page: 0 }).success).toBe(false);
    expect(paginatedProductsSchema.safeParse({ ...validPaginated, page: -1 }).success).toBe(false);
  });

  it("should reject zero or negative pageSize", () => {
    expect(paginatedProductsSchema.safeParse({ ...validPaginated, pageSize: 0 }).success).toBe(
      false
    );
    expect(paginatedProductsSchema.safeParse({ ...validPaginated, pageSize: -1 }).success).toBe(
      false
    );
  });
});

describe("Collection Schema", () => {
  const validCollection = {
    id: "collection-001",
    name: "New Arrivals",
    slug: "new-arrivals",
    description: "Check out our latest poster designs",
    type: "new-arrivals" as const,
    coverImageUrl: "https://cdn.example.com/collections/new-arrivals.jpg",
    productIds: ["prod-001", "prod-002"],
    isActive: true,
    sortOrder: 1,
    seo: {
      title: "New Arrivals - MasonArt",
      description: "Shop our latest poster designs",
      keywords: ["new", "arrivals", "posters"],
    },
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-06-01"),
  };

  it("should validate a complete valid collection", () => {
    const result = collectionSchema.safeParse(validCollection);
    expect(result.success).toBe(true);
  });

  it("should reject name over 100 characters", () => {
    const invalid = { ...validCollection, name: "A".repeat(101) };
    expect(collectionSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject description over 2000 characters", () => {
    const invalid = { ...validCollection, description: "A".repeat(2001) };
    expect(collectionSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject invalid slug format", () => {
    expect(collectionSchema.safeParse({ ...validCollection, slug: "New Arrivals" }).success).toBe(
      false
    );
  });

  it("should reject negative sort order", () => {
    const invalid = { ...validCollection, sortOrder: -1 };
    expect(collectionSchema.safeParse(invalid).success).toBe(false);
  });

  it("should default productIds to empty array", () => {
    const withoutProducts = { ...validCollection, productIds: undefined };
    const result = collectionSchema.safeParse(withoutProducts);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productIds).toEqual([]);
    }
  });
});

describe("Product Configuration Schema", () => {
  it("should validate a complete configuration", () => {
    const config = {
      variantId: "variant-001",
      frameOptionId: "frame-black-001",
      matOptionId: "mat-white-001",
      glassOptionId: "glass-standard-001",
      customInstructions: "Please wrap carefully",
      isGiftWrapped: true,
    };
    expect(productConfigurationSchema.safeParse(config).success).toBe(true);
  });

  it("should accept minimal configuration with only variantId", () => {
    const config = { variantId: "variant-001" };
    expect(productConfigurationSchema.safeParse(config).success).toBe(true);
  });

  it("should reject empty variantId", () => {
    const invalid = { variantId: "" };
    expect(productConfigurationSchema.safeParse(invalid).success).toBe(false);
  });

  it("should reject custom instructions over 1000 characters", () => {
    const invalid = {
      variantId: "variant-001",
      customInstructions: "A".repeat(1001),
    };
    expect(productConfigurationSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Product Price Breakdown Schema", () => {
  const validBreakdown = {
    basePrice: 149900,
    framePrice: 50000,
    matPrice: 20000,
    glassPrice: 30000,
    giftWrapPrice: 5000,
    subtotal: 254900,
    discount: 25490,
    total: 229410,
    currency: "INR",
  };

  it("should validate a complete valid breakdown", () => {
    const result = productPriceBreakdownSchema.safeParse(validBreakdown);
    expect(result.success).toBe(true);
  });

  it("should reject negative prices", () => {
    expect(
      productPriceBreakdownSchema.safeParse({ ...validBreakdown, basePrice: -1 }).success
    ).toBe(false);
    expect(productPriceBreakdownSchema.safeParse({ ...validBreakdown, total: -1 }).success).toBe(
      false
    );
  });

  it("should reject invalid currency length", () => {
    expect(
      productPriceBreakdownSchema.safeParse({ ...validBreakdown, currency: "IN" }).success
    ).toBe(false);
    expect(
      productPriceBreakdownSchema.safeParse({ ...validBreakdown, currency: "INRX" }).success
    ).toBe(false);
  });

  it("should accept exactly 3 character currency code", () => {
    const validCurrencies = ["INR", "USD", "EUR", "GBP"];
    validCurrencies.forEach((currency) => {
      expect(productPriceBreakdownSchema.safeParse({ ...validBreakdown, currency }).success).toBe(
        true
      );
    });
  });
});

// ============================================================================
// Input Schema Tests
// ============================================================================

describe("Create Product Input Schema", () => {
  const validInput = {
    sku: "TX234",
    title: "Ocean Waves Abstract Poster",
    slug: "ocean-waves-abstract-tx234",
    description: "A serene minimalist abstract representation of ocean waves.",
    styles: ["wabi-sabi" as const, "minimalist" as const],
    subjects: ["sea-ocean" as const],
    primaryColor: "blue" as const,
    orientation: "landscape" as const,
    variants: [
      {
        id: "variant-001",
        productId: "prod-001",
        sizeId: "size-12x16",
        size: {
          id: "size-12x16",
          widthInches: 12,
          heightInches: 16,
          widthCm: 30.48,
          heightCm: 40.64,
          priceTier: 1 as const,
          category: "portrait-landscape" as const,
          displayLabel: "12x16 inches",
          displayLabelMetric: "30x41 cm",
        },
        basePrice: 149900,
        stockQuantity: 50,
        sku: "TX234-12x16",
        isAvailable: true,
      },
    ],
    images: [
      {
        id: "img-001",
        url: "https://cdn.example.com/products/tx234-main.jpg",
        altText: "Ocean Waves Abstract Poster",
        type: "main" as const,
        sortOrder: 0,
      },
    ],
    status: "active" as const,
    seo: {
      title: "Ocean Waves Abstract Poster",
      description: "Transform your space with this ocean waves poster.",
      keywords: [],
    },
  };

  it("should validate a complete valid create input", () => {
    const result = createProductInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("should accept input without omitted fields (id, createdAt, etc.)", () => {
    // The schema should not require these fields
    expect(createProductInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("should still validate required fields", () => {
    const invalid = { ...validInput, sku: "" };
    expect(createProductInputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Update Product Input Schema", () => {
  it("should accept partial updates", () => {
    const partialUpdates = [
      { title: "New Title" },
      { status: "draft" as const },
      { isFeatured: true },
    ];

    partialUpdates.forEach((update) => {
      expect(updateProductInputSchema.safeParse(update).success).toBe(true);
    });
  });

  it("should accept empty object", () => {
    expect(updateProductInputSchema.safeParse({}).success).toBe(true);
  });

  it("should validate provided fields", () => {
    const invalid = { title: "" };
    expect(updateProductInputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Create Artist Input Schema", () => {
  const validInput = {
    name: "John Doe",
    slug: "john-doe",
    bio: "A talented artist.",
    isActive: true,
  };

  it("should validate a complete valid create input", () => {
    const result = createArtistInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("should reject empty name", () => {
    const invalid = { ...validInput, name: "" };
    expect(createArtistInputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Update Artist Input Schema", () => {
  it("should accept partial updates", () => {
    expect(updateArtistInputSchema.safeParse({ name: "New Name" }).success).toBe(true);
    expect(updateArtistInputSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateArtistInputSchema.safeParse({}).success).toBe(true);
  });

  it("should validate provided fields", () => {
    const invalid = { name: "" };
    expect(updateArtistInputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Create Collection Input Schema", () => {
  const validInput = {
    name: "New Arrivals",
    slug: "new-arrivals",
    description: "Check out our latest poster designs",
    type: "new-arrivals" as const,
    isActive: true,
    sortOrder: 1,
  };

  it("should validate a complete valid create input", () => {
    const result = createCollectionInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("should reject empty name", () => {
    const invalid = { ...validInput, name: "" };
    expect(createCollectionInputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Update Collection Input Schema", () => {
  it("should accept partial updates", () => {
    expect(updateCollectionInputSchema.safeParse({ name: "New Name" }).success).toBe(true);
    expect(updateCollectionInputSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateCollectionInputSchema.safeParse({}).success).toBe(true);
  });

  it("should validate provided fields", () => {
    const invalid = { name: "" };
    expect(updateCollectionInputSchema.safeParse(invalid).success).toBe(false);
  });
});
