// Database seed script for the Poster & Frame E-Commerce Platform
// Populates the database with sample products, variants, and frames for development

import { MAT_CANVAS, type ProductImage } from "@chobii/shared";
import {
  buildSeedImageFromFile,
  buildSeedImageFromUrl,
  localSeedMediaSet,
  summarizeLocalSeedMedia,
} from "./seed-images";
import { buildVariantsForOrientation } from "./seed-variants";
import { facetsForProduct } from "./seed-facets";
import {
  clearOrdersAndReviews,
  seedOrdersAndReviews,
} from "./seed-orders-reviews";
import { seedCollections, countCollections } from "./seed-collections";

/**
 * Orientations the shared ladder covers. `round` has no ladder yet — it falls
 * back to portrait rather than seeding a product with zero variants.
 */
const LADDERED_ORIENTATIONS = new Set([
  "square",
  "portrait",
  "landscape",
  "panoramic",
]);
import { sql } from "drizzle-orm";
import { db, closeDatabase } from "./index";
import { sampleFrames } from "./seed-frames";
import { redis, CacheKeys } from "../lib/redis";
import {
  products,
  productVariants,
  frames,
  type NewProduct,
  type NewProductVariant,
} from "./schema";

// The `images` entries below declare a SOURCE url and placeholder dimensions.
// They are not what gets stored: processProductImages() downloads each source,
// mats or crops it to MAT_CANVAS, uploads to our own storage and replaces the
// record before insert. Only `url`, `altText`, `type` and `sortOrder` are read.

// ============================================================================
// Sample Data
// ============================================================================

/**
 * Sample poster products covering various styles and subjects
 */
