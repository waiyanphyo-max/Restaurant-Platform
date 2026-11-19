import {
  ApiCancelledError, ApiHttpError, ApiNetworkError, ApiProtocolError, ApiTimeoutError,
  MissingAccessTokenError, TenantAccessError, type ApiRequestOptions
} from "@restaurant-platform/api-client";
import type { RestaurantBrandingResponse, UpdateRestaurantBrandingRequest } from "@restaurant-platform/shared-types";
import { isHexColor } from "@restaurant-platform/ui-tokens";
import { MutationGate } from "../hooks/mutation";
import type { OperationsRole } from "../auth/access";

export interface RuntimeBrandingScope {
  key: string;
  restaurantId: string;
  role: OperationsRole;
}
export interface RuntimeBrandingPort {
  getBranding(options?: ApiRequestOptions): Promise<RestaurantBrandingResponse>;
  updateBranding(request: UpdateRestaurantBrandingRequest, options?: ApiRequestOptions): Promise<RestaurantBrandingResponse>;
}
export type RuntimeBrandingError = "offline" | "error" | "denied" | null;
export interface RuntimeBrandingState {
  scopeKey: string;
  branding: RestaurantBrandingResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: RuntimeBrandingError;
}
export const emptyRuntimeBranding: RuntimeBrandingState = {
  scopeKey: "", branding: null, loading: false, refreshing: false, error: null
};

/** Component-owned memory, scoped to the embedded UUID, API environment and verified membership. */
export function createRuntimeBrandingController(onUnauthorized: () => void = () => undefined) {
  let state: RuntimeBrandingState = emptyRuntimeBranding;
  let scope: RuntimeBrandingScope | null = null;
  let port: RuntimeBrandingPort | null = null;
  let active = false;
  let disposed = false;
  let generation = 0;
  let readSequence = 0;
  let reading: { controller: AbortController; promise: Promise<boolean> } | null = null;
  let writing: AbortController | null = null;
  let writeGate = new MutationGate();
  const listeners = new Set<(value: RuntimeBrandingState) => void>();

  function publish(next: RuntimeBrandingState) {
    if (disposed) return;
    state = next;
    listeners.forEach(listener => listener(state));
  }
  function cancelRead() {
    readSequence++;
    reading?.controller.abort();
    reading = null;
  }
  function invalidate() {
    generation++;
    cancelRead();
    writing?.abort();
    writing = null;
    writeGate = new MutationGate();
  }
  function current(key: string, epoch: number) {
    return !disposed && active && scope?.key === key && generation === epoch;
  }
  function checked(value: RestaurantBrandingResponse, expected: RuntimeBrandingScope) {
    // The shared API client owns public projection and safe-logo validation. These guards
    // also prevent a miswired port or corrupt palette refresh replacing a valid theme.
    if (value.restaurantId.toLowerCase() !== expected.restaurantId.toLowerCase() ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      (value.palette === null ? value.revision !== 0 :
        ![value.palette.primaryColor, value.palette.secondaryColor, value.palette.backgroundColor].every(isHexColor))) {
      throw new ApiProtocolError();
    }
    return value;
  }
  function failed(error: unknown) {
    const unauthorized = error instanceof MissingAccessTokenError || error instanceof ApiHttpError && error.status === 401;
    const denied = unauthorized || error instanceof TenantAccessError || error instanceof ApiHttpError && error.status === 403;
    publish({ ...state, loading: false, refreshing: false,
      error: denied ? "denied" : error instanceof ApiNetworkError || error instanceof ApiTimeoutError ? "offline" : "error" });
    if (unauthorized) onUnauthorized();
  }

  async function refresh(expectedKey = scope?.key ?? "", force = false): Promise<boolean> {
    if (disposed || !active || !scope || !port || scope.key !== expectedKey) return false;
    if (reading && !force) return reading.promise;
    if (force) cancelRead();
    const startedScope = scope;
    const startedPort = port;
    const epoch = generation;
    const sequence = ++readSequence;
    const controller = new AbortController();
    publish({ ...state, loading: !state.branding, refreshing: !!state.branding, error: null });
    const promise = Promise.resolve().then(async () => {
      try {
        const value = checked(await startedPort.getBranding({ signal: controller.signal, timeoutMs: 10_000 }), startedScope);
        if (!current(startedScope.key, epoch) || sequence !== readSequence || controller.signal.aborted) return false;
        // A read issued before a successful save must never roll the palette back.
        if (state.branding && value.revision < state.branding.revision) throw new ApiProtocolError();
        publish({ scopeKey: startedScope.key, branding: value, loading: false, refreshing: false, error: null });
        return true;
      } catch (error) {
        if (current(startedScope.key, epoch) && sequence === readSequence && !controller.signal.aborted) failed(error);
        return false;
      } finally {
        if (reading?.controller === controller) reading = null;
      }
    });
    reading = { controller, promise };
    return promise;
  }

  return {
    getState: () => state,
    subscribe(listener: (value: RuntimeBrandingState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setAccess(next: RuntimeBrandingScope | null, enabled: boolean, api: RuntimeBrandingPort | null) {
      if (disposed) return;
      const changed = scope?.key !== next?.key;
      const resumed = enabled && !active;
      if (changed || !enabled && active) invalidate();
      scope = next;
      port = api;
      active = enabled && !!next && !!api;
      if (changed) publish({ ...emptyRuntimeBranding, scopeKey: next?.key ?? "" });
      else if (!active) publish({ ...state, loading: false, refreshing: false });
      if (active && (changed || resumed)) void refresh(next!.key);
    },
    refresh,
    async save(request: UpdateRestaurantBrandingRequest, expectedKey = scope?.key ?? ""): Promise<RestaurantBrandingResponse> {
      if (!active || disposed || !scope || !port || scope.key !== expectedKey || !["OWNER", "MANAGER"].includes(scope.role)) {
        throw new TenantAccessError();
      }
      const gate = writeGate;
      if (!gate.begin()) throw new ApiCancelledError();
      const startedScope = scope;
      const startedPort = port;
      const epoch = generation;
      const controller = new AbortController();
      writing = controller;
      try {
        const value = checked(await startedPort.updateBranding(request, { signal: controller.signal, timeoutMs: 15_000 }), startedScope);
        if (!current(startedScope.key, epoch) || controller.signal.aborted) throw new ApiCancelledError();
        if (!value.palette || value.revision <= request.expectedRevision || state.branding && value.revision < state.branding.revision) {
          throw new ApiProtocolError();
        }
        cancelRead();
        publish({ scopeKey: startedScope.key, branding: value, loading: false, refreshing: false, error: null });
        await refresh(startedScope.key, true);
        if (!current(startedScope.key, epoch)) throw new ApiCancelledError();
        return value;
      } catch (error) {
        if (!current(startedScope.key, epoch) || controller.signal.aborted) throw new ApiCancelledError();
        if (error instanceof ApiHttpError && error.status === 409 && error.code === "RESTAURANT_BRANDING_STALE") {
          await refresh(startedScope.key, true);
        } else failed(error);
        if (!current(startedScope.key, epoch)) throw new ApiCancelledError();
        throw error;
      } finally {
        gate.end();
        if (writing === controller) writing = null;
      }
    },
    dispose() {
      disposed = true;
      invalidate();
      listeners.clear();
    }
  };
}
