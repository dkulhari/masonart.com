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
        url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
        alt: "Imperfect Vessel Wabi-Sabi Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
        alt: "Weathered Stone Texture Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=800",
        alt: "Neon Dreams Pop Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800",
        alt: "Comic Burst Pop Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800",
        alt: "Paris 1920 Vintage Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=800",
        alt: "Botanical Atlas Vintage Print",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800",
        alt: "Floating Islands Surrealist Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800",
        alt: "Melting Time Surrealist Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
        alt: "Desert Tapestry Bohemian Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1509587584298-0f3b3a3a1797?w=800",
        alt: "Mandala Garden Bohemian Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=800",
        alt: "Urban Geometry Modern Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=800",
        alt: "Color Block Modern Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200",
        alt: "Ocean Horizon Photography",
        width: 1200,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1200",
        alt: "City Lights Photography",
        width: 1200,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=800",
        alt: "Wild Spirit Wildlife Photography",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
        alt: "Concrete Poetry Texture Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1515825838458-f2a94b20105a?w=800",
        alt: "Paper Layers Texture Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=800",
        alt: "Be Present Quote Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1499678329028-101435549a4e?w=800",
        alt: "Create Every Day Quote Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=800",
        alt: "Sunset Boulevard Retro Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=800",
        alt: "Vinyl Vibes Retro Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200",
        alt: "Alpine Majesty Panoramic",
        width: 1200,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800",
        alt: "Urban Soul Portrait",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=800",
        alt: "Emerald Dreams Abstract",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=800",
        alt: "Blush Hour Abstract",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800",
        alt: "Neural Dreams AI Generated Art",
        width: 800,
        height: 600,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=800",
        alt: "Digital Cosmos AI Generated Art",
        width: 800,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
        url: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=800",
        alt: "Synthetic Nature AI Generated Art",
        width: 600,
        height: 800,
        isPrimary: true,
        sortOrder: 0,
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
  console.log("  chobii.art Database Seed Script");
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
