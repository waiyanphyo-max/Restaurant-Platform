import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  values: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0, ranEffect: false,
  verify: vi.fn(), signOut: vi.fn(), create: vi.fn(), replace: vi.fn(), assign: vi.fn(),
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = h.stateIndex++; if (!(index in h.values)) h.values[index] = initial;
    return [h.values[index], (value: unknown) => { h.values[index] = value; }];
  },
  useRef(initial: unknown) { const index = h.refIndex++; h.refs[index] ??= { current: initial }; return h.refs[index]; },
  useEffect(effect: () => void) { if (!h.ranEffect) { h.ranEffect = true; effect(); } },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: h.create }));
import { CustomerEmailConfirmation, RejectedCustomerConfirmation } from "./CustomerEmailConfirmation";

const context = {
  callbackUrl: "https://www.cafeone.com/auth/customer-confirmation/production/cafe-one",
  nativeReturnUrl: "rp-cafe-one-customer://email-confirmation?result=returned", displayName: "Cafe One",
};
function render() { h.stateIndex = 0; h.refIndex = 0; return CustomerEmailConfirmation({ context }); }
function items(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(items);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...items(node.props.children as ReactNode)] : [];
}
function content(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(content).join(" ");
  if (isValidElement<Record<string, unknown>>(node)) return content(node.props.children as ReactNode);
  return typeof node === "string" ? node : "";
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
function address(suffix: string) {
  const url = new URL(context.callbackUrl + suffix);
  vi.stubGlobal("window", { location: { href: url.href, pathname: url.pathname, assign: h.assign }, history: { state: null, replaceState: h.replace } });
}
beforeEach(() => {
  vi.resetAllMocks(); h.values = []; h.refs = []; h.ranEffect = false;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture_12345678");
  h.verify.mockResolvedValue({ data: { user: { id: "11111111-1111-4111-8111-111111111111", email_confirmed_at: "2026-11-16T00:00:00Z" } }, error: null });
  h.signOut.mockResolvedValue({ error: null }); h.create.mockReturnValue({ auth: { verifyOtp: h.verify, signOut: h.signOut } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("customer confirmation HTTPS fallback", () => {
  it("scrubs credentials, verifies in isolation, attempts the fixed app link and keeps a missing-app fallback", async () => {
    address("?token_hash=synthetic-confirmation-hash-1234&type=email"); render(); await settle();
    expect(h.replace).toHaveBeenCalledWith(null, "", new URL(context.callbackUrl).pathname);
    expect(h.replace.mock.invocationCallOrder[0]).toBeLessThan(h.verify.mock.invocationCallOrder[0]);
    expect(h.create.mock.calls[0][2]).toEqual({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" }); expect(h.assign).toHaveBeenCalledExactlyOnceWith(context.nativeReturnUrl);
    const tree = render(); expect(content(tree)).toContain("Your email is confirmed"); expect(content(tree)).toContain("open it manually");
    expect(items(tree).find(item => item.type === "a")?.props.href).toBe(context.nativeReturnUrl);
    expect(content(tree)).not.toContain("synthetic-confirmation");
  });
  it("handles invalid/expired links with manual sign-in and no automatic app launch", async () => {
    address("?error_code=otp_expired&error_description=private-provider-message"); render(); await settle();
    expect(content(render())).toContain("invalid or expired"); expect(content(render())).toContain("Open Customer App");
    expect(h.create).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect(content(render())).not.toContain("private-provider-message");
  });
  it("retains the manual fallback when a browser rejects an unavailable app handler", async () => {
    h.assign.mockImplementation(() => { throw new Error("Unknown protocol handler"); });
    address("?code=provider-code-1234"); render(); await settle();
    expect(content(render())).toContain("Open Customer App"); expect(content(render())).toContain("open it manually");
    expect(h.create).not.toHaveBeenCalled();
  });
  it("preserves native PKCE by directing provider returns to password sign-in without exchanging codes", async () => {
    address("?code=provider-code-1234"); render(); await settle();
    expect(h.create).not.toHaveBeenCalled(); expect(h.assign).toHaveBeenCalledWith(context.nativeReturnUrl);
    expect(content(render())).toContain("sign in"); expect(content(render())).not.toContain("Your email is confirmed");
  });
  it("refuses unexpected hostnames even if the component receives an otherwise valid credential", async () => {
    vi.stubGlobal("window", { location: { href: "https://attacker.net/auth/customer-confirmation/production/cafe-one?token_hash=synthetic-confirmation-hash&type=email", pathname: "/auth/customer-confirmation/production/cafe-one", assign: h.assign }, history: { state: null, replaceState: h.replace } });
    render(); await settle(); expect(h.verify).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled();
    expect(content(render())).toContain("invalid or expired");
  });
  it("removes credentials from rejected tenant/host pages without verification or redirection", () => {
    address("?token_hash=synthetic-confirmation-hash&type=email");
    expect(content(RejectedCustomerConfirmation())).toContain("not authorized");
    expect(h.replace).toHaveBeenCalled(); expect(h.create).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled();
  });
});
