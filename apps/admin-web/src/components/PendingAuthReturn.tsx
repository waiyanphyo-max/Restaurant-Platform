"use client";

import { useEffect } from "react";

export function PendingAuthReturn({ purpose }: { purpose: "callback" | "invitation" }) {
  useEffect(() => {
    // The M1 starter does not exchange auth credentials. Remove them from visible browser history.
    if (window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

  return (
    <main className="shell">
      <h1>{purpose === "invitation" ? "Invitation return" : "Authentication return"}</h1>
      <p>
        This route is reserved for the new Supabase sign-in flow. It does not complete a session
        yet. Keep production redirects on the existing working frontend until the full flow is
        implemented and verified.
      </p>
    </main>
  );
}
