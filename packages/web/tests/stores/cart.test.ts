/**
 * Cart Store Tests
 *
 * Tests for the localStorage-persisted Zustand cart store in app/stores/cart.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useCartStore } from "../../app/stores/cart";
import type { AddToCartInput, CartItem } from "../../app/stores/cart";

const baseInput: AddToCartInput = {
  productId: "prod_1",
  variantId: "var_1",
  frameId: null,
  productTitle: "Sunset Over Jaipur",
  productSlug: "sunset-over-jaipur",
  thumbnailUrl: "https://cdn.example.com/sunset.jpg",
  sizeLabel: "24x24 inches",
  widthInches: 24,
  heightInches: 24,
  unitPrice: 1499,
  framePrice: 0,
};

function getItems(): CartItem[] {
  return useCartStore.getState().items;
}

beforeEach(() => {
  useCartStore.setState({ items: [] });
  localStorage.clear();
});

describe("Cart Store", () => {
  describe("addItem", () => {
    it("adds a new item with defaults applied", () => {
      useCartStore.getState().addItem(baseInput);

      const items = getItems();
      expect(items).toHaveLength(1);
      const item = items[0]!;
      expect(item.id).toMatch(/^cart_/);
      expect(item.productId).toBe("prod_1");
      expect(item.variantId).toBe("var_1");
      expect(item.frameId).toBeNull();
      expect(item.quantity).toBe(1);
      expect(item.framePrice).toBe(0);
      expect(item.isAiGenerated).toBe(false);
      expect(item.addedAt).toBeTruthy();
    });

    it("respects an explicit quantity", () => {
      useCartStore.getState().addItem({ ...baseInput, quantity: 3 });
      expect(getItems()[0]!.quantity).toBe(3);
    });

    it("merges quantity when product, variant, and frame match", () => {
      const { addItem } = useCartStore.getState();
      addItem({ ...baseInput, quantity: 1 });
      addItem({ ...baseInput, quantity: 2 });

      const items = getItems();
      expect(items).toHaveLength(1);
      expect(items[0]!.quantity).toBe(3);
    });

    it("treats a missing frameId as null when merging", () => {
      const { addItem } = useCartStore.getState();
      addItem({ ...baseInput, frameId: null });
      const { frameId: _omitted, ...withoutFrame } = baseInput;
      addItem(withoutFrame);

      expect(getItems()).toHaveLength(1);
      expect(getItems()[0]!.quantity).toBe(2);
    });

    it("creates a separate line for a different frame", () => {
      const { addItem } = useCartStore.getState();
      addItem(baseInput);
      addItem({
        ...baseInput,
        frameId: "frame_oak",
        frameName: "Oak",
        frameType: "wood",
        framePrice: 499,
      });

      const items = getItems();
      expect(items).toHaveLength(2);
      expect(items[1]!.frameId).toBe("frame_oak");
      expect(items[1]!.framePrice).toBe(499);
    });

    it("creates a separate line for a different variant of the same product", () => {
      const { addItem } = useCartStore.getState();
      addItem(baseInput);
      addItem({ ...baseInput, variantId: "var_2", sizeLabel: "36x36 inches" });

      expect(getItems()).toHaveLength(2);
    });

    it("stores AI generation details when provided", () => {
      useCartStore.getState().addItem({
        ...baseInput,
        isAiGenerated: true,
        aiDetails: {
          generationId: "gen_1",
          prompt: "a foggy mountain valley at dawn",
          stylePreset: "watercolor",
        },
      });

      const item = getItems()[0]!;
      expect(item.isAiGenerated).toBe(true);
      expect(item.aiDetails?.generationId).toBe("gen_1");
    });
  });

  describe("updateQuantity", () => {
    it("updates the quantity of the matching item", () => {
      useCartStore.getState().addItem(baseInput);
      const id = getItems()[0]!.id;

      useCartStore.getState().updateQuantity(id, 5);
      expect(getItems()[0]!.quantity).toBe(5);
    });

    it("removes the item when quantity is 0", () => {
      useCartStore.getState().addItem(baseInput);
      const id = getItems()[0]!.id;

      useCartStore.getState().updateQuantity(id, 0);
      expect(getItems()).toHaveLength(0);
    });

    it("removes the item when quantity is negative", () => {
      useCartStore.getState().addItem(baseInput);
      const id = getItems()[0]!.id;

      useCartStore.getState().updateQuantity(id, -2);
      expect(getItems()).toHaveLength(0);
    });

    it("leaves other items untouched", () => {
      const { addItem } = useCartStore.getState();
      addItem(baseInput);
      addItem({ ...baseInput, variantId: "var_2" });
      const [first, second] = getItems();

      useCartStore.getState().updateQuantity(first!.id, 4);
      expect(getItems().find((i) => i.id === second!.id)?.quantity).toBe(1);
    });

    it("does nothing for an unknown id", () => {
      useCartStore.getState().addItem(baseInput);
      useCartStore.getState().updateQuantity("cart_nope", 9);

      expect(getItems()).toHaveLength(1);
      expect(getItems()[0]!.quantity).toBe(1);
    });
  });

  describe("updateFrame", () => {
    it("sets frame details on the item", () => {
      useCartStore.getState().addItem(baseInput);
      const id = getItems()[0]!.id;

      useCartStore.getState().updateFrame(id, "frame_oak", "Oak", "wood", 499);

      const item = getItems()[0]!;
      expect(item.frameId).toBe("frame_oak");
      expect(item.frameName).toBe("Oak");
      expect(item.frameType).toBe("wood");
      expect(item.framePrice).toBe(499);
    });

    it("clears frame details when frameId is null", () => {
      useCartStore.getState().addItem({
        ...baseInput,
        frameId: "frame_oak",
        frameName: "Oak",
        frameType: "wood",
        framePrice: 499,
      });
      const id = getItems()[0]!.id;

      useCartStore.getState().updateFrame(id, null);

      const item = getItems()[0]!;
      expect(item.frameId).toBeNull();
      expect(item.frameName).toBeUndefined();
      expect(item.frameType).toBeUndefined();
      expect(item.framePrice).toBe(0);
    });
  });

  describe("removeItem / clearCart", () => {
    it("removes only the matching item", () => {
      const { addItem } = useCartStore.getState();
      addItem(baseInput);
      addItem({ ...baseInput, variantId: "var_2" });
      const id = getItems()[0]!.id;

      useCartStore.getState().removeItem(id);

      expect(getItems()).toHaveLength(1);
      expect(getItems()[0]!.variantId).toBe("var_2");
    });

    it("clearCart empties the cart", () => {
      const { addItem } = useCartStore.getState();
      addItem(baseInput);
      addItem({ ...baseInput, variantId: "var_2" });

      useCartStore.getState().clearCart();
      expect(getItems()).toHaveLength(0);
    });
  });

  describe("computed getters", () => {
    it("getItemCount sums quantities across items", () => {
      const { addItem } = useCartStore.getState();
      addItem({ ...baseInput, quantity: 2 });
      addItem({ ...baseInput, variantId: "var_2", quantity: 3 });

      expect(useCartStore.getState().getItemCount()).toBe(5);
    });

    it("getSubtotal includes frame price per unit", () => {
      const { addItem } = useCartStore.getState();
      addItem({ ...baseInput, quantity: 2 }); // 2 * 1499 = 2998
      addItem({
        ...baseInput,
        variantId: "var_2",
        frameId: "frame_oak",
        framePrice: 500,
        quantity: 1,
      }); // 1 * (1499 + 500) = 1999

      expect(useCartStore.getState().getSubtotal()).toBe(2998 + 1999);
    });

    it("getSubtotal is 0 for an empty cart", () => {
      expect(useCartStore.getState().getSubtotal()).toBe(0);
    });

    it("getItemTotal returns (unit + frame) * quantity", () => {
      useCartStore.getState().addItem({
        ...baseInput,
        frameId: "frame_oak",
        framePrice: 500,
        quantity: 3,
      });
      const id = getItems()[0]!.id;

      expect(useCartStore.getState().getItemTotal(id)).toBe((1499 + 500) * 3);
    });

    it("getItemTotal returns 0 for an unknown id", () => {
      expect(useCartStore.getState().getItemTotal("cart_nope")).toBe(0);
    });

    it("findExistingItem matches on product + variant + frame", () => {
      useCartStore.getState().addItem(baseInput);

      const found = useCartStore.getState().findExistingItem("prod_1", "var_1", null);
      expect(found).toBeDefined();

      const notFound = useCartStore.getState().findExistingItem("prod_1", "var_1", "frame_oak");
      expect(notFound).toBeUndefined();
    });
  });

  describe("localStorage persistence", () => {
    it("persists items under the masonart-cart-storage key", async () => {
      useCartStore.getState().addItem({ ...baseInput, quantity: 2 });

      // zustand persist writes synchronously with localStorage, but allow a tick
      await Promise.resolve();

      const raw = localStorage.getItem("masonart-cart-storage");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state.items).toHaveLength(1);
      expect(parsed.state.items[0].productId).toBe("prod_1");
      expect(parsed.state.items[0].quantity).toBe(2);
    });

    it("only persists items, not actions or getters", async () => {
      useCartStore.getState().addItem(baseInput);
      await Promise.resolve();

      const parsed = JSON.parse(localStorage.getItem("masonart-cart-storage")!);
      expect(Object.keys(parsed.state)).toEqual(["items"]);
    });
  });
});
