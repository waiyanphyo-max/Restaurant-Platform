const { createAndroidExpoConfig } = require("@restaurant-platform/restaurant-config/expo");

function initialRegion(env) {
  const latitude = Number(env.CUSTOMER_MAP_INITIAL_LATITUDE);
  const longitude = Number(env.CUSTOMER_MAP_INITIAL_LONGITUDE);
  if (!env.CUSTOMER_MAP_INITIAL_LATITUDE || !env.CUSTOMER_MAP_INITIAL_LONGITUDE ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return { latitude, longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 };
}

module.exports = createAndroidExpoConfig("customer", __dirname, (_selected, env) => {
  // Android SDK keys are public in the native binary: restrict them by package + signing SHA-1.
  const mapKey = env.CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY;
  const mapsConfigured = typeof mapKey === "string" && /^AIza[A-Za-z0-9_-]{35}$/.test(mapKey);
  const region = initialRegion(env);
  return {
    plugins: [
      ["expo-location", { isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false }],
      ...(mapsConfigured ? [["react-native-maps", { androidGoogleMapsApiKey: mapKey }]] : [])
    ],
    android: {
      blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION", "android.permission.FOREGROUND_SERVICE_LOCATION"]
    },
    extra: {
      customerConfirmationUrl: env.EXPO_PUBLIC_CUSTOMER_CONFIRMATION_URL || null,
      mapsConfigured,
      ...(region ? { initialMapRegion: region } : {}),
      features: {
        phoneOtpRequested: env.CUSTOMER_PHONE_OTP_ENABLED === "true"
      }
    }
  };
});
