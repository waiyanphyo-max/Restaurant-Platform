import type { RestaurantConfig } from "@restaurant-platform/shared-types";

export type RestaurantEnvironment = "staging" | "production";
export type MobileEnvironment = "development" | RestaurantEnvironment;
export type MobileAppKind = "operations" | "customer";

export function validateRestaurantConfig(value: unknown, expectedSlug?: string, options?: { allowFixture?: boolean }): RestaurantConfig;
export function validateRestaurantRegistry(configs: readonly RestaurantConfig[]): void;
export function listRestaurantConfigs(): RestaurantConfig[];
export function listDevelopmentFixtures(): RestaurantConfig[];
export function loadRestaurantConfig(slug: string): RestaurantConfig;
export function resolveRestaurantByHost(host: string, environment: RestaurantEnvironment): RestaurantConfig | null;
export function getMobileBuildConfig(kind: MobileAppKind, environmentVariables?: Record<string, string | undefined>, options?: { inspectFixtureProfiles?: boolean }): {
  environment: MobileEnvironment;
  kind: MobileAppKind;
  restaurant: RestaurantConfig;
  app: RestaurantConfig["android"][MobileAppKind];
  applicationId: string;
  displayName: string;
  iconPath?: string;
  release: { versionName: string; versionCode: number };
  apiBaseUrl: string;
  guestBaseUrl: string | null;
  routing: { scheme: string; appLinkOrigin: string | null; appLinkPathPrefix: string | null };
};
