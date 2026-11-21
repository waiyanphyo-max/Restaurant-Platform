import { useEffect, useRef, useState } from "react";
import { ApiHttpError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { useOperationsAuth } from "../auth/AuthProvider";
import { MutationGate, mutationError } from "./mutation";

export function useApiMutation() {
  const { state, signOut } = useOperationsAuth();
  const identity = state.status === "ready" ? `${state.userId}:${state.membership.restaurantId}:${state.membership.role}` : "";
  const current = useRef({ identity });
  // A new scope object also revokes callbacks across an A → B → A change.
  if (current.current.identity !== identity) current.current = { identity };
  const scope = current.current;
  const feedbackScope = useRef(scope);
  const mounted = useRef(true);
  const gate = useRef(new MutationGate());
  const [busyState, setBusy] = useState({ scope, value: false });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reset = () => {
    if (current.current !== scope) return;
    feedbackScope.current = scope;
    setError(null); setMessage(null);
  };
  async function run<T>(action: () => Promise<T>, onSuccess?: (value: T) => void, onFailure?: (failure: unknown) => void): Promise<void> {
    if (!identity || current.current !== scope || !mounted.current || !gate.current.begin()) return;
    const valid = () => mounted.current && current.current === scope;
    setBusy({ scope, value: true }); reset();
    try {
      const value = await action();
      if (valid()) { setMessage("Saved successfully."); onSuccess?.(value); }
    } catch (failure) {
      if (valid()) {
        setError(mutationError(failure));
        onFailure?.(failure);
        if (failure instanceof MissingAccessTokenError || failure instanceof ApiHttpError && failure.status === 401) void signOut().catch(() => undefined);
      }
    } finally { gate.current.end(); if (valid()) setBusy({ scope, value: false }); }
  }
  const sameScope = feedbackScope.current === scope;
  return { run, busy: busyState.scope === scope && busyState.value, error: sameScope ? error : null, message: sameScope ? message : null, reset };
}
