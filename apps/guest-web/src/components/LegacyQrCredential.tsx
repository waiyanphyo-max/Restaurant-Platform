"use client";

import { messages } from "@/lib/i18n";
import { useGuestSession } from "./GuestSession";

export function LegacyQrCredential() {
  const { locale, qrStatus } = useGuestSession();
  const text = messages[locale];
  return <aside className="qr-notice" aria-live="polite">
    <p role={qrStatus === "invalid" ? "alert" : "status"}>{qrStatus === "checking" ? text.qrChecking : qrStatus === "ready" ? text.qrReady : text.qrInvalid}</p>
    <p>{text.qrFoundation}</p>
  </aside>;
}
