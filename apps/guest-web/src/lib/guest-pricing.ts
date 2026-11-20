import type { MenuProductDto } from "@restaurant-platform/shared-types";
import { validateCartSelection, type ItemSelection } from "./guest-order";

/** Informational whole-currency estimate only. Spring validates and prices checkout. */
export function selectionEstimate(product: MenuProductDto, selection: ItemSelection): number | null {
  if (!validateCartSelection(product, selection)) return null;
  const base = product.variants.length
    ? product.variants.find(variant => variant.id === selection.variantId)?.price
    : product.price;
  if (base === null || base === undefined) return null;
  let unit = base;
  for (const selected of selection.modifiers ?? []) {
    const option = product.modifierGroups.flatMap(group => group.options)
      .find(item => item.id === selected.modifierOptionId);
    if (!option) return null;
    unit += option.additionalPrice * selected.quantity;
    if (!Number.isSafeInteger(unit)) return null;
  }
  const total = unit * selection.quantity;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

export function sumEstimates(amounts: (number | null)[]): number | null {
  if (!amounts.length || amounts.some(amount => amount === null)) return null;
  const total = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}
