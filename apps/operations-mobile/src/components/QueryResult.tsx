import type { ReactNode } from "react";
import type { QueryState } from "../hooks/useApiQuery";
import { StateView } from "./ui";

export function QueryResult<T>({ state, reload, children }: { state: QueryState<T>; reload(): void; children(data: T): ReactNode }) {
  if (state.status === "ready") return children(state.data);
  const message = state.status === "offline" ? "Reconnect to load current restaurant data."
    : state.status === "denied" ? "Your account cannot access these records. Contact your restaurant owner if you need access."
    : state.status === "error" ? "These records could not be loaded. Try again." : undefined;
  return <StateView kind={state.status} message={message} onRetry={state.status === "loading" ? undefined : reload} />;
}
