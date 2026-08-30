/**
 * Typed JSON body reader for route tests.
 *
 * `await res.json()` returns `unknown`, so every property access on the result
 * is a type error. That single idiom produced 557 of the 882 errors the first
 * time `tests/` was typechecked (#662) — not 557 problems, one problem 557
 * times.
 *
 * Named `readJson`, not `json`, on purpose: 136 call sites already declare
 * `const json = await res.json()`, and `const json = await json(res)` is a
 * temporal-dead-zone reference to the very binding being declared. It would
 * typecheck and then throw at runtime.
 *
 * `T` defaults to `any` deliberately. There is no cheap source of truth for
 * response shapes here — the routes are not typed end-to-end — so a stricter
 * default would only trade `unknown` errors for `Record<string, unknown>`
 * errors and buy nothing. Pass `T` where the shape is worth pinning:
 *
 *   const body = await readJson<{ items: Product[]; total: number }>(res)
 *
 * The parameter is structural rather than `Response` so it also accepts the
 * Response-likes returned by Hono's `app.request()` and the test harnesses.
 */
export async function readJson<T = any>(res: { json(): Promise<unknown> }): Promise<T> {
  return (await res.json()) as T
}
