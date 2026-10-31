import "react-native-url-polyfill/auto";

import { createClient, processLock } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { readEmbeddedTenant } from "../tenant";
import { createSecureSessionStorage } from "./storage";
import {
  createNativeSessionController,
  type AppLifecyclePort,
  type NativeAuthPort,
  type NativeSessionController
} from "./session";

function checkedSupabaseOrigin(value: string | undefined, environment: string): string {
  if (!value) throw new Error("Public Supabase URL is not configured");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Public Supabase URL must be an origin");
  }
  const emulatorHost = ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(environment === "development" && url.protocol === "http:" && emulatorHost)) ||
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

/** Returns only Auth methods. Business data must go through the Spring API. */
export function getCustomerAuth(): NativeSessionController {
  if (singleton) return singleton;
  if (Platform.OS !== "android") throw new Error("This Customer build supports Android only");
  const tenant = readEmbeddedTenant();
  const supabaseUrl = checkedSupabaseOrigin(process.env.EXPO_PUBLIC_SUPABASE_URL, tenant.environment);
  const publishableKey = checkedPublishableKey(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const projectUrl = new URL(supabaseUrl);
  const projectScope = `${projectUrl.hostname}.${projectUrl.port || (projectUrl.protocol === "https:" ? "443" : "80")}`;
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      storage: createSecureSessionStorage(`rp.customer.${tenant.environment}.${tenant.restaurantId}.${projectScope}`, SecureStore),
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
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error("Supabase did not return a session");
      return data.session;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
    async refreshSession() {
      const { data, error } = await client.auth.refreshSession();
      if (error) throw error;
      return data.session;
    },
    onSessionChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(session));
      return () => data.subscription.unsubscribe();
    },
    startAutoRefresh() {
      client.auth.startAutoRefresh();
    },
    stopAutoRefresh() {
      client.auth.stopAutoRefresh();
    }
  };
  const lifecycle: AppLifecyclePort = {
    currentState: AppState.currentState ?? "inactive",
    addEventListener(_event, listener) {
      return AppState.addEventListener("change", listener);
    }
  };
  singleton = createNativeSessionController(port, lifecycle);
  return singleton;
}
