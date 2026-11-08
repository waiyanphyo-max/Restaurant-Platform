const { createAndroidExpoConfig } = require("@restaurant-platform/restaurant-config/expo");
const fs = require("node:fs");
const path = require("node:path");

function initialRegion(env) {
  const latitude = Number(env.CUSTOMER_MAP_INITIAL_LATITUDE);
  const longitude = Number(env.CUSTOMER_MAP_INITIAL_LONGITUDE);
  if (!env.CUSTOMER_MAP_INITIAL_LATITUDE || !env.CUSTOMER_MAP_INITIAL_LONGITUDE ||
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

module.exports = createAndroidExpoConfig("customer", __dirname, (selected, env) => {
  // Android SDK keys are public in the native binary: restrict them by package + signing SHA-1.
  const mapKey = env.CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY;
  const mapsConfigured = typeof mapKey === "string" && /^AIza[A-Za-z0-9_-]{35}$/.test(mapKey);
  const googleServicesFile = env.CUSTOMER_GOOGLE_SERVICES_FILE
    ? path.resolve(__dirname, env.CUSTOMER_GOOGLE_SERVICES_FILE) : undefined;
  const notificationsEnabled = env.CUSTOMER_NOTIFICATIONS_ENABLED === "true" &&
    validGoogleServicesFile(googleServicesFile, selected.applicationId);
  const region = initialRegion(env);
  return {
    plugins: [
      ["expo-location", { isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false }],
      ...(mapsConfigured ? [["react-native-maps", { androidGoogleMapsApiKey: mapKey }]] : []),
      ...(notificationsEnabled ? ["expo-notifications"] : [])
    ],
    android: {
      blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION", "android.permission.FOREGROUND_SERVICE_LOCATION"],
      ...(notificationsEnabled ? { googleServicesFile } : {})
    },
    extra: {
      mapsConfigured,
      ...(region ? { initialMapRegion: region } : {}),
      features: {
        phoneOtpRequested: env.CUSTOMER_PHONE_OTP_ENABLED === "true",
        notificationsEnabled
      }
    }
  };
});
