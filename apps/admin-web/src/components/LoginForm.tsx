"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserAuthSession } from "@/lib/auth/browser";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
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
      router.replace("/");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="admin-email">Email</label>
      <input
        id="admin-email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label htmlFor="admin-password">Password</label>
      <input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      {error && <p role="alert">Sign-in failed or authentication is unavailable.</p>}
    </form>
  );
}
