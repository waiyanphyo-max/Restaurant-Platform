import { useCallback, useEffect, useRef, useState } from "react";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { useCustomerAuth } from "../auth/AuthProvider";

export type QueryState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "offline" | "error" | "denied" };
export function queryFailure(error: unknown): "offline" | "error" | "denied" {
  if (error instanceof MissingAccessTokenError || error instanceof ApiHttpError && [401, 403].includes(error.status)) return "denied";
  return error instanceof ApiNetworkError || error instanceof ApiTimeoutError ? "offline" : "error";
}
/** Identity-scoped memory only; abort and hide old data immediately when the account changes. */
export function useApiQuery<T>(query: (signal: AbortSignal) => Promise<T>, queryKey: string) {
  const { state: auth } = useCustomerAuth();
  const [result, setResult] = useState<{ key: string; state: QueryState<T> }>({ key: "", state: { status: "loading" } });
  const [revision, setRevision] = useState(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const identity = auth.status === "signed_in" ? auth.userId : "";
  const key = `${identity}:${queryKey}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, state: { status: "loading" } });
    async function load() {
      try {
        const data = await queryRef.current(controller.signal);
        if (!controller.signal.aborted) setResult({ key, state: { status: "ready", data } });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, state: { status: queryFailure(error) } });
      }
    }
    if (identity) void load();
    return () => controller.abort();
  }, [identity, key]);
  return { state: result.key === key ? result.state : { status: "loading" } as QueryState<T>, reload: useCallback(() => setRevision(value => value + 1), []) };
}
