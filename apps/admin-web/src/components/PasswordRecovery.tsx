"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestPasswordRecovery } from "@/app/auth/recover/actions";
import { Button, Field, Notice } from "./ui";

export function PasswordRecovery() {
  const submitting = useRef(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [result, setResult] = useState<"accepted" | "failed" | null>(null);

  useEffect(() => {
    if (!cooldown) return;
    const timeout = window.setTimeout(() => setCooldown(false), 60_000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || cooldown) return;
    submitting.current = true;
    setBusy(true);
    setResult(null);
    try {
      const response = await requestPasswordRecovery(email);
      setResult(response.ok ? "accepted" : "failed");
    } catch { setResult("failed"); }
    finally {
      submitting.current = false;
      setBusy(false);
      setCooldown(true);
    }
  }

  return <main className="standalone-page">
    <p className="overline">Restaurant Platform · Owner account</p>
    <section className="standalone-card" aria-busy={busy}>
      <h1>Recover your password</h1>
      <p>Enter your registered account email. Open the newest recovery email to choose a new password, then sign in to Operations.</p>
      <form onSubmit={submit}>
        <Field id="recovery-email" label="Account email" required>
          <input type="email" autoComplete="email" maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
        </Field>
        <div className="standalone-actions"><Button type="submit" disabled={busy || cooldown}>
          {busy ? "Requesting email…" : cooldown ? "Please wait before trying again" : "Request recovery email"}
        </Button></div>
      </form>
      {result === "accepted" && <Notice tone="success" title="Recovery request accepted">
        If this account is eligible, the email provider will send a recovery email. Check your inbox and spam folder. Delivery is not guaranteed.
      </Notice>}
      {result === "failed" && <Notice tone="error" title="Recovery request unavailable">
        We could not request recovery email now. Wait before trying again, or contact your platform administrator to check email delivery and HTTPS configuration.
      </Notice>}
    </section>
    <p className="standalone-footer">Restaurant Platform · Secure account recovery</p>
  </main>;
}
