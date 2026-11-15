import "react-native-url-polyfill/auto";

import { createClient, processLock } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { readEmbeddedTenant } from "../tenant";
import { createLogoutProtectedSessionStorage } from "./storage";
import { phoneProviderAvailable } from "./phone";
import {
  createNativeSessionController,
  type AppLifecyclePort,
  type NativeAuthPort,
  type NativeSessionController
} from "./session";

function checkedSupabaseOrigin(value: string | undefined): string {
  if (!value) throw new Error("Public Supabase URL is not configured");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Public Supabase URL must be an origin");
  }
  if (
    url.protocol !== "https:" ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  ) {
    throw new Error("Public Supabase URL must be a trusted origin");
  }
  return url.origin;
}

function checkedPublishableKey(value: string | undefined): string {
  if (!value || !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(value)) {
    throw new Error("A Supabase publishable key is required; secret and service-role keys are forbidden");
  }
  return value;
}

let singleton: NativeSessionController | null = null;
export function customerEmailRecoveryEnabled(): boolean {
  return process.env.EXPO_PUBLIC_CUSTOMER_EMAIL_OTP_RECOVERY_ENABLED === "true";
}

/** Returns only Auth methods. Business data must go through the Spring API. */
export function getCustomerAuth(): NativeSessionController {
  if (singleton) return singleton;
  if (Platform.OS !== "android") throw new Error("This Customer build supports Android only");
  const tenant = readEmbeddedTenant();
  const supabaseUrl = checkedSupabaseOrigin(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const publishableKey = checkedPublishableKey(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const projectUrl = new URL(supabaseUrl);
  const projectScope = `${projectUrl.hostname}.${projectUrl.port || (projectUrl.protocol === "https:" ? "443" : "80")}`;
  // Keep the SDK's original default key so existing M2 secure sessions remain readable.
  const sessionKey = `sb-${projectUrl.hostname.split(".")[0]}-auth-token`;
  const storage = createLogoutProtectedSessionStorage(
    `rp.customer.${tenant.environment}.${tenant.restaurantId}.${projectScope}`, SecureStore, sessionKey
  );
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      storage,
      storageKey: sessionKey,
      lock: processLock,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  });

  const port: NativeAuthPort = {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async signInWithPassword(email, password) {
      await storage.prepareSignIn();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error("Supabase did not return a session");
      return data.session;
    },
    async signUpWithPassword(email, password) {
      await storage.prepareSignIn();
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return data.session;
    },
    async resendConfirmation(email) {
      const { error } = await client.auth.resend({ type: "signup", email });
      if (error) throw error;
    },
    async requestPasswordReset(email) {
      if (!customerEmailRecoveryEnabled()) throw Object.assign(new Error("Recovery unavailable"), { code: "recovery_unavailable" });
      const { error } = await recoveryAuth().resetPasswordForEmail(email);
      if (error) throw error;
    },
    async resetPassword(email, token, password) {
      if (!customerEmailRecoveryEnabled()) throw Object.assign(new Error("Recovery unavailable"), { code: "recovery_unavailable" });
      // A recovery session must never become the shopping session, including after app restart.
      const recovery = recoveryAuth();
      try {
        const verified = await recovery.verifyOtp({ email, token, type: "recovery" });
        if (verified.error) throw verified.error;
        if (!verified.data.session || !verified.data.user) throw new Error("No verified recovery session");
        const { error } = await recovery.updateUser({ password });
        if (error) throw error;
      } finally { await recovery.signOut({ scope: "local" }); }
    },
    phoneOtpEnabled() {
      return phoneProviderAvailable(tenant.phoneOtpRequested, supabaseUrl, publishableKey);
    },
    async requestPhoneOtp(phone) {
      const { error } = await client.auth.signInWithOtp({ phone, options: { shouldCreateUser: false, channel: "sms" } });
      if (error) throw error;
    },
    async verifyPhoneOtp(phone, token) {
      await storage.prepareSignIn();
      const { data, error } = await client.auth.verifyOtp({ phone, token, type: "sms" });
      if (error) throw error;
      if (!data.session) throw new Error("No verified phone session was returned");
      // Re-fetch trusted Auth identity rather than treating a profile phone as verified.
      const verified = await client.auth.getUser(data.session.access_token);
      if (verified.error || !verified.data.user || verified.data.user.id !== data.session.user.id) {
        await storage.signOut(async () => { await client.auth.signOut({ scope: "local" }); });
        throw new Error("Phone identity verification failed");
      }
      return { ...data.session, user: verified.data.user };
    },
    async signOut() {
      await storage.signOut(async () => {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
      });
    },
    async refreshSession() {
      const { data, error } = await client.auth.refreshSession();
      if (error) throw error;
      return data.session;
    },
    onSessionChange(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // restore() owns startup errors/retry. auth-js emits a null INITIAL_SESSION
        // after some transient restoration failures; it is not an explicit logout.
        if (event !== "INITIAL_SESSION") listener(session);
      });
      return () => data.subscription.unsubscribe();
    },
    startAutoRefresh() {
      client.auth.startAutoRefresh();
    },
    stopAutoRefresh() {
      client.auth.stopAutoRefresh();
    }
  };
  function recoveryAuth() {
    return createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    }).auth;
  }
  const lifecycle: AppLifecyclePort = {
    currentState: AppState.currentState ?? "inactive",
    addEventListener(_event, listener) {
      return AppState.addEventListener("change", listener);
    }
  };
  singleton = createNativeSessionController(port, lifecycle);
  return singleton;
}
