import { useCallback, useEffect, useRef, useState } from "react";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { useOperationsAuth } from "../auth/AuthProvider";

export type QueryState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "offline" | "error" | "denied" };

/** Screen-local memory only. Unmount/role change aborts requests and discards their results. */
export function useApiQuery<T>(query: (signal: AbortSignal) => Promise<T>, queryKey: string) {
  const { state: accessState, signOut } = useOperationsAuth();
  const [result, setResult] = useState<{ key: string; state: QueryState<T> }>({ key: "", state: { status: "loading" } });
  const [revision, setRevision] = useState(0);
  const queryRef = useRef(query);
  const signOutRef = useRef(signOut);
  queryRef.current = query;
  signOutRef.current = signOut;
  const identity = accessState.status === "ready" ? `${accessState.userId}:${accessState.membership.role}` : "";
  const requestKey = `${identity}:${queryKey}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    setResult({ key: requestKey, state: { status: "loading" } });
    async function load() {
      try {
        const data = await queryRef.current(controller.signal);
        if (!controller.signal.aborted) setResult({ key: requestKey, state: { status: "ready", data } });
      } catch (error) {
        if (controller.signal.aborted) return;
        const denied = error instanceof MissingAccessTokenError || error instanceof ApiHttpError && [401, 403].includes(error.status);
        setResult({ key: requestKey, state: { status: denied ? "denied" : error instanceof ApiNetworkError || error instanceof ApiTimeoutError ? "offline" : "error" } });
        // A record-specific 403 stays denied. Rechecking membership here can cause
        // an endless remount loop when that endpoint has stricter permissions.
        if (error instanceof MissingAccessTokenError || error instanceof ApiHttpError && error.status === 401) {
          void signOutRef.current().catch(() => undefined);
        }
      }
    }
    if (identity) void load();
    return () => controller.abort();
  }, [identity, requestKey]);

  const reload = useCallback(() => setRevision(value => value + 1), []);
  const state: QueryState<T> = result.key === requestKey ? result.state : { status: "loading" };
  return { state, reload };
}
