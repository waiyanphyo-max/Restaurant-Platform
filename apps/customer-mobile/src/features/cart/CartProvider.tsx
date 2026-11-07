import { createContext, useContext, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { CreateOrderItemRequest, MenuProductDto } from "@restaurant-platform/shared-types";
import { MAX_CART_LINES, prepareCartLine, type CartLine } from "./cart";

interface CartState { lines: CartLine[]; unavailable: string[]; }
interface CustomerCart extends CartState {
  items: CreateOrderItemRequest[];
  saveLine(product: MenuProductDto, item: CreateOrderItemRequest, currency: string, editingId?: string): boolean;
  remove(id: string): void;
  clear(): void;
  replace(lines: CartLine[], unavailable?: string[]): void;
}
const Context = createContext<CustomerCart | null>(null);

/** Mounted under the signed-in account key. Cart and special instructions are session memory only. */
export function CustomerCartProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<CartState>({ lines: [], unavailable: [] });
  const items = useMemo(() => state.lines.map(line => line.item), [state.lines]);
  const current = useRef(state);
  const nextId = useRef(0);
  function commit(next: CartState) {
    current.current = next;
    setState(next);
  }
  function saveLine(product: MenuProductDto, item: CreateOrderItemRequest, currency: string, editingId?: string) {
    const { lines, unavailable } = current.current;
    if (editingId === undefined ? lines.length >= MAX_CART_LINES
      : !lines.some(line => line.id === editingId && line.item.productId === product.id)) return false;
    const line = prepareCartLine(editingId ?? `cart-${++nextId.current}`, product, item, currency, lines);
    if (!line) return false;
    commit({ lines: editingId === undefined ? [...lines, line] : lines.map(previous => previous.id === editingId ? line : previous), unavailable });
    return true;
  }
  return <Context.Provider value={{ ...state, items, saveLine,
    remove(id) { commit({ ...current.current, lines: current.current.lines.filter(line => line.id !== id) }); },
    clear() { commit({ lines: [], unavailable: [] }); },
    replace(lines, unavailable = []) { commit({ lines, unavailable }); }
  }}>{children}</Context.Provider>;
}

export function useCustomerCart() {
  const cart = useContext(Context);
  if (!cart) throw new Error("CustomerCartProvider is required");
  return cart;
}
