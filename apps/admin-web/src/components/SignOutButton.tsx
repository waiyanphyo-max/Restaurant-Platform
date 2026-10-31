"use client";

import { useState } from "react";
import { browserAuthSession } from "@/lib/auth/browser";
import { ConfirmationDialog } from "./ui";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    if (busy) return;
    const session = browserAuthSession();
    if (!session) {
      setError(true);
      throw new Error("Sign-out is unavailable");
    }
    setBusy(true);
    setError(false);
    try {
      await session.signOut();
      window.location.replace("/login");
    } catch {
      setError(true);
      throw new Error("Sign-out could not be completed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ConfirmationDialog triggerLabel={busy ? "Signing out…" : "Sign out"} title="Sign out of this workspace?" description="You will need to sign in again to access Platform Admin on this browser." confirmLabel="Sign out" onConfirm={signOut} />
      {error && <p className="field-error" role="alert">Sign-out could not be completed. Please try again.</p>}
    </div>
  );
}
