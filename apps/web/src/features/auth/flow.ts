export type AuthCallbackMaterial =
  | { kind: "code"; code: string; type: string; next: string }
  | { kind: "token-hash"; tokenHash: string; type: string; next: string }
  | { kind: "session"; accessToken: string; refreshToken: string; type: string; next: string }
  | { kind: "error"; errorCode: string; next: string }
  | { kind: "missing"; next: string };

const SAFE_ORIGIN = "https://restaurant-platform.invalid";
const DEFAULT_RETURN_TO = "/workspace";
const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "refresh_token",
  "token",
  "token_hash",
  "code",
]);

export function safeReturnTo(value: string | null | undefined, fallback = DEFAULT_RETURN_TO): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const target = new URL(value, SAFE_ORIGIN);
    if (target.origin !== SAFE_ORIGIN || target.hash || target.pathname.startsWith("//")) return fallback;
    if (target.pathname === "/login" || target.pathname.startsWith("/auth/")) return fallback;
    if ([...target.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEYS.has(key.toLowerCase()))) {
      return fallback;
    }
    return `${target.pathname}${target.search}`;
  } catch {
    return fallback;
  }
}

export function parseAuthCallbackUrl(rawUrl: string, fallback = DEFAULT_RETURN_TO): AuthCallbackMaterial {
  const url = new URL(rawUrl);
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const next = safeReturnTo(query.get("next"), fallback);
  const errorCode = query.get("error_code") || fragment.get("error_code")
    || query.get("error") || fragment.get("error");
  if (errorCode) return { kind: "error", errorCode, next };

  const type = query.get("type") || fragment.get("type") || "";
  const code = query.get("code");
  if (code) return { kind: "code", code, type, next };

  const tokenHash = query.get("token_hash") || query.get("token");
  if (tokenHash && type) return { kind: "token-hash", tokenHash, type, next };

  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "session", accessToken, refreshToken, type, next };
  }

  return { kind: "missing", next };
}

export function authCallbackFailureMessage(kind: "missing" | "invalid") {
  if (kind === "missing") return "This authentication link is incomplete. Request a fresh link and open it again.";
  return "This link is invalid, expired, or already used. Ask the sender to issue a new invitation or link.";
}

export function safeAuthErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  if (["invalid_credentials", "invalid_grant", "user_not_found"].includes(code)) {
    return "The email or password is incorrect.";
  }
  if (["email_not_confirmed", "user_banned"].includes(code)) {
    return "This account cannot sign in yet. Check the invitation or contact the account administrator.";
  }
  if (["too_many_requests", "over_email_send_rate_limit"].includes(code)) {
    return "Too many attempts. Wait a while, then try again.";
  }
  return "Authentication could not be completed. Check the link or credentials and try again.";
}
