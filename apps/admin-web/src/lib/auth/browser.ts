import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./public-config";
import { createWebAuthSession } from "./session";
import { pinInvitationPasswordAuth } from "./return";
import { authCookieOptions } from "./cookies";

/** The application receives Auth methods only; business data always uses Spring Boot. */
export function browserAuth() {
  const config = publicSupabaseConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.publishableKey, {
    cookieOptions: authCookieOptions({}, typeof window === "undefined" ? undefined : window.location.protocol),
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

export async function browserInvitationPasswordAuth(expectedUserId: string) {
  const config = publicSupabaseConfig();
  const shared = browserAuth();
  if (!config || !shared) return null;
  // No cookies, local storage, automatic refresh, or cross-tab session broadcasts.
  const isolated = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "pkce" },
  }).auth;
  return pinInvitationPasswordAuth(shared, isolated, expectedUserId);
}
