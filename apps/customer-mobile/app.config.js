const { getMobileBuildConfig } = require("@restaurant-platform/restaurant-config");
const fs = require("node:fs");

function initialRegion() {
  const latitude = Number(process.env.CUSTOMER_MAP_INITIAL_LATITUDE);
  const longitude = Number(process.env.CUSTOMER_MAP_INITIAL_LONGITUDE);
  if (!process.env.CUSTOMER_MAP_INITIAL_LATITUDE || !process.env.CUSTOMER_MAP_INITIAL_LONGITUDE ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return { latitude, longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 };
}

function validGoogleServicesFile(file, applicationId) {
  if (typeof file !== "string" || !file) return false;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return !!value && value.type !== "service_account" && !value.private_key &&
      typeof value.project_info?.project_number === "string" && typeof value.project_info?.project_id === "string" &&
      Array.isArray(value.client) && value.client.some(client => client?.client_info?.android_client_info?.package_name === applicationId);
  } catch { return false; }
}

/** Expo evaluates this before bundling; no restaurant or API secret is inferred at runtime. */
module.exports = ({ config }) => {
  const selected = getMobileBuildConfig("customer");
  // Android SDK keys are public in the native binary: restrict them by package + signing SHA-1.
  const mapKey = process.env.CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY;
  const mapsConfigured = typeof mapKey === "string" && /^AIza[A-Za-z0-9_-]{35}$/.test(mapKey);
  const googleServicesFile = process.env.CUSTOMER_GOOGLE_SERVICES_FILE;
  const notificationsEnabled = process.env.CUSTOMER_NOTIFICATIONS_ENABLED === "true" &&
    validGoogleServicesFile(googleServicesFile, selected.applicationId);
  const region = initialRegion();
  return {
    ...config,
    name: selected.displayName,
    slug: `${selected.restaurant.slug}-customer`,
    scheme: `rp-${selected.restaurant.slug}-customer`,
    version: "0.1.0",
    platforms: ["android"],
    plugins: [
      "expo-router",
      ["expo-secure-store", { configureAndroidBackup: true }],
      ["expo-build-properties", { android: { usesCleartextTraffic: selected.environment === "development" } }],
      ["expo-location", { isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false }],
      ["expo-splash-screen", { backgroundColor: selected.restaurant.branding.primaryColor,
        ...(selected.iconPath ? { image: selected.iconPath, imageWidth: 160 } : {}) }],
      ...(mapsConfigured ? [["react-native-maps", { androidGoogleMapsApiKey: mapKey }]] : []),
      ...(notificationsEnabled ? ["expo-notifications"] : [])
    ],
    orientation: "portrait",
    android: {
      package: selected.applicationId,
      blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION", "android.permission.FOREGROUND_SERVICE_LOCATION"],
      ...(notificationsEnabled ? { googleServicesFile } : {}),
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
      apiBaseUrl: selected.apiBaseUrl,
      mapsConfigured,
      ...(region ? { initialMapRegion: region } : {}),
      features: {
        phoneOtpRequested: process.env.CUSTOMER_PHONE_OTP_ENABLED === "true",
        notificationsEnabled
      }
    }
  };
};
