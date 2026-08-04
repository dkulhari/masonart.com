/**
 * Facet metadata for seeded products.
 *
 * The vocabularies expanded in #395–#397, but the seeded catalogue still
 * carried the old ad-hoc values (`minimalist` where the vocabulary says
 * `minimalist-art`) and the five new columns were null. Filtering by the new
 * facets matched nothing, and the sidebar would have rendered twelve Aesthetic
 * options all reading zero.
 *
 * DETERMINISTIC, NOT RANDOM. A reseed has to reproduce the same catalogue:
 * facet counts are asserted in tests and eyeballed in the UI, and a random
 * assignment makes both meaningless between runs. Everything below is derived
 * from a hash of the product's sku.
 *
 * Values are taken from the vocabularies in @chobii/shared rather than
 * retyped here. Retyping them is precisely the drift this feature exists to
 * end — see the header of constants/facets.ts.
 */

import {
  STYLE_OPTIONS,
  SUBJECT_OPTIONS,
  COLOR_OPTIONS,
  ROOM_OPTIONS,
  VIBE_OPTIONS,
  AESTHETIC_OPTIONS,
  MEDIUM_OPTIONS,
  UNIQUENESS_OPTIONS,
  AVAILABILITY_OPTIONS,
  type FacetOption,
} from "@chobii/shared";

export interface ProductFacets {
  styles: string[];
  subjects: string[];
  colors: string[];
  rooms: string[];
  vibe: string[];
  aesthetic: string[];
  medium: string[];
  uniqueness: string;
  availability: string;
}

/**
 * FNV-1a. Any stable string hash would do; this one is short, dependency-free
 * and spreads adjacent skus (`ABS-001`, `ABS-002`) into unrelated buckets,
 * which a naive character sum does not.
 */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/**
 * Pick `count` distinct options, starting at a hash-derived offset and
 * striding by a co-prime step.
 *
 * The stride matters: picking `offset`, `offset+1`, `offset+2` would give
 * every product a run of adjacent vocabulary entries, so the first few options
 * in each list would dominate and the tail would go unused. Striding by a
 * value co-prime with the list length visits the whole list before repeating,
 * which is what makes the coverage assertion pass.
 */
function pick(
  options: readonly FacetOption[],
  seed: number,
  count: number
): string[] {
  const total = options.length;
  const wanted = Math.min(count, total);
  const offset = seed % total;

  // Find a stride co-prime with `total` so the walk covers every index.
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let stride = (seed % (total - 1)) + 1;
  while (gcd(stride, total) !== 1) stride = (stride % (total - 1)) + 1;

  const picked: string[] = [];
  for (let i = 0; i < wanted; i++) {
    picked.push(options[(offset + i * stride) % total]!.id);
  }
  return picked;
}

/**
 * The facet metadata for one product, derived entirely from its sku.
 *
 * Counts per facet are deliberately small and uneven — a catalogue where
 * every piece carries three styles and three subjects reads as generated,
 * and makes every facet count identical.
 */
export function facetsForProduct(sku: string): ProductFacets {
  /**
   * Rehash per facet rather than bit-shifting one seed.
   *
   * Shifting worked for the long vocabularies and failed for the short ones:
   * with four Medium values, `seed >>> 18 % 4` left one option unreachable
   * across all 41 skus. Salting the hash with the facet name gives each facet
   * an independent, well-spread sequence — and stops two facets from moving
   * together across the catalogue.
   */
  const seedFor = (facet: string) => hash(`${sku}:${facet}`);

  return {
    styles: pick(STYLE_OPTIONS, seedFor("styles"), 2),
    subjects: pick(SUBJECT_OPTIONS, seedFor("subjects"), 2),
    colors: pick(COLOR_OPTIONS, seedFor("colors"), 3),
    rooms: pick(ROOM_OPTIONS, seedFor("rooms"), 2),
    vibe: pick(VIBE_OPTIONS, seedFor("vibe"), 1),
    aesthetic: pick(AESTHETIC_OPTIONS, seedFor("aesthetic"), 2),
    medium: pick(MEDIUM_OPTIONS, seedFor("medium"), 1),
    uniqueness: pick(UNIQUENESS_OPTIONS, seedFor("uniqueness"), 1)[0]!,
    availability: pick(AVAILABILITY_OPTIONS, seedFor("availability"), 1)[0]!,
  };
}
