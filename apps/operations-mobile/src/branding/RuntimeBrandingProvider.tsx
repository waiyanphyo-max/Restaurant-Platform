import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import type { RestaurantBrandingResponse, UpdateRestaurantBrandingRequest } from "@restaurant-platform/shared-types";
import { TenantAccessError } from "@restaurant-platform/api-client";
import { getOperationsApi } from "../api";
import { useOperationsAuth } from "../auth/AuthProvider";
import { ThemeProvider } from "../components/ui";
import { readEmbeddedTenant } from "../tenant";
import { createRuntimeBrandingController, emptyRuntimeBranding, type RuntimeBrandingState } from "./runtime";

interface RuntimeBrandingContextValue extends RuntimeBrandingState {
  displayName: string;
  logoUrl: string | null;
  refresh(): Promise<boolean>;
  save(request: UpdateRestaurantBrandingRequest): Promise<RestaurantBrandingResponse>;
}
const RuntimeBrandingContext = createContext<RuntimeBrandingContextValue | null>(null);

/** Observe real auth outside WorkspaceBoundary, including its hidden membership revalidation. */
export function RuntimeBrandingProvider({ children }: PropsWithChildren) {
  const auth = useOperationsAuth();
  const tenant = readEmbeddedTenant();
  const workspace = auth.state.status === "ready" ? auth.state
    : auth.state.status === "checking_membership" && auth.workspace?.userId === auth.state.userId ? auth.workspace : null;
  const member = workspace?.membership;
  const scopedWorkspace = member?.restaurantId.toLowerCase() === tenant.restaurantId.toLowerCase() ? workspace : null;
  const scopeKey = scopedWorkspace ? JSON.stringify([tenant.restaurantId, tenant.environment, tenant.apiBaseUrl,
    scopedWorkspace.userId, scopedWorkspace.membership.role]) : "";
  const active = !!scopeKey && auth.state.status === "ready";
  const controller = useRef<ReturnType<typeof createRuntimeBrandingController> | null>(null);
  const latest = useRef(auth);
  latest.current = auth;
  const [snapshot, setSnapshot] = useState<RuntimeBrandingState>(emptyRuntimeBranding);

  useEffect(() => {
    const current = createRuntimeBrandingController(() => { void latest.current.signOut().catch(() => undefined); });
    controller.current = current;
    const stop = current.subscribe(setSnapshot);
    return () => { stop(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, []);
  useEffect(() => {
    const workspace = latest.current.state.status === "ready" ? latest.current.state : latest.current.workspace;
    const scope = scopeKey && workspace ? { key: scopeKey, restaurantId: tenant.restaurantId, role: workspace.membership.role } : null;
    const assertCurrentAccess = () => {
      if (!workspace) throw new TenantAccessError();
      latest.current.assertWorkspaceAccess(workspace.userId, workspace.membership.role);
    };
    const client = scope && workspace ? getOperationsApi({ userId: workspace.userId, assertCurrentAccess }) : null;
    const api = client ? {
      async getBranding(options?: Parameters<typeof client.getBranding>[0]) {
        assertCurrentAccess();
        const value = await client.getBranding(options);
        assertCurrentAccess();
        return value;
      },
      async updateBranding(request: UpdateRestaurantBrandingRequest, options?: Parameters<typeof client.updateBranding>[1]) {
        assertCurrentAccess();
        const value = await client.updateBranding(request, options);
        assertCurrentAccess();
        return value;
      }
    } : null;
    controller.current?.setAccess(scope, active, api);
  }, [scopeKey, active, tenant.restaurantId]);

  const refresh = useCallback(() => controller.current?.refresh(scopeKey) ?? Promise.resolve(false), [scopeKey]);
  const save = useCallback((request: UpdateRestaurantBrandingRequest) => {
    if (!controller.current) return Promise.reject(new TenantAccessError());
    return controller.current.save(request, scopeKey);
  }, [scopeKey]);
  // Render-time scope filtering prevents even one frame of another tenant/environment's data.
  const state = scopeKey && snapshot.scopeKey === scopeKey ? snapshot : { ...emptyRuntimeBranding, scopeKey, loading: active };
  const displayName = state.branding?.displayName ?? tenant.branding.displayName;
  const logoUrl = state.branding?.logoUrl ?? tenant.branding.logoDataUri ?? tenant.branding.logoUrl ?? null;
  return <RuntimeBrandingContext.Provider value={{ ...state, displayName, logoUrl, refresh, save }}>
    <ThemeProvider restaurantId={tenant.restaurantId} branding={state.branding?.palette}>{children}</ThemeProvider>
  </RuntimeBrandingContext.Provider>;
}

export function useRuntimeBranding(): RuntimeBrandingContextValue {
  const context = useContext(RuntimeBrandingContext);
  if (!context) throw new Error("RuntimeBrandingProvider is required");
  return context;
}
