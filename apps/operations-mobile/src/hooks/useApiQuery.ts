import { useCallback, useEffect, useRef, useState } from "react";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { useOperationsAuth } from "../auth/AuthProvider";

export type QueryState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "offline" | "error" | "denied" };
export type QueryRefreshError = "offline" | "error" | null;
interface QueryOptions { keepPreviousData?: boolean; }

/** Screen-local memory only. Unmount/role change aborts requests and discards their results. */
export function useApiQuery<T>(query: (signal: AbortSignal) => Promise<T>, queryKey: string, options: QueryOptions = {}) {
  const { state: accessState, signOut } = useOperationsAuth();
  const [result, setResult] = useState<{ key: string; state: QueryState<T>; refreshing?: boolean; refreshError?: QueryRefreshError }>({ key: "", state: { status: "loading" } });
  const [revision, setRevision] = useState(0);
  const queryRef = useRef(query);
  const signOutRef = useRef(signOut);
  queryRef.current = query;
  signOutRef.current = signOut;
  const identity = accessState.status === "ready" ? `${accessState.userId}:${accessState.membership.restaurantId}:${accessState.membership.role}` : "";
  const scope = `${identity}:${queryKey}`;
  const requestKey = `${scope}:${revision}`;
  const keepPreviousData = options.keepPreviousData === true;
  const previous = useRef<{ scope: string; data: T } | null>(null);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  // A previous response is never transferable to another identity, role, tenant or query.
  if (previous.current?.scope !== scope || !identity) previous.current = null;

  useEffect(() => {
    const controller = new AbortController();
    const retained = keepPreviousData && previous.current?.scope === scope ? previous.current : null;
    setResult(retained ? { key: requestKey, state: { status: "ready", data: retained.data }, refreshing: true }
      : { key: requestKey, state: { status: "loading" } });
    async function load() {
      try {
        const data = await queryRef.current(controller.signal);
        if (!controller.signal.aborted && activeScope.current === scope) {
          previous.current = { scope, data };
          setResult({ key: requestKey, state: { status: "ready", data } });
        }
      } catch (error) {
        if (controller.signal.aborted || activeScope.current !== scope) return;
        const denied = error instanceof MissingAccessTokenError || error instanceof ApiHttpError && [401, 403].includes(error.status);
        const failure = error instanceof ApiNetworkError || error instanceof ApiTimeoutError ? "offline" : "error";
        if (denied) previous.current = null;
        setResult(!denied && retained
          ? { key: requestKey, state: { status: "ready", data: retained.data }, refreshError: failure }
          : { key: requestKey, state: { status: denied ? "denied" : failure } });
        // A record-specific 403 stays denied. Rechecking membership here can cause
        // an endless remount loop when that endpoint has stricter permissions.
        if (error instanceof MissingAccessTokenError || error instanceof ApiHttpError && error.status === 401) {
          void signOutRef.current().catch(() => undefined);
        }
      }
    }
    if (identity) void load();
    return () => controller.abort();
  }, [identity, requestKey, scope, keepPreviousData]);

  const reload = useCallback(() => setRevision(value => value + 1), []);
  const retained = keepPreviousData && previous.current?.scope === scope ? previous.current : null;
  const current = result.key === requestKey;
  const state: QueryState<T> = current ? result.state : retained
    ? { status: "ready", data: retained.data } : { status: "loading" };
  return { state, reload, refreshing: current ? result.refreshing === true : !!retained,
    refreshError: current ? result.refreshError ?? null : null };
}
