import type { CustomerAddressRequest, CustomerAddressResponse, LocationSelection } from "@restaurant-platform/shared-types";
import { emptyPin, validCoordinates, type PinSelection } from "./location";

export interface AddressForm extends LocationSelection {
  label: string;
  recipientName: string;
  recipientPhone: string;
  houseNo: string;
  street: string;
  ward: string;
  township: string;
  city: string;
  deliveryNote: string;
  makeDefault: boolean;
}

export function initialAddressForm(address?: CustomerAddressResponse): AddressForm {
  return {
    label: address?.label ?? "Home",
    recipientName: address?.recipientName ?? "",
    recipientPhone: address?.recipientPhone ?? "",
    regionId: address?.regionId ?? "",
    districtId: address?.districtId ?? "",
    townshipId: address?.townshipId ?? "",
    regionName: address?.regionName ?? "",
    districtName: address?.districtName ?? "",
    houseNo: address?.houseNo ?? "",
    street: address?.street ?? "",
    ward: address?.ward ?? "",
    township: address?.township ?? "",
    city: address?.city ?? "",
    deliveryNote: address?.deliveryNote ?? "",
    makeDefault: address?.isDefault ?? true
  };
}

export function savedPin(address?: CustomerAddressResponse): PinSelection {
  if (address?.latitude == null || address.longitude == null) return { ...emptyPin };
  const coordinates = { latitude: address.latitude, longitude: address.longitude };
  return validCoordinates(coordinates) ? { coordinates, confirmed: true, source: "saved" } : { ...emptyPin };
}

export function validateAddress(form: AddressForm, pin: PinSelection): string | null {
  if (!form.label.trim()) return "Enter an address label.";
  if (!form.regionId || !form.districtId || !form.townshipId) return "Select Region / State, District and Township. Review legacy addresses before saving.";
  const limits = {
    label: 50, recipientName: 150, recipientPhone: 30, houseNo: 50, street: 100, ward: 100, township: 100, city: 100, deliveryNote: 2000
  };
  if ((Object.keys(limits) as (keyof typeof limits)[]).some(key => form[key].trim().length > limits[key])) {
    return "One or more address fields exceed the supported length. Shorten the address and try again.";
  }
  if (pin.coordinates && (!pin.confirmed || !validCoordinates(pin.coordinates))) return "Confirm your selected location on the map before saving.";
  return null;
}

/** Only existing address DTO fields; no user ID, restaurant ID, or profile writes. */
export function addressRequest(form: AddressForm, pin: PinSelection): CustomerAddressRequest {
  const error = validateAddress(form, pin);
  if (error) throw new Error(error);
  return {
    label: form.label.trim(),
    recipientName: form.recipientName.trim() || null,
    recipientPhone: form.recipientPhone.trim() || null,
    regionId: form.regionId,
    districtId: form.districtId,
    townshipId: form.townshipId,
    houseNo: form.houseNo.trim() || null,
    street: form.street.trim() || null,
    ward: form.ward.trim() || null,
    township: form.township.trim(),
    city: form.city.trim(),
    deliveryNote: form.deliveryNote.trim() || null,
    latitude: pin.coordinates?.latitude ?? null,
    longitude: pin.coordinates?.longitude ?? null,
    makeDefault: form.makeDefault
  };
}
