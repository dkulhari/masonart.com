# Catalogue Import Pipeline

**Status as of 2026-09-01.** A bulk importer now turns a CSV plus a folder of
artwork into real, purchasable products. 29 are loaded and live alongside the
41 seeded ones. Room views are the one thing still missing, and that blocker is
photographs, not code.

| | |
|---|---|
| Commits | 4 |
| Tickets closed | #672, #719 |
| Products imported | 29 (70 live in total) |
| Variants created | 477 |
| Tests added | 28, all passing |

---

## The pipeline, stage by stage

Each stage hands its output to the next. Three are built and working; the
fourth is where it stops.

```
#718  blank-wall room photos + measurements  ->  room-templates.json   [] EMPTY
                                                          |
#701  mockups:rooms                          ->  room-<id>.jpg          BLOCKED
      framed-main.jpg, contact-sheet.jpg                   |
                                                           v
      manifest:from-folder                   ->  manifest.csv           WORKS
                                                           |
#672  db:import-catalogue                    ->  products + images      WORKS
#719                                             + size ladders
```

### Why there are no room views

`packages/api/src/database/room-templates.json` is `[]`, and
`.cache/room-templates/` does not exist. The generator refuses to run rather
than produce nothing quietly — that refusal is deliberate, and it predates this
session.

So `roomImages` was empty in the manifest, and every imported product has one
image where the seeded ones have four (1 main + 3 room mockups).

---

## What shipped

### `d17c1c5b` — bulk catalogue import (#672)

`bun run db:import-catalogue --manifest <csv> --media-dir <dir>` creates
products with their full image set. Flags: `--dry-run`, `--limit <n>`,
`--force-media`.

Every image goes through `buildProductMedia` rather than being inserted
directly. That is the point of the tool: it mats the artwork at 88%, measures
the art box, builds the four-size WebP ladder, and retains the untouched source
under `products/originals/`. Products inserted around it render wrong in the
storefront grid.

Four properties the go-live load needs:

- **`--dry-run` writes nothing.** Not a flag checked before each write — the
  database and storage modules are imported *inside* the write path, so a
  dry-run never loads anything capable of writing.
- **Per-row isolation.** A bad row is collected with its line number and sku;
  the rest of the manifest still imports and the process exits non-zero with
  the whole report in file order.
- **Idempotent on `sku`.** Re-running updates rather than duplicates, and
  leaves existing images alone unless `--force-media`.
- **The orientation guard from #545 applies.** A row whose artwork contradicts
  its declared orientation fails and is reported, never quietly written.

A real run refuses to start when the R2 env vars are unset, because
`storage.ts` otherwise falls back to the dev bucket — so the failure mode it
prevents is uploading the production catalogue into local MinIO and reporting
success.

### `cf331ff6` — size ladders (#719)

Imported products had **zero variants**, so nothing was purchasable: no size to
pick, no price to charge. Each row now gets the full ladder for its orientation
from `buildVariantsForOrientation`, the shared source of truth. Product and
ladder are written in one transaction.

### `247f6da0` — manifest generator

`bun run manifest:from-folder --dir <path> --category <name> --sku-prefix <XX>`
walks a folder and emits the CSV.

The measurement is the point. It is **not** `width > height`. The importer
stores every image as a 1500×1500 square with the artwork matted inside, then
measures where the art landed, because a photographed piece carries a wall or
border that has to be trimmed first. So the generator runs the same two steps
in the same order — `matToSquare` then `measureArtBox` — and names the result
with the same shared function the guard uses. The two agree by construction
rather than by luck.

Facet flags are validated against the vocabularies in `@chobii/shared` at
startup, so a typo in `--styles` costs a second instead of an hour-long run.

### `833a74bd` — alt-text fix

`altText` is a manifest column but is stored inside `products.images` rather
than on the product row. The "keep existing images" path — the one every
re-import without `--force-media` takes — replaced the images array with the
stored one verbatim, so old alt text survived while title, description and
facets all updated around it.

Found on the real catalogue: 29 products renamed to real titles still described
themselves to screen readers as "Incredible India No. 29". Nothing visible was
wrong, which is exactly why it would have shipped.

---

## Two decisions worth remembering

### Variants upsert; they never delete-and-reinsert

Delete-then-insert is simpler and is **unsafe here**, because two tables point
at these rows:

```
cart_items.variant_id    ON DELETE CASCADE   (schema/cart.ts:153)
order_items.variant_id   ON DELETE SET NULL  (schema/orders.ts:351)
```

Replacing the ladder would silently empty every customer cart holding that size
and sever order history from the row it was bought as — no error either time.
And a re-import is most likely exactly when the shop is live and someone is
fixing a typo.

Matching on `variantSku` keeps the row, and with it the id everything else
references. A size that leaves the ladder is **deactivated**, not deleted.
`stockQuantity` is never reset — the ladder's numbers are a seeding curve, the
admin's are a measurement.

Proven: the md5 of all variant ids was identical before and after a second
import (`c260a49db0fcd56b6c0dd8292507bbeb`), and a hand-set stock value of 777
survived.

### Unladdered orientations fail the row

`round` and `set-of-2-3` have no size ladder. `seed.ts:1694` falls back to
portrait; copying that would price and size a round poster for a rectangle it
is not, in the one setting — an unattended bulk load — where nobody would
notice. The check runs *before* a row counts as validated, so `--dry-run`
refuses a catalogue that would import as unbuyable.

---

## Tickets

