import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateOrderItemRequest, MenuProductDto } from "@restaurant-platform/shared-types";
import type { CartLine } from "./cart";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = value; }];
  },
  useRef(initial: unknown) { return hooks.refs[hooks.refIndex++] ??= { current: initial }; },
  useMemo: <T,>(compute: () => T) => compute()
}));
import { CustomerCartProvider } from "./CartProvider";

type Cart = {
  lines: CartLine[]; items: CreateOrderItemRequest[];
  saveLine(product: MenuProductDto, selection: CreateOrderItemRequest, currency: string, editingId?: string): boolean;
  remove(id: string): void; clear(): void;
};
const product: MenuProductDto = {
  id: "11111111-1111-4111-8111-111111111110", name: "Restaurant A dish", description: null,
  price: 2500, imageUrl: null, available: true, trackStock: true, stockQuantity: 3,
  variants: [], modifierGroups: []
};
const selection = { productId: product.id, quantity: 2 };
function render() {
  hooks.stateIndex = 0; hooks.refIndex = 0;
  return (CustomerCartProvider({ children: null }) as ReactElement<{ value: Cart }>).props.value;
}
beforeEach(() => { hooks.states = []; hooks.refs = []; });

describe("existing session-memory cart operations", () => {
  it("validates successive additions and edits against current stock even from the same render", () => {
    const cart = render();
    expect(cart.saveLine(product, selection, "MMK")).toBe(true);
    expect(cart.saveLine(product, selection, "MMK")).toBe(false);
    const line = render().lines[0];
    expect(cart.saveLine(product, { ...selection, quantity: 3 }, "MMK", line.id)).toBe(true);
    expect(render().lines).toHaveLength(1);
    expect(render().items).toEqual([{ ...selection, quantity: 3, variantId: null, specialInstruction: null, modifiers: [] }]);
    expect(cart.saveLine(product, { ...selection, quantity: 4 }, "MMK", line.id)).toBe(false);
    expect(render().items[0].quantity).toBe(3);
  });

  it("rejects invalid/foreign line edits and allows the existing remove and clear actions", () => {
    const cart = render();
    cart.saveLine(product, selection, "MMK");
    const line = render().lines[0];
    expect(cart.saveLine({ ...product, id: "22222222-2222-4222-8222-222222222220" }, selection, "MMK", line.id)).toBe(false);
    expect(cart.saveLine(product, selection, "MMK", "missing-line")).toBe(false);
    cart.remove(line.id);
    expect(render().lines).toEqual([]);
    expect(cart.saveLine(product, selection, "MMK")).toBe(true);
    cart.clear();
    expect(render().items).toEqual([]);
  });
});
