/** A narrow port around Supabase Auth. Spring Boot still authorizes every API call. */
export interface NativeSession {
  access_token: string;
  expires_at?: number;
  user: { id: string };
}

export interface NativeAuthPort {
  getSession(): Promise<NativeSession | null>;
  signInWithPassword(email: string, password: string): Promise<NativeSession>;
  signOut(): Promise<void>;
  refreshSession(): Promise<NativeSession | null>;
  onSessionChange(listener: (session: NativeSession | null) => void): () => void;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
}

export interface AppLifecyclePort {
  currentState: string;
  addEventListener(event: "change", listener: (state: string) => void): { remove(): void };
}

export type AuthSnapshot =
  | { status: "signed_out" }
  | { status: "signed_in"; userId: string };

export class NativeAuthError extends Error {
  constructor(readonly code: "invalid_input" | "invalid_session" | "identity_changed") {
    super(`Native authentication failed: ${code}`);
    this.name = "NativeAuthError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refreshMarginMs = 60_000;

function checkedSession(session: NativeSession): NativeSession {
  if (!uuidPattern.test(session.user?.id ?? "") || !session.access_token) {
    throw new NativeAuthError("invalid_session");
  }
  if (session.expires_at !== undefined && !Number.isFinite(session.expires_at)) {
    throw new NativeAuthError("invalid_session");
  }
  return session;
}

/**
 * Credentials never enter snapshots or listeners. A restored session is only an
 * identity hint; the API verifies its JWT, tenant membership, and permissions.
 */
export function createNativeSessionController(
  auth: NativeAuthPort,
  lifecycle: AppLifecyclePort,
  now: () => number = Date.now
) {
  let snapshot: AuthSnapshot = { status: "signed_out" };
  let refreshing = false;
  let disposed = false;
  let generation = 0;
  let acceptSessionEvents = true;
  let signingIn = false;
  let expectedIdentity: string | null = null;
  let identityChanged = false;
  let refreshPromise: Promise<string | null> | null = null;
  const listeners = new Set<(value: AuthSnapshot) => void>();

  function publish(session: NativeSession | null): AuthSnapshot {
    snapshot = session
      ? { status: "signed_in", userId: checkedSession(session).user.id }
      : { status: "signed_out" };
    for (const listener of listeners) listener(snapshot);
    return snapshot;
  }

  function setForeground(state: string): void {
    if (state === "active" && !refreshing) {
      auth.startAutoRefresh();
      refreshing = true;
    } else if (state !== "active" && refreshing) {
      auth.stopAutoRefresh();
      refreshing = false;
    }
  }

  setForeground(lifecycle.currentState);
  const appSubscription = lifecycle.addEventListener("change", setForeground);
  const stopSessionListener = auth.onSessionChange((session) => {
    if (disposed || !acceptSessionEvents || (signingIn && session)) return;
    try {
      if (session) {
        const identity = checkedSession(session).user.id.toLowerCase();
        if (expectedIdentity && identity !== expectedIdentity) {
          identityChanged = true;
          publish(null);
          return;
        }
        expectedIdentity = identity;
      }
      publish(session);
    } catch {
      publish(null);
    }
  });

  async function refresh(expectedUserId: string): Promise<string | null> {
    if (refreshPromise) return refreshPromise;
    const startedAt = generation;
    refreshPromise = (async () => {
      const result = await auth.refreshSession();
      if (startedAt !== generation || disposed || !acceptSessionEvents) return null;
      if (!result) {
        publish(null);
        return null;
      }
      const next = checkedSession(result);
      if (next.user.id.toLowerCase() !== expectedUserId.toLowerCase()) {
        try {
          await auth.signOut();
        } finally {
          publish(null);
        }
        throw new NativeAuthError("identity_changed");
      }
      publish(next);
      return next.access_token;
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  return {
    subscribe(listener: (value: AuthSnapshot) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore(): Promise<AuthSnapshot> {
      if (disposed || !acceptSessionEvents) return snapshot;
      const startedAt = generation;
      const session = await auth.getSession();
      if (startedAt !== generation) return snapshot;
      if (session) {
        const identity = checkedSession(session).user.id.toLowerCase();
        if (identityChanged || (expectedIdentity && identity !== expectedIdentity)) {
          publish(null);
          throw new NativeAuthError("identity_changed");
        }
        expectedIdentity = identity;
      }
      return publish(session);
    },
    async signInWithPassword(email: string, password: string): Promise<AuthSnapshot> {
      if (!email.trim() || !password) throw new NativeAuthError("invalid_input");
      if (disposed) throw new NativeAuthError("invalid_session");
      const startedAt = ++generation;
      signingIn = true;
      acceptSessionEvents = true;
      try {
        const session = checkedSession(await auth.signInWithPassword(email.trim(), password));
        if (startedAt !== generation) return snapshot;
        expectedIdentity = session.user.id.toLowerCase();
        identityChanged = false;
        return publish(session);
      } finally {
        signingIn = false;
      }
    },
    async signOut(): Promise<void> {
      generation++;
      acceptSessionEvents = false;
      expectedIdentity = null;
      identityChanged = false;
      publish(null);
      try {
        await auth.signOut();
      } finally {
        publish(null);
      }
    },
    async getAccessToken(): Promise<string | null> {
      if (disposed || !acceptSessionEvents) return null;
      if (identityChanged) {
        try { await auth.signOut(); } finally { publish(null); }
        throw new NativeAuthError("identity_changed");
      }
      const startedAt = generation;
      const result = await auth.getSession();
      if (startedAt !== generation) return null;
      if (!result) {
        publish(null);
        return null;
      }
      const session = checkedSession(result);
      if (expectedIdentity && expectedIdentity !== session.user.id.toLowerCase()) {
        try {
          await auth.signOut();
        } finally {
          publish(null);
        }
        throw new NativeAuthError("identity_changed");
      }
      expectedIdentity = session.user.id.toLowerCase();
      publish(session);
      if (session.expires_at === undefined || session.expires_at * 1000 <= now() + refreshMarginMs) {
        return refresh(session.user.id);
      }
      return session.access_token;
    },
    async refreshAccessToken(): Promise<string | null> {
      if (disposed || !acceptSessionEvents) return null;
      if (identityChanged) throw new NativeAuthError("identity_changed");
      const startedAt = generation;
      const session = await auth.getSession();
      if (startedAt !== generation) return null;
      if (!session) {
        publish(null);
        return null;
      }
      const checked = checkedSession(session);
      if (expectedIdentity && expectedIdentity !== checked.user.id.toLowerCase()) {
        try { await auth.signOut(); } finally { publish(null); }
        throw new NativeAuthError("identity_changed");
      }
      expectedIdentity = checked.user.id.toLowerCase();
      return refresh(checked.user.id);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      generation++;
      acceptSessionEvents = false;
      stopSessionListener();
      appSubscription.remove();
      if (refreshing) auth.stopAutoRefresh();
      refreshing = false;
      listeners.clear();
    }
  };
}

export type NativeSessionController = ReturnType<typeof createNativeSessionController>;
