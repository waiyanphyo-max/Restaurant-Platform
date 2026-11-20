import type {
  CreateOrderItemRequest, MenuProductDto, OrderItemDetailDto, PublicMenuResponse
} from "@restaurant-platform/shared-types";

export const MAX_CART_LINES = 50;
export const MAX_ITEM_QUANTITY = 999;
export const MAX_MODIFIER_OPTIONS = 20;
export const MAX_MODIFIER_QUANTITY = 10;
export const MAX_ITEM_INSTRUCTION = 500;

export interface CartLine {
  id: string;
  item: CreateOrderItemRequest;
  name: string;
  variantName: string | null;
  modifierNames: string[];
  unitPrice: number;
  currency: string;
}

export function productStockRemaining(product: MenuProductDto, lines: readonly CartLine[], editingId?: string) {
  if (!product.trackStock) return MAX_ITEM_QUANTITY;
  const reserved = lines.filter(line => line.id !== editingId && line.item.productId === product.id)
    .reduce((sum, line) => sum + line.item.quantity, 0);
  return Math.max(0, Math.min(MAX_ITEM_QUANTITY, (product.stockQuantity ?? 0) - reserved));
}

function validPrice(price: number | null | undefined): price is number {
  return typeof price === "number" && Number.isSafeInteger(price) && price >= 0;
}

export function productPriceRange(product: MenuProductDto): { min: number; max: number } | null {
  if (!product.variants.length) return validPrice(product.price) ? { min: product.price, max: product.price } : null;
  let range: { min: number; max: number } | null = null;
  for (const variant of product.variants) {
    if (!variant.available || !validPrice(variant.price)) continue;
    range = range ? { min: Math.min(range.min, variant.price), max: Math.max(range.max, variant.price) }
      : { min: variant.price, max: variant.price };
  }
  return range;
}

export function productAvailable(product: MenuProductDto): boolean {
  return product.available && productStockRemaining(product, []) > 0 && productPriceRange(product) !== null
    && product.modifierGroups.every(group => group.options.filter(option => option.available).length >= group.minSelections);
}

/** Validate against the visible menu for feedback. The checkout quote and order remain authoritative. */
export function prepareCartLine(
  id: string, product: MenuProductDto, item: CreateOrderItemRequest, currency: string, lines: readonly CartLine[] = []
): CartLine | null {
  if (!productAvailable(product) || item.productId !== product.id || !Number.isInteger(item.quantity)
    || item.quantity < 1 || item.quantity > productStockRemaining(product, lines, id)
    || (item.specialInstruction?.length ?? 0) > MAX_ITEM_INSTRUCTION) return null;

  const variant = product.variants.find(option => option.id === item.variantId);
  if (product.variants.length ? !variant?.available : item.variantId != null) return null;
  const basePrice = variant ? variant.price : product.price;
  if (!validPrice(basePrice)) return null;

  const modifiers = item.modifiers ?? [];
  const ids = new Set(modifiers.map(option => option.modifierOptionId));
  if (modifiers.length > MAX_MODIFIER_OPTIONS || ids.size !== modifiers.length) return null;

  const options = product.modifierGroups.flatMap(group => group.options);
  const names: string[] = [];
  let unitPrice = basePrice;
  for (const selection of modifiers) {
    const option = options.find(option => option.id === selection.modifierOptionId && option.available);
    if (!option || !validPrice(option.additionalPrice) || !Number.isInteger(selection.quantity)
      || selection.quantity < 1 || selection.quantity > MAX_MODIFIER_QUANTITY) return null;
    names.push(selection.quantity > 1 ? `${option.name} × ${selection.quantity}` : option.name);
    const additional = option.additionalPrice * selection.quantity;
    if (!validPrice(additional) || !validPrice(unitPrice + additional)) return null;
    unitPrice += additional;
  }
  for (const group of product.modifierGroups) {
    const count = group.options.filter(option => ids.has(option.id)).length;
    if (count < group.minSelections || count > group.maxSelections) return null;
  }
  if (!validPrice(unitPrice) || !validPrice(unitPrice * item.quantity)) return null;

  return {
    id, name: product.name, variantName: variant?.name ?? null, modifierNames: names, unitPrice, currency,
    item: { productId: product.id, variantId: variant?.id ?? null, quantity: item.quantity,
      specialInstruction: item.specialInstruction?.trim() || null,
      modifiers: modifiers.map(({ modifierOptionId, quantity }) => ({ modifierOptionId, quantity })) }
  };
}

/** A preview cannot safely mix currencies or round an overflowing whole-currency amount. */
export function cartSubtotal(lines: readonly CartLine[]): number | null {
  let subtotal = 0;
  const currency = lines[0]?.currency;
  for (const line of lines) {
    const amount = line.unitPrice * line.item.quantity;
    if (line.currency !== currency || !validPrice(line.unitPrice) || !Number.isInteger(line.item.quantity)
      || line.item.quantity < 1 || line.item.quantity > MAX_ITEM_QUANTITY
      || !validPrice(amount) || !validPrice(subtotal + amount)) return null;
    subtotal += amount;
  }
  return subtotal;
}

/** Recheck original selection IDs; unavailable choices are never replaced automatically. */
export function reviewCart(menu: PublicMenuResponse, lines: readonly CartLine[]) {
  const current = lines.map(line => {
    const product = findMenuProduct(menu, line.item.productId);
    return product ? prepareCartLine(line.id, product, line.item, menu.currency, lines) : null;
  });
  return { lines: current, subtotal: current.every((line): line is CartLine => line !== null) ? cartSubtotal(current) : null };
}

export function findMenuProduct(menu: PublicMenuResponse, productId: string): MenuProductDto | undefined {
  return menu.categories.flatMap(category => category.products).find(product => product.id === productId);
}

/** Reorder copies menu selection IDs and quantities. The customer confirms a new checkout separately. */
export function rebuildCart(menu: PublicMenuResponse, historicalItems: readonly OrderItemDetailDto[]) {
  const lines: CartLine[] = [];
  const unavailable: string[] = [];
  for (const [index, history] of historicalItems.entries()) {
    const product = findMenuProduct(menu, history.productId);
    const selection = {
      productId: history.productId, variantId: history.variantId, quantity: history.quantity,
      modifiers: history.modifiers.map(({ modifierOptionId, quantity }) => ({ modifierOptionId, quantity }))
    };
    const line = product && lines.length < MAX_CART_LINES
      ? prepareCartLine(`reorder-${index}`, product, selection, menu.currency, lines) : null;
    if (line) lines.push(line);
    else unavailable.push([history.productName, history.variantName].filter(Boolean).join(" · "));
  }
  return { lines, unavailable: [...new Set(unavailable)] };
}
