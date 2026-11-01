"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { type GuestLocale } from "@/lib/i18n";
import { hasQrCredentialFragment, readQrTokenFromHash } from "@/lib/qr-fragment";

type QrStatus = "checking" | "ready" | "invalid";
const GuestContext = createContext<{ locale: GuestLocale; qrStatus: QrStatus }>({ locale: "en", qrStatus: "checking" });

/** Mounted once per resolved tenant. Credentials never enter server requests, storage, or markup. */
export function GuestSession({ locale, children }: { locale: GuestLocale; children: ReactNode }) {
  const credential = useRef<string | null>(null);
  const captured = useRef(false);
  const [qrStatus, setQrStatus] = useState<QrStatus>("checking");
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    credential.current = readQrTokenFromHash(window.location.hash);
    if (hasQrCredentialFragment(window.location.hash)) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    setQrStatus(credential.current ? "ready" : "invalid");
  }, []);
  return <GuestContext.Provider value={{ locale, qrStatus }}>{children}</GuestContext.Provider>;
}

export function useGuestSession() { return useContext(GuestContext); }
