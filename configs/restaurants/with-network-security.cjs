"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const resourceName = "restaurant_network_security";

function networkSecurityXml(cleartextHosts) {
  const domain = (host) => `    <domain includeSubdomains="false">${host}</domain>`;
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<network-security-config>",
    '  <base-config cleartextTrafficPermitted="false" />',
    // A defined localhost policy also suppresses Android's implicit loopback allowance.
    ...(cleartextHosts.includes("localhost") ? [] : [
      '  <domain-config cleartextTrafficPermitted="false">', domain("localhost"), "  </domain-config>"
    ]),
    ...(cleartextHosts.length ? [
      '  <domain-config cleartextTrafficPermitted="true">', ...cleartextHosts.map(domain), "  </domain-config>"
    ] : []),
    "</network-security-config>",
    ""
  ].join("\n");
}

module.exports = (config, { cleartextHosts }) => {
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$["android:networkSecurityConfig"] = `@xml/${resourceName}`;
    return mod;
  });
  return withDangerousMod(config, ["android", async (mod) => {
    const source = path.join(mod.modRequest.platformProjectRoot, "app", "src");
    const directory = path.join(source, "main", "res", "xml");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${resourceName}.xml`), networkSecurityXml(cleartextHosts));
    // The Expo debug overlays otherwise replace the manifest setting with true.
    for (const variant of ["debug", "debugOptimized"]) {
      const manifest = path.join(source, variant, "AndroidManifest.xml");
      const original = await fs.readFile(manifest, "utf8").catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return "";
      });
      const updated = original.replace('android:usesCleartextTraffic="true"', 'android:usesCleartextTraffic="false"');
      if (updated !== original) await fs.writeFile(manifest, updated);
    }
    return mod;
  }]);
};
