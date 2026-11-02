import type { CategoryResponse, ProductManagementResponse } from "@restaurant-platform/shared-types";
import { FormValidationError } from "../../hooks/mutation";

export interface ProductDraft {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string | null;
  trackStock: boolean;
  stockQuantity: string;
  available: boolean;
}

export function wholeNumber(value: string, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!/^\d+$/.test(value.trim())) throw new FormValidationError(`${label} must be a whole number of zero or more.`);
  const number = Number(value.trim());
  if (!Number.isSafeInteger(number) || number > maximum) throw new FormValidationError(`${label} is too large.`);
  return number;
}

export function named(value: string, label: string, maximum = 100): string {
  const name = value.trim();
  if (!name || name.length > maximum) throw new FormValidationError(`${label} must contain 1–${maximum} characters.`);
  return name;
}

export function categoryRequest(name: string, order: string, active: boolean) {
  return { name: named(name, "Category name"), displayOrder: wholeNumber(order, "Display order", 2147483647), active };
}

export function productRequest(draft: ProductDraft, categories: readonly CategoryResponse[]) {
  if (!categories.some(category => category.id === draft.categoryId && category.active)) {
    throw new FormValidationError("Choose an active category. Reactivate the category before updating its products.");
  }
  if (draft.description.trim().length > 5000) throw new FormValidationError("Description must be 5,000 characters or fewer.");
  return {
    categoryId: draft.categoryId, name: named(draft.name, "Product name", 150),
    description: draft.description.trim() || null, price: wholeNumber(draft.price, "Price"),
    imageUrl: draft.imageUrl, trackStock: draft.trackStock,
    stockQuantity: draft.trackStock ? wholeNumber(draft.stockQuantity, "Stock quantity", 2147483647) : null,
    available: draft.available
  };
}

export function variantRequest(name: string, price: string, available: boolean, imageUrl: string | null) {
  return { name: named(name, "Variant name"), price: wholeNumber(price, "Variant price"), available, imageUrl };
}

export function modifierGroupRequest(name: string, required: boolean, minimum: string, maximum: string, active: boolean) {
  const minSelections = wholeNumber(minimum, "Minimum selections", 2147483647);
  const maxSelections = wholeNumber(maximum, "Maximum selections", 2147483647);
  if (maxSelections < minSelections || required && minSelections < 1) {
    throw new FormValidationError("Maximum must be at least the minimum. Required groups need a minimum of at least 1.");
  }
  return { name: named(name, "Group name"), required, minSelections, maxSelections, active };
}

export function modifierOptionRequest(name: string, price: string, available: boolean) {
  return { name: named(name, "Option name"), additionalPrice: wholeNumber(price, "Additional price"), available };
}

/** The API returns the full catalogue; these filters and pages are explicitly local. */
export function productPage(products: readonly ProductManagementResponse[], search: string, categoryId: string,
  availability: "all" | "available" | "unavailable", page: number, size = 12) {
  const searchTerm = search.trim().toLocaleLowerCase();
  const matching = products.filter(product => (!categoryId || product.categoryId === categoryId)
    && (availability === "all" || product.available === (availability === "available"))
    && (!searchTerm || `${product.name} ${product.description ?? ""}`.toLocaleLowerCase().includes(searchTerm)));
  const pages = Math.max(1, Math.ceil(matching.length / size));
  const currentPage = Math.max(0, Math.min(page, pages - 1));
  return { products: matching.slice(currentPage * size, (currentPage + 1) * size), total: matching.length, pages, page: currentPage };
}

export function draftForProduct(product?: ProductManagementResponse, categoryId = ""): ProductDraft {
  return product ? {
    categoryId: product.categoryId, name: product.name, description: product.description ?? "",
    price: Number.isSafeInteger(product.price) ? String(product.price) : "", imageUrl: product.imageUrl,
    trackStock: product.trackStock, stockQuantity: product.stockQuantity === null ? "" : String(product.stockQuantity), available: product.available
  } : { categoryId, name: "", description: "", price: "", imageUrl: null, trackStock: false, stockQuantity: "", available: true };
}
