/**
 * ChooseOptions — buy from the grid without leaving it (#420).
 *
 * mesonart puts one `<button is="hover-button" aria-controls="Quickview-...">
 * Choose Options</button>` on every card. It opens a Quickview where the
 * purchase is completed in place, so the shopper keeps their scroll position
 * and their place in the grid.
 *
 * THE MEASURED PANEL (mesonart, 1440x1000, headless Chromium, computed boxes):
 *
 *   backdrop            rgba(23,23,23,0.7), no blur
 *   modal               x 48..1392, y 116..884 — 1344 x 768, TWO COLUMNS
 *     left              product image 671 x 768, carousel dots along the foot
 *     right             content column x 780..1332 (552 wide)
 *       title + price   price right-aligned on the title line, 24px/300
 *       rating          14px/300
 *       "Size <value>"  label at 300, the chosen value at 500
 *       SELECT          552 x 52, bg rgba(23,23,23,0.024), radius 6, no border
 *       "Frame: <value>" same label/value pair
 *       swatches        60px circles on a 100px pitch, 5 per row
 *       stock line      only when the count is genuinely low
 *       CTA row         h 60 — quantity stepper + black pill at radius 60,
 *                       the pill quoting the total: "Add to cart - $260.00"
 *       full details    footer link out to the product page
 *
 *   card trigger        172 x 40, radius 60, WHITE pill with a black label at
 *                       16px/400, centred over the foot of the image
 *
 * The size ladder is a native `<select>`, which is both theirs and the right
 * call for our 17 steps: as chips it wrapped to five rows and pushed the frame
 * row below the fold.
 *
 * WHY A SECOND CONTROL AND NOT THE EYE
 *
 * The eye in ProductCardMedia stays what it is: decoration on a media box that
 * already navigates to the product page, `aria-hidden` and
 * `pointer-events-none`. An unlabelled icon doing double duty as a dialog
 * trigger is a worse screen-reader story than a named button, and the two
 * destinations are genuinely different — the page, versus this panel.
 *
 * WHY IT FETCHES
 *
 * The grid carries `basePrice` and images, nothing else. The cart carries
 * `variantId` through to checkout, so the ladder has to be the product's real
 * variants — a size list synthesised on the client from
 * `getSizesForOrientation()` would look right and fail to resolve at order
 * time. One request per card, on first open only, cached for reopens.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Minus, Plus, X, ArrowRight } from 'lucide-react'
import { frameAddition, sortedImages, type FramePriceColumns } from '@chobii/shared'
import { cn, formatPrice } from '~/lib/utils'
import { productsApi } from '~/lib/api'
import { useCartActions } from '~/hooks/useCartActions'
import { buttonVariants } from '~/components/ui/Button'
import { ProductRating } from './ProductRating'
import { EASE_FAST } from './productCardTokens'
import type { ProductCardData } from './ProductCard'
import { frameGroupLabel, type FrameCategory } from './FrameSelector'

/** The slice of GET /api/products/:slug this panel reads. */
interface ProductOptionsResponse {
  variants?: Array<{
    id: string
    sizeLabel: string
    widthInches: number
    heightInches: number
    price: string | number
    stockQuantity: number
    isInStock: boolean
  }>
  frames?: Array<{
    id: string
    type: string
    category: FrameCategory
    name: string
    color?: string
    priceAddition: string
    priceModifier?: string | null
    imageUrl?: string | null
    thumbnailUrl?: string | null
  }>
}

interface QuickviewVariant {
  id: string
  sizeLabel: string
  widthInches: number
  heightInches: number
  price: number
  stockQuantity: number
}

interface QuickviewFrame {
  id: string
  type: string
  /** Which rung the axis heading groups this under. */
  category: FrameCategory
  name: string
  /**
   * The frame row's two pricing columns, carried through untransformed so the
   * one shared formula can read them.
   *
   * A moulding for a 12x16 and one for a 60x80 are not the same amount of
   * timber, and theirs price accordingly: measured across three sizes of one
   * piece, the framed option ran +85%, +76% and +91% of the rolled price
   * rather than a fixed sum. A flat `priceAddition` would undercharge every
   * large piece and overcharge every small one — see `frameAddition`.
   */
  pricing: FramePriceColumns
  /** A real photograph of this frame, or null when we have none worth showing. */
  photo: string | null
}

