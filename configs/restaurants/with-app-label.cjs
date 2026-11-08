"use strict";

const { withStringsXml } = require("@expo/config-plugins");

module.exports = (config) => withStringsXml(config, (mod) => {
  const label = mod.modResults.resources.string?.find((item) => item.$.name === "app_name");
  if (label) {
    // Quote the resource value to preserve punctuation and internal spaces in the launcher.
    label._ = `"${mod.name.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
    label.$.formatted = "false";
  }
  return mod;
});
