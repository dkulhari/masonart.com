/**
 * Vendor Rate Card Resolution
 *
 * Pure functions over rate rows, so the rules are testable without a database
 * and the same rules can run on a candidate row before it is written.
 *
 * Two rules, both easy to get subtly wrong:
 *
 * 1. **Bands are inclusive-min, exclusive-max, on the LONGEST EDGE.** A 24x36
 *    piece is a 36 regardless of which way it is hung, and a 24 belongs to the
 *    band that starts at 24, not the one that ends there.
 *
 * 2. **Overlap is a question about size AND time.** The same size band existing
 *    twice is not a conflict — it is how a price change is recorded. It is only
 *    a conflict when the effective windows also intersect, because only then is
 *    there an instant with two answers. Following the shipping_config
 *    precedent, everything resolves against the caller's clock.
 */

export interface RateRow {
  id: string
  vendorId: string
  kind: 'print' | 'frame'
  finish: string | null
  longestEdgeMinInches: number
  longestEdgeMaxInches: number
  /** decimal(10,2) comes back from drizzle as a STRING. Keep it one. */
  amount: string
  effectiveFrom: Date
  effectiveTo: Date | null
}

export function longestEdgeInches(dims: { widthInches: number; heightInches: number }): number {
  return Math.max(dims.widthInches, dims.heightInches)
}

function windowContains(row: Pick<RateRow, 'effectiveFrom' | 'effectiveTo'>, at: Date): boolean {
  if (row.effectiveFrom.getTime() > at.getTime()) return false
  if (row.effectiveTo && row.effectiveTo.getTime() <= at.getTime()) return false
  return true
}

function windowsIntersect(a: RateRow, b: RateRow): boolean {
  const aEnd = a.effectiveTo?.getTime() ?? Infinity
  const bEnd = b.effectiveTo?.getTime() ?? Infinity
  return a.effectiveFrom.getTime() < bEnd && b.effectiveFrom.getTime() < aEnd
}

function bandsIntersect(a: RateRow, b: RateRow): boolean {
  // Exclusive max on both sides: 0-24 and 24-48 are adjacent, not overlapping.
  return (
    a.longestEdgeMinInches < b.longestEdgeMaxInches &&
    b.longestEdgeMinInches < a.longestEdgeMaxInches
  )
}

/**
 * The rate in force for one item at one instant, or null if the vendor has no
 * band covering it. Null is a real answer — it means "this vendor has not
 * priced this size" — and the assignment route must surface it rather than
 * defaulting to zero.
 */
export function selectRateInForce(
  rows: RateRow[],
  query: { longestEdge: number; kind: 'print' | 'frame'; finish: string | null; at: Date }
): RateRow | null {
  const candidates = rows.filter(
    (r) =>
      r.kind === query.kind &&
      (query.finish == null || r.finish == null || r.finish === query.finish) &&
      query.longestEdge >= r.longestEdgeMinInches &&
      query.longestEdge < r.longestEdgeMaxInches &&
      windowContains(r, query.at)
  )

  if (candidates.length === 0) return null

  // An exact finish match beats a finish-agnostic band; then the most recently
  // effective row wins. Overlap validation should make this a single row, but
  // resolution must stay deterministic even if a bad row got in before the
  // check existed.
  candidates.sort((a, b) => {
    const aExact = a.finish === query.finish ? 1 : 0
    const bExact = b.finish === query.finish ? 1 : 0
    if (aExact !== bExact) return bExact - aExact
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
  })

  return candidates[0] ?? null
}

/**
 * The row `candidate` collides with, or null. Call before every rate write.
 * Comparing by id means editing a row does not report itself.
 */
export function findOverlappingBand(existing: RateRow[], candidate: RateRow): RateRow | null {
  return (
    existing.find(
      (r) =>
        r.id !== candidate.id &&
        r.vendorId === candidate.vendorId &&
        r.kind === candidate.kind &&
        (r.finish ?? null) === (candidate.finish ?? null) &&
        bandsIntersect(r, candidate) &&
        windowsIntersect(r, candidate)
    ) ?? null
  )
}
