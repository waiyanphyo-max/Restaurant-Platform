"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { browserAuth } from "@/lib/auth/browser";
import { completeAuthReturn, parseAuthReturn, updateInvitationPassword, type AuthReturnPurpose } from "@/lib/auth/return";
import Link from "next/link";

type State = "checking" | "ready" | "password-set" | "failed";

export function AuthReturn({ purpose }: { purpose: AuthReturnPurpose }) {
  const completion = useRef<Promise<string> | null>(null);
  const [state, setState] = useState<State>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!completion.current) {
      const input = parseAuthReturn(window.location.href, purpose);
      // Capture first, then remove the code or fragment before any network request.
      window.history.replaceState(window.history.state, "", window.location.pathname);
      const auth = browserAuth();
      completion.current = auth
        ? completeAuthReturn(auth, input)
        : Promise.reject(new Error("Auth configuration is unavailable"));
    }
    let cancelled = false;
    completion.current.then(
      (id) => {
        if (!cancelled) {
          setUserId(id);
          setState("ready");
        }
      },
      () => {
        if (!cancelled) setState("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [purpose]);

  async function setInvitationPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !userId || password.length < 8) return;
    const auth = browserAuth();
    if (!auth) {
      setState("failed");
      return;
    }
    setBusy(true);
    try {
      await updateInvitationPassword(auth, userId, password);
      setPassword("");
      setState("password-set");
    } catch {
      setState("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <h1>{purpose === "invitation" ? "Accept invitation" : "Authentication return"}</h1>
      {state === "checking" && <p role="status">Verifying your authentication link…</p>}
      {state === "failed" && (
        <p role="alert">This link could not be verified. Request a new link if it expired.</p>
      )}
      {state === "ready" && purpose === "callback" && (
        <p role="status">Your session is ready. Continue to the platform website.</p>
      )}
      {state === "ready" && purpose === "invitation" && (
        <form onSubmit={setInvitationPassword}>
          <label htmlFor="invitation-password">Set a password for this verified account</label>
          <input
            id="invitation-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button type="submit" disabled={busy || password.length < 8}>
            {busy ? "Saving…" : "Set password"}
          </button>
        </form>
      )}
      {state === "password-set" && (
        <p role="status">Your password was updated. Continue after your platform access is verified.</p>
      )}
      {(state === "ready" || state === "password-set") && <Link href="/">Continue to Platform Admin</Link>}
    </main>
  );
}
