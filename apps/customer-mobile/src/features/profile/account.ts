import { ApiProtocolError } from "@restaurant-platform/api-client";
import type { CustomerAddressResponse, CustomerProfileResponse } from "@restaurant-platform/shared-types";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string";
const nullableText = (value: unknown) => value === null || text(value);
const coordinate = (value: unknown, limit: number) => value === null || typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;

export function checkedProfile(value: unknown, owner: string): CustomerProfileResponse {
  if (!record(value) || !text(value.id) || (value.id as string).toLowerCase() !== owner.toLowerCase() ||
    ![value.fullName, value.phone, value.preferredLanguage, value.avatarUrl].every(nullableText) ||
    ![value.createdAt, value.updatedAt].every(text)) throw new ApiProtocolError();
  return value as unknown as CustomerProfileResponse;
}

export function checkedAddresses(value: unknown): CustomerAddressResponse[] {
  if (!Array.isArray(value) || !value.every(address => record(address) && text(address.id) && address.id !== "" &&
    [address.label, address.city, address.township, address.createdAt, address.updatedAt].every(text) &&
    [address.recipientName, address.houseNo, address.street, address.ward, address.deliveryNote].every(nullableText) &&
    typeof address.isDefault === "boolean" && coordinate(address.latitude, 90) && coordinate(address.longitude, 180))) throw new ApiProtocolError();
  return value as CustomerAddressResponse[];
}
