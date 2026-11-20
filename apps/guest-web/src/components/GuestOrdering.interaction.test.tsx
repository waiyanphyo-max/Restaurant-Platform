import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuProductDto } from "@restaurant-platform/shared-types";
import { initialOrderState, type GuestOrderState } from "@/lib/guest-order";

const harness = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, session: {} as unknown }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useId: () => "fixture-form",
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index], (value: unknown) => { harness.values[index] = typeof value === "function" ? value(harness.values[index]) : value; }];
  },
}));
vi.mock("./GuestSession", () => ({ useGuestSession: () => harness.session }));
import { ProductConfigurator } from "./ProductConfigurator";
import { GuestOrdering } from "./GuestOrdering";
import { ProductMedia } from "./ProductMedia";

const product: MenuProductDto = {
  id: "11111111-1111-4111-8111-111111111111", name: "Fictional bowl", description: null,
  price: 2000, imageUrl: null, available: true, trackStock: true, stockQuantity: 3,
  variants: [{ id: "22222222-2222-4222-8222-222222222222", name: "Regular", price: 3000, imageUrl: null, available: true }],
  modifierGroups: [{ id: "33333333-3333-4333-8333-333333333333", name: "Spice", required: true, minSelections: 1, maxSelections: 1,
    options: [{ id: "44444444-4444-4444-8444-444444444444", name: "Mild", additionalPrice: 500, available: true }] },
  { id: "55555555-5555-4555-8555-555555555555", name: "Extras", required: false, minSelections: 0, maxSelections: 1,
    options: [{ id: "66666666-6666-4666-8666-666666666666", name: "Tofu", additionalPrice: 200, available: true }] }],
};
const actions = { add: vi.fn(() => true), checkout: vi.fn(), remove: vi.fn(), setQuantity: vi.fn(), retryValidation: vi.fn(), refresh: vi.fn(), enableSound: vi.fn() };
let state: GuestOrderState;
let tree: ReactNode;
type Element = ReactElement<Record<string, unknown>>;
function items(node: ReactNode = tree): Element[] {
  if (Array.isArray(node)) return node.flatMap(child => items(child ?? null));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...items((node.props.children ?? null) as ReactNode)];
}
function content(node: ReactNode = tree): string {
  if (Array.isArray(node)) return node.map(child => content(child ?? null)).join(" ");
  if (isValidElement<Record<string, unknown>>(node)) return content((node.props.children ?? null) as ReactNode);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function renderForm(current = product) { harness.cursor = 0; tree = ProductConfigurator({ product: current, currency: "MMK" }); }
function renderOrder(products = [product]) { harness.cursor = 0; tree = GuestOrdering({ currency: "MMK", products }); }
function button(label: string) { return items().find(item => item.type === "button" && content(item).includes(label))!; }
function change(id: string, value: string) {
  const field = items().find(item => item.props.id === id)!;
  expect(field).toBeDefined();
  (field.props.onChange as (event: unknown) => void)({ target: { value } });
}
function submit() { (items().find(item => item.type === "form")!.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); }
function click(label: string) { const item = button(label); expect(item).toBeDefined(); expect(item.props.disabled).not.toBe(true); (item.props.onClick as () => void)(); }

beforeEach(() => {
  vi.clearAllMocks(); harness.values = [];
  state = { ...initialOrderState, phase: "ready", kind: "COMMON_QR", cart: [] };
  harness.session = { locale: "en", state, actions };
});

describe("configured cart choices", () => {
  it("blocks required choices before Add, then accepts optional extras being left empty with actual total", () => {
    renderForm(); expect(button("Add to order").props.disabled).toBe(true);
    submit(); expect(actions.add).not.toHaveBeenCalled();
    change("fixture-form-variant", product.variants[0].id); renderForm();
    expect(button("Add to order").props.disabled).toBe(true);
    change(`fixture-form-${product.modifierGroups[0].options[0].id}`, "1"); renderForm();
    expect(button("Add to order").props.disabled).toBe(false);
    expect(content()).toContain("3,500");
    submit();
    expect(actions.add).toHaveBeenCalledExactlyOnceWith(product, { variantId: product.variants[0].id, quantity: 1,
      specialInstruction: "", modifiers: [{ modifierOptionId: product.modifierGroups[0].options[0].id, quantity: 1 }] });
  });
  it("updates option-unit totals and respects changed stock, availability and invalid counts", () => {
    renderForm(); change("fixture-form-variant", product.variants[0].id); renderForm();
    change(`fixture-form-${product.modifierGroups[0].options[0].id}`, "2"); renderForm();
    change("fixture-form-quantity", "2"); renderForm(); expect(content()).toContain("8,000");
    renderForm({ ...product, stockQuantity: 1 }); expect(button("Add to order").props.disabled).toBe(true);
    renderForm({ ...product, variants: [{ ...product.variants[0], available: false }] });
    submit(); expect(actions.add).not.toHaveBeenCalled();
    renderForm(); change(`fixture-form-${product.modifierGroups[0].options[0].id}`, "11"); renderForm();
    expect(button("Add to order").props.disabled).toBe(true);
  });
  it("offers no artificial variant or modifier controls for a simple product", () => {
    renderForm({ ...product, variants: [], modifierGroups: [] });
    expect(items().some(item => item.type === "select")).toBe(false);
    expect(items().some(item => item.props.className === "order-modifier-group")).toBe(false);
    expect(button("Add to order").props.disabled).toBe(false);
    expect(content()).toContain("2,000");
  });
  it("associates each modifier with its group limits and announces current selection guidance", () => {
    renderForm();
    for (const group of product.modifierGroups) {
      const rulesId = `fixture-form-${group.id}-rules`;
      expect(items().find(item => item.type === "fieldset" && item.props["aria-describedby"] === rulesId)).toBeDefined();
      expect(items().find(item => item.props.id === rulesId)).toBeDefined();
      for (const option of group.options) expect(items().find(item => item.props.id === `fixture-form-${option.id}`)?.props["aria-describedby"]).toBe(rulesId);
    }
    const hint = () => items().find(item => item.props.id === "fixture-form-selection-hint")!;
    expect(hint().props).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" });
    expect(content(hint())).toContain("Check the variant");
    change("fixture-form-variant", product.variants[0].id); renderForm();
    const media = items().find(item => item.type === ProductMedia)!;
    expect(media.props.fallbackLabel).toBe("Regular · Photo unavailable");
    change(`fixture-form-${product.modifierGroups[0].options[0].id}`, "1"); renderForm();
    expect(content(hint())).toContain("checks stock, options and final prices");
    harness.session = { locale: "my", state, actions }; renderForm();
    expect(items().find(item => item.type === ProductMedia)!.props.fallbackLabel).toContain("ဓာတ်ပုံ");
  });
});

describe("embedded checkout review", () => {
  function addLine() {
    state.cart = [{ id: "fixture-line", productId: product.id, name: product.name, variantId: product.variants[0].id,
      variantName: "Regular", quantity: 2, specialInstruction: "Less salt", modifiers: [{ modifierOptionId: product.modifierGroups[0].options[0].id, quantity: 1 }], modifierNames: ["Mild"] }];
  }
  it("shows actual line totals and requires explicit review before the unchanged checkout action", () => {
    addLine(); renderOrder(); expect(content()).toContain("7,000");
    click("Review order"); renderOrder(); expect(actions.checkout).not.toHaveBeenCalled();
    expect(content()).toContain("Review your order"); expect(content()).toContain("Pay at the counter");
    expect(content()).toContain("not a payment receipt");
    click("Place order"); expect(actions.checkout).toHaveBeenCalledOnce();
  });
  it("requires a new review after editing the cart or a current menu price change", () => {
    addLine(); renderOrder(); click("Review order"); renderOrder();
    state.cart = state.cart.map(line => ({ ...line, quantity: 1 })); renderOrder();
    expect(button("Review order")).toBeDefined(); click("Review order"); renderOrder();
    const updated = { ...product, variants: [{ ...product.variants[0], price: 4000 }] };
    renderOrder([updated]); expect(content()).toContain("4,500"); expect(button("Review order")).toBeDefined();
    expect(actions.checkout).not.toHaveBeenCalled();
  });
  it("retains only same-order recovery after lost confirmation and never creates a new review", () => {
    addLine(); state.phase = "uncertain"; renderOrder();
    expect(items().filter(item => item.type === "input").every(item => item.props.disabled)).toBe(true);
    click("Retry the same order safely"); expect(actions.checkout).toHaveBeenCalledOnce();
    expect(content()).not.toContain("Review your order");
  });
  it("never uses another restaurant's product to fill a missing price", () => {
    addLine(); renderOrder([{ ...product, id: "77777777-7777-4777-8777-777777777777", price: 85, variants: [] }]);
    expect(content()).toContain("Price unavailable"); expect(content()).not.toContain("7,000");
    expect(button("Review order").props.disabled).toBe(true);
  });
  it("blocks checkout review when refreshed stock no longer covers all cart lines together", () => {
    addLine(); state.cart = [...state.cart, { ...state.cart[0], id: "second-line", quantity: 2 }];
    renderOrder(); expect(button("Review order").props.disabled).toBe(true);
    expect(content()).toContain("no longer available"); expect(actions.checkout).not.toHaveBeenCalled();
  });
});
