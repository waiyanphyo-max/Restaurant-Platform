/** Confirmation never grants a shopping session. Only password/phone sign-in does that. */
export type CustomerConfirmationInput =
  | { kind: "token-hash"; tokenHash: string }
  | { kind: "provider-return" }
  | { kind: "invalid" };
export type CustomerConfirmationResult = "confirmed" | "returned" | "invalid";

export interface CustomerConfirmationTenant {
  slug: string;
  environment: "development" | "staging" | "production";
  guestBaseUrl: string | null;
  routing: { scheme: string };
}

/** A reviewed tenant origin is required; temporary tunnels are unsuitable for emailed links. */
export function stableConfirmationOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.pathname !== "/" || url.search || url.hash ||
        !/^[a-z0-9.-]+$/.test(url.hostname) ||
        /(?:^|\.)(?:localhost|example\.com|example\.org|example\.net|invalid|test|trycloudflare\.com|ngrok(?:-free)?\.(?:app|io)|loca\.lt|localtunnel\.me)$/.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

/** The optional HTTPS URL is build configuration, never an incoming return/next parameter. */
export function customerConfirmationRedirect(tenant: CustomerConfirmationTenant, configured?: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant.slug) ||
      !/^rp-[a-z0-9-]+-customer(?:-development|-staging)?$/.test(tenant.routing.scheme)) {
    throw new Error("Invalid customer confirmation identity");
  }
  if (!configured) return `${tenant.routing.scheme}://email-confirmation`;
  const origin = tenant.guestBaseUrl && stableConfirmationOrigin(tenant.guestBaseUrl);
  const expected = origin && `${origin}/auth/customer-confirmation/${tenant.environment}/${tenant.slug}`;
  if (!expected || configured !== expected) throw new Error("Customer confirmation URL must use the reviewed stable tenant HTTPS callback");
  return expected;
}

/** Credentials are captured once and removed from browser history before verification. */
export function parseCustomerConfirmationInput(href: string): CustomerConfirmationInput {
  try {
    const url = new URL(href);
    const query = url.searchParams;
    const fragment = new URLSearchParams(url.hash.slice(1));
    if ([...query.keys()].some(key => !["token_hash", "type", "code", "error", "error_code", "error_description", "result"].includes(key)) ||
        [...query.keys()].some(key => query.getAll(key).length !== 1) ||
        query.has("error") || query.has("error_code") || fragment.has("error") || fragment.has("error_code")) return { kind: "invalid" };
    const hash = query.get("token_hash");
    if (query.has("token_hash")) {
      return !url.hash && !query.has("code") && !query.has("result") &&
        ["email", "signup"].includes(query.get("type") ?? "") && hash && /^[A-Za-z0-9_-]{20,512}$/.test(hash)
        ? { kind: "token-hash", tokenHash: hash } : { kind: "invalid" };
    }
    // Default ConfirmationURL has already been checked by Supabase. Do not exchange the
    // native PKCE code in another browser or import an implicit session into either app.
    if (query.has("code")) return !url.hash && !query.has("result") && !query.has("type") &&
      /^[A-Za-z0-9_-]{8,4096}$/.test(query.get("code") ?? "") ? { kind: "provider-return" } : { kind: "invalid" };
    if (url.hash) return query.size === 0 && ["email", "signup"].includes(fragment.get("type") ?? "") &&
      !!fragment.get("access_token") && !!fragment.get("refresh_token") ? { kind: "provider-return" } : { kind: "invalid" };
    // Token-free app handoff is informative only. It never proves verification or logs in.
    return query.size === 1 && ["confirmed", "returned"].includes(query.get("result") ?? "")
      ? { kind: "provider-return" } : { kind: "invalid" };
  } catch { return { kind: "invalid" }; }
}

export interface ConfirmationAuthPort {
  verifyOtp(input: { token_hash: string; type: "email" }): Promise<{
    data: { user: { id: string; email_confirmed_at?: string } | null };
    error: unknown;
  }>;
  signOut(input: { scope: "local" }): Promise<unknown>;
}

/** Use a fresh, nonpersisted Auth client, never the owner/browser or customer session. */
export async function completeCustomerConfirmation(auth: ConfirmationAuthPort, input: CustomerConfirmationInput): Promise<CustomerConfirmationResult> {
  if (input.kind === "invalid") return "invalid";
  if (input.kind === "provider-return") return "returned";
  try {
    const { data, error } = await auth.verifyOtp({ token_hash: input.tokenHash, type: "email" });
    return !error && data.user?.email_confirmed_at &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.user.id) ? "confirmed" : "invalid";
  } catch { return "invalid"; }
  finally { await auth.signOut({ scope: "local" }).catch(() => undefined); }
}
