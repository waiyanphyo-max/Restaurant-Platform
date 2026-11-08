const { createAndroidExpoConfig } = require("@restaurant-platform/restaurant-config/expo");

module.exports = createAndroidExpoConfig("operations", __dirname, (_selected, env) => ({
  plugins: [
    ["expo-image-picker", { cameraPermission: false, microphonePermission: false, photosPermission: "Choose a restaurant or menu image." }]
  ],
  extra: { features: { phoneOtpRequested: env.OPERATIONS_PHONE_OTP_ENABLED === "true" } }
}));
