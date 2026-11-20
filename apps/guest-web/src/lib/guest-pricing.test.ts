import { describe, expect, it } from "vitest";
import type { MenuProductDto } from "@restaurant-platform/shared-types";
import { selectionEstimate, sumEstimates } from "./guest-pricing";

const product: MenuProductDto = {
  id: "11111111-1111-4111-8111-111111111111", name: "Fictional bowl", description: null,
  price: 2000, imageUrl: null, available: true, trackStock: true, stockQuantity: 5,
  variants: [{ id: "22222222-2222-4222-8222-222222222222", name: "Large", price: 3000, imageUrl: null, available: true }],
  modifierGroups: [{ id: "33333333-3333-4333-8333-333333333333", name: "Spice", required: true, minSelections: 1, maxSelections: 1,
    options: [{ id: "44444444-4444-4444-8444-444444444444", name: "Mild", additionalPrice: 500, available: true }] }],
};
const selection = { variantId: product.variants[0].id, quantity: 2,
  modifiers: [{ modifierOptionId: product.modifierGroups[0].options[0].id, quantity: 3 }] };

describe("guest price presentation follows current menu values", () => {
  it("multiplies priced modifier units per serving before line quantity, as Spring does", () => {
    expect(selectionEstimate(product, selection)).toBe((3000 + 500 * 3) * 2);
    expect(selectionEstimate({ ...product, variants: [] }, { ...selection, variantId: null })).toBe((2000 + 500 * 3) * 2);
  });
  it("keeps an independent non-red restaurant's simple and optional configuration independent", () => {
    const other: MenuProductDto = { ...product, id: "55555555-5555-4555-8555-555555555555", name: "Blue kitchen soup", price: 85,
      trackStock: false, stockQuantity: null, variants: [], modifierGroups: [] };
    expect(selectionEstimate(other, { quantity: 3 })).toBe(255);
    expect(selectionEstimate({ ...other, modifierGroups: [{ ...product.modifierGroups[0], required: false, minSelections: 0 }] }, { quantity: 2 })).toBe(170);
  });
  it("shares existing validation for required choices, unavailable options, variants and stock changes", () => {
    expect(selectionEstimate(product, { ...selection, modifiers: [] })).toBeNull();
    expect(selectionEstimate(product, { ...selection, variantId: null })).toBeNull();
    expect(selectionEstimate({ ...product, available: false }, selection)).toBeNull();
    expect(selectionEstimate({ ...product, stockQuantity: 1 }, selection)).toBeNull();
    expect(selectionEstimate({ ...product, variants: [{ ...product.variants[0], available: false }] }, selection)).toBeNull();
    expect(selectionEstimate({ ...product, modifierGroups: [{ ...product.modifierGroups[0], options: [{ ...product.modifierGroups[0].options[0], available: false }] }] }, selection)).toBeNull();
  });
  it("does not invent prices for missing records or unsafe totals", () => {
    expect(selectionEstimate({ ...product, variants: [], price: null, modifierGroups: [] }, { quantity: 1 })).toBeNull();
    expect(selectionEstimate({ ...product, variants: [], price: Number.MAX_SAFE_INTEGER, modifierGroups: [] }, { quantity: 2 })).toBeNull();
    expect(sumEstimates([9000, 85])).toBe(9085);
    expect(sumEstimates([9000, null])).toBeNull();
    expect(sumEstimates([])).toBeNull();
    expect(sumEstimates([Number.MAX_SAFE_INTEGER, 1])).toBeNull();
  });
});
