import type { ApiRequestOptions, AuthenticatedApiTransportOptions } from "./transport.js";
import { createAuthenticatedTransport } from "./transport.js";
import { requireUuid } from "./tenant.js";

/** Mirrors Spring UserDeviceResponse; the API never returns raw push tokens. */
export interface UserDeviceResponse { id: string; platform: string; active: boolean; lastSeenAt: string; createdAt: string; }
export function createDeviceApiClient(options: AuthenticatedApiTransportOptions) {
  const transport = createAuthenticatedTransport(options);
  return {
    listDevices: (o?: ApiRequestOptions) => transport.request<UserDeviceResponse[]>({ method: "GET", path: "/api/v1/devices", options: o }),
    registerDevice: (pushToken: string, o?: ApiRequestOptions) => transport.request<UserDeviceResponse>({ method: "POST", path: "/api/v1/devices", body: { pushToken, platform: "ANDROID" }, options: o }),
    deactivateDevice: (id: string, o?: ApiRequestOptions) => transport.request<void>({ method: "DELETE", path: `/api/v1/devices/${requireUuid(id, "deviceId")}`, options: o })
  };
}
