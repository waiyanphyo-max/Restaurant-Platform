import type { MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { describe, expect, it } from "vitest";
import { filterMenuCategories, normalizeMenuSearch, visibleFeaturedProduct } from "./menu-presentation";

const first: MenuProductDto = {
  id: "11111111-1111-4111-8111-111111111111", name: "Featured rice", description: "Crisp vegetables",
  price: 1750, imageUrl: null, available: true, trackStock: false, stockQuantity: null, variants: [], modifierGroups: [],
};
const selected: MenuProductDto = { ...first, id: "22222222-2222-4222-8222-222222222222", name: "လက်ဖက်ရည် Tea",
  description: "Fresh jasmine", variants: [{ id: "33333333-3333-4333-8333-333333333333", name: "Family pot",
    price: 4300, available: true, imageUrl: null }] };
const menu: PublicMenuResponse = {
  restaurantId: "44444444-4444-4444-8444-444444444444", restaurantName: "Synthetic A", slug: null,
  description: null, phone: null, address: null, logoUrl: null, currency: "MMK",
  featuredProduct: { productId: selected.id, status: "AVAILABLE" }, categories: [
    { id: "55555555-5555-4555-8555-555555555555", name: "Drinks", displayOrder: 2, products: [selected] },
    { id: "66666666-6666-4666-8666-666666666666", name: "Kitchen", displayOrder: -1, products: [first] },
    { id: "77777777-7777-4777-8777-777777777777", name: "Empty", displayOrder: 0, products: [] },
  ],
};

describe("tenant menu presentation", () => {
  it("matches normalized case, whitespace and Unicode without removing Burmese marks", () => {
    expect(normalizeMenuSearch("  ＴＥＡ\n  Family  ")).toBe("tea family");
    expect(normalizeMenuSearch("လက်ဖက်ရည်")).toBe("လက်ဖက်ရည်");
    expect(filterMenuCategories(menu, "  TEA\nJASMINE  ", "")[0].products).toEqual([selected]);
    expect(filterMenuCategories(menu, "လက်ဖက်ရည်", "")[0].products).toEqual([selected]);
  });

  it("searches actual category, product, description and variant names with every term required", () => {
    for (const query of ["drinks", "tea", "jasmine", "family pot", "tea drinks family"]) {
      expect(filterMenuCategories(menu, query, "").flatMap(category => category.products)).toEqual([selected]);
    }
    expect(filterMenuCategories(menu, "tea vegetables", "")).toEqual([]);
  });

  it("combines exact backend category IDs with search and fails closed for unknown categories", () => {
    const kitchen = menu.categories[1].id;
    expect(filterMenuCategories(menu, "", kitchen).flatMap(category => category.products)).toEqual([first]);
    expect(filterMenuCategories(menu, "tea", kitchen)).toEqual([]);
    expect(filterMenuCategories(menu, "", "unknown-category")).toEqual([]);
  });

  it("keeps backend ordering and source data immutable and omits empty categories", () => {
    const original = JSON.stringify(menu);
    const result = filterMenuCategories(menu, "", "");
    expect(result.map(category => category.name)).toEqual(["Kitchen", "Drinks"]);
    expect(result[0].products[0]).toBe(first);
    expect(JSON.stringify(menu)).toBe(original);
  });

  it("never takes catalog or Featured selection from another tenant", () => {
    const b: PublicMenuResponse = { ...menu, restaurantId: "88888888-8888-4888-8888-888888888888", restaurantName: "Synthetic B",
      categories: [{ ...menu.categories[0], products: [{ ...first, id: "99999999-9999-4999-8999-999999999999", name: "Blue soup" }] }],
      featuredProduct: { productId: null, status: "NONE" } };
    expect(filterMenuCategories(b, "tea", "")).toEqual([]);
    expect(visibleFeaturedProduct(b, b.categories)).toBeUndefined();
    expect(visibleFeaturedProduct(menu, menu.categories)).toBe(selected);
  });

  it("uses only the exact AVAILABLE backend UUID visible in the active filtered menu", () => {
    expect(visibleFeaturedProduct(menu, filterMenuCategories(menu, "", ""))).toBe(selected);
    expect(visibleFeaturedProduct(menu, filterMenuCategories(menu, "rice", ""))).toBeUndefined();
    expect(visibleFeaturedProduct(menu, filterMenuCategories(menu, "", menu.categories[1].id))).toBeUndefined();
    expect(visibleFeaturedProduct({ ...menu, featuredProduct: { productId: "foreign-product", status: "AVAILABLE" } }, menu.categories)).toBeUndefined();
  });

  it("does not infer Featured from a title, first position, absent metadata, NONE or UNAVAILABLE", () => {
    for (const featuredProduct of [undefined, { productId: null, status: "NONE" as const },
      { productId: selected.id, status: "UNAVAILABLE" as const }]) {
      expect(visibleFeaturedProduct({ ...menu, featuredProduct }, menu.categories)).toBeUndefined();
    }
  });

  it.each([
    { available: false }, { trackStock: true, stockQuantity: 0 }, { trackStock: true, stockQuantity: null },
    { variants: [{ ...selected.variants[0], available: false }] },
    { variants: [{ ...selected.variants[0], price: null }] },
    { modifierGroups: [{ id: "required-group", name: "Required", required: true, minSelections: 1, maxSelections: 1, options: [] }] },
  ] satisfies Partial<MenuProductDto>[])("removes Featured advertising when current availability fails: %j", change => {
    const categories = [{ ...menu.categories[0], products: [{ ...selected, ...change }] }];
    expect(visibleFeaturedProduct(menu, categories)).toBeUndefined();
  });
});
