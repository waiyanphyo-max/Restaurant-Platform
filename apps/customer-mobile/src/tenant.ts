import Constants from "expo-constants";
import type { RestaurantBranding } from "@restaurant-platform/shared-types";

export interface EmbeddedCustomerTenant {
  restaurantId: string;
  slug: string;
  branding: RestaurantBranding;
  apiBaseUrl: string;
  environment: "development" | "staging" | "production";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The app never asks users to choose a restaurant; the Android build embeds it. */
export function readEmbeddedTenant(): EmbeddedCustomerTenant {
  const extra: unknown = Constants.expoConfig?.extra;
  if (!isRecord(extra) || extra.appKind !== "customer" || !isRecord(extra.tenant)) {
    throw new Error("Customer build is missing its restaurant configuration");
  }
  const { tenant } = extra;
  if (typeof tenant.restaurantId !== "string" || typeof tenant.slug !== "string" || !isRecord(tenant.branding)) {
    throw new Error("Customer build has invalid restaurant identity");
  }
  if (typeof tenant.branding.displayName !== "string" || typeof tenant.branding.primaryColor !== "string") {
    throw new Error("Customer build has invalid branding");
  }
  if (typeof extra.apiBaseUrl !== "string" || !["development", "staging", "production"].includes(String(extra.mobileEnvironment))) {
    throw new Error("Customer build has invalid API environment");
  }
  const branding: RestaurantBranding = {
    displayName: tenant.branding.displayName,
    primaryColor: tenant.branding.primaryColor,
    ...(typeof tenant.branding.logoUrl === "string" ? { logoUrl: tenant.branding.logoUrl } : {})
  };
  return {
    restaurantId: tenant.restaurantId,
    slug: tenant.slug,
    branding,
    apiBaseUrl: extra.apiBaseUrl,
    environment: extra.mobileEnvironment as EmbeddedCustomerTenant["environment"]
  };
}
