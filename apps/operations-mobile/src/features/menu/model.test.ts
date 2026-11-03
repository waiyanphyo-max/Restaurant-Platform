import { describe, expect, it } from "vitest";
import type { ProductManagementResponse } from "@restaurant-platform/shared-types";
import { categoryRequest, draftForProduct, modifierGroupRequest, modifierOptionRequest, productPage, productRequest, variantRequest, wholeNumber } from "./model";

const category = { id: "category", name: "Meals", displayOrder: 0, active: true };
const product: ProductManagementResponse = {
  id: "product", categoryId: category.id, name: "Noodles", description: "Rice noodles", price: 2500,
  imageUrl: "https://example.test/noodles.png", trackStock: true, stockQuantity: 3, available: true,
  createdAt: "2026-11-02T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z"
};

describe("menu forms and catalogue history", () => {
  it("uses exact nonnegative whole currency units and bounded stock quantities", () => {
    expect(wholeNumber(" 2500 ", "Price")).toBe(2500);
    for (const value of ["", "1.5", "-1", "1e3", "9007199254740992", "NaN"]) {
      expect(() => wholeNumber(value, "Price")).toThrow();
    }
    expect(() => productRequest({ ...draftForProduct(product), stockQuantity: "2147483648" }, [category])).toThrow("too large");
  });
  it("preserves image and present stock on a product edit without altering historical order snapshots", () => {
    expect(productRequest({ ...draftForProduct(product), name: " New name " }, [category])).toEqual({
      categoryId: category.id, name: "New name", description: "Rice noodles", price: 2500,
      imageUrl: product.imageUrl, trackStock: true, stockQuantity: 3, available: true
    });
    expect(product.name).toBe("Noodles");
    expect(productRequest({ ...draftForProduct(product), trackStock: false }, [category]).stockQuantity).toBeNull();
  });
  it("rejects inactive or foreign category selections and malformed names", () => {
    expect(() => productRequest(draftForProduct(product), [{ ...category, active: false }])).toThrow("active category");
    expect(() => productRequest({ ...draftForProduct(product), categoryId: "foreign" }, [category])).toThrow("active category");
    expect(() => categoryRequest(" ", "0", true)).toThrow("Category name");
    expect(() => categoryRequest("a".repeat(101), "0", true)).toThrow();
    expect(categoryRequest("Drinks", "2", false)).toEqual({ name: "Drinks", displayOrder: 2, active: false });
  });
  it("validates variant/option prices and modifier selection constraints", () => {
    expect(variantRequest("Large", "3500", false, product.imageUrl)).toEqual({ name: "Large", price: 3500, available: false, imageUrl: product.imageUrl });
    expect(modifierOptionRequest("Egg", "500", true).additionalPrice).toBe(500);
    expect(() => variantRequest("Large", "0.5", true, null)).toThrow();
    expect(() => modifierOptionRequest("", "500", true)).toThrow();
    expect(() => modifierGroupRequest("Sides", true, "0", "2", true)).toThrow("Required groups");
    expect(() => modifierGroupRequest("Sides", false, "3", "2", true)).toThrow("Maximum");
    expect(modifierGroupRequest("Sides", true, "1", "2", true).maxSelections).toBe(2);
  });
  it("searches and filters the full catalogue before paginating and clamps stale pages", () => {
    const products = Array.from({ length: 25 }, (_, i) => ({ ...product, id: String(i), name: `Noodles ${i}`, available: i % 2 === 0 }));
    expect(productPage(products, "rice", category.id, "available", 0).total).toBe(13);
    expect(productPage(products, "rice", category.id, "available", 1).products).toHaveLength(1);
    expect(productPage(products, "Noodles 24", "", "all", 20)).toMatchObject({ total: 1, pages: 1, page: 0 });
    expect(productPage(products, "no match", "", "all", 0).products).toHaveLength(0);
  });
});
