import { parseEmbeddedMobileTenant, type EmbeddedMobileTenant } from "@restaurant-platform/restaurant-config/mobile-runtime";

export type EmbeddedOperationsTenant = EmbeddedMobileTenant;

export function parseEmbeddedTenant(extra: unknown): EmbeddedOperationsTenant {
  return parseEmbeddedMobileTenant(extra, "operations");
}
