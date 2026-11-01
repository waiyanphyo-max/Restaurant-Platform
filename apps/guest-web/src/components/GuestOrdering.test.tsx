import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuProductDto } from "@restaurant-platform/shared-types";
import { initialOrderState, type GuestOrderState } from "@/lib/guest-order";
import { GuestOrdering, receiptOrderDate } from "./GuestOrdering";
import { ProductConfigurator } from "./ProductConfigurator";

const session = vi.hoisted(() => ({ current: {} as unknown }));
vi.mock("./GuestSession", () => ({ useGuestSession: () => session.current }));

const product: MenuProductDto = {
  id: "11111111-1111-4111-8111-111111111111", name: "Tea", description: null,
  price: null, imageUrl: null, available: true, trackStock: true, stockQuantity: 3,
  variants: [{ id: "22222222-2222-4222-8222-222222222222", name: "Regular", price: 2000, imageUrl: null, available: true },
    { id: "33333333-3333-4333-8333-333333333333", name: "Large", price: 3000, imageUrl: null, available: false }],
  modifierGroups: [{ id: "44444444-4444-4444-8444-444444444444", name: "Milk", required: true, minSelections: 1, maxSelections: 1,
    options: [{ id: "55555555-5555-4555-8555-555555555555", name: "Oat", additionalPrice: 500, available: true }] }],
};

function setSession(state: Partial<GuestOrderState>, locale = "en") {
  session.current = { locale, state: { ...initialOrderState, ...state }, actions: {
    add: vi.fn(), remove: vi.fn(), setQuantity: vi.fn(), checkout: vi.fn(), retryValidation: vi.fn(), refresh: vi.fn(), enableSound: vi.fn(),
  } };
}

beforeEach(() => setSession({ phase: "ready", kind: "COMMON_QR" }));

describe("guest order controls", () => {
  it("prevents an empty cart from submitting", () => {
    const html = renderToStaticMarkup(<GuestOrdering currency="MMK" />);
    expect(html).toContain("Your cart is empty");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Place order<\/button>/);
  });

  it("locks all cart edits after an ambiguous response while offering only a safe retry", () => {
    setSession({ phase: "uncertain", kind: "TABLE_QR", cart: [{ id: "line", name: "Tea", productId: product.id,
      variantId: product.variants[0].id, variantName: "Regular", quantity: 1,
      specialInstruction: "No ice", modifiers: [], modifierNames: [] }] });
    const html = renderToStaticMarkup(<GuestOrdering currency="MMK" />);
    expect(html).toContain("Retry the same order safely");
    expect(html).toMatch(/<input[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Remove<\/button>/);
    expect(html).not.toMatch(/<button[^>]*>Place order<\/button>/);
  });

  it("renders Burmese labels without changing catalog names", () => {
    setSession({ phase: "ready" }, "my");
    const html = renderToStaticMarkup(<ProductConfigurator product={product} currency="MMK" />);
    expect(html).toContain("အော်ဒါထဲ ထည့်ရန်");
    expect(html).toContain("Regular");
    expect(html).toContain("Milk");
  });

  it("refuses retry after the idempotency retention window and asks for restaurant confirmation", () => {
    setSession({ phase: "uncertain", error: "expired", cart: [{ id: "line", name: "Tea", productId: product.id,
      variantId: product.variants[0].id, variantName: "Regular", quantity: 1,
      specialInstruction: "", modifiers: [], modifierNames: [] }] });
    const html = renderToStaticMarkup(<GuestOrdering currency="MMK" />);
    expect(html).toContain("safe retry window has ended");
    expect(html).toContain("confirm whether this order was received");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retry the same order safely<\/button>/);
  });

  it("requires a variant and caps notes, stock and modifier quantity at backend limits", () => {
    const html = renderToStaticMarkup(<ProductConfigurator product={product} currency="MMK" />);
    expect(html).toMatch(/<select[^>]*required=""/);
    expect(html).toContain('value="33333333-3333-4333-8333-333333333333" disabled=""');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('min="1" max="3"');
    expect(html).toContain('min="0" max="10"');
  });

  it("keeps the product form disabled until the QR is verified", () => {
    setSession({ phase: "invalid", error: "invalid-qr" });
    const html = renderToStaticMarkup(<ProductConfigurator product={product} currency="MMK" />);
    expect(html).toContain('<fieldset disabled="" class="order-fields">');
  });
});

describe("guest confirmation", () => {
  const receipt = { orderId: "order", orderNumber: "ORD-20261101-A1B2C3", orderType: "TAKEAWAY", orderChannel: "COMMON_QR",
    status: "PENDING", currency: "MMK", subtotal: 7600, deliveryFee: 0, discountAmount: 0, totalAmount: 7600,
    queue: { ticketId: "ticket", queueNumber: 7, displayCode: "007", status: "WAITING" } };

  it("uses backend amounts, date-scoped queue information and permission-gated sound controls", () => {
    setSession({ phase: "confirmed", kind: "COMMON_QR", receipt });
    const html = renderToStaticMarkup(<GuestOrdering currency="USD" />);
    expect(html).toContain("Order received");
    expect(html).toContain("007");
    expect(html).toContain('dateTime="2026-11-01"');
    expect(html).toContain("7,600");
    expect(html).toContain("MMK");
    expect(html).toContain("Enable pickup sound");
    expect(html).not.toContain("Place order");
    expect(html).not.toContain("trackingToken");
    expect(html).not.toContain("qrToken");
  });

  it("shows a Table QR's supported initial status and verified table assignment", () => {
    setSession({ phase: "confirmed", kind: "TABLE_QR", receipt: { ...receipt, orderType: "DINE_IN", orderChannel: "TABLE_QR", queue: null },
      context: { restaurantId: "restaurant", kind: "TABLE_QR", tableId: "table", tableNumber: "A12" } });
    const html = renderToStaticMarkup(<GuestOrdering currency="MMK" />);
    expect(html).toContain("A12");
    expect(html).toContain("Ask restaurant staff for updates");
    expect(html).not.toContain("checks for pickup updates automatically");
    expect(html).not.toContain("Enable pickup sound");
  });

  it("renders live status and recovering-network text without losing confirmation", () => {
    setSession({ phase: "confirmed", kind: "COMMON_QR", receipt, trackingError: true,
      tracking: { ticketId: "ticket", queueNumber: 7, displayCode: "007", queueStatus: "CALLED", orderNumber: receipt.orderNumber,
        orderStatus: "READY", createdAt: "2026-10-31T19:00:00Z", readyAt: null, calledAt: null, completedAt: null } });
    const html = renderToStaticMarkup(<GuestOrdering currency="MMK" />);
    expect(html).toContain("Please collect your order");
    expect(html).toContain("Ready for pickup");
    expect(html).toContain("reconnect automatically");
    expect(html).toContain('dateTime="2026-11-01"');
  });

  it("takes the business date from the order number and refuses malformed dates", () => {
    expect(receiptOrderDate("ORD-20261101-XYZ")).toBe("2026-11-01");
    expect(receiptOrderDate("ORD-20260231-XYZ")).toBeNull();
    expect(receiptOrderDate("2026-11-01")).toBeNull();
  });
});
