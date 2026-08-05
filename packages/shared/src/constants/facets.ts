/**
 * Facet vocabularies — the single source of truth.
 *
 * WHY THIS FILE EXISTS
 *
 * Before it, facet options were hardcoded literals inside the web component
 * (`ProductFilters.tsx`) while the API validated the same facets as
 * unconstrained comma-separated strings. Nothing reconciled the two, so a
 * value could exist in one and not the other and no test would notice. That is
 * the same shape of bug the size ladders had: two systems, no authority.
 *
 * Everything now reads this module — the drizzle schema's expectations, the
 * API's zod validation, the seed's assignment, and the sidebar's rendering.
 *
 * The vocabularies are mesonart's, measured in
 * docs/design/mesonart/mesonart-parity-analysis.md §1.3 and adopted verbatim
 * by owner decision on 2026-08-04, quirks included. The quirks are called out
 * where they occur so they are not later mistaken for our own mistakes.
 */

import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface FacetOption {
  /** Stored in the database. Kebab-case. */
  id: string;
  /** Shown to the customer. */
  label: string;
  /** Swatch, colours only. */
  hex?: string;
}

const option = (id: string, label: string, hex?: string): FacetOption =>
  hex ? { id, label, hex } : { id, label };

// ============================================================================
// Vocabularies
// ============================================================================

/** Style — 12 values (§1.3). */
export const STYLE_OPTIONS: readonly FacetOption[] = [
  option('wabi-sabi-art', 'Wabi-Sabi Art'),
  option('plaster-and-texture-art', 'Plaster & Texture Art'),
  // Also a Subject value. Their taxonomy overlaps here; kept in both so
  // filtering behaves the way a shopper coming from their site expects.
  option('colorful-art', 'Colorful Art'),
  option('minimalist-art', 'Minimalist Art'),
  option('pop-art', 'Pop Art'),
  option('surrealist-art', 'Surrealist Art'),
  option('pollock-art', 'Pollock Art'),
  option('bohemian-art', 'Bohemian Art'),
  option('expressionist-art', 'Expressionist Art'),
  option('hyperrealism-art', 'Hyperrealism Art'),
  option('graffiti-art', 'Graffiti Art'),
  option('ukiyo-e-art', 'Ukiyo-e Art'),
];

/** Subject — 17 values (§1.3). */
export const SUBJECT_OPTIONS: readonly FacetOption[] = [
  option('abstract', 'Abstract'),
  option('minimalism', 'Minimalism'),
  option('landscape', 'Landscape'),
  option('people', 'People'),
  // `sea` and `sea-and-beach` overlap. Both are on their storefront.
  option('sea', 'Sea'),
  option('animal', 'Animal'),
  option('flowers', 'Flowers'),
  option('cartoon', 'Cartoon'),
  option('city', 'City'),
  option('love', 'Love'),
  option('snow', 'Snow'),
  option('wine', 'Wine'),
  option('colorful-art', 'Colorful Art'),
  option('horse', 'Horse'),
  option('portraits', 'Portraits'),
  option('sea-and-beach', 'Sea & Beach'),
  option('still-life', 'Still Life'),
  /**
   * OURS, not measured on mesonart (#452).
   *
   * The home page has offered a Typography category since long before this
   * vocabulary existed, and it linked at `?styles=typography` — a value
   * nothing knew, so the tile landed on an unfiltered grid. A category the
   * storefront advertises has to be a category art can be filed under; the
   * tile stays hidden until something is.
   */
  option('typography', 'Typography'),
];

/**
 * Orientation — 6 values (§1.3).
 *
 * The IDS are ours and match the `orientation` postgres enum; only the LABELS
 * are mesonart's. Renaming `portrait` to `vertical` in the database would
 * churn the size ladders, the seed and the grid E2E in exchange for a caption.
 *
 * `set-of-2-3` is on their storefront as an orientation even though it
 * describes how many panels ship rather than the proportion of one piece
 * (§5.2). Adopted so filtering matches theirs; it has no size ladder, which
 * `getSizesForOrientation` and the seed already handle.
 */
