import type { MenuCategoryDto, MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { isProductAvailable } from "./menu";

/** Keep Burmese combining marks; normalize only Unicode representation, case and whitespace. */
export function normalizeMenuSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/gu, " ");
}

export function filterMenuCategories(menu: PublicMenuResponse, query: string, categoryId: string): MenuCategoryDto[] {
  const terms = normalizeMenuSearch(query).split(" ").filter(Boolean);
  return [...menu.categories].sort((a, b) => a.displayOrder - b.displayOrder)
    .filter(category => !categoryId || category.id === categoryId)
    .map(category => ({ ...category, products: category.products.filter(product => {
      const haystack = normalizeMenuSearch([category.name, product.name, product.description || "",
        ...product.variants.map(variant => variant.name)].join(" "));
      return terms.every(term => haystack.includes(term));
    }) })).filter(category => category.products.length > 0);
}

/** Editorial designation is never inferred from title, order, rank or another visible product. */
export function visibleFeaturedProduct(menu: PublicMenuResponse, categories: MenuCategoryDto[]): MenuProductDto | undefined {
  if (menu.featuredProduct?.status !== "AVAILABLE") return undefined;
  return categories.flatMap(category => category.products).find(product =>
    product.id === menu.featuredProduct?.productId && isProductAvailable(product));
}
