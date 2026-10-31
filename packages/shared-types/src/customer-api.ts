import type { CreateOrderItemRequest, IsoDateTime, Uuid } from "./api.js";

export interface CustomerProfileResponse {
  id: Uuid;
  fullName: string | null;
  phone: string | null;
  preferredLanguage: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  avatarUrl: string | null;
}

/** This profile phone is contact text, never a verified Auth phone identity. */
export interface CustomerProfileRequest {
  fullName: string;
  phone: string;
  preferredLanguage: "my-MM" | "en";
}

export interface CustomerAddressResponse {
  id: Uuid;
  label: string;
  recipientName: string | null;
  houseNo: string | null;
  street: string | null;
  ward: string | null;
  township: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  deliveryNote: string | null;
  isDefault: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CustomerAddressRequest {
  label: string;
  recipientName?: string | null;
  houseNo?: string | null;
  street?: string | null;
  ward?: string | null;
  township: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  deliveryNote?: string | null;
  makeDefault: boolean;
}

export interface DeliveryZoneDto {
  id: Uuid;
  name: string;
  deliveryFee: number;
  minimumOrder: number;
  coverageCity: string | null;
  coverageTownship: string | null;
}

export interface CreateDeliveryOrderRequest {
  addressId: Uuid;
  deliveryZoneId: Uuid;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryNote?: string | null;
  paymentMethod?: string | null;
  items: CreateOrderItemRequest[];
}
