import type { RestaurantBranding } from "@restaurant-platform/shared-types";

/** Shared primitives; apps own their components and platform interactions. */
export const foundationTokens = {
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 6, md: 12, lg: 20 }
} as const;

export interface BrandTokens {
  primaryColor: string;
  onPrimaryColor: "#000000" | "#ffffff";
}

export function resolveBrandTokens(branding: RestaurantBranding): BrandTokens {
  const color = branding.primaryColor;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error("Restaurant primaryColor must be a six-digit hex color");
  }

  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const linear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);

  return {
    primaryColor: color,
    onPrimaryColor: luminance > 0.179 ? "#000000" : "#ffffff"
  };
}