interface ProductOptions {
  variants: QuickviewVariant[]
  frames: QuickviewFrame[]
}

export interface ChooseOptionsProps {
  product: ProductCardData
  className?: string
}

/**
 * The moulding for each frame type: the lit edge and the shaded one.
 *
 * Two stops rather than one flat fill because theirs are photographs and a
 * photographed moulding catches light on one side — a single colour reads as a
 * sticker. These are the physical colours off the frame rows' own `color`
 * field ("Matte Black", "Weathered Brown"), not palette tokens: a walnut frame
 * is walnut whatever the site's ink is.
 */
const FRAME_SWATCH: Record<string, [string, string]> = {
  black: ['#3d3d3d', '#101010'],
  white: ['#ffffff', '#ddd8ce'],
  oak: ['#dcb27f', '#b1834b'],
  walnut: ['#7d5535', '#3f2618'],
  gold: ['#e6c86a', '#a17a17'],
  silver: ['#e3e7ea', '#959ba1'],
  wood: ['#ac8862', '#684d33'],
}

/**
 * Whether a frame asset is worth putting on a swatch.
 *
 * The seed ships placehold.co URLs — a grey placard reading "Black+Frame",
 * which is worse on the panel than drawing the corner ourselves. The moment
 * real photography lands in `frames.thumbnailUrl` these light up with no code
 * change.
 */
function usablePhoto(
  thumbnail?: string | null,
  full?: string | null
): string | null {
  const candidate = thumbnail || full
  if (!candidate) return null
  return /placehold\.co|placeholder/i.test(candidate) ? null : candidate
}

/**
 * A frame corner, drawn.
 *
 * mesonart's swatches are photographs — a corner of each moulding shot on
 * white and circular-cropped. Ours are their own product's photography, so
 * until we have that shot, this is the same READ: a square of moulding at an
 * angle, catching a shadow, over the print's white.
 */
function FrameCorner({ type }: { type: string }) {
  // The tube. Theirs photographs a rolled canvas with the paper edge showing;
  // this is the same read — a cylinder lying at an angle, lit down one side.
  if (type === 'rolled') {
    return (
      <span
        data-testid="frame-corner"
        aria-hidden="true"
        className={cn(
          'block h-[34px] w-[18px] -rotate-[24deg] rounded-[9px]',
          'shadow-[0_3px_6px_rgba(23,23,23,0.28)]'
        )}
        style={{
          backgroundImage:
            'linear-gradient(100deg, #efe9df 0%, #ffffff 35%, #e0d7c8 100%)',
        }}
      />
    )
  }

  // Stretched over bars with nothing around it: the face, and the depth of the
  // bar catching shadow down one edge.
  if (type === 'frameless') {
    return (
      <span
        data-testid="frame-corner"
        aria-hidden="true"
        className={cn(
          'block h-[32px] w-[32px] -rotate-[14deg] rounded-[2px] bg-background',
          'shadow-[3px_3px_0_0_#d9d3c8,0_4px_7px_rgba(23,23,23,0.25)]',
          'border border-foreground/15'
        )}
      />
    )
  }

  const moulding = FRAME_SWATCH[type]

  return (
    <span
      data-testid="frame-corner"
      aria-hidden="true"
      className={cn(
        'grid h-[34px] w-[34px] -rotate-[14deg] place-items-center rounded-[3px]',
        'shadow-[0_3px_6px_rgba(23,23,23,0.28)]',
        moulding
          ? 'p-[7px]'
          : // No moulding we know of — the bare sheet, edged just enough to be
            // seen against the white circle behind it.
            'border border-foreground/25 bg-background'
      )}
      style={
        moulding
          ? {
              backgroundImage: `linear-gradient(135deg, ${moulding[0]}, ${moulding[1]})`,
            }
          : undefined
      }
    >
      {moulding && (
        <span className="block h-full w-full bg-background shadow-[inset_0_1px_2px_rgba(23,23,23,0.4)]" />
      )}
    </span>
  )
}

/** Below this, say how many are left. Above it, say nothing. */
const LOW_STOCK = 5

const asNumber = (value: string | number): number =>
  typeof value === 'string' ? parseFloat(value) : value

