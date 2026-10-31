import type { IsoDateTime, Uuid } from "./api.js";

/** app/api/dto/platform/PlatformOverviewResponse.java */
export interface PlatformOverviewResponse {
  totalRestaurants: number;
  activeRestaurants: number;
  inactiveRestaurants: number;
  totalOrders: number;
  totalRestaurantMembers: number;
}

/** app/api/dto/platform/PlatformRestaurantSummaryResponse.java */
export interface PlatformRestaurantSummaryResponse {
  id: Uuid;
  name: string;
  slug: string | null;
  city: string | null;
  township: string | null;
  active: boolean;
  createdAt: IsoDateTime;
  ownerFullName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  orderCount: number;
}

/** Kept as a wire shape for compatibility auditing; see the M2 gap report. */
export interface CreateRestaurantRequest {
  name: string;
  slug: string;
  township: string;
  city: string;
  description?: string | null;
  phone?: string | null;
  address?: string | null;
  houseNo?: string | null;
  street?: string | null;
  ward?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  logoUrl?: string | null;
  currency?: string | null;
  timezone?: string | null;
}

export interface RestaurantResponse {
  id: Uuid;
  name: string;
  slug: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  houseNo: string | null;
  street: string | null;
  ward: string | null;
  township: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface PlatformRestaurantProvisionRequest {
  ownerEmail: string;
  ownerFullName?: string | null;
  restaurant: CreateRestaurantRequest;
}

export interface PlatformRestaurantProvisionResponse {
  ownerUserId: Uuid;
  ownerEmail: string;
  invitationSent: boolean;
  ownerRole: string;
  restaurant: RestaurantResponse;
  ownerWorkspaceUrl: string;
  commonQrUrl: string;
  commonQrToken: string;
}
