import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerAccount } from "../features/profile/AccountProvider";
import type { QueryState } from "../hooks/useApiQuery";

const harness = vi.hoisted(() => ({
  account: { status: "loading" } as QueryState<CustomerAccount>,
  reload: vi.fn(), navigate: vi.fn(), replace: vi.fn()
}));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial }), useEffect: vi.fn()
}));
const menu = { restaurantId: "restaurant-a", restaurantName: "Restaurant A", currency: "MMK", categories: [{ id: "category-a", products: [{
  id: "product", name: "Lunch", price: 5000, available: true, trackStock: false, variants: [], modifierGroups: []
}] }] };
vi.mock("../api", () => ({ getCustomerPublicApi: () => ({ getPublicMenu: async () => menu }) }));
vi.mock("../features/storefront/MenuProvider", () => ({ usePublicMenu: () => ({ state: { status: "ready", data: menu }, reload: vi.fn() }) }));
vi.mock("../features/checkout/CheckoutProvider", () => ({ useCustomerCheckout: () => ({ state: { status: "idle" } }) }));
vi.mock("react-native", () => ({ View: "View", StyleSheet: { create: (value: unknown) => value } }));
vi.mock("expo-router", () => ({ useRouter: () => ({ navigate: harness.navigate, replace: harness.replace }) }));
vi.mock("../i18n", () => ({ useCustomerText: () => (english: string) => english, useCustomerLanguage: () => "en",
  queryStateLabel: (state: string) => state }));
vi.mock("../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", Page: "Page", StateView: "StateView" }));
vi.mock("../features/profile/AccountProvider", () => ({ useCustomerAccount: () => ({ state: harness.account, reload: harness.reload }) }));
vi.mock("../features/checkout/CheckoutScreen", () => ({ CheckoutScreen: "CheckoutScreen" }));
vi.mock("../features/cart/CartProvider", () => ({ useCustomerCart: () => ({
  lines: [{ id: "line", name: "Lunch", item: { productId: "product", quantity: 1 }, unitPrice: 5000, currency: "MMK", modifierNames: [] }],
  unavailable: [], remove: vi.fn()
}) }));
import Cart from "../../app/(store)/cart";
import Checkout from "../../app/(store)/checkout";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
const account = { profile: { id: "owner" }, addresses: [] } as unknown as CustomerAccount;

describe("cart to authenticated checkout", () => {
  beforeEach(() => { vi.clearAllMocks(); harness.account = { status: "loading" }; });

  it("navigates from a populated cart to checkout after checking the current menu", async () => {
    const action = elements(Cart()).find(item => item.type === "Action" && item.props.title === "Continue to checkout")!;
    (action.props.onPress as () => void)();
    await vi.waitFor(() => expect(harness.navigate).toHaveBeenCalledWith("/checkout"));
  });

  it.each(["loading", "offline", "denied", "error"] as const)("waits for account access while %s and retries before exposing checkout", status => {
    harness.account = { status };
    const tree = Checkout();
    expect(elements(tree).some(item => item.type === "CheckoutScreen")).toBe(false);
    const state = elements(tree).find(item => item.type === "StateView")!;
    expect(state.props.kind).toBe(status);
    (state.props.onRetry as () => void)();
    expect(harness.reload).toHaveBeenCalledOnce();
    harness.account = { status: "ready", data: account };
    const screen = Checkout();
    expect(screen.props.account).toBe(account);
  });

  it("explains that missing profile data blocks checkout without fabricating an account", () => {
    harness.account = { status: "error", failure: { operation: "profile", kind: "missing_profile", code: "CUSTOMER_PROFILE_NOT_FOUND", status: 404 } };
    const state = elements(Checkout()).find(item => item.type === "StateView")!;
    expect(state.props.title).toBe("Could not load account details");
    expect(state.props.message).toContain("not ready");
    expect(elements(Checkout()).some(item => item.type === "CheckoutScreen")).toBe(false);
  });

  it("routes the confirmed server order to tracking and provides order history", () => {
    harness.account = { status: "ready", data: account };
    const screen = Checkout();
    screen.props.onOrder("server-order");
    expect(harness.replace).toHaveBeenCalledWith({ pathname: "/order/[orderId]", params: { orderId: "server-order" } });
    screen.props.onOrders(); expect(harness.navigate).toHaveBeenCalledWith("/orders");
  });
});
