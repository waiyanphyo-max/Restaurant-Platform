"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type GuestLocale } from "@/lib/i18n";
import { hasQrCredentialFragment, readQrTokenFromHash } from "@/lib/qr-fragment";
import { resolveLegacyIntent } from "@/lib/legacy-route";
import { createGuestRequest, GuestOrderController, initialOrderState, type GuestActions, type GuestOrderState } from "@/lib/guest-order";

type QrStatus = "checking" | "ready" | "invalid";
const GuestContext = createContext<{ locale: GuestLocale; qrStatus: QrStatus; state: GuestOrderState; actions: GuestActions | null }>({ locale: "en", qrStatus: "checking", state: initialOrderState, actions: null });

/** Mounted once per tenant. Capabilities travel only in public API bodies/headers, never storage or markup. */
export function GuestSession({ locale, restaurantId = "", basePath = "", children }: { locale: GuestLocale; restaurantId?: string; basePath?: string; children: ReactNode }) {
  const [state, setState] = useState<GuestOrderState>(initialOrderState);
  const [actions, setActions] = useState<GuestActions | null>(null);
  useEffect(() => {
    // A layout keeps this controller alive across client navigation within one tenant.
    // Strict Mode's effect replay must not capture/erase the credential a second time.
    const token = readQrTokenFromHash(window.location.hash);
    const intent = resolveLegacyIntent(window.location.pathname.endsWith("/workspace") ? "/workspace" : "/", new URLSearchParams(window.location.search), restaurantId);
    const kind = intent.kind === "common-qr" ? "COMMON_QR" : intent.kind === "table-qr" ? "TABLE_QR" : null;
    let storage: Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* Private browsing can disable storage. */ }
    const controller = new GuestOrderController(restaurantId, createGuestRequest(`${basePath}/api/guest`), undefined, storage);
    const unsubscribe = controller.subscribe(setState);
    setActions(controller);
    void controller.start(kind, token);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void controller.refresh();
    }, 5_000);
    const recover = () => { if (document.visibilityState === "visible") void controller.refresh(); };
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    // Defer fragment removal until after Strict Mode's synchronous effect replay.
    const scrub = window.setTimeout(() => {
      if (hasQrCredentialFragment(window.location.hash)) {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      }
    }, 0);
    return () => {
      window.clearTimeout(scrub); window.clearInterval(interval);
      window.removeEventListener("online", recover); document.removeEventListener("visibilitychange", recover);
      unsubscribe(); controller.dispose();
    };
  }, [restaurantId, basePath]);
  const qrStatus: QrStatus = state.phase === "validating" ? "checking" : state.context && state.phase !== "invalid" ? "ready" : "invalid";
  return <GuestContext.Provider value={{ locale, qrStatus, state, actions }}>{children}</GuestContext.Provider>;
}

export function useGuestSession() { return useContext(GuestContext); }
