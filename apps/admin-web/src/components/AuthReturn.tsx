"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { completeOwnerOnboarding } from "@/app/auth/accept-invite/actions";
import { browserAuth, browserInvitationPasswordAuth } from "@/lib/auth/browser";
import { completeAuthReturn, invitationPasswordIssue, parseAuthReturn, updateInvitationPassword, type AuthReturnPurpose } from "@/lib/auth/return";
import { Button, Field, Notice } from "./ui";

type State = "checking" | "ready" | "confirming" | "confirmation-failed" | "password-set" | "failed";

export function AuthReturn({ purpose }: { purpose: AuthReturnPurpose }) {
  const completion = useRef<Promise<string> | null>(null);
  const submitting = useRef(false);
  const [state, setState] = useState<State>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!completion.current) {
      const input = parseAuthReturn(window.location.href, purpose);
      // Remove credentials before Auth requests or other navigation can expose them.
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
      () => { if (!cancelled) setState("failed"); },
    );
    return () => { cancelled = true; };
  }, [purpose]);

  async function confirmOwnerSetup(id: string) {
    setState("confirming");
    try {
      const result = await completeOwnerOnboarding(id);
      setState(result.ok ? "password-set" : "confirmation-failed");
    } catch {
      setState("confirmation-failed");
    }
  }

  async function setInvitationPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !userId) return;
    const issue = invitationPasswordIssue(password, confirmation);
    setValidation(issue);
    if (issue) return;
    submitting.current = true;
    setBusy(true);
    try {
      const auth = await browserInvitationPasswordAuth(userId);
      if (!auth) throw new Error("Auth configuration is unavailable");
      await updateInvitationPassword(auth, userId, password);
      setPassword("");
      setConfirmation("");
      await confirmOwnerSetup(userId);
    } catch {
      setPassword("");
      setConfirmation("");
      setState("failed");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function retryConfirmation() {
    if (submitting.current || !userId) return;
    submitting.current = true;
    setBusy(true);
    try { await confirmOwnerSetup(userId); }
    finally { submitting.current = false; setBusy(false); }
  }

  return (
    <main className="standalone-page">
      <p className="overline">Restaurant Platform · {purpose === "invitation" ? "Owner account" : "Secure sign in"}</p>
      <section className="standalone-card" aria-busy={busy || state === "checking"}>
        <h1>{purpose === "invitation" ? "Set up your account" : "Complete sign in"}</h1>
        {state === "checking" && <p role="status">Verifying your secure link…</p>}
        {state === "failed" && <Notice tone="error" title="This link could not be completed">
          <p>The link may be expired, already used, or invalid. Ask your platform administrator to resend your account setup email. Open the newest email using its HTTPS link.</p>
          <p>If you already set a password, open Operations and sign in. You can also <Link href="/auth/recover">request a password recovery email</Link>.</p>
        </Notice>}
        {state === "ready" && purpose === "callback" && <>
          <p role="status">Your session is ready. Platform administrator permission is checked separately.</p>
          <div className="standalone-actions"><Link className="button button--primary" href="/">Continue to Platform Admin</Link></div>
        </>}
        {state === "ready" && purpose === "invitation" && <>
          <p>Create a password for your verified account, then use it to sign in to the Operations app.</p>
          <form onSubmit={setInvitationPassword}>
            <fieldset disabled={busy}>
              <Field id="invitation-password" label="New password" hint="Use at least 8 characters." required>
                <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
              </Field>
              <Field id="invitation-password-confirmation" label="Confirm password" error={validation ?? undefined} required>
                <input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </Field>
            </fieldset>
            <div className="standalone-actions"><Button type="submit" disabled={busy}>{busy ? "Saving password…" : "Set password"}</Button></div>
          </form>
        </>}
        {state === "confirming" && <p role="status">Password saved. Confirming your owner account setup…</p>}
        {state === "confirmation-failed" && <>
          <Notice tone="warning" title="Password saved; confirmation unavailable">
            <p>Your password was verified, but owner setup could not be recorded. Retry confirmation while this session is fresh. If it still fails, sign in to Operations with your new password and contact your administrator.</p>
          </Notice>
          <div className="standalone-actions"><Button disabled={busy} onClick={retryConfirmation}>Retry confirmation</Button></div>
        </>}
        {state === "password-set" && <Notice tone="success" title="Your account is ready">
          <p>Open the Operations app and sign in with the same email address and your new password. Your existing restaurant access is preserved.</p>
          <p>If you later forget your password, <Link href="/auth/recover">request a recovery email</Link>.</p>
        </Notice>}
      </section>
      <p className="standalone-footer">Restaurant Platform · Secure account setup</p>
    </main>
  );
}
