"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserAuthSession } from "@/lib/auth/browser";
import { safeReturnTo } from "@/lib/auth/route-policy";
import { Button, Field, Notice } from "./ui";

export function LoginForm({ returnTo = "/", available = true }: { returnTo?: string; available?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !available) return;
    const session = browserAuthSession();
    if (!session) {
      setError(true);
      return;
    }
    setBusy(true);
    setError(false);
    try {
      await session.signInWithEmail(email, password);
      setPassword("");
      router.replace(safeReturnTo(returnTo));
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      <Field id="admin-email" label="Email address" required><input
        id="admin-email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        placeholder="you@company.com"
        disabled={busy || !available}
        maxLength={254}
      /></Field>
      <Field id="admin-password" label="Password" required><input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        disabled={busy || !available}
      /></Field>
      {error && <Notice tone="error" title="Unable to sign in">Check your email and password, then try again. If the problem continues, contact your platform operator.</Notice>}
      <Button type="submit" disabled={busy || !available}>{busy ? "Signing in…" : "Sign in to workspace"}<span aria-hidden="true">→</span></Button>
      <p className="auth-footnote">Access is limited to authorized platform administrators.</p>
    </form>
  );
}
