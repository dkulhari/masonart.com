// Database seed script for the Poster & Frame E-Commerce Platform
// Populates the database with sample products, variants, and frames for development

import { db, closeDatabase } from "./index";
import {
  products,
  productVariants,
  frames,
  type NewProduct,
  type NewProductVariant,
  type NewFrame,
  type ProductImage,
} from "./schema";

// ============================================================================
// Sample Data
// ============================================================================

/**
 * Sample poster products covering various styles and subjects
 */
const sampleProducts: NewProduct[] = [
  // Abstract Collection
  {
    sku: "ABS-001",
    title: "Cosmic Harmony",
    slug: "cosmic-harmony",
    description:
      "A mesmerizing abstract piece featuring swirling cosmic patterns in deep blues and purples. Perfect for modern living spaces seeking a touch of celestial wonder.",
    basePrice: "1499.00",
    styles: ["abstract", "modern"],
    subjects: ["space", "patterns"],
    colors: ["blue", "purple", "black"],
    rooms: ["living-room", "bedroom", "office"],
    tags: ["bestseller", "cosmic", "celestial"],
    orientation: "square",
    images: [
      {
        id: "img-1",
        url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800",
        alt: "Cosmic Harmony Abstract Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Cosmic Harmony Abstract Art Print | Modern Wall Decor",
    seoDescription:
      "Shop the Cosmic Harmony abstract art print. Perfect for modern homes with swirling cosmic patterns in deep blues and purples.",
    status: "active",
    isFeatured: true,
    featuredOrder: 1,
  },
  {
    sku: "ABS-002",
    title: "Golden Flow",
    slug: "golden-flow",
    description:
      "Elegant golden brushstrokes flowing across a cream canvas, creating a sense of luxury and movement. An ideal statement piece for sophisticated interiors.",
    basePrice: "1799.00",
    styles: ["abstract", "minimalist"],
    subjects: ["patterns"],
    colors: ["gold", "cream", "beige"],
    rooms: ["living-room", "dining-room", "hallway"],
    tags: ["luxury", "gold", "elegant"],
    orientation: "landscape",
    images: [
      {
        id: "img-2",
        url: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=800",
        alt: "Golden Flow Abstract Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Golden Flow Abstract Art Print | Luxury Wall Decor",
    seoDescription:
      "Discover the Golden Flow abstract art print. Elegant golden brushstrokes on cream canvas for sophisticated interiors.",
    status: "active",
    isFeatured: true,
    featuredOrder: 2,
  },
  {
    sku: "ABS-003",
    title: "Serene Waves",
    slug: "serene-waves",
    description:
      "Gentle wave patterns in soft teal and white create a calming atmosphere. Inspired by the tranquil ocean tides at dawn.",
    basePrice: "1299.00",
    styles: ["abstract", "coastal"],
    subjects: ["water", "nature"],
    colors: ["teal", "white", "blue"],
    rooms: ["bedroom", "bathroom", "spa"],
    tags: ["calming", "ocean", "peaceful"],
    orientation: "portrait",
    images: [
      {
        id: "img-3",
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
        alt: "Serene Waves Abstract Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Serene Waves Abstract Art Print | Coastal Wall Decor",
    seoDescription:
      "Shop the Serene Waves abstract art print. Calming wave patterns in soft teal and white for peaceful spaces.",
    status: "active",
    isFeatured: false,
  },

  // Nature Collection
  {
    sku: "NAT-001",
    title: "Mountain Majesty",
    slug: "mountain-majesty",
    description:
      "A breathtaking panoramic view of snow-capped mountains at sunset. The dramatic interplay of light and shadow captures nature at its most majestic.",
    basePrice: "1699.00",
    styles: ["landscape", "photography"],
    subjects: ["mountains", "nature", "sunset"],
    colors: ["orange", "purple", "white"],
    rooms: ["living-room", "office", "cabin"],
    tags: ["panoramic", "mountains", "scenic"],
    orientation: "panoramic",
    images: [
      {
        id: "img-4",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200",
        alt: "Mountain Majesty Landscape",
        width: 1200,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Mountain Majesty Panoramic Print | Landscape Wall Art",
    seoDescription:
      "Discover the Mountain Majesty panoramic print. Breathtaking snow-capped mountains at sunset for nature lovers.",
    status: "active",
    isFeatured: true,
    featuredOrder: 3,
  },
  {
    sku: "NAT-002",
    title: "Forest Whispers",
    slug: "forest-whispers",
    description:
      "Sunlight filtering through a misty forest creates an ethereal atmosphere. A perfect piece for bringing the tranquility of nature indoors.",
    basePrice: "1399.00",
    styles: ["photography", "nature"],
    subjects: ["forest", "trees", "nature"],
    colors: ["green", "brown", "gold"],
    rooms: ["living-room", "bedroom", "study"],
    tags: ["forest", "misty", "ethereal"],
    orientation: "portrait",
    images: [
      {
        id: "img-5",
        url: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800",
        alt: "Forest Whispers Nature Print",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Forest Whispers Nature Print | Misty Forest Wall Art",
    seoDescription:
      "Shop the Forest Whispers nature print. Ethereal misty forest scene for a peaceful home atmosphere.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "NAT-003",
    title: "Desert Bloom",
    slug: "desert-bloom",
    description:
      "A vibrant desert scene featuring blooming cacti against a warm sunset sky. Celebrates the unexpected beauty found in arid landscapes.",
    basePrice: "1199.00",
    styles: ["photography", "botanical"],
    subjects: ["desert", "plants", "flowers"],
    colors: ["pink", "orange", "green"],
    rooms: ["living-room", "kitchen", "sunroom"],
    tags: ["desert", "botanical", "colorful"],
    orientation: "square",
    images: [
      {
        id: "img-6",
        url: "https://images.unsplash.com/photo-1509587584298-0f3b3a3a1797?w=800",
        alt: "Desert Bloom Nature Print",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Desert Bloom Botanical Print | Cactus Wall Art",
    seoDescription:
      "Discover the Desert Bloom print. Vibrant desert scene with blooming cacti for warm, inviting spaces.",
    status: "active",
    isFeatured: false,
  },

  // Botanical Collection
  {
    sku: "BOT-001",
    title: "Monstera Dreams",
    slug: "monstera-dreams",
    description:
      "An artistic interpretation of the beloved monstera leaf in rich emerald tones. A timeless botanical piece for plant enthusiasts.",
    basePrice: "999.00",
    styles: ["botanical", "modern"],
    subjects: ["plants", "leaves"],
    colors: ["green", "white"],
    rooms: ["living-room", "bedroom", "bathroom"],
    tags: ["monstera", "tropical", "botanical"],
    orientation: "portrait",
    images: [
      {
        id: "img-7",
        url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=800",
        alt: "Monstera Dreams Botanical Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Monstera Dreams Botanical Print | Tropical Leaf Art",
    seoDescription:
      "Shop the Monstera Dreams botanical print. Artistic monstera leaf in emerald tones for plant lovers.",
    status: "active",
    isFeatured: true,
    featuredOrder: 4,
  },
  {
    sku: "BOT-002",
    title: "Eucalyptus Study",
    slug: "eucalyptus-study",
    description:
      "Delicate eucalyptus branches rendered in soft watercolor style. A calming, minimalist piece with a fresh, natural aesthetic.",
    basePrice: "899.00",
    styles: ["botanical", "watercolor", "minimalist"],
    subjects: ["plants", "leaves"],
    colors: ["sage", "green", "gray"],
    rooms: ["bedroom", "bathroom", "nursery"],
    tags: ["eucalyptus", "watercolor", "minimal"],
    orientation: "portrait",
    images: [
      {
        id: "img-8",
        url: "https://images.unsplash.com/photo-1603436326446-74e2d69da7cd?w=800",
        alt: "Eucalyptus Study Botanical Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Eucalyptus Study Botanical Print | Watercolor Leaf Art",
    seoDescription:
      "Discover the Eucalyptus Study print. Delicate watercolor eucalyptus for a fresh, natural aesthetic.",
    status: "active",
    isFeatured: false,
  },

  // Minimalist Collection
  {
    sku: "MIN-001",
    title: "Circle of Zen",
    slug: "circle-of-zen",
    description:
      "A perfect circle rendered in charcoal on a pristine white background. Inspired by Japanese zen philosophy and the pursuit of perfection through simplicity.",
    basePrice: "799.00",
    styles: ["minimalist", "zen", "japanese"],
    subjects: ["geometric", "circle"],
    colors: ["black", "white"],
    rooms: ["office", "bedroom", "meditation-room"],
    tags: ["zen", "minimalist", "japanese"],
    orientation: "square",
    images: [
      {
        id: "img-9",
        url: "https://images.unsplash.com/photo-1515825838458-f2a94b20105a?w=800",
        alt: "Circle of Zen Minimalist Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Circle of Zen Minimalist Print | Japanese Wall Art",
    seoDescription:
      "Shop the Circle of Zen print. Japanese-inspired minimalist art for peaceful, mindful spaces.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "MIN-002",
    title: "Linear Horizons",
    slug: "linear-horizons",
    description:
      "Clean horizontal lines in varying shades of gray create a sense of calm and order. A versatile piece that complements any modern interior.",
    basePrice: "699.00",
    styles: ["minimalist", "geometric", "modern"],
    subjects: ["lines", "geometric"],
    colors: ["gray", "white", "black"],
    rooms: ["office", "living-room", "hallway"],
    tags: ["lines", "geometric", "modern"],
    orientation: "landscape",
    images: [
      {
        id: "img-10",
        url: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=800",
        alt: "Linear Horizons Minimalist Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Linear Horizons Minimalist Print | Geometric Wall Art",
    seoDescription:
      "Discover the Linear Horizons print. Clean horizontal lines for calm, ordered modern spaces.",
    status: "active",
    isFeatured: false,
  },

  // Typography Collection
  {
    sku: "TYP-001",
    title: "Stay Curious",
    slug: "stay-curious",
    description:
      "An inspiring typographic piece featuring the words 'Stay Curious' in bold, modern lettering. Perfect for creative spaces and home offices.",
    basePrice: "599.00",
    styles: ["typography", "motivational"],
    subjects: ["text", "quotes"],
    colors: ["black", "white"],
    rooms: ["office", "study", "kids-room"],
    tags: ["motivational", "typography", "inspire"],
    orientation: "portrait",
    images: [
      {
        id: "img-11",
        url: "https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=800",
        alt: "Stay Curious Typography Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Stay Curious Typography Print | Motivational Wall Art",
    seoDescription:
      "Shop the Stay Curious typography print. Inspiring words in bold lettering for creative spaces.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "TYP-002",
    title: "Dream Big",
    slug: "dream-big",
    description:
      "Elegant script typography encouraging you to dream without limits. A beautiful reminder to aim high and pursue your passions.",
    basePrice: "649.00",
    styles: ["typography", "motivational", "script"],
    subjects: ["text", "quotes"],
    colors: ["gold", "white"],
    rooms: ["bedroom", "office", "nursery"],
    tags: ["motivational", "dreams", "elegant"],
    orientation: "landscape",
    images: [
      {
        id: "img-12",
        url: "https://images.unsplash.com/photo-1499678329028-101435549a4e?w=800",
        alt: "Dream Big Typography Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
      },
    ] as ProductImage[],
    seoTitle: "Dream Big Typography Print | Inspirational Wall Art",
    seoDescription:
      "Discover the Dream Big print. Elegant script typography for dreamers and go-getters.",
    status: "active",
    isFeatured: false,
  },
];

/**
 * Variant sizes for products based on orientation
 */
const variantsByOrientation: Record<
  string,
  Omit<NewProductVariant, "productId">[]
> = {
  square: [
    {
      sizeLabel: '12" x 12"',
      widthInches: 12,
      heightInches: 12,
      widthCm: 30,
      heightCm: 30,
      price: "0.00", // Will be calculated as base price
      stockQuantity: 50,
      sortOrder: 1,
    },
    {
      sizeLabel: '18" x 18"',
      widthInches: 18,
      heightInches: 18,
      widthCm: 46,
      heightCm: 46,
      price: "200.00", // Price addition
      stockQuantity: 40,
      sortOrder: 2,
    },
    {
      sizeLabel: '24" x 24"',
      widthInches: 24,
      heightInches: 24,
      widthCm: 61,
      heightCm: 61,
      price: "400.00",
      stockQuantity: 30,
      sortOrder: 3,
    },
    {
      sizeLabel: '36" x 36"',
      widthInches: 36,
      heightInches: 36,
      widthCm: 91,
      heightCm: 91,
      price: "800.00",
      stockQuantity: 20,
      sortOrder: 4,
    },
  ],
  portrait: [
    {
      sizeLabel: '12" x 16"',
      widthInches: 12,
      heightInches: 16,
      widthCm: 30,
      heightCm: 41,
      price: "0.00",
      stockQuantity: 50,
      sortOrder: 1,
    },
    {
      sizeLabel: '18" x 24"',
      widthInches: 18,
      heightInches: 24,
      widthCm: 46,
      heightCm: 61,
      price: "200.00",
      stockQuantity: 40,
      sortOrder: 2,
    },
    {
      sizeLabel: '24" x 36"',
      widthInches: 24,
      heightInches: 36,
      widthCm: 61,
      heightCm: 91,
      price: "500.00",
      stockQuantity: 30,
      sortOrder: 3,
    },
    {
      sizeLabel: '30" x 40"',
      widthInches: 30,
      heightInches: 40,
      widthCm: 76,
      heightCm: 102,
      price: "800.00",
      stockQuantity: 20,
      sortOrder: 4,
    },
  ],
  landscape: [
    {
      sizeLabel: '16" x 12"',
      widthInches: 16,
      heightInches: 12,
      widthCm: 41,
      heightCm: 30,
      price: "0.00",
      stockQuantity: 50,
      sortOrder: 1,
    },
    {
      sizeLabel: '24" x 18"',
      widthInches: 24,
      heightInches: 18,
      widthCm: 61,
      heightCm: 46,
      price: "200.00",
      stockQuantity: 40,
      sortOrder: 2,
    },
    {
      sizeLabel: '36" x 24"',
      widthInches: 36,
      heightInches: 24,
      widthCm: 91,
      heightCm: 61,
      price: "500.00",
      stockQuantity: 30,
      sortOrder: 3,
    },
    {
      sizeLabel: '48" x 32"',
      widthInches: 48,
      heightInches: 32,
      widthCm: 122,
      heightCm: 81,
      price: "900.00",
      stockQuantity: 15,
      sortOrder: 4,
    },
  ],
  panoramic: [
    {
      sizeLabel: '36" x 12"',
      widthInches: 36,
      heightInches: 12,
      widthCm: 91,
      heightCm: 30,
      price: "0.00",
      stockQuantity: 40,
      sortOrder: 1,
    },
    {
      sizeLabel: '48" x 16"',
      widthInches: 48,
      heightInches: 16,
      widthCm: 122,
      heightCm: 41,
      price: "300.00",
      stockQuantity: 30,
      sortOrder: 2,
    },
    {
      sizeLabel: '60" x 20"',
      widthInches: 60,
      heightInches: 20,
      widthCm: 152,
      heightCm: 51,
      price: "600.00",
      stockQuantity: 20,
      sortOrder: 3,
    },
    {
      sizeLabel: '72" x 24"',
      widthInches: 72,
      heightInches: 24,
      widthCm: 183,
      heightCm: 61,
      price: "1000.00",
      stockQuantity: 10,
      sortOrder: 4,
    },
  ],
};

/**
 * Sample frame options
 */
const sampleFrames: NewFrame[] = [
  {
    name: "No Frame",
    type: "none",
    description: "Print only - no frame included",
    material: "N/A",
    color: "N/A",
    priceModifier: "1.00",
    priceAddition: "0.00",
    isActive: true,
    sortOrder: 0,
  },
  {
    name: "Classic Black",
    type: "black",
    description:
      "Sleek matte black frame with clean lines. A timeless choice that works with any decor.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Matte Black",
    priceModifier: "1.00",
    priceAddition: "399.00",
    imageUrl: "https://placehold.co/400x400/1a1a1a/ffffff?text=Black+Frame",
    thumbnailUrl: "https://placehold.co/100x100/1a1a1a/ffffff?text=Black",
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Pure White",
    type: "white",
    description:
      "Crisp white frame that brightens any space. Perfect for minimalist and Scandinavian styles.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Matte White",
    priceModifier: "1.00",
    priceAddition: "399.00",
    imageUrl: "https://placehold.co/400x400/ffffff/333333?text=White+Frame",
    thumbnailUrl: "https://placehold.co/100x100/ffffff/333333?text=White",
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Natural Oak",
    type: "oak",
    description:
      "Warm natural oak frame with visible grain. Brings organic warmth to any room.",
    material: "Oak Wood",
    thickness: "1.00",
    color: "Natural Oak",
    priceModifier: "1.00",
    priceAddition: "599.00",
    imageUrl: "https://placehold.co/400x400/d4a574/ffffff?text=Oak+Frame",
    thumbnailUrl: "https://placehold.co/100x100/d4a574/ffffff?text=Oak",
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "Rich Walnut",
    type: "walnut",
    description:
      "Deep walnut frame with elegant grain patterns. Adds sophistication and depth.",
    material: "Walnut Wood",
    thickness: "1.00",
    color: "Dark Walnut",
    priceModifier: "1.00",
    priceAddition: "699.00",
    imageUrl: "https://placehold.co/400x400/5d4e37/ffffff?text=Walnut+Frame",
    thumbnailUrl: "https://placehold.co/100x100/5d4e37/ffffff?text=Walnut",
    isActive: true,
    sortOrder: 4,
  },
  {
    name: "Antique Gold",
    type: "gold",
    description:
      "Luxurious gold frame with subtle antiquing. Perfect for traditional and glamorous interiors.",
    material: "Composite with Gold Leaf",
    thickness: "1.25",
    color: "Antique Gold",
    priceModifier: "1.00",
    priceAddition: "799.00",
    imageUrl: "https://placehold.co/400x400/c9a227/ffffff?text=Gold+Frame",
    thumbnailUrl: "https://placehold.co/100x100/c9a227/ffffff?text=Gold",
    isActive: true,
    sortOrder: 5,
  },
  {
    name: "Modern Silver",
    type: "silver",
    description:
      "Contemporary silver frame with brushed finish. Ideal for modern and industrial spaces.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Brushed Silver",
    priceModifier: "1.00",
    priceAddition: "449.00",
    imageUrl: "https://placehold.co/400x400/c0c0c0/333333?text=Silver+Frame",
    thumbnailUrl: "https://placehold.co/100x100/c0c0c0/333333?text=Silver",
    isActive: true,
    sortOrder: 6,
  },
  {
    name: "Rustic Wood",
    type: "wood",
    description:
      "Rustic wooden frame with distressed finish. Perfect for farmhouse and bohemian styles.",
    material: "Reclaimed Pine",
    thickness: "1.50",
    color: "Weathered Brown",
    priceModifier: "1.00",
    priceAddition: "549.00",
    imageUrl: "https://placehold.co/400x400/8b7355/ffffff?text=Wood+Frame",
    thumbnailUrl: "https://placehold.co/100x100/8b7355/ffffff?text=Wood",
    isActive: true,
    sortOrder: 7,
  },
];

// ============================================================================
// Seed Functions
// ============================================================================

/**
 * Clear all existing data from tables
 */
async function clearData(): Promise<void> {
  console.log("Clearing existing data...");
  await db.delete(productVariants);
  await db.delete(products);
  await db.delete(frames);
  console.log("Data cleared successfully.");
}

/**
 * Seed products and their variants
 */
async function seedProducts(): Promise<void> {
  console.log("Seeding products...");

  for (const productData of sampleProducts) {
    // Insert product
    const [insertedProduct] = await db
      .insert(products)
      .values(productData)
      .returning({ id: products.id, orientation: products.orientation });

    if (!insertedProduct) {
      console.error(`  Failed to create product: ${productData.title}`);
      continue;
    }

    console.log(`  Created product: ${productData.title}`);

    // Get variants for this orientation
    const variantTemplates =
      variantsByOrientation[insertedProduct.orientation] ||
      variantsByOrientation.portrait;

    if (!variantTemplates) {
      console.error(`  No variant templates found for orientation: ${insertedProduct.orientation}`);
      continue;
    }

    // Calculate actual prices and insert variants
    const basePrice = parseFloat(productData.basePrice);
    const variantsToInsert: NewProductVariant[] = variantTemplates.map(
      (template) => ({
        ...template,
        productId: insertedProduct.id,
        // Calculate final price: base price + size addition
        price: (basePrice + parseFloat(template.price)).toFixed(2),
        variantSku: `${productData.sku}-${template.widthInches}x${template.heightInches}`,
      })
    );

    await db.insert(productVariants).values(variantsToInsert);
    console.log(`    Added ${variantsToInsert.length} variants`);
  }

  console.log(`Products seeded successfully. Total: ${sampleProducts.length}`);
}

/**
 * Seed frame options
 */
async function seedFrames(): Promise<void> {
  console.log("Seeding frames...");

  await db.insert(frames).values(sampleFrames);

  console.log(`Frames seeded successfully. Total: ${sampleFrames.length}`);
}

/**
 * Main seed function
 */
async function seed(): Promise<void> {
  console.log("\n========================================");
  console.log("  MasonArt Database Seed Script");
  console.log("========================================\n");

  try {
    // Clear existing data first
    await clearData();

    // Seed all data
    await seedProducts();
    await seedFrames();

    console.log("\n========================================");
    console.log("  Seed completed successfully!");
    console.log("========================================\n");

    // Summary
    console.log("Summary:");
    console.log(`  - Products: ${sampleProducts.length}`);
    console.log(
      `  - Variants: ${sampleProducts.length * 4} (approx 4 per product)`
    );
    console.log(`  - Frames: ${sampleFrames.length}`);
    console.log("");
  } catch (error) {
    console.error("\nSeed failed with error:", error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

// Run seed if executed directly
seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
