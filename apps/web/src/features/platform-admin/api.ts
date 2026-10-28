import { apiRequest } from "@/lib/api-request";

export type PlatformOverview = {
  totalRestaurants: number;
  activeRestaurants: number;
  inactiveRestaurants: number;
  totalOrders: number;
  totalRestaurantMembers: number;
};

export type PlatformRestaurant = {
  id: string;
  name: string;
  slug: string;
  city: string;
  township: string;
  active: boolean;
  createdAt: string;
  ownerFullName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  orderCount: number;
};

export type PlatformPage<T> = {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  empty: boolean;
};

export type PlatformRestaurantProvisionRequest = {
  ownerEmail: string;
  ownerFullName: string | null;
  restaurant: {
    name: string;
    slug: string;
    description: string | null;
    phone: string | null;
    address: string | null;
    houseNo: string | null;
    street: string | null;
    ward: string | null;
    township: string;
    city: string;
    latitude: null;
    longitude: null;
    logoUrl: null;
    currency: string;
    timezone: string;
  };
};

export type PlatformProvisionResult = {
  ownerEmail: string;
  invitationSent: boolean;
  ownerRole: string;
  restaurant: { id: string; name: string; slug: string };
  ownerWorkspaceUrl: string;
  commonQrUrl: string;
};

export function getPlatformOverview() {
  return apiRequest<PlatformOverview>("/api/v1/platform/overview");
}

export function getPlatformRestaurants(search: string, page: number, size: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ search, page: String(page), size: String(size) });
  return apiRequest<PlatformPage<PlatformRestaurant>>(
    `/api/v1/platform/restaurants?${query.toString()}`,
    { signal },
  );
}

export async function provisionPlatformRestaurant(payload: PlatformRestaurantProvisionRequest) {
  const result = await apiRequest<PlatformProvisionResult & { commonQrToken?: string }>(
    "/api/v1/platform/restaurants",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  );
  // The API returns the raw one-time QR token for compatibility. The dashboard only retains
  // its QR link for handoff and never stores or renders the raw token field.
  return {
    ownerEmail: result.ownerEmail,
    invitationSent: result.invitationSent,
    ownerRole: result.ownerRole,
    restaurant: result.restaurant,
    ownerWorkspaceUrl: result.ownerWorkspaceUrl,
    commonQrUrl: result.commonQrUrl,
  } satisfies PlatformProvisionResult;
}
