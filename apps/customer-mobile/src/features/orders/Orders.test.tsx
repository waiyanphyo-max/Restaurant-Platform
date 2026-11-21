import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerOrderDetailDto, PublicMenuResponse } from "@restaurant-platform/shared-types";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0,
  query: {} as { status: string; data?: unknown; failure?: unknown }, language: "en",
  reload: vi.fn(), navigate: vi.fn(), push: vi.fn(), replaceCart: vi.fn(), cancel: vi.fn(), getOrder: vi.fn(), menu: vi.fn(),
  items: [] as unknown[], effects: [] as (() => void | (() => void))[],
  focus: null as (() => void | (() => void)) | null, addListener: vi.fn(), params: { orderId: "owned-order" }
  , queryFn: null as null | ((signal: AbortSignal) => Promise<unknown>)
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const index = harness.stateIndex++; if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value; }]; },
  useRef(initial: unknown) { return harness.refs[harness.refIndex++] ??= { current: initial }; },
  useEffect(effect: () => void | (() => void)) { harness.effects.push(effect); },
  useCallback<T>(callback: T) { return callback; }
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => harness.params, useRouter: () => ({ navigate: harness.navigate, push: harness.push }),
  useFocusEffect: (effect: () => void | (() => void)) => { harness.focus = effect; } }));
vi.mock("react-native", () => ({ AppState: { currentState: "active", addEventListener: harness.addListener } }));
vi.mock("../../api", () => ({ getCustomerApi: () => ({ cancelOrder: harness.cancel, getOrder: harness.getOrder }), getCustomerPublicApi: () => ({ getPublicMenu: harness.menu }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (query: (signal: AbortSignal) => Promise<unknown>) => {
  harness.queryFn = query; return { state: harness.query, reload: harness.reload };
} }));
vi.mock("../../i18n", () => ({ localize: (language: string, en: string, my: string) => language === "en" ? en : my,
  queryStateLabel: (status: string) => status, useCustomerLanguage: () => harness.language,
  useCustomerText: () => (en: string, my: string) => harness.language === "en" ? en : my }));
vi.mock("../../components/ui", () => ({ Action: "Action", Badge: "Badge", Body: "Body", Card: "Card", ConfirmDialog: "ConfirmDialog", Page: "Page", StateView: "StateView", Status: "Status" }));
vi.mock("../addresses/DestinationPin", () => ({ DestinationPin: "DestinationPin" }));
vi.mock("../cart/CartProvider", () => ({ useCustomerCart: () => ({ items: harness.items, replace: harness.replaceCart }) }));

import Orders from "../../../app/(store)/orders";
import OrderDetail from "../../../app/(store)/order/[orderId]";

const historical = { id: "item", productId: "product", productName: "Historical noodles", variantId: null, variantName: null,
  quantity: 2, unitPrice: 2000, subtotal: 4000, specialInstruction: "Original note", modifiers: [] };
const order: CustomerOrderDetailDto = {
  id: "owned-order", restaurantId: "restaurant-a", orderNumber: "A-100", orderType: "DELIVERY", orderChannel: "CUSTOMER_APP",
  status: "PENDING", subtotal: 4000, deliveryFee: 500, discountAmount: 0, totalAmount: 4500, currency: "MMK", createdAt: "2026-11-21T09:00:00Z", updatedAt: "2026-11-21T09:00:00Z",
  canCancel: true, deliveryName: "Original recipient", deliveryPhone: "09123456789", deliveryAddress: "Original street, Township A", deliveryNote: "Original gate",
  deliveryLatitude: null, deliveryLongitude: null, deliveryCity: "Region A", deliveryTownship: "Township A", deliveryLocationSource: "MANUAL_TEXT", deliveryAddressId: null, destinationConfirmedAt: "2026-11-21T09:00:00Z",
  items: [historical], statusHistory: [{ status: "PENDING", changedAt: "2026-11-21T09:00:00Z" }], delivery: null,
  payments: [{ id: "payment", method: "CASH_ON_DELIVERY", status: "PENDING", amount: 4500, paidAt: null, createdAt: "2026-11-21T09:00:00Z" }]
};
const menu: PublicMenuResponse = { restaurantId: "restaurant-a", restaurantName: "Restaurant A", slug: null, description: null, phone: null, address: null, logoUrl: null,
  currency: "MMK", categories: [{ id: "mains", name: "Mains", displayOrder: 0, products: [{ id: "product", name: "Current noodles", description: null, imageUrl: null,
    price: 3500, stockQuantity: null, available: true, trackStock: false, variants: [], modifierGroups: [] }] }] };
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function render(detail = true) {
  harness.stateIndex = 0; harness.refIndex = 0; harness.effects = [];
  const route = detail ? OrderDetail() : Orders();
  const child = elements(route).find(el => typeof el.type === "function" && el.type.name === "OrderDetails");
  return child ? (child.type as (props: unknown) => ReactNode)(child.props) : route;
}
function action(title: string) { return elements(render()).find(el => el.type === "Action" && el.props.title === title)!.props as { onPress(): void }; }
function dialog(title: string) { return elements(render()).find(el => el.type === "ConfirmDialog" && el.props.title === title)!.props as { visible: boolean; onConfirm(): void; onCancel(): void }; }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";
}