export const ORIENTATION_OPTIONS: readonly FacetOption[] = [
  option('square', 'Square'),
  option('portrait', 'Vertical'),
  option('landscape', 'Horizontal'),
  option('panoramic', 'Panoramic'),
  option('round', 'Circle'),
  option('set-of-2-3', 'Set of 2-3'),
];

/**
 * Color — 13 values.
 *
 * They list 14, but "Gray" and "Grey" are the same colour spelled twice.
 * Carrying both would split the count for one paint and let a shopper tick
 * two options whose intersection is always empty.
 */
export const COLOR_OPTIONS: readonly FacetOption[] = [
  option('black', 'Black', '#000000'),
  option('white', 'White', '#FFFFFF'),
  option('gray', 'Gray', '#808080'),
  option('beige', 'Beige', '#F5F5DC'),
  option('brown', 'Brown', '#8B4513'),
  option('yellow', 'Yellow', '#FFD34E'),
  option('blue', 'Blue', '#4169E1'),
  option('gold', 'Gold', '#FFD700'),
  option('green', 'Green', '#228B22'),
  option('orange', 'Orange', '#FF7A29'),
  option('pink', 'Pink', '#FF69B4'),
  option('purple', 'Purple', '#8A5CD1'),
  option('red', 'Red', '#DC143C'),
];

/** Vibe — 4 values (§1.3). */
export const VIBE_OPTIONS: readonly FacetOption[] = [
  option('sophisticated-and-intellectual', 'Sophisticated & Intellectual'),
  option('tranquility-and-zen', 'Tranquility & Zen'),
  option('vitality-and-passion', 'Vitality & Passion'),
  option('warmth-and-cozy', 'Warmth & Cozy'),
];

/** Room — 12 values (§1.3). Ours previously carried 7. */
export const ROOM_OPTIONS: readonly FacetOption[] = [
  option('living-room', 'Living Room'),
  option('entryway', 'Entryway'),
  option('hallway-and-stairs', 'Hallway & Stairs'),
  option('bedroom', 'Bedroom'),
  option('dining-room', 'Dining Room'),
  option('reading-nook', 'Reading Nook'),
  option('kitchen', 'Kitchen'),
  option('nursery-and-kids-room', 'Nursery & Kids Room'),
  option('office-and-study', 'Office & Study'),
  option('commercial-and-lobby', 'Commercial & Lobby'),
  option('bathroom', 'Bathroom'),
  option('executive-office', 'Executive Office'),
];

/** Aesthetic — 12 values (§1.3). New to us. */
export const AESTHETIC_OPTIONS: readonly FacetOption[] = [
  option('japandi-essence', 'Japandi Essence'),
  option('organic-modern', 'Organic Modern'),
  option('california-coastal', 'California Coastal'),
  option('mid-century-modern', 'Mid-century Modern'),
  option('modern-farmhouse', 'Modern Farmhouse'),
  option('mediterranean-revival', 'Mediterranean Revival'),
  option('parisian-chic', 'Parisian Chic'),
  option('dopamine-decor', 'Dopamine Decor'),
  option('quiet-luxury', 'Quiet Luxury'),
  option('dark-academia', 'Dark Academia'),
  option('industrial-loft', 'Industrial Loft'),
  option('eclectic-gallery', 'Eclectic Gallery'),
];

/**
 * Medium — 4 values (§1.3).
 *
 * Theirs describe hand-painted canvas because that is what they sell. Ours are
 * printing media; the facet is structurally the same, the values are honest
 * about what we actually ship.
 */
export const MEDIUM_OPTIONS: readonly FacetOption[] = [
  option('archival-pigment-print', 'Archival Pigment Print'),
  option('giclee-canvas', 'Giclée Canvas'),
  option('fine-art-paper', 'Fine Art Paper'),
  option('textured-matte', 'Textured Matte'),
];

