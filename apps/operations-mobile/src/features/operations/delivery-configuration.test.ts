import { describe, expect, it } from "vitest";
import type { DeliveryZoneResponse } from "@restaurant-platform/shared-types";
import { confirmedZone, createZoneDraft, zoneAmount, zoneRequest, zoneSnapshot } from "./delivery-configuration";

const original: DeliveryZoneResponse = { id: "zone-a", restaurantId: "restaurant-a", name: "Original zone", deliveryFee: 1200,
  minimumOrder: 4500, active: true, coverageCity: " Original legacy city ", coverageTownship: "Original township", regionId: null, districtId: null, townshipId: null };
const location = { regionId: "region", districtId: "district", townshipId: "township", regionName: "Current region", districtName: "Current district", township: "Current township" };

describe("reviewed delivery-zone contract", () => {
  it("preserves original legacy labels and prices in the draft without manufacturing geographic IDs", () => {
    expect(createZoneDraft(original)).toMatchObject({ fee: "1200", minimum: "4500", replaceCoverage: false,
      location: { regionId: "", districtId: "", townshipId: "", township: "Original township" } });
    const body = zoneRequest({ ...createZoneDraft(original), name: "Reviewed name", active: false }, original);
    expect(body).toEqual({ name: "Reviewed name", deliveryFee: 1200, minimumOrder: 4500, active: false });
    expect(original.coverageCity).toBe(" Original legacy city ");
  });
  it("requires an active fully selected canonical chain for new or replaced coverage", () => {
    const draft = { ...createZoneDraft(), name: "New zone", location };
    expect(() => zoneRequest(draft)).toThrow("active Region");
    expect(() => zoneRequest({ ...draft, location: { ...location, districtId: "" } }, undefined, true)).toThrow("active Region");
    expect(zoneRequest(draft, undefined, true)).toEqual({ name: "New zone", deliveryFee: 0, minimumOrder: 0, active: true,
      regionId: "region", districtId: "district", townshipId: "township", coverageCity: "Current region", coverageTownship: "Current township" });
  });
  it("requires reviewed canonical coverage before re-enabling an old zone", () => {
    const inactive = { ...original, active: false };
    expect(() => zoneRequest({ ...createZoneDraft(inactive), active: true }, inactive)).toThrow("before re-enabling");
    expect(zoneRequest({ ...createZoneDraft(inactive), active: true, replaceCoverage: true, location }, inactive, true).townshipId).toBe("township");
  });
  it.each(["-1", "1.1", "1e3", "", "9007199254740992"])("rejects invalid or inexact whole amounts %j", value => {
    expect(() => zoneAmount(value, "Delivery fee")).toThrow("non-negative whole");
  });
  it("keeps the maximum safe whole amount exact and validates names before review", () => {
    expect(zoneAmount(" 9007199254740991 ", "Fee")).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => zoneRequest({ ...createZoneDraft(original), name: " " }, original)).toThrow("Zone name");
    expect(() => zoneRequest({ ...createZoneDraft(original), name: "x".repeat(101) }, original)).toThrow("100");
  });
  it("requires the server to confirm tenant, zone, reviewed values and preserved legacy coverage", () => {
    const body = zoneRequest(createZoneDraft(original), original);
    expect(confirmedZone({ ...original }, body, original.restaurantId, original)).toEqual(original);
    for (const changed of [{ restaurantId: "restaurant-b" }, { id: "zone-b" }, { deliveryFee: 999 }, { coverageCity: "Normalized without review" }]) {
      expect(() => confirmedZone({ ...original, ...changed }, body, original.restaurantId, original)).toThrow("not confirm");
    }
  });
  it("detects changed coverage and fees while ignoring response-only property ordering", () => {
    expect(zoneSnapshot({ ...original })).toBe(zoneSnapshot(original));
    expect(zoneSnapshot({ ...original, deliveryFee: 1300 })).not.toBe(zoneSnapshot(original));
    expect(zoneSnapshot({ ...original, townshipId: "different" })).not.toBe(zoneSnapshot(original));
    expect(zoneSnapshot({ ...original, restaurantId: "restaurant-b" })).not.toBe(zoneSnapshot(original));
  });
});
