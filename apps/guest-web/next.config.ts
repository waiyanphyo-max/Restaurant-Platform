import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The registry reads reviewed JSON/assets relative to its own __dirname at runtime.
  // Bundling it into .next/server/chunks changes that directory and hides real tenants.
  serverExternalPackages: ["@restaurant-platform/restaurant-config"],
  webpack(config, { isServer, nextRuntime }) {
    if (isServer && nextRuntime !== "edge") {
      // npm workspace symlinks resolve outside node_modules, bypassing Next's
      // serverExternalPackages matching. Force the CJS export so __dirname stays
      // configs/restaurants instead of the generated server chunk directory.
      const existingExternals = config.externals ?? [];
      config.externals = [
        { "@restaurant-platform/restaurant-config": "commonjs @restaurant-platform/restaurant-config" },
        ...(Array.isArray(existingExternals) ? existingExternals : [existingExternals]),
      ];
    }
    return config;
  },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../configs/restaurants/*.json", "../../configs/restaurants/assets/**/*.png"],
  },
};

export default nextConfig;
