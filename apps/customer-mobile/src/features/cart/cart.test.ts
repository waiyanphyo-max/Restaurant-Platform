import { describe, expect, it } from "vitest";
import type { CreateOrderItemRequest, MenuProductDto, OrderItemDetailDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { prepareCartLine, productAvailable, productPriceRange, rebuildCart } from "./cart";

const product: MenuProductDto = {
  id: "noodles", name: "Noodles", description: "Rice noodles", available: true, imageUrl: null, price: null,
  trackStock: true, stockQuantity: 3,
  variants: [
    { id: "large", name: "Large", price: 4_000, imageUrl: null, available: true },
    { id: "small", name: "Small", price: 2_500, imageUrl: null, available: false }
  ],
  modifierGroups: [{
    id: "extra", name: "Extras", minSelections: 1, maxSelections: 1, required: true,
    options: [{ id: "egg", name: "Egg", available: true, additionalPrice: 400 },
      { id: "greens", name: "Greens", available: true, additionalPrice: 200 }]
  }]
};

const selection: CreateOrderItemRequest = {
  productId: product.id, variantId: "large", quantity: 2, modifiers: [{ modifierOptionId: "egg", quantity: 2 }]
};

const menu: PublicMenuResponse = {
  restaurantId: "restaurant-a", restaurantName: "Restaurant A", slug: null, description: null, phone: null, address: null,
  logoUrl: null, currency: "MMK", categories: [{ id: "category-a", name: "Mains", displayOrder: 0, products: [product] }]
};

const previousOrderItem: OrderItemDetailDto = {
  id: "order-line-a", productId: product.id, productName: "Old name", variantId: "large", variantName: "Large",
  quantity: 2, unitPrice: 3_500, subtotal: 8_200, specialInstruction: "Old private note",
  modifiers: [{ id: "order-modifier-a", modifierOptionId: "egg", name: "Egg", quantity: 2, additionalPrice: 300 }]
};

describe("customer menu and cart", () => {
  it("computes an estimate from the current variant and modifier price per serving", () => {
    expect(productPriceRange(product)).toEqual({ min: 4_000, max: 4_000 });
    const line = prepareCartLine("cart-1", product, { ...selection, specialInstruction: "  Less oil  " }, "MMK");
    expect(line).toMatchObject({ unitPrice: 4_800, name: "Noodles", variantName: "Large", modifierNames: ["Egg × 2"],
      item: { ...selection, specialInstruction: "Less oil" } });
  });

  it("handles products with a base price and no variants or modifier groups", () => {
    const simple = { ...product, price: 2_000, variants: [], modifierGroups: [] };
    expect(prepareCartLine("cart-1", simple, { productId: simple.id, quantity: 1 }, "MMK")).toMatchObject({ unitPrice: 2_000 });
    expect(prepareCartLine("cart-1", simple, selection, "MMK")).toBeNull();
  });

  it("enforces variants, distinct attached modifier options and group limits", () => {
    expect(prepareCartLine("cart-1", product, { ...selection, variantId: "small" }, "MMK")).toBeNull();
    expect(prepareCartLine("cart-1", product, { ...selection, variantId: null }, "MMK")).toBeNull();
    for (const modifiers of [
      [], [{ modifierOptionId: "unattached", quantity: 1 }], [{ modifierOptionId: "egg", quantity: 11 }],
      [{ modifierOptionId: "egg", quantity: 1 }, { modifierOptionId: "egg", quantity: 1 }],
      [{ modifierOptionId: "egg", quantity: 1 }, { modifierOptionId: "greens", quantity: 1 }]
    ]) expect(prepareCartLine("cart-1", product, { ...selection, modifiers }, "MMK")).toBeNull();
  });

  it("handles unavailable stock and validates total quantity across separate lines while editing", () => {
    const line = prepareCartLine("cart-1", product, selection, "MMK")!;
    expect(productAvailable({ ...product, stockQuantity: 0 })).toBe(false);
    expect(productAvailable({ ...product, available: false })).toBe(false);
    expect(prepareCartLine("cart-2", product, selection, "MMK", [line])).toBeNull();
    expect(prepareCartLine("cart-1", product, { ...selection, quantity: 3 }, "MMK", [line])).toMatchObject({ item: { quantity: 3 } });
  });

  it("rebuilds historical items at current prices and copies no historical instructions", () => {
    const result = rebuildCart(menu, [previousOrderItem]);
    expect(result.unavailable).toEqual([]);
    expect(result.lines).toMatchObject([{ name: "Noodles", unitPrice: 4_800, item: { ...selection, specialInstruction: null } }]);
  });

  it("warns about changed variant, modifier and stock conditions and skips missing products", () => {
    const result = rebuildCart(menu, [previousOrderItem, previousOrderItem,
      { ...previousOrderItem, productId: "deleted", productName: "Deleted product", variantName: null },
      { ...previousOrderItem, variantId: "small", variantName: "Small" },
      { ...previousOrderItem, productName: "Removed options", variantName: null, modifiers: [] }
    ]);
    expect(result.lines).toHaveLength(1);
    expect(result.unavailable).toEqual(["Old name · Large", "Deleted product", "Old name · Small", "Removed options"]);
  });
});
