import type { ReactNode } from "react";
import type { QueryRefreshError, QueryState } from "../hooks/useApiQuery";
import { Body, StateView } from "./ui";

export function QueryResult<T>({ state, reload, children, refreshing = false, refreshError = null }: {
  state: QueryState<T>; reload(): void; children(data: T): ReactNode; refreshing?: boolean; refreshError?: QueryRefreshError;
}) {
  if (state.status === "ready") return <>{children(state.data)}
    {refreshing ? <Body>Refreshing current restaurant data…</Body> : null}
    {refreshError ? <StateView kind={refreshError} title="Refresh could not be completed"
      message="The last loaded data is shown. Your action result remains above. Refresh again to confirm the latest server data." onRetry={reload} /> : null}
  </>;
  const message = state.status === "offline" ? "Reconnect to load current restaurant data."
    : state.status === "denied" ? "Your account cannot access these records. Contact your restaurant owner if you need access."
    : state.status === "error" ? "These records could not be loaded. Try again." : undefined;
  return <StateView kind={state.status} message={message} onRetry={state.status === "loading" ? undefined : reload} />;
}
