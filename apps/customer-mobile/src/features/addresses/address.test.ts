import { describe, expect, it } from "vitest";
import type { CustomerAddressResponse } from "@restaurant-platform/shared-types";
import { addressRequest, initialAddressForm, savedPin, validateAddress } from "./address";
import { confirmPin, emptyPin, selectPin } from "./location";

const saved: CustomerAddressResponse = {
  id: "00000000-0000-4000-8000-000000000001", label: "Home", recipientName: "Customer",
  houseNo: "Room 4", street: "Main Street", ward: null, township: "Dagon", city: "Yangon",
  latitude: 16.8409, longitude: 96.1735, deliveryNote: "Near the school", isDefault: true,
  createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z"
};

describe("customer address onboarding", () => {
  it("starts with Home and default preference without requiring GPS", () => {
    const form = initialAddressForm();
    expect(form.label).toBe("Home");
    expect(form.makeDefault).toBe(true);
    expect(savedPin()).toEqual(emptyPin);
    expect(validateAddress(form, emptyPin)).toMatch(/township/);
  });

  it("supports manual address setup without location permission or coordinates", () => {
    const form = { ...initialAddressForm(), township: " Dagon ", city: " Yangon " };
    expect(validateAddress(form, emptyPin)).toBeNull();
    expect(addressRequest(form, emptyPin)).toMatchObject({ label: "Home", township: "Dagon", city: "Yangon", latitude: null, longitude: null });
  });

  it("blocks saving a pin until the customer explicitly confirms", () => {
    const form = initialAddressForm(saved);
    const selected = selectPin({ latitude: 17, longitude: 96 }, "map");
    expect(validateAddress(form, selected)).toMatch(/Confirm/);
    expect(() => addressRequest(form, selected)).toThrow("Confirm");
    expect(addressRequest(form, confirmPin(selected))).toMatchObject({ latitude: 17, longitude: 96 });
  });

  it("preserves saved coordinates when updating owned address details", () => {
    const form = { ...initialAddressForm(saved), deliveryNote: "New landmark" };
    expect(addressRequest(form, savedPin(saved))).toMatchObject({ latitude: saved.latitude, longitude: saved.longitude, deliveryNote: "New landmark" });
    expect(saved.deliveryNote).toBe("Near the school");
  });

  it("never adds customer identity, restaurant identity, or profile phone to mutations", () => {
    const request = addressRequest(initialAddressForm(saved), savedPin(saved));
    expect(Object.keys(request).sort()).toEqual([
      "city", "deliveryNote", "houseNo", "label", "latitude", "longitude", "makeDefault", "recipientName", "street", "township", "ward"
    ]);
  });

  it("ignores incomplete or invalid saved coordinates", () => {
    expect(savedPin({ ...saved, latitude: null })).toEqual(emptyPin);
    expect(savedPin({ ...saved, longitude: 181 })).toEqual(emptyPin);
  });

  it("preserves an explicit non-default preference", () => {
    const form = initialAddressForm({ ...saved, isDefault: false, label: "Work" });
    expect(addressRequest(form, savedPin(saved)).makeDefault).toBe(false);
  });

  it.each([
    { label: "" }, { label: " " }, { township: "" }, { city: " " },
    { recipientName: "x".repeat(151) }, { label: "x".repeat(51) }, { houseNo: "x".repeat(51) },
    { street: "x".repeat(101) }, { ward: "x".repeat(101) }, { township: "x".repeat(101) },
    { city: "x".repeat(101) }, { deliveryNote: "x".repeat(2001) }
  ])("validates backend-compatible field requirements and limits: %j", changes => {
    expect(validateAddress({ ...initialAddressForm(saved), ...changes }, savedPin(saved))).not.toBeNull();
  });
});
