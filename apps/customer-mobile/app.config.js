const { getMobileBuildConfig } = require("@restaurant-platform/restaurant-config");

/** Expo evaluates this before bundling; no restaurant or API secret is inferred at runtime. */
module.exports = ({ config }) => {
  const selected = getMobileBuildConfig("customer");
  return {
    ...config,
    name: selected.displayName,
    slug: `${selected.restaurant.slug}-customer`,
    scheme: `rp-${selected.restaurant.slug}-customer`,
    version: "0.1.0",
    platforms: ["android"],
    plugins: [...(config.plugins ?? []), "expo-secure-store"],
    orientation: "portrait",
    android: {
      ...config.android,
      package: selected.applicationId,
      ...(selected.iconPath ? { icon: selected.iconPath } : {})
    },
    extra: {
      tenant: {
        restaurantId: selected.restaurant.restaurantId,
        slug: selected.restaurant.slug,
        branding: selected.restaurant.branding
      },
      appKind: "customer",
      mobileEnvironment: selected.environment,
      apiBaseUrl: selected.apiBaseUrl
    }
  };
};
