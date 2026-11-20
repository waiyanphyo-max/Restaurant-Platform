import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import { ApiCancelledError } from "@restaurant-platform/api-client";
import { getCustomerPublicApi } from "../api";
import { useCustomerAuth } from "../auth/AuthProvider";
import { ThemeProvider } from "../components/ui";
import { readEmbeddedTenant } from "../tenant";
import { createCustomerBrandingController, emptyCustomerBranding, type CustomerBrandingState } from "./runtime";

interface CustomerRuntimeBranding extends CustomerBrandingState {
  displayName: string;
  logoUrl: string | null;
  refresh(): Promise<boolean>;
}
const RuntimeBrandingContext = createContext<CustomerRuntimeBranding | null>(null);

/** Public runtime identity always belongs to this installed build's UUID and API environment. */
export function RuntimeBrandingProvider({ children }: PropsWithChildren) {
  const { state: auth } = useCustomerAuth();
  const tenant = readEmbeddedTenant();
  const scopeKey = JSON.stringify([tenant.restaurantId, tenant.environment, tenant.apiBaseUrl,
    auth.status, auth.status === "signed_in" ? auth.userId : null]);
  const enabled = auth.status === "signed_in" || auth.status === "signed_out";
  const latestKey = useRef(scopeKey);
  latestKey.current = scopeKey;
  const controller = useRef<ReturnType<typeof createCustomerBrandingController> | null>(null);
  const [snapshot, setSnapshot] = useState<CustomerBrandingState>(emptyCustomerBranding);
  useEffect(() => {
    const current = createCustomerBrandingController();
    controller.current = current;
    const stop = current.subscribe(setSnapshot);
    return () => { stop(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, []);
  useEffect(() => {
    const current = controller.current;
    const scope = { key: scopeKey, restaurantId: tenant.restaurantId };
    const client = enabled ? getCustomerPublicApi() : null;
    const port = client ? {
      async getBranding(options?: Parameters<typeof client.getBranding>[0]) {
        if (latestKey.current !== scopeKey) throw new ApiCancelledError();
        const response = await client.getBranding(options);
        if (latestKey.current !== scopeKey) throw new ApiCancelledError();
        return response;
      }
    } : null;
    const applyVisibility = (visibility: string | null) => current?.setAccess(scope,
      enabled && (visibility === "active" || visibility === null), port);
    applyVisibility(AppState.currentState ?? null);
    // Customer auth manages token refresh, but exposes no foreground transition. A single
    // component-owned listener pauses obsolete reads and refreshes once on active resumption.
    const subscription = AppState.addEventListener("change", applyVisibility);
    return () => { subscription.remove(); current?.setAccess(null, false, null); };
  }, [scopeKey, enabled, tenant.restaurantId]);
  const refresh = useCallback(() => controller.current?.refresh(scopeKey) ?? Promise.resolve(false), [scopeKey]);
  // Filter before effects run so another account/environment never flashes retained identity.
  const state = snapshot.scopeKey === scopeKey ? snapshot : { ...emptyCustomerBranding, scopeKey, loading: enabled };
  const displayName = state.branding?.displayName ?? tenant.branding.displayName;
  const logoUrl = state.branding?.logoUrl ?? tenant.branding.logoDataUri ?? tenant.branding.logoUrl ?? null;
  return <RuntimeBrandingContext.Provider value={{ ...state, displayName, logoUrl, refresh }}>
    <ThemeProvider restaurantId={tenant.restaurantId} branding={state.branding?.palette}>{children}</ThemeProvider>
  </RuntimeBrandingContext.Provider>;
}

export function useRuntimeBranding(): CustomerRuntimeBranding {
  const value = useContext(RuntimeBrandingContext);
  if (!value) throw new Error("RuntimeBrandingProvider is required");
  return value;
}
