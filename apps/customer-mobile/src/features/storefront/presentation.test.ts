import { describe, expect, it } from "vitest";
import type { MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { featuredProduct, filterMenu, formatMoney, normalizeMenuSearch } from "./presentation";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const dish: MenuProductDto = { id: "33333333-3333-4333-8333-333333333333", name: "ခေါက်ဆွဲ Noodles", description: "Fresh rice noodles",
  price: 1750, imageUrl: "https://media-a.example.test/dish.png", available: true, trackStock: false, stockQuantity: null,
  variants: [], modifierGroups: [] };
const menu: PublicMenuResponse = { restaurantId: a, restaurantName: "Synthetic Restaurant A", slug: null, description: null,
  logoUrl: null, address: null, phone: null, currency: "MMK", categories: [{ id: "44444444-4444-4444-8444-444444444444", name: "Meals", displayOrder: 0, products: [dish] }],
  featuredProduct: { status: "AVAILABLE", productId: dish.id } };

describe("Customer menu presentation with independent synthetic tenants", () => {
  it("shows only the eligible backend Featured UUID", () => {
    expect(featuredProduct(menu)?.id).toBe(dish.id);
    for (const featured of [undefined, { status: "NONE", productId: null }, { status: "UNAVAILABLE", productId: dish.id },
      { status: "AVAILABLE", productId: b }] as const) {
      expect(featuredProduct({ ...menu, featuredProduct: featured })).toBeUndefined();
    }
    for (const product of [{ ...dish, available: false }, { ...dish, trackStock: true, stockQuantity: 0 },
      { ...dish, variants: [{ id: b, name: "Bowl", price: 2500, imageUrl: null, available: false }] }]) {
      expect(featuredProduct({ ...menu, categories: [{ ...menu.categories[0], products: [product] }] })).toBeUndefined();
    }
    const other: PublicMenuResponse = { ...menu, restaurantId: b, restaurantName: "Synthetic Restaurant B", currency: "THB",
      categories: [{ ...menu.categories[0], id: b, name: "Soup", products: [{ ...dish, id: b, name: "Blue kitchen soup", price: 85 }] }],
      featuredProduct: { status: "NONE", productId: null } };
    expect(filterMenu(other, "", null)[0].products[0].name).toBe("Blue kitchen soup");
    expect(featuredProduct(other)).toBeUndefined();
    expect(featuredProduct(menu)?.name).toBe(dish.name);
  });

  it("normalizes English/Unicode whitespace while retaining Burmese combining marks and variant search", () => {
    expect(normalizeMenuSearch("  NOODLES　 ")).toBe("noodles");
    const burmese = "ခေါက်ဆွဲ";
    expect(normalizeMenuSearch(burmese)).toBe(burmese.normalize("NFKC"));
    expect(filterMenu(menu, `${burmese} noodles`, null)[0].products[0].id).toBe(dish.id);
    expect(filterMenu(menu, "noodles missing", null)).toEqual([]);
    const variants = { ...menu, categories: [{ ...menu.categories[0], products: [{ ...dish,
      variants: [{ id: b, name: "Family bowl", price: 3000, imageUrl: null, available: true }] }] }] };
    expect(filterMenu(variants, "FAMILY", null)[0].products[0].id).toBe(dish.id);
  });

  it("returns to All Categories when a previously selected category disappears", () => {
    expect(filterMenu(menu, "", b)).toEqual(menu.categories);
    expect(featuredProduct(menu, filterMenu(menu, "no match", null))).toBeUndefined();
  });

  it("keeps exact whole-currency values without truncation or floating point rounding", () => {
    expect(formatMoney(1750, "MMK", "en")).toBe("1,750 MMK");
    expect(formatMoney(85, "THB", "en")).toBe("85 THB");
    for (const currency of [null, undefined, "", " "]) expect(formatMoney(3000, currency, "en")).toBe("3,000");
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "MMK", "en")).toBe("9,007,199,254,740,991 MMK");
    for (const amount of [1.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(formatMoney(amount, "MMK", "en")).toBe("—");
    expect(formatMoney(1750, "MMK", "my-MM")).toBe(`${(1750).toLocaleString("my-MM")} MMK`);
  });
});