| # | Title | State |
|---|---|---|
| 672 | Bulk catalogue import script: CSV manifest + image folder through buildProductMedia | **done** |
| 719 | Give imported products their size ladder — filed and closed this session | **done** |
| 701 | Room mockup generator — already complete before this session | **done** |
| 718 | Produce the blank-wall room templates the generator needs to run at all | **BLOCKER** |

---

## What is in the shop now

| Set | Products | Images each | Status |
|---|---|---|---|
| Original seed catalogue | 41 | 4 | active, untouched |
| Imported (ARTISAN, `II-*`) | 29 | 1 | active |

Verified in the browser at `localhost:3001/posters`: 70 products, all 34 image
requests returned 200, filters count correctly, and titles match their
pictures.

Every product was given a real title and per-image facets from a pass over the
actual artwork — *Lemon Crates*, *Turquoise Anchorage*, *Crack and Bloom* —
replacing the generated *Incredible India No. 1…29*. That mattered beyond
cosmetics: the generated pass had tagged a still life of fruit as
`landscape|city`, so it would have surfaced under cityscapes and never under
still life.

---

## Blockers

### 1. No room views — needs photographs (#718)

The generator needs **6–8 blank-wall room photographs**, each with:

| Requirement | Why |
|---|---|
| Straight-on wall | Sharp has no four-point homography; angled walls were ruled out of scope |
| Blank wall area | The tool composites on top; it cannot erase what is already hanging |
| One clear light direction | You declare `left` or `right` and shadows follow; ambiguous lighting reads as fake |
| Room for the widest aspect | One rectangle serves every poster |

Then roughly a minute per room measuring the wall rectangle into normalised
`x/y/w/h` in `room-templates.json`. None of this is code, and none of the 29
imported images is a room interior.

Full instructions are in `docs/runbooks/room-mockup-generator.html`.

### 2. Resolution cannot print

The best ARTISAN file is 2304×3456; most are 600–1080px wide. The smallest size
the shop sells is 12×16 inches, needing **3600×4800px** at 300 dpi. Nothing
clears it.

Worth knowing: the original seed images are 1500×1500 and equally unprintable.
They were always display reference, never print masters. **This catalogue
demonstrates the shop; it cannot fulfil an order.**

### 3. Provenance is unestablished

Four files carried visible copyright marks and are quarantined in
`drive-download-*/_watermarked/` — moved, not deleted:

| File | Mark |
|---|---|
| `v (1867).jpg` | `©sunilkapadiaphotography` |
| `v (1872).jpg` | `© AFP/Getty Images` |
| `v (1879).jpg` | `© Monte Trumbull` |
| `v (1880).jpg` | `LIGHT SHADE` |

The remaining 29 show no marks across top, middle and bottom bands with
contrast boosted. **Unmarked is not the same as licensed**, and the source
folder carries no provenance for any of them. These are also stock photographs
rather than poster art.

### 4. Google Drive is unreadable

The original folder streams filenames but no bytes; even a text file that read
fine earlier now fails. The 29 images came from a manual `drive-download-*`
export. Reaching the other twelve ARTISAN categories needs the folder made
available offline in Finder.

---

## Options for room views

### Option A — synthetic templates (recommended first step)

Six clean minimal rooms generated with Sharp: neutral wall, soft light
gradient, floor line, simple furniture silhouette. Measured programmatically,
so placement is exact rather than eyeballed. Room views on all 29 products
today.

They will read as rendered rather than photographed. The design spec is blunt
that template quality is the real cost and the renderer cannot rescue a weak
template.

### Option B — real photographs

You provide or generate 6–8 blank-wall shots — **not** from
`.cache/seed-media`, which has MESON ART baked into the pixels (#546). Each
wall rectangle gets measured into `room-templates.json`. Materially better
result; needs you before anything can run.

**Worth doing both, in that order.** Synthetic templates prove the whole chain
end to end and make it visible today. Swapping in real photographs later means
editing that one JSON file and re-running the generator — nothing about the
products changes.

---

## Re-running any of it

```bash
cd packages/api

# 1. Build a manifest from a folder of artwork
bun run manifest:from-folder --dir <path> --category "Name" --sku-prefix XX \
  --price 1499.00 --styles minimalist-art --subjects abstract \
  --colors beige --rooms living-room --out m.csv

# 2. Check it. Writes nothing — no database row, no upload.
bun run db:import-catalogue --manifest m.csv --media-dir <path> --dry-run

# 3. Import for real
bun run db:import-catalogue --manifest m.csv --media-dir <path>

# 4. Room mockups — only once #718 is done
bun run mockups:rooms --posters <path>
```

Two operational notes:

- **Keep the manifest somewhere permanent.** It is the source of truth for
  every re-import, including `status` — a re-run reset the products to draft
  until that was corrected in the CSV rather than in the database.
- **Raw SQL deletes do not purge the product cache.** `purgeProductResponseCache`
  only runs on app writes, so hand-editing products leaves the storefront
  serving stale counts. Purge with:
  ```bash
  docker exec poster-app-redis redis-cli --scan --pattern 'product*' \
    | while read k; do docker exec poster-app-redis redis-cli DEL "$k"; done
  ```

---

## Verification

- 28 new tests passing across four files
- `bun run typecheck` clean across all three packages
- Full API suite: **5,948 passing**, 1 failing — `tests/database/shipping.test.ts`,
  a pre-existing `shipment_status` enum drift from #703/#706, unrelated to this work
- Idempotency proven against the dev database: a second import left the variant
  count and every variant id unchanged, and preserved a hand-set stock value
- End-to-end proven twice — once on synthetic artwork, once on the real 29
