import { ApiProtocolError } from "@restaurant-platform/api-client";
import type { CreateOrderItemRequest, CreateStaffOrderRequest, CreateStaffOrderResponse, MenuProductDto, StaffOrderOptions } from "@restaurant-platform/shared-types";
import { FormValidationError } from "../../hooks/mutation";

export const MAX_COUNTER_ORDER_LINES = 50;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const receiptText = (value: unknown): value is string => typeof value === "string" && !!value.trim()
  && Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
const receiptAmount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A JSON response is not confirmation until the existing staff receipt is usable.
 * OrderService returns a new STAFF/PENDING order and pending cash-at-counter payment,
 * with no fee or discount. A malformed/contradictory receipt is an uncertain creation.
 */
export function counterOrderReceipt(value: unknown, requestedType: CreateStaffOrderRequest["orderType"]): CreateStaffOrderResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiProtocolError();
  const receipt = value as Record<string, unknown>;
  const queueAbsent = receipt.queueTicketId === null && receipt.queueNumber === null && receipt.queueDisplayCode === null;
  const queuePresent = requestedType === "TAKEAWAY" && typeof receipt.queueTicketId === "string" && uuid.test(receipt.queueTicketId)
    && typeof receipt.queueNumber === "number" && Number.isSafeInteger(receipt.queueNumber) && receipt.queueNumber > 0
    && receiptText(receipt.queueDisplayCode);
  if (typeof receipt.orderId !== "string" || !uuid.test(receipt.orderId) || !receiptText(receipt.orderNumber)
    || receipt.orderType !== requestedType || receipt.orderChannel !== "STAFF" || receipt.status !== "PENDING" || receipt.paymentStatus !== "PENDING"
    || typeof receipt.currency !== "string" || !/^[A-Z]{3}$/.test(receipt.currency)
    || !receiptAmount(receipt.subtotal) || !receiptAmount(receipt.totalAmount) || receipt.totalAmount !== receipt.subtotal
    || !queueAbsent && !queuePresent) throw new ApiProtocolError();
  return receipt as unknown as CreateStaffOrderResponse;
}

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
  if (Object.keys(modifierQuantities).some(id => !modifiers.some(option => option.modifierOptionId === id))) {
    throw new FormValidationError("A selected modifier is unavailable. Review the product choices again.");
  }
  if (instruction.trim().length > 500) throw new FormValidationError("Kitchen instructions must be 500 characters or fewer.");

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
  if (note.trim().length > 500) throw new FormValidationError("The order note must be 500 characters or fewer.");

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
    if (line.modifiers.some(modifier => !product.modifierGroups.some(group => group.options.some(option => option.id === modifier.modifierOptionId && option.available)))) {
      throw new FormValidationError(`A modifier for ${line.name} is no longer available. Remove and add the item again.`);
    }
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

/** Current-menu estimate only; the staff-order service calculates the receipt total. */
export function counterOrderEstimate(products: readonly MenuProductDto[], lines: readonly CounterOrderLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    const product = products.find(item => item.id === line.productId);
    if (!product) return null;
    const variant = product.variants.find(item => item.id === line.variantId);
    let unit = product.variants.length ? variant?.price : product.price;
    if (unit == null || !Number.isSafeInteger(unit) || unit < 0) return null;
    for (const modifier of line.modifiers) {
      const option = product.modifierGroups.flatMap(group => group.options).find(item => item.id === modifier.modifierOptionId);
      if (!option || !Number.isSafeInteger(option.additionalPrice) || option.additionalPrice < 0) return null;
      unit += option.additionalPrice * modifier.quantity;
      if (!Number.isSafeInteger(unit)) return null;
    }
    const amount = unit * line.quantity;
    total += amount;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(total) || amount < 0) return null;
  }
  return total;
}
