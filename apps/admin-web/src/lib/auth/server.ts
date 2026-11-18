import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "./public-config";
import { authCookieOptions } from "./cookies";

/** Cookie-backed Auth methods for Server Components and Route Handlers. */
export async function serverAuth() {
  const config = publicSupabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: authCookieOptions({ APP_STAGE: process.env.APP_STAGE, ADMIN_WEB_ORIGIN: process.env.ADMIN_WEB_ORIGIN }),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; middleware refreshes the session.
        }
      },
    },
  }).auth;
}
