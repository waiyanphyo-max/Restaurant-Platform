import type { RestaurantConfig } from "@restaurant-platform/shared-types";

export type RestaurantEnvironment = "staging" | "production";
export type MobileEnvironment = "development" | RestaurantEnvironment;
export type MobileAppKind = "operations" | "customer";

export function validateRestaurantConfig(value: unknown, expectedSlug: string, options?: { allowFixture?: boolean }): RestaurantConfig;
export function validateRestaurantRegistry(configs: readonly RestaurantConfig[]): void;
export function listRestaurantConfigs(): RestaurantConfig[];
export function loadRestaurantConfig(slug: string): RestaurantConfig;
export function resolveRestaurantByHost(host: string, environment: RestaurantEnvironment): RestaurantConfig | null;
export function getMobileBuildConfig(kind: MobileAppKind, environmentVariables?: Record<string, string | undefined>): {
  environment: MobileEnvironment;
  restaurant: RestaurantConfig;
  applicationId: string;
  displayName: string;
  iconPath?: string;
  apiBaseUrl: string;
};
