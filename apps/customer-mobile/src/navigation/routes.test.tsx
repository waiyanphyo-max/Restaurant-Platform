import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  auth: { status: "signed_in", userId: "customer-a" }, pathname: "/home",
  params: {} as { destination?: string | string[] },
  account: { state: { status: "ready" }, editingAddress: null as null | { id: string }, reload: vi.fn(), dismissOnboarding: vi.fn() },
  replace: vi.fn(), navigate: vi.fn()
}));
vi.mock("react-native", () => ({ Image: "Image", Pressable: "Pressable", Text: "Text", View: "View", StyleSheet: { create: (value: unknown) => value } }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("expo-router", () => ({ Redirect: "Redirect", Slot: "Slot", usePathname: () => harness.pathname,
  useLocalSearchParams: () => harness.params,
  useRouter: () => ({ replace: harness.replace, navigate: harness.navigate }) }));
vi.mock("../auth/AuthProvider", () => ({ useCustomerAuth: () => ({ state: harness.auth }) }));
vi.mock("../auth/AuthPanel", () => ({ AuthPanel: "AuthPanel" }));
vi.mock("../features/profile/AccountProvider", () => ({ CustomerAccountProvider: "CustomerAccountProvider", useCustomerAccount: () => harness.account }));
vi.mock("../features/cart/CartProvider", () => ({ CustomerCartProvider: "CustomerCartProvider" }));
vi.mock("../features/checkout/CheckoutProvider", () => ({ CustomerCheckoutProvider: "CustomerCheckoutProvider",
  useCustomerCheckout: () => ({ state: { status: "idle" } }) }));
vi.mock("../i18n", () => ({ useCustomerText: () => (english: string) => english, queryStateLabel: (state: string) => state }));
vi.mock("../features/addresses/AddressScreen", () => ({ AddressScreen: "AddressScreen" }));
vi.mock("../components/ui", () => ({ Page: "Page", StateView: "StateView" }));
vi.mock("../tenant", () => ({ readEmbeddedTenant: () => ({ branding: { displayName: "Configured Restaurant", primaryColor: "#2457a7" } }) }));

import Address from "../../app/(store)/address";
import StoreLayout from "../../app/(store)/_layout";
import OpenCustomerLink from "../../app/open";
import SignIn from "../../app/index";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}

describe("restaurant-locked customer navigation", () => {
  beforeEach(() => {
    harness.auth = { status: "signed_in", userId: "customer-a" }; harness.pathname = "/home";
    harness.params = {};
    harness.account.state = { status: "ready" }; harness.account.editingAddress = null;
    harness.account.reload.mockReset(); harness.account.dismissOnboarding.mockReset(); harness.replace.mockReset(); harness.navigate.mockReset();
  });

  it.each(["loading", "signed_out", "error"])("guards the customer workspace while authentication is %s", status => {
    harness.auth.status = status; const tree = StoreLayout();
    expect(isValidElement(tree) && tree.type).toBe("Redirect"); expect(tree.props.href).toBe("/");
    expect(elements(tree).some(item => item.type === "Slot")).toBe(false);
  });

  it("offers Home, Menu, Cart, Orders, Profile within the configured restaurant", () => {
    const navigation = elements(StoreLayout()).find(item => typeof item.type === "function")!;
    const tree = (navigation.type as () => ReactNode)();
    const tabs = elements(tree).filter(item => item.type === "Pressable");
    expect(tabs.map(tab => tab.props.accessibilityLabel)).toEqual(["home", "menu", "cart", "orders", "profile"]);
    for (const tab of tabs) (tab.props.onPress as () => void)();
    expect(harness.navigate.mock.calls.map(call => call[0])).toEqual(["/home", "/menu", "/cart", "/orders", "/profile"]);
    expect(elements(tree).some(item => item.props.children === "Configured Restaurant")).toBe(true);
  });

  it("holds a validated deep-link destination through sign-in and rejects a tampered bridge route", () => {
    harness.params = { destination: "/menu" };
    const bridge = OpenCustomerLink();
    expect(bridge.type).toBe(SignIn);
    harness.auth.status = "loading";
    expect(elements(SignIn(bridge.props)).some(item => item.type === "Redirect")).toBe(false);
    harness.auth.status = "signed_in";
    expect(SignIn(bridge.props).props.href).toBe("/menu");
    harness.params = { destination: "//other.example.test/profile" };
    expect(OpenCustomerLink().props.destination).toBe("/home");
  });

  it("mounts private account state with an authenticated user key", () => {
    const first = elements(StoreLayout()).find(item => item.type === "CustomerAccountProvider")!;
    expect(first.key).toBe("customer-a"); harness.auth.userId = "customer-b";
    const second = elements(StoreLayout()).find(item => item.type === "CustomerAccountProvider")!;
    expect(second.key).toBe("customer-b");
  });

  it("edits only the owned address selected in account context, with no route address identity", () => {
    const selected = { id: "owned-address" }; harness.account.editingAddress = selected;
    const screen = Address(); expect(screen.props.address).toBe(selected);
    (screen.props.onSaved as () => void)();
    expect(harness.account.reload).toHaveBeenCalledTimes(1); expect(harness.account.dismissOnboarding).toHaveBeenCalledTimes(1);
    expect(harness.replace).toHaveBeenCalledExactlyOnceWith("/profile");
  });

  it("skips optional address onboarding without saving or changing restaurant context", () => {
    const screen = Address(); (screen.props.onCancel as () => void)();
    expect(harness.account.dismissOnboarding).toHaveBeenCalledTimes(1); expect(harness.replace).toHaveBeenCalledExactlyOnceWith("/profile");
    expect(harness.account.reload).not.toHaveBeenCalled();
  });

  it.each(["loading", "offline", "error", "denied"])("does not mount an address mutation form when account access is %s", status => {
    harness.account.state.status = status; const tree = Address();
    expect(elements(tree).some(item => item.type === "AddressScreen")).toBe(false);
    expect(elements(tree).find(item => item.type === "StateView")?.props.kind).toBe(status);
  });
});
