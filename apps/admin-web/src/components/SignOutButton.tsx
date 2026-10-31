"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserAuthSession } from "@/lib/auth/browser";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    if (busy) return;
    const session = browserAuthSession();
    if (!session) {
      setError(true);
      return;
    }
    setBusy(true);
    setError(false);
    try {
      await session.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={signOut} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert">Sign-out could not be completed. Please try again.</p>}
    </div>
  );
}
