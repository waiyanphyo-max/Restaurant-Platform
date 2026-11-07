import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareCartLine, type CartLine } from "../cart/cart";

const harness = vi.hoisted(() => ({
  language: "en", states: [] as unknown[], stateIndex: 0,
  menu: null as PublicMenuResponse | null, reload: vi.fn(), push: vi.fn(), replace: vi.fn(), navigate: vi.fn(),
  refs: [] as { current: unknown }[], refIndex: 0, params: {} as { productId?: string; lineId?: string },
  lines: [] as CartLine[], unavailable: [] as string[], saveLine: vi.fn(), remove: vi.fn()
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value; }];
  },
  useRef(initial: unknown) { const index = harness.refIndex++; return harness.refs[index] ??= { current: initial }; },
  useCallback<T>(callback: T) { return callback; }
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: harness.push, replace: harness.replace, navigate: harness.navigate }),
  useLocalSearchParams: () => harness.params }));
vi.mock("react-native", () => ({ Image: "Image", ScrollView: "ScrollView", Text: "Text", StyleSheet: { create: (value: unknown) => value } }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", FormField: "FormField", Page: "Page", StateView: "StateView" }));
vi.mock("../../api", () => ({ getCustomerPublicApi: vi.fn() }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: () => ({
  state: harness.menu ? { status: "ready", data: harness.menu } : { status: "offline" }, reload: harness.reload
}) }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: vi.fn() }));
vi.mock("../profile/AccountProvider", () => ({ homeAddress: vi.fn(), useCustomerAccount: () => ({
  state: { status: "ready", data: { profile: { preferredLanguage: harness.language } } }
}) }));
vi.mock("../cart/CartProvider", () => ({ useCustomerCart: () => ({
  lines: harness.lines, unavailable: harness.unavailable, saveLine: harness.saveLine, remove: harness.remove
}) }));
import { CartScreen } from "../cart/CartScreen";
import { ProductScreen } from "./ProductScreen";
import { MenuScreen } from "./Storefront";

const noodles = {
  id: "noodles", name: "Noodles", description: "Rice noodles", available: true, imageUrl: null, price: 2_000,
  trackStock: false, stockQuantity: null, variants: [], modifierGroups: []
};
const menu: PublicMenuResponse = {
  restaurantId: "restaurant-a", restaurantName: "Restaurant A", slug: null, description: null, phone: null, address: null,
  logoUrl: null, currency: "MMK", categories: [
    { id: "mains", name: "Mains", displayOrder: 0, products: [noodles] },
    { id: "drinks", name: "Drinks", displayOrder: 1,
      products: [{ ...noodles, id: "tea", name: "Tea", description: null, trackStock: true, stockQuantity: 0 }] }
  ]
};
function render() { harness.stateIndex = 0; return MenuScreen(); }
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function titles(node: ReactNode) { return elements(node).map(element => element.props.title); }
function actionProps(node: ReactNode, title: string) {
  return elements(node).find(element => element.type === "Action" && element.props.title === title)!.props as { onPress(): void; disabled?: boolean };
}
function action(node: ReactNode, title: string) { return actionProps(node, title).onPress; }

describe("customer restaurant menu", () => {
  beforeEach(() => {
    harness.states = []; harness.language = "en"; harness.menu = menu;
    harness.push.mockReset(); harness.reload.mockReset();
  });

  it("searches case-insensitively and opens the matching product without a restaurant override", () => {
    const search = elements(render()).find(element => element.type === "FormField")!;
    (search.props.onChangeText as (value: string) => void)("  NOODLES ");
    const filtered = render();
    expect(titles(filtered)).toContain("Noodles");
    expect(titles(filtered)).not.toContain("Tea");
    action(filtered, "View item")();
    expect(harness.push).toHaveBeenCalledExactlyOnceWith({ pathname: "/product/[productId]", params: { productId: "noodles" } });
  });

  it("filters categories and labels products that have no stock", () => {
    action(render(), "Drinks")();
    const filtered = render();
    expect(titles(filtered)).toContain("Tea");
    expect(titles(filtered)).not.toContain("Noodles");
    expect(elements(filtered).some(element => element.props.children === "Unavailable")).toBe(true);
  });

  it("uses Burmese when configured and offers a localized retry for unavailable network", () => {
    harness.language = "my-MM";
    harness.menu = null;
    const tree = render();
    expect(tree.props.title).toBe("မီနူး");
    const offline = elements(tree).find(element => element.type === "StateView")!;
    expect(offline.props.retryLabel).toBe("ထပ်ကြိုးစားပါ");
    (offline.props.onRetry as () => void)();
    expect(harness.reload).toHaveBeenCalledOnce();
  });
});

