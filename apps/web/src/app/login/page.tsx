"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/AuthProvider";
import { safeAuthErrorMessage, safeReturnTo } from "@/features/auth/flow";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, configurationError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [next, setNext] = useState("/workspace");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(safeReturnTo(params.get("next")));
    if (params.get("reason") === "session-expired") {
      setNotice("Your session expired. Sign in again to continue.");
    } else if (params.get("reason") === "signed-out") {
      setNotice("You have been signed out.");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !sessionLoading && user) router.replace(next);
  }, [ready, sessionLoading, user, next, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    try {
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) {
        setError(safeAuthErrorMessage(signInError));
        return;
      }
      setPassword("");
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes("not configured")
        ? cause.message
        : safeAuthErrorMessage(cause));
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <Link className="auth-brand" href="/">Restaurant<span>Platform</span></Link>
      <p className="auth-eyebrow">SECURE SIGN-IN</p>
      <h1>Welcome back</h1>
      <p className="auth-help">Sign in with the email and password for your restaurant account.</p>
      {notice && <div className="auth-notice" role="status">{notice}</div>}
      {configurationError && <div className="auth-error" role="alert">{configurationError}</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={submit}>
        <label>Email
          <input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={320}
            value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>Password
          <input type="password" autoComplete="current-password" value={password}
            onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="auth-submit" type="submit" disabled={busy || sessionLoading}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-footnote">Restaurant team accounts are created by invitation. Public QR ordering does not require an account.</p>
    </section>
  </main>;
}
