/**
 * Frame options — the storefront's format axis.
 *
 * Lives in its own module because BOTH seeds need it and the copy in
 * seed-admin.ts carried a comment promising it was "same data as seed.ts to
 * keep them in sync", which is a promise a person has to keep by hand.
 */

import type { NewFrame } from "./schema";

/**
 * Sample frame options — mesonart's format axis (#420).
 *
 * Their Quickview sells one choice under the heading
 * "Rolled Canvas/Frameless/Framed", and it is a FORMAT ladder rather than a
 * moulding catalogue: the print in a tube, the print stretched on bars, or the
 * print stretched and framed. Every framed option costs the same as every
 * other, which is why the five below share a price.
 *
 * PRICED AS A MULTIPLIER, NOT A FLAT FEE. A moulding for a 12x16 and one for a
 * 60x80 are not the same amount of timber, and theirs scale hard. Measured
 * across three sizes of one piece:
 *
 *   24x24   $260 rolled   $460 frameless (+77%)   $480 framed (+85%)
 *   40x40   $585          $990           (+69%)   $1,030      (+76%)
 *   72x72   $1,625        $3,020         (+86%)   $3,100      (+91%)
 *
 * So: no premium between mouldings, one large proportional step up to
 * stretched, a small one to framed — and the addition tracks the piece.
 * `priceModifier` reproduces that shape. The MAGNITUDE stays ours: +33% and
 * +40% land a small print's frame within a few rupees of the flat ₹499/₹599
 * these rows used to charge, where importing their ~1.8x would have nearly
 * doubled every framed order.
 *
 * `No Frame` is gone: Rolled Canvas is the unframed option now, and two rows
 * meaning "no moulding" would have been a choice with no content.
 *
 * The swatch imagery is mesonart's own product photography, taken at the
 * owner's direction (#420) and served from our own /frames rather than
 * hotlinked off their CDN. Replacing these with our photography is a drop-in:
 * the panel renders whatever `thumbnailUrl` points at.
 */
export const sampleFrames: NewFrame[] = [
  {
    name: "Rolled Canvas",
    type: "rolled",
    description:
      "Shipped rolled in a tube, ready for your own framer. The lightest way to buy a large piece.",
    material: "Canvas",
    color: "N/A",
    priceModifier: "1.00",
    priceAddition: "0.00",
    imageUrl: "/frames/rolled.png",
    thumbnailUrl: "/frames/rolled.png",
    isActive: true,
    sortOrder: 0,
  },
  {
    name: "Frameless",
    type: "frameless",
    description:
      "Stretched over a wooden bar and ready to hang, with the image wrapping the edge. No moulding.",
    material: "Stretched Canvas",
    thickness: "1.50",
    color: "N/A",
    priceModifier: "1.33",
    priceAddition: "0.00",
    imageUrl: "/frames/frameless.jpg",
    thumbnailUrl: "/frames/frameless.jpg",
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Stretch + Gold Frame",
    type: "gold",
    description:
      "Stretched and set in a slim gold moulding with a subtle antiquing. For traditional and glamorous rooms.",
    material: "Composite with Gold Leaf",
    thickness: "1.25",
    color: "Antique Gold",
    priceModifier: "1.40",
    priceAddition: "0.00",
    imageUrl: "/frames/gold.png",
    thumbnailUrl: "/frames/gold.png",
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Stretch + Silver Frame",
    type: "silver",
    description:
      "Stretched and set in a brushed silver moulding. Ideal for modern and industrial spaces.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Brushed Silver",
    priceModifier: "1.40",
    priceAddition: "0.00",
    imageUrl: "/frames/silver.png",
    thumbnailUrl: "/frames/silver.png",
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "Stretch + Black Frame",
    type: "black",
    description:
      "Stretched and set in a sleek matte black moulding. A timeless choice that works with any decor.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Matte Black",
    priceModifier: "1.40",
    priceAddition: "0.00",
    imageUrl: "/frames/black.jpg",
    thumbnailUrl: "/frames/black.jpg",
    isActive: true,
    sortOrder: 4,
  },
  {
    name: "Stretch + White Frame",
    type: "white",
    description:
      "Stretched and set in a crisp white moulding. Perfect for minimalist and Scandinavian styles.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Matte White",
    priceModifier: "1.40",
    priceAddition: "0.00",
    imageUrl: "/frames/white.jpg",
    thumbnailUrl: "/frames/white.jpg",
    isActive: true,
    sortOrder: 5,
  },
  {
    name: "Stretch + Wood Frame",
    type: "wood",
    description:
      "Stretched and set in a wooden moulding with a distressed finish. For farmhouse and bohemian rooms.",
    material: "Reclaimed Pine",
    thickness: "1.50",
    color: "Weathered Brown",
    priceModifier: "1.40",
    priceAddition: "0.00",
    imageUrl: "/frames/wood.jpg",
    thumbnailUrl: "/frames/wood.jpg",
    isActive: true,
    sortOrder: 6,
  },
];
