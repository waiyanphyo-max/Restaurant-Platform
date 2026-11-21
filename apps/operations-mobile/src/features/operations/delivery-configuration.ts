import type { DeliveryZoneRequest, DeliveryZoneResponse, LocationSelection } from "@restaurant-platform/shared-types";
import { FormValidationError } from "../../hooks/mutation";

export const emptyZoneLocation = (): LocationSelection => ({ regionId: "", districtId: "", townshipId: "", regionName: "", districtName: "", township: "" });
export function zoneLocation(zone?: DeliveryZoneResponse): LocationSelection {
  return zone ? { regionId: zone.regionId ?? "", districtId: zone.districtId ?? "", townshipId: zone.townshipId ?? "",
    regionName: zone.regionName ?? "", districtName: zone.districtName ?? "", township: zone.coverageTownship ?? "" } : emptyZoneLocation();
}
export function zoneSnapshot(zone?: DeliveryZoneResponse): string {
  return JSON.stringify(zone ? [zone.id, zone.restaurantId, zone.name, zone.deliveryFee, zone.minimumOrder, zone.active,
    zone.coverageCity, zone.coverageTownship, zone.regionId ?? null, zone.districtId ?? null, zone.townshipId ?? null,
    zone.regionName ?? null, zone.districtName ?? null] : null);
}
export function zoneAmount(value: string, label: string): number {
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) throw new FormValidationError(`${label} must be a non-negative whole amount within the supported range.`);
  return Number(value);
}
export interface ZoneDraft {
  name: string; fee: string; minimum: string; active: boolean; location: LocationSelection; replaceCoverage: boolean;
}
export function createZoneDraft(zone?: DeliveryZoneResponse): ZoneDraft {
  return { name: zone?.name ?? "", fee: String(zone?.deliveryFee ?? 0), minimum: String(zone?.minimumOrder ?? 0),
    active: zone?.active ?? true, location: zoneLocation(zone), replaceCoverage: !zone };
}
export function zoneRequest(draft: ZoneDraft, original?: DeliveryZoneResponse, activeSelection = false): DeliveryZoneRequest {
  const name = draft.name.trim();
  if (!name || name.length > 100) throw new FormValidationError("Zone name is required and must be at most 100 characters.");
  const base: DeliveryZoneRequest = { name, deliveryFee: zoneAmount(draft.fee, "Delivery fee"), minimumOrder: zoneAmount(draft.minimum, "Minimum order"), active: draft.active };
  if (original && !draft.replaceCoverage) {
    if (draft.active && !original.active) throw new FormValidationError("Review an active canonical Region / State, District and Township before re-enabling this zone.");
    // Omitting every coverage field is the existing Spring contract for preserving
    // the original coverage, including exact legacy labels. Never infer an ID.
    return base;
  }
  const location = draft.location;
  if (!activeSelection || !location.regionId || !location.districtId || !location.townshipId) throw new FormValidationError("Select an active Region / State, District and Township before saving coverage.");
  return { ...base, regionId: location.regionId, districtId: location.districtId, townshipId: location.townshipId,
    coverageCity: location.regionName, coverageTownship: location.township };
}
export function confirmedZone(value: DeliveryZoneResponse, request: DeliveryZoneRequest, restaurantId: string, original?: DeliveryZoneResponse): DeliveryZoneResponse {
  if (!value || value.restaurantId !== restaurantId || !value.id || original && value.id !== original.id
    || value.name !== request.name || value.deliveryFee !== request.deliveryFee || value.minimumOrder !== request.minimumOrder || value.active !== request.active
    || request.townshipId && (value.regionId !== request.regionId || value.districtId !== request.districtId || value.townshipId !== request.townshipId)
    || original && !request.townshipId && ["coverageCity", "coverageTownship", "regionId", "districtId", "townshipId"].some(key =>
      (value[key as keyof DeliveryZoneResponse] ?? null) !== (original[key as keyof DeliveryZoneResponse] ?? null))) {
    throw new FormValidationError("The server did not confirm the reviewed zone. Refresh and reconcile before another save.");
  }
  return value;
}