/** Uniqueness — their storefront exposes one edition type. */
export const UNIQUENESS_OPTIONS: readonly FacetOption[] = [
  option('open-edition', 'Open Edition'),
  option('limited-edition', 'Limited Edition'),
];

/** Availability — their storefront exposes one value. */
export const AVAILABILITY_OPTIONS: readonly FacetOption[] = [
  option('made-to-order', 'Made to Order'),
  option('in-stock', 'In Stock'),
];

// ============================================================================
// Group Descriptors
// ============================================================================

export interface FacetGroup {
  /** Matches the filter/search-param key and the database column. */
  key: string;
  label: string;
  options: readonly FacetOption[];
  /**
   * Whether a product can carry several values. Multi facets are `text[]`
   * columns; single facets are scalar. A product has one edition type and one
   * availability — modelling those as arrays invites contradictory rows.
   */
  multi: boolean;
}

export const FACET_GROUPS: readonly FacetGroup[] = [
  { key: 'orientation', label: 'Orientation', options: ORIENTATION_OPTIONS, multi: false },
  { key: 'styles', label: 'Style', options: STYLE_OPTIONS, multi: true },
  { key: 'subjects', label: 'Subject', options: SUBJECT_OPTIONS, multi: true },
  { key: 'colors', label: 'Color', options: COLOR_OPTIONS, multi: true },
  { key: 'vibe', label: 'Vibe', options: VIBE_OPTIONS, multi: true },
  { key: 'rooms', label: 'Room', options: ROOM_OPTIONS, multi: true },
  { key: 'aesthetic', label: 'Aesthetic', options: AESTHETIC_OPTIONS, multi: true },
  { key: 'medium', label: 'Medium', options: MEDIUM_OPTIONS, multi: true },
  { key: 'uniqueness', label: 'Uniqueness', options: UNIQUENESS_OPTIONS, multi: false },
  { key: 'availability', label: 'Availability', options: AVAILABILITY_OPTIONS, multi: false },
];

// ============================================================================
// Validation
// ============================================================================

const idsOf = (options: readonly FacetOption[]) =>
  options.map((o) => o.id) as [string, ...string[]];

/**
 * Zod enums built from the vocabularies above.
 *
 * The API validates every facet parameter through these. That is not
 * decoration: the array filters interpolate values into a postgres literal, so
 * a closed vocabulary is what makes that structurally safe — and it turns a
 * typo into a 400 rather than an unfiltered grid the shopper believes was
 * filtered.
 */
export const styleSchema = z.enum(idsOf(STYLE_OPTIONS));
export const subjectSchema = z.enum(idsOf(SUBJECT_OPTIONS));
export const orientationSchema = z.enum(idsOf(ORIENTATION_OPTIONS));
export const colorSchema = z.enum(idsOf(COLOR_OPTIONS));
export const vibeSchema = z.enum(idsOf(VIBE_OPTIONS));
export const roomSchema = z.enum(idsOf(ROOM_OPTIONS));
export const aestheticSchema = z.enum(idsOf(AESTHETIC_OPTIONS));
export const mediumSchema = z.enum(idsOf(MEDIUM_OPTIONS));
export const uniquenessSchema = z.enum(idsOf(UNIQUENESS_OPTIONS));
export const availabilitySchema = z.enum(idsOf(AVAILABILITY_OPTIONS));

export type StyleId = z.infer<typeof styleSchema>;
export type SubjectId = z.infer<typeof subjectSchema>;
export type OrientationId = z.infer<typeof orientationSchema>;
export type ColorId = z.infer<typeof colorSchema>;
export type VibeId = z.infer<typeof vibeSchema>;
export type RoomId = z.infer<typeof roomSchema>;
export type AestheticId = z.infer<typeof aestheticSchema>;
export type MediumId = z.infer<typeof mediumSchema>;
export type UniquenessId = z.infer<typeof uniquenessSchema>;
export type AvailabilityId = z.infer<typeof availabilitySchema>;