function toOptions(response: ProductOptionsResponse | null): ProductOptions {
  return {
    variants: (response?.variants ?? [])
      .filter((v) => v.isInStock)
      .map((v) => ({
        id: v.id,
        sizeLabel: v.sizeLabel,
        widthInches: v.widthInches,
        heightInches: v.heightInches,
        price: asNumber(v.price),
        stockQuantity: v.stockQuantity,
      })),
    frames: (response?.frames ?? []).map((f) => ({
      id: f.id,
      type: f.type,
      category: f.category,
      name: f.name,
      // `1.40` on the row means "the piece plus 40%".
      pricing: { priceModifier: f.priceModifier, priceAddition: f.priceAddition },
      photo: usablePhoto(f.thumbnailUrl, f.imageUrl),
    })),
  }
}

export function ChooseOptions({ product, className }: ChooseOptionsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  )
  const [options, setOptions] = useState<ProductOptions | null>(null)
  const [variantId, setVariantId] = useState<string | null>(null)
  const [frameId, setFrameId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [slide, setSlide] = useState(0)
  /** Where the backdrop's drawn cursor sits, or null when it is off it. */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** Whether the one request has been issued. Not state — it must not re-render. */
  const requested = useRef(false)

  const sizeSelectId = useId()
  const titleId = useId()

  const { addItem } = useCartActions()

  const images = useMemo(() => sortedImages(product.images), [product.images])
  const active = images[slide] ?? images[0]

  const variant =
    options?.variants.find((v) => v.id === variantId) ?? options?.variants[0] ?? null
  const frame = options?.frames.find((f) => f.id === frameId) ?? null

  const unitPrice = variant ? variant.price : parseFloat(product.basePrice)
  // One formula, shared with `POST /api/cart/items` — the quickview's quote
  // and the row the server writes have to be the same number, or the drawer
  // re-prices itself the moment the write lands (#511 final review, finding 1).
  const framePrice = frameAddition(unitPrice, frame?.pricing)
  const total = (unitPrice + framePrice) * quantity

  /** Close and hand the keyboard back where it came from. */
  const close = useCallback(() => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }, [])

  /**
   * First open only. The panel is cheap to reopen and the catalogue does not
   * change under the shopper mid-scroll.
   *
   * Deliberately not an effect keyed on `isOpen`: closing the panel would run
   * the cleanup and abandon a request that is still in flight, leaving the
   * next open stuck on the loading state with the one-shot guard already
   * spent.
   */
  const load = useCallback(async () => {
    if (requested.current) return
    requested.current = true
    setStatus('loading')

    try {
      const response = await productsApi.getBySlug(product.slug)
      const loaded = toOptions(response as ProductOptionsResponse | null)
      setOptions(loaded)
      setVariantId(loaded.variants[0]?.id ?? null)
      // Theirs opens on Rolled Canvas — the format that adds nothing. Falling
      // back to the first row keeps that true if the ladder is ever reordered.
      setFrameId(
        (loaded.frames.find((f) => f.type === 'rolled') ?? loaded.frames[0])
          ?.id ?? null
      )
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [product.slug])

  const openPanel = useCallback(() => {
    setIsOpen(true)
    setQuantity(1)
    void load()
  }, [load])

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])

  /**
   * Freeze the page while the panel is up — keeping the shopper's place in the
   * grid is the point of the whole affordance.
   *
   * Same lock ReviewModal uses. Measured on /posters at 1440x900: locking
   * either `<body>` or the root holds the offset — neither clamps — so this
   * follows the existing convention rather than inventing a second one.
   */
  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Move the keyboard into the panel, or Tab continues from the grid behind it.
  useEffect(() => {
    if (isOpen) panelRef.current?.focus()
  }, [isOpen])

  const handleAdd = useCallback(() => {
    if (!variant) return

    addItem({
      productId: product.id,
      variantId: variant.id,
      frameId: frame?.id ?? null,
      quantity,
      productTitle: product.title,
      productSlug: product.slug,
      thumbnailUrl: images[0]?.url ?? '',
      sizeLabel: variant.sizeLabel,
      widthInches: variant.widthInches,
      heightInches: variant.heightInches,
      unitPrice: variant.price,
      framePrice,
      frameName: frame?.name,
      frameType: frame?.type,
      isAiGenerated: product.isAiGenerated,
    })

    close()
  }, [variant, frame, framePrice, quantity, product, images, addItem, close])

  const lowStock =
    variant && variant.stockQuantity > 0 && variant.stockQuantity <= LOW_STOCK
      ? variant.stockQuantity
      : null

  return (
    <>
      {/*
        Their trigger: a 172x40 white pill at radius 60, centred over the foot
        of the artwork, that wipes to black on hover. Not the full-bleed bar
        this used to be.

        `opacity-0` rather than `pointer-events-none` on hover-capable widths,
        and visible at rest below `md`: it has to stay in the tab order at
        every width, because a hover-only affordance is not a route in.
      */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPanel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'absolute bottom-6 left-1/2 z-20 h-10 -translate-x-1/2 whitespace-nowrap',
          'border-transparent bg-background px-[22px] text-base font-normal',
          'md:opacity-0 md:motion-safe:transition-opacity md:motion-safe:duration-300',
          EASE_FAST,
          'md:group-hover/card:opacity-100 md:focus-visible:opacity-100',
          className
        )}
      >
        Choose Options
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
          {/*
            Theirs: rgba(23,23,23,0.7), flat — no blur — and `cursor: none`,
            with a round X drawn under the pointer. The whole backdrop IS the
            close control, so the pointer says so rather than leaving the
            shopper to guess that clicking outside works.

            Escape and the close button cover everyone this does not: the
            follower is a pointer affordance and never the only way out.
          */}
          <div
            data-testid="quickview-backdrop"
            className="absolute inset-0 cursor-none bg-foreground/70"
            onClick={close}
            onMouseMove={(event) =>
              setPointer({ x: event.clientX, y: event.clientY })
            }
            onMouseLeave={() => setPointer(null)}
            aria-hidden="true"
          />

          {pointer && (
            <span
              data-testid="quickview-cursor"
              aria-hidden="true"
              style={{ left: pointer.x, top: pointer.y }}
              className={cn(
                'pointer-events-none fixed z-50 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2',
                'place-items-center rounded-full bg-background text-foreground shadow-[0_2px_10px_rgba(23,23,23,0.25)]'
              )}
            >
              <X className="h-4 w-4" />
            </span>
          )}

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cn(
              'relative z-10 grid w-full max-w-[1344px] overflow-hidden md:grid-cols-2',
              'max-h-[92vh] overflow-y-auto rounded-[var(--card-radius)] bg-background outline-none',
              'md:h-[768px] md:max-h-[86vh] md:overflow-y-hidden'
            )}
          >
            {/* LEFT — the artwork gets its own column, at their 671x768. */}
            <div
              data-testid="quickview-media"
              className="relative hidden bg-mat md:block"
            >
              {active && (
                <img
                  src={active.url}
                  alt={active.altText}
                  className="h-full w-full object-contain"
                />
              )}

              {images.length > 1 && (
                <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2">
                  {images.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setSlide(index)}
                      aria-label={`View image ${index + 1}`}
                      aria-current={index === slide}
                      className={cn(
                        'h-2 w-2 rounded-full transition-colors',
                        index === slide
                          ? 'bg-foreground'
                          : 'bg-foreground/25 hover:bg-foreground/50'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — the buy box. Their 60px gutters, their vertical order. */}
            <div className="flex flex-col gap-5 overflow-y-auto p-6 md:p-[60px]">
              <div className="flex items-start gap-4">
                <div className="grow">
                  <h2
                    id={titleId}
                    className="text-2xl font-light leading-tight text-foreground md:text-3xl"
                  >
                    {product.title}
                  </h2>
                  <ProductRating
                    averageRating={product.averageRating ?? null}
                    reviewCount={product.reviewCount ?? 0}
                    className="mt-2"
                  />
                </div>

                <span className="whitespace-nowrap text-2xl font-light text-foreground">
                  {formatPrice(unitPrice)}
                </span>

                {/* The toolbar pills' wipe, on a 48px circle: it fills black
                 * under the cursor rather than picking up a hover tint, so it
                 * behaves like every other outline control on the storefront. */}
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'h-12 w-12 shrink-0 rounded-full p-0'
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {status === 'error' && (
                <p role="alert" className="text-sm text-destructive">
                  Could not load the options for this piece. Open the product
                  page to continue.
                </p>
              )}

              {(status === 'loading' || status === 'idle') && (
                <p className="text-sm text-muted-foreground">
                  Loading options…
                </p>
              )}

              {status === 'ready' && options && (
                <>
                  <div className="space-y-2">
                    {/* Their label/value pair: "Size  <chosen>", 300 then 500.
                     * The value sits OUTSIDE the label — folded in, it becomes
                     * part of the select's accessible name and the control
                     * announces as "Size 24 x 36" rather than "Size". */}
                    <div className="flex items-center gap-2 text-foreground">
                      <label htmlFor={sizeSelectId}>Size</label>
                      <span
                        data-testid="quickview-size-value"
                        className="font-medium"
                      >
                        {variant?.sizeLabel ?? ''}
                      </span>
                    </div>
                    <select
                      id={sizeSelectId}
                      value={variant?.id ?? ''}
                      onChange={(event) => setVariantId(event.target.value)}
                      className="h-[52px] w-full rounded-md bg-foreground/[0.024] px-4 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {options.variants.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.sizeLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  {options.frames.length > 0 && (
                    <div className="space-y-3">
                      {/* Their heading names the whole axis, not the last
                       * rung of it: the print in a tube, the print stretched,
                       * or the print stretched and framed.
                       *
                       * Derived from the rows rather than written out, and
                       * derived by the same helper the PDP panel uses. The
                       * literal string was safe only while the catalogue was
                       * seeded in code and always carried all three rungs; an
                       * admin who archives every rolled frame would otherwise
                       * leave this heading promising an option the panel below
                       * it does not offer. */}
                      <p
                        data-testid="quickview-frame-label"
                        className="flex flex-wrap items-center gap-2 text-foreground"
                      >
                        {frameGroupLabel(options.frames)}:
                        <span
                          data-testid="quickview-frame-value"
                          className="font-medium"
                        >
                          {frame?.name ?? 'None'}
                        </span>
                      </p>
                      {/* 60px circles on a 100px pitch, as measured. Theirs
                       * sit on white with a soft ring and a shadow, and the
                       * chosen one takes a black ring. */}
                      <div className="flex flex-wrap gap-10">
                        {options.frames.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setFrameId(option.id)}
                            aria-pressed={option.id === frame?.id}
                            className={cn(
                              'group/swatch relative grid h-[60px] w-[60px] place-items-center rounded-full',
                              'bg-background shadow-[0_2px_10px_rgba(23,23,23,0.18)] transition-shadow',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                              option.id === frame?.id &&
                                'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                            )}
                          >
                            <span className="sr-only">{option.name}</span>

                            {option.photo ? (
                              <img
                                src={option.photo}
                                alt=""
                                aria-hidden="true"
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <FrameCorner type={option.type} />
                            )}

                            {/* Their hover label: a small black pill above the
                             * swatch. Decorative — the button is already named. */}
                            <span
                              data-testid="frame-name"
                              aria-hidden="true"
                              className={cn(
                                'pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap',
                                'rounded-pill bg-primary px-3 py-1 text-xs text-primary-foreground',
                                'opacity-0 transition-opacity',
                                EASE_FAST,
                                'group-hover/swatch:opacity-100 group-focus-visible/swatch:opacity-100'
                              )}
                            >
                              {option.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {lowStock !== null && (
                    <p
                      data-testid="quickview-stock"
                      className="text-sm text-muted-foreground"
                    >
                      Only {lowStock} left in stock.
                    </p>
                  )}

                  {/* Their CTA row: stepper, then the pill quoting the total. */}
                  <div className="mt-auto flex items-center gap-4 pt-2">
                    <div className="flex h-[60px] shrink-0 items-center gap-1 rounded-pill border border-foreground/15 px-2">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        aria-label="Decrease quantity"
                        className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span
                        data-testid="quickview-quantity"
                        className="w-6 text-center tabular-nums text-foreground"
                      >
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => q + 1)}
                        aria-label="Increase quantity"
                        className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={!variant}
                      className={cn(
                        buttonVariants({ variant: 'solid' }),
                        'h-[60px] grow font-normal'
                      )}
                    >
                      Add to cart - {formatPrice(total)}
                    </button>
                  </div>

                  <Link
                    to="/posters/$slug"
                    params={{ slug: product.slug }}
                    className="flex items-center justify-between border-t border-foreground/10 pt-4 text-foreground transition-opacity hover:opacity-60"
                  >
                    View full details
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ChooseOptions
