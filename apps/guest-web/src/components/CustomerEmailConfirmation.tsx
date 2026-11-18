"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { completeCustomerConfirmation, parseCustomerConfirmationInput, type CustomerConfirmationResult } from "@restaurant-platform/restaurant-config/customer-confirmation";
import { publicSupabaseConfig } from "@/lib/auth/public-config";
import type { CustomerConfirmationContext } from "@/lib/auth/customer-confirmation";

export function RejectedCustomerConfirmation() {
  useEffect(() => { window.history.replaceState(window.history.state, "", window.location.pathname); }, []);
  return <main className="auth-shell"><h1>Confirmation unavailable</h1><p>This hostname or restaurant is not authorized for this confirmation link. Open the Customer App manually and request a new confirmation email.</p></main>;
}

export function CustomerEmailConfirmation({ context }: { context: CustomerConfirmationContext }) {
  const [result, setResult] = useState<CustomerConfirmationResult | "checking">("checking");
  const completion = useRef<Promise<CustomerConfirmationResult> | null>(null);
  const attemptedOpen = useRef(false);
  useEffect(() => {
    if (!completion.current) {
      const url = new URL(window.location.href);
      const expected = `${url.origin}${url.pathname}` === context.callbackUrl;
      const input = expected ? parseCustomerConfirmationInput(url.href) : { kind: "invalid" as const };
      // Never leave credentials in browser history, links, analytics, or error messages.
      window.history.replaceState(window.history.state, "", window.location.pathname);
      const config = publicSupabaseConfig();
      if (input.kind === "provider-return") completion.current = Promise.resolve("returned");
      else if (input.kind !== "token-hash" || !config) completion.current = Promise.resolve("invalid");
      else {
        // Do not use browserAuth()/SSR cookies: an existing owner session stays separate.
        const isolated = createClient(config.url, config.publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        completion.current = completeCustomerConfirmation(isolated.auth, input);
      }
    }
    let active = true;
    void completion.current.then(value => {
      if (!active) return;
      setResult(value);
      if ((value === "confirmed" || value === "returned") && !attemptedOpen.current) {
        attemptedOpen.current = true;
        // Only a fixed token-free build-specific scheme leaves this page.
        try { window.location.assign(context.nativeReturnUrl); }
        catch { /* Missing/blocked app handlers leave the manual fallback visible. */ }
      }
    });
    return () => { active = false; };
  }, [context.callbackUrl, context.nativeReturnUrl]);
  return <main className="auth-shell">
    <h1>{context.displayName}: email confirmation</h1>
    <p role={result === "invalid" ? "alert" : "status"}>
      {result === "checking" ? "Checking your confirmation link…" : result === "confirmed" ? "Your email is confirmed. Sign in to the Customer App with your email and password." : result === "returned" ? "Email confirmation has returned. Open the Customer App and sign in. If your email is still unconfirmed, request a new confirmation email." : "This confirmation link is invalid or expired. Open the Customer App sign-in screen and request a new confirmation email."}
    </p>
    {result !== "checking" && <>
      <p><a href={context.nativeReturnUrl}>Open Customer App</a></p>
      <p>If the app does not open, install the correct restaurant Customer App or open it manually and return to Sign in. You can safely close this page.</p>
    </>}
  </main>;
}
