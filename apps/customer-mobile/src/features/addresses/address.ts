import type { CustomerAddressRequest, CustomerAddressResponse } from "@restaurant-platform/shared-types";
import { emptyPin, validCoordinates, type PinSelection } from "./location";

export interface AddressForm {
  label: string;
  recipientName: string;
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
  if (!form.label.trim() || !form.township.trim() || !form.city.trim()) return "Enter an address label, township or area, and city.";
  const limits: Record<Exclude<keyof AddressForm, "makeDefault">, number> = {
    label: 50, recipientName: 150, houseNo: 50, street: 100, ward: 100, township: 100, city: 100, deliveryNote: 2000
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
