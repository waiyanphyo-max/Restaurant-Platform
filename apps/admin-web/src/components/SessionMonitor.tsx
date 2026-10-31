"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserAuth } from "@/lib/auth/browser";
import { createWebAuthSession } from "@/lib/auth/session";
import { loginPath } from "@/lib/auth/route-policy";

export function SessionMonitor({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const auth = browserAuth();
    if (!auth) return;
    let active = true;
    const leave = (expired: boolean) => {
      // A hard navigation also discards protected pages held in Next's client router cache.
      window.location.replace(loginPath(window.location.pathname + window.location.search, expired ? "expired" : undefined));
    };
    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") leave(false);
      else if (session && session.user.id !== userId) leave(true);
      if (event === "TOKEN_REFRESHED") router.refresh();
    });
    const check = async () => {
      const verified = await createWebAuthSession(auth).restoreUserId();
      if (!active) return;
      if (verified !== userId) leave(true);
      else router.refresh();
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router, userId]);
  return null;
}
