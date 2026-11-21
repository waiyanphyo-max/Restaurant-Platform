import { describe, expect, it } from "vitest";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { CustomerAddressResponse } from "@restaurant-platform/shared-types";
import { confirmPin, selectPin } from "../addresses/location";
import { checkoutError, checkoutFieldErrors, destinationProblem, quoteRequest, type DestinationDetails } from "./destination";

const saved: CustomerAddressResponse = {
  id: "home", regionId: "region", districtId: "district", townshipId: "township", regionName: "Yangon", districtName: "East Yangon", label: "Home", recipientName: "Customer", houseNo: "12", street: "Main Road", ward: "Ward 1",
  township: "Tamwe", city: "Yangon", latitude: null, longitude: null, deliveryNote: null, isDefault: true, createdAt: "", updatedAt: ""
};
const details: DestinationDetails = { regionId: "region", districtId: "district", townshipId: "township", recipientName: " Customer ", recipientPhone: "09 942-123-456", deliveryNote: " Blue door ",
  address: " Room 4, Main Road, Ward 1 ", city: " Yangon ", township: " Tamwe " };
const items = [{ productId: "product", quantity: 1 }];
const t = (english: string) => english;

describe("delivery destination contract", () => {
  it.each(["INVALID_MODIFIER_SELECTION_COUNT", "DUPLICATE_MODIFIER_OPTION"])("directs invalid current selections %s to cart repair", code => {
    expect(checkoutError(new ApiHttpError(400, code), t)).toContain("Review your cart");
  });
  it("offers a text destination after invalid coordinates without weakening the coordinate contract", () => {
    expect(checkoutError(new ApiHttpError(400, "INVALID_DELIVERY_COORDINATES"), t)).toContain("confirm a new pin, or use a text address");
  });
  it("maps only recognized server fields with localized safe messages", () => {
    const errors = checkoutFieldErrors(new ApiHttpError(400, "VALIDATION_FAILED", [
      { field: "recipientPhone", message: "private server detail" },
      { field: "temporaryDestination.street", message: "private server detail" },
      { field: "unknown", message: "private server detail" }
    ]), t);
    expect(Object.keys(errors)).toEqual(["recipientPhone", "street"]);
    expect(errors.recipientPhone).toContain("Myanmar phone number");
    expect(JSON.stringify(errors)).not.toContain("private server detail");
  });
  it("accepts complete saved text addresses without inventing coordinates or replacing their address fields", () => {
    expect(quoteRequest({ saved }, details, items)).toEqual({ addressId: "home", recipientName: "Customer",
      recipientPhone: "+959942123456", deliveryNote: "Blue door", items });
  });

  it("creates a temporary MANUAL_TEXT request with no coordinates", () => {
    expect(quoteRequest({ text: true }, details, items)).toEqual({ recipientName: "Customer", recipientPhone: "+959942123456",
      deliveryNote: "Blue door", items, temporaryDestination: { source: "MANUAL_TEXT", address: "Room 4, Main Road, Ward 1", city: "Yangon", township: "Tamwe", regionId: "region", districtId: "district", townshipId: "township", ward: null, street: null, houseNo: null } });
  });

  it.each([
    [{ address: " " }, "detailed street"], [{ recipientName: " " }, "recipient name"],
    [{ regionId: "" }, "Region / State"], [{ townshipId: "" }, "Region / State"],
    [{ recipientPhone: "invalid" }, "Myanmar phone number"]
  ] as const)("explains and rejects incomplete text checkout details %j", (changes, message) => {
    const invalid = { ...details, ...changes };
    expect(destinationProblem({ text: true }, invalid, t)).toContain(message);
    expect(quoteRequest({ text: true }, invalid, items)).toBeNull();
  });

  it.each([
    { houseNo: null, street: null, ward: null }, { regionId: "" }, { townshipId: "" }, { districtId: "" },
    { latitude: 16.8 }, { longitude: 96.1 }, { latitude: 91, longitude: 96.1 },
    { latitude: 16.8, longitude: Number.NaN }
  ])("rejects incomplete saved details or invalid supplied coordinates %j", changes => {
    expect(quoteRequest({ saved: { ...saved, ...changes } }, details, items)).toBeNull();
  });

  it.each(["map", "gps"] as const)("preserves confirmed %s requests and rejects an unconfirmed map pin", source => {
    const pin = selectPin({ latitude: 16.8, longitude: 96.1 }, source);
    expect(quoteRequest({ pin }, details, items)).toBeNull();
    expect(quoteRequest({ pin: confirmPin(pin) }, details, items)?.temporaryDestination).toEqual({
      source: source === "map" ? "MANUAL_MAP" : "GPS_CONFIRMED", address: "Room 4, Main Road, Ward 1",
      city: "Yangon", township: "Tamwe", regionId: "region", districtId: "district", townshipId: "township", ward: null, street: null, houseNo: null, latitude: 16.8, longitude: 96.1
    });
    expect(quoteRequest({ saved: { ...saved, latitude: 16.8, longitude: 96.1 } }, details, items)?.addressId).toBe("home");
  });
});
