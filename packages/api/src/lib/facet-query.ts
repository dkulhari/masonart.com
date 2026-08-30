/**
 * The query-parameter shape of an array facet, and the one place it is defined.
 *
 * WHY THIS FILE EXISTS
 *
 * `facetList` was written twice, verbatim, in `routes/products.ts` and
 * `routes/collections.ts` — the second copy even says "same shape as
 * `facetList` in routes/products.ts". Two copies of a validator is the same
 * arrangement that `@chobii/shared/constants/facets` exists to end: nothing
 * reconciles them, so a fix lands on one grid and not the other. Both routes
 * import this now.
 *
 * WHAT IT ACCEPTS
 *
 * Both wire shapes a multi-value facet can arrive in:
 *
 *   ?styles=minimalist-art,pop-art     comma-joined — what the storefront
 *                                      sends (`values.join(',')` in
 *                                      packages/web/app/routes/posters/index.tsx)
 *   ?styles=minimalist-art&styles=pop-art
 *                                      repeated — what `URLSearchParams`
 *                                      produces by default, and what a
 *                                      hand-written or third-party link uses
 *
 * The repeated form used to be a 400. Hono's query validator collapses a
 * repeated parameter to an array before zod sees it, and this schema started
 * at `z.string()`, so the array failed with "Expected string, received array"
 * — an error naming neither the facet nor the fix. Mixed forms
 * (`?styles=a,b&styles=c`) resolve too; there is no shape of the same
 * vocabulary that is spelled wrong.
 *
 * WHAT IT REJECTS
 *
 * Every value is checked against its vocabulary and an unknown one is a 400,
 * in either shape. That is deliberate and predates this module: ignoring the
 * value would hand the shopper an unfiltered grid they believe was filtered,
 * which is the failure #452 was. A partly-valid list fails as a whole rather
 * than quietly filtering on the half we recognised.
 */

import { z } from "zod";

/**
 * A facet query parameter whose values must all belong to `member`.
 *
 * @param member the vocabulary schema from `@chobii/shared` — `styleSchema`,
 *   `colorSchema`, and so on.
 */
export const facetList = (member: z.ZodTypeAny) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : (Array.isArray(value) ? value : [value])
            .flatMap((part) => part.split(","))
            .map((part) => part.trim())
            .filter(Boolean)
    )
    .refine(
      (values) =>
        values === undefined || values.every((v) => member.safeParse(v).success),
      { message: "Unknown filter value" }
    );
