export type AuthReturnPurpose = "callback" | "invitation";
export type EmailReturnType = "email" | "signup" | "magiclink" | "recovery" | "invite" | "email_change";

export type AuthReturnInput =
  | { kind: "code"; code: string }
  | { kind: "token-hash"; tokenHash: string; type: EmailReturnType }
  | { kind: "legacy-session"; accessToken: string; refreshToken: string }
  | { kind: "existing-session" }
  | { kind: "invalid" };

type AuthErrorLike = { message: string } | null;
type AuthLinkResult = { data: { user: { id: string } | null }; error: AuthErrorLike };

export interface AuthReturnPort {
  exchangeCodeForSession(code: string): Promise<AuthLinkResult>;
  verifyOtp(input: { token_hash: string; type: EmailReturnType }): Promise<AuthLinkResult>;
  setSession(input: { access_token: string; refresh_token: string }): Promise<AuthLinkResult>;
  getClaims(): Promise<{ data: { claims: { sub?: string } | null } | null; error: AuthErrorLike }>;
}

function single(params: URLSearchParams, key: string, maxLength = 4096): string | null {
  const values = params.getAll(key);
  return values.length === 1 && values[0].length > 0 && values[0].length <= maxLength
    ? values[0]
    : null;
}

const emailTypes = new Set<EmailReturnType>([
  "email", "signup", "magiclink", "recovery", "invite", "email_change",
]);

/** Parse only supported Supabase return forms; never accept an app redirect target. */
export function parseAuthReturn(href: string, purpose: AuthReturnPurpose): AuthReturnInput {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "invalid" };
  }
  if (url.username || url.password || (purpose === "invitation" && url.protocol !== "https:")) {
    return { kind: "invalid" };
  }
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (query.has("error") || query.has("error_code") || fragment.has("error") || fragment.has("error_code")) {
    return { kind: "invalid" };
  }
  if (query.has("access_token") || query.has("refresh_token") || fragment.has("code") || fragment.has("token_hash")) {
    return { kind: "invalid" };
  }

  const code = single(query, "code");
  const tokenHash = single(query, "token_hash");
  const accessToken = single(fragment, "access_token", 8192);
  const refreshToken = single(fragment, "refresh_token");
  const hasCode = query.has("code");
  const hasHash = query.has("token_hash");
  const hasSession = fragment.has("access_token") || fragment.has("refresh_token");
  if (Number(hasCode) + Number(hasHash) + Number(hasSession) > 1) return { kind: "invalid" };

  if (hasCode) return code ? { kind: "code", code } : { kind: "invalid" };
  if (hasHash) {
    const rawType = single(query, "type", 32);
    if (!tokenHash || !rawType || !emailTypes.has(rawType as EmailReturnType)) return { kind: "invalid" };
    if (purpose === "invitation" && rawType !== "invite" && rawType !== "recovery") return { kind: "invalid" };
    return { kind: "token-hash", tokenHash, type: rawType as EmailReturnType };
  }
  if (hasSession) {
    const type = single(fragment, "type", 32);
    if (!accessToken || !refreshToken || (fragment.has("type") && !type) ||
      (type && !emailTypes.has(type as EmailReturnType)) ||
      (purpose === "invitation" && type !== "invite" && type !== "recovery")) {
      return { kind: "invalid" };
    }
    return { kind: "legacy-session", accessToken, refreshToken };
  }
  return purpose === "invitation" || query.toString() || fragment.toString()
    ? { kind: "invalid" } : { kind: "existing-session" };
}

export interface InvitationPasswordPort {
  getClaims: AuthReturnPort["getClaims"];
  getUser(): Promise<{
    data: { user: { id: string; email?: string } | null };
    error: AuthErrorLike;
  }>;
  updateUser(input: { password: string }): Promise<{
    data: { user: { id: string } | null };
    error: AuthErrorLike;
  }>;
  signInWithPassword(input: { email: string; password: string }): Promise<{
    data: { user: { id: string } | null };
    error: AuthErrorLike;
  }>;
}

interface InvitationSessionStore {
  getSession(): Promise<{
    data: { session: { access_token: string; refresh_token: string; user: { id: string } } | null };
    error: AuthErrorLike;
  }>;
  setSession(input: { access_token: string; refresh_token: string }): Promise<{
    data: { user: { id: string } | null };
    error: AuthErrorLike;
  }>;
}

