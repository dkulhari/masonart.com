/**
 * Cart API Routes
 *
 * Provides API endpoints for shopping cart management:
 * - GET /api/cart - Get current cart with items
 * - POST /api/cart/items - Add item to cart
 * - PATCH /api/cart/items/:id - Update cart item (quantity)
 * - DELETE /api/cart/items/:id - Remove item from cart
 * - DELETE /api/cart - Clear entire cart
 *
 * A guest cart merges into the user's automatically — see
 * `mergeGuestCartOnAuth` — on the first authenticated request that still
 * carries the guest session cookie. There is no client-callable merge route:
 * the guest session id is httpOnly and the client never has it to send.
 *
 * Supports both authenticated users and guest sessions.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  frameAddition,
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
  GIFT_CARD_MAX_SCHEDULE_DAYS,
} from "@chobii/shared";

import { db } from "../database";
import {
  carts,
  cartItems,
  type CartItemCustomizations,
  type CartItemAIDetails,
} from "../database/schema/cart";
import { products, productVariants, frames } from "../database/schema/products";
import type { GiftCardPurchase } from "../database/schema/orders";
import { aiGenerations } from "../database/schema/ai-generations";
import {
  optionalAuth,
  type AuthUser,
  type OptionalAuthVariables,
} from "../middleware/auth";
import { getCached, setCached, deleteCached, CacheKeys } from "../lib/redis";
import {
  getActivePromotions,
  loadPromotionProductSets,
  resolveSalePrice,
} from "../lib/promotion-pricing";

// ============================================================================
// Constants
// ============================================================================

const GUEST_CART_COOKIE = "cart_session";
const GUEST_CART_EXPIRY_DAYS = 30;
const CACHE_TTL_CART = 300; // 5 minutes

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for adding an item to cart
 */
/**
 * A gift card line. Mirrors the standalone purchase schema in
 * `routes/gift-cards.ts` — same bounds, same year-out cap on the send date —
 * because the two flows must not disagree about what a valid card is.
 */
const addGiftCardToCartSchema = z.object({
  amountPaise: z
    .number()
    .int()
    .min(GIFT_CARD_MIN_PAISE)
    .max(GIFT_CARD_MAX_PAISE),
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1).max(120),
  senderName: z.string().min(1).max(120),
  message: z.string().max(500).optional(),
  sendAt: z.coerce
    .date()
    .refine(
      (date) =>
        date.getTime() <= Date.now() + GIFT_CARD_MAX_SCHEDULE_DAYS * 86_400_000,
      { message: "Send date cannot be more than a year away" },
    )
    .optional(),
});

const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  frameId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive().max(99).default(1),
  customizations: z
    .object({
      matWidth: z.number().nonnegative().optional(),
      matColor: z.string().optional(),
      mountingStyle: z.string().optional(),
      glazingType: z.string().optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  // For AI-generated posters
  isAiGenerated: z.boolean().optional().default(false),
  aiGenerationId: z.string().uuid().optional(),
  aiDetails: z
    .object({
      generationId: z.string(),
      prompt: z.string(),
      stylePreset: z.string().optional(),
      thumbnailUrl: z.string().url().optional(),
    })
    .optional(),
});

/**
 * Schema for updating a cart item
 */
