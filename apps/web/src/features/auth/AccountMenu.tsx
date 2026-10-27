"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";

export default function AccountMenu({ returnTo = "/workspace" }: { returnTo?: string }) {
  const { user, loading, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    setBusy(true);
    setError("");
    try {
      await signOut();
    } catch {
      setError("Could not sign out. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <span className="account-menu-status">Checking account…</span>;
  if (!user) return <Link className="account-menu-link" href={`/login?next=${encodeURIComponent(returnTo)}`}>Sign in</Link>;

  return <div className="account-menu" aria-label="Account">
    <span className="account-menu-email" title={user.email || undefined}>{user.email || "Signed in"}</span>
    <button type="button" onClick={() => void handleSignOut()} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
    {error && <span className="account-menu-error" role="alert">{error}</span>}
  </div>;
}
