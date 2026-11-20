import { ApiNetworkError, ApiProtocolError, ApiTimeoutError, type ApiRequestOptions } from "@restaurant-platform/api-client";
import type { RestaurantBrandingResponse } from "@restaurant-platform/shared-types";
import { isHexColor } from "@restaurant-platform/ui-tokens";

export interface CustomerBrandingScope { key: string; restaurantId: string }
export interface CustomerBrandingPort { getBranding(options?: ApiRequestOptions): Promise<RestaurantBrandingResponse> }
export interface CustomerBrandingState {
  scopeKey: string;
  branding: RestaurantBrandingResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: "offline" | "error" | null;
}
export const emptyCustomerBranding: CustomerBrandingState = {
  scopeKey: "", branding: null, loading: false, refreshing: false, error: null
};

/** Read-only, component-owned memory. No route, auth claim or response can select a tenant. */
export function createCustomerBrandingController() {
  let state = emptyCustomerBranding;
  let scope: CustomerBrandingScope | null = null;
  let api: CustomerBrandingPort | null = null;
  let active = false;
  let disposed = false;
  let generation = 0;
  let pending: { controller: AbortController; promise: Promise<boolean> } | null = null;
  const listeners = new Set<(value: CustomerBrandingState) => void>();
  function publish(next: CustomerBrandingState) {
    if (disposed) return;
    state = next;
    listeners.forEach(listener => listener(next));
  }
  function invalidate() {
    generation++;
    pending?.controller.abort();
    pending = null;
  }
  async function refresh(expectedKey = scope?.key ?? ""): Promise<boolean> {
    if (!active || disposed || !scope || !api || expectedKey !== scope.key) return false;
    if (pending) return pending.promise;
    const startedScope = scope;
    const startedApi = api;
    const epoch = generation;
    const controller = new AbortController();
    const current = () => !disposed && active && !controller.signal.aborted && epoch === generation && scope?.key === startedScope.key;
    publish({ ...state, loading: !state.branding, refreshing: !!state.branding, error: null });
    const promise = Promise.resolve().then(async () => {
      try {
        if (!current()) return false;
        const value = await startedApi.getBranding({ signal: controller.signal, timeoutMs: 10_000 });
        if (!current()) return false;
        // The canonical client projects logos and invalid palettes. Reject mismatches and
        // corrupt persisted palettes rather than replacing a previously validated snapshot.
        if (!value || typeof value.restaurantId !== "string" || value.restaurantId.toLowerCase() !== startedScope.restaurantId.toLowerCase() ||
          typeof value.displayName !== "string" || !value.displayName.trim() ||
          !Number.isSafeInteger(value.revision) || value.revision < 0 ||
          (value.palette === null ? value.revision !== 0 : !value.palette || value.revision === 0 ||
            ![value.palette.primaryColor, value.palette.secondaryColor, value.palette.backgroundColor].every(isHexColor)) ||
          state.branding && value.revision < state.branding.revision) throw new ApiProtocolError();
        publish({ scopeKey: startedScope.key, branding: value, loading: false, refreshing: false, error: null });
        return true;
      } catch (error) {
        if (current()) publish({ ...state, loading: false, refreshing: false,
          error: error instanceof ApiNetworkError || error instanceof ApiTimeoutError ? "offline" : "error" });
        return false;
      } finally {
        if (pending?.controller === controller) pending = null;
      }
    });
    pending = { controller, promise };
    return promise;
  }
  return {
    getState: () => state,
    subscribe(listener: (value: CustomerBrandingState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setAccess(next: CustomerBrandingScope | null, enabled: boolean, port: CustomerBrandingPort | null) {
      if (disposed) return;
      const changed = scope?.key !== next?.key;
      const resumed = enabled && !active;
      if (changed || !enabled && active) invalidate();
      scope = next;
      api = port;
      active = enabled && !!next && !!port;
      if (changed) publish({ ...emptyCustomerBranding, scopeKey: next?.key ?? "" });
      else if (!active) publish({ ...state, loading: false, refreshing: false });
      if (active && (changed || resumed)) void refresh(next!.key);
    },
    refresh,
    dispose() { disposed = true; invalidate(); listeners.clear(); }
  };
}
