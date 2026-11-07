import type { ApiRequestOptions, AuthenticatedApiTransportOptions } from "./transport.js";
import { createAuthenticatedTransport } from "./transport.js";
import { requireUuid } from "./tenant.js";

/** Mirrors Spring UserDeviceResponse; the API never returns raw push tokens. */
export interface UserDeviceResponse { id: string; platform: string; active: boolean; lastSeenAt: string; createdAt: string; }
export function createDeviceApiClient(options: AuthenticatedApiTransportOptions) {
  const transport = createAuthenticatedTransport(options);
  const path = "/api/v1/devices";
  return {
    listDevices: (o?: ApiRequestOptions) => transport.request<UserDeviceResponse[]>({ method: "GET", path, options: o }),
    ...bindDeviceActions(transport, path)
  };
}

export function createCustomerDeviceApiClient(options: AuthenticatedApiTransportOptions & { restaurantId: string }) {
  const restaurantId = requireUuid(options.restaurantId, "restaurantId");
  return bindDeviceActions(createAuthenticatedTransport(options), `/api/v1/customer/restaurants/${restaurantId}/devices`);
}

function bindDeviceActions(transport: ReturnType<typeof createAuthenticatedTransport>, path: string) {
  return {
    registerDevice: (pushToken: string, o?: ApiRequestOptions) => transport.request<UserDeviceResponse>({ method: "POST", path, body: { pushToken, platform: "ANDROID" }, options: o }),
    deactivateDevice: (id: string, o?: ApiRequestOptions) => transport.request<void>({ method: "DELETE", path: `${path}/${requireUuid(id, "deviceId")}`, options: o })
  };
}
