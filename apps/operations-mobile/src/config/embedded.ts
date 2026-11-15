import { parseEmbeddedMobileTenant, type EmbeddedMobileTenant } from "@restaurant-platform/restaurant-config/mobile-runtime";

export interface EmbeddedOperationsTenant extends EmbeddedMobileTenant {
  readonly notificationsEnabled: boolean;
}

export function parseEmbeddedTenant(extra: unknown): EmbeddedOperationsTenant {
  const tenant = parseEmbeddedMobileTenant(extra, "operations");
  const { features } = extra as { features?: { notificationsEnabled?: unknown } };
  return Object.freeze({ ...tenant, notificationsEnabled: features?.notificationsEnabled === true });
}
