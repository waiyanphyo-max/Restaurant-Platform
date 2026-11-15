"use strict";

const { withStringsXml } = require("@expo/config-plugins");

module.exports = (config) => withStringsXml(config, (mod) => {
  const label = mod.modResults.resources.string?.find((item) => item.$.name === "app_name");
  if (label) {
    // Expo leaves non-translatable values escaped as supplied. AAPT interprets the
    // outer quotes and preserves the spacing in this build's fixed brand label.
    label._ = `"${mod.name.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
    label.$.formatted = "false";
    label.$.translatable = "false";
  }
  return mod;
});
