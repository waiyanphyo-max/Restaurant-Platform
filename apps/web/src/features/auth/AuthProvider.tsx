"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AUTH_SESSION_EXPIRED_EVENT } from "@/lib/supabase/session-events";
import { safeReturnTo } from "@/features/auth/flow";
import { signOutAndRedirect } from "@/features/auth/sign-out";
import { authSessionReducer, initialAuthSessionState } from "@/features/auth/session-state";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configurationError: string;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loginUrl(reason: string, next: string) {
  return `/login?${new URLSearchParams({ reason, next }).toString()}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ user, loading, configurationError }, dispatch] = useReducer(authSessionReducer, initialAuthSessionState);

  useEffect(() => {
    let active = true;
    let client: ReturnType<typeof getSupabaseBrowserClient>;

    try {
      client = getSupabaseBrowserClient();
    } catch (cause) {
      if (active) {
        dispatch({ type: "configuration-error", message: cause instanceof Error ? cause.message : "Supabase sign-in is not configured." });
      }
      return;
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!active) return;
      dispatch({ type: "session", user: session?.user ?? null });
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      dispatch({ type: "session", user: data.session?.user ?? null, error: error ? "Could not restore your Supabase session. Sign in again." : "" });
    }).catch(() => {
      if (active) {
        dispatch({ type: "configuration-error", message: "Could not restore your Supabase session. Sign in again." });
      }
    });

    const handleExpiredSession = () => {
      const next = safeReturnTo(`${window.location.pathname}${window.location.search}`);
      dispatch({ type: "signed-out" });
      void client.auth.signOut({ scope: "local" }).catch(() => undefined).finally(() => {
        window.location.replace(loginUrl("session-expired", next));
      });
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
    };
  }, []);

  const signOut = useCallback(async () => {
    const next = typeof window === "undefined"
      ? "/workspace"
      : safeReturnTo(`${window.location.pathname}${window.location.search}`);
    const client = getSupabaseBrowserClient();
    await signOutAndRedirect(
      () => client.auth.signOut({ scope: "local" }),
      (path) => window.location.replace(path),
      next,
      () => dispatch({ type: "signed-out" }),
    );
  }, []);

  const value = useMemo(() => ({ user, loading, configurationError, signOut }), [user, loading, configurationError, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
