/** Public, non-secret tenant metadata. Real records live in configs/restaurants. */
export type DeploymentEnvironment = "staging" | "production";

export interface RestaurantBranding {
  displayName: string;
  primaryColor: string;
  logoUrl?: string;
}

export interface AndroidApplicationBranding {
  displayName: string;
  stagingApplicationId: string;
  productionApplicationId: string;
  iconPath?: string;
}

export interface RestaurantConfig {
  schemaVersion: 1;
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
}
