import type { MenuCategoryDto, MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { productAvailable } from "../cart/cart";

/** Whole-currency values are exact safe integers, never rounded floats. */
export function formatMoney(value: number, currency: string | null | undefined, language: string): string {
  if (!Number.isSafeInteger(value) || value < 0) return "—";
  const amount = value.toLocaleString(language, { maximumFractionDigits: 0 });
  const code = typeof currency === "string" ? currency.trim() : "";
  return code ? `${amount} ${code}` : amount;
}

/** Keep Myanmar combining marks; normalize representation, whitespace and case only. */
export function normalizeMenuSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/gu, " ");
}

export function filterMenu(menu: PublicMenuResponse, search: string, categoryId: string | null): MenuCategoryDto[] {
  const selected = menu.categories.some(category => category.id === categoryId) ? categoryId : null;
  const terms = normalizeMenuSearch(search).split(" ").filter(Boolean);
  return [...menu.categories].sort((a, b) => a.displayOrder - b.displayOrder)
    .filter(category => selected === null || category.id === selected)
    .map(category => ({ ...category, products: category.products.filter(product => {
      const text = normalizeMenuSearch([category.name, product.name, product.description ?? "",
        ...product.variants.map(variant => variant.name)].join(" "));
      return terms.every(term => text.includes(term));
    }) })).filter(category => category.products.length > 0);
}

/** Owner-curated only. No alternative designation for absent/unavailable metadata. */
export function featuredProduct(menu: PublicMenuResponse, categories = menu.categories): MenuProductDto | undefined {
  if (menu.featuredProduct?.status !== "AVAILABLE") return undefined;
  return categories.flatMap(category => category.products).find(product =>
    product.id === menu.featuredProduct?.productId && productAvailable(product));
}
