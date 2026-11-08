/** Public, non-secret tenant metadata. Real records live in configs/restaurants. */
export type DeploymentEnvironment = "staging" | "production";

export interface RestaurantBranding {
  displayName: string;
  primaryColor: string;
  logoUrl?: string;
  logoPath?: string;
  secondaryColor?: string;
  backgroundColor?: string;
}

export interface AndroidApplicationBranding {
  displayName: string;
  stagingApplicationId: string;
  productionApplicationId: string;
  iconPath?: string;
  developmentApplicationId?: string;
  splashPath?: string;
  splashBackgroundColor?: string;
  release?: { versionName: string; versionCode: number };
  eas?: { owner: string; projectId: string };
}

export interface RestaurantConfig {
  schemaVersion: 1 | 2;
  slug: string;
  restaurantId: string;
  branding: RestaurantBranding;
  guestDomains: {
    staging: string[];
    production: string[];
  };
  android: {
    operations: AndroidApplicationBranding;
    customer: AndroidApplicationBranding;
  };
  mobileProfiles?: {
    development: { apiBaseUrl: string; guestBaseUrl: string };
    staging: { apiBaseUrl: string };
    production: { apiBaseUrl: string };
  };
  fixture?: true;
}
