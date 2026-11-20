import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuProductDto } from "@restaurant-platform/shared-types";
import type { CartLine } from "../cart/cart";
import { prepareCartLine } from "../cart/cart";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0,
  product: null as MenuProductDto | null, lines: [] as CartLine[], lineId: undefined as string | undefined,
  saveLine: vi.fn(), replace: vi.fn(), reload: vi.fn()
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value; }];
  },
  useRef(initial: unknown) { return hooks.refs[hooks.refIndex++] ??= { current: initial }; }
}));
vi.mock("react-native", () => ({ View: "View", StyleSheet: { create: (value: unknown) => value } }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ productId: hooks.product?.id, lineId: hooks.lineId }),
  useRouter: () => ({ replace: hooks.replace, navigate: vi.fn() }) }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", FormField: "FormField", Page: "Page", StateView: "StateView" }));
vi.mock("../../components/FoodMedia", () => ({ FoodMedia: "FoodMedia" }));
vi.mock("../../i18n", () => ({ useCustomerText: () => (english: string) => english, useCustomerLanguage: () => "en", queryStateLabel: () => "Loading" }));
vi.mock("./MenuProvider", () => ({ usePublicMenu: () => ({ state: { status: "ready", data: { currency: "MMK", categories: [{ products: [hooks.product] }] } }, reload: hooks.reload }) }));
vi.mock("../cart/CartProvider", () => ({ useCustomerCart: () => ({ lines: hooks.lines, saveLine: hooks.saveLine }) }));
import { ProductScreen } from "./ProductScreen";

const product: MenuProductDto = {
  id: "11111111-1111-4111-8111-111111111110", name: "Restaurant A · Noodles", description: "Description",
  price: null, imageUrl: "https://media.example.test/a-product.jpg", trackStock: false, stockQuantity: null, available: true,
  variants: [{ id: "11111111-1111-4111-8111-111111111111", name: "Regular", available: true, price: 2000,
    imageUrl: "https://media.example.test/a-variant.jpg" }],
  modifierGroups: [{ id: "11111111-1111-4111-8111-111111111112", name: "Spice", required: true, minSelections: 1, maxSelections: 1,
    options: [{ id: "11111111-1111-4111-8111-111111111113", name: "Mild", available: true, additionalPrice: 0 }] }]
};
const selection = { productId: product.id, variantId: product.variants[0].id, quantity: 1,
  modifiers: [{ modifierOptionId: product.modifierGroups[0].options[0].id, quantity: 1 }] };
function render() {
  hooks.stateIndex = 0; hooks.refIndex = 0;
  const screen = ProductScreen();
  return (screen.type as (props: typeof screen.props) => ReactNode)(screen.props);
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function action(tree: ReactNode, title: string) {
  return elements(tree).find(element => element.type === "Action" && element.props.title === title)!;
}
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.product = product; hooks.lines = []; hooks.lineId = undefined;
  hooks.saveLine.mockReset().mockReturnValue(true); hooks.replace.mockReset(); hooks.reload.mockReset();
});

describe("configured product recovery", () => {
  it("keeps an unavailable selected variant explicit without choosing another variant", () => {
    const previous = prepareCartLine("cart-1", product, selection, "MMK")!;
    hooks.lines = [previous]; hooks.lineId = previous.id;
    hooks.product = { ...product, variants: [{ ...product.variants[0], available: false },
      { ...product.variants[0], id: "22222222-2222-4222-8222-222222222221", name: "Another variant", imageUrl: null }] };
    const tree = render();
    expect(elements(tree).some(element => element.props.title === "Your selected variant is unavailable")).toBe(true);
    expect(action(tree, "Save changes").props.disabled).toBe(true);
    expect(action(tree, "Another variant · 2,000 MMK").props.selected).toBe(false);
    expect(previous.item.variantId).toBe(selection.variantId);
  });

  it("retains required choices and availability feedback when all configured options are unavailable", () => {
    hooks.product = { ...product, modifierGroups: [{ ...product.modifierGroups[0], options: [{
      ...product.modifierGroups[0].options[0], available: false
    }] }] };
    const tree = render();
    expect(elements(tree).some(element => element.props.title === "Spice")).toBe(true);
    expect(elements(tree).some(element => element.props.children === "Required")).toBe(true);
    expect(elements(tree).some(element => element.props.children === "Unavailable")).toBe(true);
    expect(action(tree, "Select option").props.disabled).toBe(true);
    expect(action(tree, "Add to cart").props.disabled).toBe(true);
  });

  it("uses the selected variant photo and allows explicit removal of an unavailable modifier", () => {
    const previous = prepareCartLine("cart-1", product, selection, "MMK")!;
    hooks.lines = [previous]; hooks.lineId = previous.id;
    hooks.product = { ...product, modifierGroups: [{ ...product.modifierGroups[0], options: [
      { ...product.modifierGroups[0].options[0], available: false },
      { ...product.modifierGroups[0].options[0], id: "22222222-2222-4222-8222-222222222223", name: "New spice" }
    ] }] };
    const tree = render();
    expect(elements(tree).find(element => element.type === "FoodMedia")?.props.uri).toBe(product.variants[0].imageUrl);
    expect(action(tree, "Save changes").props.disabled).toBe(true);
    (action(tree, "Remove unavailable options").props.onPress as () => void)();
    expect(action(render(), "Save changes").props.disabled).toBe(true);
    const replacement = elements(render()).find(element => element.type === "Action" && element.props.accessibilityHint === "New spice")!;
    (replacement.props.onPress as () => void)();
    expect(action(render(), "Save changes").props.disabled).toBe(false);
  });

  it("does not invent variant or modifier selectors for a base-price product", () => {
    hooks.product = { ...product, price: 1500, variants: [], modifierGroups: [] };
    const tree = render();
    expect(elements(tree).some(element => element.props.title === "Choose a variant" || element.props.title === "Spice")).toBe(false);
    expect(action(tree, "Add to cart").props.disabled).toBe(false);
  });
});