const sampleProducts: NewProduct[] = [
  /**
   * HOVER FIXTURE — guaranteed multiple media.
   *
   * Exercises the hover path: cursor-X scrub across three room-mockup slides,
   * plus the n-1 dot indicator. #375's e2e spec locates the card by the
   * presence of dots, and this product leads the home grid at featuredOrder 0,
   * so it is what the spec's .first() resolves to. Do not reduce it below four
   * media, and do not demote it below featuredOrder 0.
   *
   * These URLs are the floor, not the ceiling: REFERENCE_MEDIA overrides them
   * with local fixture imagery when that directory exists, which gives every
   * other product room mockups too. Either way this one has four.
   */
  {
    sku: "FIX-001",
    title: "Wabi-Sabi Study",
    slug: "wabi-sabi-study",
    description:
      "A textured wabi-sabi composition in muted earth tones. Seeded with multiple room mockups so the grid hover interaction can be exercised locally and in e2e.",
    basePrice: "2499.00",
    styles: ["wabi-sabi", "minimalist"],
    subjects: ["abstract", "texture"],
    colors: ["beige", "grey", "cream"],
    rooms: ["living-room", "bedroom"],
    tags: ["fixture", "wabi-sabi"],
    orientation: "portrait",
    images: [
      {
        id: "fix-main",
        url: "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=2000",
        altText: "Wabi-Sabi Study textured artwork",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "",
      },
      {
        id: "fix-room-1",
        url: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=2000",
        altText: "Wabi-Sabi Study in a living room",
        type: "room-mockup",
        sortOrder: 1,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "",
      },
      {
        id: "fix-room-2",
        url: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=2000",
        altText: "Wabi-Sabi Study in a bedroom",
        type: "room-mockup",
        sortOrder: 2,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "",
      },
      {
        id: "fix-room-3",
        url: "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=2000",
        altText: "Wabi-Sabi Study in a hallway",
        type: "room-mockup",
        sortOrder: 3,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "",
      },
    ] as ProductImage[],
    seoTitle: "Wabi-Sabi Study | Textured Wall Art",
    seoDescription:
      "A textured wabi-sabi composition in muted earth tones.",
    status: "active",
    isFeatured: true,
    featuredOrder: 0,
  },
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
        url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=2000",
        altText: "Cosmic Harmony Abstract Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-1.jpg",
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
        url: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=2000",
        altText: "Golden Flow Abstract Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-2.jpg",
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
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=2000",
        altText: "Serene Waves Abstract Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-3.jpg",
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
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=2000",
        altText: "Mountain Majesty Landscape",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-4.jpg",
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
        url: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=2000",
        altText: "Forest Whispers Nature Print",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-5.jpg",
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
        url: "https://images.unsplash.com/photo-1509587584298-0f3b3a3a1797?w=2000",
        altText: "Desert Bloom Nature Print",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-6.jpg",
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
        url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=2000",
        altText: "Monstera Dreams Botanical Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-7.jpg",
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
        url: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=2000",
        altText: "Eucalyptus Study Botanical Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-8.jpg",
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
        url: "https://images.unsplash.com/photo-1515825838458-f2a94b20105a?w=2000",
        altText: "Circle of Zen Minimalist Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-9.jpg",
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
        url: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=2000",
        altText: "Linear Horizons Minimalist Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-10.jpg",
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
        url: "https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=2000",
        altText: "Stay Curious Typography Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-11.jpg",
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
        url: "https://images.unsplash.com/photo-1499678329028-101435549a4e?w=2000",
        altText: "Dream Big Typography Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-12.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Dream Big Typography Print | Inspirational Wall Art",
    seoDescription:
      "Discover the Dream Big print. Elegant script typography for dreamers and go-getters.",
    status: "active",
    isFeatured: false,
  },

  // ============================================================================
  // EXPANDED COLLECTION - For comprehensive filter coverage
  // ============================================================================

  // Wabi-Sabi Collection (2 more)
  {
    sku: "WBS-001",
    title: "Imperfect Vessel",
    slug: "imperfect-vessel",
    description:
      "A cracked ceramic vessel celebrating the beauty of imperfection. Wabi-sabi philosophy rendered in earthy tones.",
    basePrice: "1199.00",
    styles: ["wabi-sabi", "minimalist"],
    subjects: ["abstract-geometric"],
    colors: ["beige", "earth-tones", "neutral"],
    rooms: ["living-room", "bedroom", "office"],
    tags: ["wabi-sabi", "imperfect", "zen"],
    orientation: "square",
    images: [
      {
        id: "img-wbs-1",
        url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=2000",
        altText: "Imperfect Vessel Wabi-Sabi Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-wbs-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Imperfect Vessel Wabi-Sabi Print | Zen Wall Art",
    seoDescription: "Embrace imperfection with this wabi-sabi ceramic vessel art print.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "WBS-002",
    title: "Weathered Stone",
    slug: "weathered-stone",
    description:
      "Time-worn stone textures in muted grays. A meditation on aging and natural beauty.",
    basePrice: "999.00",
    styles: ["wabi-sabi", "texture-art"],
    subjects: ["nature-landscape"],
    colors: ["grey", "neutral", "beige"],
    rooms: ["bedroom", "bathroom", "office"],
    tags: ["texture", "stone", "natural"],
    orientation: "portrait",
    images: [
      {
        id: "img-wbs-2",
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=2000",
        altText: "Weathered Stone Texture Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-wbs-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Weathered Stone Texture Print | Wabi-Sabi Wall Art",
    seoDescription: "Natural stone textures celebrating the beauty of aging.",
    status: "active",
    isFeatured: false,
  },

  // Pop Art Collection (2 more)
  {
    sku: "POP-001",
    title: "Neon Dreams",
    slug: "neon-dreams",
    description:
      "Vibrant neon colors explode across the canvas in this bold pop art piece. Electric energy for modern spaces.",
    basePrice: "1299.00",
    styles: ["pop-art", "modern-contemporary"],
    subjects: ["abstract-geometric"],
    colors: ["pink", "colorful", "multi"],
    rooms: ["living-room", "kids-room", "office"],
    tags: ["neon", "bold", "vibrant"],
    orientation: "square",
    images: [
      {
        id: "img-pop-1",
        url: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=2000",
        altText: "Neon Dreams Pop Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-pop-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Neon Dreams Pop Art Print | Bold Wall Decor",
    seoDescription: "Electric neon pop art for vibrant modern interiors.",
    status: "active",
    isFeatured: true,
    featuredOrder: 5,
  },
  {
    sku: "POP-002",
    title: "Comic Burst",
    slug: "comic-burst",
    description:
      "Classic comic book style explosion with halftone dots and bold primary colors.",
    basePrice: "899.00",
    styles: ["pop-art", "retro"],
    subjects: ["abstract-geometric"],
    colors: ["red", "blue", "colorful"],
    rooms: ["kids-room", "office", "living-room"],
    tags: ["comic", "retro", "fun"],
    orientation: "landscape",
    images: [
      {
        id: "img-pop-2",
        url: "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=2000",
        altText: "Comic Burst Pop Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-pop-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Comic Burst Pop Art Print | Retro Wall Art",
    seoDescription: "Classic comic book style pop art for playful spaces.",
    status: "active",
    isFeatured: false,
  },

  // Vintage Collection (2 more)
  {
    sku: "VIN-001",
    title: "Paris 1920",
    slug: "paris-1920",
    description:
      "Art deco inspired poster reminiscent of 1920s Paris. Golden elegance meets vintage charm.",
    basePrice: "1399.00",
    styles: ["vintage", "retro"],
    subjects: ["city-architecture"],
    colors: ["gold", "black", "beige"],
    rooms: ["living-room", "dining-room", "entryway"],
    tags: ["art-deco", "paris", "vintage"],
    orientation: "portrait",
    images: [
      {
        id: "img-vin-1",
        url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=2000",
        altText: "Paris 1920 Vintage Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-vin-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Paris 1920 Art Deco Print | Vintage Wall Art",
    seoDescription: "Transport your space to 1920s Paris with this art deco print.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "VIN-002",
    title: "Botanical Atlas",
    slug: "botanical-atlas",
    description:
      "Scientific botanical illustration in vintage encyclopedia style. Detailed flora studies.",
    basePrice: "1099.00",
    styles: ["vintage", "photographic"],
    subjects: ["flowers-botanical"],
    colors: ["green", "beige", "earth-tones"],
    rooms: ["kitchen-dining", "bathroom", "office"],
    tags: ["botanical", "scientific", "vintage"],
    orientation: "portrait",
    images: [
      {
        id: "img-vin-2",
        url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=2000",
        altText: "Botanical Atlas Vintage Print",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-vin-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Botanical Atlas Vintage Print | Scientific Wall Art",
    seoDescription: "Classic botanical illustration for nature enthusiasts.",
    status: "active",
    isFeatured: false,
  },

  // Surrealist Collection (2 products)
  {
    sku: "SUR-001",
    title: "Floating Islands",
    slug: "floating-islands",
    description:
      "Dreamlike landscape where islands float in an impossible sky. Surrealism meets fantasy.",
    basePrice: "1599.00",
    styles: ["surrealist", "modern-contemporary"],
    subjects: ["nature-landscape"],
    colors: ["blue", "green", "colorful"],
    rooms: ["living-room", "bedroom", "kids-room"],
    tags: ["surreal", "fantasy", "dream"],
    orientation: "landscape",
    images: [
      {
        id: "img-sur-1",
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=2000",
        altText: "Floating Islands Surrealist Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-sur-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Floating Islands Surrealist Print | Fantasy Wall Art",
    seoDescription: "Surrealist dreamscape for imaginative spaces.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "SUR-002",
    title: "Melting Time",
    slug: "melting-time",
    description:
      "Time bends and melts in this Dalí-inspired piece. A philosophical meditation on impermanence.",
    basePrice: "1449.00",
    styles: ["surrealist", "abstract"],
    subjects: ["abstract-geometric"],
    colors: ["gold", "blue", "neutral"],
    rooms: ["office", "living-room", "bedroom"],
    tags: ["surreal", "time", "philosophical"],
    orientation: "square",
    images: [
      {
        id: "img-sur-2",
        url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=2000",
        altText: "Melting Time Surrealist Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-sur-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Melting Time Surrealist Print | Abstract Wall Art",
    seoDescription: "Surrealist exploration of time and reality.",
    status: "active",
    isFeatured: false,
  },

  // Bohemian Collection (2 products)
  {
    sku: "BOH-001",
    title: "Desert Tapestry",
    slug: "desert-tapestry",
    description:
      "Rich desert patterns inspired by Moroccan textiles. Warm earth tones and intricate geometry.",
    basePrice: "1199.00",
    styles: ["bohemian", "texture-art"],
    subjects: ["abstract-geometric"],
    colors: ["earth-tones", "gold", "red"],
    rooms: ["living-room", "bedroom", "entryway"],
    tags: ["moroccan", "textile", "boho"],
    orientation: "portrait",
    images: [
      {
        id: "img-boh-1",
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=2000",
        altText: "Desert Tapestry Bohemian Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-boh-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Desert Tapestry Bohemian Print | Boho Wall Art",
    seoDescription: "Moroccan-inspired bohemian art for eclectic spaces.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "BOH-002",
    title: "Mandala Garden",
    slug: "mandala-garden",
    description:
      "Intricate mandala pattern in vibrant jewel tones. Spiritual art meets bohemian style.",
    basePrice: "1099.00",
    styles: ["bohemian", "abstract"],
    subjects: ["abstract-geometric"],
    colors: ["colorful", "pink", "gold"],
    rooms: ["bedroom", "kids-room", "bathroom"],
    tags: ["mandala", "spiritual", "colorful"],
    orientation: "square",
    images: [
      {
        id: "img-boh-2",
        url: "https://images.unsplash.com/photo-1509587584298-0f3b3a3a1797?w=2000",
        altText: "Mandala Garden Bohemian Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-boh-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Mandala Garden Bohemian Print | Spiritual Wall Art",
    seoDescription: "Vibrant mandala art for mindful spaces.",
    status: "active",
    isFeatured: false,
  },

  // Modern Contemporary Collection (2 more)
  {
    sku: "MOD-001",
    title: "Urban Geometry",
    slug: "urban-geometry",
    description:
      "Bold geometric shapes inspired by modern architecture. Clean lines and contemporary appeal.",
    basePrice: "1349.00",
    styles: ["modern-contemporary", "minimalist"],
    subjects: ["city-architecture", "abstract-geometric"],
    colors: ["black", "white", "grey"],
    rooms: ["office", "living-room", "entryway"],
    tags: ["geometric", "architecture", "modern"],
    orientation: "square",
    images: [
      {
        id: "img-mod-1",
        url: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=2000",
        altText: "Urban Geometry Modern Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-mod-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Urban Geometry Modern Print | Contemporary Wall Art",
    seoDescription: "Architectural geometry for modern interiors.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "MOD-002",
    title: "Color Block",
    slug: "color-block",
    description:
      "Bold color blocking in contemporary style. Primary colors meet modern design principles.",
    basePrice: "1199.00",
    styles: ["modern-contemporary", "abstract"],
    subjects: ["abstract-geometric"],
    colors: ["red", "blue", "colorful"],
    rooms: ["living-room", "kids-room", "office"],
    tags: ["color-block", "bold", "modern"],
    orientation: "landscape",
    images: [
      {
        id: "img-mod-2",
        url: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=2000",
        altText: "Color Block Modern Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-mod-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Color Block Modern Print | Bold Wall Art",
    seoDescription: "Contemporary color blocking for vibrant spaces.",
    status: "active",
    isFeatured: false,
  },

  // Photographic Collection (3 more - various subjects)
  {
    sku: "PHO-001",
    title: "Ocean Horizon",
    slug: "ocean-horizon",
    description:
      "Serene ocean view at golden hour. The perfect meeting of sea and sky.",
    basePrice: "1499.00",
    styles: ["photographic"],
    subjects: ["sea-ocean", "nature-landscape"],
    colors: ["blue", "gold", "neutral"],
    rooms: ["bedroom", "bathroom", "living-room"],
    tags: ["ocean", "seascape", "calming"],
    orientation: "panoramic",
    images: [
      {
        id: "img-pho-1",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=2000",
        altText: "Ocean Horizon Photography",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-pho-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Ocean Horizon Panoramic Print | Seascape Wall Art",
    seoDescription: "Breathtaking ocean photography for peaceful spaces.",
    status: "active",
    isFeatured: true,
    featuredOrder: 6,
  },
  {
    sku: "PHO-002",
    title: "City Lights",
    slug: "city-lights",
    description:
      "Metropolitan skyline at night with glittering lights. Urban energy captured in photography.",
    basePrice: "1599.00",
    styles: ["photographic", "modern-contemporary"],
    subjects: ["city-architecture"],
    colors: ["black", "gold", "multi"],
    rooms: ["office", "living-room", "entryway"],
    tags: ["cityscape", "night", "urban"],
    orientation: "panoramic",
    images: [
      {
        id: "img-pho-2",
        url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=2000",
        altText: "City Lights Photography",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-pho-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "City Lights Panoramic Print | Urban Wall Art",
    seoDescription: "Stunning cityscape photography for modern spaces.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "PHO-003",
    title: "Wild Spirit",
    slug: "wild-spirit",
    description:
      "Majestic wildlife portrait capturing the untamed beauty of nature. Powerful and evocative.",
    basePrice: "1399.00",
    styles: ["photographic"],
    subjects: ["animals"],
    colors: ["earth-tones", "black", "neutral"],
    rooms: ["living-room", "office", "bedroom"],
    tags: ["wildlife", "portrait", "nature"],
    orientation: "portrait",
    images: [
      {
        id: "img-pho-3",
        url: "https://images.unsplash.com/photo-1425913397330-cf8af2ff40a1?w=2000",
        altText: "Wild Spirit Wildlife Photography",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-pho-3.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Wild Spirit Wildlife Print | Nature Photography",
    seoDescription: "Powerful wildlife photography for nature lovers.",
    status: "active",
    isFeatured: false,
  },

  // Texture Art Collection (2 products)
  {
    sku: "TEX-001",
    title: "Concrete Poetry",
    slug: "concrete-poetry",
    description:
      "Raw concrete textures create an industrial aesthetic. Brutalist beauty for modern spaces.",
    basePrice: "999.00",
    styles: ["texture-art", "minimalist"],
    subjects: ["abstract-geometric"],
    colors: ["grey", "neutral", "black"],
    rooms: ["office", "living-room", "entryway"],
    tags: ["concrete", "industrial", "brutalist"],
    orientation: "square",
    images: [
      {
        id: "img-tex-1",
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=2000",
        altText: "Concrete Poetry Texture Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-tex-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Concrete Poetry Texture Print | Industrial Wall Art",
    seoDescription: "Industrial concrete textures for modern spaces.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "TEX-002",
    title: "Paper Layers",
    slug: "paper-layers",
    description:
      "Delicate layers of handmade paper create depth and shadow. Tactile beauty in visual form.",
    basePrice: "1099.00",
    styles: ["texture-art", "wabi-sabi"],
    subjects: ["abstract-geometric"],
    colors: ["white", "beige", "neutral"],
    rooms: ["bedroom", "bathroom", "office"],
    tags: ["paper", "layers", "delicate"],
    orientation: "portrait",
    images: [
      {
        id: "img-tex-2",
        url: "https://images.unsplash.com/photo-1515825838458-f2a94b20105a?w=2000",
        altText: "Paper Layers Texture Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-tex-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Paper Layers Texture Print | Minimalist Wall Art",
    seoDescription: "Delicate paper textures for serene spaces.",
    status: "active",
    isFeatured: false,
  },

  // Quotes/Motivational Collection (2 more)
  {
    sku: "QUO-001",
    title: "Be Present",
    slug: "be-present",
    description:
      "Mindfulness reminder in elegant modern typography. A daily invitation to presence.",
    basePrice: "599.00",
    styles: ["quotes", "minimalist"],
    subjects: ["motivational"],
    colors: ["black", "white"],
    rooms: ["bedroom", "office", "bathroom"],
    tags: ["mindfulness", "zen", "typography"],
    orientation: "square",
    images: [
      {
        id: "img-quo-1",
        url: "https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=2000",
        altText: "Be Present Quote Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-quo-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Be Present Quote Print | Mindfulness Wall Art",
    seoDescription: "Mindfulness quote for daily inspiration.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "QUO-002",
    title: "Create Every Day",
    slug: "create-every-day",
    description:
      "Inspiration for makers and creators. Bold lettering that sparks creativity.",
    basePrice: "649.00",
    styles: ["quotes", "typography"],
    subjects: ["motivational"],
    colors: ["colorful", "black", "white"],
    rooms: ["office", "kids-room", "living-room"],
    tags: ["creative", "inspiration", "maker"],
    orientation: "landscape",
    images: [
      {
        id: "img-quo-2",
        url: "https://images.unsplash.com/photo-1499678329028-101435549a4e?w=2000",
        altText: "Create Every Day Quote Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-quo-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Create Every Day Quote Print | Inspirational Wall Art",
    seoDescription: "Creative inspiration for makers and artists.",
    status: "active",
    isFeatured: false,
  },

  // Retro Collection (2 products)
  {
    sku: "RET-001",
    title: "Sunset Boulevard",
    slug: "sunset-boulevard",
    description:
      "70s inspired gradient sunset in warm retro colors. Nostalgic vibes for modern spaces.",
    basePrice: "1099.00",
    styles: ["retro", "vintage"],
    subjects: ["nature-landscape"],
    colors: ["pink", "gold", "colorful"],
    rooms: ["living-room", "bedroom", "kids-room"],
    tags: ["70s", "sunset", "gradient"],
    orientation: "square",
    images: [
      {
        id: "img-ret-1",
        url: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=2000",
        altText: "Sunset Boulevard Retro Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-ret-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Sunset Boulevard Retro Print | 70s Wall Art",
    seoDescription: "70s inspired sunset art for nostalgic spaces.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "RET-002",
    title: "Vinyl Vibes",
    slug: "vinyl-vibes",
    description:
      "Record player and vinyl collection in retro color palette. Music lover's dream piece.",
    basePrice: "999.00",
    styles: ["retro", "pop-art"],
    subjects: ["abstract-geometric"],
    colors: ["black", "red", "gold"],
    rooms: ["living-room", "office", "bedroom"],
    tags: ["music", "vinyl", "retro"],
    orientation: "landscape",
    images: [
      {
        id: "img-ret-2",
        url: "https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=2000",
        altText: "Vinyl Vibes Retro Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-ret-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Vinyl Vibes Retro Print | Music Wall Art",
    seoDescription: "Retro music art for vinyl enthusiasts.",
    status: "active",
    isFeatured: false,
  },

  // Additional Panoramic (for orientation coverage)
  {
    sku: "PAN-001",
    title: "Alpine Majesty",
    slug: "alpine-majesty",
    description:
      "Sweeping panoramic view of snow-capped Alpine peaks. Nature's grandeur in wide format.",
    basePrice: "1899.00",
    styles: ["photographic"],
    subjects: ["mountains", "nature-landscape"],
    colors: ["white", "blue", "grey"],
    rooms: ["living-room", "office", "cabin"],
    tags: ["alps", "mountains", "panoramic"],
    orientation: "panoramic",
    images: [
      {
        id: "img-pan-1",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=2000",
        altText: "Alpine Majesty Panoramic",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-pan-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Alpine Majesty Panoramic Print | Mountain Wall Art",
    seoDescription: "Stunning Alpine panorama for nature lovers.",
    status: "active",
    isFeatured: false,
  },

  // People & Portraits (for subject coverage)
  {
    sku: "POR-001",
    title: "Urban Soul",
    slug: "urban-soul",
    description:
      "Artistic portrait capturing the essence of urban life. Moody and evocative street photography.",
    basePrice: "1299.00",
    styles: ["photographic", "modern-contemporary"],
    subjects: ["people-portraits"],
    colors: ["black-white", "grey", "neutral"],
    rooms: ["living-room", "office", "bedroom"],
    tags: ["portrait", "urban", "street"],
    orientation: "portrait",
    images: [
      {
        id: "img-por-1",
        url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=2000",
        altText: "Urban Soul Portrait",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-por-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Urban Soul Portrait Print | Street Photography",
    seoDescription: "Evocative urban portrait photography.",
    status: "active",
    isFeatured: false,
  },

  // Additional colors coverage
  {
    sku: "COL-001",
    title: "Emerald Dreams",
    slug: "emerald-dreams",
    description:
      "Deep emerald green abstract with gold accents. Luxurious color combination for elegant spaces.",
    basePrice: "1499.00",
    styles: ["abstract", "modern-contemporary"],
    subjects: ["abstract-geometric"],
    colors: ["green", "gold"],
    rooms: ["living-room", "dining-room", "bedroom"],
    tags: ["emerald", "luxury", "gold"],
    orientation: "portrait",
    images: [
      {
        id: "img-col-1",
        url: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=2000",
        altText: "Emerald Dreams Abstract",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-col-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Emerald Dreams Abstract Print | Luxury Wall Art",
    seoDescription: "Luxurious emerald and gold abstract art.",
    status: "active",
    isFeatured: false,
  },
  {
    sku: "COL-002",
    title: "Blush Hour",
    slug: "blush-hour",
    description:
      "Soft pink gradients meet abstract forms. Feminine elegance in contemporary style.",
    basePrice: "1199.00",
    styles: ["abstract", "minimalist"],
    subjects: ["abstract-geometric"],
    colors: ["pink", "white", "neutral"],
    rooms: ["bedroom", "bathroom", "kids-room"],
    tags: ["blush", "feminine", "soft"],
    orientation: "square",
    images: [
      {
        id: "img-col-2",
        url: "https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=2000",
        altText: "Blush Hour Abstract",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-col-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Blush Hour Abstract Print | Pink Wall Art",
    seoDescription: "Soft pink abstract art for elegant spaces.",
    status: "active",
    isFeatured: false,
  },

  // AI Generated Collection
  {
    sku: "AI-001",
    title: "Neural Dreams",
    slug: "neural-dreams",
    description:
      "An AI-generated masterpiece featuring surreal dreamscapes with flowing organic forms. Created using advanced neural networks to blend imagination with artistic vision.",
    basePrice: "1899.00",
    styles: ["abstract", "modern-contemporary"],
    subjects: ["abstract-geometric", "patterns"],
    colors: ["purple", "blue", "pink"],
    rooms: ["living-room", "office", "bedroom"],
    tags: ["ai-generated", "surreal", "dreamscape"],
    orientation: "landscape",
    images: [
      {
        id: "img-ai-1",
        url: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=2000",
        altText: "Neural Dreams AI Generated Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-ai-1.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Neural Dreams AI Art | Unique Generated Wall Art",
    seoDescription:
      "One-of-a-kind AI-generated art featuring surreal dreamscapes and flowing forms.",
    status: "active",
    isFeatured: false,
    isAiGenerated: true,
  },
  {
    sku: "AI-002",
    title: "Digital Cosmos",
    slug: "digital-cosmos",
    description:
      "AI-crafted cosmic landscape merging nebulae and digital fractals. A unique piece that bridges technology and cosmic wonder.",
    basePrice: "2199.00",
    styles: ["abstract", "modern-contemporary"],
    subjects: ["space", "patterns"],
    colors: ["black", "purple", "gold"],
    rooms: ["office", "living-room", "media-room"],
    tags: ["ai-generated", "cosmic", "digital", "space"],
    orientation: "square",
    images: [
      {
        id: "img-ai-2",
        url: "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=2000",
        altText: "Digital Cosmos AI Generated Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-ai-2.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Digital Cosmos AI Art | Space-Inspired Generated Art",
    seoDescription:
      "AI-generated cosmic art blending nebulae with digital fractals.",
    status: "active",
    isFeatured: true,
    featuredOrder: 10,
    isAiGenerated: true,
  },
  {
    sku: "AI-003",
    title: "Synthetic Nature",
    slug: "synthetic-nature",
    description:
      "Nature reimagined through artificial intelligence. Organic forms meet algorithmic precision in this unique botanical interpretation.",
    basePrice: "1699.00",
    styles: ["botanical", "modern-contemporary"],
    subjects: ["flora-botanical", "nature-landscape"],
    colors: ["green", "teal", "neutral"],
    rooms: ["bedroom", "living-room", "spa"],
    tags: ["ai-generated", "botanical", "nature", "organic"],
    orientation: "portrait",
    images: [
      {
        id: "img-ai-3",
        url: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=2000",
        altText: "Synthetic Nature AI Generated Art",
        type: "main",
        sortOrder: 0,
        width: MAT_CANVAS,
        height: MAT_CANVAS,
        originalKey: "products/originals/img-ai-3.jpg",
      },
    ] as ProductImage[],
    seoTitle: "Synthetic Nature AI Art | Botanical Generated Art",
    seoDescription:
      "AI-generated botanical art reimagining nature through algorithms.",
    status: "active",
    isFeatured: false,
    isAiGenerated: true,
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
  /**
   * Before products: reviews hold a NOT NULL FK to order_items, and orders
   * outlive a product deletion (order_items.product_id is ON DELETE SET
   * NULL), so clearing products alone leaves orphaned purchase history that
   * the next seed would double.
   */
  await clearOrdersAndReviews();
  await db.delete(productVariants);
  await db.delete(products);
  await db.delete(frames);
  await clearProductCache();
  console.log("Data cleared successfully.");
}

/**
 * Drop the Redis copies of everything we just replaced.
 *
 * GET /api/products/:slug caches its whole payload, frames included, for
 * CACHE_TTL_PRODUCT_DETAIL. Without this a reseed leaves the API serving the
 * PREVIOUS run's prices and assets from cache while /api/products/frames — which
 * does not cache — serves the new ones, so the two endpoints disagree and the
 * storefront looks like it ignored the seed. Cost an afternoon once (#420).
 */
async function clearProductCache(): Promise<void> {
  try {
    const keys = await redis.keys(`${CacheKeys.PRODUCT}*`);
    const listKeys = await redis.keys(`${CacheKeys.PRODUCT_LIST}*`);
    const all = [...keys, ...listKeys];
    if (all.length > 0) await redis.del(...all);
    console.log(`  Cleared ${all.length} cached product payload(s)`);
  } catch (error) {
    // A dev box without Redis up should still be able to seed.
    console.warn(
      `  Could not clear the product cache: ${(error as Error).message}`
    );
  }
}

/**
 * Turn a product's declared source URLs into genuinely matted, self-hosted
 * images satisfying the square contract.
 *
 * The literals in sampleProducts carry remote URLs and *asserted* MAT_CANVAS
 * dimensions. This replaces them with real records: the source is downloaded
 * (cached), matted or cropped by the same code path the admin upload uses, and
 * pushed to storage.
 *
 * Failures are non-fatal — a dead source URL should leave that one product
 * without imagery rather than abort the whole seed.
 */
/**
 * Products that prefer local reference imagery over their declared URL.
 *
 * Maps a seed slug to a file prefix under SEED_MEDIA_DIR. The set is an
 * evaluation fixture captured from a live storefront during the design-parity
 * work: real textured artwork plus real room mockups, which stock-photo URLs
 * cannot supply and which the PDP gallery and the card hover both need.
 *
 * It is test-only. The files are third-party and carry that storefront's
 * watermark, they are gitignored and absent from the repository, and none of
 * it is publishable — it exists so the local catalogue looks like a catalogue.
 *
 * Pairing is by subject, so a product's copy still describes its picture.
 * When the directory is missing the whole map goes inert and every product
 * falls back to its declared URL.
 */
const REFERENCE_MEDIA: Record<string, string> = {
  // Every entry has a main artwork plus three room scenes, bar the two noted.
  "wabi-sabi-study": "tx462", // misty mountain, heavy texture
  "floating-islands": "tx463", // mountains dissolving into mist
  "imperfect-vessel": "tx450", // lone tree against a broken white field (2 rooms)
  "weathered-stone": "tx466", // eroded cliff face
  "paper-layers": "tx449", // two-panel set, layered
  "desert-bloom": "tx070", // seed-head field
  "mountain-majesty": "tx218", // peak above a river
  "ocean-horizon": "tx556", // sea against a pale sky
  "serene-waves": "tx557", // abstract water
  "forest-whispers": "tx532", // trees over still water

  "cosmic-harmony": "sa126", // celestial figure
  "golden-flow": "sg259", // gold tree, heavy impasto
  "monstera-dreams": "bp085", // monstera leaves
  "eucalyptus-study": "ma314", // bare branches in a vase
  "circle-of-zen": "uk002", // ukiyo-e line figure
  "linear-horizons": "aea038", // white line field
  "stay-curious": "ma237", // block lettering
  "dream-big": "csq025", // loose script over texture
  "neon-dreams": "ca180", // high-chroma pop face
  "comic-burst": "ga009", // comic-panel graffiti
  "paris-1920": "sg324", // Eiffel Tower under snow
  "botanical-atlas": "sg486", // white blooms in a vase
  "melting-time": "sa001", // surrealist portrait
  "desert-tapestry": "bp093", // kilim diamonds, terracotta
  "urban-geometry": "ma217", // interlocking beige forms
  "color-block": "ma194", // flat colour blocks
  "city-lights": "sg667", // skyline at night
  "wild-spirit": "ma273", // single-line horse
  "concrete-poetry": "llc068", // concrete columns
  "be-present": "tx479", // bamboo over water
  "create-every-day": "ga246", // graffiti with lettering
  "sunset-boulevard": "aq006", // pier at golden hour
  "vinyl-vibes": "csq166", // jazz players
  "alpine-majesty": "sg177", // snow slope, plaster relief
  "urban-soul": "pac022", // pop-art portrait
  "emerald-dreams": "ca340", // green and teal wash
  "blush-hour": "ca106", // pink and olive shapes
  "neural-dreams": "sg613", // banded plaster waves
  "digital-cosmos": "sp108", // two-panel moon study
  "synthetic-nature": "sg595", // gold botanicals on black
  "mandala-garden": "bp094", // kilim diamonds, rose
};

/**
 * Say up front how much of the reference set this run found.
 *
 * Both a clone without the fixtures and a run whose SEED_MEDIA_DIR is simply
 * wrong produce the same successful seed against the declared stock URLs. The
 * difference used to be invisible until you counted room-mockup rows in
 * Postgres afterwards — which is how a degraded catalogue survived a whole
 * afternoon of design-parity work (#450). Printing the directory alongside the
 * count makes a wrong path self-evident.
 */
function reportReferenceMedia(): void {
  const { resolved, total, dir } = summarizeLocalSeedMedia(
    Object.values(REFERENCE_MEDIA)
  );

  if (resolved === total) {
    console.log(`  Reference media: ${resolved}/${total} from ${dir}`);
    return;
  }

  console.log(
    `  Reference media: ${resolved}/${total} from ${dir} — ` +
      `${total - resolved} product(s) falling back to declared stock URLs.`
  );
}

/** A resolved image source: a local fixture file, or a remote URL. */
interface SeedImageSource {
  local: boolean;
  ref: string;
  altText: string;
  type: ProductImage["type"];
}

/**
 * Choose where one product's imagery comes from.
 *
 * Local reference media wins when present, because it is the only source with
 * matching room mockups. Otherwise the declared URLs are used unchanged.
 */
function sourcesFor(productData: NewProduct): SeedImageSource[] {
  const prefix = REFERENCE_MEDIA[productData.slug ?? ""];
  const local = prefix ? localSeedMediaSet(prefix) : [];

  if (local.length > 0) {
    return local.map((media) => ({
      local: true,
      ref: media.file,
      type: media.type,
      altText:
        media.type === "main"
          ? `${productData.title} artwork`
          : `${productData.title} framed on a wall`,
    }));
  }

  return ((productData.images ?? []) as ProductImage[]).map((img) => ({
    local: false,
    ref: img.url,
    type: img.type,
    altText: img.altText,
  }));
}

async function processProductImages(
  productData: NewProduct
): Promise<ProductImage[]> {
  const declared = sourcesFor(productData);
  const built: ProductImage[] = [];

  for (const [i, src] of declared.entries()) {
    try {
      built.push(
        src.local
          ? await buildSeedImageFromFile(
              src.ref,
              `${productData.slug}-${i}.webp`,
              src.altText,
              i,
              src.type
            )
          : await buildSeedImageFromUrl(
              src.ref,
              `${productData.slug}-${i}.jpg`,
              src.altText,
              i,
              src.type
            )
      );
    } catch (error) {
      console.warn(
        `    ! image ${i} failed for ${productData.slug}: ${(error as Error).message}`
      );
    }
  }

  if (declared.length > 0 && built.length === 0) {
    // Warn loudly: a product with no imagery renders a placeholder card and
    // silently degrades the dev catalogue. Usually means a rotted source URL.
    console.error(
      `    !! ${productData.slug} has NO images — every source failed. ` +
        "Check the URLs in sampleProducts."
    );
  }

  return built;
}

/**
 * Seed products and their variants
 */
async function seedProducts(): Promise<void> {
  console.log("Seeding products...");
  reportReferenceMedia();

  for (const productData of sampleProducts) {
    // Download, mat and upload this product's imagery before inserting, so the
    // stored records point at our own matted assets rather than remote sources.
    const images = await processProductImages(productData);

    // Insert product
    const [insertedProduct] = await db
      .insert(products)
      /**
       * Facets are derived from the sku, not taken from the literals above.
       * The hand-written values predate the vocabularies in @chobii/shared and
       * used the old ad-hoc ids (`minimalist` where the vocabulary says
       * `minimalist-art`), which the API now rejects outright.
       */
      .values({ ...productData, images, ...facetsForProduct(productData.sku) })
      .returning({ id: products.id, orientation: products.orientation });

    if (!insertedProduct) {
      console.error(`  Failed to create product: ${productData.title}`);
      continue;
    }

    console.log(`  Created product: ${productData.title}`);

    // Variants come from the shared size ladder, not from a table in this
    // file. See seed-variants.ts for why that mattered.
    const ladderOrientation = LADDERED_ORIENTATIONS.has(
      insertedProduct.orientation
    )
      ? (insertedProduct.orientation as Parameters<
          typeof buildVariantsForOrientation
        >[0])
      : "portrait";

    const templates = buildVariantsForOrientation(
      ladderOrientation,
      parseFloat(productData.basePrice)
    );

    if (templates.length === 0) {
      console.error(
        `  No ladder for orientation: ${insertedProduct.orientation}`
      );
      continue;
    }

    const variantsToInsert: NewProductVariant[] = templates.map((template) => ({
      ...template,
      productId: insertedProduct.id,
      variantSku: `${productData.sku}-${template.widthInches}x${template.heightInches}`,
    }));

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
  console.log("  chobii.art Database Seed Script");
  console.log("========================================\n");

  try {
    // Clear existing data first
    await clearData();

    // Seed all data
    await seedProducts();
    await seedFrames();
    // After products and their variants: an order item snapshots a real
    // variant, and a review needs the order item that authorises it.
    await seedOrdersAndReviews();
    // Collections resolve their members live, so they do not depend on the
    // products existing first. Seeded last anyway, so the summary below can
    // report a count that means something.
    await seedCollections();

    console.log("\n========================================");
    console.log("  Seed completed successfully!");
    console.log("========================================\n");

    // Summary
    console.log("Summary:");
    console.log(`  - Products: ${sampleProducts.length}`);
    // Counted, not guessed: the ladder gives 13-17 steps depending on
    // orientation, so the old `length * 4` has been wrong since #386.
    const [{ count: variantCount = 0 } = {}] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productVariants);
    console.log(`  - Variants: ${variantCount}`);
    console.log(`  - Frames: ${sampleFrames.length}`);
    console.log(`  - Collections: ${await countCollections()}`);
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