/** An isolated Auth client prevents other tabs from changing the password's target. */
export async function pinInvitationPasswordAuth(
  shared: InvitationSessionStore,
  isolated: InvitationSessionStore & InvitationPasswordPort,
  expectedUserId: string,
): Promise<InvitationPasswordPort> {
  try {
    const snapshot = await shared.getSession();
    const session = snapshot.data.session;
    if (snapshot.error || !session || session.user.id !== expectedUserId) throw new AuthReturnFailure();
    const pinned = await isolated.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    const claims = await isolated.getClaims();
    if (pinned.error || pinned.data.user?.id !== expectedUserId || claims.error || claims.data?.claims?.sub !== expectedUserId) {
      throw new AuthReturnFailure();
    }
    return {
      getClaims: () => isolated.getClaims(),
      getUser: () => isolated.getUser(),
      updateUser: (input) => isolated.updateUser(input),
      async signInWithPassword(input) {
        const result = await isolated.signInWithPassword(input);
        const claims = await isolated.getClaims();
        if (result.error || result.data.user?.id !== expectedUserId || claims.error || claims.data?.claims?.sub !== expectedUserId) {
          throw new AuthReturnFailure();
        }
        const fresh = await isolated.getSession();
        if (fresh.error || !fresh.data.session || fresh.data.session.user.id !== expectedUserId) throw new AuthReturnFailure();
        const persisted = await shared.setSession({
          access_token: fresh.data.session.access_token,
          refresh_token: fresh.data.session.refresh_token,
        });
        if (persisted.error || persisted.data.user?.id !== expectedUserId) throw new AuthReturnFailure();
        return result;
      },
    };
  } catch { throw new AuthReturnFailure(); }
}

export function invitationPasswordIssue(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Use at least 8 characters for your password.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}

/** Keep the verified invitation identity, then obtain fresh proof of password sign-in. */
export async function updateInvitationPassword(
  auth: InvitationPasswordPort,
  expectedUserId: string,
  password: string,
): Promise<void> {
  if (!expectedUserId || password.length < 8) throw new AuthReturnFailure();
  try {
    const { data, error } = await auth.getClaims();
    if (error || data?.claims?.sub !== expectedUserId) throw new AuthReturnFailure();
    const account = await auth.getUser();
    const email = account.data.user?.email;
    if (account.error || account.data.user?.id !== expectedUserId || !email) throw new AuthReturnFailure();
    const result = await auth.updateUser({ password });
    if (result.error || result.data.user?.id !== expectedUserId) throw new AuthReturnFailure();
    // The provider-verified email cannot be changed by an input or URL parameter.
    const signIn = await auth.signInWithPassword({ email, password });
    if (signIn.error || signIn.data.user?.id !== expectedUserId) throw new AuthReturnFailure();
    const refreshed = await auth.getClaims();
    if (refreshed.error || refreshed.data?.claims?.sub !== expectedUserId) throw new AuthReturnFailure();
  } catch {
    throw new AuthReturnFailure();
  }
}

export class AuthReturnFailure extends Error {
  constructor() {
    super("This authentication link could not be completed. Request a new link if it has expired.");
    this.name = "AuthReturnFailure";
  }
}

/** Call only after the browser has removed credentials from visible history. */
export async function completeAuthReturn(auth: AuthReturnPort, input: AuthReturnInput): Promise<string> {
  if (input.kind === "invalid") throw new AuthReturnFailure();
  try {
    let linkResult: AuthLinkResult | undefined;
    if (input.kind === "code") {
      linkResult = await auth.exchangeCodeForSession(input.code);
    } else if (input.kind === "token-hash") {
      linkResult = await auth.verifyOtp({ token_hash: input.tokenHash, type: input.type });
    } else if (input.kind === "legacy-session") {
      linkResult = await auth.setSession({
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
      });
    }
    if (input.kind !== "existing-session" && (!linkResult || linkResult.error || !linkResult.data?.user?.id)) {
      throw new AuthReturnFailure();
    }
    const linkedUserId = linkResult?.data.user?.id;
    const { data, error } = await auth.getClaims();
    const userId = data?.claims?.sub;
    if (error || !userId || (linkedUserId && userId !== linkedUserId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new AuthReturnFailure();
    }
    return linkedUserId ?? userId;
  } catch {
    throw new AuthReturnFailure();
  }
}
