import { describe, expect, it } from "vitest";
import type { MenuProductDto, StaffOrderOptions } from "@restaurant-platform/shared-types";
import { counterOrderLine, counterOrderRequest } from "./counter-order";

const product: MenuProductDto = {
  id: "rice", name: "Rice", description: null, price: 2000, imageUrl: null, available: true, trackStock: true, stockQuantity: 5,
  variants: [
    { id: "large", name: "Large", price: 3500, imageUrl: null, available: true },
    { id: "small", name: "Small", price: 2000, imageUrl: null, available: false }
  ],
  modifierGroups: [{ id: "extras", name: "Extras", required: true, minSelections: 1, maxSelections: 1,
    options: [
      { id: "egg", name: "Egg", additionalPrice: 500, available: true },
      { id: "sauce", name: "Sauce", additionalPrice: 300, available: true },
      { id: "shrimp", name: "Shrimp", additionalPrice: 700, available: false }
    ] }]
};
const options: StaffOrderOptions = { dineInEnabled: true, takeawayEnabled: true, tables: [{ id: "table", tableLabel: "Table 1" }] };
const validLine = counterOrderLine(product, "large", "2", { egg: "3" }, "  No onions  ");

describe("counter order form request", () => {
  it("submits table, product, variant, modifier quantities, and notes with no client prices or actor identity", () => {
    expect(counterOrderRequest(options, [product], "DINE_IN", "table", [validLine], "  Birthday  ")).toEqual({
      orderType: "DINE_IN", tableId: "table", note: "Birthday",
      items: [{ productId: "rice", variantId: "large", quantity: 2, modifiers: [{ modifierOptionId: "egg", quantity: 3 }], specialInstruction: "No onions" }]
    });
    expect(counterOrderRequest(options, [product], "TAKEAWAY", "table", [validLine], "")).toMatchObject({ tableId: null, note: null });
  });

  it("requires an available variant and counts selected modifier options separately from their quantities", () => {
    expect(() => counterOrderLine(product, "", "1", { egg: "2" }, "")).toThrow("Select an available variant");
    expect(() => counterOrderLine(product, "small", "1", { egg: "2" }, "")).toThrow("Select an available variant");
    expect(() => counterOrderLine(product, "large", "1", { shrimp: "1" }, "")).toThrow("Extras requires");
    expect(() => counterOrderLine(product, "large", "1", { egg: "1", sauce: "1" }, "")).toThrow("Extras requires");
    expect(() => counterOrderLine(product, "large", "1", { egg: "11" }, "")).toThrow("Egg must be a whole number");
    expect(validLine.modifierLabels).toEqual(["Egg × 3"]);
  });

  it("rejects invalid quantities, disabled order types, and inactive or absent tables", () => {
    expect(() => counterOrderLine(product, "large", "1.5", { egg: "1" }, "")).toThrow("Item quantity must be a whole number");
    expect(() => counterOrderRequest({ ...options, takeawayEnabled: false }, [product], "TAKEAWAY", "", [validLine], "")).toThrow("order type is currently unavailable");
    expect(() => counterOrderRequest(options, [product], "DINE_IN", "other-table", [validLine], "")).toThrow("Select an active dining table");
  });

  it("rejects combined tracked-stock demand and a cart line with a now-unavailable modifier", () => {
    expect(() => counterOrderRequest(options, [product], "TAKEAWAY", "", [validLine, validLine, validLine], "")).toThrow("exceeds available stock");
    const updatedProduct = { ...product, modifierGroups: [] };
    expect(() => counterOrderRequest(options, [updatedProduct], "TAKEAWAY", "", [validLine], "")).toThrow("modifier for Rice is no longer available");
  });
});
