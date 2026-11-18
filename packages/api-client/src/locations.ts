import type { GeoLocationDto } from "@restaurant-platform/shared-types";
import { requireUuid } from "./tenant.js";
import { createTransport, type ApiRequestOptions, type ApiTransportOptions } from "./transport.js";

/** Public reference-only transport. No cookies, session provider, or write operations. */
export function createLocationApiClient(options: ApiTransportOptions) {
  const transport = createTransport(options);
  function read(path: string, request?: ApiRequestOptions) {
    return transport.request<GeoLocationDto[]>({ method: "GET", path: `/api/v1/locations/${path}`, options: request, retryTransient: true });
  }
  return {
    getRegions: (request?: ApiRequestOptions) => read("regions", request),
    getDistricts: (regionId: string, request?: ApiRequestOptions) => read(`regions/${requireUuid(regionId, "regionId")}/districts`, request),
    getTownships: (districtId: string, request?: ApiRequestOptions) => read(`districts/${requireUuid(districtId, "districtId")}/townships`, request)
  };
}
