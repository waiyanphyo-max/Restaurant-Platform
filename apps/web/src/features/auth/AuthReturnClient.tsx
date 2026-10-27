"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { authCallbackFailureMessage, parseAuthCallbackUrl, safeAuthErrorMessage } from "@/features/auth/flow";

type Mode = "callback" | "invite";
const supportedOtpTypes = new Set<EmailOtpType>(["invite", "signup", "recovery", "email", "email_change"]);

export default function AuthReturnClient({ mode }: { mode: Mode }) {
  const router = useRouter();
  const started = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteReady, setInviteReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function finishCallback() {
      const material = parseAuthCallbackUrl(window.location.href);
      const cleanQuery = new URLSearchParams();
      if (mode === "callback" && material.next !== "/workspace") cleanQuery.set("next", material.next);
      const safeUrl = `${window.location.pathname}${cleanQuery.size ? `?${cleanQuery.toString()}` : ""}`;
      // Remove access/refresh tokens, PKCE codes, and token hashes from the visible URL/history first.
      window.history.replaceState(null, document.title, safeUrl);

      if (material.kind === "missing") {
        setError(authCallbackFailureMessage("missing"));
        setLoading(false);
        return;
      }
      if (material.kind === "error") {
        setError(authCallbackFailureMessage("invalid"));
        setLoading(false);
        return;
      }
      if (mode === "invite" && material.type && material.type !== "invite") {
        setError(authCallbackFailureMessage("invalid"));
        setLoading(false);
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        let authError: { message?: string } | null = null;
        if (material.kind === "code") {
          const result = await supabase.auth.exchangeCodeForSession(material.code);
          authError = result.error;
        } else if (material.kind === "token-hash") {
          const type = supportedOtpTypes.has(material.type as EmailOtpType)
            ? material.type as EmailOtpType
            : null;
          if (!type || (mode === "invite" && type !== "invite")) {
            setError(authCallbackFailureMessage("invalid"));
            setLoading(false);
            return;
          }
          const result = await supabase.auth.verifyOtp({ token_hash: material.tokenHash, type });
          authError = result.error;
        } else {
          const result = await supabase.auth.setSession({
            access_token: material.accessToken,
            refresh_token: material.refreshToken,
          });
          authError = result.error;
        }

        if (authError) {
          setError(authCallbackFailureMessage("invalid"));
          setLoading(false);
          return;
        }

        if (mode === "invite") {
          setInviteReady(true);
          setLoading(false);
          return;
        }
        router.replace(material.next);
      } catch (cause) {
        setError(safeAuthErrorMessage(cause));
        setLoading(false);
      }
    }

    void finishCallback();
  }, [mode, router]);

  async function completeInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(safeAuthErrorMessage(updateError));
        return;
      }
      router.replace("/workspace");
    } catch (cause) {
      setError(safeAuthErrorMessage(cause));
    } finally {
      setSavingPassword(false);
      setPassword("");
      setConfirmPassword("");
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <Link className="auth-brand" href="/">Restaurant<span>Platform</span></Link>
      {mode === "invite" ? <>
        <p className="auth-eyebrow">RESTAURANT INVITATION</p>
        <h1>{inviteReady ? "Finish setting up your account" : "Confirming your invitation"}</h1>
        {loading && <p className="auth-help" role="status">Checking your secure invitation link…</p>}
        {inviteReady && <form className="auth-form" onSubmit={completeInvitation}>
          <p className="auth-help">Your invited profile is ready. Choose a password to finish activating your account.</p>
          <label>New password
            <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label>Confirm password
            <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
          <button className="auth-submit" type="submit" disabled={savingPassword}>
            {savingPassword ? "Saving account…" : "Set password and continue"}
          </button>
        </form>}
      </> : <>
        <p className="auth-eyebrow">SECURE SIGN-IN</p>
        <h1>Completing sign-in</h1>
        {loading && <p className="auth-help" role="status">Verifying your link…</p>}
      </>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      {!loading && error && <Link className="auth-secondary-link" href="/login">Return to sign in</Link>}
    </section>
  </main>;
}
