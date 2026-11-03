import type { CreateOrderItemRequest, CreateStaffOrderRequest, MenuProductDto, StaffOrderOptions } from "@restaurant-platform/shared-types";
import { FormValidationError } from "../../hooks/mutation";

export const MAX_COUNTER_ORDER_LINES = 50;

export type CounterOrderLine = Pick<CreateOrderItemRequest, "productId" | "quantity"> & {
  variantId: string | null;
  modifiers: NonNullable<CreateOrderItemRequest["modifiers"]>;
  specialInstruction: string | null;
  name: string;
  variantName: string | null;
  modifierLabels: string[];
};

function wholeQuantity(value: string, max: number, label: string): number {
  const quantity = Number(value);
  if (!/^\d+$/.test(value) || quantity < 1 || quantity > max) {
    throw new FormValidationError(`${label} must be a whole number from 1 to ${max}.`);
  }
  return quantity;
}

export function counterOrderLine(product: MenuProductDto, variantId: string, quantityInput: string,
  modifierQuantities: Readonly<Record<string, string>>, instruction: string): CounterOrderLine {
  const quantity = wholeQuantity(quantityInput.trim(), 999, "Item quantity");
  if (!product.available || product.trackStock && quantity > (product.stockQuantity ?? 0)) {
    throw new FormValidationError(`${product.name} has insufficient stock or is unavailable.`);
  }
  const variant = product.variants.find(option => option.id === variantId && option.available);
  if (product.variants.length && !variant) throw new FormValidationError("Select an available variant.");

  const modifiers: NonNullable<CreateOrderItemRequest["modifiers"]> = [];
  const modifierLabels: string[] = [];
  for (const group of product.modifierGroups) {
    const selected = group.options.filter(option => option.available && option.id in modifierQuantities);
    if (selected.length < group.minSelections || selected.length > group.maxSelections) {
      throw new FormValidationError(`${group.name} requires ${group.minSelections} to ${group.maxSelections} choices.`);
    }
    for (const option of selected) {
      const units = wholeQuantity(modifierQuantities[option.id].trim(), 10, option.name);
      modifiers.push({ modifierOptionId: option.id, quantity: units });
      modifierLabels.push(`${option.name} × ${units}`);
    }
  }
  if (modifiers.length > 20) throw new FormValidationError("An item can have at most 20 modifier choices.");

  return {
    productId: product.id, variantId: variant?.id ?? null, quantity, modifiers,
    specialInstruction: instruction.trim() || null, name: product.name, variantName: variant?.name ?? null, modifierLabels
  };
}

export function counterOrderRequest(options: StaffOrderOptions, products: readonly MenuProductDto[],
  orderType: CreateStaffOrderRequest["orderType"], tableId: string, lines: readonly CounterOrderLine[], note: string): CreateStaffOrderRequest {
  if (!lines.length || lines.length > MAX_COUNTER_ORDER_LINES) {
    throw new FormValidationError(`Add between 1 and ${MAX_COUNTER_ORDER_LINES} item lines.`);
  }
  if (orderType === "TAKEAWAY" && !options.takeawayEnabled || orderType === "DINE_IN" && !options.dineInEnabled) {
    throw new FormValidationError("This order type is currently unavailable.");
  }
  if (orderType === "DINE_IN" && !options.tables.some(table => table.id === tableId)) {
    throw new FormValidationError("Select an active dining table.");
  }

  const requestedByProduct = new Map<string, number>();
  const items = lines.map(line => {
    const product = products.find(item => item.id === line.productId);
    if (!product) throw new FormValidationError(`${line.name} is unavailable. Remove this item and refresh the menu.`);
    const requested = (requestedByProduct.get(line.productId) ?? 0) + line.quantity;
    requestedByProduct.set(line.productId, requested);
    if (product.trackStock && requested > (product.stockQuantity ?? 0)) {
      throw new FormValidationError(`The requested quantity exceeds available stock for ${product.name}.`);
    }
    const selectedModifiers = Object.fromEntries(line.modifiers.map(modifier => [modifier.modifierOptionId, String(modifier.quantity)]));
    const { productId, variantId, quantity, modifiers, specialInstruction } = counterOrderLine(
      product, line.variantId ?? "", String(line.quantity), selectedModifiers, line.specialInstruction ?? ""
    );
    if (modifiers.length !== line.modifiers.length) {
      throw new FormValidationError(`A modifier for ${line.name} is no longer available. Remove and add the item again.`);
    }
    return { productId, variantId, quantity, modifiers, specialInstruction };
  });

  return { orderType, tableId: orderType === "DINE_IN" ? tableId : null, items, note: note.trim() || null };
}
