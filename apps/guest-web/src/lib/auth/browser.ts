import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "./public-config";
import { createWebAuthSession } from "./session";

/** The application receives Auth methods only; business data always uses Spring Boot. */
export function browserAuth() {
  const config = publicSupabaseConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.publishableKey, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }).auth;
}

export function browserAuthSession() {
  const auth = browserAuth();
  return auth ? createWebAuthSession(auth) : null;
}
