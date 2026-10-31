export type AuthReturnPurpose = "callback" | "invitation";
export type EmailReturnType = "email" | "signup" | "magiclink" | "recovery" | "invite" | "email_change";

export type AuthReturnInput =
  | { kind: "code"; code: string }
  | { kind: "token-hash"; tokenHash: string; type: EmailReturnType }
  | { kind: "legacy-session"; accessToken: string; refreshToken: string }
  | { kind: "existing-session" }
  | { kind: "invalid" };

type AuthErrorLike = { message: string } | null;

export interface AuthReturnPort {
  exchangeCodeForSession(code: string): Promise<{ error: AuthErrorLike }>;
  verifyOtp(input: { token_hash: string; type: EmailReturnType }): Promise<{ error: AuthErrorLike }>;
  setSession(input: { access_token: string; refresh_token: string }): Promise<{ error: AuthErrorLike }>;
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
    if (purpose === "invitation" && rawType !== "invite") return { kind: "invalid" };
    return { kind: "token-hash", tokenHash, type: rawType as EmailReturnType };
  }
  if (hasSession) {
    const type = single(fragment, "type", 32);
    if (!accessToken || !refreshToken || (fragment.has("type") && !type) ||
      (type && !emailTypes.has(type as EmailReturnType)) ||
      (purpose === "invitation" && type && type !== "invite")) {
      return { kind: "invalid" };
    }
    return { kind: "legacy-session", accessToken, refreshToken };
  }
  return query.toString() || fragment.toString() ? { kind: "invalid" } : { kind: "existing-session" };
}

export interface InvitationPasswordPort {
  getClaims: AuthReturnPort["getClaims"];
  updateUser(input: { password: string }): Promise<{
    data: { user: { id: string } | null };
    error: AuthErrorLike;
  }>;
}

/** Updating a password must retain the verified Auth UUID from the invitation session. */
export async function updateInvitationPassword(
  auth: InvitationPasswordPort,
  expectedUserId: string,
  password: string,
): Promise<void> {
  if (!expectedUserId || password.length < 8) throw new AuthReturnFailure();
  try {
    const { data, error } = await auth.getClaims();
    if (error || data?.claims?.sub !== expectedUserId) throw new AuthReturnFailure();
    const result = await auth.updateUser({ password });
    if (result.error || result.data.user?.id !== expectedUserId) throw new AuthReturnFailure();
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
    if (input.kind === "code") {
      const { error } = await auth.exchangeCodeForSession(input.code);
      if (error) throw new AuthReturnFailure();
    } else if (input.kind === "token-hash") {
      const { error } = await auth.verifyOtp({ token_hash: input.tokenHash, type: input.type });
      if (error) throw new AuthReturnFailure();
    } else if (input.kind === "legacy-session") {
      const { error } = await auth.setSession({
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
      });
      if (error) throw new AuthReturnFailure();
    }
    const { data, error } = await auth.getClaims();
    const userId = data?.claims?.sub;
    if (error || !userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new AuthReturnFailure();
    }
    return userId;
  } catch {
    throw new AuthReturnFailure();
  }
}
