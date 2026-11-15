import type { NextConfig } from "next";

if (process.env.APP_STAGE === "production") {
  const origins = {
    ADMIN_WEB_ORIGIN: process.env.ADMIN_WEB_ORIGIN,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
  for (const [name, value] of Object.entries(origins)) {
    if (value && !/^https:\/\//i.test(value)) throw new Error(`${name} must use HTTPS in production`);
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