describe("owned order lifecycle UX", () => {
  beforeEach(() => {
    vi.clearAllMocks(); harness.states = []; harness.refs = []; harness.language = "en"; harness.items = [{ productId: "existing" }];
    harness.query = { status: "ready", data: structuredClone(order) }; harness.focus = null;
    harness.menu.mockResolvedValue(menu); harness.cancel.mockResolvedValue({ ...order, status: "CANCELLED", canCancel: false });
    harness.getOrder.mockResolvedValue({ ...order, status: "CANCELLED", canCancel: false });
    harness.addListener.mockReturnValue({ remove: vi.fn() });
  });
  it("renders historical items, exact amounts, destination and pending COD independently of delivery completion", () => {
    harness.query.data = { ...order, status: "COMPLETED", canCancel: false, delivery: { status: "DELIVERED", statusHistory: [] } };
    const body = text(render());
    expect(elements(render()).some(el => el.type === "Card" && el.props.title === "Historical noodles × 2")).toBe(true);
    expect(body).toContain("2,000 MMK"); expect(body).toContain("Original note");
    expect(body).toContain("Original recipient"); expect(body).toContain("not yet collected"); expect(body).not.toContain("Cash payment recorded");
    expect(harness.menu).not.toHaveBeenCalled();
  });
  it("requires explicit cancellation review and prevents duplicate submission", async () => {
    let finish!: (value: unknown) => void; harness.cancel.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    action("Cancel order").onPress(); expect(harness.cancel).not.toHaveBeenCalled();
    const review = dialog("Cancel this order?"); expect(review.visible).toBe(true); review.onConfirm(); review.onConfirm();
    expect(harness.cancel).toHaveBeenCalledTimes(1); expect(harness.cancel.mock.calls[0][0]).toBe(order.id);
    finish({ ...order, status: "CANCELLED", canCancel: false }); await tick(); expect(harness.reload).toHaveBeenCalledTimes(1);
  });
  it("honors changed server eligibility while the cancellation dialog is open", () => {
    action("Cancel order").onPress(); harness.query.data = { ...order, canCancel: false };
    const review = dialog("Cancel this order?"); expect(review.visible).toBe(false); review.onConfirm(); expect(harness.cancel).not.toHaveBeenCalled();
  });
  it("reads an uncertain cancellation before permitting another review and never retries the write", async () => {
    harness.cancel.mockRejectedValue(new Error("Lost response"));
    action("Cancel order").onPress(); const staleReview = dialog("Cancel this order?"); staleReview.onConfirm(); await tick();
    staleReview.onConfirm(); expect(harness.cancel).toHaveBeenCalledTimes(1);
    expect(elements(render()).some(el => el.type === "Action" && el.props.title === "Cancel order")).toBe(false);
    let finish!: (value: unknown) => void; harness.getOrder.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    action("Check cancellation result").onPress();
    expect(elements(render()).some(el => el.type === "Action" && el.props.title === "Cancel order")).toBe(false);
    finish({ ...order, canCancel: false, status: "CANCELLED" }); await tick();
    expect(harness.getOrder.mock.calls[0][0]).toBe(order.id); expect(harness.cancel).toHaveBeenCalledTimes(1);
    expect(elements(render()).some(el => el.type === "Action" && el.props.title === "Cancel order")).toBe(false);
  });
  it("aborts a pending cancellation when its authenticated screen unmounts", async () => {
    let finish!: (value: unknown) => void; harness.cancel.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); const cleanup = harness.effects[0]();
    action("Cancel order").onPress(); dialog("Cancel this order?").onConfirm();
    const signal = harness.cancel.mock.calls[0][1].signal as AbortSignal; if (typeof cleanup === "function") cleanup(); expect(signal.aborted).toBe(true);
    finish(order); await tick(); expect(harness.reload).not.toHaveBeenCalled();
  });
  it("reviews rebuilt current-price items before replacing an existing cart", async () => {
    harness.query.data = { ...order, canCancel: false, status: "COMPLETED" };
    action("Review reorder").onPress(); await tick(); expect(harness.replaceCart).not.toHaveBeenCalled();
    const review = dialog("Replace your current cart?"); expect(review.visible).toBe(true); review.onConfirm();
    expect(harness.replaceCart.mock.calls[0][0][0].unitPrice).toBe(3500);
    expect(harness.navigate).toHaveBeenCalledWith("/cart"); expect(harness.cancel).not.toHaveBeenCalled();
  });
  it("keeps the current cart when reorder is declined or no historical items remain available", async () => {
    harness.query.data = { ...order, canCancel: false, status: "CANCELLED" };
    action("Review reorder").onPress(); await tick(); dialog("Replace your current cart?").onCancel(); expect(harness.replaceCart).not.toHaveBeenCalled();
    harness.menu.mockResolvedValue({ ...menu, categories: [] }); action("Review reorder").onPress(); await tick();
    expect(harness.replaceCart).not.toHaveBeenCalled(); expect(text(render())).toContain("current cart is unchanged");
  });
  it.each([403, 404])("offers safe recovery without exposing an unavailable order for HTTP %s", status => {
    harness.query = { status: status === 403 ? "denied" : "error", failure: { status, kind: status === 403 ? "forbidden" : "unknown" } };
    const tree = render(); expect(text(tree)).not.toContain("Original recipient");
    expect(elements(tree).find(el => el.type === "Page")?.props.title).toBe("Unable to open this order");
    const home = elements(tree).find(el => el.type === "Action" && el.props.title === "Back to Home")!;
    (home.props.onPress as () => void)(); expect(harness.navigate).toHaveBeenCalledWith("/home");
  });
  it("preserves exactly one focused 20 second refresh timer and removes it on blur", () => {
    vi.useFakeTimers(); render(); const cleanup = harness.focus!(); vi.advanceTimersByTime(40_000); expect(harness.reload).toHaveBeenCalledTimes(2);
    if (typeof cleanup === "function") cleanup(); vi.advanceTimersByTime(40_000); expect(harness.reload).toHaveBeenCalledTimes(2); vi.useRealTimers();
  });
  it("shows manual refresh feedback until the owned order read settles", async () => {
    action("Refresh tracking").onPress();
    const refreshing = elements(render()).find(el => el.type === "Action" && el.props.title === "Refresh tracking")!;
    expect(refreshing.props.loading).toBe(true);
    expect(harness.reload).toHaveBeenCalledOnce();
    await harness.queryFn!(new AbortController().signal);
    expect(elements(render()).find(el => el.type === "Action" && el.props.title === "Refresh tracking")!.props.loading).toBe(false);
    expect(harness.getOrder.mock.calls[0][0]).toBe(order.id);
  });
  it("uses actual scoped history and pagination without inventing summary payment state", () => {
    harness.query = { status: "ready", data: { content: [order], last: false } }; const tree = render(false);
    expect(text(tree)).toContain("4,500 MMK"); expect(text(tree)).not.toContain("Cash payment recorded");
    const next = elements(tree).find(el => el.type === "Action" && el.props.title === "Next page")!; (next.props.onPress as () => void)();
    expect(elements(render(false)).some(el => el.type === "Action" && el.props.title === "Previous page")).toBe(true);
  });
});
