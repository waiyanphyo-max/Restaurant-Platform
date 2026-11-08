"use strict";

const { AndroidConfig, withAndroidManifest } = require("@expo/config-plugins");

module.exports = (config, { fingerprint }) => withAndroidManifest(config, (mod) => {
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(
    AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults),
    "com.restaurantplatform.BUILD_FINGERPRINT",
    fingerprint
  );
  return mod;
});