describe("customer product configuration", () => {
  const configurable: MenuProductDto = {
    ...noodles, price: null, variants: [{ id: "large", name: "Large", price: 3_000, available: true, imageUrl: null }],
    modifierGroups: [{ id: "extras", name: "Extras", required: true, minSelections: 1, maxSelections: 1,
      options: [{ id: "egg", name: "Egg", additionalPrice: 300, available: true }] }]
  };
  function renderDetails() {
    harness.stateIndex = 0;
    harness.refIndex = 0;
    const component = ProductScreen();
    return (component.type as (props: typeof component.props) => ReactNode)(component.props);
  }
  beforeEach(() => {
    harness.states = []; harness.refs = []; harness.language = "en"; harness.lines = [];
    harness.params = { productId: configurable.id };
    harness.menu = { ...menu, categories: [{ ...menu.categories[0], products: [configurable] }] };
    harness.saveLine.mockReset().mockReturnValue(true); harness.replace.mockReset();
  });

  it("requires configured variant and modifier choices before adding the item to the cart", () => {
    expect(actionProps(renderDetails(), "Add to cart").disabled).toBe(true);
    action(renderDetails(), "Large · 3,000 MMK")();
    expect(actionProps(renderDetails(), "Add to cart").disabled).toBe(true);
    action(renderDetails(), "Select option")();
    const tree = renderDetails();
    expect(actionProps(tree, "Add to cart").disabled).toBe(false);
    action(tree, "Add to cart")(); action(tree, "Add to cart")();
    expect(harness.saveLine).toHaveBeenCalledExactlyOnceWith(configurable, {
      productId: configurable.id, variantId: "large", quantity: 1, specialInstruction: null,
      modifiers: [{ modifierOptionId: "egg", quantity: 1 }]
    }, "MMK", undefined);
    expect(harness.replace).toHaveBeenCalledExactlyOnceWith("/cart");
  });

  it("edits a cart line using its selection and the fresh menu price", () => {
    const previousLine = prepareCartLine("cart-1", configurable, {
      productId: configurable.id, variantId: "large", quantity: 1, modifiers: [{ modifierOptionId: "egg", quantity: 1 }]
    }, "MMK")!;
    harness.lines = [previousLine];
    harness.params.lineId = previousLine.id;
    const current = { ...configurable, variants: [{ ...configurable.variants[0], price: 3_500 }] };
    harness.menu = { ...menu, categories: [{ ...menu.categories[0], products: [current] }] };
    const tree = renderDetails();
    expect(titles(tree)).toContain("Large · 3,500 MMK");
    action(tree, "Save changes")();
    expect(harness.saveLine).toHaveBeenCalledExactlyOnceWith(current, previousLine.item, "MMK", previousLine.id);
  });
});

describe("cart checkout entry", () => {
  beforeEach(() => {
    harness.language = "en";
    harness.lines = [];
    harness.unavailable = [];
    harness.navigate.mockReset(); harness.remove.mockReset();
  });

  it("requires cart items before offering checkout", () => {
    const tree = CartScreen();
    expect(titles(tree)).toContain("Your cart is empty");
    expect(titles(tree)).not.toContain("Continue to checkout");
  });

  it("shows unavailable reorder lines and opens the same checkout route without a previous destination", () => {
    harness.lines = [prepareCartLine("reorder-0", noodles, { productId: noodles.id, quantity: 1 }, menu.currency)!];
    harness.unavailable = ["Old product"];
    const tree = CartScreen();
    expect(titles(tree)).toContain("Some previous items are unavailable");
    expect(elements(tree).some(element => element.props.children === "Old product")).toBe(true);
    action(tree, "Continue to checkout")();
    expect(harness.navigate).toHaveBeenCalledExactlyOnceWith("/checkout");
    action(tree, "Remove item")();
    expect(harness.remove).toHaveBeenCalledExactlyOnceWith("reorder-0");
  });
});
