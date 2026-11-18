import { describe, expect, it } from "vitest";
import { copyShoppingLines, validateShoppingLines } from "./shopping-plan";

describe("daily shopping planning", () => {
  const rice = { itemId: "rice", name: "ဆန်", quantity: "1.5", unit: "kg" };
  it("saves only item, decimal quantity and meaningful unit", () => {
    expect(validateShoppingLines([{ ...rice, unit: " kg " }])).toEqual([{ itemId: "rice", quantity: "1.5", unit: "kg" }]);
  });
  it.each(["", "0", "-1", "NaN", "0.0000001"])("rejects invalid quantity %s", quantity => {
    expect(() => validateShoppingLines([{ ...rice, quantity }])).toThrow("Quantity");
  });
  it("rejects missing units, duplicate items and empty sheets", () => {
    expect(() => validateShoppingLines([{ ...rice, unit: " " }])).toThrow("unit");
    expect(() => validateShoppingLines([rice, rice])).toThrow("duplicate");
    expect(() => validateShoppingLines([])).toThrow("Choose");
  });
  it("copies historical rows as independent drafts without financial or record identities", () => {
    const monday = [{ id: "line", itemId: "rice", itemName: "ဆန်", quantity: "5", unit: "kg" }];
    const tuesday = copyShoppingLines(monday);
    tuesday[0].quantity = "2";
    tuesday.push({ itemId: "eggs", name: "Eggs", quantity: "20", unit: "pcs" });
    expect(monday).toEqual([{ id: "line", itemId: "rice", itemName: "ဆန်", quantity: "5", unit: "kg" }]);
    expect(validateShoppingLines(tuesday)).toEqual([{ itemId: "rice", quantity: "2", unit: "kg" }, { itemId: "eggs", quantity: "20", unit: "pcs" }]);
  });
});
