import type { ShoppingLineInput, ShoppingLine } from "@restaurant-platform/shared-types";
import { purchaseQuantity } from "./procurement-format";

export type PlanningDraftLine = ShoppingLineInput & { name: string };

export function copyShoppingLines(lines: readonly ShoppingLine[]): PlanningDraftLine[] {
  return lines.map(line => ({ itemId: line.itemId, name: line.itemName, quantity: line.quantity, unit: line.unit }));
}

export function validateShoppingLines(lines: readonly PlanningDraftLine[]): ShoppingLineInput[] {
  if (!lines.length || lines.length > 200) throw new Error("Choose between 1 and 200 shopping items.");
  const items = new Set<string>();
  return lines.map(line => {
    if (items.has(line.itemId)) throw new Error(`Combine duplicate rows for ${line.name} before saving.`);
    items.add(line.itemId);
    const unit = line.unit.trim();
    if (!unit || unit.length > 30) throw new Error(`Enter a unit of up to 30 characters for ${line.name}.`);
    return { itemId: line.itemId, quantity: purchaseQuantity(line.quantity.trim()), unit };
  });
}
