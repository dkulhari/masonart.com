/**
 * ChooseOptions — buy from the grid without leaving it (#420).
 *
 * mesonart puts one `<button is="hover-button" aria-controls="Quickview-...">
 * Choose options</button>` on every card. It opens a panel where size and
 * frame are picked and the item goes into the cart, so the shopper keeps their
 * scroll position and their place in the grid.
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

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { productsApi } from '~/lib/api'
import { useCartStore } from '~/stores/cart'
import { buttonVariants } from '~/components/ui/Button'
import { SizeSelectorCompact, type SizeVariant } from './SizeSelector'
import {
  FrameSelectorCompact,
  calculateFramePrice,
  type FrameOptionData,
} from './FrameSelector'
import { EASE_FAST } from './productCardTokens'
import type { ProductCardData } from './ProductCard'

/** The slice of GET /api/products/:slug this panel reads. */
interface ProductOptionsResponse {
  variants?: Array<{
    id: string
    sizeId?: string
    sizeLabel: string
    widthInches: number
    heightInches: number
    price: string | number
    stockQuantity: number
    isInStock: boolean
    variantSku?: string
  }>
  frames?: Array<{
    id: string
    type: string
    name: string
    description: string
    material?: string
    imageUrl?: string
    priceAddition: string
  }>
}

interface ProductOptions {
  variants: SizeVariant[]
  frames: FrameOptionData[]
}

export interface ChooseOptionsProps {
  product: ProductCardData
  className?: string
}

const asNumber = (value: string | number): number =>
  typeof value === 'string' ? parseFloat(value) : value

/**
 * Same transform routes/posters/$slug.tsx applies, over the two fields this
 * panel needs. Notably `priceAddition` arrives in rupees and
 * `calculateFramePrice` expects paise for a fixed modifier, so the ×100 here is
 * undone there.
 */
function toOptions(response: ProductOptionsResponse | null): ProductOptions {
  return {
    variants: (response?.variants ?? []).map((v) => ({
      id: v.id,
      sizeId: v.sizeId || v.id,
      sizeLabel: v.sizeLabel,
      widthInches: v.widthInches,
      heightInches: v.heightInches,
      price: v.price,
      stockQuantity: v.stockQuantity,
      isAvailable: v.isInStock,
      sku: v.variantSku,
    })),
    frames: (response?.frames ?? []).map((f) => ({
      id: f.id,
      type: f.type,
      name: f.name,
      description: f.description,
      material: f.material,
      imageUrl: f.imageUrl,
      priceModifierType: 'fixed' as const,
      priceModifierValue: parseFloat(f.priceAddition || '0') * 100,
      isAvailable: true,
    })),
  }
}

export function ChooseOptions({ product, className }: ChooseOptionsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  )
  const [options, setOptions] = useState<ProductOptions | null>(null)
  const [variant, setVariant] = useState<SizeVariant | null>(null)
  const [frame, setFrame] = useState<FrameOptionData | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** Whether the one request has been issued. Not state — it must not re-render. */
  const requested = useRef(false)

  const addItem = useCartStore((state) => state.addItem)

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
      setVariant(loaded.variants.find((v) => v.isAvailable) ?? null)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [product.slug])

  const openPanel = useCallback(() => {
    setIsOpen(true)
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

  const unitPrice = variant ? asNumber(variant.price) : parseFloat(product.basePrice)
  const framePrice = frame
    ? calculateFramePrice(
        unitPrice,
        frame.priceModifierType,
        frame.priceModifierValue
      )
    : 0

  const handleAdd = useCallback(() => {
    if (!variant) return

    addItem({
      productId: product.id,
      variantId: variant.id,
      frameId: frame?.id ?? null,
      quantity: 1,
      productTitle: product.title,
      productSlug: product.slug,
      thumbnailUrl: product.images[0]?.url ?? '',
      sizeLabel: variant.sizeLabel,
      widthInches: variant.widthInches,
      heightInches: variant.heightInches,
      unitPrice: asNumber(variant.price),
      framePrice,
      frameName: frame?.name,
      frameType: frame?.type,
      isAiGenerated: product.isAiGenerated,
    })

    close()
  }, [variant, frame, framePrice, product, addItem, close])

  return (
    <>
      {/*
        Visible at rest on touch, hover-revealed on desktop — `opacity-0` alone
        rather than `pointer-events-none`, so it stays in the tab order at every
        width. A pointer that can click it has already crossed the card and
        revealed it.
      */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPanel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          buttonVariants({ variant: 'solid', size: 'sm' }),
          'absolute inset-x-4 bottom-4 z-20 w-auto',
          'md:opacity-0 md:motion-safe:transition-opacity md:motion-safe:duration-300',
          EASE_FAST,
          'md:group-hover/card:opacity-100 md:focus-visible:opacity-100',
          className
        )}
      >
        Choose options
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Choose options for ${product.title}`}
            tabIndex={-1}
            className={cn(
              'relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto',
              'rounded-[var(--card-radius)] bg-background p-6 outline-none'
            )}
          >
            <div className="flex items-start gap-4">
              {product.images[0] && (
                <img
                  src={product.images[0].url}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-[var(--card-radius)] bg-mat object-contain"
                />
              )}
              <div className="grow">
                <p className="text-product font-medium leading-tight text-foreground">
                  {product.title}
                </p>
                <p
                  data-testid="choose-options-total"
                  className="mt-1 text-product font-light text-foreground"
                >
                  {formatPrice(unitPrice + framePrice)}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {status === 'error' && (
              <p role="alert" className="mt-6 text-sm text-destructive">
                Could not load the options for this piece. Open the product page
                to continue.
              </p>
            )}

            {(status === 'loading' || status === 'idle') && (
              <p className="mt-6 text-sm text-muted-foreground">
                Loading options…
              </p>
            )}

            {status === 'ready' && options && (
              <div className="mt-6 space-y-5">
                <SizeSelectorCompact
                  variants={options.variants}
                  selectedVariantId={variant?.id ?? null}
                  onVariantSelect={setVariant}
                />

                {options.frames.length > 0 && (
                  <FrameSelectorCompact
                    frames={options.frames}
                    selectedFrameId={frame?.id ?? null}
                    onFrameSelect={setFrame}
                  />
                )}

                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!variant}
                  className={cn(
                    buttonVariants({ variant: 'solid', size: 'pill' }),
                    'w-full'
                  )}
                >
                  Add to cart
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default ChooseOptions
