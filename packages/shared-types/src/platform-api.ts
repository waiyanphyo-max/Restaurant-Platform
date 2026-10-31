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

/** app/api/dto/restaurant/CreateRestaurantRequest.java */
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
  /** Exact Supabase Auth identity; Spring verifies its confirmed email with Auth Admin. */
  ownerUserId?: Uuid | null;
  restaurant: CreateRestaurantRequest;
  configuration?: PlatformRestaurantConfiguration | null;
}

export interface PlatformRestaurantProvisionResponse {
  ownerUserId: Uuid;
  ownerEmail: string;
  invitationSent: boolean;
  ownerRole: string;
  restaurant: RestaurantResponse;
  ownerWorkspaceUrl: string;
  /** Deprecated legacy fields are always null; platform responses contain no QR credentials. */
  commonQrUrl: null;
  commonQrToken: null;
  ownerInvitationStatus: "INVITED" | "ACCEPTED";
  qrSetupUrl: string;
}

export interface PlatformAndroidConfiguration {
  displayName: string | null;
  stagingApplicationId: string | null;
  productionApplicationId: string | null;
  iconPath: string | null;
}

/** Public deployment metadata. Saving it does not deploy an app or verify a domain. */
export interface PlatformRestaurantConfiguration {
  primaryColor: string | null;
  secondaryColor: string | null;
  guestDomains: { staging: string[]; production: string[] };
  android: {
    operations: PlatformAndroidConfiguration;
    customer: PlatformAndroidConfiguration;
  };
}

export type PlatformOwnerInvitationStatus = "INVITED" | "ACCEPTED" | "NOT_INVITED" | "PROVIDER_UNAVAILABLE";

export interface PlatformRestaurantOwnerResponse {
  userId: Uuid;
  email: string | null;
  fullName: string | null;
  invitationStatus: PlatformOwnerInvitationStatus;
}

export interface PlatformRestaurantDetailResponse {
  restaurant: RestaurantResponse;
  currency: string | null;
  timezone: string | null;
  memberCount: number;
  orderCount: number;
  owners: PlatformRestaurantOwnerResponse[];
  configuration: PlatformRestaurantConfiguration;
  ownerWorkspaceUrl: string;
  qrSetupUrl: string;
  setupInstructions: string[];
}

export interface PlatformRestaurantStatusRequest { active: boolean; }

export interface PlatformRestaurantConfigurationRequest {
  name: string;
  slug: string;
  logoUrl: string | null;
  configuration: PlatformRestaurantConfiguration;
}