const updateCartItemSchema = z.object({
  quantity: z.number().int().positive().max(99).optional(),
  frameId: z.string().uuid().optional().nullable(),
  customizations: z
    .object({
      matWidth: z.number().nonnegative().optional(),
      matColor: z.string().optional(),
      mountingStyle: z.string().optional(),
      glazingType: z.string().optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  isSavedForLater: z.boolean().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique guest session ID
 */
function generateSessionId(): string {
  return `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or create cart for user/guest
 */
async function getOrCreateCart(
  userId: string | null,
  sessionId: string | null
): Promise<typeof carts.$inferSelect> {
  // Try to find existing cart
  let cart = null;

  if (userId) {
    // Look for user's active cart
    const userCarts = await db
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.isActive, true)))
      .limit(1);
    cart = userCarts[0];
  } else if (sessionId) {
    // Look for guest cart
    const guestCarts = await db
      .select()
      .from(carts)
      .where(and(eq(carts.sessionId, sessionId), eq(carts.isActive, true)))
      .limit(1);
    cart = guestCarts[0];
  }

  // Create new cart if none exists
  if (!cart) {
    const expiresAt = userId
      ? null
      : new Date(Date.now() + GUEST_CART_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const newCarts = await db
      .insert(carts)
      .values({
        userId: userId || null,
        sessionId: userId ? null : sessionId,
        isActive: true,
        expiresAt,
      })
      .returning();

    cart = newCarts[0];
  }

  return cart!;
}

// ============================================================================
// Sale pricing
// ============================================================================

/**
 * Membership, read off the session.
 *
 * Mirrors `routes/products.ts`: `galleryMember` is a Better Auth additional
 * field, so it rides on the session user without appearing on `AuthUser` — the
 * cast is what that costs. A guest is a non-member, which is the safe default:
 * a members-only sale renders to them locked rather than priced.
 */
function readIsMember(user: AuthUser | null | undefined): boolean {
  return Boolean(
    (user as (AuthUser & { galleryMember?: boolean }) | null | undefined)
      ?.galleryMember
  );
}

/**
 * A member and a guest get different bodies for the same cart — `pricing.locked`
 * is the whole difference on a members-only sale — so they get different entries.
 *
 * Both keys have to be dropped together on a write (`invalidateCartCache`), or a
 * mutation clears one and the other keeps serving the pre-mutation cart for the
 * rest of the TTL.
 */
function cartCacheKey(cartId: string, isMember: boolean): string {
  return `${CacheKeys.CART}${cartId}${isMember ? ":member" : ":guest"}`;
}

/**
 * Exported because order creation empties this very cart, in `routes/orders.ts`,
 * and a five-minute cache entry that outlives the order serves the purchased
 * items straight back to the success page (#511 final review, finding 4).
 *
 * Exported rather than reimplemented there: the key is viewer-keyed, both
 * variants have to be dropped together, and a second copy of that derivation is
 * a second chance to get it subtly wrong.
 */
export async function invalidateCartCache(cartId: string): Promise<void> {
  await Promise.all([
    deleteCached(cartCacheKey(cartId, false)),
    deleteCached(cartCacheKey(cartId, true)),
  ]);
}

/**
 * Everything the cart needs to price its lines, fetched once per request.
 *
 * The two id sets are per-request, not per-line: resolving inside the map would
 * turn a ten-line cart into twenty extra queries.
 */
async function loadSaleContext(isMember: boolean) {
  const activePromotions = await getActivePromotions();
  const { includedIds, excludedIds } =
    await loadPromotionProductSets(activePromotions);
  return { activePromotions, ctx: { isMember, includedIds, excludedIds } };
}

type SaleContext = Awaited<ReturnType<typeof loadSaleContext>>;

/** Half-up to 2dp, applied per line — never to the cart subtotal. */
function toMoney(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

type PricedCartLine = {
  quantity: number;
  unitPrice: string;
  framePrice: string;
  lineTotal: string;
  product: { id: string } | null;
};

/**
 * What a line costs, base and on sale, resolved fresh on every read.
 *
 * The discount comes off the line's own `unitPrice` — the variant's price, which
 * is the money actually being charged — and not off the product's base price.
 * Handing the resolver the line's unit price keeps eligibility, the member gate
 * and the rounding in the one module that owns them, while an A1 print discounts
 * from its own price rather than from the A4's.
 *
 * The frame stays at full price: the sale is on the artwork.
 *
 * `pricing.base` is the stored `lineTotal`, unchanged. Nothing here writes.
 */
function priceCartLine<T extends PricedCartLine>(item: T, sale: SaleContext) {
  const resolved = item.product
    ? resolveSalePrice(
        { ...item.product, basePrice: item.unitPrice },
        sale.activePromotions,
        sale.ctx
      )
    : null;

  const framePrice = parseFloat(item.framePrice ?? "0") || 0;

  return {
    ...item,
    pricing: {
      base: item.lineTotal,
      sale: resolved
        ? toMoney((parseFloat(resolved.salePrice) + framePrice) * item.quantity)
        : null,
      locked: resolved?.locked ?? false,
      headline: resolved?.headline ?? null,
      percentOff: resolved?.percentOff ?? null,
    },
  };
}

/**
 * What the viewer actually saves on a line.
 *
 * A locked line is charged base — the price is a teaser behind the membership
 * gate — so it saves nothing until they join.
 */
function lineSaving(line: ReturnType<typeof priceCartLine>): number {
  if (!line.pricing.sale || line.pricing.locked) return 0;
  return parseFloat(line.pricing.base) - parseFloat(line.pricing.sale);
}

/**
 * Calculate and update cart totals
 */
async function updateCartTotals(cartId: string): Promise<void> {
  // Calculate totals from cart items (excluding saved for later)
  const result = await db
    .select({
      itemCount: sql<number>`COALESCE(SUM(${cartItems.quantity})::int, 0)`,
      subtotal: sql<string>`COALESCE(SUM(${cartItems.lineTotal}::numeric), 0)::text`,
    })
    .from(cartItems)
    .where(
      and(eq(cartItems.cartId, cartId), eq(cartItems.isSavedForLater, false))
    );

  const totals = result[0];

  // Update cart with new totals
  await db
    .update(carts)
    .set({
      itemCount: totals?.itemCount ?? 0,
      subtotal: totals?.subtotal ?? "0.00",
      lastActivityAt: new Date(),
    })
    .where(eq(carts.id, cartId));

  // Invalidate cart cache
  await invalidateCartCache(cartId);
}

/**
 * Calculate line total for a cart item
 *
 * Base, deliberately. A promotion is never baked into the stored figure: a cart
 * left sitting across the end of a sale would otherwise still charge the sale
 * price. Sale is resolved at read time, every time — see `priceCartLine`.
 */
function calculateLineTotal(
  unitPrice: string,
  framePrice: string,
  quantity: number
): string {
  const unit = parseFloat(unitPrice) || 0;
  const frame = parseFloat(framePrice) || 0;
  return ((unit + frame) * quantity).toFixed(2);
}

/**
 * What the frame on a line costs, as the column stores it.
 *
 * Delegates to `frameAddition` in `@chobii/shared` — the one formula the
 * storefront quotes from — rather than reading `priceAddition` on its own,
 * which is `0.00` on every seeded frame and stored every framed line at a
 * frame price of zero. `POST /api/orders` then sums those `lineTotal`s, so
 * every framed order was undercharged by the entire frame markup (#511 final
 * review, finding 1).
 *
 * Both the POST and the PATCH path go through here; there is no second
 * expression to keep in step.
 */
function resolveFramePrice(
  unitPrice: string,
  frame: { priceModifier: string | null; priceAddition: string | null }
): string {
  return frameAddition(parseFloat(unitPrice) || 0, frame).toFixed(2);
}

/**
 * Get cart with items and related data
 */
async function getCartWithItems(cartId: string) {
  // Get cart with items using relations
  const cart = await db.query.carts.findFirst({
    where: eq(carts.id, cartId),
    with: {
      items: {
        with: {
          product: {
            columns: {
              id: true,
              sku: true,
              title: true,
              slug: true,
              images: true,
              status: true,
              /**
               * Selected for the sale resolver, not for the cart row.
               *
               * `styles`, `subjects` and `rooms` are the three axes a
               * `filter`-scoped promotion can name, and `isFeatured` the
               * fourth. Leaving any of them out would price a scoped sale on
               * the product pages (which read the whole row) and not in the
               * cart — the same product at two prices on two surfaces.
               *
               * `basePrice` rides along for completeness; the discount itself
               * comes off the line's own `unitPrice` (see `priceCartLine`).
               */
              basePrice: true,
              styles: true,
              subjects: true,
              rooms: true,
              isFeatured: true,
            },
          },
          variant: {
            columns: {
              id: true,
              sizeLabel: true,
              widthInches: true,
              heightInches: true,
              price: true,
              isInStock: true,
              stockQuantity: true,
            },
          },
          frame: {
            columns: {
              id: true,
              name: true,
              type: true,
              priceModifier: true,
              priceAddition: true,
              thumbnailUrl: true,
            },
          },
        },
      },
    },
  });

  return cart;
}

// ============================================================================
// Guest cart merge
// ============================================================================

/**
 * Fold a guest cart into a user's, then leave the guest cart empty.
 *
 * Matching is on (productId, variantId, frameId, isSavedForLater) — the same
 * natural key `POST /items` dedupes on — and a match sums the quantities rather
 * than creating a second line.
 *
 * Returns true when a guest cart was found.
 */
export async function mergeGuestCartInto(
  userId: string,
  guestSessionId: string
): Promise<boolean> {
  // Find guest cart
  const guestCarts = await db
    .select()
    .from(carts)
    .where(and(eq(carts.sessionId, guestSessionId), eq(carts.isActive, true)))
    .limit(1);

  if (!guestCarts[0]) {
    return false;
  }

  const guestCart = guestCarts[0];

  /**
   * Claim the guest cart before touching a single line of it (#567).
   *
   * Two authenticated requests issued together right after login can both
   * pass the `isActive` check above before either has written anything — the
   * guest cart's items are not deleted or reassigned until the loop below,
   * so nothing before this point stops a second caller from reading and
   * re-summing the same guest line into the user's cart a second time.
   * `WHERE is_active = true` on this write makes it an atomic compare-and-set:
   * only one caller can ever flip the row, so only one caller ever proceeds
   * past here. The loser sees zero rows returned and stops immediately —
   * there is nothing to merge, because the winner is already merging it.
   */
  const claimed = await db
    .update(carts)
    .set({ isActive: false })
    .where(and(eq(carts.id, guestCart.id), eq(carts.isActive, true)))
    .returning();

  if (!claimed[0]) {
    return false;
  }

  // Get or create user's cart
  const userCart = await getOrCreateCart(userId, null);

  // Get all items from guest cart
  const guestItems = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, guestCart.id));

  // Merge items into user cart
  for (const item of guestItems) {
    /**
     * A gift card line is never combined with another (#579).
     *
     * Two cards of the same value can be going to two different people with
     * two different messages, and the "same item" test below compares product
     * and variant — both null on a gift card line, so every card would look
     * identical to every other. Moving it across whole is the only correct
     * merge.
     */
    const existingItems =
      item.lineType === "gift_card" || !item.productId || !item.variantId
        ? []
        : await db
            .select()
            .from(cartItems)
            .where(
              and(
                eq(cartItems.cartId, userCart.id),
                eq(cartItems.productId, item.productId),
                eq(cartItems.variantId, item.variantId),
                item.frameId
                  ? eq(cartItems.frameId, item.frameId)
                  : sql`${cartItems.frameId} IS NULL`,
                eq(cartItems.isSavedForLater, item.isSavedForLater)
              )
            )
            .limit(1);

    if (existingItems[0]) {
      // Update quantity
      const newQuantity = existingItems[0].quantity + item.quantity;
      const lineTotal = calculateLineTotal(
        item.unitPrice,
        item.framePrice,
        newQuantity
      );

      await db
        .update(cartItems)
        .set({ quantity: newQuantity, lineTotal })
        .where(eq(cartItems.id, existingItems[0].id));
    } else {
      // Move item to user cart
      await db
        .update(cartItems)
        .set({ cartId: userCart.id })
        .where(eq(cartItems.id, item.id));
    }
  }

  // Update user cart totals
  await updateCartTotals(userCart.id);

  // Clear the guest cart cache
  await invalidateCartCache(guestCart.id);

  return true;
}

/**
 * Merge on the first authenticated request that still carries a guest cookie.
 *
 * The guest session id is httpOnly and never leaves the server, so the client
 * cannot ask for this — it has to happen where the cookie is readable (#511).
 * The cookie is deleted only once the merge actually completes, so a second
 * request cannot merge again.
 *
 * A failure here is logged and swallowed: an unmergeable guest cart must not
 * take down every cart read for that customer. But swallowing the error must
 * not also delete the cookie — that would discard the only handle to the
 * guest cart on what may be a transient DB error, with no way to retry. The
 * cookie surviving costs nothing; the next authenticated request just tries
 * the merge again (#567).
 */
const mergeGuestCartOnAuth: MiddlewareHandler<{
  Variables: OptionalAuthVariables;
}> = async (c, next) => {
  const user = c.get("user");
  const sessionId = getCookie(c, GUEST_CART_COOKIE);

  if (user && sessionId) {
    try {
      await mergeGuestCartInto(user.id, sessionId);
      deleteCookie(c, GUEST_CART_COOKIE, { path: "/" });
    } catch (error) {
      console.error("Error merging guest cart:", error);
    }
  }

  await next();
};

// ============================================================================
// Route Handler
// ============================================================================

const cartApp = new Hono<{ Variables: OptionalAuthVariables }>();

// Apply optional auth to all routes
cartApp.use("*", optionalAuth);
cartApp.use("*", mergeGuestCartOnAuth);

// ============================================================================
// GET /api/cart - Get Cart
// ============================================================================

cartApp.get("/", async (c) => {
  const user = c.get("user");
  const userId = user?.id || null;

  // Get or create guest session ID
  let sessionId = getCookie(c, GUEST_CART_COOKIE) || null;
  if (!userId && !sessionId) {
    sessionId = generateSessionId();
    setCookie(c, GUEST_CART_COOKIE, sessionId, {
      maxAge: GUEST_CART_EXPIRY_DAYS * 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
    });
  }

  try {
    const cart = await getOrCreateCart(userId, sessionId);

    // Check cache — keyed on the viewer, see `cartCacheKey`.
    const isMember = readIsMember(user);
    const cacheKey = cartCacheKey(cart.id, isMember);
    const cached = await getCached<object>(cacheKey);
    if (cached) {
      return c.json({ ...cached, fromCache: true });
    }

    // Get cart with items
    const cartWithItems = await getCartWithItems(cart.id);

    if (!cartWithItems) {
      return c.json({ error: "Cart not found" }, 404);
    }

    /**
     * One resolve pass over the cart.
     *
     * Every price on the storefront comes out of `resolveSalePrice`, so the
     * cart cannot drift from the grid or the PDP. The stored figures below —
     * `subtotal` and each line's `lineTotal` — stay exactly as written: base.
     */
    const saleContext = await loadSaleContext(isMember);

    // Separate active items and saved for later
    const activeItems = cartWithItems.items
      .filter((i) => !i.isSavedForLater)
      .map((i) => priceCartLine(i, saleContext));
    const savedItems = cartWithItems.items
      .filter((i) => i.isSavedForLater)
      .map((i) => priceCartLine(i, saleContext));

    const result = {
      id: cartWithItems.id,
      userId: cartWithItems.userId,
      itemCount: cartWithItems.itemCount,
      subtotal: cartWithItems.subtotal,
      couponCode: cartWithItems.couponCode,
      couponDiscount: cartWithItems.couponDiscount,
      currency: cartWithItems.currency,
      items: activeItems,
      savedForLater: savedItems,
      /**
       * Summed from the per-line savings, each already rounded — rounding the
       * subtotal instead would stop the lines reconciling with the total.
       *
       * Saved-for-later lines are left out for the same reason `subtotal`
       * leaves them out: they are not being bought yet.
       */
      savingTotal: toMoney(
        activeItems.reduce((total, line) => total + lineSaving(line), 0)
      ),
      createdAt: cartWithItems.createdAt,
      updatedAt: cartWithItems.updatedAt,
    };

    // Cache the result
    await setCached(cacheKey, result, CACHE_TTL_CART);

    return c.json(result);
  } catch (error) {
    console.error("Error fetching cart:", error);
    return c.json({ error: "Failed to fetch cart" }, 500);
  }
});

// ============================================================================
// POST /api/cart/items - Add Item to Cart
// ============================================================================

cartApp.post("/items", zValidator("json", addCartItemSchema), async (c) => {
  const user = c.get("user");
  const userId = user?.id || null;
  const input = c.req.valid("json");

  // Get or create guest session ID
  let sessionId = getCookie(c, GUEST_CART_COOKIE) || null;
  if (!userId && !sessionId) {
    sessionId = generateSessionId();
    setCookie(c, GUEST_CART_COOKIE, sessionId, {
      maxAge: GUEST_CART_EXPIRY_DAYS * 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
    });
  }

  try {
    // Validate product exists and is active
    const product = await db
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);

    if (!product[0] || product[0].status !== "active") {
      return c.json({ error: "Product not found or unavailable" }, 404);
    }

    // Validate variant exists and belongs to product
    const variant = await db
      .select({
        id: productVariants.id,
        price: productVariants.price,
        isInStock: productVariants.isInStock,
        stockQuantity: productVariants.stockQuantity,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, input.variantId),
          eq(productVariants.productId, input.productId),
          eq(productVariants.isActive, true)
        )
      )
      .limit(1);

    if (!variant[0]) {
      return c.json({ error: "Product variant not found" }, 404);
    }

    // Check stock availability
    if (!variant[0].isInStock) {
      return c.json({ error: "Product variant is out of stock" }, 400);
    }

    // Validate frame if provided
    let framePrice = "0.00";
    let frameRecord: {
      priceModifier: string | null;
      priceAddition: string | null;
    } | null = null;
    if (input.frameId) {
      const frame = await db
        .select({
          id: frames.id,
          priceModifier: frames.priceModifier,
          priceAddition: frames.priceAddition,
          isActive: frames.isActive,
        })
        .from(frames)
        .where(eq(frames.id, input.frameId))
        .limit(1);

      if (!frame[0] || !frame[0].isActive) {
        return c.json({ error: "Frame not found or unavailable" }, 404);
      }

      frameRecord = frame[0];
      framePrice = resolveFramePrice(variant[0].price, frame[0]);
    }

    // Check AI generation moderation status if adding AI-generated content
    if (input.aiGenerationId) {
      const generation = await db
        .select({
          id: aiGenerations.id,
          moderationStatus: aiGenerations.moderationStatus,
        })
        .from(aiGenerations)
        .where(eq(aiGenerations.id, input.aiGenerationId))
        .limit(1);

      if (!generation[0]) {
        return c.json({ error: "AI generation not found" }, 404);
      }

      if (generation[0].moderationStatus !== "approved") {
        return c.json(
          {
            error: "This AI creation is pending review and cannot be added to cart yet",
            moderationStatus: generation[0].moderationStatus,
          },
          403
        );
      }
    }

    // Get or create cart
    const cart = await getOrCreateCart(userId, sessionId);

    // Check if same item already exists in cart (same product + variant + frame)
    const existingItems = await db
      .select()
      .from(cartItems)
      .where(
        and(
          eq(cartItems.cartId, cart.id),
          eq(cartItems.productId, input.productId),
          eq(cartItems.variantId, input.variantId),
          input.frameId
            ? eq(cartItems.frameId, input.frameId)
            : sql`${cartItems.frameId} IS NULL`,
          eq(cartItems.isSavedForLater, false)
        )
      )
      .limit(1);

    let cartItem;

    if (existingItems[0]) {
      // Update quantity of existing item.
      //
      // Priced off the row's own stored unit price, not the variant's
      // current one — matching the PATCH path (cart.ts:936): the frame is a
      // percentage OF THIS LINE, and re-reading the variant would silently
      // reprice a line that has been sitting since the catalogue moved.
      // Both `unitPrice` and `framePrice` are written alongside `lineTotal`
      // so the row stays reproducible from its own stored components.
      const newQuantity = existingItems[0].quantity + input.quantity;
      const dedupeUnitPrice = existingItems[0].unitPrice;
      const dedupeFramePrice = frameRecord
        ? resolveFramePrice(dedupeUnitPrice, frameRecord)
        : "0.00";
      const lineTotal = calculateLineTotal(
        dedupeUnitPrice,
        dedupeFramePrice,
        newQuantity
      );

      const updated = await db
        .update(cartItems)
        .set({
          quantity: newQuantity,
          unitPrice: dedupeUnitPrice,
          framePrice: dedupeFramePrice,
          lineTotal,
          customizations:
            (input.customizations as CartItemCustomizations) || null,
        })
        .where(eq(cartItems.id, existingItems[0].id))
        .returning();

      cartItem = updated[0];
    } else {
      // Create new cart item
      const lineTotal = calculateLineTotal(
        variant[0].price,
        framePrice,
        input.quantity
      );

      const inserted = await db
        .insert(cartItems)
        .values({
          cartId: cart.id,
          productId: input.productId,
          variantId: input.variantId,
          frameId: input.frameId || null,
          quantity: input.quantity,
          unitPrice: variant[0].price,
          framePrice,
          lineTotal,
          isAiGenerated: input.isAiGenerated,
          aiGenerationId: input.aiGenerationId || null,
          aiDetails: (input.aiDetails as CartItemAIDetails) || null,
          customizations:
            (input.customizations as CartItemCustomizations) || null,
        })
        .returning();

      cartItem = inserted[0];
    }

    // Update cart totals
    await updateCartTotals(cart.id);

    return c.json(
      {
        message: "Item added to cart",
        item: cartItem,
      },
      201
    );
  } catch (error) {
    console.error("Error adding item to cart:", error);
    return c.json({ error: "Failed to add item to cart" }, 500);
  }
});

// ============================================================================
// POST /api/cart/gift-cards - Add a Gift Card to the Cart
// ============================================================================

/**
 * Its own endpoint rather than a branch of POST /items.
 *
 * `/items` is about the catalogue: it takes a product and a variant, checks
 * both are active and in stock, and derives the price from the variant row. A
 * gift card shares none of that — no product, no stock, and a price the
 * customer typed. Overloading one endpoint would mean every field on it
 * becoming conditional on a discriminator, and the stock checks becoming
 * "unless it is a gift card" (#579).
 */
cartApp.post(
  "/gift-cards",
  zValidator("json", addGiftCardToCartSchema),
  async (c) => {
    const user = c.get("user");
    const userId = user?.id || null;

    let sessionId = getCookie(c, GUEST_CART_COOKIE) || null;
    if (!userId && !sessionId) {
      sessionId = generateSessionId();
      setCookie(c, GUEST_CART_COOKIE, sessionId, {
        maxAge: GUEST_CART_EXPIRY_DAYS * 24 * 60 * 60,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        path: "/",
      });
    }

    const input = c.req.valid("json");

    try {
      const cart = await getOrCreateCart(userId, sessionId);

      const amountRupees = input.amountPaise / 100;
      const purchase: GiftCardPurchase = {
        amountPaise: input.amountPaise,
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName,
        senderName: input.senderName,
        message: input.message ?? null,
        sendAt: input.sendAt ? new Date(input.sendAt).toISOString() : null,
      };

      /**
       * Never merged with an existing line, unlike a poster.
       *
       * Two cards of the same value can be going to two different people with
       * two different messages. Quantity is fixed at one for the same reason:
       * "3 × ₹1000 to Asha" would have to mean three codes, and three codes are
       * three lines.
       */
      const [item] = await db
        .insert(cartItems)
        .values({
          cartId: cart.id,
          lineType: "gift_card",
          productId: null,
          variantId: null,
          giftCardPurchase: purchase,
          quantity: 1,
          // Priced from what the customer typed. There is no catalogue row to
          // re-resolve this from, which is the whole reason the column exists.
          unitPrice: amountRupees.toFixed(2),
          framePrice: "0.00",
          lineTotal: amountRupees.toFixed(2),
        })
        .returning();

      await updateCartTotals(cart.id);
      await invalidateCartCache(cart.id);

      return c.json({ message: "Gift card added to cart", item }, 201);
    } catch (error) {
      console.error("Error adding gift card to cart:", error);
      return c.json({ error: "Failed to add gift card to cart" }, 500);
    }
  },
);

// ============================================================================
// PATCH /api/cart/items/:id - Update Cart Item
// ============================================================================

cartApp.patch(
  "/items/:id",
  zValidator("json", updateCartItemSchema),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const userId = user?.id || null;
    const sessionId = getCookie(c, GUEST_CART_COOKIE) || null;
    const input = c.req.valid("json");

    // Validate UUID format
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return c.json({ error: "Invalid item ID format" }, 400);
    }

    try {
      // Get the cart item with cart info
      const items = await db
        .select({
          cartItem: cartItems,
          cart: carts,
        })
        .from(cartItems)
        .innerJoin(carts, eq(cartItems.cartId, carts.id))
        .where(eq(cartItems.id, id))
        .limit(1);

      if (!items[0]) {
        return c.json({ error: "Cart item not found" }, 404);
      }

      const { cartItem, cart } = items[0];

      // Verify cart ownership
      const isOwner = userId
        ? cart.userId === userId
        : cart.sessionId === sessionId;

      if (!isOwner) {
        return c.json({ error: "Cart item not found" }, 404);
      }

      /**
       * A gift card line is not editable, only removable (#579).
       *
       * Quantity would have to mean "how many codes", and each code needs its
       * own recipient and message — so a second card is a second line, added
       * through `POST /api/cart/gift-cards`. A frame on stored value is
       * meaningless, and the value itself is the customer's typed amount:
       * letting it be patched here would be an endpoint for editing money.
       */
      if (cartItem.lineType === "gift_card") {
        if (input.isSavedForLater !== undefined) {
          await db
            .update(cartItems)
            .set({ isSavedForLater: input.isSavedForLater })
            .where(eq(cartItems.id, id));
          await updateCartTotals(cart.id);
          await invalidateCartCache(cart.id);

          const [saved] = await db
            .select()
            .from(cartItems)
            .where(eq(cartItems.id, id))
            .limit(1);
          return c.json({ message: "Cart item updated", item: saved });
        }

        return c.json(
          {
            error:
              "A gift card line cannot be changed. Remove it and add another to buy a different card.",
          },
          400,
        );
      }

      // Build update object
      const updates: Partial<typeof cartItems.$inferInsert> = {};

      if (input.quantity !== undefined) {
        updates.quantity = input.quantity;
      }

      if (input.isSavedForLater !== undefined) {
        updates.isSavedForLater = input.isSavedForLater;
      }

      if (input.customizations !== undefined) {
        updates.customizations = input.customizations as CartItemCustomizations;
      }

      // Handle frame update
      let newFramePrice = cartItem.framePrice;
      if (input.frameId !== undefined) {
        if (input.frameId === null) {
          updates.frameId = null;
          newFramePrice = "0.00";
        } else {
          // Validate new frame
          const frame = await db
            .select({
              id: frames.id,
              priceModifier: frames.priceModifier,
              priceAddition: frames.priceAddition,
              isActive: frames.isActive,
            })
            .from(frames)
            .where(eq(frames.id, input.frameId))
            .limit(1);

          if (!frame[0] || !frame[0].isActive) {
            return c.json({ error: "Frame not found or unavailable" }, 404);
          }

          updates.frameId = input.frameId;
          // The line's own stored unit price, not the variant's current one:
          // the frame is a percentage OF THIS LINE, and re-reading the variant
          // would silently re-price a cart that has been sitting since the
          // catalogue moved.
          newFramePrice = resolveFramePrice(cartItem.unitPrice, frame[0]);
        }
        updates.framePrice = newFramePrice;
      }

      // Recalculate line total if quantity or frame changed
      if (input.quantity !== undefined || input.frameId !== undefined) {
        const quantity = input.quantity ?? cartItem.quantity;
        updates.lineTotal = calculateLineTotal(
          cartItem.unitPrice,
          newFramePrice,
          quantity
        );
      }

      // Update the cart item
      const updated = await db
        .update(cartItems)
        .set(updates)
        .where(eq(cartItems.id, id))
        .returning();

      // Update cart totals
      await updateCartTotals(cart.id);

      return c.json({
        message: "Cart item updated",
        item: updated[0],
      });
    } catch (error) {
      console.error("Error updating cart item:", error);
      return c.json({ error: "Failed to update cart item" }, 500);
    }
  }
);

// ============================================================================
// DELETE /api/cart/items/:id - Remove Cart Item
// ============================================================================

cartApp.delete("/items/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const userId = user?.id || null;
  const sessionId = getCookie(c, GUEST_CART_COOKIE) || null;

  // Validate UUID format
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return c.json({ error: "Invalid item ID format" }, 400);
  }

  try {
    // Get the cart item with cart info
    const items = await db
      .select({
        cartItem: cartItems,
        cart: carts,
      })
      .from(cartItems)
      .innerJoin(carts, eq(cartItems.cartId, carts.id))
      .where(eq(cartItems.id, id))
      .limit(1);

    if (!items[0]) {
      return c.json({ error: "Cart item not found" }, 404);
    }

    const { cart } = items[0];

    // Verify cart ownership
    const isOwner = userId
      ? cart.userId === userId
      : cart.sessionId === sessionId;

    if (!isOwner) {
      return c.json({ error: "Cart item not found" }, 404);
    }

    // Delete the cart item
    await db.delete(cartItems).where(eq(cartItems.id, id));

    // Update cart totals
    await updateCartTotals(cart.id);

    return c.json({
      message: "Cart item removed",
    });
  } catch (error) {
    console.error("Error removing cart item:", error);
    return c.json({ error: "Failed to remove cart item" }, 500);
  }
});

// ============================================================================
// DELETE /api/cart - Clear Cart
// ============================================================================

cartApp.delete("/", async (c) => {
  const user = c.get("user");
  const userId = user?.id || null;
  const sessionId = getCookie(c, GUEST_CART_COOKIE) || null;

  if (!userId && !sessionId) {
    return c.json({ error: "No cart found" }, 404);
  }

  try {
    // Find the active cart
    let cart = null;

    if (userId) {
      const userCarts = await db
        .select()
        .from(carts)
        .where(and(eq(carts.userId, userId), eq(carts.isActive, true)))
        .limit(1);
      cart = userCarts[0];
    } else if (sessionId) {
      const guestCarts = await db
        .select()
        .from(carts)
        .where(and(eq(carts.sessionId, sessionId), eq(carts.isActive, true)))
        .limit(1);
      cart = guestCarts[0];
    }

    if (!cart) {
      return c.json({ error: "No cart found" }, 404);
    }

    // Delete all cart items (not saved for later)
    await db
      .delete(cartItems)
      .where(
        and(eq(cartItems.cartId, cart.id), eq(cartItems.isSavedForLater, false))
      );

    // Update cart totals
    await updateCartTotals(cart.id);

    return c.json({
      message: "Cart cleared",
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return c.json({ error: "Failed to clear cart" }, 500);
  }
});

// Export the router
export { cartApp };
export default cartApp;
