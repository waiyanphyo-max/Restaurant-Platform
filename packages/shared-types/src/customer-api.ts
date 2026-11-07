import type { CreateOrderItemRequest, IsoDateTime, Uuid } from "./api.js";
import type { OrderItemDetailDto } from "./member-api.js";

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

export type TemporaryLocationSource = "MANUAL_MAP" | "GPS_CONFIRMED";
export type DeliveryLocationSource = "SAVED_ADDRESS" | TemporaryLocationSource;

export interface TemporaryDeliveryDestination {
  source: TemporaryLocationSource;
  address: string;
  city: string;
  township: string;
  latitude: number;
  longitude: number;
}

export type DeliveryQuoteRequest = {
  recipientName: string;
  recipientPhone: string;
  deliveryNote?: string | null;
  items: CreateOrderItemRequest[];
} & ({ addressId: Uuid; temporaryDestination?: never }
  | { addressId?: never; temporaryDestination: TemporaryDeliveryDestination });

export type DeliveryCheckoutRequest = DeliveryQuoteRequest & { confirmationToken: string };

export interface DeliveryQuoteResponse {
  restaurantId: Uuid;
  restaurantName: string;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: "CASH_ON_DELIVERY";
  destination: Omit<TemporaryDeliveryDestination, "source"> & {
    source: DeliveryLocationSource;
    addressId: Uuid | null;
    recipientName: string;
    recipientPhone: string;
    deliveryNote: string | null;
  };
  lines: {
    productId: Uuid; variantId: Uuid | null; productName: string; variantName: string | null;
    quantity: number; unitPrice: number; subtotal: number;
    modifiers: { modifierOptionId: Uuid; name: string; quantity: number; additionalPrice: number }[];
  }[];
  confirmationToken: string;
  idempotencyKey: Uuid;
}

export interface CustomerOrderSummaryDto {
  id: Uuid;
  restaurantId: Uuid;
  orderNumber: string;
  orderType: string;
  orderChannel: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  currency: string | null;
  createdAt: IsoDateTime;
}

export interface CustomerOrderDetailDto extends CustomerOrderSummaryDto {
  deliveryName: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  deliveryCity: string | null;
  deliveryTownship: string | null;
  deliveryLocationSource: DeliveryLocationSource | null;
  deliveryAddressId: Uuid | null;
  destinationConfirmedAt: IsoDateTime | null;
  canCancel: boolean;
  updatedAt: IsoDateTime;
  items: OrderItemDetailDto[];
  statusHistory: { status: string; changedAt: IsoDateTime }[];
  payments: { id: Uuid; method: string; status: string; amount: number; paidAt: IsoDateTime | null; createdAt: IsoDateTime }[];
  delivery: {
    id: Uuid; status: string; assignedAt: IsoDateTime | null; pickedUpAt: IsoDateTime | null; deliveredAt: IsoDateTime | null;
    statusHistory: { status: string; changedAt: IsoDateTime }[];
  } | null;
}
