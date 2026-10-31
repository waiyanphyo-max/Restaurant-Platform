import { ApiConfigurationError } from "./errors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: string, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ApiConfigurationError(`${label} must be a UUID`);
  }
  return value.toLowerCase();
}

export function requireHeaderValue(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) {
    throw new ApiConfigurationError(`${label} must be a non-empty single-line value`);
  }
  return value;
}

/** Client-side context guard. Spring remains the authorization authority. */
export function assertRestaurantContext(configuredRestaurantId: string, requestedRestaurantId: string): void {
  if (requireUuid(configuredRestaurantId, "configuredRestaurantId") !==
      requireUuid(requestedRestaurantId, "requestedRestaurantId")) {
    throw new ApiConfigurationError("Requested restaurant differs from the configured restaurant");
  }
}
