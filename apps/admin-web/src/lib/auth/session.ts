type AuthErrorLike = { message: string } | null;

/** Narrow Auth-only port keeps Supabase's Data API out of application code. */
export interface WebAuthPort {
  signInWithPassword(input: { email: string; password: string }): Promise<{
    data: { user: { id: string } | null };
    error: AuthErrorLike;
  }>;
  signOut(options: { scope: "local" }): Promise<{ error: AuthErrorLike }>;
  getClaims(): Promise<{
    data: { claims: { sub?: string } | null } | null;
    error: AuthErrorLike;
  }>;
  getSession(): Promise<{
    data: { session: { user: { id: string }; access_token: string } | null };
    error: AuthErrorLike;
  }>;
}

export class AuthSessionFailure extends Error {
  constructor() {
    super("Authentication could not be completed. Please try again.");
    this.name = "AuthSessionFailure";
  }
}

export function createWebAuthSession(auth: WebAuthPort) {
  async function verifiedUserId(): Promise<string | null> {
    try {
      const { data, error } = await auth.getClaims();
      const subject = error ? null : data?.claims?.sub ?? null;
      return subject && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subject)
        ? subject : null;
    } catch {
      return null;
    }
  }

  return {
    async signInWithEmail(email: string, password: string): Promise<string> {
      if (!email.trim() || !password) throw new AuthSessionFailure();
      try {
        const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error || !data.user?.id) throw new AuthSessionFailure();
        const verified = await verifiedUserId();
        if (verified !== data.user.id) {
          await auth.signOut({ scope: "local" });
          throw new AuthSessionFailure();
        }
        return verified;
      } catch {
        throw new AuthSessionFailure();
      }
    },
    async signOut(): Promise<void> {
      try {
        const { error } = await auth.signOut({ scope: "local" });
        if (error) throw new AuthSessionFailure();
      } catch {
        throw new AuthSessionFailure();
      }
    },
    restoreUserId: verifiedUserId,
    async getVerifiedAccessToken(): Promise<string | null> {
      const userId = await verifiedUserId();
      if (!userId) return null;
      try {
        const { data, error } = await auth.getSession();
        const session = data.session;
        if (error || !session || session.user.id !== userId || !session.access_token) return null;
        return session.access_token;
      } catch {
        return null;
      }
    },
  };
}
