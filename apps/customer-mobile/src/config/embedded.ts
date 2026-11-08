import { parseEmbeddedMobileTenant, type EmbeddedMobileTenant } from "@restaurant-platform/restaurant-config/mobile-runtime";

export interface EmbeddedCustomerTenant extends EmbeddedMobileTenant {
  readonly mapsConfigured: boolean;
  readonly notificationsEnabled: boolean;
  readonly initialMapRegion?: Readonly<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseEmbeddedTenant(extra: unknown): EmbeddedCustomerTenant {
  const tenant = parseEmbeddedMobileTenant(extra, "customer");
  if (!isRecord(extra)) throw new Error("Missing Customer build configuration");
  const point = extra.initialMapRegion;
  let initialMapRegion: EmbeddedCustomerTenant["initialMapRegion"];
  if (point !== undefined) {
    if (!isRecord(point) || typeof point.latitude !== "number" || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
        typeof point.longitude !== "number" || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 ||
        typeof point.latitudeDelta !== "number" || !Number.isFinite(point.latitudeDelta) || point.latitudeDelta <= 0 || point.latitudeDelta > 180 ||
        typeof point.longitudeDelta !== "number" || !Number.isFinite(point.longitudeDelta) || point.longitudeDelta <= 0 || point.longitudeDelta > 360) throw new Error("Invalid initial map region");
    initialMapRegion = Object.freeze({ latitude: point.latitude, longitude: point.longitude, latitudeDelta: point.latitudeDelta, longitudeDelta: point.longitudeDelta });
  }
  return Object.freeze({
    ...tenant,
    notificationsEnabled: isRecord(extra.features) && extra.features.notificationsEnabled === true,
    mapsConfigured: extra.mapsConfigured === true,
    ...(initialMapRegion ? { initialMapRegion } : {})
  });
}
