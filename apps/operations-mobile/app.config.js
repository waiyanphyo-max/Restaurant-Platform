const { getMobileBuildConfig } = require("@restaurant-platform/restaurant-config");

/** Expo evaluates this before bundling; no restaurant or API secret is inferred at runtime. */
module.exports = ({ config }) => {
  const selected = getMobileBuildConfig("operations");
  return {
    ...config,
    name: selected.displayName,
    slug: `${selected.restaurant.slug}-operations`,
    scheme: `rp-${selected.restaurant.slug}-operations`,
    version: "0.1.0",
    platforms: ["android"],
    plugins: [
      "expo-router",
      ["expo-secure-store", { configureAndroidBackup: true }],
      ["expo-build-properties", { android: { usesCleartextTraffic: selected.environment === "development" } }],
      ["expo-image-picker", { cameraPermission: false, microphonePermission: false, photosPermission: "Choose a restaurant or menu image." }]
    ],
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
      appKind: "operations",
      mobileEnvironment: selected.environment,
      apiBaseUrl: selected.apiBaseUrl,
      guestBaseUrl: selected.environment === "development"
        ? process.env.PUBLIC_GUEST_BASE_URL || null
        : `https://${selected.restaurant.guestDomains[selected.environment][0]}`,
      features: { phoneOtpRequested: process.env.OPERATIONS_PHONE_OTP_ENABLED === "true" }
    }
  };
};
