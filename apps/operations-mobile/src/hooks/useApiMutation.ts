import { useEffect, useRef, useState } from "react";
import { ApiHttpError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { useOperationsAuth } from "../auth/AuthProvider";
import { MutationGate, mutationError } from "./mutation";

export function useApiMutation() {
  const { state, signOut } = useOperationsAuth();
  const identity = state.status === "ready" ? `${state.userId}:${state.membership.role}` : "";
  const current = useRef(identity);
  current.current = identity;
  const mounted = useRef(true);
  const gate = useRef(new MutationGate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reset = () => { setError(null); setMessage(null); };
  async function run<T>(action: () => Promise<T>, onSuccess?: (value: T) => void): Promise<void> {
    if (!identity || !gate.current.begin()) return;
    const started = identity;
    const valid = () => mounted.current && current.current === started;
    setBusy(true); reset();
    try {
      const value = await action();
      if (valid()) { setMessage("Saved successfully."); onSuccess?.(value); }
    } catch (failure) {
      if (valid()) {
        setError(mutationError(failure));
        if (failure instanceof MissingAccessTokenError || failure instanceof ApiHttpError && failure.status === 401) void signOut().catch(() => undefined);
      }
    } finally { gate.current.end(); if (valid()) setBusy(false); }
  }
  return { run, busy, error, message, reset };
}
