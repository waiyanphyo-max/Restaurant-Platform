import { describe, expect, it } from "vitest";
import { ApiProtocolError } from "@restaurant-platform/api-client";
import type { MenuProductDto, StaffOrderOptions } from "@restaurant-platform/shared-types";
import { counterOrderEstimate, counterOrderLine, counterOrderReceipt, counterOrderRequest } from "./counter-order";

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

  it("estimates from actual variant and option quantities without putting prices in the request", () => {
    expect(counterOrderEstimate([product], [validLine])).toBe(10000);
    expect(counterOrderEstimate([{ ...product, variants: [{ ...product.variants[0], price: null }] }], [validLine])).toBeNull();
    expect(counterOrderEstimate([{ ...product, variants: [{ ...product.variants[0], price: Number.MAX_SAFE_INTEGER }] }], [validLine])).toBeNull();
    expect(counterOrderEstimate([], [validLine])).toBeNull();
  });

  it("rejects obsolete optional choices and enforces instruction limits even outside the input control", () => {
    const optional = { ...product, modifierGroups: [{ ...product.modifierGroups[0], required: false, minSelections: 0 }] };
    expect(() => counterOrderLine(optional, "large", "1", { unavailable: "1" }, "")).toThrow("selected modifier is unavailable");
    expect(() => counterOrderLine(product, "large", "1", { egg: "1" }, "x".repeat(501))).toThrow("500 characters");
    expect(() => counterOrderRequest(options, [product], "TAKEAWAY", "", [validLine], "x".repeat(501))).toThrow("500 characters");
  });
});

const receipt = { orderId: "00000000-0000-4000-8000-000000000201", orderNumber: "SERVER-0042", orderType: "TAKEAWAY", orderChannel: "STAFF",
  status: "PENDING", currency: "MMK", subtotal: 8200, totalAmount: 8200,
  queueTicketId: "00000000-0000-4000-8000-000000000202", queueNumber: 42, queueDisplayCode: "A042", paymentStatus: "PENDING" };

describe("staff receipt confirmation", () => {
  it("accepts a complete pending receipt with actual queue data or an explicit absent queue", () => {
    expect(counterOrderReceipt(receipt, "TAKEAWAY")).toEqual(receipt);
    const dineIn = { ...receipt, orderType: "DINE_IN", queueTicketId: null, queueNumber: null, queueDisplayCode: null };
    expect(counterOrderReceipt(dineIn, "DINE_IN")).toEqual(dineIn);
    expect(counterOrderReceipt({ ...dineIn, orderType: "TAKEAWAY", subtotal: 0, totalAmount: 0 }, "TAKEAWAY").totalAmount).toBe(0);
  });
  it.each([
    null, {}, [], { ...receipt, orderId: "../other-order" }, { ...receipt, orderNumber: "" }, { ...receipt, orderNumber: "order\nprivate" },
    { ...receipt, orderType: "DINE_IN" }, { ...receipt, orderChannel: "CUSTOMER_APP" }, { ...receipt, status: "ACCEPTED" },
    { ...receipt, paymentStatus: "PAID" }, { ...receipt, currency: "" }, { ...receipt, currency: "mmk" },
    { ...receipt, subtotal: -1 }, { ...receipt, totalAmount: 8200.5 }, { ...receipt, totalAmount: Number.NaN },
    { ...receipt, subtotal: Number.MAX_SAFE_INTEGER + 1, totalAmount: Number.MAX_SAFE_INTEGER + 1 },
    { ...receipt, totalAmount: 8300 }, { ...receipt, queueTicketId: null }, { ...receipt, queueTicketId: "not-a-ticket" },
    { ...receipt, queueNumber: 0 }, { ...receipt, queueDisplayCode: " " }
  ])("rejects malformed or contradictory JSON %j as an uncertain creation", value => {
    expect(() => counterOrderReceipt(value, "TAKEAWAY")).toThrow(ApiProtocolError);
  });
  it("rejects queue fields on a dine-in receipt and missing nullable fields", () => {
    expect(() => counterOrderReceipt({ ...receipt, orderType: "DINE_IN" }, "DINE_IN")).toThrow(ApiProtocolError);
    expect(() => counterOrderReceipt({ ...receipt, queueTicketId: undefined, queueNumber: undefined, queueDisplayCode: undefined }, "TAKEAWAY")).toThrow(ApiProtocolError);
  });
});
